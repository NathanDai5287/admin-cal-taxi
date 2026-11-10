import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { createUntypedAdminClient } from "@/lib/reimbursements/supabase/admin";
import {
  CONNECT_SENDER,
  invitationBatchSchema,
  invitationCopy,
  type InviteRecipient,
} from "./model";
import { escapeEmail } from "@/lib/mailing-list/broadcast";
import { syncConnectOptOuts } from "@/lib/mailing-list/connect-suppression";

export const CONNECT_COOKIE = "chapter-connect";
export const CODE_COOKIE = "chapter-connect-code";
export const db = createUntypedAdminClient;
export const token = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export function connectOrigin() {
  const url = new URL(process.env.ALUMNI_CONNECT_URL || "https://cal.taxi");
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("Configure a secure ALUMNI_CONNECT_URL.");
  return url.origin;
}
export function provider() {
  const key =
    process.env.RESEND_CONNECT_API_KEY ||
    process.env.RESEND_BROADCAST_API_KEY ||
    process.env.RESEND_API_KEY;
  if (!key)
    throw new Error(
      "Connect email is not configured. Ask a chapter administrator for help.",
    );
  return new Resend(key);
}
export async function command<T = Record<string, unknown>>(
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db().rpc("connect_command", {
    command: name,
    payload,
  });
  if (error) throw new Error(error.message);
  return data as T;
}
export async function setSession(value: string) {
  (await cookies()).set(CONNECT_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/connect",
    maxAge: 7 * 86400,
  });
}
export async function getConnectPerson() {
  const value = (await cookies()).get(CONNECT_COOKIE)?.value;
  if (!value || !validToken(value)) return null;
  const client = db();
  const { data: session, error } = await client
    .from("connect_sessions")
    .select("profile_id")
    .eq("token_hash", hash(value))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error)
    throw new Error("Connect is temporarily unavailable. Please try again.");
  if (!session) return null;
  const [{ data: member }, { data: person }] = await Promise.all([
    client
      .from("connect_members")
      .select("email,subscribed,blocked")
      .eq("profile_id", session.profile_id)
      .single(),
    client
      .from("profiles")
      .select("id,full_name,first_name,last_name,role,membership,removed_at")
      .eq("id", session.profile_id)
      .single(),
  ]);
  if (!member?.subscribed || member.blocked || !person || person.removed_at)
    return null;
  const { data: grants } = await client
    .from("role_app_access")
    .select("access_level")
    .eq("app_key", "nu-news")
    .in("role_key", [person.role, person.membership].filter(Boolean));
  return {
    id: person.id as string,
    fullName: person.full_name as string,
    email: member.email as string,
    canReadNews: (grants ?? []).some((g) => g.access_level !== "none"),
  };
}
export async function loadInvitation(value: string) {
  if (!validToken(value)) return null;
  const { data, error } = await db()
    .from("connect_invitations")
    .select("email,defaults,status,inviter_name,include_name")
    .eq("token_hash", hash(value))
    .maybeSingle();
  if (error)
    throw new Error(
      "Invitations are temporarily unavailable. Please try again.",
    );
  return data as {
    email: string;
    defaults: Partial<InviteRecipient>;
    status: string;
    inviter_name: string;
    include_name: boolean;
  } | null;
}
async function sendMessage(
  email: string,
  subject: string,
  text: string,
  action?: { label: string; url: string },
  key?: string,
) {
  const replyTo = process.env.ALUMNI_CONNECT_REPLY_TO?.trim();
  const result = await provider().emails.send(
    {
      from: CONNECT_SENDER,
      to: email,
      subject,
      text: text + (action ? `\n\n${action.label}: ${action.url}` : ""),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#101014;line-height:1.6"><h2>Nu Chapter of Theta Xi</h2>${text
        .split("\n\n")
        .map((p) => `<p>${escapeEmail(p).replaceAll("\n", "<br>")}</p>`)
        .join(
          "",
        )}${action ? `<p><a href="${escapeEmail(action.url)}" style="display:inline-block;background:#075985;color:white;padding:12px 20px;text-decoration:none">${escapeEmail(action.label)}</a></p>` : ""}</div>`,
      ...(replyTo ? { replyTo } : {}),
    },
    key ? { idempotencyKey: key } : undefined,
  );
  if (result.error)
    throw new Error(
      "The email service could not confirm sending. Please contact the chapter if this persists.",
    );
}
export async function sendInvitations(
  actor: string,
  input: unknown,
  admin = false,
) {
  const parsed = invitationBatchSchema.parse(input);
  provider(); // Check configuration before permanently reserving identities.
  const origin = connectOrigin();
  await syncConnectOptOuts(provider());
  const recipients = [
    ...new Map(parsed.recipients.map((r) => [r.email, r])).values(),
  ];
  const credentials = new Map(recipients.map((r) => [r.email, token()]));
  const reserved = await command<
    { id: string; email: string; inviter_name: string }[]
  >("invite", {
    actor,
    admin,
    include_name: parsed.include_name,
    recipients: recipients.map(({ email, ...defaults }) => ({
      email,
      defaults,
      token_hash: hash(credentials.get(email)!),
    })),
  });
  // Never automatically retry a reserved invitation. Provider idempotency plus
  // the permanent email ledger prevents resend on double-click or uncertain send.
  let uncertain = false;
  for (const invitation of reserved) {
    try {
      const existing = await provider().contacts.get({
        email: invitation.email,
      });
      if (existing.error && existing.error.name !== "not_found")
        throw new Error("Subscriber preferences could not be checked");
      if (existing.data?.unsubscribed) {
        await db()
          .from("connect_invitations")
          .update({ status: "declined" })
          .eq("id", invitation.id);
        continue;
      }
      const copy = invitationCopy(invitation.inviter_name, parsed.include_name);
      await sendMessage(
        invitation.email,
        copy.subject,
        `${copy.introduction}\n\nJoin our mailing list for Nu News, chapter updates, and invitations to alumni events.\n\nYou can join using this email, choose a different address, or decline. You won’t be subscribed unless you accept.\n\nOnce you join, you can invite brothers you know.\n\nThis invitation was sent to ${invitation.email} because a fellow alumnus referred you.`,
        {
          label: "Choose your preferences",
          url: `${origin}/connect/invitation/${credentials.get(invitation.email)}`,
        },
        `connect/invite/${invitation.id}`,
      );
      const saved = await db()
        .from("connect_invitations")
        .update({ delivery: "sent" })
        .eq("id", invitation.id);
      if (saved.error) throw new Error("Delivery status could not be saved");
    } catch {
      uncertain = true;
      await db()
        .from("connect_invitations")
        .update({ delivery: "uncertain" })
        .eq("id", invitation.id);
    }
  }
  return {
    ok: !uncertain,
    message: uncertain
      ? "Some invitations could not be confirmed. The chapter can review them; submitting again will not send duplicate invitations."
      : "Your invitation list has been processed. New invitations have been queued. Addresses already invited or opted out won’t receive another invitation.",
  };
}
export async function requestCode(
  email: string,
  purpose: "login" | "change",
  invitation?: string,
) {
  provider();
  const credential = token();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const result = await command<{ send: boolean }>("request_code", {
    email,
    purpose,
    invitation_hash: invitation ? hash(invitation) : null,
    token_hash: hash(credential),
    code_hash: hash(`${credential}:${code}`),
  });
  (await cookies()).set(CODE_COOKIE, credential, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/connect",
    maxAge: 900,
  });
  if (result.send)
    await sendMessage(
      email,
      purpose === "change"
        ? "Verify your email for the Nu Chapter of Theta Xi"
        : "Your Nu Chapter of Theta Xi sign-in code",
      `Confirm your email address\n\nEnter this code on the Connect page:\n\n${code}\n\nThis verifies ${email}. The code expires in 15 minutes. Don’t share it with anyone.\n\nIf you didn’t request this code, you can ignore this email.`,
      undefined,
      `connect/code/${hash(credential)}`,
    );
}
export async function sendWelcome(
  email: string,
  firstName: string,
  unsubscribeToken: string,
  profileId: string,
) {
  await sendMessage(
    email,
    "You’re connected with the Nu Chapter of Theta Xi",
    `Welcome back, ${firstName}\n\nYou’re now subscribed to chapter updates at ${email}. You’ll receive Nu News and announcements about opportunities to reconnect with the house.\n\nKnow brothers who would like to hear from us? You can choose whether your name appears in their invitations.\n\nManage preferences: ${connectOrigin()}/connect\nRead Nu News: ${connectOrigin()}/connect/news\nUnsubscribe: ${connectOrigin()}/connect/unsubscribe/${unsubscribeToken}`,
    { label: "Invite your brothers", url: `${connectOrigin()}/connect` },
    `connect/welcome/${profileId}`,
  );
}

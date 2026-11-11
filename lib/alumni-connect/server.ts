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
export const referralWindowStart = () =>
  new Date(Date.now() - 86400000).toISOString();
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
      .select(
        "id,full_name,first_name,last_name,role,membership,executive_roles,removed_at",
      )
      .eq("id", session.profile_id)
      .single(),
  ]);
  if (!member || member.blocked || !person || person.removed_at) return null;
  const { data: grants } = await client
    .from("role_app_access")
    .select("access_level")
    .eq("app_key", "nu-news")
    .in(
      "role_key",
      [
        person.role,
        person.membership,
        ...(person.executive_roles ?? []),
        ...(person.executive_roles?.length ? ["exec_member"] : []),
      ].filter(Boolean),
    );
  return {
    id: person.id as string,
    fullName: (person.full_name ||
      [person.first_name, person.last_name].filter(Boolean).join(" ") ||
      "Brother") as string,
    email: member.email as string,
    subscribed: member.subscribed as boolean,
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
  footer?: { label: string; url: string }[],
) {
  const replyTo = process.env.ALUMNI_CONNECT_REPLY_TO?.trim();
  const result = await provider().emails.send(
    {
      from: CONNECT_SENDER,
      to: email,
      subject,
      text:
        text +
        (action ? `\n\n${action.label}: ${action.url}` : "") +
        (footer
          ? "\n\n" +
            footer.map((link) => `${link.label}: ${link.url}`).join("\n")
          : ""),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;color:#101014;line-height:1.6"><h2>Nu Chapter of Theta Xi</h2>${text
        .split("\n\n")
        .map((p) => `<p>${escapeEmail(p).replaceAll("\n", "<br>")}</p>`)
        .join(
          "",
        )}${action ? `<p><a href="${escapeEmail(action.url)}" style="display:inline-block;background:#075985;color:white;padding:12px 20px;text-decoration:none">${escapeEmail(action.label)}</a></p>` : ""}${footer ? `<hr><p style="font-size:12px">${footer.map((link) => `<a href="${escapeEmail(link.url)}">${escapeEmail(link.label)}</a>`).join(" · ")}</p>` : ""}</div>`,
      ...(replyTo ? { replyTo } : {}),
    },
    key ? { idempotencyKey: key } : undefined,
  );
  if (result.error) {
    const status = (result.error as { statusCode?: number }).statusCode;
    const rejected =
      (status !== undefined &&
        status >= 400 &&
        status < 500 &&
        status !== 408) ||
      [
        "validation_error",
        "invalid_api_key",
        "restricted_api_key",
        "rate_limit_exceeded",
        "missing_required_field",
      ].includes(result.error.name);
    const error = new Error(
      rejected
        ? "The email service rejected this message. No email was sent."
        : "The email service could not confirm sending. The message will not be retried.",
    );
    error.name = rejected ? "EmailNotSent" : "EmailUncertain";
    throw error;
  }
}
export async function sendInvitations(
  actor: string,
  input: unknown,
  admin = false,
) {
  const parsed = invitationBatchSchema.parse(input);
  const resend = provider();
  const origin = connectOrigin();
  // Verify both Contacts capability and the sender before reserving any address.
  const domains = await resend.domains.list();
  if (domains.error)
    throw new Error(
      "Connect needs a valid full-access Resend key. No invitations were reserved or sent.",
    );
  if (
    !domains.data.data.some(
      (d) => d.name === "cal.taxi" && d.status === "verified",
    )
  )
    throw new Error(
      "Verify cal.taxi in Resend before sending from connect@cal.taxi. No invitations were reserved.",
    );
  const recipients = [
    ...new Map(parsed.recipients.map((r) => [r.email, r])).values(),
  ];
  const eligible = [];
  for (const recipient of recipients) {
    await new Promise((resolve) =>
      setTimeout(resolve, process.env.NODE_ENV === "test" ? 0 : 550),
    );
    const existing = await resend.contacts.get({ email: recipient.email });
    if (existing.error && existing.error.name !== "not_found")
      throw new Error(
        "Subscriber preferences could not be checked. No invitations were reserved or sent; check the full-access Resend key.",
      );
    if (!existing.data) eligible.push(recipient);
  }
  await syncConnectOptOuts(resend);
  const counts = {
    sent: 0,
    skipped: recipients.length - eligible.length,
    notSent: 0,
    uncertain: 0,
  };
  const credentials = new Map(recipients.map((r) => [r.email, token()]));
  const reserved = eligible.length
    ? await command<{ id: string; email: string; inviter_name: string }[]>(
        "invite",
        {
          actor,
          admin,
          include_name: parsed.include_name,
          recipients: eligible.map(({ email, ...defaults }) => ({
            email,
            defaults,
            token_hash: hash(credentials.get(email)!),
          })),
        },
      )
    : [];
  counts.skipped += eligible.length - reserved.length;
  // Never automatically retry a reserved invitation. Provider idempotency plus
  // the permanent email ledger prevents resend on double-click or uncertain send.
  for (const invitation of reserved) {
    try {
      await new Promise((resolve) =>
        setTimeout(resolve, process.env.NODE_ENV === "test" ? 0 : 550),
      );
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
      counts.sent++;
    } catch (error) {
      const notSent = error instanceof Error && error.name === "EmailNotSent";
      if (notSent) counts.notSent++;
      else counts.uncertain++;
      await db()
        .from("connect_invitations")
        .update({ delivery: notSent ? "not_sent" : "uncertain" })
        .eq("id", invitation.id);
    }
  }
  return {
    ok: counts.notSent === 0 && counts.uncertain === 0,
    counts,
    message: `${counts.sent} invitation${counts.sent === 1 ? "" : "s"} accepted by the email service; ${counts.skipped} addresses skipped (already connected, previously invited, or opted out); ${counts.notSent} not sent; ${counts.uncertain} sending outcomes unknown. Skipped addresses' individual status is private. Unknown sends will not be retried.`,
  };
}
export async function requestCode(
  email: string,
  purpose: "login" | "change",
  invitation?: string,
) {
  provider();
  const jar = await cookies();
  let requester = jar.get("chapter-connect-requester")?.value;
  if (!requester || !validToken(requester)) {
    requester = token();
    jar.set("chapter-connect-requester", requester, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/connect",
      maxAge: 86400,
    });
  }
  const credential = token();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const result = await command<{ send: boolean }>("request_code", {
    email,
    purpose,
    requester_hash: hash(requester),
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
    `Welcome back, ${firstName}\n\nYou’re now subscribed to chapter updates at ${email}. You’ll receive Nu News and announcements about opportunities to reconnect with the house.\n\nKnow brothers who would like to hear from us? You can choose whether your name appears in their invitations.`,
    { label: "Invite your brothers", url: `${connectOrigin()}/connect` },
    `connect/welcome/${profileId}`,
    [
      { label: "Manage preferences", url: `${connectOrigin()}/connect` },
      { label: "Read Nu News", url: `${connectOrigin()}/connect/news` },
      {
        label: "Unsubscribe",
        url: `${connectOrigin()}/connect/unsubscribe/${unsubscribeToken}`,
      },
    ],
  );
}

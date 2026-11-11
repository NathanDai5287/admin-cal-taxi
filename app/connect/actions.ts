"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import {
  acceptanceSchema,
  type ConnectResult,
} from "@/lib/alumni-connect/model";
import {
  CODE_COOKIE,
  CONNECT_COOKIE,
  command,
  db,
  getConnectPerson,
  hash,
  requestCode,
  sendInvitations,
  sendWelcome,
  provider,
  setSession,
  token,
  validToken,
} from "@/lib/alumni-connect/server";

const message = (error: unknown) =>
  error instanceof z.ZodError
    ? error.issues[0].message
    : error instanceof Error
      ? error.message
      : "Please try again.";

export async function inviteBrothers(input: unknown): Promise<ConnectResult> {
  try {
    const person = await getConnectPerson();
    if (!person || !person.subscribed)
      return {
        ok: false,
        message: "Sign in to Connect before inviting your brothers.",
        redirect: "/connect",
      };
    return await sendInvitations(person.id, input);
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function requestConnectCode(
  email: string,
  invitation?: string,
): Promise<ConnectResult> {
  try {
    const address = z.email().max(254).parse(email.trim().toLowerCase());
    if (invitation && !validToken(invitation))
      throw new Error("This invitation is unavailable.");
    await requestCode(address, invitation ? "change" : "login", invitation);
    return {
      ok: true,
      message: invitation
        ? "Check that email for a verification code."
        : "If this address has an available Connect profile, a sign-in code is on its way.",
      retryAfter: 60,
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function verifyConnectCode(code: string): Promise<ConnectResult> {
  try {
    const credential = (await cookies()).get(CODE_COOKIE)?.value;
    if (!credential || !validToken(credential) || !/^\d{6}$/.test(code))
      throw new Error("Enter the six-digit code, or request a new one.");
    const session = token();
    const result = await command<{ ok: boolean; purpose?: string }>(
      "verify_code",
      {
        token_hash: hash(credential),
        code_hash: hash(`${credential}:${code}`),
        session_hash: hash(session),
      },
    );
    if (!result.ok)
      return {
        ok: false,
        message:
          "This code is incorrect, expired, or has too many attempts. Check it or request a new code.",
      };
    if (result.purpose === "login") {
      await setSession(session);
      return { ok: true, message: "Signed in.", redirect: "/connect" };
    }
    return {
      ok: true,
      message:
        "Email verified. Review your details and select Join mailing list.",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function acceptConnectInvitation(
  invitation: string,
  input: unknown,
): Promise<ConnectResult> {
  try {
    if (!validToken(invitation))
      throw new Error("This invitation is unavailable.");
    const details = acceptanceSchema.parse(input);
    const credential = (await cookies()).get(CODE_COOKIE)?.value;
    const session = token(),
      unsubscribe = token();
    const result = await command<{ email: string; profile_id: string }>(
      "accept",
      {
        ...details,
        invitation_hash: hash(invitation),
        verification_hash: credential ? hash(credential) : null,
        session_hash: hash(session),
        unsubscribe_hash: hash(unsubscribe),
      },
    );
    await setSession(session);
    // Enrollment is durable before attempting the welcome. Never retry acceptance
    // or send a second invitation when email delivery fails.
    try {
      await sendWelcome(
        result.email,
        details.first_name,
        unsubscribe,
        result.profile_id,
      );
    } catch {
      console.error("Connect welcome delivery uncertain", {
        profileId: result.profile_id,
      });
    }
    return {
      ok: true,
      message: "You’ve joined the mailing list.",
      redirect: "/connect?joined=1",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function declineConnectInvitation(
  invitation: string,
): Promise<ConnectResult> {
  try {
    if (!validToken(invitation))
      throw new Error("This invitation is unavailable.");
    const result = await command<{ ok: boolean }>("decline", {
      invitation_hash: hash(invitation),
    });
    return {
      ok: result.ok,
      message: result.ok
        ? "You haven’t been subscribed. We won’t send another invitation to this address."
        : "This invitation is no longer available.",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function unsubscribeConnect(
  credential?: string,
): Promise<ConnectResult> {
  try {
    if (credential) {
      if (!validToken(credential))
        throw new Error("This unsubscribe link is unavailable.");
      const result = await command<{ ok: boolean }>("unsubscribe", {
        token_hash: hash(credential),
      });
      if (!result.ok)
        throw new Error(
          "This unsubscribe link is unavailable. Nothing was changed. Sign in to Connect to manage your subscription.",
        );
    } else {
      const person = await getConnectPerson();
      if (!person) throw new Error("Sign in to manage your subscription.");
      const { data, error } = await db()
        .from("connect_members")
        .select("unsubscribe_hash")
        .eq("profile_id", person.id)
        .single();
      if (error || !data) throw new Error("Please try again.");
      const result = await command<{ ok: boolean }>("unsubscribe", {
        token_hash: data.unsubscribe_hash,
      });
      if (!result.ok)
        throw new Error("Subscription not found. Nothing was changed.");
    }
    (await cookies()).set(CONNECT_COOKIE, "", { path: "/connect", maxAge: 0 });
    return {
      ok: true,
      message:
        "You’re unsubscribed. You won’t receive further Connect invitations or updates.",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function resubscribeConnect(): Promise<ConnectResult> {
  try {
    const person = await getConnectPerson();
    if (!person) throw new Error("Sign in with your mailing email to rejoin.");
    const result = await provider().contacts.update({
      email: person.email,
      unsubscribed: false,
    });
    if (result.error && result.error.name !== "not_found")
      throw new Error(
        "Your email preferences could not be updated. Please try again.",
      );
    const changed = await command<{ ok: boolean }>("resubscribe", {
      id: person.id,
    });
    if (!changed.ok)
      throw new Error(
        "Your subscription is unavailable. Please contact the chapter.",
      );
    return {
      ok: true,
      message: "You’re subscribed again.",
      redirect: "/connect",
    };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}
export async function signOutConnect() {
  const credential = (await cookies()).get(CONNECT_COOKIE)?.value;
  if (credential && validToken(credential))
    await db()
      .from("connect_sessions")
      .delete()
      .eq("token_hash", hash(credential));
  (await cookies()).set(CONNECT_COOKIE, "", { path: "/connect", maxAge: 0 });
}

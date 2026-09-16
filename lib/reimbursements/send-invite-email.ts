import "server-only";

import { Resend } from "resend";

type InviteRole = "member" | "admin";

function publicSiteUrls() {
  const adminUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://admin.cal.taxi").replace(/\/$/, "");
  try {
    const url = new URL(adminUrl);
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
      const port = url.port ? `:${url.port}` : "";
      return {
        adminUrl,
        submitUrl: `${url.protocol}//reimbursements.localhost${port}`,
      };
    }
  } catch {
    // Fall through to production submit host.
  }
  return {
    adminUrl,
    submitUrl: "https://reimbursements.cal.taxi",
  };
}

function inviteCopy(role: InviteRole) {
  const { adminUrl, submitUrl } = publicSiteUrls();
  const destinationUrl = role === "admin" ? adminUrl : submitUrl;
  const destinationLabel = role === "admin" ? "the chapter admin tools" : "the reimbursement form";

  return {
    destinationUrl,
    subject: "You're invited to Theta Xi chapter tools",
    text: [
      "You've been invited to the Theta Xi Cal chapter tools.",
      "",
      `Open this link and sign in with Google using this same email address: ${destinationUrl}`,
      "",
      role === "admin"
        ? `That signs you into ${destinationLabel}. You can also submit expenses at ${submitUrl}.`
        : `That signs you into ${destinationLabel}. Use this same Google account — access is tied to the invited email.`,
      "",
      "If Google One Tap does not appear, use the sign-in button in the top-right corner.",
    ].join("\n"),
    html: `
      <div style="font-family:Georgia,Times,'Times New Roman',serif;line-height:1.5;color:#1a1714;max-width:520px">
        <p style="margin:0 0 16px">You've been invited to the Theta Xi Cal chapter tools.</p>
        <p style="margin:0 0 20px">
          <a href="${destinationUrl}" style="display:inline-block;background:#8c1d18;color:#fff;text-decoration:none;padding:10px 16px;border-radius:4px">
            Open ${destinationLabel}
          </a>
        </p>
        <p style="margin:0 0 12px">
          Sign in with Google using <strong>this same email address</strong>.
          ${
            role === "admin"
              ? `You can also submit expenses at <a href="${submitUrl}">${submitUrl.replace(/^https?:\/\//, "")}</a>.`
              : "Access is tied to the invited email."
          }
        </p>
        <p style="margin:0;color:#5c564e;font-size:14px">
          If Google One Tap does not appear, use the sign-in button in the top-right corner.
        </p>
      </div>
    `.trim(),
  };
}

export async function sendInviteEmails(emails: string[], role: InviteRole) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Invite email is not configured. Set RESEND_API_KEY.");
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim() || "Theta Xi <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const { subject, text, html } = inviteCopy(role);

  const results = await Promise.all(
    emails.map((email) =>
      resend.emails.send({
        from,
        to: email,
        subject,
        text,
        html,
      }),
    ),
  );

  const failed = results.filter(({ error }) => error);
  if (failed.length) {
    throw new Error(
      failed.length === emails.length
        ? "Invites were saved, but the invitation emails could not be sent. Please try again."
        : `${emails.length - failed.length} invitation emails were sent, but ${failed.length} could not be. Please try the list again.`,
    );
  }
}

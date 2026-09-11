const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/u;
const MAX_INVITES_AT_ONCE = 50;

export function parseInviteEmails(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    throw new Error("Enter at least one email address.");
  }

  const emails = [
    ...new Set(
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  if (!emails.length) {
    throw new Error("Enter at least one email address.");
  }
  if (emails.length > MAX_INVITES_AT_ONCE) {
    throw new Error(`Invite up to ${MAX_INVITES_AT_ONCE} people at a time.`);
  }

  const invalidEmail = emails.find((email) => !EMAIL_PATTERN.test(email));
  if (invalidEmail) {
    throw new Error(`Enter a valid email address instead of “${invalidEmail}”.`);
  }

  return emails;
}

import { z } from "zod";

export const CONNECT_SENDER = "Nu Chapter of Theta Xi <connect@cal.taxi>";
export const CONNECT_LIST_ID = "c011ec70-0000-4000-8000-000000000001";
const name = z.string().trim().max(100).default("");
export const identitySchema = z.object({
  first_name: name,
  last_name: name,
  roll_number: z
    .string()
    .trim()
    .transform((s) => s.replace(/^nu\s*/i, "Nu "))
    .pipe(
      z.union([
        z.literal(""),
        z
          .string()
          .regex(/^Nu [1-9][0-9]{0,6}$/, "Use a roll number such as Nu 1048."),
      ]),
    )
    .default(""),
  graduation_year: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().int().min(1900).max(2200).nullable(),
  ),
});
export const recipientSchema = identitySchema.extend({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
});
export const acceptanceSchema = recipientSchema.extend({
  first_name: z.string().trim().min(1, "Enter your first name.").max(100),
  last_name: z.string().trim().min(1, "Enter your last name.").max(100),
  consent: z.literal(true, {
    error: "Please confirm you want to receive chapter emails.",
  }),
});
export const invitationBatchSchema = z.object({
  recipients: z.array(recipientSchema).min(1).max(20),
  include_name: z.boolean(),
});
export type Identity = z.infer<typeof identitySchema>;
export type InviteRecipient = z.infer<typeof recipientSchema>;
export const blankRecipient: InviteRecipient = {
  email: "",
  first_name: "",
  last_name: "",
  roll_number: "",
  graduation_year: null,
};
export const identityLabels = {
  first_name: "First name",
  last_name: "Last name",
  roll_number: "Roll number",
  graduation_year: "Graduation year",
} as const;
export type ConnectResult = { ok: boolean; message: string; redirect?: string };

export function parseEmailPaste(text: string): InviteRecipient[] {
  if (text.length > 10_000) throw new Error("Paste up to 20 email addresses.");
  const emails = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return z
    .array(recipientSchema)
    .min(1)
    .max(20)
    .parse(emails.map((email) => ({ ...blankRecipient, email })));
}
export function invitationCopy(inviterName: string, includeName: boolean) {
  const name = inviterName.replace(/[\r\n]/g, " ").trim();
  return {
    subject:
      includeName && name
        ? `${name.split(/\s+/)[0]} invited you to reconnect with Theta Xi`
        : "An invitation to reconnect with the Nu Chapter of Theta Xi",
    introduction:
      includeName && name
        ? `${name}, a fellow alumnus, invited you to stay connected with the Nu Chapter of Theta Xi.`
        : "A fellow alumnus invited you to stay connected with the Nu Chapter of Theta Xi.",
  };
}

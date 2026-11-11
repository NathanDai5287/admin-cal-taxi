import { z } from "zod";
import { parseRecipients } from "@/lib/mailing-list/broadcast";

export const CONNECT_SENDER = "Nu Chapter of Theta Xi <connect@cal.taxi>";
const name = z.string().trim().max(100).default("");
export const identitySchema = z.object({
  first_name: name,
  last_name: name,
  roll_number: z
    .string()
    .trim()
    .transform((s) =>
      /^\d+$/.test(s) ? `Nu ${s}` : s.replace(/^nu\s*/i, "Nu "),
    )
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
    .string()
    .trim()
    .pipe(z.email().max(254))
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
export type ConnectResult = {
  ok: boolean;
  message: string;
  redirect?: string;
  retryAfter?: number;
  counts?: {
    sent: number;
    skipped: number;
    notSent: number;
    uncertain: number;
  };
};

export function parseEmailPaste(text: string): InviteRecipient[] {
  if (text.length > 10_000) throw new Error("Paste up to 20 email addresses.");
  const parsed = parseRecipients(text);
  if (parsed.invalid.length)
    throw new Error(
      `Check these addresses: ${parsed.invalid.slice(0, 3).join(", ")}. Use plain emails or Name <email@example.com>.`,
    );
  const emails = parsed.recipients.map((r) => r.email);
  if (emails.length > 20)
    throw new Error(
      `You pasted ${emails.length} addresses. Invite up to 20 at a time.`,
    );
  return z
    .array(recipientSchema)
    .min(1)
    .max(20)
    .parse(emails.map((email) => ({ ...blankRecipient, email })));
}
export function prepareRecipients(rows: InviteRecipient[]) {
  const nonblank = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      [row.email,row.first_name,row.last_name,row.roll_number,row.graduation_year].some((v) => v !== null && v !== undefined && String(v).trim() !== ""),
    );
  if (!nonblank.length) throw new Error("Enter at least one email address.");
  const result: InviteRecipient[] = [];
  for (const { row, index } of nonblank) {
    const parsed = recipientSchema.safeParse(row);
    if (!parsed.success)
      throw new Error(`Row ${index + 1}: ${parsed.error.issues[0].message}`);
    const prior = result.find((r) => r.email === parsed.data.email);
    if (prior) {
      for (const field of Object.keys(identityLabels) as (keyof Identity)[]) {
        const value = parsed.data[field];
        if (prior[field] && value && prior[field] !== value)
          throw new Error(
            `Row ${index + 1}: conflicting ${identityLabels[field].toLowerCase()} for ${prior.email}. Keep one entry.`,
          );
        Object.assign(prior, { [field]: prior[field] || value });
      }
    } else result.push(parsed.data);
  }
  return result;
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

import { z } from "zod";

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const CONTACT_FIELDS = ["first_name", "last_name", "email", "phone"] as const;
export type ContactInput = { first_name: string; last_name: string; email: string; phone: string };
export type Contact = ContactInput & { id: string; created_at: string; updated_at: string };
export type ColumnMap = Record<keyof ContactInput, number>;

export const contactSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required.").max(100, "First name must be 100 characters or fewer."),
  last_name: z.string().trim().max(100, "Last name must be 100 characters or fewer."),
  email: z.string().trim().toLowerCase().max(254).refine((value) => !value || z.email().safeParse(value).success, "Enter a valid email address."),
  phone: z.string().trim().max(60).refine((value) => !value || (/^[+()\d\s.\-xext#]+$/i.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 20), "Enter a valid phone number, including area code."),
}).refine((value) => value.email || value.phone, { message: "Add an email address or phone number.", path: ["email"] });

export function contactKey(contact: ContactInput) {
  return contact.email ? `email:${contact.email.toLowerCase()}` : `phone:${contact.phone.replace(/\D/g, "")}`;
}

export function contactSearchFilters(search: string) {
  // A pasted phone number should match regardless of spaces, brackets, or dashes.
  const digits = search.replace(/\D/g, "");
  if (/^[+\d\s().-]+$/.test(search) && digits.length >= 3) return [`phone_digits.ilike.%${digits}%`];
  return search.replace(/[,().%_*\\"']/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 10)
    .map((term) => `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,phone_digits.ilike.%${term}%`);
}

// CSV quoting rules also work for tab- and semicolon-separated spreadsheet exports.
export function parseContactText(source: string): string[][] {
  if (new TextEncoder().encode(source).length > MAX_IMPORT_BYTES) throw new Error("Use a file smaller than 2 MB.");
  const text = source.replace(/^\uFEFF/, "");
  let quoted = false;
  const counts = new Map([[",", 0], ["\t", 0], [";", 0]]);
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    }
    if (!quoted && /[\r\n]/.test(char)) break;
    if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQuotes = false, closedQuote = false;
  function endCell() { row.push(cell.trim()); cell = ""; closedQuote = false; }
  function endRow() {
    endCell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > MAX_IMPORT_ROWS + 1) throw new Error("Import up to 10,000 contacts at a time.");
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { inQuotes = false; closedQuote = true; }
      else cell += char;
    } else if (char === delimiter) endCell();
    else if (char === "\n" || char === "\r") { endRow(); if (char === "\r" && text[i + 1] === "\n") i++; }
    else if (char === '"' && !cell.trim() && !closedQuote) { cell = ""; inQuotes = true; }
    else if ((closedQuote && char.trim()) || char === '"') throw new Error("Check the CSV quoting. Put quotes around fields containing commas or line breaks.");
    else if (!closedQuote) cell += char;
  }
  if (inQuotes) throw new Error("A quoted field is missing its closing quote.");
  endRow();
  if (!rows.length) throw new Error("The list is empty. Add a CSV file or paste spreadsheet rows.");
  if (rows.some((value) => value.length > 100)) throw new Error("Use a list with 100 columns or fewer.");
  return rows;
}

const aliases: Record<keyof ContactInput, string[]> = {
  first_name: ["firstname", "fname", "first", "givenname", "given"],
  last_name: ["lastname", "lname", "last", "surname", "familyname"],
  email: ["email", "emailaddress", "email1", "primaryemail"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "cell", "cellphone", "telephone", "tel"],
};

export function guessColumns(headers: string[], hasHeaders: boolean): ColumnMap {
  return Object.fromEntries(CONTACT_FIELDS.map((field, index) => [field, hasHeaders
    ? headers.findIndex((header) => aliases[field].includes(header.toLowerCase().replace(/[^a-z0-9]/g, "")))
    : (index < headers.length ? index : -1)])) as ColumnMap;
}

export function previewContacts(rows: string[][], columns: ColumnMap, hasHeaders: boolean) {
  const contacts: ContactInput[] = [], errors: { row: number; message: string }[] = [];
  let duplicates = 0;
  const seen = new Set<string>();
  const values = Object.values(columns).filter((value) => value >= 0);
  if (new Set(values).size !== values.length) return { contacts, errors, duplicates, problem: "Choose a different column for each field." };
  if (columns.first_name < 0 || (columns.email < 0 && columns.phone < 0)) return { contacts, errors, duplicates, problem: "Match a first name column and an email or phone column." };
  const body = hasHeaders ? rows.slice(1) : rows;
  if (body.length > MAX_IMPORT_ROWS) return { contacts, errors, duplicates, problem: "Import up to 10,000 contacts at a time." };
  if (!body.length) return { contacts, errors, duplicates, problem: "The list has headers but no contacts." };
  body.forEach((row, index) => {
    const result = contactSchema.safeParse(Object.fromEntries(CONTACT_FIELDS.map((field) => [field, row[columns[field]] ?? ""])));
    if (!result.success) errors.push({ row: index + (hasHeaders ? 2 : 1), message: result.error.issues[0].message });
    else if (seen.has(contactKey(result.data))) duplicates++;
    else { seen.add(contactKey(result.data)); contacts.push(result.data); }
  });
  return { contacts, errors, duplicates, problem: null };
}

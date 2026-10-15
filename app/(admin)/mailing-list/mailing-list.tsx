"use client";

import { useAppWriteAccess } from "@/components/auth/app-access-boundary";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import { CONTACT_FIELDS, MAX_IMPORT_BYTES, guessColumns, parseContactText, previewContacts, type ColumnMap, type Contact, type ContactInput } from "@/lib/mailing-list/contacts";
import { deleteContact, exportContactEmails, importContacts, saveContact } from "./actions";

const LABELS = { first_name: "First name", last_name: "Last name", email: "Email", phone: "Phone" };
const BLANK: ContactInput = { first_name: "", last_name: "", email: "", phone: "" };
const TEMPLATE = "Fname,Lname,Email,Phone\r\nAlex,Smith,alex@example.com,+1 (510) 555-0123\r\n";

export function MailingList({ contacts, count, page, pages, search }: { contacts: Contact[]; count: number; page: number; pages: number; search: string }) {
  const canWrite = useAppWriteAccess();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactInput>(BLANK);
  const firstName = useRef<HTMLInputElement>(null);
  const emailOutput = useRef<HTMLTextAreaElement>(null);
  const [emailExport, setEmailExport] = useState<{ emails: string; count: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);
  const [columns, setColumns] = useState<ColumnMap>({ first_name: -1, last_name: -1, email: -1, phone: -1 });
  const preview = useMemo(() => rows ? previewContacts(rows, columns, hasHeaders) : null, [rows, columns, hasHeaders]);

  function run(action: () => Promise<void>) {
    setNotice(null);
    startTransition(async () => {
      try { await action(); }
      catch { setNotice({ ok: false, message: "The request could not be completed. Check your connection and try again." }); }
    });
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      const result = await saveContact(draft, editing?.id);
      setNotice(result);
      if (result.ok) {
        setEmailExport(null); setCopyStatus("");
        setDraft(BLANK); setEditing(null); router.refresh();
        requestAnimationFrame(() => firstName.current?.focus());
      }
    });
  }

  function edit(contact: Contact) {
    setEditing(contact); setDraft(contact); setNotice(null); setRemoving(null);
    firstName.current?.scrollIntoView({ behavior: "instant", block: "center" });
    firstName.current?.focus();
  }

  function makePreview() {
    try {
      const parsed = parseContactText(source);
      setRows(parsed); setColumns(guessColumns(parsed[0], hasHeaders)); setImportError("");
    } catch (error) { setRows(null); setImportError(error instanceof Error ? error.message : "This list could not be read."); }
  }

  async function copyEmails() {
    if (!emailExport?.emails) return;
    try {
      await navigator.clipboard.writeText(emailExport.emails);
      setCopyStatus("Email addresses copied. Paste them into Gmail’s To, Cc, or Bcc field.");
    } catch {
      emailOutput.current?.focus(); emailOutput.current?.select();
      setCopyStatus("Automatic copy is unavailable. Use your browser’s Copy command to copy the selected addresses.");
    }
  }

  const pageHref = (value: number) => `/mailing-list?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(value) })}`;

  return <div className="grid min-w-0 gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="page-title">Mailing List</h1><p className="page-lede">Keep your contacts together. Add one person or bring in a whole list.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={emailExport !== null} aria-controls="email-export" disabled={pending} onClick={() => {
          if (emailExport) { setEmailExport(null); setCopyStatus(""); return; }
          run(async () => {
            setExporting(true); setCopyStatus("");
            try {
              const result = await exportContactEmails();
              if (result.ok) { setEmailExport(result); requestAnimationFrame(() => emailOutput.current?.focus()); }
              else setNotice(result);
            } finally { setExporting(false); }
          });
        }}>{exporting ? "Loading emails…" : emailExport ? "Close export" : "Export all emails"}</Button>
        <Button variant="secondary" aria-expanded={showImport} aria-controls="contact-import" disabled={!canWrite || pending} onClick={() => setShowImport(!showImport)}>{showImport ? "Close import" : "Import contacts"}</Button>
      </div>
    </div>

    {emailExport && <section className="card" id="email-export" aria-labelledby="email-export-title">
      <div className="card-header"><h2 className="card-title" id="email-export-title">All email addresses <span className="ml-2 font-normal text-muted">{emailExport.count.toLocaleString()}</span></h2></div>
      <div className="card-body grid gap-4 border-t border-rule pt-5">
        {emailExport.count ? <>
          <p className="m-0 text-sm text-muted" id="email-export-help">Includes every email address on the mailing list, across all pages and searches. Addresses are separated by commas, ready to paste into Gmail’s To, Cc, or Bcc field. Contacts without email are skipped.</p>
          <label className="sr-only" htmlFor="email-export-output">Comma-separated email addresses</label>
          <textarea id="email-export-output" ref={emailOutput} className="field-input min-h-32 w-full resize-y" rows={5} readOnly value={emailExport.emails} aria-describedby="email-export-help" onFocus={(event) => event.currentTarget.select()} />
          <div><Button disabled={pending} onClick={copyEmails}>Copy all emails</Button></div>
          <p className="helper-text m-0" role="status">{copyStatus}</p>
        </> : <p className="m-0 text-sm text-muted">No email addresses to export yet. Add an email address to a contact, then export again.</p>}
      </div>
    </section>}

    <div aria-live="polite" aria-atomic="true">
      {notice && <p className={`m-0 border border-rule px-4 py-3 text-sm ${notice.ok ? "bg-brand-light text-ink" : "text-warn"}`} role={notice.ok ? "status" : "alert"}>{notice.message}</p>}
    </div>

    <section className="card" aria-labelledby="contact-entry-title">
      <div className="card-header"><h2 className="card-title" id="contact-entry-title">{editing ? `Edit ${editing.first_name} ${editing.last_name}` : "Add a person"}</h2></div>
      <form onSubmit={submitContact} className="card-body border-t border-rule pt-5">
        <fieldset disabled={!canWrite || pending} className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {CONTACT_FIELDS.map((field) => <div className="field min-w-0" key={field}>
            <label className="field-label" htmlFor={`contact-${field}`}>{LABELS[field]}{(field === "last_name" || field === "phone") && <span className="font-normal normal-case tracking-normal text-muted"> (optional)</span>}</label>
            <input ref={field === "first_name" ? firstName : undefined} id={`contact-${field}`} name={field} className="field-input w-full min-w-0" type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} autoComplete={field === "first_name" ? "given-name" : field === "last_name" ? "family-name" : field === "phone" ? "tel" : "email"} required={field === "first_name"} maxLength={field === "email" ? 254 : field === "phone" ? 60 : 100} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} aria-describedby="contact-entry-help" />
          </div>)}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Add person"}</Button>
            {editing && <Button variant="secondary" onClick={() => { setEditing(null); setDraft(BLANK); }} disabled={pending}>Cancel edit</Button>}
            <p className="helper-text m-0" id="contact-entry-help">First name required. Add an email address, a phone number, or both.</p>
          </div>
        </fieldset>
      </form>
    </section>

    {showImport && <section className="card" id="contact-import" aria-labelledby="contact-import-title">
      <div className="card-header"><h2 className="card-title" id="contact-import-title">Import contacts</h2></div>
      <div className="card-body grid gap-5 border-t border-rule pt-5">
        <p className="m-0 text-sm text-muted">Upload CSV, TSV, or a delimited text file, or paste rows from Excel or Google Sheets. Up to 10,000 people / 2 MB at a time. <a className="text-brand underline underline-offset-4" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="mailing-list-template.csv">Download CSV template</a></p>
        <div className="field">
          <label className="field-label" htmlFor="contact-file">Choose a file</label>
          <input id="contact-file" className="field-input w-full min-w-0" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={pending} onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setRows(null); setImportError("");
            if (file.size > MAX_IMPORT_BYTES) { setSource(""); setFileName(""); setImportError("Use a file smaller than 2 MB."); return; }
            try { setSource(await file.text()); setFileName(file.name); }
            catch { setSource(""); setFileName(""); setImportError("The file could not be read. Choose it again."); }
          }} />
          {fileName && <p className="helper-text break-all">Loaded {fileName}. Preview the list below before importing.</p>}
        </div>
        <div className="field"><label className="field-label" htmlFor="contact-paste">Or paste your list</label>
          <textarea id="contact-paste" className="field-input min-h-32 w-full resize-y" value={source} maxLength={MAX_IMPORT_BYTES} disabled={pending} placeholder={'Fname,Lname,Email,Phone\nAlex,Smith,alex@example.com,510-555-0123'} onChange={(event) => { setSource(event.target.value); setFileName(""); setRows(null); setImportError(""); }} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasHeaders} disabled={pending} onChange={(event) => { setHasHeaders(event.target.checked); if (rows) setColumns(guessColumns(rows[0], event.target.checked)); }} />First row contains column names</label>
          <Button variant="secondary" disabled={pending || !source.trim()} onClick={makePreview}>Preview import</Button>
        </div>
        {importError && <p className="m-0 text-sm text-warn" role="alert">{importError}</p>}
        {rows && preview && <div className="grid gap-4 border-t border-rule pt-5">
          <div><h3 className="m-0 text-base font-bold">Match your columns</h3><p className="helper-text mt-1">Check the matches. Extra columns are ignored.</p></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTACT_FIELDS.map((field) => <div className="field min-w-0" key={field}><label className="field-label" htmlFor={`map-${field}`}>{LABELS[field]}</label>
              <select className="field-input w-full min-w-0" id={`map-${field}`} value={columns[field]} disabled={pending} onChange={(event) => setColumns({ ...columns, [field]: Number(event.target.value) })}>
                <option value={-1}>Not included</option>
                {Array.from({ length: Math.max(...rows.map((row) => row.length)) }, (_, index) => <option key={index} value={index}>{hasHeaders ? rows[0][index] || `Column ${index + 1}` : `Column ${index + 1}: ${rows[0][index] || "(empty)"}`}</option>)}
              </select>
            </div>)}
          </div>
          {preview.problem ? <p className="text-sm text-warn" role="alert">{preview.problem}</p> : <>
            <p className="m-0 text-sm" role="status"><strong>{preview.contacts.length.toLocaleString()} valid contacts</strong> ready to import. {preview.duplicates > 0 && `${preview.duplicates.toLocaleString()} duplicates in this list skipped. `}{preview.errors.length > 0 && `${preview.errors.length.toLocaleString()} invalid rows will be skipped.`}</p>
            {preview.errors.length > 0 && <details className="text-sm text-warn"><summary className="cursor-pointer py-2">Review {preview.errors.length.toLocaleString()} invalid rows</summary><ul className="mt-2 list-disc space-y-1 pl-5">{preview.errors.slice(0, 10).map((error) => <li key={error.row}>Row {error.row}: {error.message}</li>)}</ul>{preview.errors.length > 10 && <p>Showing the first 10. Correct the source list and preview again to check all rows.</p>}</details>}
            {preview.contacts.length > 0 && <div className="table-scroll"><table className="data-table"><caption className="sr-only">Import preview, first five valid contacts</caption><thead><tr>{CONTACT_FIELDS.map((field) => <th key={field}>{LABELS[field]}</th>)}</tr></thead><tbody>{preview.contacts.slice(0, 5).map((contact, index) => <tr key={index}>{CONTACT_FIELDS.map((field) => <td key={field} className="max-w-64 break-words">{contact[field] || "—"}</td>)}</tr>)}</tbody></table></div>}
            <p className="helper-text m-0">Showing the first {Math.min(5, preview.contacts.length)} valid contacts. Contacts with the same email are skipped; contacts without email are matched by phone number. Existing details are kept.</p>
            <div><Button disabled={pending || !preview.contacts.length} onClick={() => run(async () => {
              const result = await importContacts(preview.contacts);
              setNotice({ ...result, message: result.message + (result.ok && preview.errors.length ? ` ${preview.errors.length} invalid rows were not imported.` : "") });
              if (result.ok) { setEmailExport(null); setCopyStatus(""); setRows(null); setSource(""); setFileName(""); router.refresh(); }
            })}>{pending ? "Importing…" : `Import ${preview.contacts.length.toLocaleString()} valid contacts`}</Button></div>
          </>}
        </div>}
      </div>
    </section>}

    <section className="card min-w-0" aria-labelledby="contacts-title">
      <div className="card-header flex flex-wrap items-center justify-between gap-4"><h2 className="card-title" id="contacts-title">{search ? "Search results" : "Contacts"} <span className="ml-2 font-normal text-muted">{count.toLocaleString()}</span></h2>
        <form action="/mailing-list" className="flex w-full gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="contact-search">Search names, emails, or phone numbers</label>
          <input id="contact-search" name="q" type="search" className="field-input min-w-0 flex-1 sm:w-64" defaultValue={search} key={search} placeholder="Search name, email, phone" maxLength={100} />
          <Button type="submit" variant="secondary" compact>Search</Button>
        </form>
      </div>
      {!contacts.length ? <div className="card-body border-t border-rule py-10"><p className="m-0 font-bold">{search ? "No contacts match your search." : "Your mailing list starts here."}</p><p className="mt-2 mb-0 text-sm text-muted">{search ? <Link href="/mailing-list" className="text-brand underline">Clear search</Link> : "Add a person above, or import a list to get started."}</p></div> : <>
        <div className="table-scroll border-t border-rule"><table className="data-table"><caption className="sr-only">Mailing list contacts</caption>
          <thead><tr><th>First name</th><th>Last name</th><th>Email</th><th>Phone</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{contacts.map((contact) => <tr key={contact.id}>
            <td className="max-w-48 break-words font-semibold">{contact.first_name}</td><td className="max-w-48 break-words">{contact.last_name || "—"}</td>
            <td className="max-w-64 break-words">{contact.email ? <a className="text-brand underline-offset-4 hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a> : "—"}</td>
            <td className="whitespace-nowrap">{contact.phone ? <a className="text-brand underline-offset-4 hover:underline" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>{contact.phone}</a> : "—"}</td>
            <td>{removing === contact.id ? <div className="flex flex-wrap items-center gap-2"><span className="text-sm">Remove {contact.first_name}?</span><Button compact variant="danger" disabled={pending} onClick={() => run(async () => { const result = await deleteContact(contact.id); setNotice(result); if (result.ok) { setEmailExport(null); setCopyStatus(""); setRemoving(null); if (editing?.id === contact.id) { setEditing(null); setDraft(BLANK); } router.refresh(); } })}>Remove</Button><Button compact variant="secondary" disabled={pending} onClick={() => setRemoving(null)}>Keep</Button></div> : <div className="flex gap-2"><Button compact variant="secondary" disabled={!canWrite || pending} onClick={() => edit(contact)} aria-label={`Edit ${contact.first_name} ${contact.last_name}`}>Edit</Button><Button compact variant="text" disabled={!canWrite || pending} onClick={() => setRemoving(contact.id)} aria-label={`Remove ${contact.first_name} ${contact.last_name}`}>Remove</Button></div>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-6 py-4 text-sm"><p className="m-0 tabular-nums">{((page - 1) * 50 + 1).toLocaleString()}–{Math.min(page * 50, count).toLocaleString()} of {count.toLocaleString()}{search && <> · <Link className="text-brand underline" href="/mailing-list">Clear search</Link></>}</p>
          {pages > 1 && <nav aria-label="Contact pages" className="flex items-center gap-4">{page > 1 && <Link className="py-2 text-brand underline" href={pageHref(page - 1)}>Previous</Link>}<span className="tabular-nums">Page {page} of {pages}</span>{page < pages && <Link className="py-2 text-brand underline" href={pageHref(page + 1)}>Next</Link>}</nav>}
        </div>
      </>}
    </section>
  </div>;
}

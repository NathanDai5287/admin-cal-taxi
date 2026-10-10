"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { computePricing } from "@/lib/host-pricing";
import { PRICING_CONSTANTS } from "@/lib/host-pricing-constants";
import { createDemoState, restoreDemoState, recordDues, setExpenseStatus, totals, csvCell, STORAGE_KEY, type DemoState, type Expense, type Order } from "@/lib/demo/model";
import "./demo.css";

const sections = ["Overview", "Finance", "Hosting", "Members", "Recruitment", "Policy", "Accreditation"] as const;
type Section = typeof sections[number];
const currency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
function download(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Status({ value }: { value: string }) { return <span className="demo-status" data-status={value}>{value}</span>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="demo-panel"><h2>{title}</h2>{children}</section>; }
function Table({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: boolean }) {
  return <div className="demo-table-wrap" role="region" aria-label={headers.join(", ")} tabIndex={0}><table><thead><tr>{headers.map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{empty ? <tr><td colSpan={headers.length} className="demo-empty">No matching records. Try another search or filter.</td></tr> : children}</tbody></table></div>;
}
function Button({ children, onClick, primary = false, disabled = false }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) {
  return <button type="button" className={`demo-btn${primary ? " primary" : ""}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
const descriptions: Record<Section, string> = {
  Overview: "Chapter operations, from the first inquiry to the final reimbursement.",
  Finance: "Review expenses, collect dues, and see how the budget changes.",
  Hosting: "Turn an inquiry into a priced, confirmed venue booking.",
  Members: "Manage the sample roster and try administrator permissions.",
  Recruitment: "Track interest and check visitors in for a chapter event.",
  Policy: "Explore an example of policy guidance with traceable sources.",
  Accreditation: "Review evidence and assemble a sample chapter report.",
};

export function DemoWorkspace() {
  const [state, setState] = useState<DemoState>(createDemoState);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>("Overview");
  const [notice, setNotice] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    try { setState(restoreDemoState(localStorage.getItem(STORAGE_KEY))); } catch { setStorageAvailable(false); }
    setReady(true);
    const sync = () => { const value = location.hash.slice(1); setSection(sections.find(s => s.toLowerCase() === value) ?? "Overview"); };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { setStorageAvailable(false); }
  }, [state, ready]);
  function change(update: (s: DemoState) => DemoState, message: string) {
    setState(s => ({ ...update(s), activity: [message, ...s.activity].slice(0, 40) }));
    setNotice(message);
  }
  function reset() {
    setState(createDemoState()); setResetKey(k => k + 1); setConfirmReset(false); setNotice("Sample data restored. Ready for another walkthrough.");
  }
  const summary = totals(state);
  const shared = { state, change, notify: setNotice };
  return <div data-brand className="demo">
    <div className="demo-banner"><div><strong>Interactive demo</strong><span>Fictional data. {storageAvailable ? "Changes stay in this browser." : "Changes last until this page closes; browser storage is unavailable."} No emails or payments are sent.</span></div><button onClick={() => setConfirmReset(true)} disabled={!ready}>Reset demo</button></div>
    <div className="demo-shell">
      <aside className="demo-sidebar"><a className="demo-wordmark" href="#overview"><span>ΘΞ</span> cal.taxi</a><nav aria-label="Demo workspace">{sections.map(s => <a key={s} href={`#${s.toLowerCase()}`} aria-current={section === s ? "page" : undefined}>{s}</a>)}</nav><footer>Portfolio sandbox<br />Explore as a chapter administrator.<br />No account needed.</footer></aside>
      <main className="demo-main" id="demo-content"><header className="demo-heading"><div><h1>{section === "Overview" ? "A chapter, in good order." : section}</h1><p className="demo-lede">{descriptions[section]}</p></div><ThemeToggle /></header>
        {confirmReset && <section className="demo-panel" aria-label="Reset confirmation"><h2>Restore the sample workspace?</h2><p>This clears your demo edits and restores the original fictional records.</p><div className="demo-actions"><Button primary onClick={reset}>Restore sample data</Button><Button onClick={() => setConfirmReset(false)}>Keep my changes</Button></div></section>}
        {notice && <div className="demo-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
        {!ready ? <p role="status">Preparing your demo workspace…</p> : <div key={resetKey}>
          {section === "Overview" && <>
            <section className="demo-panel demo-intro"><h2>Take the administrator’s seat.</h2><p>This is an interactive sandbox of the cal.taxi chapter management platform. Start with an expense waiting for review, or take a venue booking from inquiry to confirmation. Every name and record here is fictional.</p><div className="demo-actions"><a className="demo-btn primary" href="#finance">Review an expense</a><a className="demo-btn" href="#hosting">Explore a booking</a></div></section>
            <div className="demo-metrics">{[["Available cash", currency(summary.cash)], ["Dues outstanding", currency(summary.outstanding)], ["Expenses to review", summary.pending], ["Venue bookings", state.orders.length]].map(([label, value]) => <div className="demo-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
            <div className="demo-columns"><Panel title="Try a complete workflow"><div className="demo-task"><div><h3>Review → approve → reimburse</h3><p>Move an expense through the review queue and watch the cash balance update.</p></div><a className="demo-btn" href="#finance">Finance</a></div><div className="demo-task"><div><h3>Price → document → confirm</h3><p>Use the app’s pricing model, download a sample PDF, and simulate signing.</p></div><a className="demo-btn" href="#hosting">Hosting</a></div><div className="demo-task"><div><h3>Evidence → review → report</h3><p>Approve sample evidence and generate an illustrative accreditation draft.</p></div><a className="demo-btn" href="#accreditation">Explore</a></div></Panel><Panel title="Workspace activity"><ul className="demo-log">{state.activity.slice(0, 7).map((a, i) => <li key={i}>{a}</li>)}</ul></Panel></div>
            <p className="demo-muted">Built with Next.js, React, and TypeScript. The live platform connects to Supabase and document, email, and AI services; this sandbox runs locally in your browser.</p>
          </>}
          {section === "Finance" && <Finance {...shared} />}
          {section === "Hosting" && <Hosting {...shared} />}
          {section === "Members" && <Members {...shared} />}
          {section === "Recruitment" && <Recruitment {...shared} />}
          {section === "Policy" && <Policy />}
          {section === "Accreditation" && <Accreditation {...shared} />}
        </div>}
      </main>
    </div>
  </div>;
}

type Shared = { state: DemoState; change: (update: (s: DemoState) => DemoState, message: string) => void; notify: (message: string) => void };

function Finance({ state, change, notify }: Shared) {
  const [tab, setTab] = useState("Expenses");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const summary = totals(state);
  const expenses = state.expenses.filter(e => (filter === "All" || e.status === filter) && `${e.member} ${e.merchant} ${e.category}`.toLowerCase().includes(query.toLowerCase()));
  function status(id: string, value: Expense["status"]) { change(s => setExpenseStatus(s, id, value), `${id} marked ${value.toLowerCase()}.`); }
  function exportReport() {
    const rows = [["ID", "Member", "Merchant", "Category", "Amount", "Status"], ...state.expenses.map(e => [e.id, e.member, e.merchant, e.category, e.amount, e.status])];
    download("demo-expenses.csv", new Blob([rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    notify("Demo expense report downloaded.");
  }
  return <><div className="demo-toolbar" aria-label="Finance views">{["Expenses", "Dues", "Budget & reports"].map(t => <button key={t} className={`demo-btn${tab === t ? " primary" : ""}`} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Expenses" && <>
      <div className="demo-toolbar"><label>Search expenses<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Member, merchant, or category" /></label><label>Status<select value={filter} onChange={e => setFilter(e.target.value)}>{["All", "Pending", "Approved", "Denied", "Paid"].map(s => <option key={s}>{s}</option>)}</select></label><Button primary onClick={() => setAdding(!adding)}>{adding ? "Close form" : "Submit expense"}</Button><Button onClick={exportReport}>Export CSV</Button></div>
      {adding && <Panel title="Submit a sample expense"><form className="demo-form" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); const expense: Expense = { id: uid("EX"), member: field(d, "member"), merchant: field(d, "merchant"), category: field(d, "category"), amount: Number(d.get("amount")), status: "Pending" }; change(s => ({ ...s, expenses: [expense, ...s.expenses] }), "Sample expense submitted for review."); setAdding(false); setFilter("All"); setQuery(""); }}><label>Member<select name="member">{state.members.map(m => <option key={m.id}>{m.name}</option>)}</select></label><label>Merchant<input name="merchant" required maxLength={120} pattern=".*\S.*" /></label><label>Amount ($)<input name="amount" type="number" min="0.01" max="100000" step="0.01" required /></label><label>Category<select name="category">{state.budgets.map(b => <option key={b.category}>{b.category}</option>)}</select></label><div className="wide"><button className="demo-btn primary">Submit for review</button></div></form></Panel>}
      <Table headers={["Expense", "Category", "Amount", "Status", "Actions"]} empty={!expenses.length}>{expenses.map(e => <tr key={e.id}><td>{e.merchant}<small>{e.member} · {e.id}</small></td><td>{e.category}</td><td>{currency(e.amount)}</td><td><Status value={e.status} /></td><td><div className="demo-actions">{e.status === "Pending" ? <><Button onClick={() => status(e.id, "Approved")}>Approve</Button><Button onClick={() => status(e.id, "Denied")}>Deny</Button></> : e.status === "Approved" ? <Button onClick={() => status(e.id, "Paid")}>Mark paid</Button> : e.status === "Denied" ? <Button onClick={() => status(e.id, "Pending")}>Reopen</Button> : <span className="demo-muted">Complete</span>}</div></td></tr>)}</Table>
    </>}
    {tab === "Dues" && <><Panel title="Semester dues"><p>{currency(summary.collected)} collected · {currency(summary.outstanding)} outstanding. Payments below only update this demo ledger.</p><form className="demo-form" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); try { const next = recordDues(state, field(d, "member"), Number(d.get("amount"))); change(() => next, "Sample dues payment recorded."); e.currentTarget.reset(); } catch (error) { notify((error as Error).message); } }}><label>Member<select name="member">{state.members.filter(m => m.dues > m.paid).map(m => <option key={m.id} value={m.id}>{m.name} — {currency(m.dues - m.paid)} remaining</option>)}</select></label><label>Payment ($)<input name="amount" type="number" min="0.01" step="0.01" required /></label><div className="wide"><button className="demo-btn primary" disabled={summary.outstanding === 0}>Record payment</button></div></form></Panel><Table headers={["Member", "Charged", "Paid", "Balance"]}>{state.members.map(m => <tr key={m.id}><td>{m.name}</td><td>{currency(m.dues)}</td><td>{currency(m.paid)}</td><td>{currency(Math.max(0, m.dues - m.paid))}</td></tr>)}</Table></>}
    {tab === "Budget & reports" && <><div className="demo-columns"><Panel title="Plan vs. actual"><p className="demo-muted">Actual includes approved and paid expenses. Pending and denied expenses are excluded.</p><form onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); change(s => ({ ...s, budgets: s.budgets.map(b => ({ ...b, amount: Number(d.get(b.category)) })) }), "Category budgets updated."); }}><div className="demo-form">{state.budgets.map(b => { const actual = state.expenses.filter(e => e.category === b.category && ["Approved", "Paid"].includes(e.status)).reduce((n, e) => n + e.amount, 0); return <label key={b.category}>{b.category} budget ($)<input name={b.category} type="number" min="0" max="1000000" step="0.01" required defaultValue={b.amount} /><span className="demo-muted">{currency(actual)} committed · {currency(b.amount - actual)} remaining</span><progress value={actual} max={b.amount || 1} aria-label={`${b.category} budget used`} /></label>; })}</div><button className="demo-btn primary" style={{ marginTop: 20 }}>Save budgets</button></form></Panel><Panel title="Cash summary"><dl>{[["Opening cash", 4200], ["Dues collected", summary.collected], ["Reimbursements paid", -summary.paidExpenses], ["Available cash", summary.cash]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{currency(Number(value))}</dd></div>)}</dl><p className="demo-muted">Booking quotes and refundable deposits are not recognized as received income in this sample ledger.</p><Button onClick={exportReport}>Download expense report</Button></Panel></div></>}
  </>;
}

const nextOrderStatus: Partial<Record<Order["status"], Order["status"]>> = { Inquiry: "Draft", Draft: "Awaiting signature", "Awaiting signature": "Confirmed", Confirmed: "Completed" };
const orderAction: Partial<Record<Order["status"], string>> = { Inquiry: "Create draft", Draft: "Simulate sending contract", "Awaiting signature": "Simulate signing", Confirmed: "Complete event" };

function Hosting({ state, change, notify }: Shared) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [guests, setGuests] = useState(80);
  const [selections, setSelections] = useState({ alcohol: 0, protection: 1, date: 0, setup: 1, cleanup: 0, wealth: 1, relationship: 1 });
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const selected = state.orders.find(o => o.id === selectedId);
  const pricing = computePricing(guests, selections);
  const orders = state.orders.filter(o => `${o.organization} ${o.status}`.toLowerCase().includes(query.toLowerCase()));
  async function pdf(order: Order) {
    setBusy(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.create(); const page = doc.addPage([612, 792]); const font = await doc.embedFont(StandardFonts.Helvetica);
      const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, "?");
      const lines = ["CAL.TAXI / DEMO BOOKING SUMMARY", "SAMPLE ONLY - NOT A CONTRACT OR PAYMENT REQUEST", "", `Booking: ${order.id}`, `Organization: ${order.organization}`, `Event date: ${order.date}`, `Guests: ${order.guests}`, `Rental quote: ${currency(order.total)}`, `Refundable deposit: ${currency(order.deposit)}`, `Workflow status: ${order.status}`, "", "This document contains fictional portfolio demonstration data.", "No reservation, signature, or financial obligation is created."];
      lines.forEach((line, i) => page.drawText(ascii(line), { x: 48, y: 735 - i * 30, size: i === 0 ? 16 : 11, font, color: rgb(.04, .25, .38), maxWidth: 516 }));
      const bytes = await doc.save(); download(`demo-${order.id}.pdf`, new Blob([new Uint8Array(bytes)], { type: "application/pdf" })); notify("Sample booking PDF downloaded.");
    } catch { notify("The sample PDF could not be generated. Please try again."); } finally { setBusy(false); }
  }
  return <><div className="demo-toolbar"><label>Search bookings<input placeholder="Organization or status" value={query} onChange={e => setQuery(e.target.value)} /></label><Button primary onClick={() => { setCreating(!creating); setSelectedId(null); }}>{creating ? "Close calculator" : "Price a new booking"}</Button></div>
    {creating && <Panel title="Venue pricing calculator"><p className="demo-muted">Uses the same pricing calculation as the live application. All quotes here are illustrative.</p><div className="demo-columns"><form className="demo-form" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); const order: Order = { id: uid("H"), organization: field(d, "organization"), date: field(d, "date"), guests, total: Math.round(pricing.total * 100) / 100, deposit: pricing.suggestedDeposit, status: "Draft", notes: "Created with the demo pricing calculator." }; change(s => ({ ...s, orders: [order, ...s.orders] }), "New sample booking draft created."); setCreating(false); setSelectedId(order.id); }}><label>Organization<input name="organization" required maxLength={100} pattern=".*\S.*" /></label><label>Event date<input name="date" type="date" required /></label><label>Guest count<input type="number" min="1" max="200" value={guests} onChange={e => setGuests(Number(e.target.value))} required /></label>{(Object.keys(selections) as (keyof typeof selections)[]).map(key => <label key={key}>{({ alcohol: "Alcohol service", protection: "Expected condition", date: "Date impact", setup: "Setup", cleanup: "Cleanup", wealth: "Organization budget", relationship: "Relationship" })[key]}<select value={selections[key]} onChange={e => setSelections(s => ({ ...s, [key]: Number(e.target.value) }))}>{PRICING_CONSTANTS[`${key}Tiers`].map((tier, i) => <option value={i} key={i}>{tier.label}</option>)}</select></label>)}<div className="wide"><button className="demo-btn primary">Save booking draft</button></div></form><div><h3>Live price breakdown</h3><dl>{[["Base venue fee", pricing.base], ["Guest capacity", pricing.capacity], ["Fire permit", pricing.firePermit], ["Service additions", pricing.alcohol + pricing.protection + pricing.date + pricing.setup + pricing.cleanup], ["Budget / relationship adjustment", pricing.total - pricing.subtotal], ["Rental total", pricing.total], ["Refundable deposit", pricing.suggestedDeposit]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{currency(Number(value))}</dd></div>)}</dl></div></div></Panel>}
    <Table headers={["Organization", "Event date", "Guests", "Quote", "Status", ""]} empty={!orders.length}>{orders.map(o => <tr key={o.id}><td>{o.organization}<small>{o.id}</small></td><td>{o.date}</td><td>{o.guests}</td><td>{currency(o.total)}</td><td><Status value={o.status} /></td><td><Button onClick={() => { setSelectedId(o.id); setCreating(false); }}>Open booking</Button></td></tr>)}</Table>
    {selected && <Panel title={selected.organization}><div className="demo-columns"><div><dl><div><dt>Event date</dt><dd>{selected.date}</dd></div><div><dt>Rental quote</dt><dd>{currency(selected.total)}</dd></div><div><dt>Refundable deposit</dt><dd>{currency(selected.deposit)}</dd></div><div><dt>Status</dt><dd><Status value={selected.status} /></dd></div></dl><p className="demo-muted">Email delivery and signatures are simulated. No external recipients or signing links are created.</p><div className="demo-actions">{nextOrderStatus[selected.status] && <Button primary onClick={() => { const status = nextOrderStatus[selected.status]!; change(s => ({ ...s, orders: s.orders.map(o => o.id === selected.id ? { ...o, status } : o) }), `${selected.organization}: ${status.toLowerCase()} (demo).`); }}>{orderAction[selected.status]}</Button>}<Button onClick={() => pdf(selected)} disabled={busy}>{busy ? "Generating…" : "Download sample PDF"}</Button><Button onClick={() => setSelectedId(null)}>Close booking</Button></div></div><form key={selected.id} onSubmit={e => { e.preventDefault(); const notes = field(new FormData(e.currentTarget), "notes"); change(s => ({ ...s, orders: s.orders.map(o => o.id === selected.id ? { ...o, notes } : o) }), "Booking notes saved."); }}><label>Internal notes<textarea name="notes" defaultValue={selected.notes} maxLength={2000} /></label><button className="demo-btn" style={{ marginTop: 12 }}>Save notes</button></form></div></Panel>}
  </>;
}

function Members({ state, change, notify }: Shared) {
  const [query, setQuery] = useState("");
  const members = state.members.filter(m => `${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()));
  return <><Panel title="Add a sample member"><p className="demo-muted">Use fictional details. This adds a local roster entry; no invitation is sent.</p><form className="demo-form" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); const email = field(d, "email").toLowerCase(); if (state.members.some(m => m.email.toLowerCase() === email)) { notify("That email is already in the sample roster."); return; } const name = field(d, "name"); change(s => ({ ...s, members: [...s.members, { id: uid("M"), name, email, role: "Member", dues: 650, paid: 0 }] }), `${name} added to the sample roster.`); e.currentTarget.reset(); }}><label>Name<input name="name" required maxLength={100} pattern=".*\S.*" placeholder="Pat Example" /></label><label>Email<input name="email" type="email" required maxLength={150} placeholder="pat@example.com" /></label><div className="wide"><button className="demo-btn primary">Add member</button></div></form></Panel><div className="demo-toolbar"><label>Search members<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or email" /></label></div><Table headers={["Member", "Role", "Dues balance", "Actions"]} empty={!members.length}>{members.map(m => <tr key={m.id}><td>{m.name}<small>{m.email}</small></td><td><Status value={m.role} /></td><td>{currency(Math.max(0, m.dues - m.paid))}</td><td><Button onClick={() => change(s => ({ ...s, members: s.members.map(person => person.id === m.id ? { ...person, role: person.role === "Admin" ? "Member" : "Admin" } : person) }), `${m.name}'s demo role updated.`)}>{m.role === "Admin" ? "Make member" : "Make admin"}</Button></td></tr>)}</Table></>;
}

function Recruitment({ state, change }: Shared) {
  return <><Panel title="Chapter open house"><p>{state.leads.filter(l => l.checkedIn).length} of {state.leads.length} sample visitors checked in. Toggle attendance below or add a new RSVP.</p><form className="demo-form" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); change(s => ({ ...s, leads: [...s.leads, { id: uid("R"), name: field(d, "name"), year: field(d, "year"), interest: field(d, "interest"), checkedIn: false }] }), "Sample RSVP added."); e.currentTarget.reset(); }}><label>Visitor name<input name="name" required maxLength={100} pattern=".*\S.*" /></label><label>Year<select name="year">{["First year", "Second year", "Third year", "Fourth year", "Transfer"].map(y => <option key={y}>{y}</option>)}</select></label><label>Interested in<select name="interest">{["Meet the chapter", "House tour", "Community service", "Leadership"].map(i => <option key={i}>{i}</option>)}</select></label><div className="demo-actions"><button className="demo-btn primary">Add RSVP</button></div></form></Panel><Table headers={["Visitor", "Year", "Interest", "Attendance"]}>{state.leads.map(l => <tr key={l.id}><td>{l.name}</td><td>{l.year}</td><td>{l.interest}</td><td><Button onClick={() => change(s => ({ ...s, leads: s.leads.map(lead => lead.id === l.id ? { ...lead, checkedIn: !lead.checkedIn } : lead) }), `${l.name} ${l.checkedIn ? "check-in undone" : "checked in"}.`)}>{l.checkedIn ? "Undo check-in" : "Check in"}</Button></td></tr>)}</Table></>;
}

const policies = [
  { question: "How do reimbursements work?", keywords: /reimburse|expense|receipt|paid/i, answer: "Submit the merchant, category, amount, and receipt. A chapter administrator reviews the expense, approves or denies it, and marks an approved expense paid after reimbursement. In this demo, try the Finance review queue to follow each step.", source: "Sample finance handbook · §2: Expense review", excerpt: "Expenses move from pending review to approved or denied. Approved expenses are marked paid after reimbursement." },
  { question: "How is a venue booking confirmed?", keywords: /book|venue|contract|sign|event/i, answer: "Start with an inquiry, calculate the rental quote, prepare the booking documents, and collect signatures. The Hosting workspace lets you simulate that sequence and download a clearly marked sample PDF.", source: "Sample hosting handbook · §3: Booking workflow", excerpt: "A booking progresses through inquiry, draft, awaiting signature, and confirmation before the event is completed." },
  { question: "What evidence belongs in accreditation?", keywords: /evidence|accredit|report|service|leadership/i, answer: "Collect records supporting chapter activity, such as service recaps, officer training attendance, and financial reviews. Review evidence before including it in a report. The Accreditation workspace generates a sample draft from approved records.", source: "Sample accreditation guide · §1: Evidence review", excerpt: "Review evidence for relevance and completeness. Only approved records should inform the submitted chapter report." },
];
function Policy() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<number | null>(null);
  function ask(q: string) { setQuestion(q); setAnswer(policies.findIndex(p => p.keywords.test(q))); }
  const result = answer !== null && answer >= 0 ? policies[answer] : null;
  return <><Panel title="Ask the sample policy library"><p className="demo-muted">Scripted demonstration, not a live AI response or official chapter policy. Try a suggested question to explore answers and citations.</p><div className="demo-actions">{policies.map(p => <Button key={p.question} onClick={() => ask(p.question)}>{p.question}</Button>)}</div><form style={{ marginTop: 24 }} onSubmit={e => { e.preventDefault(); ask(question); }}><label>Your question<textarea value={question} onChange={e => setQuestion(e.target.value)} required maxLength={500} /></label><button className="demo-btn primary" style={{ marginTop: 12 }}>Find sample guidance</button></form></Panel>{answer !== null && <Panel title="Sample answer">{result ? <><p>{result.answer}</p><details className="demo-source"><summary>{result.source}</summary><p>{result.excerpt}</p></details></> : <p>The sample library covers expense reimbursement, venue bookings, and accreditation evidence. Choose one of the questions above; this demo does not call an AI service.</p>}</Panel>}</>;
}

function Accreditation({ state, change, notify }: Shared) {
  const [draft, setDraft] = useState("");
  const approved = state.evidence.filter(e => e.approved);
  return <><Panel title="Evidence library"><p className="demo-muted">Fictional evidence records demonstrate the review workflow. Report drafting below is a local template, not a live AI model.</p><form className="demo-form" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); change(s => ({ ...s, evidence: [...s.evidence, { id: uid("E"), title: field(d, "title"), category: field(d, "category"), approved: false }] }), "Sample evidence added for review."); setDraft(""); e.currentTarget.reset(); }}><label>Evidence title<input name="title" required maxLength={150} pattern=".*\S.*" /></label><label>Category<select name="category">{["Service", "Leadership", "Finance", "Recruitment"].map(c => <option key={c}>{c}</option>)}</select></label><div className="wide"><button className="demo-btn">Add evidence record</button></div></form></Panel><Table headers={["Evidence", "Category", "Review", "Actions"]}>{state.evidence.map(e => <tr key={e.id}><td>{e.title}</td><td>{e.category}</td><td><Status value={e.approved ? "Approved" : "Pending"} /></td><td><Button onClick={() => { change(s => ({ ...s, evidence: s.evidence.map(item => item.id === e.id ? { ...item, approved: !item.approved } : item) }), `${e.title}: ${e.approved ? "returned to review" : "approved"}.`); setDraft(""); }}>{e.approved ? "Reopen" : "Approve evidence"}</Button></td></tr>)}</Table><Panel title="Sample chapter report"><p>Build an illustrative draft from {approved.length} approved evidence {approved.length === 1 ? "record" : "records"}.</p><Button primary disabled={!approved.length} onClick={() => { setDraft(`DEMO CHAPTER REPORT — SAMPLE ONLY\n\nThis illustrative draft summarizes the approved sample evidence below. It is not an official submission.\n\n${approved.map(e => `${e.category}: ${e.title} [${e.id}]\nThis record has been reviewed and approved in the demo evidence library.`).join("\n\n")}\n\nBefore an actual submission, verify all claims against the source documents and the applicable accreditation requirements.`); notify("Sample report drafted from approved evidence."); }}>Generate sample draft</Button>{draft && <div style={{ marginTop: 20 }}><label>Editable report draft<textarea style={{ minHeight: 260 }} value={draft} maxLength={20000} onChange={e => setDraft(e.target.value)} /></label><p className="demo-muted">Draft edits last while this view is open. Download a copy to keep them.</p><Button onClick={() => download("demo-accreditation-report.txt", new Blob([draft], { type: "text/plain;charset=utf-8" }))}>Download draft</Button></div>}</Panel></>;
}

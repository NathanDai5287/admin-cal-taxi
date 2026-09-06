import { NodeCompiler, PdfStandard } from "@myriaddreamin/typst-ts-node-compiler";

import type { FinancialReport } from "./financial-report";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function money(value: number) {
  const absolute = moneyFormatter.format(Math.abs(value));
  return value < 0 ? `-${absolute}` : absolute;
}

function percent(value: number | null) {
  return value === null ? "Not set" : `${value.toFixed(1)}%`;
}

function date(value: string) {
  if (!value) return "";
  try {
    const d = new Date(value.includes("T") ? value : `${value.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.valueOf())) return value;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return value;
  }
}

function text(value: string) {
  return `text(${JSON.stringify(value)})`;
}

function cell(value: string, alignment: "left" | "right" = "left") {
  const content = `#${text(value)}`;
  return alignment === "right" ? `align(right)[${content}],` : `[${content}],`;
}

function incomeTableCells(report: FinancialReport) {
  return report.incomeBreakdown.map((row) => [
    cell(row.label),
    cell(money(row.amount), "right"),
    cell(`${(row.share * 100).toFixed(1)}%`, "right"),
  ].join("\n")).join("\n");
}

function expenseTableCells(report: FinancialReport) {
  return report.expenseBreakdown.map((row) => [
    cell(row.label),
    cell(row.budgeted === null ? "Not set" : money(row.budgeted), "right"),
    cell(money(row.actual), "right"),
    cell(row.remaining === null ? "-" : money(row.remaining), "right"),
    cell(percent(row.percentageUsed), "right"),
  ].join("\n")).join("\n");
}

function distributionRows(report: FinancialReport) {
  const total = report.executiveSnapshot.totalExpenses;
  const rows = report.expenseBreakdown.filter((row) => row.actual > 0);
  if (!rows.length) return `#text(size: 8.5pt, fill: muted)[No spending recorded for this term.]`;

  const cells = rows.map((row) => {
    const share = total > 0 ? (row.actual / total) * 100 : 0;
    const barWidth = Math.max(1, Math.min(100, share));
    return `[
#grid(
  columns: (1.08in, 1fr, 0.36in),
  gutter: 5pt,
  align: (left, horizon, right),
  [#text(size: 7.5pt, weight: "semibold")[#${text(row.label)}]],
  [#block(width: 100%, height: 5pt, fill: canvas)[#rect(width: ${barWidth.toFixed(2)}%, height: 5pt, fill: brand)]],
  [#text(size: 7.5pt)[#${text(`${share.toFixed(1)}%`)}]],
)
]`;
  }).join(",\n");

  return `#grid(columns: (1fr, 1fr), column-gutter: 18pt, row-gutter: 7pt, ${cells})`;
}

export function buildFinancialReportTypst(report: FinancialReport) {
  const net = report.executiveSnapshot.netOperating;
  const netStatus = report.executiveSnapshot.operatingStatus === "surplus" ? "SURPLUS" : "DEFICIT";
  const netColor = net >= 0 ? "ok" : "warn";
  const totalRemaining = report.budgetSummary.totalRemaining;
  const budgetStatus = totalRemaining >= 0 ? "Within category budgets" : "Over category budgets";

  return `
#let brand = rgb("#0A5482")
#let brand-light = rgb("#E8F2F9")
#let ink = rgb("#101014")
#let muted = rgb("#6E6E72")
#let rule = rgb("#D8D8DB")
#let canvas = rgb("#F5F5F7")
#let ok = rgb("#1A7F4B")
#let ok-light = rgb("#E6F4EC")
#let warn = rgb("#C0392B")
#let warn-light = rgb("#FDF0EF")

#set page(
  paper: "us-letter",
  margin: (x: 0.62in, top: 0.42in, bottom: 0.52in),
  footer: context [
    #set text(size: 7pt, fill: muted)
    #grid(
      columns: (1fr, auto),
      [THETA XI - INTERNAL FINANCIAL REPORT],
      [#counter(page).display("1")],
    )
  ],
)
#set text(font: ("Inter", "Arial", "Liberation Sans", "DejaVu Sans"), size: 8pt, fill: ink)
#set par(leading: 0.65em)
#set table(stroke: 0.45pt + rule, inset: (x: 6pt, y: 3.5pt))

#let section-title(value) = {
  v(7pt)
  block(width: 100%, stroke: (top: 2.2pt + brand), inset: (top: 4pt, bottom: 1pt))[
    #text(size: 7.5pt, weight: "bold", tracking: 0.12em, fill: brand)[#upper(value)]
  ]
}

#let metric(label, value, note, fill: white, accent: brand) = block(
  width: 100%,
  height: 0.76in,
  stroke: 0.5pt + rule,
  fill: fill,
  inset: 6pt,
)[
  #text(size: 6.3pt, weight: "bold", tracking: 0.09em, fill: accent)[#upper(label)]
  #v(2pt)
  #text(size: 13pt, weight: "bold", fill: ink)[#value]
  #v(0pt)
  #text(size: 6.3pt, fill: muted)[#note]
]

#grid(
  columns: (1fr, auto),
  align: (left, right),
  [
    #text(size: 7pt, weight: "bold", tracking: 0.18em, fill: brand)[THETA XI FRATERNITY]
    #v(2pt)
    #text(size: 18pt, weight: "bold")[FINANCIAL REPORT]
    #v(1pt)
    #text(size: 8pt, fill: muted)[#${text(report.meta.chapterName)}]
  ],
  [
    #text(size: 7pt, weight: "bold", tracking: 0.1em, fill: muted)[REPORTING PERIOD]
    #v(2pt)
    #text(size: 10pt, weight: "bold")[#${text(report.meta.termLabel)}]
    #v(1pt)
    #text(size: 7.5pt, fill: muted)[#${text(`${date(report.meta.termStart)} - ${date(report.meta.termEnd)}`)}]
  ],
)
#v(5pt)
#line(length: 100%, stroke: 0.7pt + rule)

#section-title("Executive snapshot")
#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 8pt,
  metric("Current cash position", ${text(money(report.executiveSnapshot.cashPosition))}, ${text(`Opening cash ${money(report.executiveSnapshot.openingCash)}`)}, fill: brand-light),
  metric("Net operating status", ${text(money(net))}, ${text(netStatus)}, fill: ${netColor}-light, accent: ${netColor}),
  metric("Total expenses", ${text(money(report.executiveSnapshot.totalExpenses))}, ${text(`${percent(report.budgetSummary.percentageUsed)} of category budgets`)})
)
#v(3pt)
#text(size: 6.8pt, fill: muted)[Cash position includes term income and paid outflows. Approved reimbursements that have not been paid appear as outstanding liabilities below.]

#section-title("Income breakdown")
#table(
  columns: (2.4fr, 1fr, 0.75fr),
  align: (left, right, right),
  table.header(
    table.cell(fill: brand-light)[#text(size: 6.8pt, weight: "bold", tracking: 0.07em, fill: brand)[SOURCE]],
    table.cell(fill: brand-light)[#text(size: 6.8pt, weight: "bold", tracking: 0.07em, fill: brand)[AMOUNT]],
    table.cell(fill: brand-light)[#text(size: 6.8pt, weight: "bold", tracking: 0.07em, fill: brand)[SHARE]],
  ),
  ${incomeTableCells(report)}
  table.cell(colspan: 1, fill: canvas)[#text(weight: "bold")[Total incoming money]],
  table.cell(fill: canvas)[#align(right)[#text(weight: "bold")[#${text(money(report.executiveSnapshot.totalIncome))}]]],
  table.cell(fill: canvas)[#align(right)[#text(weight: "bold")[#${text(report.executiveSnapshot.totalIncome > 0 ? "100.0%" : "0.0%")}]]],
)

#section-title("Expense breakdown - budget vs. actual")
#table(
  columns: (1.75fr, 0.9fr, 0.9fr, 0.9fr, 0.72fr),
  align: (left, right, right, right, right),
  table.header(
    table.cell(fill: brand-light)[#text(size: 6.4pt, weight: "bold", tracking: 0.05em, fill: brand)[CATEGORY]],
    table.cell(fill: brand-light)[#text(size: 6.4pt, weight: "bold", tracking: 0.05em, fill: brand)[BUDGETED]],
    table.cell(fill: brand-light)[#text(size: 6.4pt, weight: "bold", tracking: 0.05em, fill: brand)[ACTUAL]],
    table.cell(fill: brand-light)[#text(size: 6.4pt, weight: "bold", tracking: 0.05em, fill: brand)[REMAINING]],
    table.cell(fill: brand-light)[#text(size: 6.4pt, weight: "bold", tracking: 0.05em, fill: brand)[USED]],
  ),
  ${expenseTableCells(report)}
  table.cell(fill: canvas)[#text(weight: "bold")[Total]],
  table.cell(fill: canvas)[#align(right)[#text(weight: "bold")[#${text(money(report.budgetSummary.totalBudgeted))}]]],
  table.cell(fill: canvas)[#align(right)[#text(weight: "bold")[#${text(money(report.budgetSummary.totalActual))}]]],
  table.cell(fill: canvas)[#align(right)[#text(weight: "bold")[#${text(money(totalRemaining))}]]],
  table.cell(fill: canvas)[#align(right)[#text(weight: "bold")[#${text(percent(report.budgetSummary.percentageUsed))}]]],
)
#v(4pt)
#text(size: 6.8pt, fill: muted)[#${text(budgetStatus)}]

#section-title("Expense distribution")
${distributionRows(report)}

#section-title("Outstanding balances")
#grid(
  columns: (1fr, 1fr),
  gutter: 8pt,
  metric("Accounts receivable", ${text(money(report.outstandingBalances.accountsReceivable))}, ${text("Unpaid member dues")}),
  metric("Outstanding liabilities", ${text(money(report.outstandingBalances.outstandingLiabilities))}, ${text("Approved reimbursements pending payment")}, fill: warn-light, accent: warn),
)

#v(6pt)
#line(length: 100%, stroke: 0.5pt + rule)
#v(5pt)
#grid(
  columns: (1fr, auto),
  [#text(size: 6.5pt, fill: muted)[Prepared for internal chapter use. Amounts reflect records entered through the generated date.]],
  [#text(size: 6.5pt, fill: muted)[#${text(`Generated ${date(report.meta.generatedAt)}`)}]],
)
`;
}

export function renderFinancialReportPdf(report: FinancialReport) {
  const compiler = NodeCompiler.create();
  return compiler.pdf(
    { mainFileContent: buildFinancialReportTypst(report) },
    {
      pdfStandard: PdfStandard.V_1_7,
      pdfTags: true,
      creationTimestamp: Math.floor(new Date(report.meta.generatedAt).valueOf() / 1000),
    },
  );
}

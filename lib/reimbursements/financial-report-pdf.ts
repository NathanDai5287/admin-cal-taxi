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

type PieItem = {
  label: string;
  percentage: number;
  color: string;
};

function pieSvg(items: PieItem[]) {
  const size = 160;
  const center = size / 2;
  const radius = 72;

  if (!items.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="#E5E7EB"/></svg>`;
  }

  if (items.length === 1) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="${items[0].color}"/></svg>`;
  }

  const totalPercentage = items.reduce((total, item) => total + item.percentage, 0);
  let angle = -Math.PI / 2;
  const paths = items.map((item) => {
    const sweep = (item.percentage / totalPercentage) * Math.PI * 2;
    const end = angle + sweep;
    const startX = center + radius * Math.cos(angle);
    const startY = center + radius * Math.sin(angle);
    const endX = center + radius * Math.cos(end);
    const endY = center + radius * Math.sin(end);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const path = `<path d="M ${center} ${center} L ${startX.toFixed(3)} ${startY.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${endX.toFixed(3)} ${endY.toFixed(3)} Z" fill="${item.color}" stroke="#FFFFFF" stroke-width="2"/>`;
    angle = end;
    return path;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
}

function pieLegend(items: PieItem[], emptyMessage: string) {
  if (!items.length) return `#text(size: 6.6pt, fill: muted)[#${text(emptyMessage)}]`;

  const rows = items.map((item) => `
rect(width: 6pt, height: 6pt, radius: 1pt, fill: rgb(${JSON.stringify(item.color)})),
[#text(size: 6.5pt)[#${text(item.label)}]],
[#align(right)[#text(size: 6.5pt, weight: "semibold")[#${text(`${item.percentage.toFixed(1)}%`)}]]],
`).join("\n");

  return `#grid(
  columns: (7pt, 1fr, auto),
  column-gutter: 4pt,
  row-gutter: 2.5pt,
  align: (center, left, right),
  ${rows}
)`;
}

function pieCard(title: string, total: number, items: PieItem[], emptyMessage: string) {
  return `block(
  width: 100%,
  height: 1.45in,
  stroke: 0.5pt + rule,
  fill: white,
  inset: 7pt,
)[
  #text(size: 7pt, weight: "bold", tracking: 0.06em, fill: brand)[#upper(${text(title)})]
  #h(4pt)
  #text(size: 7pt, fill: muted)[#${text(money(total))}]
  #v(5pt)
  #grid(
    columns: (0.93in, 1fr),
    gutter: 7pt,
    align: (center, horizon),
    [#image.decode(bytes(${JSON.stringify(pieSvg(items))}), format: "svg", width: 0.91in, height: 0.91in)],
    [${pieLegend(items, emptyMessage)}],
  )
]`;
}

export function buildFinancialReportTypst(report: FinancialReport) {
  const net = report.executiveSnapshot.netOperating;
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
      columns: (1fr, auto, 0.2in),
      column-gutter: 12pt,
      [THETA XI - INTERNAL FINANCIAL REPORT],
      [#${text(`Generated ${date(report.meta.generatedAt)}`)}],
      [#counter(page).display("1")],
    )
  ],
)
#set text(font: ("Inter", "Arial", "Liberation Sans", "DejaVu Sans"), size: 8pt, fill: ink)
#set par(leading: 0.65em)
#set table(stroke: 0.45pt + rule, inset: (x: 6pt, y: 3.5pt))

#let section-title(value) = {
  v(3pt)
  block(width: 100%, stroke: (top: 2.2pt + brand), inset: (top: 4pt, bottom: 1pt))[
    #text(size: 7.5pt, weight: "bold", tracking: 0.12em, fill: brand)[#upper(value)]
  ]
}

#let metric(label, value, note: none, fill: white, accent: brand) = block(
  width: 100%,
  height: if note == none { 0.62in } else { 0.76in },
  stroke: 0.5pt + rule,
  fill: fill,
  inset: 6pt,
)[
  #text(size: 6.3pt, weight: "bold", tracking: 0.09em, fill: accent)[#upper(label)]
  #v(2pt)
  #text(size: 13pt, weight: "bold", fill: ink)[#value]
  #if note != none {
    v(1pt)
    text(size: 6.3pt, fill: muted)[#note]
  }
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
  metric("Current cash position", ${text(money(report.executiveSnapshot.cashPosition))}, fill: brand-light),
  metric("Net operating status", ${text(money(net))}, fill: ${netColor}-light, accent: ${netColor}),
  metric("Total expenses", ${text(money(report.executiveSnapshot.totalExpenses))})
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

#section-title("Revenue and expense breakdown")
#grid(
  columns: (1fr, 1fr),
  gutter: 8pt,
  ${pieCard("Revenue by category", report.executiveSnapshot.totalIncome, report.charts.revenueDistribution.items, "No revenue recorded for this term.")},
  ${pieCard("Expenses by category", report.executiveSnapshot.totalExpenses, report.charts.expenseDistribution.items, "No expenses recorded for this term.")},
)

#section-title("Outstanding balances")
#grid(
  columns: (1fr, 1fr),
  gutter: 8pt,
  metric("Accounts receivable", ${text(money(report.outstandingBalances.accountsReceivable))}, note: ${text("Unpaid member dues")}),
  metric("Outstanding liabilities", ${text(money(report.outstandingBalances.outstandingLiabilities))}, note: ${text("Approved reimbursements pending payment")}, fill: warn-light, accent: warn),
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

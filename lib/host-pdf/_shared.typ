// =====================================================================
//  Theta Xi shared branding — used by contract, invoices, credit memo
//  Requires shield.png in the same directory as the rendered .typ.
// =====================================================================

// ---- Color palette --------------------------------------------------
#let brand = rgb("#0a5482")    // shield blue
#let ink   = rgb("#101014")    // body text
#let muted = rgb("#6e6e72")    // secondary text
#let rule  = rgb("#d8d8db")    // hairline rules
#let accent_red = rgb("#c0392b") // surcharges / overdue / forfeiture
#let accent_green = rgb("#1a7f4b") // refunds / credit

// ---- Standard page footer ------------------------------------------
// Use as: #set page(footer: page_footer("Theta Xi Fraternity · Contract"))
// Note: page/text/par setup must live at the document scope of each
// template — `#set` rules inside a function only apply for the rest of
// that function's body, so we can't bundle them here.
#let page_footer(footer_left) = context {
  set text(size: 8pt, fill: muted)
  grid(
    columns: (1fr, auto),
    align: (left, right),
    [#footer_left],
    [
      Page
      #counter(page).get().first()
      of
      #counter(page).final().first()
    ],
  )
}

// Standard fonts in fallback order — used by every template.
#let standard_fonts = (
  "DejaVu Sans", "Liberation Sans",
  "Inter", "Söhne", "SF Pro Text",
  "Helvetica Neue", "Helvetica", "Arial",
)

// ---- Letterhead -----------------------------------------------------
// `doc_kind`: short uppercase label shown in brand color (e.g. "HOSTING CONTRACT")
// `doc_subtitle`: small muted line below the kind (e.g. "Terms and Conditions")
#let letterhead(doc_kind, doc_subtitle, bottom_gap: 28pt) = {
  grid(
    columns: (auto, 1fr, auto),
    column-gutter: 18pt,
    align: (left + horizon, left + horizon, right + horizon),
    [
      #image("shield.png", height: 56pt)
    ],
    [
      #text(size: 8.5pt, weight: "bold", tracking: 1.6pt, fill: ink)[THETA XI FRATERNITY]
      #v(3pt)
      #text(size: 9pt, fill: muted)[2639 Durant Avenue]
    ],
    [
      #set par(leading: 0.55em)
      #text(size: 8pt, weight: "medium", tracking: 1.4pt, fill: brand)[#doc_kind]
      #v(3pt)
      #text(size: 9pt, fill: muted)[#doc_subtitle]
    ],
  )
  v(12pt)
  line(length: 100%, stroke: 1.2pt + brand)
  v(bottom_gap)
}

// ---- Section heading: numeral + title + thin rule ------------------
#let section(num, title) = {
  v(20pt, weak: true)
  block(sticky: true)[
    #grid(
      columns: (auto, 1fr),
      column-gutter: 14pt,
      align: (left + horizon, left + horizon),
      [
        #set text(size: 22pt, weight: "bold", fill: brand, tracking: -0.6pt)
        #num
      ],
      [
        #set text(size: 12pt, weight: "bold", fill: ink, tracking: -0.1pt)
        #title
      ],
    )
    #v(8pt, weak: true)
    #line(length: 100%, stroke: 0.4pt + rule)
    #v(6pt, weak: true)
  ]
}

// ---- Sub-clauses (4a / 4b / 6a) -------------------------------------
#let subclause(label, body) = block(spacing: 0.95em, inset: (left: 0pt))[
  #text(weight: "bold", fill: brand)[#label]  #body
]

// ---- "Bill To" / metadata block (used by invoices and credit memo)
// `client`: organization being billed
// `meta`: array of (label, value) pairs displayed in a small grid
#let billing_block(client, meta, label: "BILL TO") = {
  v(10pt)
  grid(
    columns: (1fr, 1fr),
    column-gutter: 24pt,
    align: (left + top, right + top),
    [
      #text(size: 8pt, weight: "medium", tracking: 1.4pt, fill: muted)[#label]
      #v(4pt)
      #text(size: 13pt, weight: "bold", fill: ink)[#client]
    ],
    [
      #set text(size: 9.5pt)
      #grid(
        columns: (auto, auto),
        column-gutter: 12pt,
        row-gutter: 4pt,
        align: (right, right),
        ..meta.map(it => (
          text(fill: muted, weight: "medium")[#it.at(0)],
          text(fill: ink, weight: "semibold")[#it.at(1)],
        )).flatten()
      )
    ],
  )
  v(20pt)
}

// ---- Line-item table for invoices / memos ---------------------------
// `rows`: array of (description, amount). Amounts are formatted strings.
// `total_label`: e.g. "Total Due", "Refund Amount"
// `total_amount`: formatted total string
// `total_color`: color of total row (brand for invoices, accent_green for credit)
#let line_items(rows, total_label, total_amount, total_color: none) = {
  let tcolor = if total_color == none { brand } else { total_color }
  v(8pt)
  block[
    #grid(
      columns: (1fr, auto),
      column-gutter: 16pt,
      row-gutter: 0pt,

      // Header row
      [
        #pad(top: 6pt, bottom: 8pt)[
          #text(size: 8pt, weight: "bold", tracking: 1.2pt, fill: muted)[DESCRIPTION]
        ]
      ],
      [
        #pad(top: 6pt, bottom: 8pt)[
          #align(right)[
            #text(size: 8pt, weight: "bold", tracking: 1.2pt, fill: muted)[AMOUNT]
          ]
        ]
      ],

      // Top rule
      grid.cell(colspan: 2)[#line(length: 100%, stroke: 0.6pt + ink) #v(4pt)],

      // Line items
      ..rows.map(r => (
        [
          #pad(top: 6pt, bottom: 6pt)[
            #text(size: 10.5pt, fill: ink)[#r.at(0)]
          ]
        ],
        [
          #pad(top: 6pt, bottom: 6pt)[
            #align(right)[
              #text(size: 10.5pt, fill: ink, font: standard_fonts)[#r.at(1)]
            ]
          ]
        ],
      )).flatten(),

      // Spacer + rule before total
      grid.cell(colspan: 2)[#v(4pt) #line(length: 100%, stroke: 0.4pt + rule) #v(4pt)],

      // Total row
      [
        #pad(top: 4pt)[
          #text(size: 11pt, weight: "bold", fill: ink, tracking: 0.4pt)[#upper(total_label)]
        ]
      ],
      [
        #pad(top: 4pt)[
          #align(right)[
            #text(size: 16pt, weight: "bold", fill: tcolor, tracking: -0.3pt)[#total_amount]
          ]
        ]
      ],
    )
  ]
  v(14pt)
  line(length: 100%, stroke: 1.2pt + brand)
}

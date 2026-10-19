#import "_shared.typ": *
#let data = json(bytes(sys.inputs.at("receipt")))
#let deposit = data.kind == "deposit"
#let payment-kind = if deposit { "Deposit" } else { "Rental" }
#set document(title: "Theta Xi " + payment-kind + " Receipt " + data.number)
#set page(
  paper: "us-letter",
  margin: (left: 0.85in, right: 0.85in, top: 0.7in, bottom: 0.9in),
  footer: page_footer("Theta Xi Fraternity  ·  Receipt " + data.number),
)
#set text(size: 10.5pt, font: standard_fonts, fill: ink)
#set par(justify: false, leading: 0.74em, spacing: 1em, first-line-indent: 0pt)

#letterhead(upper(payment-kind) + " PAYMENT RECEIPT", if deposit { "Refundable Security Deposit" } else { "Event Rental Fee" }, bottom_gap: 20pt)
#billing_block(data.organization, (
  ("Receipt #", data.number),
  ("Issue Date", data.issueDate),
  ("Event Date", data.eventDate),
  (payment-kind + " Invoice", data.invoice),
), label: "RECEIVED FROM")

#line_items(data.payments.map(payment => (
  (if deposit { "Security deposit" } else { "Rental payment" }) + " received on " + payment.date,
  payment.amount,
)), "Total Received", data.total)

#v(14pt)
#grid(columns: (1fr, auto),
  text(size: 9.5pt, fill: muted)[Remaining #lower(payment-kind) balance],
  text(size: 9.5pt, weight: "bold")[#data.remaining],
)
#v(26pt)
#text(size: 8pt, weight: "medium", tracking: 1.4pt, fill: brand)[PAYMENT CONFIRMATION]
#v(8pt)
#if deposit [
  This receipt confirms the refundable security deposit received for the event above. It covers the total payment across all listed clubs. The rental fee is separate, and the deposit return follows the hosting agreement.
] else [
  This receipt confirms the rental payments received for the event above. It covers the total payment across all listed clubs. The refundable security deposit is separate.
]

#v(16pt)
#text(size: 9.5pt, fill: muted)[Questions about this payment? Contact #data.contact.]

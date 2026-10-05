// Uses the invoice/credit-memo branding from the hosting document generator.
#import "_shared.typ": *
#let data = json(bytes(sys.inputs.at("receipt")))
#set document(title: "Theta Xi Deposit Receipt " + data.number)
#set page(
  paper: "us-letter",
  margin: (left: 0.85in, right: 0.85in, top: 0.7in, bottom: 0.9in),
  footer: page_footer("Theta Xi Fraternity  ·  Receipt " + data.number),
)
#set text(size: 10.5pt, font: standard_fonts, fill: ink)
#set par(justify: false, leading: 0.74em, spacing: 1em, first-line-indent: 0pt)

#letterhead("DEPOSIT PAYMENT RECEIPT", "Refundable Security Deposit", bottom_gap: 20pt)
#billing_block(data.organization, (
  ("Receipt #", data.number),
  ("Issue Date", data.issueDate),
  ("Event Date", data.eventDate),
  ("Deposit Invoice", data.invoice),
), label: "RECEIVED FROM")

#line_items(data.payments.map(payment => (
  "Security deposit received on " + payment.date,
  payment.amount,
)), "Total Received", data.total)

#v(14pt)
#grid(columns: (1fr, auto),
  text(size: 9.5pt, fill: muted)[Remaining deposit balance],
  text(size: 9.5pt, weight: "bold")[#data.remaining],
)
#v(26pt)
#text(size: 8pt, weight: "medium", tracking: 1.4pt, fill: brand)[PAYMENT CONFIRMATION]
#v(8pt)
This receipt confirms the refundable security deposit received for the event above. It covers the total payment across all listed clubs. The rental fee is separate, and the deposit return follows the hosting agreement.

#v(16pt)
#text(size: 9.5pt, fill: muted)[Questions about this payment? Contact #data.contact.]

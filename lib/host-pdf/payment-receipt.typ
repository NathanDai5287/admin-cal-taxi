#import "_shared.typ": *
#let data = json(bytes(sys.inputs.at("receipt")))
#let deposit = data.kind == "deposit"
#let refund = data.kind == "refund"
#let payment-kind = if deposit or refund { "Deposit" } else { "Rental" }
#let title = if refund { "Deposit Return Confirmation" } else { payment-kind + " Receipt" }
#set document(title: "Theta Xi " + title + " " + data.number)
#set page(
  paper: "us-letter",
  margin: (left: 0.85in, right: 0.85in, top: 0.7in, bottom: 0.9in),
  footer: page_footer("Theta Xi Fraternity  ·  " + (if refund { "Confirmation " } else { "Receipt " }) + data.number),
)
#set text(size: 10.5pt, font: standard_fonts, fill: ink)
#set par(justify: false, leading: 0.74em, spacing: 1em, first-line-indent: 0pt)

#letterhead(if refund { "DEPOSIT RETURN CONFIRMATION" } else { upper(payment-kind) + " PAYMENT RECEIPT" }, if deposit or refund { "Refundable Security Deposit" } else { "Event Rental Fee" }, bottom_gap: 20pt)
#billing_block(data.organization, (
  (if refund { "Confirmation #" } else { "Receipt #" }, data.number),
  ("Issue Date", data.issueDate),
  ("Event Date", data.eventDate),
  (payment-kind + " Invoice", data.invoice),
), label: if refund { "RETURNED TO" } else { "RECEIVED FROM" })

#line_items(data.payments.map(payment => (
  if refund { "Security deposit returned on " + payment.date } else { (if deposit { "Security deposit" } else { "Rental payment" }) + " received on " + payment.date },
  payment.amount,
)), if refund { "Total Returned" } else { "Total Received" }, data.total)

#if not refund [
  #v(14pt)
  #grid(columns: (1fr, auto),
    text(size: 9.5pt, fill: muted)[Remaining #lower(payment-kind) balance],
    text(size: 9.5pt, weight: "bold")[#data.remaining],
  )
]
#if refund and data.returnMethod != "" [
  #v(14pt)
  #text(size: 9.5pt, fill: muted)[Return method: #data.returnMethod]
]
#v(26pt)
#text(size: 8pt, weight: "medium", tracking: 1.4pt, fill: brand)[#if refund { "DEPOSIT RETURN" } else { "PAYMENT CONFIRMATION" }]
#v(8pt)
#if refund [
  This confirmation records the security deposit returned for the event above. It covers the total return across all listed clubs. The rental fee is separate.
] else if deposit [
  This receipt confirms the refundable security deposit received for the event above. It covers the total payment across all listed clubs. The rental fee is separate, and the deposit return follows the hosting agreement.
] else [
  This receipt confirms the rental payments received for the event above. It covers the total payment across all listed clubs. The refundable security deposit is separate.
]

#v(16pt)
#text(size: 9.5pt, fill: muted)[Questions about this #if refund { "return" } else { "payment" }? Contact #data.contact.]

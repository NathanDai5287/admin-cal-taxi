# Dues payment confirmations

Recording a dues payment sends the linked member an HTML email and a plain text version.
Marking one or more charges fully paid sends the same confirmation for each new payment.
These rules apply to the finance screen and connected assistant tools.

Each confirmation covers one charge, identified by its charge reference.
It includes every recorded payment and adjustment, estimated date labels, total assessed, total paid, and remaining balance.
It shows the current payment plan and every installment date, amount, and payment status.
Recorded payments cover the earliest installments first; a partial installment shows the amount still due.
Charges without a payment plan show one due date.
Internal charge notes and balance notes are never included.

The payment is saved before the email is sent.
A missing member, missing address, or delivery failure leaves the payment saved and shows a confirmation warning.
Repeated requests without a new payment event do not send another email.
Resend also receives the payment event ID as its delivery key.
Email delivery uses the existing Resend configuration and temporary failure retries.
No background delivery queue or automatic later retry is included.

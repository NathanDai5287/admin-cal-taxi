# Dues payment confirmations

Each charge has an **Emails** tab with recorded confirmations, their recipient, subject, sent time, and saved message text.
Confirmation records use a private Storage bucket and require Finance read access.
New confirmations save their exact message before sending, then save the email service result separately.
Earlier unrecorded emails do not appear in this list.

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
Each receipt includes the payment history and total through that payment event.
Concurrent saves confirm every newly observed payment with the same event delivery key.
Resend also receives the payment event ID as its delivery key.
Email delivery uses the existing Resend configuration and temporary failure retries.
No background delivery queue or automatic later retry is included.

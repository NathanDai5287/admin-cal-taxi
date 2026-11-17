# Individual finance details in Cal Taxi MCP

Use `list_members` to find a member ID, then call `get_member_finances` with `memberId`.
Use `list_member_charges` to find a charge ID, then call `get_member_charge` with `chargeId`.
Existing clients can also pass `memberId` to `list_member_charges` to get the complete member statement.
Without `memberId`, that tool keeps its existing chapter charge list response.
Both tools require Finance read access through the connected MCP session.
Each tool records the caller, client, tool name, and target ID before reading financial data.
Neither tool changes balances, records payments, or sends email.

`update_member_charge` requires Finance write access and a caller audit before it reads a charge.
An amount-only edit keeps the linked member, including a removed member, and preserves dates, notes, plans, and payments.
It rejects changed, waived, or fully paid charges.
Member reassignments and other field edits retain their existing validation.

## Member statement

`get_member_finances` returns the member's identity, removed date, all linked charges, and all linked reimbursements.
It includes paid and waived charges and records from removed members.
It applies no date or current-term filter and reads every page of history.
These records have no individual academic-term field, so the tools do not assign one.

Each charge includes assessed and paid amounts, unpaid amount, collectible outstanding amount, waiver details, description, and balance notes.
Payment history includes positive payments and negative reversals, payment dates, estimated-date flags, recorder IDs and names, and recording times.
No names or dates are filled in when the saved history lacks them.

Each reimbursement includes the requested and approved/current amounts, category, description, merchant, receipt path/date/total, review status and notes, payment destination, and payment state/date.
Receipt paths refer to private storage; the tools do not make receipts public.

Charge totals show all assessments and recorded payments, collectible outstanding amounts, and unpaid amounts removed by waivers.
Reimbursement totals show requested, approved, paid, payable, pending, and denied amounts separately.
The tools do not subtract reimbursements from a member's dues.

## Payment schedules

Each charge returns its complete schedule, including paid, partly paid, and future installments.
The plan includes its frequency, installment amount, custom interval, and original start date.
Monthly schedules keep the original day and use the month's last day when needed.
Recorded payments cover the earliest installments first; the final installment uses the exact remaining amount.
The schedule shows each installment's due date, amount, amount paid, remaining amount, status, and overdue state.

`currentDueDate` is the saved charge due date.
The original plan dates remain in `paymentPlan.startDate` and `schedule`.
`nextPayment` is the earliest unpaid installment, including an overdue installment, or null for a paid or waived charge.
Without a plan, the schedule contains one payment on the saved due date.
`asOfDate` uses Pacific time for overdue labels.

## Record ownership

Member statements use saved account IDs, never names, to select records.
Legacy charges without a member ID remain available through `get_member_charge`.
Legacy reimbursements without a member ID remain in the existing reimbursement list.
Chapter income, forecasts, manual expenses, and hosting accounts have no individual beneficiary ID.
Their creator or recorder identifies who entered them, not who owes or receives money.
They remain available through the existing chapter finance and hosting tools.

## Verification

Run `npm run test:mcp` and `node --test scripts/dues-payment-email.test.mjs`.
The member finance tests use sample records through the MCP transport and make no live requests.

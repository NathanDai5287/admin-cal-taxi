export function memberStatus(status: string) {
  switch (status) {
    case "pending": return { label: "Checking receipt", explanation: "Your receipt is being checked automatically before review." };
    case "verified": return { label: "Awaiting review", explanation: "The receipt total matches. A treasurer still needs to approve your request." };
    case "mismatch": return { label: "Needs review", explanation: "The receipt total differs from the requested amount. A treasurer needs to review it; this is not a denial." };
    case "processing_failed": return { label: "Needs review", explanation: "The automatic receipt check failed. A treasurer needs to review the receipt; this is not a denial." };
    case "approved": return { label: "Approved", explanation: "A treasurer has approved your reimbursement." };
    case "denied": return { label: "Denied", explanation: "Your request was denied. Contact a treasurer if you have questions." };
    default: return { label: "Awaiting review", explanation: "Contact a treasurer for an update on this request." };
  }
}

export function memberPaymentStatus(status: string, reimbursed: boolean) {
  if (reimbursed) return "Paid";
  if (status === "approved") return "Awaiting payment";
  return "Not paid";
}

export function memberSubmissionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Los_Angeles" }).format(new Date(value));
}

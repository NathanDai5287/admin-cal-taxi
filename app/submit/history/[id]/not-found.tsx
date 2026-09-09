import Link from "next/link";

export default function ReimbursementNotFound() {
  return <section className="card p-6"><h1 className="page-title">Reimbursement not found</h1><p className="my-4 text-sm text-muted">This request isn’t available in your account.</p><Link href="/history" className="text-sm text-brand underline">Back to my reimbursements</Link></section>;
}

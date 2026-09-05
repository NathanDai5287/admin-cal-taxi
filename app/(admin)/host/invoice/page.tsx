import { redirect } from "next/navigation";

/**
 * /host/invoice was replaced by the single /host/documents step, which
 * generates all four PDFs (contract, both invoices, and the credit memo)
 * from one page. This redirect keeps old bookmarks and links working.
 */
export default function InvoicePage() {
  redirect("/host/documents");
}

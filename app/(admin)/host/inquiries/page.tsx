import type { Metadata } from "next";

import { requireAdmin } from "@/lib/reimbursements/auth";
import { listVenueInquiries } from "@/lib/venue-inquiries";
import styles from "./inquiries.module.css";

export const metadata: Metadata = { title: "Venue inquiries — cal.taxi admin" };
export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

function formatEventDate(value: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function VenueInquiriesPage() {
  await requireAdmin("/");
  const inquiries = await listVenueInquiries();

  return (
    <div>
      <h1 className="page-title">Venue inquiries</h1>
      <p className="page-lede">Read messages submitted through the public venue form.</p>

      {inquiries.length ? (
        <div className={styles.list}>
          {inquiries.map((inquiry) => (
            <details className={styles.inquiry} key={inquiry.id}>
              <summary>
                <span>
                  <strong>{inquiry.organization}</strong>
                  <small>{inquiry.eventType}</small>
                </span>
                <time dateTime={inquiry.submittedAt}>{formatDate(inquiry.submittedAt)}</time>
              </summary>
              <div className={styles.body}>
                <dl>
                  <div>
                    <dt>Contact</dt>
                    <dd>{inquiry.contactName}</dd>
                  </div>
                  <div>
                    <dt>Requester email</dt>
                    <dd><a href={`mailto:${inquiry.email}`}>{inquiry.email}</a></dd>
                  </div>
                  <div>
                    <dt>Preferred date</dt>
                    <dd>{formatEventDate(inquiry.eventDate)}</dd>
                  </div>
                  <div>
                    <dt>Expected guests</dt>
                    <dd>{inquiry.guestCount ?? "Not provided"}</dd>
                  </div>
                </dl>
                <div className={styles.message}>
                  <h2>Message</h2>
                  <p>{inquiry.details}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="empty-state mt-8 border-y border-rule">No venue inquiries have arrived.</div>
      )}
    </div>
  );
}

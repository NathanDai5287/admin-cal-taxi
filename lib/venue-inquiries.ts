import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/reimbursements/supabase/admin";
import { requireAdmin } from "@/lib/reimbursements/auth";
import type { VenueInquiryInput } from "@/lib/venue-inquiry";

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAXIMUM = 5;

export type VenueInquiry = {
  id: string;
  contactName: string;
  email: string;
  organization: string;
  eventType: string;
  eventDate: string | null;
  guestCount: number | null;
  details: string;
  submittedAt: string;
};

export class VenueInquiryRateLimitError extends Error {}

function sourceHash(source: string) {
  const salt = process.env.SUPABASE_SECRET_KEY;
  if (!salt) {
    throw new Error("The Supabase secret key is not configured.");
  }
  return createHash("sha256").update(`${salt}:${source}`).digest("hex");
}

export async function saveVenueInquiry(input: VenueInquiryInput, source: string) {
  const supabase = createAdminClient();
  const fingerprint = sourceHash(source);
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error: countError } = await supabase
    .from("venue_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("source_hash", fingerprint)
    .gte("submitted_at", cutoff);

  if (countError) {
    throw countError;
  }
  if ((count ?? 0) >= RATE_LIMIT_MAXIMUM) {
    throw new VenueInquiryRateLimitError();
  }

  const { error } = await supabase.from("venue_inquiries").insert({
    contact_name: input.contactName,
    email: input.email,
    organization: input.organization,
    event_type: input.eventType,
    event_date: input.eventDate || null,
    guest_count: input.guestCount || null,
    details: input.details,
    source_hash: fingerprint,
  });

  if (error) {
    throw error;
  }
}

export async function listVenueInquiries(): Promise<VenueInquiry[]> {
  await requireAdmin("/");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("venue_inquiries")
    .select("id, contact_name, email, organization, event_type, event_date, guest_count, details, submitted_at")
    .order("submitted_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data.map(mapVenueInquiry);
}

function mapVenueInquiry(inquiry: {
  id: string;
  contact_name: string;
  email: string;
  organization: string;
  event_type: string;
  event_date: string | null;
  guest_count: number | null;
  details: string;
  submitted_at: string;
}): VenueInquiry {
  return {
    id: inquiry.id,
    contactName: inquiry.contact_name,
    email: inquiry.email,
    organization: inquiry.organization,
    eventType: inquiry.event_type,
    eventDate: inquiry.event_date,
    guestCount: inquiry.guest_count,
    details: inquiry.details,
    submittedAt: inquiry.submitted_at,
  };
}

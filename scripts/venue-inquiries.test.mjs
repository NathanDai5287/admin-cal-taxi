import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import {
  venueInquirySchema,
  venueInquiryValidationMessage,
} from "../lib/venue-inquiry.ts";

const validInquiry = {
  contactName: "Avery Chen",
  email: "AVERY@EXAMPLE.ORG",
  organization: "Berkeley Student Group",
  eventType: "Club or student event",
  eventDate: "2026-10-15",
  guestCount: "80",
  details: "We need an open floor and access at 6 p.m.",
};

test("normalizes a valid venue inquiry", () => {
  const result = venueInquirySchema.parse(validInquiry);

  assert.equal(result.email, "avery@example.org");
  assert.equal(result.guestCount, 80);
});

test("accepts missing optional event details", () => {
  const result = venueInquirySchema.safeParse({
    ...validInquiry,
    eventDate: "",
    guestCount: "",
  });

  assert.equal(result.success, true);
});

test("rejects an invalid email and oversized guest count", () => {
  const result = venueInquirySchema.safeParse({
    ...validInquiry,
    email: "not-an-email",
    guestCount: "201",
  });

  assert.equal(result.success, false);
});

test("returns a clear recovery message for a short event message", () => {
  const result = venueInquirySchema.safeParse({
    ...validInquiry,
    details: "Too short",
  });

  assert.equal(result.success, false);
  assert.equal(
    venueInquiryValidationMessage(result.error),
    "Message must include at least 10 characters.",
  );
});

test("returns a clear recovery message for an invalid email", () => {
  const result = venueInquirySchema.safeParse({
    ...validInquiry,
    email: "not-an-email",
  });

  assert.equal(result.success, false);
  assert.equal(venueInquiryValidationMessage(result.error), "Enter a valid email address.");
});

test("returns a clear recovery message for an invalid guest count", () => {
  const result = venueInquirySchema.safeParse({
    ...validInquiry,
    guestCount: "many",
  });

  assert.equal(result.success, false);
  assert.equal(
    venueInquiryValidationMessage(result.error),
    "Enter expected guests as a whole number.",
  );
});

test("venue action error states retain submitted values", async () => {
  const source = await readFile(
    new URL("../app/(public)/public-site/host/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /status: "error",[\s\S]+?venueInquiryValidationMessage[\s\S]+?values/);
  assert.match(source, /VenueInquiryRateLimitError[\s\S]+?status: "error"[\s\S]+?values/);
  assert.match(source, /Could not save venue inquiry[\s\S]+?status: "error"[\s\S]+?values/);
});

test("venue form remounts the event type with its returned value", async () => {
  const source = await readFile(
    new URL("../app/(public)/public-site/host/venue-inquiry-form.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<select[\s\S]+?defaultValue=\{state\.values\.eventType\}[\s\S]+?key=\{state\.values\.eventType\}/);
});

test("only administrators can read venue inquiries through browser database roles", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260921000000_venue_inquiries.sql", import.meta.url),
    "utf8",
  );

  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create function public.is_admin() returns boolean language sql stable as $$
      select current_setting('app.test_admin', true) = 'true'
    $$;
  `);
  await db.exec(migration);
  await db.exec(`
    insert into public.venue_inquiries (
      contact_name, email, organization, event_type, details, source_hash
    ) values (
      'Avery Chen', 'avery@example.org', 'Berkeley Student Group',
      'Club event', 'A public form message.', repeat('a', 64)
    );
  `);

  await db.exec("set role authenticated; select set_config('app.test_admin', 'false', false);");
  assert.equal((await db.query("select id from public.venue_inquiries")).rows.length, 0);
  await assert.rejects(
    db.exec(`insert into public.venue_inquiries (
      contact_name, email, organization, event_type, details, source_hash
    ) values ('Member', 'member@example.org', 'Group', 'Event', 'Member message', repeat('b', 64))`),
    /permission denied/,
  );

  await db.exec("select set_config('app.test_admin', 'true', false);");
  assert.equal((await db.query("select id from public.venue_inquiries")).rows.length, 1);

  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select id from public.venue_inquiries"), /permission denied/);
  await db.close();
});

test("server inquiry readers enforce administrator access", async () => {
  const source = await readFile(
    new URL("../lib/venue-inquiries.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /listVenueInquiries[\s\S]+?await requireAdmin\("\/"\)/);
});

test("public pages do not expose a nonexistent contact email", async () => {
  const publicFiles = [
    "../components/public/public-shell.tsx",
    "../app/(public)/public-site/page.tsx",
    "../app/(public)/public-site/rush/page.tsx",
    "../app/(public)/public-site/events/page.tsx",
    "../app/(public)/public-site/host/page.tsx",
  ];
  const sources = await Promise.all(
    publicFiles.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
  );

  assert.doesNotMatch(sources.join("\n"), /contact@calthetaxi\.org|mailto:/i);
});

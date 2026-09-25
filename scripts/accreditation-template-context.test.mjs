import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

test("drafting retrieval respects form scope, prior years, policy dates, readiness, and admin access", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create extension vector with schema extensions;
    grant usage on schema auth, extensions to anon, authenticated, service_role;
    create function auth.role() returns text language sql stable as $$ select current_setting('test.role', true) $$;
    create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'true' $$;
    create table academic_years (id uuid primary key, label text, starts_on date);
    create table policy_documents (id uuid primary key, title text, status text, processing_state text, effective_from date, effective_until date, active_embedding_profile text);
    create table policy_chunks (id uuid primary key, source_id uuid, ordinal integer, content text, locator jsonb,
      embedding_v2 extensions.vector(768), embedding_profile text, search_vector tsvector generated always as (to_tsvector('english', content)) stored);
    create table accreditation_sources (id uuid primary key, cycle_id uuid, original_name text, kind text, template_family_id uuid, status text, active_embedding_profile text);
    create table accreditation_source_chunks (like policy_chunks including all);
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261005000000_template_drafting_context.sql", import.meta.url), "utf8"));
  const family = randomUUID(), otherFamily = randomUUID(), earlierYear = randomUUID(), currentYear = randomUUID(), futureYear = randomUUID();
  const embedding = JSON.stringify([1, ...Array(767).fill(0)]);
  await db.query("insert into academic_years values ($1,'Earlier','2025-08-01'),($2,'Current','2026-08-01'),($3,'Future','2027-08-01')", [earlierYear, currentYear, futureYear]);
  async function source(kind, year, scope = family, status = "ready", profile = "test") {
    const id = randomUUID();
    await db.query("insert into accreditation_sources values($1,$2,$3,$4,$5,$6,$7)", [id, year, kind, kind, scope, status, profile]);
    await db.query("insert into accreditation_source_chunks(id,source_id,ordinal,content,locator,embedding_v2,embedding_profile) values($1,$2,0,'Schedule chapter history workshop','{}',$3,$4)", [randomUUID(), id, embedding, profile]);
    return id;
  }
  async function policy(status = "published", from = "2020-01-01", until = null) {
    const id = randomUUID();
    await db.query("insert into policy_documents values($1,'Chapter requirements',$2,'ready',$3,$4,'test')", [id, status, from, until]);
    await db.query("insert into policy_chunks(id,source_id,ordinal,content,locator,embedding_v2,embedding_profile) values($1,$2,0,'Schedule chapter history requirement','{}',$3,'test')", [randomUUID(), id, embedding]);
    return id;
  }
  const allowed = new Set([
    await source("evidence", currentYear),
    await source("evidence", earlierYear, null),
    await source("prior_submission", earlierYear),
    await policy(),
  ]);
  const excluded = [
    await source("prior_submission", currentYear), await source("prior_submission", futureYear),
    await source("prior_submission", earlierYear, otherFamily), await source("prior_submission", earlierYear, null),
    await source("evidence", currentYear, otherFamily), await source("evidence", futureYear),
    await source("evidence", currentYear, family, "archived"), await source("evidence", currentYear, family, "processing"),
    await source("evidence", currentYear, family, "ready", "old-profile"), await source("blank_template", currentYear),
    await policy("draft"), await policy("published", "2099-01-01"), await policy("published", "2020-01-01", "2021-01-01"),
  ];
  const search = () => db.query("select * from search_template_drafting_context($1,$2,$3,$4,$5,$6)", ["history schedule", embedding, "test", "2026-09-24", family, "2026-08-01"]);
  await db.exec("set role authenticated; select set_config('test.admin','true',false)");
  const found = (await search()).rows;
  assert.deepEqual(new Set(found.map((row) => row.source_id)), allowed);
  assert.ok(found.every((row) => !excluded.includes(row.source_id)));
  assert.deepEqual(new Set(found.map((row) => row.source_kind)), new Set(["policy", "evidence", "prior_submission"]));
  await db.exec("select set_config('test.admin','false',false)");
  assert.equal((await search()).rows.length, 0);
  await db.exec("reset role; set role anon");
  await assert.rejects(search(), /permission denied/);
  await db.exec("reset role; set role service_role; select set_config('test.role','service_role',false)");
  assert.deepEqual(new Set((await search()).rows.map((row) => row.source_id)), allowed);
});

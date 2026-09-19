import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

test("additive migrations, hybrid retrieval, publication and access boundaries in PostgreSQL", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth,storage,extensions to authenticated,service_role;
    create table public.profiles(id uuid primary key, role text, removed_at timestamptz);
    create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and removed_at is null) $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant all on storage.objects to authenticated,service_role;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  for (const migration of ["20260916000000_accreditation_pilot.sql", "20260917000000_gemini_policy.sql", "20260925000000_combined_policy_accreditation_search.sql", "20260926000000_document_processing_progress.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8")).catch((e) => { throw new Error(`${migration}: ${e.message}`); });
  const admin = randomUUID(), member = randomUUID(), other = randomUUID(), removed = randomUUID();
  await db.query("insert into profiles values ($1,'admin',null),($2,'member',null),($3,'member',null),($4,'member',now())", [admin, member, other, removed]);
  const profile = "gemini-embedding-2:768:retrieval-v1";
  const vec = JSON.stringify([1, ...Array(767).fill(0)]);
  const chunk = (content, ordinal = 0, overrides = {}) => ({ ordinal, content, locator: { page: ordinal + 1 }, embedding_v2: vec, embedding_provider: "gemini", embedding_model: "gemini-embedding-2", embedding_dimensions: 768, embedding_profile: profile, ...overrides });
  async function asUser(id, role = "authenticated") {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]);
  }
  async function owner() { await db.exec("reset role"); }
  async function policy(content, { state = "published", from = "2020-01-01", until = null, count = 1 } = {}) {
    const id = randomUUID();
    await db.query("insert into policy_documents(id,title,authority,version_label,effective_from,effective_until,content_hash,storage_path,original_name,mime_type) values($1::uuid,'Fixture policy','Test authority','fixture-v1',$2,$3,'hash',$1::text,'fixture.txt','text/plain')", [id, from, until]);
    await db.query("select commit_document_embeddings($1,true,$2,$3)", [id, profile, JSON.stringify(Array.from({ length: count }, (_, i) => chunk(content, i)))]);
    if (state === "published" || state === "superseded") await db.query("update policy_documents set status='published',reviewed_by=$2,reviewed_at=now(),published_by=$2,published_at=now() where id=$1", [id, admin]);
    if (state === "superseded") await db.query("update policy_documents set status='superseded' where id=$1", [id]);
    return id;
  }
  const current = await policy("Fixture: use the published documents for social event review. Reference time 22:30 and number 42 are test search tokens only.");
  const conflicting = await policy("Fixture: this conflicting text is a retrieval test, not a chapter rule.");
  const draft = await policy("SECRET DRAFT", { state: "draft" });
  const superseded = await policy("SECRET SUPERSEDED", { state: "superseded" });
  const expired = await policy("EXPIRED TEXT", { until: "2021-01-01" });
  const future = await policy("FUTURE TEXT", { from: "2099-01-01" });
  const search = (query, date = "2026-09-17") => db.query("select * from search_policy_chunks($1,$2,$3,$4)", [query, vec, profile, date]);

  await t.test("member hybrid search uses vectors for paraphrases, exact full-text tokens, and publication/date filtering", async () => {
    await asUser(member);
    const semantic = await search("gathering applicability");
    assert.deepEqual(new Set(semantic.rows.map((r) => r.source_id)), new Set([current, conflicting]));
    const exact = await search('"22:30" "42"');
    assert.equal(exact.rows[0].source_id, current);
    const historical = await search("TEXT", "2020-09-01");
    assert.ok(historical.rows.some((r) => r.source_id === expired));
    assert.ok(!historical.rows.some((r) => [draft, superseded, future].includes(r.source_id)));
    const docs = await db.query("select id from policy_documents");
    assert.deepEqual(new Set(docs.rows.map((r) => r.id)), new Set([current, conflicting]));
    assert.equal((await db.query("select * from policy_chunks where source_id=$1", [draft])).rows.length, 0);
    await assert.rejects(db.query("update policy_documents set status='published' where id=$1 returning id", [draft]).then((r) => { if (!r.rows.length) throw new Error("RLS denied"); }));
  });
  await t.test("removed profiles and anonymous callers cannot search", async () => {
    await asUser(removed);
    assert.equal((await search("event")).rows.length, 0);
    await asUser(member, "anon");
    await assert.rejects(search("event"), /permission denied/);
  });
  await t.test("publication is blocked without complete embeddings and published versions are immutable", async () => {
    await owner();
    await assert.rejects(db.query("update policy_documents set title='changed' where id=$1", [current]), /immutable/);
    await assert.rejects(db.query("update policy_chunks set content='changed' where source_id=$1", [current]), /Only draft/);
    await assert.rejects(db.query("update policy_documents set status='published' where id=$1", [superseded]), /new version/);
    await assert.rejects(db.query("update policy_documents set status='published' where id=$1", [draft]), /Review complete/);
    const before = await db.query("select content from policy_chunks where source_id=$1", [draft]);
    await assert.rejects(db.query("select commit_document_embeddings($1,true,$2,$3)", [draft, profile, JSON.stringify([chunk("partial", 0), chunk("bad vector", 1, { embedding_v2: "[1,2]" })])]), /dimensions/);
    assert.deepEqual((await db.query("select content from policy_chunks where source_id=$1", [draft])).rows, before.rows);
  });
  await t.test("member questions are isolated and quota reservations enforce minute/day limits", async () => {
    await asUser(member, "service_role");
    for (let i = 0; i < 2; i++) await db.query("select reserve_policy_question($1,'Event review?','2026-09-17',2,50)", [member]);
    await assert.rejects(db.query("select reserve_policy_question($1,'Again?','2026-09-17',2,50)", [member]), /Question limit/);
    await db.query("select reserve_policy_question($1,'Other member question','2026-09-17',5,1)", [other]);
    await assert.rejects(db.query("select reserve_policy_question($1,'Again?','2026-09-17',5,1)", [other]), /Question limit/);
    await asUser(member);
    assert.equal((await db.query("select * from policy_questions")).rows.length, 2);
    assert.equal((await db.query("select * from policy_questions where member_id=$1", [other])).rows.length, 0);
    await assert.rejects(db.query("select reserve_policy_question($1,'Bypass?','2026-09-17',999,999)", [member]), /permission denied/);
    await asUser(admin);
    assert.equal((await db.query("select * from policy_questions")).rows.length, 3);
  });
  await t.test("retrieval is capped at twelve policy chunks", async () => {
    await owner(); await policy("Fixture event review document.", { count: 45 });
    await asUser(member);
    assert.equal((await search("event")).rows.length, 12);
  });
  await t.test("accreditation search isolates cycle, term, report, source readiness and profile; legacy vectors survive", async () => {
    await owner();
    const cycle = randomUUID(), cycle2 = randomUUID(), fall = randomUUID(), spring = randomUUID();
    await db.query("insert into accreditation_cycles(id,label,starts_on,ends_on) values($1,'2026-27','2026-08-01','2027-06-01'),($2,'2025-26','2025-08-01','2026-06-01')", [cycle, cycle2]);
    await db.query("insert into accreditation_terms(id,cycle_id,season,label,starts_on,ends_on) values($1,$3,'fall','Fall','2026-08-01','2026-12-31'),($2,$3,'spring','Spring','2027-01-01','2027-06-01')", [fall, spring, cycle]);
    const accepted = [];
    for (const [c,t,r,status,active] of [[cycle,fall,'annual_report','ready',true],[cycle,null,null,'ready',true],[cycle,spring,'annual_report','ready',true],[cycle2,null,'annual_report','ready',true],[cycle,fall,'annual_budget','ready',true],[cycle,fall,'annual_report','failed',true],[cycle,fall,'annual_report','ready',false]]) {
      const id = randomUUID();
      await db.query("insert into accreditation_sources(id,cycle_id,term_id,report_key,kind,status,original_name,mime_type,size_bytes,sha256,storage_path) values($1::uuid,$2,$3,$4,'chapter_evidence','ready','Evidence','text/plain',10,$1::text,$1::text)", [id,c,t,r]);
      await db.query("insert into accreditation_source_chunks(source_id,ordinal,content,embedding,embedding_provider,embedding_model) values($1,0,'evidence','[1,2,3]','openai','legacy')", [id]);
      if (active) await db.query("select commit_document_embeddings($1,false,$2,$3)", [id,profile,JSON.stringify([chunk("Current evidence")])]);
      await db.query("update accreditation_sources set status=$2 where id=$1",[id,status]);
      if (accepted.length < 2) accepted.push(id);
      const legacy = await db.query("select embedding::text,embedding_provider from accreditation_source_chunks where source_id=$1",[id]);
      assert.equal(legacy.rows[0].embedding, "[1,2,3]"); assert.equal(legacy.rows[0].embedding_provider, "openai");
    }
    await asUser(admin);
    const args = ["evidence",vec,profile,cycle,fall,"annual_report"];
    const found = await db.query("select * from search_report_evidence($1,$2,$3,$4,$5,$6)",args);
    assert.deepEqual(new Set(found.rows.map((r)=>r.source_id)),new Set(accepted));
    const combined = await db.query("select * from search_policy_and_accreditation_chunks($1,$2,$3,$4)",["event",vec,profile,"2026-09-17"]);
    assert.ok(combined.rows.some((row) => row.source_type === "policy"));
    assert.ok(combined.rows.some((row) => row.source_type === "accreditation" && accepted.includes(row.source_id)));
    await asUser(member);
    assert.equal((await db.query("select * from search_report_evidence($1,$2,$3,$4,$5,$6)",args)).rows.length,0);
    assert.equal((await db.query("select * from search_policy_and_accreditation_chunks($1,$2,$3,$4)",["event",vec,profile,"2026-09-17"])).rows.length,0);
    for (const table of ["accreditation_sources","accreditation_source_chunks","accreditation_templates","accreditation_runs","accreditation_revisions","accreditation_artifacts"]) assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
    await assert.rejects(db.query("select approve_accreditation_revision($1,$2,$3)",[randomUUID(),randomUUID(),admin]),/authenticated administrator/);
    await assert.rejects(db.query("select commit_document_embeddings($1,false,$2,$3)",[accepted[0],profile,JSON.stringify([chunk("attack")])]),/permission denied/);
  });
  await t.test("retained report approval freezes revisions, finance snapshots and artifact checksums", async () => {
    await owner();
    const cycle = (await db.query("select id from accreditation_cycles limit 1")).rows[0].id;
    const run = randomUUID(), revision = randomUUID();
    await db.query("insert into accreditation_runs(id,report_key,cycle_id,title,status) values($1,'annual_budget',$2,'Fixture budget','ready_for_review')",[run,cycle]);
    await db.query("insert into accreditation_revisions(id,run_id,revision_number,draft,app_snapshot,validation) values($1,$2,1,'{}','{\"openingCash\":123}','[]')",[revision,run]);
    await db.query("insert into accreditation_artifacts(revision_id,kind,storage_path,filename,mime_type,size_bytes,sha256) values($1,'approved','fixture-budget.xlsx','budget.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',100,'frozen-checksum')",[revision]);
    await asUser(admin);
    await db.query("select approve_accreditation_revision($1,$2,$3)",[run,revision,admin]);
    await assert.rejects(db.query("update accreditation_revisions set app_snapshot='{}' where id=$1",[revision]),/immutable/);
    await assert.rejects(db.query("update accreditation_artifacts set sha256='changed' where revision_id=$1",[revision]),/immutable/);
    await assert.rejects(db.query("update accreditation_runs set title='Changed' where id=$1",[run]),/immutable/);
    const frozen = await db.query("select app_snapshot,immutable from accreditation_revisions where id=$1",[revision]);
    assert.equal(frozen.rows[0].app_snapshot.openingCash,123); assert.equal(frozen.rows[0].immutable,true);
  });
  await t.test("policy and accreditation originals have no member storage access", async () => {
    await owner();
    await db.exec("insert into storage.objects(bucket_id,name) values('policy-documents','draft'),('accreditation-sources','secret'),('accreditation-templates','template'),('accreditation-artifacts','approved')");
    await asUser(member);
    assert.equal((await db.query("select * from storage.objects")).rows.length,0);
    await asUser(admin);
    assert.equal((await db.query("select * from storage.objects")).rows.length,4);
  });
});

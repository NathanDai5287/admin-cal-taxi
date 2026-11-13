import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

test("ingestion checkpoints survive retries, reject stale workers and activate atomically", async (t) => {
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
  for (const migration of ["20260916000000_accreditation_pilot.sql", "20260917000000_gemini_policy.sql", "20260925000000_combined_policy_accreditation_search.sql", "20260926000000_document_processing_progress.sql", "20260927000000_resumable_document_embeddings.sql", "20260928000000_ai_template_onboarding.sql", "20261113000000_document_ingestion_jobs.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8")).catch((e) => { throw new Error(`${migration}: ${e.message}`); });
  await db.exec(await readFile(new URL('../supabase/migrations/20261113010000_ingestion_status_summary.sql',import.meta.url),'utf8'));
  const id = randomUUID();
  await db.query("insert into policy_documents(id,content_hash,storage_path,original_name,mime_type) values($1,'hash','path','fixture.pdf','application/pdf')", [id]);
  const config = { profile: 'test', provider: 'gemini', model: 'fixture' };
  const enqueue = async () => (await db.query('select ingestion_enqueue($1,true,$2) as id', [id, config])).rows[0].id;
  const job = await enqueue();
  assert.equal(await enqueue(), job);
  let token;
  const claim = async () => {
    token = randomUUID();
    const result = await db.query('select * from ingestion_claim($1)', [token]);
    assert.equal(result.rows[0].id, job);
  };
  const commit = (kind, data) => db.query('select ingestion_commit($1,$2,$3,$4)', [job, token, kind, data]);
  await claim(); await commit('validated', { pages: 51 });
  for (let page=1; page<40; page++) { await claim(); await commit('page', { page, text: 'Page '+page, method:'native' }); }
  await claim(); await commit('wait',{retry_at:new Date(0).toISOString(),error:{status:429},failures:1});
  assert.equal((await db.query('select count(*)::int as n from document_ingestion_pages')).rows[0].n,39);
  await claim();
  await assert.rejects(commit('chunks',[{ordinal:0,content:'premature',locator:{},request_hash:'x'}]), /Invalid chunk stage|Extraction incomplete/);
  const stale = token;
  await db.query("update document_ingestion_jobs set lease_until=now()-interval '1 second' where id=$1",[job]);
  await claim();
  await assert.rejects(db.query("select ingestion_commit($1,$2,'page',$3)",[job,stale,{page:40,text:'late',method:'ocr'}]),/lease expired/);
  await commit('page',{page:40,text:'Page 40',method:'ocr'});
  // Simulate a committed response being lost: the saved page remains unique.
  await claim(); await commit('page',{page:40,text:'Page 40',method:'ocr'});
  for(let page=41;page<=51;page++){await claim();await commit('page',{page,text:'Page '+page,method:'native'});}
  assert.equal((await db.query('select count(*)::int as n from document_ingestion_pages')).rows[0].n,51);
  await claim(); await commit('chunks', Array.from({length:90},(_,ordinal)=>({ordinal,content:'A complete document '+ordinal,locator:{page:1},request_hash:'request'+ordinal})));
  await claim(); await assert.rejects(commit('activate',{}),/incomplete/);
  const embedding=Array.from({length:768},(_,i)=>i===0?1:0);
  await commit('embedding',{ordinal:0,request_hash:'request0',embedding});
  for(let ordinal=1;ordinal<60;ordinal++){await claim();await commit('embedding',{ordinal,request_hash:'request'+ordinal,embedding});}
  await claim();await commit('wait',{retry_at:new Date(0).toISOString(),error:{status:429},failures:1});
  assert.equal((await db.query('select count(*)::int as n from document_ingestion_chunks where embedding is not null')).rows[0].n,60);
  for(let ordinal=60;ordinal<90;ordinal++){await claim();await commit('embedding',{ordinal,request_hash:'request'+ordinal,embedding});}
  await claim(); await commit('activate',{});
  assert.equal((await db.query('select status from document_ingestion_jobs where id=$1',[job])).rows[0].status,'complete');
  assert.equal((await db.query('select count(*)::int as n from policy_chunks where source_id=$1',[id])).rows[0].n,90);
  const summary=(await db.query('select ingestion_status_summary($1,true) as rows',[[id]])).rows[0].rows;
  assert.equal(summary[0].active,false);assert.equal(summary[0].processing_completed,90);assert.equal(summary[0].ingestion_status,'complete');
  assert.ok(!JSON.stringify(summary).includes('request_hash'));
  const id2=randomUUID();
  await db.query("insert into policy_documents(id,content_hash,storage_path,original_name,mime_type) values($1,'hash','path2','fixture.pdf','application/pdf')",[id2]);
  const second=(await db.query('select ingestion_enqueue($1,true,$2) as id',[id2,config])).rows[0].id;
  assert.equal((await db.query('select ingestion_status_summary($1,true) as rows',[[id2]])).rows[0].rows[0].active,true);
  const tok=randomUUID();await db.query('select * from ingestion_claim($1)',[tok]);
  await db.query("update policy_documents set status='archived' where id=$1",[id2]);
  await assert.rejects(db.query("select ingestion_commit($1,$2,'validated',$3)",[second,tok,{pages:1}]),/unavailable/);
  await db.query('delete from policy_documents where id=$1',[id2]);
  assert.equal((await db.query('select count(*)::int as n from document_ingestion_jobs where id=$1',[second])).rows[0].n,0);
});

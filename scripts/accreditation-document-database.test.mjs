import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("example workflow: batch idempotency, leases, stale edits, revision integrity and access", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  // Minimal pre-existing schema, preserving the constraints this migration depends on.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create function auth.role() returns text language sql stable as $$ select current_setting('test.role',true) $$;
    set test.role='service_role';
    create table profiles(id uuid primary key);
    create table academic_years(id uuid primary key,label text);
    create table academic_terms(id uuid primary key,cycle_id uuid references academic_years,unique(id,cycle_id));
    create table accreditation_template_families(id uuid primary key default gen_random_uuid(),name text not null,description text default '',guidance text default '',archived_at timestamptz,created_by uuid references profiles);
    create unique index families_name on accreditation_template_families(lower(name)) where archived_at is null;
    create table accreditation_runs(id uuid primary key default gen_random_uuid(),template_family_id uuid references accreditation_template_families,cycle_id uuid references academic_years,term_id uuid,title text,status text default 'collecting',approved_revision_id uuid,created_by uuid references profiles,foreign key(term_id,cycle_id) references academic_terms(id,cycle_id));
    create unique index open_run on accreditation_runs(template_family_id,cycle_id,coalesce(term_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status<>'approved';
    create table accreditation_run_working_state(run_id uuid primary key references accreditation_runs,draft jsonb default '{"fields":{}}',readiness jsonb default '{}',updated_by uuid,updated_at timestamptz default now());
    create table accreditation_run_messages(id uuid primary key default gen_random_uuid(),run_id uuid references accreditation_runs,role text,content text,created_by uuid);
    create table accreditation_revisions(id uuid primary key,run_id uuid references accreditation_runs,revision_number integer,draft jsonb,source_manifest jsonb,validation jsonb,provider_config jsonb,created_by uuid,unique(run_id,revision_number));
    create table accreditation_artifacts(id uuid primary key,revision_id uuid references accreditation_revisions,kind text,storage_path text unique,filename text,mime_type text,size_bytes bigint,sha256 text,created_by uuid,unique(revision_id,kind));
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261105000000_accreditation_example_documents.sql", import.meta.url), "utf8"));
  const user = randomUUID(), year = randomUUID(), batch = randomUUID();
  await db.query("insert into profiles values($1)", [user]);
  await db.query("insert into academic_years values($1,'2026–27')", [year]);
  await db.query("insert into accreditation_example_batches(id,created_by) values($1,$2)", [batch,user]);
  const exampleIds=[];
  for(let i=0;i<30;i++) {
    const id=randomUUID(); exampleIds.push(id);
    const args=[id,batch,null,"Budget","Budget.pdf","application/pdf",500,user];
    const first=(await db.query("select * from accreditation_reserve_example($1,$2,$3,$4,$5,$6,$7,$8)",args)).rows[0];
    const retry=(await db.query("select * from accreditation_reserve_example($1,$2,$3,$4,$5,$6,$7,$8)",args)).rows[0];
    assert.equal(first.id,retry.id);
  }
  assert.equal((await db.query("select count(*)::int as count from accreditation_template_families")).rows[0].count,30);
  const family=(await db.query("select family_id from accreditation_examples where id=$1",[exampleIds[0]])).rows[0].family_id;
  await db.query("update accreditation_examples set status='ready',units='[\"Page one\"]',analysis='{}' where id=$1",[exampleIds[0]]);
  const run=(await db.query("select accreditation_start_document($1,$2,null,$3,$4) as id",[family,year,user,[exampleIds[0]]])).rows[0].id;
  assert.equal((await db.query("select accreditation_start_document($1,$2,null,$3,$4) as id",[family,year,user,[exampleIds[0]]])).rows[0].id,run);
  const ai=randomUUID();
  assert.equal((await db.query("select accreditation_claim_ai($1) as ok",[ai])).rows[0].ok,true);
  assert.equal((await db.query("select accreditation_claim_ai($1) as ok",[randomUUID()])).rows[0].ok,false);
  await db.query("select accreditation_release_ai($1,60)",[ai]);
  assert.equal((await db.query("select accreditation_claim_ai($1) as ok",[randomUUID()])).rows[0].ok,false);
  const draft={version:1,title:"Budget",period:"2026",blocks:[{id:"p",type:"paragraph",text:"Draft"}]};
  async function claim(id,kind,version,payload,token=randomUUID()) {
    const row=(await db.query("select * from accreditation_claim_document_request($1,$2,$3,$4,$5,$6,$7)",[id,run,kind,version,JSON.stringify(payload),user,token])).rows[0];
    return {row,token};
  }
  async function finish(id,token,document,result={}) {
    return db.query("select accreditation_finish_document_request($1,$2,$3,'{}',$4) as result",[id,token,JSON.stringify(document),JSON.stringify(result)]);
  }
  const chat=randomUUID(), payload={message:"Make this year's version",exampleIds:[exampleIds[0]]};
  const claimed=await claim(chat,"chat",0,payload);
  await assert.rejects(claim(chat,"chat",0,payload),/still processing/);
  assert.equal((await db.query("select count(*)::int as n from accreditation_run_messages")).rows[0].n,1);
  // Manual changes win over a slow AI response.
  const save=randomUUID(), saved=await claim(save,"save",0,{document:draft,exampleIds:[exampleIds[0]]});
  await finish(save,saved.token,draft);
  await assert.rejects(finish(chat,claimed.token,draft,{answer:"Done"}),/draft changed/);
  assert.equal((await claim(save,"save",0,{document:draft,exampleIds:[exampleIds[0]]})).row.status,"completed");
  const pdf=randomUUID(), pdfClaim=await claim(pdf,"pdf",1,{exampleIds:[exampleIds[0]]});
  const revision=randomUUID(), artifact=randomUUID();
  const pdfResult={revisionId:revision,artifactId:artifact,path:"fixture/draft/document.pdf",filename:"document-draft-v1.pdf",size:500,sha256:"hash"};
  await finish(pdf,pdfClaim.token,draft,pdfResult);
  await finish(pdf,pdfClaim.token,draft,pdfResult);
  assert.equal((await db.query("select count(*)::int as n from accreditation_artifacts")).rows[0].n,1);
  const edit=randomUUID(), edited=await claim(edit,"save",1,{document:draft,exampleIds:[exampleIds[0]]});
  await finish(edit,edited.token,draft);
  await assert.rejects(db.query("update accreditation_runs set status='approved',approved_revision_id=$1 where id=$2",[revision,run]),/latest draft/);
  const second=randomUUID(), secondClaim=await claim(second,"pdf",2,{exampleIds:[exampleIds[0]]});
  const secondRevision=randomUUID();
  await finish(second,secondClaim.token,draft,{...pdfResult,revisionId:secondRevision,artifactId:randomUUID(),path:"fixture/draft/document2.pdf"});
  await db.query("update accreditation_runs set status='approved',approved_revision_id=$1 where id=$2",[secondRevision,run]);
  await assert.rejects(db.query("update accreditation_run_working_state set document='{}' where run_id=$1",[run]),/immutable/);
  await assert.rejects(claim(randomUUID(),"save",2,{document:draft,exampleIds:[exampleIds[0]]}),/not editable/);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from accreditation_examples"),/permission denied/);
  await assert.rejects(db.query("select accreditation_claim_ai($1)",[randomUUID()]),/permission denied/);
});

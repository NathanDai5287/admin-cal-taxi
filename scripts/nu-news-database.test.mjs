import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const DONATE = JSON.stringify({ heading: "HOW TO DONATE", body: "Zelle: calthetaxi@gmail.com" });

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('test.user_id', true), '')::uuid
    $$;
    create table public.profiles (id uuid primary key, role text);
    create function public.is_admin() returns boolean language sql security definer as $$
      select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
    $$;
    create function public.set_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at = clock_timestamp(); return new; end;
    $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, version text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant all on storage.objects to authenticated, anon;
  `);
  const admin = randomUUID();
  const member = randomUUID();
  await db.query("insert into public.profiles values ($1, 'admin'), ($2, 'member')", [admin, member]);
  await db.exec(await readFile(new URL("../supabase/migrations/20261014000000_nu_news.sql", import.meta.url), "utf8"));
  const as = async (role, user) => {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('test.user_id', $1, false)", [user ?? ""]);
  };
  return { db, admin, member, as };
}

test("only administrators can read and change Nu News issues and files", async (t) => {
  const { db, admin, member, as } = await database(t);
  const bucket = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'nu-news'")).rows[0];
  assert.deepEqual(bucket, { public: false, file_size_limit: 50 * 1024 * 1024, allowed_mime_types: ["image/jpeg", "application/pdf"] });

  await as("authenticated", admin);
  const { id, location, articles, issue_date, updated_at } = (await db.query("insert into public.nu_news_issues (season, donate) values ('Fall 2026', $1) returning *", [DONATE])).rows[0];
  assert.equal(location, "Berkeley, CA");
  assert.deepEqual(articles, []);
  assert.ok(issue_date instanceof Date);
  await db.query("update public.nu_news_issues set location = 'Oakland, CA', preview_made_at = now() where id = $1", [id]);
  assert.ok((await db.query("select updated_at from public.nu_news_issues where id = $1", [id])).rows[0].updated_at > updated_at);
  await assert.rejects(db.query("insert into public.nu_news_issues (season, donate) values ('   ', $1)", [DONATE]), /check constraint/);
  await db.query("insert into storage.objects (bucket_id, name) values ('nu-news', $1)", [`${id}/photo.jpg`]);

  await as("authenticated", member);
  assert.equal((await db.query("select count(*)::int as count from public.nu_news_issues")).rows[0].count, 0);
  assert.equal((await db.query("select count(*)::int as count from storage.objects")).rows[0].count, 0);
  await assert.rejects(db.query("insert into public.nu_news_issues (season, donate) values ('Spring 2027', $1)", [DONATE]), /row-level security/);
  await assert.rejects(db.query("insert into storage.objects (bucket_id, name) values ('nu-news', 'member.jpg')"), /row-level security/);
  assert.equal((await db.query("update public.nu_news_issues set season = 'Changed' returning id")).rows.length, 0);

  await as("anon");
  await assert.rejects(db.query("select * from public.nu_news_issues"), /permission denied/);
  assert.equal((await db.query("select count(*)::int as count from storage.objects")).rows[0].count, 0);

  await as("authenticated", admin);
  await db.query("delete from public.nu_news_issues where id = $1", [id]);
});

test("a finalized issue, its PDF, and its photos never change", async (t) => {
  const { db, admin, as } = await database(t);
  await as("authenticated", admin);
  const { id } = (await db.query("insert into public.nu_news_issues (season, donate) values ('Fall 2026', $1) returning id", [DONATE])).rows[0];
  const photo = `${id}/${randomUUID()}.jpg`;
  const draftPhoto = `${id}/${randomUUID()}.jpg`;
  const finalPdf = `${id}/final/${randomUUID()}.pdf`;
  for (const name of [photo, draftPhoto, finalPdf, `${id}/preview.pdf`]) {
    await db.query("insert into storage.objects (bucket_id, name, version) values ('nu-news', $1, 'v1')", [name]);
  }
  await db.query("update storage.objects set version = 'v2' where name = $1", [`${id}/preview.pdf`]);

  const finalize = (fields) => db.query(`update public.nu_news_issues set ${fields} where id = $1`, [id]);
  await assert.rejects(finalize("finalized_at = now()"), /check constraint/);
  await assert.rejects(finalize(`finalized_at = now(), finalized_by = '${admin}', finalized_by_name = 'Taylor', final_pdf_path = '${finalPdf}', final_pdf_sha256 = 'not-a-checksum', final_inputs = '{}'`), /check constraint/);
  await finalize(`cover_src = '${photo}', finalized_at = now(), finalized_by = '${admin}', finalized_by_name = 'Taylor Admin',
    final_pdf_path = '${finalPdf}', final_pdf_sha256 = '${"a".repeat(64)}',
    final_inputs = jsonb_build_object('content', '{}'::jsonb, 'data', '{}'::jsonb, 'draft', false, 'photos', jsonb_build_object('${photo}', '${"b".repeat(64)}'))`);

  const immutable = /Finalized Nu News issues are immutable/;
  await assert.rejects(db.query("update public.nu_news_issues set intro = '{\"heading\": \"Edited\", \"body\": \"\"}' where id = $1", [id]), immutable);
  await assert.rejects(db.query("update public.nu_news_issues set final_pdf_path = 'elsewhere.pdf' where id = $1", [id]), immutable);
  await assert.rejects(db.query("update public.nu_news_issues set preview_made_at = now() where id = $1", [id]), immutable);
  await assert.rejects(db.query("delete from public.nu_news_issues where id = $1", [id]), immutable);

  const permanent = /Files of a finalized Nu News issue are immutable/;
  for (const role of ["authenticated", "postgres"]) {
    await as(role, admin);
    await assert.rejects(db.query("update storage.objects set version = 'replacement' where name = $1", [finalPdf]), permanent);
    await assert.rejects(db.query("delete from storage.objects where name = $1", [finalPdf]), permanent);
    await assert.rejects(db.query("update storage.objects set name = 'moved.jpg' where name = $1", [photo]), permanent);
    await assert.rejects(db.query("delete from storage.objects where name = $1", [photo]), permanent);
    await assert.rejects(db.query("update public.nu_news_issues set season = 'Spring 2027' where id = $1", [id]), immutable);
  }
  const issue = (await db.query("select season, cover_src, final_pdf_path from public.nu_news_issues where id = $1", [id])).rows[0];
  assert.deepEqual(issue, { season: "Fall 2026", cover_src: photo, final_pdf_path: finalPdf });

  await db.query("delete from storage.objects where name = any($1)", [[draftPhoto, `${id}/preview.pdf`]]);
  assert.deepEqual((await db.query("select name, version from storage.objects order by name")).rows.map((row) => row.name).sort(), [finalPdf, photo].sort());
  assert.equal((await db.query("select version from storage.objects where name = $1", [finalPdf])).rows[0].version, "v1");

  const { id: draft } = (await db.query("insert into public.nu_news_issues (season, donate, cover_src) values ('Spring 2027', $1, $2) returning id", [DONATE, photo])).rows[0];
  await db.query("update public.nu_news_issues set season = 'Spring 2027 draft' where id = $1", [draft]);
});

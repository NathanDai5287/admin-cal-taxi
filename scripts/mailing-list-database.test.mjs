import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end $$;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261014130000_mailing_list.sql", import.meta.url), "utf8"));
  return db;
}

const alex = { first_name: " Alex ", last_name: "Smith", email: "ALEX@example.com", phone: "+1 (510) 555-0123" };

test("imports are atomic, retry-safe, and preserve existing details", async (t) => {
  const db = await database(t);
  await db.exec("set role service_role");
  const importRows = async (rows) => (await db.query("select public.import_mailing_list_contacts($1::jsonb) as count", [JSON.stringify(rows)])).rows[0].count;
  assert.equal(await importRows([alex, { ...alex, first_name: "Overwrite" }]), 1);
  assert.equal(await importRows([alex]), 0);
  assert.equal((await db.query("select first_name, email, phone_digits from public.mailing_list_contacts")).rows[0].first_name, "Alex");
  assert.equal((await db.query("select phone_digits from public.mailing_list_contacts")).rows[0].phone_digits, "15105550123");
  assert.equal(await importRows([{ ...alex, email: "", phone: "510-555-0123" }, { ...alex, email: "", phone: "(510) 555-0123" }]), 1);
  await assert.rejects(importRows([{ ...alex, email: "new@example.com" }, { ...alex, email: "bad" }]), /check constraint/);
  assert.equal((await db.query("select count(*)::int as count from public.mailing_list_contacts")).rows[0].count, 2);
  await assert.rejects(importRows([]), /between 1 and 10000/);
  await assert.rejects(importRows(null), /contact array/);
  await assert.rejects(importRows(Array.from({ length: 10001 }, () => alex)), /between 1 and 10000/);
});

test("anonymous and member roles cannot access contacts or invoke bulk import; admins can manage them", async (t) => {
  const db = await database(t);
  await db.exec("set role authenticated; select set_config('test.admin', 'yes', false)");
  const { id, updated_at } = (await db.query("insert into public.mailing_list_contacts(first_name, email) values ('Alex', 'alex@example.com') returning *")).rows[0];
  await db.query("update public.mailing_list_contacts set last_name = 'Smith' where id = $1", [id]);
  assert.ok((await db.query("select updated_at from public.mailing_list_contacts")).rows[0].updated_at > updated_at);
  await assert.rejects(db.query("insert into public.mailing_list_contacts(first_name, email) values ('Duplicate', 'alex@example.com')"), /unique constraint/);
  await assert.rejects(db.query("select public.import_mailing_list_contacts($1::jsonb)", [JSON.stringify([alex])]), /permission denied/);
  await db.exec("select set_config('test.admin', 'no', false)");
  assert.equal((await db.query("select * from public.mailing_list_contacts")).rows.length, 0);
  await assert.rejects(db.query("insert into public.mailing_list_contacts(first_name, email) values ('Member', 'member@example.com')"), /row-level security/);
  assert.equal((await db.query("update public.mailing_list_contacts set first_name = 'Wrong' returning id")).rows.length, 0);
  assert.equal((await db.query("delete from public.mailing_list_contacts returning id")).rows.length, 0);
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select * from public.mailing_list_contacts"), /permission denied/);
  await assert.rejects(db.query("select public.import_mailing_list_contacts($1::jsonb)", [JSON.stringify([alex])]), /permission denied/);
  await db.exec("reset role; set role authenticated; select set_config('test.admin', 'yes', false)");
  assert.equal((await db.query("delete from public.mailing_list_contacts returning id")).rows.length, 1);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("bulk access replaces overlapping grants atomically and preserves administrator access", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create function public.has_app_access(app text, access text) returns boolean language sql as
    $$ select coalesce(current_setting('test.can_write_roles', true), 'false') = 'true' $$;
  `);
  const schema = await readFile(new URL("../supabase/migrations/20261014150000_role_app_access.sql", import.meta.url), "utf8");
  await db.exec(schema.slice(0, schema.indexOf("create function public.get_my_app_access")));
  await db.exec(await readFile(new URL("../supabase/migrations/20261015160000_bulk_app_access.sql", import.meta.url), "utf8"));
  await db.exec("grant select on role_app_access to authenticated; set role authenticated");
  await assert.rejects(db.query("select admin_set_app_access('nu-news', 'read')"), /Write access/);
  await db.query("select set_config('test.can_write_roles', 'true', false)");
  for (const level of ["write", "read", "none"]) {
    await db.query("select admin_set_app_access('nu-news', $1)", [level]);
    const { rows } = await db.query("select role_key, access_level from role_app_access where app_key = 'nu-news'");
    assert.equal(rows.length, 13);
    for (const row of rows) assert.equal(row.access_level, row.role_key === "admin" ? "write" : level);
  }
  const before = (await db.query("select * from role_app_access order by role_key, app_key")).rows;
  await assert.rejects(db.query("select admin_set_app_access('nu-news', 'invalid')"), /valid access/);
  await assert.rejects(db.query("select admin_set_app_access('nu-news', null)"), /valid access/);
  await assert.rejects(db.query("select admin_set_app_access('unknown', 'read')"), /Unknown app/);
  assert.deepEqual((await db.query("select * from role_app_access order by role_key, app_key")).rows, before);
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select admin_set_app_access('nu-news', 'read')"), /permission denied/);
});

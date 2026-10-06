import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("budget revisions and completion preserve original amounts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create type reimbursement_category as enum ('rush', 'house');
      create table reimbursement_budgets (id boolean primary key, category_amounts jsonb not null);
      create function valid_reimbursement_budget_map(jsonb) returns boolean language sql as $$select true$$;
      insert into reimbursement_budgets values (true, '{"rush":1000,"house":null}');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261006003000_completed_expense_categories.sql", import.meta.url), "utf8"));
    await db.exec(`update reimbursement_budgets set category_amounts='{"rush":1150,"house":500}', completed_categories='{rush}'`);
    let plan = (await db.query("select *, to_json(completed_categories) as completed_categories from reimbursement_budgets")).rows[0];
    assert.deepEqual(plan.original_category_amounts, { rush: 1000, house: 500 });
    assert.deepEqual(plan.category_amounts, { rush: 1150, house: 500 });
    assert.deepEqual(plan.completed_categories, ["rush"]);
    await db.exec(`update reimbursement_budgets set category_amounts='{"rush":null,"house":600}', original_category_amounts='{"rush":1}', completed_categories='{}'`);
    plan = (await db.query("select *, to_json(completed_categories) as completed_categories from reimbursement_budgets")).rows[0];
    assert.deepEqual(plan.original_category_amounts, { rush: 1000, house: 500 });
    assert.deepEqual(plan.completed_categories, []);
    await assert.rejects(db.exec("update reimbursement_budgets set completed_categories='{unknown}'"), /invalid input value/);
    await db.exec(`delete from reimbursement_budgets; insert into reimbursement_budgets (id, category_amounts) values(true, '{"rush":700}')`);
    plan = (await db.query("select *, to_json(completed_categories) as completed_categories from reimbursement_budgets")).rows[0];
    assert.deepEqual(plan.original_category_amounts, { rush: 700 });
  } finally {
    await db.close();
  }
});

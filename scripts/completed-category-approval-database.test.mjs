import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";

test("completed categories require reopening before new approvals", async () => {
  const db = new PGlite();
  const completedCategoryError = { code: "23514", detail: "rush" };
  try {
    await db.exec(`
      create type reimbursement_category as enum ('rush', 'house');
      create type reimbursement_status as enum ('pending', 'approved', 'denied');
      create table reimbursement_budgets (
        id boolean primary key,
        category_amounts jsonb not null
      );
      create function valid_reimbursement_budget_map(jsonb)
        returns boolean language sql as $$select true$$;
      create table reimbursements (
        id integer primary key,
        category reimbursement_category not null,
        amount numeric not null,
        status reimbursement_status not null,
        reimbursed boolean not null default false,
        notes text
      );
      insert into reimbursement_budgets values (true, '{"rush":1000,"house":500}');
      insert into reimbursements (id, category, amount, status) values
        (1, 'rush', 100, 'approved'),
        (2, 'rush', 50, 'pending'),
        (3, 'house', 75, 'approved');
    `);
    for (const migration of [
      "20261006003000_completed_expense_categories.sql",
      "20261006004000_completed_category_approval_guard.sql",
    ]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await db.exec("update reimbursement_budgets set completed_categories = '{rush}'");
    await assert.rejects(
      db.exec("insert into reimbursements (id, category, amount, status) values (4, 'rush', 25, 'approved')"),
      completedCategoryError,
    );
    await assert.rejects(
      db.exec("update reimbursements set status = 'approved' where id = 2"),
      completedCategoryError,
    );
    await assert.rejects(
      db.exec("update reimbursements set category = 'rush' where id = 3"),
      completedCategoryError,
    );
    await assert.rejects(
      db.exec("update reimbursements set amount = 101 where id = 1"),
      completedCategoryError,
    );
    await db.exec(`
      update reimbursements set reimbursed = true, notes = 'Payment recorded' where id = 1;
      update reimbursements set amount = 90 where id = 1;
      update reimbursements set status = 'denied' where id = 2;
      insert into reimbursements (id, category, amount, status) values
        (4, 'rush', 25, 'pending'),
        (5, 'house', 30, 'approved');
    `);
    assert.deepEqual((await db.query("select id, amount, status, reimbursed, notes from reimbursements order by id")).rows, [
      { id: 1, amount: "90", status: "approved", reimbursed: true, notes: "Payment recorded" },
      { id: 2, amount: "50", status: "denied", reimbursed: false, notes: null },
      { id: 3, amount: "75", status: "approved", reimbursed: false, notes: null },
      { id: 4, amount: "25", status: "pending", reimbursed: false, notes: null },
      { id: 5, amount: "30", status: "approved", reimbursed: false, notes: null },
    ]);
    await db.exec(`
      update reimbursement_budgets set completed_categories = '{}';
      update reimbursements set status = 'approved' where id = 4;
      insert into reimbursements (id, category, amount, status) values (6, 'rush', 15, 'approved');
      update reimbursement_budgets set completed_categories = '{rush}';
    `);
    assert.equal((await db.query("select status from reimbursements where id = 4")).rows[0].status, "approved");
    await assert.rejects(
      db.exec("update reimbursements set status = 'approved' where id = 2"),
      completedCategoryError,
    );
  } finally {
    await db.close();
  }
});

test("approvals hold the budget lock until their transaction finishes", async () => {
  const run = promisify(execFile);
  const postgresBin = (await run("pg_config", ["--bindir"])).stdout.trim();
  const directory = await mkdtemp(join(tmpdir(), "completed-category-approval-"));
  const dataDirectory = join(directory, "data");
  const query = (sql) => run(join(postgresBin, "psql"), [
    "-X", "-h", directory, "-p", "55441", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At", "-c", sql,
  ]);
  try {
    await run(join(postgresBin, "initdb"), ["-D", dataDirectory, "-A", "trust", "--no-locale"]);
    await run(join(postgresBin, "pg_ctl"), [
      "-D", dataDirectory, "-l", join(directory, "server.log"),
      "-o", `-k ${directory} -h '' -p 55441`, "start",
    ]);
    await query(`
      create type reimbursement_category as enum ('rush');
      create table reimbursement_budgets (
        id boolean primary key,
        completed_categories reimbursement_category[] not null default '{}'
      );
      create table reimbursements (category reimbursement_category, amount numeric, status text);
      insert into reimbursement_budgets (id) values (true);
    `);
    await query(await readFile(new URL("../supabase/migrations/20261006004000_completed_category_approval_guard.sql", import.meta.url), "utf8"));
    const approval = query(`
      set application_name = 'completed_category_approval_test';
      begin;
      insert into reimbursements values ('rush', 10, 'approved');
      select pg_sleep(2);
      commit;
    `);
    let approvalHoldsLock = false;
    for (let attempt = 0; attempt < 100 && !approvalHoldsLock; attempt += 1) {
      const result = await query(`select exists (
        select 1 from pg_stat_activity
        where application_name = 'completed_category_approval_test' and wait_event = 'PgSleep'
      )`);
      approvalHoldsLock = result.stdout.trim() === "t";
    }
    assert.equal(approvalHoldsLock, true);
    await assert.rejects(
      query("set lock_timeout = '100ms'; update reimbursement_budgets set completed_categories = '{rush}'"),
      /lock timeout/,
    );
    await approval;
    await query("update reimbursement_budgets set completed_categories = '{rush}'");
    await assert.rejects(
      query("insert into reimbursements values ('rush', 20, 'approved')"),
      /Reopen the completed category/,
    );
    assert.equal((await query("select count(*) from reimbursements")).stdout.trim(), "1");
  } finally {
    await run(join(postgresBin, "pg_ctl"), ["-D", dataDirectory, "-m", "immediate", "stop"]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

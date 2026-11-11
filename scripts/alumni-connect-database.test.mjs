import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  const broadcastMigration = await readFile(
    new URL(
      "../supabase/migrations/20261014160000_mailing_broadcasts.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const mailingListsDdl = broadcastMigration.match(
    /create table public\.mailing_lists \([\s\S]*?\n\);/,
  )[0];
  const roleDdl = (
    await readFile(
      new URL(
        "../supabase/migrations/20261014150000_role_app_access.sql",
        import.meta.url,
      ),
      "utf8",
    )
  ).split("create function public.get_my_app_access()")[0];
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles(id uuid primary key, email text not null unique, contact_email text not null default '', full_name text not null default '', role text not null default 'none', membership text constraint profiles_membership_check check(membership in ('brother','associate_member')), executive_roles text[] not null default '{}', removed_at timestamptz, has_signed_in boolean not null default false);
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
    create function public.view_as_roles() returns text[] language sql as $$ select null::text[] $$;
    ${roleDdl}
    create function public.has_app_access(text,text) returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$;
    create schema storage;
    create table storage.objects(id uuid, bucket_id text, name text);
    create table public.nu_news_issues(id uuid, finalized_at timestamptz, final_pdf_path text);
    ${mailingListsDdl}
    create table public.mailing_list_contacts(first_name text, last_name text, email text, contact_key text generated always as ('email:' || email) stored unique);
    grant all on public.profiles, public.mailing_lists, public.mailing_list_contacts to service_role;
    insert into public.profiles(id,email,full_name,role) values ('00000000-0000-4000-8000-000000000001','admin@example.com','Admin Brother','admin');
  `);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261026000000_alumni_membership.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261110000000_alumni_connect.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("set role service_role");
  return db;
}
const admin = "00000000-0000-4000-8000-000000000001";
const call = async (db, command, payload) =>
  (
    await db.query("select public.connect_command($1,$2::jsonb) as result", [
      command,
      JSON.stringify(payload),
    ])
  ).rows[0].result;
async function invite(db, email = "brother@example.com", extras = {}) {
  const credential = randomUUID();
  const rows = await call(db, "invite", {
    actor: admin,
    admin: true,
    include_name: false,
    recipients: [
      {
        email,
        token_hash: credential,
        defaults: { first_name: "Suggested", roll_number: "Nu 1048" },
      },
    ],
    ...extras,
  });
  return { ...rows[0], credential };
}
const details = {
  first_name: "Corrected",
  last_name: "Brother",
  roll_number: "Nu 1049",
  graduation_year: 2027,
  unsubscribe_hash: "unsubscribe",
  session_hash: "session",
};
const accept = (db, inv, extra = {}) =>
  call(db, "accept", {
    ...details,
    email: inv.email,
    invitation_hash: inv.credential,
    ...extra,
  });

test("referrals reserve one permanent identity; acceptance uses edited defaults and a shared profile", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  assert.equal((await invite(db)).id, undefined);
  assert.equal(
    (await db.query("select count(*)::int n from public.profiles")).rows[0].n,
    1,
  );
  const accepted = await accept(db, inv);
  const profile = (
    await db.query(
      "select first_name,last_name,roll_number,graduation_year,membership from public.profiles where id=$1",
      [accepted.profile_id],
    )
  ).rows[0];
  assert.deepEqual(profile, {
    first_name: "Corrected",
    last_name: "Brother",
    roll_number: "Nu 1049",
    graduation_year: 2027,
    membership: "alumni",
  });
  assert.equal(
    (await db.query("select recipients from public.mailing_lists")).rows[0]
      .recipients[0].email,
    inv.email,
  );
  await assert.rejects(accept(db, inv), /no longer available/);
  assert.equal(
    (await db.query("select defaults from public.connect_invitations")).rows[0]
      .defaults.first_name,
    "Suggested",
  );
});
test("replacement email needs a verified code; both addresses remain suppressed after unsubscribe", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  await assert.rejects(
    accept(db, inv, { email: "school@example.com" }),
    /Verify your new email/,
  );
  await call(db, "request_code", {
    email: "school@example.com",
    purpose: "change",
    invitation_hash: inv.credential,
    token_hash: "code-token",
    code_hash: "correct",
  });
  assert.equal(
    (
      await call(db, "verify_code", {
        token_hash: "code-token",
        code_hash: "wrong",
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await call(db, "verify_code", {
        token_hash: "code-token",
        code_hash: "correct",
      })
    ).ok,
    true,
  );
  await accept(db, inv, {
    email: "school@example.com",
    verification_hash: "code-token",
  });
  await call(db, "unsubscribe", { token_hash: "unsubscribe" });
  assert.equal((await invite(db, inv.email)).id, undefined);
  assert.equal((await invite(db, "school@example.com")).id, undefined);
  assert.deepEqual(
    (await db.query("select recipients from public.mailing_lists")).rows[0]
      .recipients,
    [],
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.connect_sessions"))
      .rows[0].n,
    0,
  );
});
test("code attempts, expiry, single use, and request cooldown are enforced in storage", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  const payload = {
    email: "school@example.com",
    purpose: "change",
    invitation_hash: inv.credential,
    token_hash: "otp",
    code_hash: "correct",
  };
  await call(db, "request_code", payload);
  await assert.rejects(
    call(db, "request_code", { ...payload, token_hash: "another" }),
    /Please wait/,
  );
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await call(db, "verify_code", { token_hash: "otp", code_hash: "wrong" }))
        .ok,
      false,
    );
  assert.equal(
    (await call(db, "verify_code", { token_hash: "otp", code_hash: "correct" }))
      .ok,
    false,
  );
  await db.exec(
    "update public.connect_verifications set attempts=0, expires_at=now()-interval '1 second'",
  );
  assert.equal(
    (await call(db, "verify_code", { token_hash: "otp", code_hash: "correct" }))
      .ok,
    false,
  );
});
test("declines and revocations are terminal and never permit another invitation", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  await call(db, "decline", { invitation_hash: inv.credential });
  await assert.rejects(accept(db, inv), /no longer available/);
  assert.equal((await invite(db)).id, undefined);
  const other = await invite(db, "other@example.com");
  await call(db, "revoke", { id: other.id });
  await assert.rejects(accept(db, other), /no longer available/);
  assert.equal((await invite(db, other.email)).id, undefined);
});
test("existing confirmed profiles retain membership, privileges and identity; removals invalidate sessions", async (t) => {
  const db = await database(t);
  await db.query(
    "insert into public.profiles(id,email,full_name,first_name,last_name,membership,role,has_signed_in) values ($1,'existing@example.com','Existing Person','Existing','Person','brother','admin',true)",
    [randomUUID()],
  );
  const inv = await invite(db, "existing@example.com");
  const result = await accept(db, inv);
  const person = (
    await db.query(
      "select first_name,membership,role from public.profiles where id=$1",
      [result.profile_id],
    )
  ).rows[0];
  assert.deepEqual(person, {
    first_name: "Existing",
    membership: "brother",
    role: "admin",
  });
  await db.query("update public.profiles set removed_at=now() where id=$1", [
    result.profile_id,
  ]);
  assert.equal(
    (await db.query("select blocked from public.connect_members")).rows[0]
      .blocked,
    true,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.connect_sessions"))
      .rows[0].n,
    0,
  );
});
test("a removed existing profile cannot accept, and failed acceptance leaves its invitation unused", async (t) => {
  const db = await database(t);
  await db.query("insert into public.profiles(id,email,removed_at,role,has_signed_in) values ($1,$2,now(),'member',true)", ["00000000-0000-4000-8000-000000000002", "removed@example.com"]);
  const inv = await invite(db, "removed@example.com");
  await assert.rejects(accept(db, inv), /restore your access/);
  assert.equal((await db.query("select status from public.connect_invitations where id=$1",[inv.id])).rows[0].status,"pending");
  assert.equal((await db.query("select count(*)::int n from public.connect_members")).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from public.connect_sessions")).rows[0].n,0);
  assert.equal((await db.query("select removed_at is not null as removed from public.profiles where email='removed@example.com'")).rows[0].removed,true);
});

test("only active subscribers can refer; admin removal blocks referrals and login codes", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  const accepted = await accept(db, inv);
  const payload = {
    actor: accepted.profile_id,
    include_name: true,
    recipients: [
      { email: "classmate@example.com", token_hash: "classmate", defaults: {} },
    ],
  };
  assert.equal((await call(db, "invite", payload)).length, 1);
  await call(db, "block", { id: accepted.profile_id });
  await assert.rejects(
    call(db, "invite", {
      ...payload,
      recipients: [{ ...payload.recipients[0], email: "next@example.com" }],
    }),
    /Join the mailing list/,
  );
  assert.equal(
    (
      await call(db, "request_code", {
        purpose: "login",
        email: inv.email,
        token_hash: "login",
        code_hash: "code",
      })
    ).send,
    false,
  );
});
test("browser database roles cannot read credentials or execute privileged commands", async (t) => {
  const db = await database(t);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(
      db.query("select * from public.connect_invitations"),
      /permission denied/,
    );
    await assert.rejects(call(db, "invite", {}), /permission denied/);
  }
});
test("verified replacement retains an existing provisional person rather than creating a second profile", async (t) => {
  const db = await database(t);
  const existing = randomUUID();
  await db.query(
    "insert into public.profiles(id,email,full_name) values ($1,'brother@example.com','Original Person')",
    [existing],
  );
  const inv = await invite(db);
  await call(db, "request_code", {
    email: "school@example.com",
    purpose: "change",
    invitation_hash: inv.credential,
    token_hash: "replacement",
    code_hash: "correct",
  });
  await call(db, "verify_code", {
    token_hash: "replacement",
    code_hash: "correct",
  });
  const accepted = await accept(db, inv, {
    email: "school@example.com",
    verification_hash: "replacement",
  });
  assert.equal(accepted.profile_id, existing);
  assert.equal(
    (
      await db.query(
        "select email,membership from public.profiles where id=$1",
        [existing],
      )
    ).rows[0].email,
    "school@example.com",
  );
  // Supabase's existing provisional-profile claim rekeys this row on sign-in.
  const signedInId = randomUUID();
  await db.query(
    "update public.profiles set id=$1, has_signed_in=true where id=$2",
    [signedInId, existing],
  );
  assert.equal(
    (await db.query("select profile_id from public.connect_members")).rows[0]
      .profile_id,
    signedInId,
  );
  assert.equal(
    (await db.query("select profile_id from public.connect_sessions")).rows[0]
      .profile_id,
    signedInId,
  );
});
test("a verified replacement can retire another unused invitation while retaining both histories", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  const other = await invite(db, "school@example.com");
  await call(db, "request_code", {
    email: "school@example.com",
    purpose: "change",
    invitation_hash: inv.credential,
    token_hash: "replacement",
    code_hash: "correct",
  });
  await call(db, "verify_code", {
    token_hash: "replacement",
    code_hash: "correct",
  });
  await accept(db, inv, {
    email: "school@example.com",
    verification_hash: "replacement",
  });
  await assert.rejects(accept(db, other), /no longer available/);
  assert.equal(
    (await db.query("select count(*)::int n from public.connect_email_history"))
      .rows[0].n,
    2,
  );
});
test("concurrent submissions reserve an address once and fifty invitations exhaust the daily limit", async (t) => {
  const db = await database(t);
  const submissions = await Promise.all([invite(db), invite(db)]);
  assert.equal(submissions.filter((i) => i.id).length, 1);
  for (let i = 1; i < 50; i++) await invite(db, `brother${i}@example.com`);
  await assert.rejects(
    invite(db, "overlimit@example.com"),
    /Daily invitation limit/,
  );
});
test("read permissions cannot expose draft newsletters or source assets through direct database access", async (t) => {
  const db = await database(t);
  await db.exec(`reset role;
    create or replace function public.has_app_access(text,text) returns boolean language sql as $$ select $2 = 'read' $$;
    alter table public.nu_news_issues enable row level security;
    alter table storage.objects enable row level security;
    create policy reader_allow on public.nu_news_issues for select to authenticated using (true);
    create policy files_allow on storage.objects for select to authenticated using (true);
    grant select on public.nu_news_issues to authenticated;
    grant usage on schema storage to authenticated;
    grant select on storage.objects to authenticated;
    insert into public.nu_news_issues values (gen_random_uuid(),now(),'final.pdf'),(gen_random_uuid(),null,'draft.pdf');
    insert into storage.objects values (gen_random_uuid(),'nu-news','final.pdf'),(gen_random_uuid(),'nu-news','draft.pdf'),(gen_random_uuid(),'nu-news','source.jpg');
    set role authenticated;
  `);
  assert.equal(
    (await db.query("select * from public.nu_news_issues")).rows.length,
    1,
  );
  assert.deepEqual((await db.query("select name from storage.objects")).rows, [
    { name: "final.pdf" },
  ]);
});

test("known aliases claim provisional profiles and cannot create a second established account", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  await call(db, "request_code", {
    email: "school@example.com",
    purpose: "change",
    invitation_hash: inv.credential,
    token_hash: "replacement",
    code_hash: "correct",
  });
  await call(db, "verify_code", {
    token_hash: "replacement",
    code_hash: "correct",
  });
  const accepted = await accept(db, inv, {
    email: "school@example.com",
    verification_hash: "replacement",
  });
  await db.exec("reset role");
  const account = randomUUID();
  await db.query(
    "insert into auth.users(id,email) values ($1,'brother@example.com')",
    [account],
  );
  assert.equal(
    (
      await db.query("select email from public.profiles where id=$1", [
        accepted.profile_id,
      ])
    ).rows[0].email,
    "brother@example.com",
  );
  await db.query(
    "update public.profiles set id=$1,has_signed_in=true where id=$2",
    [account, accepted.profile_id],
  );
  await assert.rejects(
    db.query(
      "insert into auth.users(id,email) values ($1,'school@example.com')",
      [randomUUID()],
    ),
    /original sign-in account or a Connect email code/,
  );
});

test("real role defaults cannot give self-service Connect profiles reimbursement access", async (t) => {
  const db = await database(t);
  const inv = await invite(db);
  const accepted = await accept(db, inv);
  await db.query("select set_config('test.uid',$1,false)", [
    accepted.profile_id,
  ]);
  const grants = (
    await db.query(
      "select * from public.get_my_app_access() where access_level <> 'none'",
    )
  ).rows;
  assert.deepEqual(grants, [{ app_key: "nu-news", access_level: "read" }]);
  await db.exec(
    `select set_config('test.jwt','{"client_id":"test-client"}',false)`,
  );
  assert.equal(
    (
      await db.query(
        "select public.has_mcp_app_access('submit','write') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select public.has_mcp_app_access('nu-news','read') allowed",
      )
    ).rows[0].allowed,
    true,
  );
});
test("real mailing-list constraint allows empty Connect list and last-member opt-outs without breaking People removal", async (t) => {
  const db = await database(t);
  assert.deepEqual(
    (await db.query("select recipients from public.mailing_lists")).rows[0]
      .recipients,
    [],
  );
  await db.query("update public.profiles set removed_at=now() where id=$1", [
    admin,
  ]);
  await db.query("update public.profiles set removed_at=null where id=$1", [
    admin,
  ]);
  const inv = await invite(db);
  const accepted = await accept(db, inv);
  assert.equal((await call(db, "block", { id: accepted.profile_id })).ok, true);
  assert.deepEqual(
    (await db.query("select recipients from public.mailing_lists")).rows[0]
      .recipients,
    [],
  );
  assert.equal(
    (await call(db, "unblock", { id: accepted.profile_id })).ok,
    true,
  );
  assert.equal(
    (await db.query("select subscribed from public.connect_members")).rows[0]
      .subscribed,
    false,
  );
  assert.equal(
    (await call(db, "resubscribe", { id: accepted.profile_id })).ok,
    true,
  );
  assert.equal(
    (await call(db, "unsubscribe", { token_hash: "unsubscribe" })).ok,
    true,
  );
});
test("unknown destructive targets never report success and unsent recovery cannot release unknown sends", async (t) => {
  const db = await database(t);
  const id = randomUUID();
  for (const command of ["revoke", "block", "unblock", "release_not_sent"])
    assert.equal((await call(db, command, { id })).ok, false);
  assert.equal(
    (await call(db, "unsubscribe", { token_hash: "missing" })).ok,
    false,
  );
  const inv = await invite(db);
  await db.query(
    "update public.connect_invitations set delivery='uncertain' where id=$1",
    [inv.id],
  );
  assert.equal((await call(db, "release_not_sent", { id: inv.id })).ok, false);
  await db.query(
    "update public.connect_invitations set delivery='not_sent' where id=$1",
    [inv.id],
  );
  assert.equal((await call(db, "release_not_sent", { id: inv.id })).ok, true);
  assert.ok((await invite(db)).id);
});
test("existing subscriber lists skip redundant invitations but an address book alone is not consent", async (t) => {
  const db = await database(t);
  await db.query(
    "insert into public.mailing_lists(id,name,recipients) values ($1,'Existing',$2)",
    [randomUUID(), JSON.stringify([{ email: "existing@example.com" }])],
  );
  assert.equal((await invite(db, "existing@example.com")).id, undefined);
  await db.query(
    "insert into public.mailing_list_contacts(first_name,email) values ('Known','known@example.com')",
  );
  assert.ok((await invite(db, "known@example.com")).id);
});
test("invitation defaults reject arbitrary JSON keys and malformed typed values", async (t) => {
  const db = await database(t);
  await assert.rejects(
    call(db, "invite", {
      actor: admin,
      admin: true,
      include_name: true,
      recipients: [
        {
          email: "bad@example.com",
          token_hash: "bad",
          defaults: { role: "admin" },
        },
      ],
    }),
    /check constraint/,
  );
});

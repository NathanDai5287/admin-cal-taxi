import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["lib/alumni-connect/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "no-live-transports",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(server-only|next\/headers|resend|@\/lib\/reimbursements\/supabase\/admin)$/,
          },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents:
            path === "server-only"
              ? ""
              : path === "next/headers"
                ? "export const cookies = async () => globalThis.connectTest.cookies;"
                : path === "resend"
                  ? "export class Resend { constructor(){ return globalThis.connectTest.resend; } }"
                  : "export const createAdminClient = () => globalThis.connectTest.db; export const createUntypedAdminClient = createAdminClient;",
        }));
      },
    },
  ],
});
const server = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
process.env.RESEND_CONNECT_API_KEY = "test-only";
process.env.NODE_ENV = "test";
process.env.ALUMNI_CONNECT_URL = "https://chapter.example.test";
function fixture() {
  const s = (globalThis.connectTest = {
    sent: [],
    commands: [],
    cookies: {
      get: () => undefined,
      set: (...args) => {
        s.cookie = args;
      },
    },
    reservations: new Set(),
    fail: false,
  });
  s.db = {
    rpc: async (name, args) => {
      s.commands.push(args);
      if (args.command === "invite")
        return {
          data: args.payload.recipients
            .filter((r) => {
              if (s.reservations.has(r.email)) return false;
              s.reservations.add(r.email);
              return true;
            })
            .map((r) => ({
              id: r.email,
              email: r.email,
              inviter_name: "Nathan Dai",
            })),
          error: null,
        };
      return { data: { send: true }, error: null };
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        update: () => q,
        range: async () => ({ data: [], error: null }),
        then: (resolve) => Promise.resolve({ error: null }).then(resolve),
      };
      return q;
    },
  };
  s.resend = {
    domains: {
      list: async () => ({
        data: { data: [{ name: "cal.taxi", status: "verified" }] },
        error: null,
      }),
    },
    emails: {
      send: async (body, options) => {
        s.sent.push({ body, options });
        if (s.fail) throw new Error("ambiguous timeout");
        return { data: { id: "sent" }, error: null };
      },
    },
    contacts: {
      get: async () => ({ data: null, error: { name: "not_found" } }),
    },
  };
  return s;
}
const recipient = {
  email: "alex@example.com",
  first_name: "Alex",
  graduation_year: 2027,
};
test("each personal invitation uses connect sender, optional attribution and hashed database credentials", async () => {
  const s = fixture();
  await server.sendInvitations(
    "actor",
    { recipients: [recipient], include_name: false },
    true,
  );
  assert.equal(s.sent.length, 1);
  assert.equal(
    s.sent[0].body.from,
    "Nu Chapter of Theta Xi <connect@cal.taxi>",
  );
  assert.doesNotMatch(s.sent[0].body.text, /Nathan Dai/);
  assert.match(
    s.sent[0].body.text,
    /https:\/\/chapter.example.test\/connect\/invitation\/[\w-]{43}/,
  );
  const credential = s.sent[0].body.text.match(/invitation\/([\w-]{43})/)[1];
  assert.equal(
    s.commands[0].payload.recipients[0].token_hash,
    server.hash(credential),
  );
  assert.ok(!JSON.stringify(s.commands).includes(credential));
  assert.equal(
    s.commands[0].payload.recipients[0].defaults.graduation_year,
    2027,
  );
});
test("uncertain sending never sends another invitation on a repeated submission", async () => {
  const s = fixture();
  s.fail = true;
  assert.equal(
    (
      await server.sendInvitations(
        "actor",
        { recipients: [recipient], include_name: true },
        true,
      )
    ).ok,
    false,
  );
  await server.sendInvitations(
    "actor",
    { recipients: [recipient], include_name: true },
    true,
  );
  assert.equal(s.sent.length, 1);
});
test("replacement verification sends a code while storing only hashes and a secure challenge cookie", async () => {
  const s = fixture();
  await server.requestCode("school@example.com", "change", "A".repeat(43));
  const code = s.sent[0].body.text.match(/\b\d{6}\b/)[0];
  const credential = s.cookie[1];
  assert.equal(
    s.commands[0].payload.code_hash,
    server.hash(`${credential}:${code}`),
  );
  assert.ok(!JSON.stringify(s.commands).includes(code));
  assert.equal(s.cookie[2].httpOnly, true);
  assert.equal(s.cookie[2].sameSite, "lax");
  assert.equal(s.cookie[2].maxAge, 900);
});
test("existing provider opt-outs are retained without an invitation", async () => {
  const s = fixture();
  s.resend.contacts.get = async () => ({
    data: { unsubscribed: true },
    error: null,
  });
  const result = await server.sendInvitations(
    "actor",
    { recipients: [recipient], include_name: true },
    true,
  );
  assert.equal(result.ok, true);
  assert.equal(s.sent.length, 0);
});

test("invalid sender or restricted Contacts credentials fail before reserving any email", async () => {
  const s = fixture();
  s.resend.domains.list = async () => ({
    data: null,
    error: { name: "restricted_api_key" },
  });
  await assert.rejects(
    server.sendInvitations(
      "actor",
      { recipients: [recipient], include_name: true },
      true,
    ),
    /full-access/,
  );
  assert.equal(s.commands.length, 0);
  assert.equal(s.sent.length, 0);
  const c = fixture();
  c.resend.contacts.get = async () => ({
    data: null,
    error: { name: "restricted_api_key" },
  });
  await assert.rejects(
    server.sendInvitations(
      "actor",
      { recipients: [recipient], include_name: true },
      true,
    ),
    /No invitations were reserved/,
  );
  assert.equal(c.commands.length, 0);
  assert.equal(c.sent.length, 0);
});
test("existing subscribed Resend contacts are skipped and totals distinguish no-op from sending", async () => {
  const s = fixture();
  s.resend.contacts.get = async () => ({
    data: { unsubscribed: false },
    error: null,
  });
  const result = await server.sendInvitations(
    "actor",
    { recipients: [recipient], include_name: true },
    true,
  );
  assert.deepEqual(result.counts, {
    sent: 0,
    skipped: 1,
    notSent: 0,
    uncertain: 0,
  });
  assert.equal(s.sent.length, 0);
});
test("explicit provider rejections are confirmed not-sent, not uncertain", async () => {
  const s = fixture();
  s.resend.emails.send = async () => ({
    data: null,
    error: { name: "validation_error" },
  });
  const result = await server.sendInvitations(
    "actor",
    { recipients: [recipient], include_name: true },
    true,
  );
  assert.equal(result.counts.notSent, 1);
  assert.equal(result.counts.uncertain, 0);
});

test("provider 5xx failures stay uncertain and cannot become releasable unsent records",async()=>{const s=fixture();s.resend.emails.send=async()=>({data:null,error:{name:'application_error',statusCode:503}});const result=await server.sendInvitations('actor',{recipients:[recipient],include_name:true},true);assert.equal(result.counts.uncertain,1);assert.equal(result.counts.notSent,0);});

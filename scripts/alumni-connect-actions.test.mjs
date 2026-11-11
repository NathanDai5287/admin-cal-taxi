import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["app/connect/actions.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "isolated-acceptance",
      setup(b) {
        b.onResolve(
          { filter: /^(next\/headers|@\/lib\/alumni-connect\/server)$/ },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents:
            path === "next/headers"
              ? "export const cookies=async()=>({get:()=>undefined});"
              : `
      export const CODE_COOKIE='code',CONNECT_COOKIE='session';
      export const validToken=()=>true,token=()=> 'credential',hash=v=>v;
      export const command=async(name,payload)=>{globalThis.acceptTest.calls.push(name);if(globalThis.acceptTest.error)throw new Error(globalThis.acceptTest.error);return {email:payload.email,profile_id:'person'};};
      export const setSession=async()=>globalThis.acceptTest.calls.push('session');
      export const sendWelcome=async()=>{globalThis.acceptTest.calls.push('welcome');if(globalThis.acceptTest.welcomeFails)throw new Error('email unavailable');};
      export const db=()=>{},getConnectPerson=()=>{},requestCode=()=>{},sendInvitations=()=>{},provider=()=>{};
    `,
        }));
      },
    },
  ],
});
const actions = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
const input = {
  email: "alex@example.com",
  first_name: "Alex",
  last_name: "Brother",
  consent: true,
};

test("removed profiles receive an actionable non-success result without a session or welcome", async () => {
  const s = (globalThis.acceptTest = {
    calls: [],
    error: "Please contact the chapter to restore your access",
  });
  const result = await actions.acceptConnectInvitation("token", input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "profile_removed");
  assert.match(result.message, /access was removed/);
  assert.equal(result.redirect, undefined);
  assert.deepEqual(s.calls, ["accept"]);
});
test("accepted enrollment establishes a session and confirmation even if welcome email fails", async () => {
  const s = (globalThis.acceptTest = { calls: [], welcomeFails: true });
  const result = await actions.acceptConnectInvitation("token", input);
  assert.equal(result.ok, true);
  assert.equal(result.redirect, "/connect?joined=1");
  assert.deepEqual(s.calls, ["accept", "session", "welcome"]);
});

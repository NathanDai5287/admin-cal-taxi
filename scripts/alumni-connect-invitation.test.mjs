import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["app/connect/invitation/[token]/page.tsx"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  jsx: "automatic",
  plugins: [
    {
      name: "isolated-invitation",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^@\/lib\/alumni-connect\/server$|public-forms$|^next\/link$/,
          },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents:
            path === "next/link"
              ? "export default function Link(){}"
              : path.endsWith("public-forms")
                ? "export function AcceptanceForm(){};export function LoginForm(){};"
                : `
    export const loadInvitation=async()=>({id:'invitation',status:'accepted',email:'original@example.com'});
    export const getConnectPerson=async()=>globalThis.invitationTest.person;
    export const db=()=>({from:()=>{const q={select:()=>q,eq:(key,value)=>{globalThis.invitationTest.filters.push([key,value]);return q;},limit:()=>q,maybeSingle:async()=>globalThis.invitationTest.ownership};return q;}});
  `,
        }));
      },
    },
  ],
});
const { default: page } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
const render = () => page({ params: Promise.resolve({ token: "credential" }) });
test("cookie rerender of an accepted invitation keeps confirmation for its subscribed owner", async () => {
  const s = (globalThis.invitationTest = {
    person: { id: "owner", email: "replacement@example.com", subscribed: true },
    ownership: { data: { email: "original@example.com" }, error: null },
    filters: [],
  });
  const result = await render();
  assert.equal(result.type.name, "JoinedConfirmation");
  assert.equal(result.props.email, "replacement@example.com");
  assert.deepEqual(s.filters, [
    ["invitation_id", "invitation"],
    ["profile_id", "owner"],
  ]);
});
test("accepted invitations require sign-in or matching ownership before exposing confirmation", async () => {
  for (const person of [
    null,
    { id: "another-person", email: "another@example.com", subscribed: true },
  ]) {
    globalThis.invitationTest = {
      person,
      ownership: { data: null, error: null },
      filters: [],
    };
    const result = await render();
    assert.equal(result.type, "div");
    assert.equal(
      result.props.children[0].props.children,
      "Invitation unavailable",
    );
  }
});

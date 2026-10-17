import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const mocks = {
  react: "export const useState = value => [value, () => {}];",
  "react/jsx-runtime": "export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;",
  "@/lib/reimbursements/supabase/client": "export const createClient = () => globalThis.googleSignInClient;",
  "@/lib/reimbursements/supabase/cookie-options": "export const clearLegacyHostOnlyAuthCookies = () => {};",
};

const bundle = await build({
  entryPoints: ["components/auth/google-sign-in-button.tsx"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [{
    name: "google-sign-in",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path] }));
    },
  }],
});

const { GoogleSignInButton } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const cases = [
  {
    name: "member login card uses the approved callback address",
    page: "https://reimbursements.cal.taxi/login",
    next: "/",
    redirectTo: "https://reimbursements.cal.taxi/auth/callback",
  },
  {
    name: "member header uses the same approved callback address",
    page: "https://reimbursements.cal.taxi/login?error=auth",
    redirectTo: "https://reimbursements.cal.taxi/auth/callback",
  },
  {
    name: "local member sign-in preserves the port",
    page: "http://reimbursements.localhost:3000/login",
    redirectTo: "http://reimbursements.localhost:3000/auth/callback",
  },
  {
    name: "admin header preserves its current page and search",
    page: "https://admin.cal.taxi/finance?year=2026",
    redirectTo: "https://admin.cal.taxi/auth/callback?next=%2Ffinance%3Fyear%3D2026",
  },
  {
    name: "admin sign-in preserves an explicit return path",
    page: "https://admin.cal.taxi/reimbursements/login",
    next: "/reimbursements",
    redirectTo: "https://admin.cal.taxi/auth/callback?next=%2Freimbursements",
  },
];

for (const scenario of cases) {
  test(scenario.name, async (context) => {
    let request;
    const signInWithOAuth = async (options) => {
      request = options;
      return { error: null };
    };
    globalThis.window = { location: new URL(scenario.page) };
    globalThis.googleSignInClient = { auth: { signInWithOAuth } };
    context.after(() => {
      delete globalThis.window;
      delete globalThis.googleSignInClient;
    });
    const button = GoogleSignInButton({ next: scenario.next }).props.children[0];
    await button.props.onClick();
    assert.deepEqual(request, { provider: "google", options: { redirectTo: scenario.redirectTo } });
  });
}

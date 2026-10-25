import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const tracking = `
  export const recorded = { sent: [], failed: [] };
  export async function prepareTrackedEmail(body) { return { id: "message-1", body }; }
  export async function recordEmailProvider(id, providerId) { recorded.sent.push([id, providerId]); }
  export async function recordEmailFailure(id, error) { recorded.failed.push([id, error]); }
  export async function loadUnsentEmail() { return null; }
  export function trackingAddress(token) { return { origin: "https://admin.example.test", token, secret: "test" }; }
`;
const result = await build({
  stdin: { contents: 'export * from "./lib/email-send"; export { recorded } from "./lib/email-tracking";', resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "email-send-fixtures", setup(builder) {
    builder.onResolve({ filter: /email-tracking$/ }, () => ({ path: "tracking", namespace: "fixture" }));
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "tracking" ? tracking : "" }));
  } }],
});
const { sendTrackedEmail, recorded } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
process.env.RESEND_API_KEY = "test-only";
const body = { from: "Theta Xi <test@cal.taxi>", to: "member@example.test", subject: "Hello", text: "Hi", html: "<p>Hi</p>" };
const tracked = { key: "reimbursement/1/event", kind: "reimbursement", recipient: "member@example.test" };

function respond(responses) {
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init.headers["Idempotency-Key"]);
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    return Response.json(next.body, { status: next.status });
  };
  return calls;
}

test("a temporary failure retries with the same idempotency key", async () => {
  const calls = respond([{ status: 503, body: { message: "Busy" } }, { status: 200, body: { id: "provider-1" } }]);
  assert.deepEqual(await sendTrackedEmail(body, tracked), { sent: true });
  assert.deepEqual(calls, ["reimbursement/1/event", "reimbursement/1/event"]);
  assert.deepEqual(recorded.sent.at(-1), ["message-1", "provider-1"]);
});

test("a network error retries", async () => {
  const calls = respond([new TypeError("fetch failed"), { status: 200, body: { id: "provider-2" } }]);
  assert.deepEqual(await sendTrackedEmail(body, tracked), { sent: true });
  assert.equal(calls.length, 2);
});

test("a rejected email does not retry and records the failure", async () => {
  const calls = respond([{ status: 422, body: { message: "Invalid sender" } }]);
  assert.deepEqual(await sendTrackedEmail(body, tracked), { sent: false, messageId: "message-1", error: "Invalid sender" });
  assert.equal(calls.length, 1);
  assert.deepEqual(recorded.failed.at(-1), ["message-1", "Invalid sender"]);
});

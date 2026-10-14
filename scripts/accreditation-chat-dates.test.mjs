import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

import { resolveChatDates } from "../lib/accreditation/chat-dates.ts";
import { getPolicyClock } from "../lib/policy/tools.ts";

const clock = getPolicyClock(new Date("2026-10-14T19:00:00Z"), "America/Los_Angeles");
const originalQuestion = "if i submitted a fire permit tomorrow, oct 15 would it be in time for a party on oct 30 and another party on oct 31?";
const twoEvents = {
  event_dates: [{ date: "2026-10-30", quote: "oct 30" }, { date: "2026-10-31", quote: "oct 31" }],
  assumptions: ["The October dates refer to 2026."],
  clarification: null,
};
const languageReturning = (value) => ({ generateStructured: async () => value });

test("chat date resolution preserves multiple events and material assumptions", async () => {
  assert.deepEqual(await resolveChatDates(languageReturning(twoEvents), originalQuestion, [], clock), {
    dates: ["2026-10-30", "2026-10-31"], currentPoliciesOnly: false, assumptions: twoEvents.assumptions, clarification: null,
  });
});

test("unresolved, impossible, unquoted, or malformed dates stay conversational", async () => {
  for (const event_dates of [
    [{ date: "2026-02-30", quote: "next Friday" }],
    [{ date: "2026-10-16", quote: "a date the user never said" }],
  ]) {
    const resolved = await resolveChatDates(languageReturning({ ...twoEvents, event_dates }), "Event next Friday?", [], clock);
    assert.deepEqual(resolved.dates, [clock.local_date]);
    assert.match(resolved.clarification, /conditionally/);
  }
  const malformed = await resolveChatDates(languageReturning({ event_date: "bad" }), "Event next Friday?", [], clock);
  assert.deepEqual(malformed.dates, [clock.local_date]);
  assert.ok(malformed.clarification);
  const uncertain = await resolveChatDates(languageReturning({
    event_dates: [], assumptions: [], clarification: "Do you mean this Friday or the following Friday?",
  }), "Event Friday?", [], clock);
  assert.deepEqual(uncertain.dates, [clock.local_date]);
  assert.match(uncertain.clarification, /following Friday/);
});

test("ordinary policy questions use current policies without requiring a date", async () => {
  assert.deepEqual(await resolveChatDates(languageReturning({ event_dates: [], assumptions: [], clarification: null }), "What is the permit process?", [], clock), {
    dates: [clock.local_date], currentPoliciesOnly: true, assumptions: [], clarification: null,
  });
});

test("follow-ups keep timestamped history separate from the latest correction", async () => {
  const history = [{ question: "Event tomorrow?", answer: "For October 14...", askedAt: "2026-10-13T19:00:00Z", policyDate: "2026-10-14" }];
  const resolved = await resolveChatDates({ generateStructured: async (request) => {
    const input = JSON.parse(request.input);
    assert.deepEqual(input.history, history);
    assert.equal(input.latestMessage, "Actually, move it to Oct 31.");
    assert.deepEqual(input.currentDateTime, clock);
    assert.match(request.instructions, /askedAt timestamp/);
    assert.match(request.instructions, /supersede earlier dates/);
    return { event_dates: [{ date: "2026-10-31", quote: "Oct 31" }], assumptions: [], clarification: null };
  } }, "Actually, move it to Oct 31.", history, clock);
  assert.deepEqual(resolved.dates, ["2026-10-31"]);
  const priorReference = await resolveChatDates(languageReturning({
    event_dates: [{ date: "2026-10-14", quote: "tomorrow" }], assumptions: [], clarification: null,
  }), "Does that need a permit?", history, clock);
  assert.deepEqual(priorReference.dates, ["2026-10-14"]);
});

// Exercise the actual chat service while replacing database/auth/AI boundaries.
// No live records or AI calls are used by this regression suite.
const root = process.cwd();
const bundled = await build({
  stdin: {
    contents: 'export { runAccreditationChat } from "./lib/accreditation/chat-service"; export { state } from "chat-test-fixture";',
    resolveDir: root,
  },
  bundle: true, write: false, format: "esm", platform: "node", packages: "external",
  plugins: [{ name: "chat-boundaries", setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "empty" }));
    build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" }));
    build.onResolve({ filter: /^(?:chat-test-fixture|@\/lib\/(?:accreditation\/(?:providers|extract)|policy\/server|reimbursements\/auth))$/ }, () => ({ path: "fixture", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      export const state = { db: null, providers: null };
      export async function policyClient() { return state.db; }
      export function getAccreditationProviders() { return state.providers; }
      export async function requireAdmin() {}
      export async function extractSource() { throw new Error("Unexpected attachment extraction"); }
    ` }));
    build.onResolve({ filter: /^@\/lib\/policy\/tools$/ }, () => ({ path: "clock", namespace: "clock" }));
    build.onLoad({ filter: /.*/, namespace: "clock" }, () => ({
      contents: `export * from "./lib/policy/tools.ts";
        import { getPolicyClock as realClock } from "./lib/policy/tools.ts";
        export function getPolicyClock() { return realClock(new Date("2026-10-14T19:00:00Z"), "America/Los_Angeles"); }`,
      resolveDir: root,
    }));
  } }],
});
const output = path.join(root, "node_modules", `.accreditation-chat-dates-${process.pid}.mjs`);
await writeFile(output, bundled.outputFiles[0].text);
let runAccreditationChat, state;
try {
  ({ runAccreditationChat, state } = await import(pathToFileURL(output).href));
} finally {
  await unlink(output);
}

const sharedChunk = {
  source_type: "policy", source_id: "shared-policy", ordinal: 0,
  content: "Submit the event request before the event.",
  title: "Event requests", subtitle: "Published fixture", locator: { page: 1 },
};

function setupChat({ resolution = twoEvents, priorTurns = [], question = originalQuestion, reply, citations, chunksForDate = () => [sharedChunk] } = {}) {
  const searches = [], saves = [], requests = [];
  state.db = {
    from: () => ({
      select() { return this; }, eq() { return this; }, order() { return this; },
      async maybeSingle() { return { data: { id: "existing" }, error: null }; },
      async limit() { return { data: [...priorTurns].reverse(), error: null }; },
    }),
    rpc: async (name, args) => {
      if (name === "search_policy_and_accreditation_chunks") {
        searches.push(args);
        return { data: chunksForDate(args.p_date), error: null };
      }
      assert.equal(name, "save_accreditation_ask_turn");
      saves.push(args);
      return { data: [{ saved_chat_id: "chat", saved_title: question, saved_turn_id: "turn", saved_turn_number: 1, saved_updated_at: "2026-10-14T19:00:00Z" }], error: null };
    },
  };
  state.providers = {
    language: { generateStructured: async (request) => {
      requests.push(request);
      if (request.name === "accreditation_chat_intent") return { needs_policy: true, needs_source_catalog: false, search_query: "fire permit timing requirements" };
      if (request.name === "accreditation_chat_dates") return resolution;
      assert.equal(request.name, "accreditation_chat_answer");
      return { answer: reply ?? "Assuming October 2026, submit the request before both events.", citations: citations ?? [{ ref: "POL:shared-policy:0", quote: sharedChunk.content }] };
    } },
    embeddings: { profile: "fixture", embedQuery: async () => [1, 0] },
    ocr: null,
  };
  const form = new FormData();
  form.set("message", question);
  if (priorTurns.length) form.set("chatId", "11111111-1111-4111-8111-111111111111");
  return { form, searches, saves, requests };
}

test("the screenshot question retrieves both event dates, deduplicates sources, streams, and saves an answer", async () => {
  const { form, searches, saves, requests } = setupChat();
  const streamed = [];
  const result = await runAccreditationChat(form, { adminAuthorized: true, onTextDelta: (text) => streamed.push(text) });
  assert.equal(result.error, undefined);
  assert.equal(result.policyUsed, true);
  assert.deepEqual(searches.map((search) => search.p_date), ["2026-10-30", "2026-10-31"]);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].p_question, originalQuestion);
  assert.equal(result.sources.length, 1);
  assert.equal(streamed.join(""), result.answer);
  const answerRequest = requests.find((request) => request.name === "accreditation_chat_answer");
  const input = JSON.parse(answerRequest.input);
  assert.deepEqual(input.dateResolution.dates, ["2026-10-30", "2026-10-31"]);
  assert.deepEqual(input.dateResolution.assumptions, twoEvents.assumptions);
  assert.deepEqual(input.sources[0].policyDates, ["2026-10-30", "2026-10-31"]);
  assert.deepEqual(input.eventCalendars.map((calendar) => calendar.question_weekday), ["Friday", "Saturday"]);
});

test("date uncertainty produces a saved conversational answer instead of a red form error", async () => {
  const reply = "The request must be submitted before the event. Do you mean this Friday or the following Friday?";
  const { form, saves, requests, searches } = setupChat({
    question: "Can I submit for Friday?", reply,
    resolution: { event_dates: [], assumptions: [], clarification: "Do you mean this Friday or the following Friday?" },
  });
  const result = await runAccreditationChat(form, { adminAuthorized: true });
  assert.equal(result.error, undefined);
  assert.equal(result.answer, reply);
  assert.equal(saves.length, 1);
  assert.equal(searches[0].p_date, clock.local_date);
  const input = JSON.parse(requests.find((request) => request.name === "accreditation_chat_answer").input);
  assert.match(input.dateResolution.clarification, /following Friday/);
  assert.equal(input.dateResolution.currentPoliciesOnly, true);
  assert.deepEqual(input.eventCalendars, []);
});

test("multi-event retrieval preserves each policy version's date applicability", async () => {
  const { form, requests } = setupChat({ chunksForDate: (date) => [
    sharedChunk, { ...sharedChunk, source_id: `version-${date}`, title: `Version for ${date}` },
  ] });
  await runAccreditationChat(form, { adminAuthorized: true });
  const input = JSON.parse(requests.find((request) => request.name === "accreditation_chat_answer").input);
  assert.equal(input.sources.length, 3);
  assert.deepEqual(input.sources.find((source) => source.sourceId === "version-2026-10-30").policyDates, ["2026-10-30"]);
  assert.deepEqual(input.sources.find((source) => source.sourceId === "version-2026-10-31").policyDates, ["2026-10-31"]);
});

test("a corrected follow-up retrieves the new date and preserves prior-turn timestamps for interpretation", async () => {
  const { form, searches, requests } = setupChat({
    question: "Actually, make the party Oct 31.",
    resolution: { event_dates: [{ date: "2026-10-31", quote: "Oct 31" }], assumptions: [], clarification: null },
    priorTurns: [{ question: "Party tomorrow?", answer: "For October 14...", created_at: "2026-10-13T19:00:00Z", policy_date: "2026-10-14", attachment_names: [] }],
  });
  const result = await runAccreditationChat(form, { adminAuthorized: true });
  assert.equal(result.error, undefined);
  assert.deepEqual(searches.map((search) => search.p_date), ["2026-10-31"]);
  const input = JSON.parse(requests.find((request) => request.name === "accreditation_chat_dates").input);
  assert.equal(input.history[0].askedAt, "2026-10-13T19:00:00Z");
});

test("natural date assumptions retain the existing policy citation check", async () => {
  const { form } = setupChat({ citations: [{ ref: "POL:shared-policy:0", quote: "All permits are automatically approved." }] });
  const result = await runAccreditationChat(form, { adminAuthorized: true });
  assert.equal(result.error, undefined);
  assert.match(result.answer, /could not verify/);
  assert.deepEqual(result.sources, []);
});

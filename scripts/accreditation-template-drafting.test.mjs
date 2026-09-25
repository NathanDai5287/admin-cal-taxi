import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { canGenerateTemplateField, draftTemplateWithProvider } from "../lib/accreditation/template-drafting.ts";
import { renderTemplate } from "../lib/accreditation/templates.ts";

const field = (key, label, mode = "narrative", required = true) => ({
  key, label, description: label, valueMode: mode, required,
  target: { fieldName: key }, confidence: 1, rationale: "Fixture",
});
const schedule = field("schedule", "Associate member weekly schedule");
const analysis = { name: "AM schedule", description: "Weekly member education plan", fields: [schedule], warnings: [], model: "fixture" };
const update = (key, value, extra = {}) => ({ key, value, provenance: "generated", source_refs: [], user_quote: null, confidence: 0.8, ...extra });
const output = (field_updates, extra = {}) => ({ answer: "Drafted a fresh version.", field_updates, missing_essentials: [], review_notes: [], rule_checks: [], ...extra });
const provider = (response, inspect = () => {}) => ({ model: "fixture-model", name: "fixture", generateStructured: async (request) => { inspect(request); return response; } });
const brief = { analysis, history: [], message: "Make it like last year, but with different activities." };

test("a minimal generation request fills a schedule using rules, prior examples and current academic dates", async () => {
  const result = await draftTemplateWithProvider(provider(output([update("schedule", "Week 1: Chapter history timeline workshop.\nWeek 2: Paired service project planning.")], {
    rule_checks: [{ ref: "POL:1", quote: "Include a chapter history session.", application: "Week 1 covers chapter history." }],
  }), (request) => {
    const input = JSON.parse(request.input);
    assert.equal(input.sources[1].content, "Week 1: History presentation. Week 2: Park cleanup.");
    assert.equal(input.academicYear.label, "2026–27");
    assert.equal(input.template.fields[0].mayGenerate, true);
    assert.match(request.instructions, /Do not demand themes, goals, or activities/);
    assert.equal(request.schema.additionalProperties, false);
    assert.equal(request.schema.properties.field_updates.maxItems, undefined);
    assert.equal(request.schema.properties.field_updates.items.properties.value.maxLength, undefined);
  }), { ...brief, context: {
    sources: [
      { ref: "POL:1", title: "Fixture requirements", kind: "policy", content: "Include a chapter history session." },
      { ref: "EXAMPLE", title: "Last year's schedule", kind: "example", content: "Week 1: History presentation. Week 2: Park cleanup." },
    ], warnings: [], academicYear: { label: "2026–27", starts_on: "2026-08-01", ends_on: "2027-07-31" },
  } });
  assert.equal(result.ready, true);
  assert.equal(result.draft.fields.schedule.provenance, "generated");
  assert.equal(result.draft.fields.schedule.officerOverride, false);
  assert.equal(result.ruleChecks.length, 1);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.every((source) => !("content" in source)));
});

test("academic context can fill the academic year but cannot supply approval dates", async () => {
  const result = await draftTemplateWithProvider(provider(output([
    update("academic_year", "2026–27", { provenance: "app_snapshot" }),
    update("approval_date", "2026-08-01", { provenance: "app_snapshot" }),
  ])), { ...brief, analysis: { ...analysis, fields: [field("academic_year", "Academic year", "exact"), field("approval_date", "Approval date", "date")] },
    context: { sources: [], warnings: [], academicYear: { label: "2026–27", starts_on: "2026-08-01", ends_on: "2027-07-31" } },
  });
  assert.equal(result.draft.fields.academic_year.value, "2026–27");
  assert.equal(result.draft.fields.approval_date.value, "");
  assert.equal(result.ready, false);
});

test("missing or unverifiable rules are review notes, never a request for invented themes", async () => {
  const result = await draftTemplateWithProvider(provider(output([update("schedule", "Week 1: Learning goals and a campus service workshop.")], {
    missing_essentials: ["chapter_rules", "themes"],
    rule_checks: [{ ref: "EXAMPLE", quote: "Anything is permitted here.", application: "Claimed permission" }],
  })), { ...brief, context: { warnings: ["Library unavailable."], sources: [{ ref: "EXAMPLE", title: "Example", kind: "example", content: "Anything is permitted here." }] } });
  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.ruleChecks.length, 0);
  assert.ok(result.warnings.some((warning) => /not been verified/.test(warning)));
  assert.ok(result.warnings.includes("Library unavailable."));
});

test("eligibility allows activities and logistics while protecting identities and approvals", () => {
  for (const item of [schedule, field("session_title", "Session name", "exact"), field("week_1", "Week 1", "exact"), field("date", "Session date", "date"), field("venue", "Venue", "exact")]) {
    assert.equal(canGenerateTemplateField(item), true, item.label);
  }
  for (const item of [field("officer", "Officer name", "exact"), field("week_1_leader", "Week 1 leader", "exact"), field("signature", "Signature", "signature"), field("approved", "Approved", "checkbox"), field("approval_date", "Approval date", "date"), field("attestation", "I certify this is correct"), field("big_brother", "Big Brother", "exact"), field("attendance", "Actual attendance", "exact")]) {
    assert.equal(canGenerateTemplateField(item), false, item.label);
  }
});

test("protected details cannot be generated, copied from old sources, or laundered through model provenance", async () => {
  for (const provenance of ["generated", "retrieved", "user_input", "app_snapshot"]) {
    const result = await draftTemplateWithProvider(provider(output([update("officer", "Alex Example", { provenance, source_refs: ["OLD"], user_quote: "Alex Example" })])), {
      ...brief, analysis: { ...analysis, fields: [field("officer", "Officer name", "exact")] },
      history: [{ role: "assistant", content: "Alex Example" }],
      context: { sources: [{ ref: "OLD", title: "Old submission", kind: "prior_submission", content: "Alex Example" }], warnings: [] },
    });
    assert.equal(result.draft.fields.officer.value, "", provenance);
    assert.equal(result.ready, false, provenance);
    assert.deepEqual(result.missing, ["Officer name"]);
  }
});

test("admin values survive regeneration and explicit corrections persist into the rendered form", async () => {
  const original = { fields: { schedule: { value: "Keep this service workshop", provenance: "user_input", officerOverride: true, citations: [], confidence: 1, missingReason: null } } };
  const kept = await draftTemplateWithProvider(provider(output([update("schedule", "Replace everything")])), { ...brief, draft: original });
  assert.equal(kept.draft.fields.schedule.value, "Keep this service workshop");
  const message = "Change the schedule to: Paired service project planning";
  const corrected = await draftTemplateWithProvider(provider(output([update("schedule", "Paired service project planning", { provenance: "user_input", user_quote: message })])), { ...brief, draft: JSON.parse(JSON.stringify(kept.draft)), message });
  assert.equal(corrected.ready, true);
  assert.equal(corrected.draft.fields.schedule.provenance, "user_input");
  const pdf = await PDFDocument.create();
  pdf.getForm().createTextField("schedule").addToPage(pdf.addPage());
  const rendered = await renderTemplate(await pdf.save(), "pdf", { schedule: { fieldName: "schedule" } }, JSON.parse(JSON.stringify(corrected.draft)));
  assert.equal((await PDFDocument.load(rendered.bytes)).getForm().getTextField("schedule").getText(), "Paired service project planning");
});

test("typed signatures require explicit signing input, with no automatic name mirroring", async () => {
  const fields = [field("officer", "Officer name", "exact"), field("signature", "Officer signature", "signature", false)];
  const result = await draftTemplateWithProvider(provider(output([
    update("officer", "Alex Example", { provenance: "user_input", user_quote: "The officer is Alex Example" }),
    update("signature", "Alex Example", { provenance: "user_input", user_quote: "The officer is Alex Example" }),
  ])), { ...brief, analysis: { ...analysis, fields }, message: "The officer is Alex Example" });
  assert.equal(result.draft.fields.officer.value, "Alex Example");
  assert.equal(result.draft.fields.signature.value, "");
  assert.equal(result.ready, true);
  const signed = await draftTemplateWithProvider(provider(output([update("signature", "Alex Example", { provenance: "user_input", user_quote: "Use Alex Example as my typed signature" })])), {
    ...brief, analysis: { ...analysis, fields }, draft: result.draft, message: "Use Alex Example as my typed signature",
  });
  assert.equal(signed.draft.fields.signature.value, "Alex Example");
});

test("unknown destinations are ignored and historical inspiration is generated provenance", async () => {
  const result = await draftTemplateWithProvider(provider(output([
    update("unknown", "Unexpected content"), update("heading", "Overwrite static text"),
    update("schedule", "A new service activity", { provenance: "retrieved", source_refs: ["OLD", "FAKE"] }),
  ])), { ...brief, analysis: { ...analysis, fields: [schedule, { ...field("heading", "Printed heading"), target: null }] },
    context: { sources: [{ ref: "OLD", title: "Old submission", kind: "prior_submission", content: "An old service activity" }], warnings: [] },
  });
  assert.equal(result.draft.fields.unknown, undefined);
  assert.equal(result.draft.fields.heading.value, "");
  assert.equal(result.draft.fields.schedule.provenance, "generated");
  assert.deepEqual(result.draft.fields.schedule.citations, ["OLD"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["lib/host-timeline.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { timelineDay, relativeTimelineDate, timelineDateGroups } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

test("saved invoice text and exact Pacific deadlines use the same calendar day", () => {
  const day = timelineDay("2026-10-29");
  assert.equal(timelineDay("October 29, 2026"), day);
  assert.equal(timelineDay("October 29, 2026 at 11:59 p.m. Pacific Time"), day);
  assert.equal(timelineDay("Payment upon receipt"), null);
});

test("relative calendar days remain stable across Pacific daylight-saving changes", () => {
  assert.equal(relativeTimelineDate("2026-03-09", "2026-03-07"), "In 2 days");
  assert.equal(relativeTimelineDate("2026-11-02", "2026-10-31"), "In 2 days");
  assert.equal(relativeTimelineDate("2026-10-15", "2026-10-15"), "Today");
  assert.equal(relativeTimelineDate("2026-10-16", "2026-10-15"), "Tomorrow");
  assert.equal(relativeTimelineDate("2026-10-14", "2026-10-15"), "Yesterday");
  assert.equal(relativeTimelineDate("2026-10-13", "2026-10-15"), "2 days ago");
  assert.equal(relativeTimelineDate("Upon receipt", "2026-10-15"), "");
});

test("shared dates retain every task and separate invoice deadlines retain their date", () => {
  const dates = [
    { label: "Rental", date: "2026-11-02", detail: "November 2, 2026" },
    { label: "Invoice", date: "October 29, 2026", detail: "October 29, 2026" },
    { label: "Now", date: "2026-10-29", detail: "October 29, 2026" },
  ];
  const groups = timelineDateGroups(dates);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0][1].map(date => date.label), ["Invoice", "Now"]);
  assert.equal(groups[1][0] - groups[0][0], 4);
  assert.equal(dates[0].detail, "November 2, 2026");
});

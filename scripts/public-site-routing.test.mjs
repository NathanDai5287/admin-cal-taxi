import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { publicSitePath } from "../lib/public-site-routing.ts";

test("public routes map to their internal pages", () => {
  assert.equal(publicSitePath("/"), "/public-site");
  assert.equal(publicSitePath("/events"), "/public-site/events");
  assert.equal(publicSitePath("/host"), "/public-site/host");
  assert.equal(publicSitePath("/rush"), "/public-site/rush");
});

test("host presents distinct placeholders for both venue spaces", async () => {
  const source = await readFile(
    new URL("../app/(public)/public-site/host/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, />Backyard venue</);
  assert.match(source, />Indoor venue</);
  assert.equal(source.match(/Backyard (lead )?photograph/g)?.length, 4);
  assert.equal(source.match(/Indoor (lead )?photograph/g)?.length, 4);
});

test("horizontal navigation cannot scroll vertically", async () => {
  const [publicStyles, appNav] = await Promise.all([
    readFile(new URL("../app/(public)/public-site/public-site.css", import.meta.url), "utf8"),
    readFile(new URL("../components/brand/app-nav.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(publicStyles, /\.public-nav\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s);
  assert.equal(appNav.match(/overflow-x-auto overflow-y-hidden/g)?.length, 2);
  assert.doesNotMatch(appNav, /-mb-px/);
});

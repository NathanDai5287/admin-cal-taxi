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

test("host shows both venue spaces without placeholder bookkeeping", async () => {
  const source = await readFile(
    new URL("../app/(public)/public-site/host/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, />Backyard venue</);
  assert.match(source, />Indoor venue</);
  assert.equal(source.match(/photograph \d/gi), null);
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

test("rush career logos link to distinct company websites", async () => {
  const [rushPage, logoGrid] = await Promise.all([
    readFile(
      new URL("../app/(public)/public-site/rush/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/public/logo-grid.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  const websites = Array.from(
    rushPage.matchAll(/href: "(https:\/\/[^\"]+)"/g),
    ([, website]) => website,
  );

  assert.equal(websites.length, 21);
  assert.equal(new Set(websites).size, 21);
  assert.match(logoGrid, /href=\{item\.href\}/);
  assert.match(logoGrid, /target="_blank"/);
  assert.doesNotMatch(logoGrid, /Visit site/);
});

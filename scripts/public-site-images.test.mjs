import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const publicApp = new URL("../app/(public)/", import.meta.url);
const publicComponents = new URL("../components/public/", import.meta.url);
const routeFiles = {
  "/": new URL("../app/(public)/public-site/page.tsx", import.meta.url),
  "/rush": new URL("../app/(public)/public-site/rush/page.tsx", import.meta.url),
  "/events": new URL("../app/(public)/public-site/events/page.tsx", import.meta.url),
  "/host": new URL("../app/(public)/public-site/host/page.tsx", import.meta.url),
};

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const location = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return sourceFiles(location);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [location] : [];
  }));
  return nestedFiles.flat();
}

test("each supplied photograph has one public content placement", async () => {
  const provenance = JSON.parse(await readFile(
    new URL("../public/site/image-provenance.json", import.meta.url),
    "utf8",
  ));
  const files = await Promise.all([sourceFiles(publicApp), sourceFiles(publicComponents)]);
  const publicSource = (await Promise.all(files.flat().map((file) => readFile(file, "utf8")))).join("\n");

  assert.equal(provenance.length, 14);
  assert.equal(new Set(provenance.map(({ source }) => source)).size, 14);
  assert.equal(new Set(provenance.map(({ asset }) => asset)).size, 14);

  for (const { asset, route, sourceSha256 } of provenance) {
    assert.match(sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(publicSource.split(`@/public/site/${asset}`).length - 1, 1, asset);

    const routeSource = await readFile(routeFiles[route], "utf8");
    const assetPattern = asset.replaceAll(".", "\\.");
    const importMatch = routeSource.match(new RegExp(`import (\\w+) from "@/public/site/${assetPattern}"`));
    assert.ok(importMatch, `${asset} must be imported by ${route}`);
    assert.equal(routeSource.split(`src={${importMatch[1]}}`).length - 1, 1, asset);
  }
});

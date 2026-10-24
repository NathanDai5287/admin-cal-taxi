import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["lib/route-access.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { routeAccess } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

async function files(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => `${entry.parentPath}/${entry.name}`);
}

function urlPath(file) {
  const segments = file.replace(/^app\//, "").split("/").slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/^\[+\.*([^\]]+)\]+$/, "sample"));
  return `/${segments.join("/")}`;
}

test("every page and route is in the route registry", async () => {
  const routes = (await files("app")).filter((file) => /\/(page|route)\.tsx?$/.test(file));
  assert.ok(routes.length > 50);
  for (const route of routes) assert.ok(routeAccess(urlPath(route)), `${route} is not in the route registry`);
});

test("unknown and private paths are not public", () => {
  assert.equal(routeAccess("/unknown"), undefined);
  assert.deepEqual(routeAccess("/finance/planning"), ["finance"]);
  assert.deepEqual(routeAccess("/api/accreditation/ask/stream"), ["ask-policy"]);
  assert.equal(routeAccess("/"), "signed-in");
  assert.equal(routeAccess("/demo"), "public");
});

const MASTER_KEY_FILES = new Set(["lib/reimbursements/supabase/admin.ts", "lib/mcp/server.ts", "lib/venue-inquiries.ts"]);

test("only the master key folder makes clients with the master key", async () => {
  for (const file of (await files("app")).concat(await files("lib"), await files("components"))) {
    if (!/\.tsx?$/.test(file) || MASTER_KEY_FILES.has(file)) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /SUPABASE_SECRET_KEY/, `${file} reads the master key`);
    assert.doesNotMatch(source, /import \{[^}]*\bcreateClient\b[^}]*\} from "@supabase\/supabase-js"/, `${file} makes its own Supabase client`);
  }
});

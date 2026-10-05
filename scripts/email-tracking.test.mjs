import assert from "node:assert/strict";
import test from "node:test";
import { trackEmailBody, trackedLink, validTrackedLink } from "../lib/email-tracking-links.ts";

const address = { origin: "https://admin.example.test", token: "random-message-token", secret: "test-secret" };
const destination = "https://example.test/sign?recipient=one&code=secret";

test("tracks every HTML link and plain text URL while preserving other links", () => {
  const result = trackEmailBody({ html: `<a href="${destination.replaceAll("&", "&amp;")}">Sign</a><a href='https://example.test/two'>Two</a><a href=https://example.test/three>Three</a><a href="mailto:host@example.test">Email</a>`, text: `Sign: ${destination}\nOther: https://example.test/two.` }, address);
  assert.equal((result.html.match(/\/click\?/g) || []).length, 3);
  assert.match(result.html, /href="mailto:host@example.test"/);
  assert.match(result.html, /width="1" height="1"/);
  const htmlLink = result.html.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&");
  const query = new URL(htmlLink).searchParams;
  assert.equal(query.get("url"), destination);
  assert.equal(validTrackedLink(address, destination, query.get("signature")), true);
  assert.equal((result.text.match(/\/click\?/g) || []).length, 2);
  assert.ok(result.text.endsWith("."));
});

test("signed links reject changed destinations, tokens, signatures, and unsafe schemes", () => {
  const query = new URL(trackedLink(address, destination)).searchParams;
  const signature = query.get("signature");
  assert.equal(validTrackedLink(address, destination + "changed", signature), false);
  assert.equal(validTrackedLink({ ...address, token: "another" }, destination, signature), false);
  assert.equal(validTrackedLink(address, destination, "invalid"), false);
  assert.equal(validTrackedLink(address, "javascript:alert(1)", signature), false);
});

test("retries retain identical tracked bodies and append the pixel inside the body", () => {
  const body = { html: `<html><body><a href="${destination}">Sign</a></body></html>`, text: destination };
  assert.deepEqual(trackEmailBody(body, address), trackEmailBody(body, address));
  assert.match(trackEmailBody(body, address).html, /<img[^>]+\/><\/body>/);
  assert.equal(body.text, destination);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { build } from "esbuild";
import { PDFDocument, PDFName } from "pdf-lib";

const run = promisify(execFile);
const result = await build({
  stdin: { contents: 'export * from "./lib/nu-news/pdf.ts"; export * from "./lib/nu-news/issue.ts"; export * from "./lib/nu-news/crop-warnings.ts";', resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node", packages: "external",
});
const temporary = path.join(process.cwd(), "node_modules/.nu-news-test.mjs");
await writeFile(temporary, result.outputFiles[0].text);
const { renderNuNewsPdf, newsletterInput, photoSources, canPreview, missingItems, cropWarnings, croppedShare, DEFAULT_DONATE } = await import(`file://${temporary.replaceAll("\\", "/")}`);
await unlink(temporary);

// Fall 2026 issue with fictional contact lines. Photos are flat shapes with the real photos' sizes.
const fixtureDir = "scripts/fixtures/nu-news";
const issue = JSON.parse(await readFile(path.join(fixtureDir, "issue.json"), "utf8"));
const photos = new Map(await Promise.all(photoSources(issue).map(async (src) => [src, await readFile(path.join(fixtureDir, src))])));
const { pdf, placements } = renderNuNewsPdf(issue, photos, "final");

const squash = (text) => text.replace(/[\s­]/g, "");
const withoutFooter = (text) => text.replace("Nu News · FALL 2026", "").replace(/\d+\s*$/, "");

async function pageTexts(bytes, options = []) {
  const directory = await mkdtemp(path.join(tmpdir(), "nu-news-text-"));
  try {
    await writeFile(path.join(directory, "issue.pdf"), bytes);
    const { stdout } = await run("pdftotext", ["-enc", "UTF-8", ...options, path.join(directory, "issue.pdf"), "-"]);
    return stdout.split("\f").slice(0, -1);
  } finally {
    await rm(directory, { recursive: true });
  }
}

async function links(bytes) {
  const document = await PDFDocument.load(bytes);
  const pageRefs = document.getPages().map((page) => page.ref);
  return document.getPages().flatMap((page, pageIndex) => (page.node.lookup(PDFName.of("Annots"))?.asArray() ?? []).map((ref) => {
    const annotation = document.context.lookup(ref);
    const destination = annotation.lookup(PDFName.of("Dest"));
    return {
      pageIndex,
      uri: annotation.lookup(PDFName.of("A"))?.lookup(PDFName.of("URI"))?.decodeText(),
      targetPage: destination && pageRefs.indexOf(destination.get(0)),
    };
  }));
}

const texts = await pageTexts(pdf);
const pageWith = (needle, from = 1) => texts.findIndex((text, index) => index >= from && squash(text).includes(squash(needle)));

test("the same issue always gives the same PDF bytes", () => {
  assert.ok(pdf.equals(renderNuNewsPdf(issue, photos, "final").pdf));
});

test("pages follow the approved order: cover, articles, donate, gallery", async () => {
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getTitle(), "Nu News · Fall 2026");
  assert.deepEqual(document.getPage(0).getSize(), { width: 612, height: 792 });
  assert.match(texts[0], /In This Issue/);
  assert.match(texts[0], /OCTOBER 14, 2026/);

  const articlePages = issue.articles.map((article) => pageWith(article.title));
  const donatePage = pageWith(issue.donate.heading);
  const galleryPage = pageWith("Photo Gallery");
  assert.equal(articlePages[0], 1);
  assert.ok(articlePages.every((page, index) => index === 0 || page > articlePages[index - 1]));
  assert.ok(donatePage > articlePages.at(-1));
  assert.equal(galleryPage, donatePage + 1);
  assert.ok(document.getPageCount() > galleryPage);

  const contents = (await links(pdf)).filter((link) => link.pageIndex === 0 && link.targetPage !== undefined);
  assert.deepEqual(contents.map((link) => link.targetPage), [...articlePages, donatePage, galleryPage]);
});

test("addresses in the text and the Zelle code become links", async () => {
  const uris = new Set((await links(pdf)).map((link) => link.uri).filter(Boolean));
  const zelle = (await readFile("lib/nu-news/assets/zelle-qr-payload.txt", "utf8")).trim();
  for (const uri of [zelle, "https://ThetaXi.org", "mailto:calthetaxi@gmail.com", "mailto:NAM_Pres@comcast.net", "mailto:alex@example.edu", "mailto:casey@example.edu", "https://www.example.org", "mailto:editor@example.edu"]) {
    assert.ok(uris.has(uri), `missing link ${uri}`);
  }
});

test("every author's words appear exactly as written", () => {
  const printed = squash(texts.slice(1).map(withoutFooter).join(""));
  const written = issue.articles.flatMap((article) => [article.title, article.author, article.roster, ...`${article.body}\n${article.closing}`.split("\n")]);
  for (const words of [...written, issue.intro.heading, ...issue.intro.body.split("\n"), ...issue.donate.body.split("\n")]) {
    assert.ok(printed.includes(squash(words)) || squash(texts[0]).includes(squash(words)), `missing text: ${words.slice(0, 60)}`);
  }
});

test("Typst markup in author text prints as plain text", async () => {
  const markup = [
    "#pagebreak() #set text(red) $x^2$ *not bold* _not italic_ [not content] <not-a-label> @not-a-reference",
    "= Not a heading",
    "- not a list + not a list / not: a term",
    "`not raw` \\ not a break // not a comment \"straight quotes\" -- ... ~",
  ];
  const [first, ...rest] = issue.articles;
  const marked = {
    ...issue,
    intro: { ...issue.intro, heading: "#strong[Intro] $y$" },
    articles: [{ ...first, title: "#emph[Title] *x*", body: `${markup.join("\n")}\n${first.body}` }, ...rest],
  };
  const printed = squash((await pageTexts(renderNuNewsPdf(marked, photos, "final").pdf)).join(""));
  for (const words of [...markup, "#strong[Intro] $y$", "#emph[Title] *x*"]) {
    assert.ok(printed.includes(squash(words)), `not literal: ${words}`);
  }
});

test("a preview has a DRAFT mark on every page and the final PDF has none", async () => {
  const includeRotatedText = ["-raw"];
  const previewTexts = await pageTexts(renderNuNewsPdf(issue, photos, "draft").pdf, includeRotatedText);
  const finalTexts = await pageTexts(pdf, includeRotatedText);
  assert.equal(previewTexts.length, finalTexts.length);
  assert.ok(previewTexts.every((text) => text.includes("DRAFT")));
  assert.ok(finalTexts.every((text) => !text.includes("DRAFT")));
});

test("a typst CLI build of the same input has the same pages and text", async (t) => {
  const hasTypst = await run("typst", ["--version"]).then(() => true, () => false);
  if (!hasTypst) return t.skip("typst CLI is not installed");
  const workspace = await mkdtemp(path.join(tmpdir(), "nu-news-cli-"));
  t.after(() => rm(workspace, { recursive: true }));
  await cp("lib/nu-news", workspace, { recursive: true });
  for (const [src, bytes] of photos) {
    await mkdir(path.dirname(path.join(workspace, src)), { recursive: true });
    await writeFile(path.join(workspace, src), bytes);
  }
  const { content, data } = newsletterInput(issue);
  await run("typst", [
    "compile", "--root", workspace, "--font-path", path.join(workspace, "fonts"), "--ignore-system-fonts",
    "--input", `content=${JSON.stringify(content)}`, "--input", `data=${JSON.stringify(data)}`, "--input", "draft=false",
    path.join(workspace, "nunews.typ"), path.join(workspace, "cli.pdf"),
  ]);
  assert.deepEqual(await pageTexts(await readFile(path.join(workspace, "cli.pdf"))), texts);
});

test("editor text becomes template paragraphs", () => {
  const draft = { ...issue, intro: { heading: "Hi", body: "  First line  \n\n\nSecond line\n" } };
  const { content, data } = newsletterInput(draft);
  assert.deepEqual(content.intro.paragraphs, ["First line", "Second line"]);
  assert.equal(content.issue.date, "October 14, 2026");
  assert.deepEqual(data.headshots[issue.articles[0].id], issue.articles[0].headshot);
  assert.deepEqual(content.donate.items, DEFAULT_DONATE.body.split("\n"));
});

test("the check lists what is missing in plain words", () => {
  assert.deepEqual(missingItems(issue), []);
  assert.equal(canPreview(issue), true);
  const [first, second] = issue.articles;
  const unfinished = {
    ...issue,
    cover: null,
    intro: { heading: " ", body: "" },
    articles: [{ ...first, headshot: null, body: "\n" }, { ...second, author: "", title: "" }],
    donate: { ...issue.donate, body: "" },
  };
  assert.deepEqual(missingItems(unfinished), [
    "No title photo", "No intro heading", "No intro text",
    "Alex Rivera has no headshot", "Alex Rivera has no text",
    "Article 2 has no author", "Article 2 has no title",
    "No donation text",
  ]);
  assert.equal(canPreview(unfinished), false);
  assert.deepEqual(missingItems({ ...issue, articles: [] }), ["No articles"]);
});

test("focus points reach the template and move the crop", () => {
  const { data } = newsletterInput(issue);
  assert.deepEqual(data.cover, { src: "photos/cover.jpg", focus: [0.5, 0.42] });
  assert.deepEqual(data.headshots[issue.articles[2].id], issue.articles[2].headshot);
  assert.deepEqual(data.gallery[3].focus, [0.5, 0.6]);
  const coverAt = (focus) => renderNuNewsPdf({ ...issue, cover: { ...issue.cover, focus } }, photos, "final").pdf;
  assert.ok(!coverAt([0.5, 0]).equals(coverAt([0.5, 1])));
});

test("photos that lose more than 30% of a side get a plain warning", () => {
  assert.equal(Math.round(croppedShare({ width: 72, height: 72, aspect: 240 / 428 }).share * 100), 44);
  assert.equal(croppedShare({ width: 72, height: 72, aspect: 240 / 428 }).dimension, "height");
  assert.equal(croppedShare({ width: 70, height: 100, aspect: 1 }).dimension, "width");

  const warnings = cropWarnings(issue, placements);
  assert.deepEqual(warnings.map((warning) => warning.src), ["photos/cover.jpg", issue.articles[2].headshot.src]);
  assert.match(warnings[0].text, /^The title photo loses \d+% of its height\. Set its focus point or use a wider photo\.$/);
  assert.equal(warnings[1].text, "Sam Patel’s headshot loses 44% of its height. Set its focus point or use a wider photo.");
  assert.deepEqual(cropWarnings(issue, [{ src: "photos/gallery-20.svg", width: 70, height: 100, aspect: 1 }]), []);
  assert.deepEqual(cropWarnings(issue, [{ src: "photos/gallery-20.svg", width: 69, height: 100, aspect: 1 }]).map((warning) => warning.text), [
    "The donate page photo loses 31% of its width. Set its focus point or use a taller photo.",
  ]);
  assert.deepEqual(missingItems(issue), [], "warnings never block finalizing");
});

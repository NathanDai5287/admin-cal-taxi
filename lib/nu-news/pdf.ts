import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NodeCompiler, PdfStandard } from "@myriaddreamin/typst-ts-node-compiler";

import { formatDateISO } from "@/lib/host-format";

import type { NuNewsIssue } from "./issue";

const paragraphs = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

export function newsletterInput(issue: NuNewsIssue) {
  const content = {
    issue: {
      season: issue.season,
      date: formatDateISO(issue.issue_date),
      location: issue.location,
      chapter: "Theta Xi, Nu Chapter",
    },
    intro: { heading: issue.intro.heading, paragraphs: paragraphs(issue.intro.body) },
    articles: issue.articles.map((article) => ({
      slug: article.id,
      title: article.title,
      author: article.author,
      roster: article.roster,
      paragraphs: paragraphs(article.body),
      closing: paragraphs(article.closing),
    })),
    donate: { heading: issue.donate.heading, items: paragraphs(issue.donate.body) },
  };
  const data = {
    logo: "assets/unicorn-shield.png",
    cover: { src: issue.cover_src },
    headshots: Object.fromEntries(issue.articles.map((article) => [article.id, { src: article.headshot }])),
    zelle: { qr: "assets/zelle-qr.svg", payload: "assets/zelle-qr-payload.txt" },
    gallery: issue.gallery,
  };
  return { content, data };
}

export function renderNuNewsPdf(issue: NuNewsIssue, photosBySrc: Map<string, Buffer>, mark: "draft" | "final") {
  const templateDir = path.join(process.cwd(), "lib/nu-news");
  const fontDir = path.join(templateDir, "fonts");
  const fontBlobs = readdirSync(fontDir).filter((name) => name.endsWith(".ttf")).map((name) => readFileSync(path.join(fontDir, name)));
  const compiler = NodeCompiler.create({ workspace: templateDir, fontArgs: [{ fontBlobs }] });
  for (const [src, bytes] of photosBySrc) compiler.mapShadow(path.join(templateDir, src), bytes);

  const { content, data } = newsletterInput(issue);
  return compiler.pdf(
    { mainFilePath: path.join(templateDir, "nunews.typ"), inputs: { content: JSON.stringify(content), data: JSON.stringify(data), draft: String(mark === "draft") } },
    { pdfStandard: PdfStandard.V_1_7, pdfTags: true },
  );
}

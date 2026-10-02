/** Loopback-only UI preview. Never loads .env files or starts Next/server actions. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "scripts/host-preview");
const output = await mkdtemp(path.join(os.tmpdir(), "host-flow-preview-"));
const port = Number(process.env.HOST_PREVIEW_PORT || 4176);
const result = await build({ entryPoints: [path.join(source, "entry.tsx")], outfile: path.join(output, "app.js"), bundle: true, jsx: "automatic", metafile: true,
  alias: { "@": root, "next/link": path.join(source, "link.tsx"), "next/image": path.join(source, "image.tsx"), "next/navigation": path.join(source, "navigation.tsx"), "next/dist/client/components/router-reducer/router-reducer-types": path.join(source, "prefetch.ts") },
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "local-actions-only", setup(build) {
    build.onResolve({ filter: /(^|\/)actions$/ }, () => ({ path: path.join(source, "orders-actions.ts") }));
    build.onResolve({ filter: /\/signing-actions$/ }, () => ({ path: path.join(source, "signing-actions.ts") }));
    build.onResolve({ filter: /^(server-only|@supabase\/|next\/headers|next\/cache)/ }, args => ({ errors: [{ text: `Production-only dependency blocked: ${args.path}` }] }));
  } }],
});
if (Object.keys(result.metafile.inputs).some(name => /host-backend|reimbursements\/auth|supabase\//.test(name))) throw new Error("Production dependency found in preview bundle.");
const css = await postcss([tailwind({ base: root })]).process(await readFile(path.join(root, "app/globals.css"), "utf8"), { from: path.join(root, "app/globals.css") });
await writeFile(path.join(output, "styles.css"), css.css);
await writeFile(path.join(output, "taxi-icon.png"), await readFile(path.join(root, "public/taxi-icon.png")));
await writeFile(path.join(output, "index.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Host: local preview</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
let page = pdf.addPage([612, 792]);
for (const [index, text] of ["LOCAL PREVIEW: illustrative contract PDF", "No live order or signing request is connected.", "Oct 16, 2026 event: rental fee $1,400; deposit $300.", "Deposit due Oct 9; rental fee due Oct 18.", "Theta Xi chapter signature: preserved when auto-sign is enabled.", "Production uses the approved generator PDF, not this sample."].entries()) page.drawText(text, { x: 45, y: 730 - index * 30, size: 12, font });
for (const name of ["Alex Rivera", "Jordan Chen", "Sam Patel", "Casey Morgan", "Taylor Lee"]) {
  page = pdf.addPage([612, 792]); page.drawText(`Representative: ${name}`, { x: 45, y: 720, size: 16, font });
  page.drawText("Signature: __________________________________", { x: 45, y: 610, size: 13, font });
  page.drawText("Date: ______________________________________", { x: 45, y: 560, size: 13, font });
  page.drawText("Local illustrative signature space only.", { x: 45, y: 490, size: 11, font });
}
await writeFile(path.join(output, "sample.pdf"), await pdf.save());
const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const filename = url.pathname.startsWith("/api/host/") ? "sample.pdf" : ["/app.js", "/styles.css", "/sample.pdf", "/taxi-icon.png"].includes(url.pathname) ? url.pathname.slice(1) : "index.html";
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self' blob:; img-src 'self' data:; font-src 'self' data:; object-src 'self'; form-action 'self'");
  response.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : filename.endsWith(".pdf") ? "application/pdf" : filename.endsWith(".png") ? "image/png" : "text/html");
  try { response.end(await readFile(path.join(output, filename))); } catch { response.statusCode = 404; response.end("Preview file not found."); }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Local Host preview: http://localhost:${port}/host/orders/ord_local_five_people`);
  console.log("Sample data only. No production transports, secrets, emails, or signing requests. Stop with Ctrl+C.");
});
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

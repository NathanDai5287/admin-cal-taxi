/** Loopback-only, synthetic-data preview. No production API or email calls. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const output = await mkdtemp(path.join(os.tmpdir(), "alumni-connect-preview-"));
const root = process.cwd();
const port = Number(process.env.CONNECT_PREVIEW_PORT || 4182);
await build({
  stdin: {
    resolveDir: root,
    loader: "tsx",
    contents: `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { InviteForm } from './components/alumni-connect/invite-form';
  import { AcceptanceForm } from './app/connect/public-forms';
  import Layout from './app/connect/layout';
  const accept = location.pathname === '/accept';
  createRoot(document.getElementById('root')).render(<Layout>
    <h1 className="page-title">{accept ? 'Reconnect with your chapter' : 'Invite your brothers'}</h1>
    <p className="page-lede mb-8">{accept ? 'A fellow alumnus invited you to stay connected with the Nu Chapter of Theta Xi.' : 'Help your brothers reconnect with the chapter. We’ll email each person an invitation. They choose whether to join.'}</p>
    {accept ? <AcceptanceForm invitation={'A'.repeat(43)} email="alex@example.com" defaults={{first_name:'Alex',last_name:'Brother',roll_number:'Nu 1048',graduation_year:2027}}/> : <InviteForm inviterName="Nathan Dai" action={async input => { window.previewInvites = input; return {ok:true,message:'Preview only: invitations processed. No email was sent.'}; }}/>}
  </Layout>);
`,
  },
  outfile: path.join(output, "app.js"),
  bundle: true,
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "fixtures-only",
      setup(b) {
        b.onResolve(
          { filter: /^(next\/link|next\/navigation)$|(^|\/)actions$/ },
          ({ path: name }) => ({ path: name, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({
          loader: "jsx",
          resolveDir: root,
          contents:
            name === "next/link"
              ? "export default function Link(p){return <a {...p}/>;}"
              : name === "next/navigation"
                ? "export const useRouter=()=>({push:()=>{},refresh:()=>{}});"
                : `
      export async function acceptConnectInvitation(token,input){window.previewAcceptance=input;return {ok:true,message:'Preview only: joined.'};}
      export async function declineConnectInvitation(){return {ok:true,message:'You haven’t been subscribed.'};}
      export async function requestConnectCode(){return {ok:true,message:'Preview code: 123456'};}
      export async function verifyConnectCode(code){return {ok:code==='123456',message:code==='123456'?'Email verified.':'Incorrect code.'};}
      export async function unsubscribeConnect(){return {ok:true,message:'Preview only: unsubscribed.'};}
    `,
        }));
        b.onResolve(
          { filter: /^(server-only|@supabase\/|next\/headers|next\/cache)/ },
          ({ path: name }) => ({
            errors: [{ text: `Production dependency blocked: ${name}` }],
          }),
        );
      },
    },
  ],
});
const css = await postcss([tailwind()]).process(
  await readFile("app/globals.css", "utf8"),
  { from: path.join(root, "app/globals.css") },
);
await writeFile(
  path.join(output, "styles.css"),
  css.css + "\n" + (await readFile("app/connect/connect.css", "utf8")),
);
const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect local preview</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  const file =
    pathname === "/app.js"
      ? "app.js"
      : pathname === "/styles.css"
        ? "styles.css"
        : null;
  response.setHeader(
    "Content-Type",
    file?.endsWith("js") ? "text/javascript" : file ? "text/css" : "text/html",
  );
  response.setHeader("Cache-Control", "no-store");
  response.end(file ? await readFile(path.join(output, file)) : html);
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Connect fixture preview: http://127.0.0.1:${port} (acceptance at /accept). No email transports.`,
  ),
);
process.on("SIGINT", () => server.close(() => process.exit(0)));

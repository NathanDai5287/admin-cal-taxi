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
  import AdminPage from './app/(admin)/(members)/users/alumni/page';
  import ConnectPage from './app/connect/page';
  import MembersLayout from './app/(admin)/(members)/layout';
  if (location.pathname.startsWith('/users/alumni')) {
    const content = await AdminPage({searchParams:Promise.resolve(Object.fromEntries(new URLSearchParams(location.search)))});
    createRoot(document.getElementById('root')).render(await MembersLayout({children:content}));
  } else if (location.pathname === '/connect') {
    createRoot(document.getElementById('root')).render(<Layout>{await ConnectPage({searchParams:Promise.resolve(Object.fromEntries(new URLSearchParams(location.search)))})}</Layout>);
  } else {
  const accept = location.pathname === '/accept';
  createRoot(document.getElementById('root')).render(<Layout>
    <h1 className="page-title">{accept ? 'Reconnect with your chapter' : 'Invite your brothers'}</h1>
    <p className="page-lede mb-8">{accept ? 'A fellow alumnus invited you to stay connected with the Nu Chapter of Theta Xi.' : 'Help your brothers reconnect with the chapter. We’ll email each person an invitation. They choose whether to join.'}</p>
    {accept ? <AcceptanceForm invitation={'A'.repeat(43)} email="alex@example.com" defaults={{first_name:'Alex',last_name:'Brother',roll_number:'Nu 1048',graduation_year:2027}}/> : <InviteForm inviterName="Nathan Dai" action={async input => { window.previewInvites = input; return {ok:true,message:'Preview only: invitations processed. No email was sent.'}; }}/>}
  </Layout>);
  }
`,
  },
  outfile: path.join(output, "app.js"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "fixtures-only",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(next\/link|next\/image|next\/navigation)$|(^|\/)actions$|lib\/reimbursements\/auth$|lib\/alumni-connect\/server$/,
          },
          ({ path: name }) => ({ path: name, namespace: "fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({
          loader: "jsx",
          resolveDir: root,
          contents:
            name === "next/link"
              ? "export default function Link({prefetch,...p}){return <a {...p}/>;}"
              : name === "next/image"
                ? "export default function Image({unoptimized,...p}){return <img {...p}/>;}"
                : name.endsWith("lib/reimbursements/auth")
                  ? `const session={userId:'preview',profile:{full_name:'Nathan Dai',role:'admin'},appAccess:{users:'write'}};export const getSessionProfile=async()=>session; export const requireAppAccess=async()=>session;export const hasAppAccess=()=>true;`
                  : name.endsWith("lib/alumni-connect/server")
                    ? `export const getConnectPerson=async()=>({id:'preview',subscribed:true,email:'alex@example.com',fullName:'Alex Brother',canReadNews:true});export const referralWindowStart=()=>'';const rows=[{profile_id:'alex',email:'alex@example.com',subscribed:true,blocked:false,provider_checked_at:'2026-11-10T18:00:00Z'},{profile_id:'sam',email:'sam@example.com',subscribed:false,blocked:false,provider_checked_at:null},{profile_id:'jordan',email:'jordan@example.com',subscribed:false,blocked:true,provider_checked_at:null}];
                    export const db=()=>({rpc:async(name)=>({data:name==='connect_alumni_directory_details'?[{profile_id:'alex',first_name:'Alex',last_name:'Brother',roll_number:'Nu 1048',graduation_year:2027,invited_count:1201,invited_by:'Nathan Dai'},{profile_id:'sam',first_name:'Sam',last_name:'Chen',roll_number:'Nu 998',graduation_year:2024,invited_count:0,invited_by:'Alex Brother'},{profile_id:'jordan',first_name:'Jordan',last_name:'Lee',roll_number:'',graduation_year:null,invited_count:2,invited_by:'Chapter'}]:[],error:null}),from:(table)=>{const data=table==='connect_members'&&location.search.includes('fixture=directory')?rows:[];const result={data,count:data.length,error:null};const chain=new Proxy({}, {get:(_,key)=>key==='then'?(resolve)=>resolve(result):()=>chain});return chain;}});`
                    : name === "next/navigation"
                      ? "export const useRouter=()=>({push:url=>{location.href=url;},refresh:()=>{},prefetch:()=>{}});export const usePathname=()=>location.pathname;export const redirect=()=>{};"
                      : `
      export async function seedAlumniInvitations(input){window.previewInvites=input;return {ok:true,message:'Preview only: invitations processed. No email was sent.',counts:{sent:input.recipients.length,skipped:0,notSent:0,uncertain:0}};}
      export const inviteBrothers=seedAlumniInvitations;export async function signOutConnect(){}
      export async function manageConnectRecord(){return {ok:true,message:'Preview only.'};}
      export async function syncConnectProvider(){return {ok:true,message:'Preview only.'};}
      export async function acceptConnectInvitation(token,input){window.previewAcceptance=input;return location.search.includes('blocked=1') ? {ok:false,reason:'profile_removed',message:'This email is linked to a chapter profile whose access was removed. A chapter administrator needs to restore that profile before you can join.'} : {ok:true,message:'Preview only: joined.',redirect:'/connect?joined=1'};}
      export async function declineConnectInvitation(){return {ok:true,message:'You haven’t been subscribed.'};}
      export async function requestConnectCode(){return {ok:true,message:'Preview code: 123456'};}
      export async function verifyConnectCode(code){return {ok:code==='123456',message:code==='123456'?'Email verified.':'Incorrect code.'};}
      export async function unsubscribeConnect(){return {ok:true,message:'Preview only: unsubscribed.'};}
      export async function resubscribeConnect(){return {ok:true,message:'Preview only: rejoined.'};}
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
  css.css +
    "\n" +
    (await readFile("app/connect/connect.css", "utf8")) +
    "\n" +
    (await readFile(path.join(output, "app.css"), "utf8")),
);
const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect local preview</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  if (pathname === "/taxi-icon.png") {
    response.setHeader("Content-Type", "image/png");
    response.end(await readFile("public/taxi-icon.png"));
    return;
  }
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

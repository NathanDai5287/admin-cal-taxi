import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const state={allowed:false,calls:[],access:[]};globalThis.__documentAccessTest=state;
const bundled=await build({entryPoints:["app/(admin)/accreditation/document-actions.ts"],bundle:true,write:false,format:"esm",platform:"node",plugins:[{name:"mock-document-boundaries",setup(b){
  b.onResolve({filter:/^(next\/cache|@\/lib\/reimbursements\/auth|@\/lib\/accreditation\/(feature|document-store|saved-forms))$/},args=>({path:args.path,namespace:"test"}));
  b.onLoad({filter:/.*/,namespace:"test"},args=>{
    if(args.path==='next/cache')return{contents:'export function revalidatePath(){}'};
    if(args.path.endsWith('/auth'))return{contents:'export async function requireAppAccess(app,level){globalThis.__documentAccessTest.access.push([app,level]);if(!globalThis.__documentAccessTest.allowed)throw Error("Forbidden");return {userId:"actor"};}'};
    if(args.path.endsWith('/feature'))return{contents:'export function accreditationEnabled(){return true}'};
    return{contents:['deleteSavedForm','finishExampleUpload','loadDocumentLibrary','loadDocumentWorkspace','performDocumentRequest','processExampleStep','renameDocumentFamily','reserveExampleBatch','seedDocumentExample','startExampleDocument'].map(name=>`export async function ${name}(...args){globalThis.__documentAccessTest.calls.push({name:"${name}",args});return {};}`).join('\n')};
  });
}}]});
const actions=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
test("every document mutation enforces write access before reaching storage or AI",async()=>{
  for(const name of ['deleteAccreditationSavedForm','reserveDocumentBatch','completeDocumentUpload','processDocumentExample','beginExampleDocument','updateDocumentFamily','requestDocumentChange','createDocumentFromExisting']){
    state.calls=[];state.access=[];state.allowed=false;
    await assert.rejects(actions[name]({}),/Forbidden/);assert.deepEqual(state.calls,[]);assert.deepEqual(state.access,[['accreditation','write']]);
  }
});
test("library and workspace reads enforce read access",async()=>{
  state.allowed=true;state.access=[];
  await actions.refreshDocumentLibrary();await actions.refreshDocumentWorkspace('run');
  assert.deepEqual(state.access,[['accreditation','read'],['accreditation','read']]);
});
test("authenticated actor identity comes from the session",async()=>{
  state.allowed=true;state.calls=[];
  await actions.requestDocumentChange({userId:'spoofed'});
  assert.equal(state.calls[0].args[0],'actor');
});

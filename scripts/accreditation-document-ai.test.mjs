import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";

// Resolve extensionless TypeScript imports exactly as the application bundler does.
await mkdir("tmp/accreditation-tests",{recursive:true});
await build({entryPoints:["lib/accreditation/document-ai.ts"],outfile:"tmp/accreditation-tests/document-ai.mjs",bundle:true,platform:"node",format:"esm",packages:"external"});
const {draftExampleDocument,analyzeDocumentExample,aiRetrySeconds,schemaFor,documentResponseSchema}=await import(pathToFileURL(`${process.cwd()}/tmp/accreditation-tests/document-ai.mjs`));
const document={version:1,title:"Service report",period:"2026",blocks:[{id:"existing",type:"paragraph",text:"Administrator's edited wording."}]};
const input={name:"Service report",guidance:"Use chapter terminology",period:"2026",message:"Update the heading",examples:[{id:"example",name:"report.pdf",content:"Previous report",analysis:{suggestedName:null,description:"Report",structure:["Summary"],guidance:""}}],document,history:[]};
test("drafting sends saved edits and selected examples in one bounded structured call",async()=>{
  let calls=0;
  const provider={name:"fixture",model:"fixture",async generateStructured(request){calls++;const data=JSON.parse(request.input);assert.deepEqual(data.document,document);assert.equal(data.examples.length,1);assert.equal(request.singleAttempt,true);assert.ok(request.maxOutputTokens>0);assert.match(request.instructions,/Preserve unrelated/);return {document,answer:"Updated",questions:[],reviewNotes:[]};}};
  assert.deepEqual((await draftExampleDocument(provider,input)).document,document);assert.equal(calls,1);
});
test("malformed drafts cannot replace the last saved document",async()=>{
  await assert.rejects(draftExampleDocument({name:"fixture",model:"fixture",generateStructured:async()=>({document:{title:"Broken"},answer:"Done",questions:[],reviewNotes:[]})},input));
});
test("oversized context fails before an API call instead of dropping examples",async()=>{
  let called=false;await assert.rejects(draftExampleDocument({name:"fixture",model:"fixture",generateStructured:async()=>{called=true;}},{...input,guidance:"x".repeat(200000)}),/Select fewer/);assert.equal(called,false);
});
test("example analysis includes optional naming without a separate call",async()=>{
  let calls=0;const result=await analyzeDocumentExample({name:"fixture",model:"fixture",generateStructured:async()=>{calls++;return {suggestedName:"Alumni events",description:"Events",structure:["Summary"],guidance:""};}},"scan.pdf","Report");assert.equal(result.suggestedName,"Alumni events");assert.equal(calls,1);
});
test("quota delay honors longer provider recovery times",()=>{
  assert.equal(aiRetrySeconds(new Error('retryDelay: "120s"')),120);assert.equal(aiRetrySeconds(new Error("quota")),60);
});
test("Gemini schema uses supported unions and leaves large bounds to local validation",()=>{
  const schema=JSON.stringify(schemaFor(documentResponseSchema));
  assert.ok(schema.includes('anyOf'));assert.ok(schema.includes('enum'));
  assert.equal(schema.includes('oneOf'),false);assert.equal(schema.includes('maxItems'),false);assert.equal(schema.includes('maxLength'),false);
});

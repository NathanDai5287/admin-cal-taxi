import test from 'node:test';
import assert from 'node:assert/strict';
import {processingAction,processingProgress} from '../lib/accreditation/processing-presentation.ts';
test('primary action starts or resumes only inactive incomplete work',()=>{
 assert.deepEqual(processingAction(undefined,'processing'),{label:'Start processing',disabled:false});
 for(const status of ['queued','running','waiting']) assert.equal(processingAction({id:'a',active:true,ingestion_status:status}).disabled,true);
 assert.deepEqual(processingAction({id:'a',active:false,ingestion_status:'paused'}),{label:'Resume processing',disabled:false});
 assert.equal(processingAction({id:'a',active:false,ingestion_status:'complete'}).disabled,true);
 assert.equal(processingAction(undefined,'ready').disabled,true);
});
test('stage progress uses actual page or embedding counts and no invented queued percentage',()=>{
 const base={id:'a',active:true,ingestion_status:'running'};
 const extraction=processingProgress({...base,pages_completed:20,pages_total:40,processing_completed:0,ingestion_job:{id:'j',status:'running',stage:'extraction'}});
 assert.equal(extraction.value,50);assert.match(extraction.label,/20\/40 pages/);
 const embedding=processingProgress({...base,processing_completed:60,processing_total:90,ingestion_job:{id:'j',status:'running',stage:'embedding'}});
 assert.equal(embedding.value,67);
 assert.equal(processingProgress({...base,ingestion_status:'queued'}).value,undefined);
 assert.equal(processingProgress({...base,active:false,ingestion_status:'complete'}).value,100);
});

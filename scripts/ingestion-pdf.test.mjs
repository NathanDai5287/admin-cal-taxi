import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { readPdfPage } from '../lib/accreditation/pdf-text.ts';
import { ingestionFailure } from '../lib/accreditation/ingestion-errors.ts';

test('native PDF text preserves pages without Gemini and blank pages complete', async()=>{
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
 pdf.addPage().drawText('A readable policy requires advance approval.',{font,size:12});pdf.addPage();
 const bytes=await pdf.save();
 const first=await readPdfPage(bytes,1);
 assert.equal(first.method,'native-v1');assert.match(first.text,/advance approval/);assert.equal(first.pages,2);
 const blank=await readPdfPage(bytes,2);assert.equal(blank.method,'blank');
});

test('quota recovery honors provider delays and pauses daily limits without losing work',()=>{
 const limited=new Error('AI capacity unavailable',{cause:new Error('429 RESOURCE_EXHAUSTED retryDelay: 120s')});
 const first=ingestionFailure(limited,1);assert.equal(first.status,'waiting');assert.ok(first.seconds>=120);
 assert.equal(ingestionFailure(limited,8).status,'paused');
 assert.equal(ingestionFailure(new Error('429 daily quota exceeded'),1).status,'paused');
 assert.equal(ingestionFailure(new Error('billing credits exhausted'),1).status,'paused');
});

test('rotated native pages remain readable while columns and mixed images request vision',async()=>{
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
 const rotated=pdf.addPage();rotated.setRotation(degrees(90));rotated.drawText('Rotated policy paragraph.',{font,size:12});
 const columns=pdf.addPage();columns.drawText('Left column',{x:40,y:700,font,size:12});columns.drawText('Right column',{x:350,y:700,font,size:12});
 const mixed=pdf.addPage();mixed.drawText('Header above scanned body',{font,size:12});
 const png=await pdf.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK5CYII=','base64'));
 mixed.drawImage(png,{x:10,y:10,width:300,height:500});
 const bytes=await pdf.save();assert.match((await readPdfPage(bytes,1)).text,/Rotated/);
 assert.equal((await readPdfPage(bytes,2)).method,'ocr');assert.equal((await readPdfPage(bytes,3)).method,'ocr');
 await assert.rejects(readPdfPage(new Uint8Array([1,2,3]),1));
});

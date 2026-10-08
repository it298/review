import test from 'node:test';
import assert from 'node:assert/strict';
import {publishEvidence} from '../src/evidence.js';
test('worker publishes only successful matched card captures and binary content does not enter review JSON',async()=>{
 const calls=[],request=async(...args)=>{calls.push(args);return {ok:true};},bytes=Buffer.from('png-card');
 await publishEvidence(request,{status:'failed',source:'google'},bytes);assert.equal(calls.length,0);
 await publishEvidence(request,{status:'success',entityKey:'hotel',capturedAt:'2026-10-08T01:00:00Z'},bytes);assert.equal(calls.length,1);assert.ok(calls[0][0].includes('source=google'));assert.ok(calls[0][0].includes('entity=hotel'));assert.equal(calls[0][1],bytes);assert.equal(calls[0][2],'image/png');
 await publishEvidence(async()=>{throw new Error('test upload failure');},{status:'success',source:'agoda',propertyId:'1',capturedAt:'2026-10-08T01:00:00Z'},bytes);
});

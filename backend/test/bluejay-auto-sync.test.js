import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autoSyncBluejay} from '../src/modules/bluejay/auto-sync.js';
test('automatic Bluejay collection is opt-in, window-bound, resumable and retries failures',async()=>{
 let state=null,calls=0,released=0,fail=false;
 const args={enabled:true,window:()=>({allowed:true,localDate:'2026-10-14',label:'08:00–08:30'}),get:async()=>state,set:async(k,v)=>{state=v;},acquire:async()=>async()=>{released++;},run:async options=>{calls++;assert.equal(options.from,'2026-10-14');assert.equal(options.reservationDateType,'3');assert.deepEqual(options.datasets,['occupancy','reservations']);return [{ok:!fail},{ok:true}];}};
 assert.equal((await autoSyncBluejay({...args,enabled:false})).reason,'disabled');
 assert.equal((await autoSyncBluejay({...args,window:()=>({allowed:false})})).reason,'outside_window');assert.equal(calls,0);
 fail=true;assert.equal((await autoSyncBluejay(args)).completedHotels,0);fail=false;
 for(let i=1;i<=4;i++)assert.equal((await autoSyncBluejay(args)).completedHotels,i);
 assert.equal((await autoSyncBluejay(args)).reason,'slot_complete');assert.equal(calls,5);assert.equal(released,6);
 assert.equal((await autoSyncBluejay({...args,acquire:async()=>null})).reason,'busy');
});

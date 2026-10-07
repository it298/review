import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL schema: atomic snapshots, names, locks and access restrictions',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    const schema=await fs.readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8');
    await db.exec(schema);
    await db.exec(schema); // Rerunning setup must preserve data structures.
    const mutation=async p=>(await db.query('select public.review_tracker_mutate($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
    await db.exec('set role service_role');
    const payload={op:'save',identity:'cid:abc',custom:'My hotel',date:'2026-10-07',now:'2026-10-06T19:00:00Z',fresh:{name:'Google name',rating:4.5,reviewCount:123,address:'Address',url:'https://www.google.com/maps?cid=2748'}};
    const row=await mutation(payload);
    await mutation({...payload,custom:undefined,fresh:{...payload.fresh,name:'Changed Google name',rating:null,reviewCount:125}});
    let data=(await db.query('select public.review_tracker_state() as data')).rows[0].data;
    assert.equal(Object.keys(data.places).length,1);assert.equal(Object.keys(data.snapshots).length,1);
    assert.equal(data.places[row.id].name,'My hotel');assert.equal(Object.values(data.snapshots)[0].rating,null);
    assert.equal(Object.values(data.snapshots)[0].user_rating_count,125);
    await assert.rejects(()=>mutation({...payload,date:'bad-date',fresh:{...payload.fresh,reviewCount:999}}));
    data=(await db.query('select public.review_tracker_state() as data')).rows[0].data;assert.equal(data.places[row.id].user_rating_count,125);
    const acquire=async token=>(await db.query("select public.review_tracker_lock('browser',$1,150) as acquired",[token])).rows[0].acquired;
    assert.equal(await acquire('a'),true);assert.equal(await acquire('b'),false);
    await db.query("select public.review_tracker_unlock('browser','b')");assert.equal(await acquire('b'),false);
    await db.query("select public.review_tracker_unlock('browser','a')");assert.equal(await acquire('b'),true);
    await db.query("select public.review_tracker_kv_set('job', $1::jsonb, 86400)",[JSON.stringify({pending:[row.id]})]);
    assert.deepEqual((await db.query("select public.review_tracker_kv_get('job') as job")).rows[0].job.pending,[row.id]);
    assert.ok((await db.query("select public.review_tracker_kv_take('job') as job")).rows[0].job);
    assert.equal((await db.query("select public.review_tracker_kv_take('job') as job")).rows[0].job,null);
    const conn=(await db.query("select public.review_tracker_connection_set('encrypted-one') as conn")).rows[0].conn;
    assert.equal((await db.query('select public.review_tracker_connection_set($1,$2::uuid) as conn',['encrypted-two',conn.revision])).rows[0].conn.payload,'encrypted-two');
    assert.equal((await db.query('select public.review_tracker_connection_set($1,$2::uuid) as conn',['stale',conn.revision])).rows[0].conn,null);
    await db.query('select public.review_tracker_connection_delete()');
    assert.equal((await db.query('select public.review_tracker_connection_set($1,$2::uuid) as conn',['resurrect',conn.revision])).rows[0].conn,null);
    await mutation({...payload,id:row.id,identity:'gbp:locations/123',fresh:{...payload.fresh,googleAccount:'accounts/1',googleLocation:'locations/123',dataSource:'google_business_profile'}});
    data=(await db.query('select public.review_tracker_state() as data')).rows[0].data;
    assert.equal(data.places[row.id].google_location,'locations/123');assert.equal(Object.keys(data.snapshots).length,1);
    await mutation({op:'delete',id:row.id});
    data=(await db.query('select public.review_tracker_state() as data')).rows[0].data;assert.deepEqual(data.places,{});assert.deepEqual(data.snapshots,{});
    await assert.rejects(()=>mutation({op:'rename',id:999,name:'Missing'}),error=>error.code==='P0002');
    await db.exec('reset role; set role anon;');
    await assert.rejects(()=>db.query('select public.review_tracker_state()'),/permission denied/i);
    await assert.rejects(()=>db.query('select * from public.review_tracker_places'),/permission denied/i);
    await assert.rejects(()=>db.query('select public.review_tracker_connection_get()'),/permission denied/i);
    await db.exec('reset role; set role authenticated;');
    await assert.rejects(()=>db.query('select public.review_tracker_mutate($1::jsonb)',[JSON.stringify(payload)]),/permission denied/i);
  } finally { await db.close(); }
});

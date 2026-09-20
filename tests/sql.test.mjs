import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dependency } from '../scripts/runtime.mjs';
import { initialDoc, parseAttendance, importAttendance } from '../assets/furikko-pair-core.js';
import { attendanceText } from './attendance-fixture.mjs';

test('actual PostgreSQL runtime: isolated room/store permissions, validation, CAS, presence', async t => {
  const { PGlite } = await dependency('@electric-sql/pglite'); const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA extensions;');
  // TEST ONLY: PGlite has no pgcrypto extension. Its built-in SHA-256 supplies exactly
  // the digest used by this migration; production keeps extensions.pgcrypto unchanged.
  await db.exec(`CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS
    'SELECT pg_catalog.sha256(pg_catalog.convert_to($1, ''UTF8''))';`);
  const migration = await readFile(new URL('../supabase/migrations/20260918_furikko_pair.sql', import.meta.url), 'utf8');
  assert.equal(migration.match(/CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;/g)?.length, 1);
  await db.exec(migration.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;', '-- Test SHA-256 adapter installed above.'));
  const attendanceMigration = await readFile(new URL('../supabase/migrations/20260920_furikko_pair_attendance.sql', import.meta.url), 'utf8');
  await db.exec(attendanceMigration);
  const room = 'a'.repeat(48), vivace = 'b'.repeat(48), anela = 'c'.repeat(48), other = 'd'.repeat(48);
  const asRole = async (role, sql, args = []) => { await db.exec(`SET ROLE ${role}`); try { return await db.query(sql, args); } finally { await db.exec('RESET ROLE'); } };
  const rpc = (sql, args) => asRole('anon', sql, args);
  const put = (side, key, rev, data) => rpc('SELECT * FROM public.put_furikko_pair($1,$2,$3,$4,$5::jsonb)', [room, side, key, rev, data === null ? null : JSON.stringify(data)]);
  const get = token => rpc('SELECT * FROM public.get_furikko_pair($1)', [token]);
  const rejects = (promise, code) => assert.rejects(promise, e => e.code === code);

  await t.test('creation, hash-only storage and initial unseen rows', async () => {
    const made = await rpc('SELECT public.create_furikko_pair($1,$2,$3) AS result', [room, vivace, anela]);
    assert.deepEqual(made.rows[0].result, { created: true });
    const rows = (await get(room)).rows; assert.equal(rows.length, 2);
    for (const r of rows) { assert.deepEqual(r.data, initialDoc()); assert.equal(Number(r.revision), 0); assert.equal(new Date(r.seen_at).getTime(), 0); }
    const stored = (await db.query('SELECT octet_length(read_hash) AS len, * FROM public.furikko_pair_rooms')).rows;
    assert.equal(stored[0].len, 32); assert.equal(JSON.stringify(stored).includes(room), false);
    await rejects(rpc('SELECT public.create_furikko_pair($1,$2,$3)', [room, vivace, anela]), '23505');
  });
  await t.test('invalid create/get tokens and cross-store writes deny', async () => {
    for (const token of [null, '', 'bad', room.toUpperCase(), other, room + '\n']) await rejects(get(token), 'PT403');
    for (const [r, a, b] of [[null, vivace, anela], [other, other, anela], [other, vivace, vivace], ['x'.repeat(48), vivace, anela], [other + '\n', vivace, anela]]) {
      await rejects(rpc('SELECT public.create_furikko_pair($1,$2,$3)', [r, a, b]), 'PT400');
    }
    for (const [side, key] of [['anela', vivace], ['vivace', anela], [null, vivace], ['other', vivace], ['vivace', null]]) await rejects(put(side, key, 0, initialDoc()), 'PT403');
    await rejects(rpc('SELECT * FROM public.put_furikko_pair($1,$2,$3,$4,$5::jsonb)', [other, 'vivace', vivace, 0, JSON.stringify(initialDoc())]), 'PT403');
  });
  await t.test('both stores update independently; old CAS rejected', async () => {
    const v = initialDoc(); v.casts.total = 10; v.casts.now = 6;
    assert.equal(Number((await put('vivace', vivace, 0, v)).rows[0].revision), 1);
    const a = initialDoc(); a.tables[0].label = '入口';
    assert.equal(Number((await put('anela', anela, 0, a)).rows[0].revision), 1);
    await rejects(put('vivace', vivace, 0, initialDoc()), 'PT409');
    const rows = (await get(room)).rows; assert.deepEqual(rows.find(r => r.store_id === 'vivace').data, v); assert.deepEqual(rows.find(r => r.store_id === 'anela').data, a);
  });
  await t.test('heartbeat changes only seen_at and verifies scoped key', async () => {
    await db.exec("UPDATE public.furikko_pair_state SET seen_at='2000-01-01T00:00:00Z'");
    const before = (await get(room)).rows.find(r => r.store_id === 'vivace');
    await rejects(rpc('SELECT * FROM public.heartbeat_furikko_pair($1,$2,$3)', [room, 'anela', vivace]), 'PT403');
    await rpc('SELECT * FROM public.heartbeat_furikko_pair($1,$2,$3)', [room, 'vivace', vivace]);
    const after = (await get(room)).rows.find(r => r.store_id === 'vivace');
    assert.deepEqual(after.data, before.data); assert.equal(after.revision, before.revision); assert.deepEqual(after.updated_at, before.updated_at);
    assert.ok(new Date(after.seen_at) > new Date(before.seen_at));
  });
  await t.test('malformed/missing/null/bool/unknown/nested fields reject without revision change', async () => {
    const bad = [null, [], true, {}, { tables: [], setMin: 50 }, { ...initialDoc(), extra: 1 }];
    const transforms = [d => d.tables = null, d => d.tables = {}, d => d.setMin = true, d => d.setMin = '50', d => d.setMin = 55,
      d => d.casts = null, d => d.casts.now = null, d => delete d.casts.now, d => d.casts.now = true, d => d.casts.now = '1',
      d => d.casts.now = 1, d => d.casts.total = 61, d => d.casts.total = 1.5, d => d.casts.secret = {},
      d => d.tables[0] = null, d => d.tables[0].id = {}, d => d.tables[0].id = 'x'.repeat(49), d => d.tables.push(d.tables[0]),
      d => d.tables[0].label = '', d => d.tables[0].label = 'x'.repeat(25), d => d.tables[0].label = '\u0085', d => d.tables[0].label = 'bad\n',
      d => d.tables[0].label = {}, d => d.tables[0].label = null, d => d.tables[0].cap = 0, d => d.tables[0].cap = 13,
      d => d.tables[0].cap = true, d => d.tables[0].cap = '4', d => d.tables[0].cap = 1.5,
      d => d.tables[0].guests = 21, d => d.tables[0].guests = -1, d => d.tables[0].min = 601, d => d.tables[0].min = 4,
      d => d.tables[0].startAt = -1, d => d.tables[0].planAt = 4102444800001, d => d.tables[0].planAt = 1.1,
      d => d.tables[0].startAt = true, d => delete d.tables[0].startAt, d => d.tables[0].personal = {},
      d => d.tables[0].planAt = 50, d => d.tables = Array.from({ length: 21 }, (_, i) => ({ ...d.tables[0], id: `t${i}` })),
      d => d.tables[0].label = 'x'.repeat(66000)];
    transforms.push(d => delete d.waiting, d => delete d.castNames, d => d.waiting = null, d => d.waiting = {},
      d => d.waiting = [null], d => d.waiting = [{ id: 'w1', guests: 1 }],
      d => d.waiting = [{ id: 'w1', guests: 1, at: 1, customer: 'no' }],
      d => d.waiting = [{ id: 'w1', guests: 1, at: 1 }, { id: 'w1', guests: 2, at: 2 }],
      d => d.waiting = [{ id: {}, guests: 1, at: 1 }], d => d.waiting = [{ id: 'w1', guests: 0, at: 1 }],
      d => d.waiting = [{ id: 'w1', guests: 21, at: 1 }], d => d.waiting = [{ id: 'w1', guests: 1.5, at: 1 }],
      d => d.waiting = [{ id: 'w1', guests: true, at: 1 }], d => d.waiting = [{ id: 'w1', guests: '1', at: 1 }],
      d => d.waiting = [{ id: 'w1', guests: 1, at: 0 }], d => d.waiting = [{ id: 'w1', guests: 1, at: null }],
      d => d.waiting = [{ id: 'w1', guests: 1, at: 4102444800001 }], d => d.waiting = [{ id: 'w1', guests: 1, at: 1.5 }],
      d => d.waiting = Array.from({ length: 31 }, (_, i) => ({ id: `w${i}`, guests: 1, at: 1 })),
      d => d.castNames = null, d => d.castNames = {},
      d => { d.castNames = [null]; d.casts.total = 1; }, d => { d.castNames = [{ name: 'no' }]; d.casts.total = 1; },
      d => { d.castNames = ['同じ', '同じ']; d.casts.total = 2; },
      d => { d.castNames = ['bad\nname']; d.casts.total = 1; }, d => { d.castNames = ['\u0085']; d.casts.total = 1; },
      d => { d.castNames = ['']; d.casts.total = 1; }, d => { d.castNames = [' leading']; d.casts.total = 1; },
      d => { d.castNames = ['x'.repeat(25)]; d.casts.total = 1; },
      d => { d.castNames = Array.from({ length: 61 }, (_, i) => `名前${i}`); d.casts.total = 60; },
      d => { d.castNames = ['あや']; d.casts.total = 2; });
    for (const transform of transforms) { const doc = initialDoc(); transform(doc); bad.push(doc); }
    for (const doc of bad) await rejects(put('vivace', vivace, 1, doc), 'PT400');
    await rejects(put('vivace', vivace, null, initialDoc()), 'PT400'); await rejects(put('vivace', vivace, -1, initialDoc()), 'PT400');
    assert.equal(Number((await get(room)).rows.find(r => r.store_id === 'vivace').revision), 1);
    console.log(`SQL rejected ${bad.length} malformed documents plus null/negative revisions.`);
  });
  await t.test('boundary document accepted and competing CAS has a single winner', async () => {
    const d = initialDoc(); d.casts = { now: 60, total: 60 }; d.setMin = 60;
    d.castNames = Array.from({ length: 60 }, (_, i) => i === 0 ? 'あ'.repeat(24) : `源氏名${i}`);
    d.waiting = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, guests: 20, at: 4102444800000 }));
    d.tables[0] = { id: 'test', label: 'あ'.repeat(24), cap: 12, guests: 20, min: 600, startAt: 4102444800000, planAt: 0 };
    const results = await Promise.allSettled([put('vivace', vivace, 1, d), put('vivace', vivace, 1, initialDoc())]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'PT409');
  });
  await t.test('anon/authenticated cannot directly read/write tables or call validator', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const sql of ['SELECT * FROM public.furikko_pair_rooms', 'SELECT * FROM public.furikko_pair_state',
        'DELETE FROM public.furikko_pair_state', "UPDATE public.furikko_pair_state SET data='{}'::jsonb",
        "INSERT INTO public.furikko_pair_rooms(read_hash,vivace_write_hash,anela_write_hash) VALUES ('a','b','c')",
        "SELECT public.furikko_pair_validate('{}'::jsonb)"]) await rejects(asRole(role, sql), '42501');
    }
    const flags = (await db.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('furikko_pair_rooms','furikko_pair_state')")).rows;
    assert.equal(flags.length, 2); assert.ok(flags.every(r => r.relrowsecurity));
    const policies = (await db.query("SELECT * FROM pg_policies WHERE tablename LIKE 'furikko_pair_%'")).rows; assert.equal(policies.length, 0);
  });
  await t.test('additive status validator: legacy still accepted, new exact counts and enums enforced', async () => {
    const valid = importAttendance(initialDoc(), parseAttendance(attendanceText));
    const legacy = initialDoc(); legacy.castNames = ['あや']; legacy.casts.total = 1;
    const accepts = async d => (await db.query('SELECT public.furikko_pair_validate($1::jsonb) AS ok', [JSON.stringify(d)])).rows[0].ok;
    assert.equal(await accepts(legacy), true); assert.equal(await accepts(valid), true);
    const manual = { ...initialDoc(), castStatus: {} }; manual.casts.total = 8;
    assert.equal(await accepts(manual), true);
    assert.equal(await accepts(importAttendance(initialDoc(), parseAttendance('__proto__ constructor toString'))), true);
    for (const mutate of [d => d.castStatus = null, d => d.castStatus = [], d => d.castStatus = {},
      d => delete d.castStatus['ゆあ'], d => d.castStatus.extra = 'present', d => d.castStatus['ゆあ'] = null,
      d => d.castStatus['ゆあ'] = ['present'], d => d.castStatus['ゆあ'] = 'unknown', d => d.casts.now = 8,
      d => d.casts.total = 9, d => d.castStatus['ゆあ'] = 'present\n']) {
      const bad = structuredClone(valid); mutate(bad); assert.equal(await accepts(bad), false);
      const rev = Number((await get(room)).rows.find(r => r.store_id === 'anela').revision);
      await rejects(put('anela', anela, rev, bad), 'PT400');
    }
    let rev = Number((await get(room)).rows.find(r => r.store_id === 'anela').revision);
    await put('anela', anela, rev++, legacy); await put('anela', anela, rev, valid);
    assert.deepEqual((await get(room)).rows.find(r => r.store_id === 'anela').data, valid);
    await rejects(put('anela', anela, rev, legacy), 'PT409');
  });
});

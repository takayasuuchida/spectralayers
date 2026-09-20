import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, PairSession, ApiError } from '../assets/furikko-pair-api.js';
import { initialDoc, clone, closeBusiness, effectiveCasts } from '../assets/furikko-pair-core.js';
const identity = () => ({ room: 'a'.repeat(48), side: 'vivace', key: 'b'.repeat(48) });
const row = side => ({ store_id: side, data: initialDoc(), revision: 0, updated_at: new Date().toISOString(), seen_at: new Date().toISOString() });
const response = data => new Response(JSON.stringify(data), { status: 200 });
const wait = () => new Promise(resolve => setTimeout(resolve, 0));
function mockApi() {
  const rows = { vivace: row('vivace'), anela: row('anela') }, calls = [];
  return { rows, calls, cancel() {}, async call(name, args) {
    calls.push({ name, args: clone(args) });
    if (name === 'get_furikko_pair') return clone(Object.values(rows));
    if (name === 'put_furikko_pair') {
      const r = rows[args.p_store];
      if (args.p_expected_revision !== r.revision) throw new ApiError(409, 'Conflict');
      r.data = args.p_data; r.revision++; return [clone(r)];
    }
    return [{ seen_at: new Date().toISOString() }];
  } };
}
test('legacy named attendance migrates only on explicit save, never on refresh/heartbeat', async () => {
  const api = mockApi(); api.rows.vivace.data.castNames = ['あや', 'ゆあ']; api.rows.vivace.data.casts.total = 2;
  const s = new PairSession(identity(), api); await s.refresh(); await s.heartbeat();
  assert.equal(s.rows.vivace.data.casts.now, 0); assert.equal(effectiveCasts(s.rows.vivace.data).now, 2);
  assert.equal(Object.hasOwn(api.rows.vivace.data, 'castStatus'), false);
  assert.equal(api.calls.filter(c => c.name === 'put_furikko_pair').length, 0);
  await s.mutate(d => { d.tables[0].label = '入口'; return d; }); await s.tail;
  assert.deepEqual(api.rows.vivace.data.castStatus, { あや: 'present', ゆあ: 'present' }); assert.equal(api.rows.vivace.data.casts.now, 2);
});
test('RPC HTTP/JSON/network failures propagate and URL is fixed', async () => {
  for (const fetchImpl of [async () => new Response('denied', { status: 403 }), async () => new Response('bad json'), async () => { throw new Error('offline'); }]) {
    await assert.rejects(createApi({ fetchImpl }).call('get_furikko_pair', { p_room: identity().room }), ApiError);
  }
  const api = createApi({ fetchImpl: async (url, init) => {
    assert.equal(url, 'https://kngkckweonnnhfocfqan.supabase.co/rest/v1/rpc/get_furikko_pair');
    assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal(init.method, 'POST'); return response([]);
  } });
  await api.call('get_furikko_pair', {});
  await assert.rejects(api.call('floor', {}));
});
test('8 second timeout mechanism aborts (short test clock)', async () => {
  const api = createApi({ timeout: 10, fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))) });
  await assert.rejects(api.call('get_furikko_pair', {}), { status: 0 });
});
test('successful queue captures identity and avoids lost fast updates', async () => {
  const source = identity(), api = mockApi(), s = new PairSession(source, api);
  await s.refresh(); source.side = 'anela'; source.room = 'c'.repeat(48);
  await Promise.all([s.mutate(d => { d.casts.total = 1; return d; }), s.mutate(d => { d.casts.total++; return d; })]);
  await s.tail;
  assert.equal(s.rows.vivace.data.casts.total, 2); assert.equal(s.rows.vivace.revision, 2); assert.equal(s.rows.anela.revision, 0);
  for (const call of api.calls.filter(c => c.name === 'put_furikko_pair')) { assert.equal(call.args.p_store, 'vivace'); assert.equal(call.args.p_room, identity().room); }
});
test('CAS conflict fetches latest, cancels queued commands, never replays mutation', async () => {
  const api = mockApi(), s = new PairSession(identity(), api); await s.refresh(); api.rows.vivace.revision = 1;
  let executions = 0;
  const results = await Promise.allSettled([s.mutate(d => { executions++; d.tables = []; return d; }), s.mutate(d => { executions++; return d; })]);
  await s.tail;
  assert.equal(results.every(r => r.status === 'rejected'), true); assert.equal(executions, 1);
  assert.equal(api.calls.filter(c => c.name === 'put_furikko_pair').length, 1);
  assert.equal(s.rows.vivace.data.tables.length, 6); assert.equal(s.rows.vivace.revision, 1);
  assert.equal(s.connected, true); assert.equal(s.status, '保存できません');
});
test('failed writes never publish optimistic state; refresh required before retry', async () => {
  const api = mockApi(), original = api.call.bind(api), s = new PairSession(identity(), api); await s.refresh();
  api.call = async (name, args) => { if (name === 'put_furikko_pair') throw new ApiError(0, 'offline'); return original(name, args); };
  await assert.rejects(s.mutate(d => { d.tables = []; return d; })); await s.tail;
  assert.equal(s.rows.vivace.data.tables.length, 6); assert.equal(s.status, '保存できません'); assert.equal(s.connected, false);
  await assert.rejects(s.mutate(d => d));
  api.call = original; await s.refresh(); await s.mutate(d => d); await s.tail;
  assert.equal(s.status, '共有中');
});
test('poll errors disconnect; missing partner never synthesized as empty tables', async () => {
  const api = mockApi(), original = api.call.bind(api), s = new PairSession(identity(), api);
  api.call = async () => [row('vivace')]; await s.refresh(); assert.equal(s.rows.anela, undefined);
  api.call = async () => { throw new ApiError(0, 'offline'); }; assert.equal(await s.refresh(), false); assert.equal(s.connected, false);
  api.call = original; await s.refresh(); assert.equal(s.connected, true);
});
test('dispose while saving invalidates response and queued work', async () => {
  const api = mockApi(), original = api.call.bind(api), s = new PairSession(identity(), api); await s.refresh();
  let release; api.call = async (name, args) => name === 'put_furikko_pair' ? new Promise(resolve => { release = () => resolve([{ ...row('vivace'), revision: 1, data: args.p_data }]); }) : original(name, args);
  const result = s.mutate(d => { d.tables = []; return d; }).catch(e => e); await wait(); s.dispose(); release(); await result; await s.tail;
  assert.equal(s.rows.vivace.data.tables.length, 6); assert.equal(s.connected, false);
});
test('old poll completes before queued save chooses its revision', async () => {
  const api = mockApi(), original = api.call.bind(api), s = new PairSession(identity(), api); await s.refresh();
  let release; api.call = async (name, args) => name === 'get_furikko_pair' ? new Promise(resolve => { release = () => resolve(clone(Object.values(api.rows))); }) : original(name, args);
  const refresh = s.refresh(); api.rows.vivace.revision = 2;
  const saving = s.mutate(d => { d.casts.total = 4; return d; }); release(); await refresh; await saving; await s.tail;
  assert.equal(s.rows.vivace.revision, 3); assert.equal(s.rows.vivace.data.casts.total, 4);
});
test('draft revision conflict prevents calling mutation', async () => {
  const api = mockApi(), s = new PairSession(identity(), api); await s.refresh();
  await assert.rejects(s.mutate(() => { throw new Error('must not run'); }, { expectedRevision: 7 }), { status: 409 });
  await s.tail; assert.equal(api.calls.filter(c => c.name === 'put_furikko_pair').length, 0);
});
test('heartbeat leaves revision and data unchanged, failure disables writes', async () => {
  const api = mockApi(), s = new PairSession(identity(), api); await s.refresh(); const before = clone(s.rows.vivace);
  await s.heartbeat(); assert.equal(s.rows.vivace.revision, before.revision); assert.deepEqual(s.rows.vivace.data, before.data);
  api.call = async () => { throw new ApiError(403, 'invalid'); }; await s.heartbeat(); assert.equal(s.connected, false);
});
test('malformed success is not treated as saved', async () => {
  const api = mockApi(), s = new PairSession(identity(), api); await s.refresh();
  api.call = async () => [{ ...row('anela'), revision: 1 }];
  await assert.rejects(s.mutate(d => d)); await s.tail; assert.equal(s.status, '保存できません'); assert.equal(s.rows.vivace.revision, 0);
});
test('daily close retains confirmation revision and cannot clear intervening updates', async () => {
  const api = mockApi(), s = new PairSession(identity(), api); await s.refresh();
  const confirmationRevision = s.rows.vivace.revision;
  api.rows.vivace.data.waiting = [{ id: 'new-arrival', guests: 3, at: Date.now() }]; api.rows.vivace.revision++;
  await assert.rejects(s.mutate(closeBusiness, { expectedRevision: confirmationRevision }), { status: 409 }); await s.tail;
  assert.equal(s.rows.vivace.data.waiting.length, 1);
  const puts = api.calls.filter(c => c.name === 'put_furikko_pair').length;
  await assert.rejects(s.mutate(closeBusiness, { expectedRevision: confirmationRevision }), { status: 409 }); await s.tail;
  assert.equal(api.calls.filter(c => c.name === 'put_furikko_pair').length, puts, 'stale local confirmation cannot send a second reset');
  assert.equal(s.rows.vivace.data.waiting[0].id, 'new-arrival');
});

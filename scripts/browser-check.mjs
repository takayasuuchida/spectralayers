import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { dependency } from './runtime.mjs';
import { initialDoc, validateDoc, clone, randomToken, invitation } from '../assets/furikko-pair-core.js';

import { attendanceText, attendanceNames } from '../tests/attendance-fixture.mjs';

const { chromium } = await dependency('playwright-core');
const root = resolve('.');
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const contents = await readFile(file);
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(contents);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-component-update', '--no-default-browser-check'] });
const rooms = new Map(), calls = [], unexpected = [], errors = [];
const expectedRequests = new WeakSet(), expectedCancellations = new WeakSet(), expectedConsole = [];
let closing = false;
const rpcOrigin = 'https://kngkckweonnnhfocfqan.supabase.co';
const nowISO = () => new Date().toISOString();
function newRoom(room, vivace, anela) {
  rooms.set(room, { keys: { vivace, anela }, rows: Object.fromEntries(['vivace', 'anela'].map(side => [side, {
    store_id: side, data: initialDoc(), revision: 0, updated_at: nowISO(), seen_at: new Date(0).toISOString()
  }])) });
}
async function context(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const control = { fail: false, failCreate: false, failPut: false, missing: false, stale: false, staleOwn: false, conflict: false, putGate: null, getGate: null, expectCAS: false, dismissNext: false, dialogs: [] };
  const expectFailure = (request, status) => {
    expectedRequests.add(request);
    expectedConsole.push({ context, url: request.url(), pattern: status ? new RegExp(`\\b${status}\\b`) : /net::ERR_(?:CONNECTION_FAILED|FAILED)/ });
  };
  if (options.noStorage) await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable'); }; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) {
      assert.equal(url.hash, '');
      if (url.search.includes('room=') || url.search.includes('key=')) unexpected.push('identity in query');
      await route.continue(); return;
    }
    if (url.origin !== rpcOrigin || !url.pathname.startsWith('/rest/v1/rpc/')) { unexpected.push(url.origin + url.pathname); await route.abort(); return; }
    const name = url.pathname.split('/').at(-1), args = request.postDataJSON();
    calls.push({ context, name, args: clone(args), request });
    const fulfill = async (status, data) => { try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) }); }
      catch (error) { if (!closing && !expectedCancellations.has(request)) errors.push(`Unexpected route error: ${name}: ${error.message}`); } };
    if (control.fail || (control.failPut && name === 'put_furikko_pair')) { expectFailure(request, 0); await route.abort('connectionfailed'); return; }
    if (name === 'create_furikko_pair') {
      if (control.failCreate) { expectFailure(request, 503); return fulfill(503, {}); }
      const keys = [args.p_room, args.p_vivace_key, args.p_anela_key];
      if (!keys.every(t => /^[a-f0-9]{48}$/.test(t)) || new Set(keys).size !== 3 || rooms.has(args.p_room)) return fulfill(400, {});
      newRoom(...keys); return fulfill(200, { created: true });
    }
    const room = rooms.get(args.p_room);
    if (!room) return fulfill(403, {});
    if (name === 'get_furikko_pair') {
      const rows = clone(Object.values(room.rows));
      if (control.getGate) { const gate = control.getGate; control.getGate = null; await gate; }
      if (control.missing) return fulfill(200, rows.filter(r => r.store_id !== 'anela'));
      if (control.stale) rows.find(r => r.store_id === 'anela').seen_at = new Date(Date.now() - 100000).toISOString();
      if (control.staleOwn) rows.find(r => r.store_id === 'vivace').seen_at = new Date(Date.now() - 100000).toISOString();
      return fulfill(200, rows);
    }
    if (!room.keys[args.p_store] || room.keys[args.p_store] !== args.p_write_key) return fulfill(403, {});
    const row = room.rows[args.p_store];
    if (name === 'heartbeat_furikko_pair') { row.seen_at = nowISO(); return fulfill(200, [{ seen_at: row.seen_at }]); }
    if (name === 'put_furikko_pair') {
      if (control.putGate) await control.putGate;
      if (control.conflict) { control.conflict = false; row.revision++; row.data.tables[0].label = '別端末の卓'; expectFailure(request, 409); return fulfill(409, {}); }
      if (row.revision !== args.p_expected_revision) { if (control.expectCAS) { control.expectCAS = false; expectFailure(request, 409); } return fulfill(409, {}); }
      try { validateDoc(args.p_data); } catch { return fulfill(400, {}); }
      row.data = clone(args.p_data); row.revision++; row.updated_at = nowISO(); row.seen_at = nowISO();
      return fulfill(200, [clone(row)]);
    }
    unexpected.push(name); return fulfill(404, {});
  });
  context.on('page', page => { page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => {
      if (message.type() !== 'error' || closing) return;
      const url = message.location().url, text = message.text();
      const expected = expectedConsole.findIndex(item => item.context === context && item.url === url && item.pattern.test(text));
      if (expected >= 0) expectedConsole.splice(expected, 1);
      else errors.push(`Console: ${url.split('#')[0]} ${text}`);
    });
    page.on('response', response => { if (response.status() >= 400 && !expectedRequests.has(response.request())) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
    page.on('requestfailed', request => { if (!closing && !expectedRequests.has(request) && !expectedCancellations.has(request)) errors.push(`Request failed: ${new URL(request.url()).pathname}`); });
    page.on('dialog', dialog => {
    control.dialogs.push(dialog.message());
    if (control.dismissNext) { control.dismissNext = false; return dialog.dismiss(); }
    return dialog.accept();
  }); });
  return { context, control };
}
async function eventually(fn, label) {
  const until = Date.now() + 8000;
  while (Date.now() < until) { if (await fn()) return; await new Promise(r => setTimeout(r, 40)); }
  throw new Error(`Timed out: ${label}`);
}
async function ready(page) { await eventually(async () => await page.locator('#status').textContent() === '共有中', 'shared status'); }
async function refresh(page) { await page.locator('#refresh').click(); await eventually(() => page.locator('#mine [data-table]').first().isEnabled(), 'refresh'); }
async function settings(page, now, total) {
  await page.locator('[data-settings]').click(); await page.locator('#cast-now').fill(String(now)); await page.locator('#cast-total').fill(String(total));
  await page.locator('#save-settings').click(); await eventually(() => page.locator('#settings').evaluate(d => !d.open), 'settings saved');
}
async function noOverflow(page, label) {
  for (const width of [320, 390, 844, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const size = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(size.actual <= size.viewport, `${label}: overflow at ${width}: ${size.actual}`);
    const tooWide = await page.locator('dialog[open]').evaluateAll(ds => ds.some(d => d.scrollWidth > d.clientWidth));
    assert.equal(tooWide, false, `${label}: dialog overflow at ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

try {
  await mkdir('output', { recursive: true });
  const a = await context(), b = await context();
  const pageA = await a.context.newPage(), pageB = await b.context.newPage();
  await pageA.goto(`${origin}/furikko-pair.html`);
  assert.equal(calls.length, 0, 'landing does not allocate/fetch on GET');
  await noOverflow(pageA, 'landing');
  a.control.failCreate = true; await pageA.locator('#create-room').click();
  await eventually(() => pageA.locator('#create-room').isEnabled(), 'failed create reset');
  assert.equal(await pageA.locator('#links').evaluate(d => d.open), false); assert.equal(rooms.size, 0);
  a.control.failCreate = false; await pageA.locator('#create-room').click();
  await pageA.locator('#links[open]').waitFor();
  const [vivaceLink, anelaLink] = await pageA.locator('#link-list input').evaluateAll(xs => xs.map(x => x.value));
  const room = new URL(vivaceLink).hash.slice(1); const roomToken = new URLSearchParams(room).get('room');
  assert.ok(rooms.has(roomToken)); assert.equal(new URL(vivaceLink).search, '');
  await noOverflow(pageA, 'links');
  await pageA.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('test denied')) } }); });
  await pageA.locator('#link-list button').filter({ hasText: 'リンクをコピー' }).first().click();
  assert.match(await pageA.locator('#link-message').textContent(), /リンクを選択/);
  assert.equal(await pageA.locator('#link-list input').first().evaluate(i => i.selectionEnd - i.selectionStart), vivaceLink.length);
  console.log('PASS creation after server success, owner links, clipboard fallback, fragment-only credentials');

  await pageA.goto(vivaceLink); await ready(pageA);
  assert.match(await pageA.locator('#current-store').textContent(), /VIVACE/);
  assert.match(await pageA.locator('#partner').textContent(), /未共有/);
  assert.equal(await pageA.locator('#mine .summary.good').count(), 0, 'zero casts never green');
  await pageB.goto(anelaLink); await ready(pageB);
  await settings(pageA, 10, 12); await settings(pageB, 8, 9);
  await pageA.locator('[data-table="t1"]').click();
  await pageA.locator('#table-label').fill('入口'); await pageA.locator('#table-guests').selectOption('3');
  await pageA.locator('#save-table').click(); await eventually(() => pageA.locator('#editor').evaluate(d => !d.open), 'preparation saved');
  assert.match(await pageA.locator('[data-table="t1"]').textContent(), /準備中/);
  assert.equal(rooms.get(roomToken).rows.vivace.data.tables[0].startAt, 0);
  await pageA.locator('[data-table="t1"]').click(); await pageA.locator('#start-table').click();
  await eventually(() => pageA.locator('#editor').evaluate(d => !d.open), 'start saved');
  const started = rooms.get(roomToken).rows.vivace.data.tables[0];
  assert.equal(started.guests, 3); assert.ok(started.startAt); assert.equal(started.planAt, 0);
  await refresh(pageB); await eventually(async () => (await pageB.locator('#partner').textContent()).includes('入口'), 'cross-context share');
  assert.equal(await pageB.locator('#partner button:not([data-return-mine])').count(), 0);
  assert.equal(await pageB.locator('#mine [data-table]').count(), 6);
  const storageB = await pageB.evaluate(() => localStorage.getItem('furikko-pair:owners:v1'));
  assert.equal(storageB, null, 'recipient has no owner credentials');
  await pageB.locator('#share-links').click(); assert.equal(await pageB.locator('#link-list input').count(), 1);
  assert.match(await pageB.locator('#link-list h3').textContent(), /ANELA/); await pageB.locator('[data-close="links"]').click();
  console.log('PASS independent contexts, manual input parity, selected guests start, partner read-only');

  await refresh(pageA);
  await noOverflow(pageA, 'board');
  await pageA.screenshot({ path: 'output/furikko-pair-mobile.png', fullPage: true });
  await pageA.setViewportSize({ width: 1280, height: 900 }); await pageA.screenshot({ path: 'output/furikko-pair-desktop.png', fullPage: true });
  await pageA.setViewportSize({ width: 390, height: 844 });
  await pageA.locator('[data-table="t1"]').click(); await noOverflow(pageA, 'editor');
  await pageA.locator('#table-label').fill('入力を保持'); await pageA.locator('#table-label').focus();
  const beforePoll = calls.filter(c => c.context === a.context && c.name === 'get_furikko_pair').length;
  await eventually(() => calls.filter(c => c.context === a.context && c.name === 'get_furikko_pair').length > beforePoll, '10 second poll').catch(async () => {
    // The helper uses an 8s budget; allow the remaining poll interval explicitly.
    await pageA.waitForTimeout(2500);
    assert.ok(calls.filter(c => c.context === a.context && c.name === 'get_furikko_pair').length > beforePoll);
  });
  assert.equal(await pageA.locator('#table-label').inputValue(), '入力を保持');
  assert.equal(await pageA.locator('#table-label').evaluate(i => document.activeElement === i), true);
  assert.ok(await pageA.locator('#table-label').evaluate(i => parseFloat(getComputedStyle(i).fontSize) >= 16));
  a.control.failPut = true; await pageA.locator('#save-table').click();
  await eventually(async () => (await pageA.locator('#status').textContent()) === '保存できません', 'save failure');
  assert.equal(await pageA.locator('#table-label').inputValue(), '入力を保持');
  assert.equal(rooms.get(roomToken).rows.vivace.data.tables[0].label, '入口');
  assert.equal(await pageA.locator('#save-table').isDisabled(), true);
  a.control.failPut = false;
  await pageA.evaluate(() => document.getElementById('refresh').click());
  await eventually(() => pageA.locator('#save-table').isEnabled(), 'save retry available');
  await pageA.locator('#save-table').click(); await eventually(() => pageA.locator('#editor').evaluate(d => !d.open), 'manual retry saved');
  assert.equal(rooms.get(roomToken).rows.vivace.data.tables[0].label, '入力を保持');
  console.log('PASS 320/390/844/1280 layouts, timer/poll focus preservation, failed-save draft and manual retry');

  await pageA.locator('[data-table="t1"]').click(); await pageA.locator('#table-label').fill('競合の入力');
  const putsBefore = calls.filter(c => c.context === a.context && c.name === 'put_furikko_pair').length;
  a.control.conflict = true; await pageA.locator('#save-table').click();
  await eventually(async () => (await pageA.locator('#editor-error').textContent()).includes('他の端末で更新'), 'conflict visible');
  await pageA.waitForTimeout(300);
  assert.equal(calls.filter(c => c.context === a.context && c.name === 'put_furikko_pair').length, putsBefore + 1);
  assert.equal(await pageA.locator('#table-label').inputValue(), '競合の入力');
  await pageA.locator('#reload-draft').click(); assert.equal(await pageA.locator('#table-label').inputValue(), '別端末の卓');
  await pageA.locator('[data-extend="25"]').click(); await pageA.locator('#save-table').click();
  await eventually(() => pageA.locator('#editor').evaluate(d => !d.open), 'extension saved');
  assert.equal(rooms.get(roomToken).rows.vivace.data.tables[0].min, 75);
  await pageA.locator('[data-table="t1"]').click(); await pageA.locator('#checkout-table').click();
  await eventually(() => pageA.locator('#editor').evaluate(d => !d.open), 'checkout saved');
  assert.equal(rooms.get(roomToken).rows.vivace.data.tables[0].guests, 0);
  assert.equal(rooms.get(roomToken).rows.anela.data.casts.now, 8);
  a.control.stale = true; await refresh(pageA);
  await eventually(async () => (await pageA.locator('#partner').textContent()).includes('相手店の接続を確認'), 'stale peer');
  assert.equal(await pageA.locator('#partner .summary.good').count(), 0);
  a.control.missing = true; await refresh(pageA); await eventually(async () => (await pageA.locator('#partner').textContent()).includes('未共有'), 'missing peer');
  assert.equal(await pageA.locator('#partner .table').count(), 0);
  a.control.missing = false; a.control.stale = false;
  a.control.fail = true; await pageA.locator('#refresh').click();
  await eventually(async () => (await pageA.locator('#status').textContent()) === '通信できません', 'offline visible');
  assert.equal(await pageA.locator('[data-table="t1"]').isDisabled(), true);
  assert.equal(await pageA.locator('#partner .summary.good').count(), 0);
  a.control.fail = false; await refresh(pageA); await ready(pageA);
  console.log('PASS CAS conflict without replay, extension/checkout, stale/missing peer, disconnect blocks mutations');

  const state = rooms.get(roomToken).rows.vivace;
  state.data.tables[0] = { ...state.data.tables[0], guests: 2, startAt: Date.now() - 46 * 60000, planAt: 0, min: 50 };
  state.data.tables[1] = { ...state.data.tables[1], guests: 1, startAt: Date.now() - 42 * 60000, planAt: 0, min: 50 };
  state.revision++;
  await refresh(pageA); await eventually(() => pageA.locator('#alerts .alert').count().then(n => n === 1), 'five-minute alert');
  assert.equal(await pageA.locator('[data-table="t2"].soon').count(), 1);
  await pageA.locator('[data-dismiss]').click(); await refresh(pageA); await pageA.waitForTimeout(1100);
  assert.equal(await pageA.locator('#alerts .alert').count(), 0);
  assert.equal(await pageA.locator('#sound').getAttribute('aria-pressed'), 'false');
  await pageA.locator('[data-table="t2"]').click(); a.control.dismissNext = true;
  await pageA.locator('#delete-table').click();
  assert.ok(a.control.dialogs.at(-1).includes('お客様がいる卓'));
  assert.equal(rooms.get(roomToken).rows.vivace.data.tables.length, 6);
  await pageA.locator('#delete-table').click(); await eventually(() => pageA.locator('#editor').evaluate(d => !d.open), 'confirmed deletion');
  assert.equal(rooms.get(roomToken).rows.vivace.data.tables.length, 5);
  assert.ok(a.control.dialogs.some(m => m.includes('チェック完了')));
  const hash = new URL(pageA.url()).hash; await pageA.locator('#guide-link').click();
  await pageA.waitForURL('**/furikko-pair-guide.html#*');
  const guideCalls = calls.length; await pageA.waitForTimeout(1100); assert.equal(calls.length, guideCalls);
  assert.equal(new URL(await pageA.locator('#back-to-board').getAttribute('href'), origin).hash, hash);
  await noOverflow(pageA, 'guide'); await pageA.locator('#back-to-board').click(); await ready(pageA);
  console.log('PASS one-time check alert, orange 10-minute state, sound opt-in, guide fragment return without data fetch');

  const c = await context({ noStorage: true }), pageC = await c.context.newPage();
  await pageC.goto(anelaLink); await ready(pageC); await settings(pageC, 7, 9);
  assert.equal(rooms.get(roomToken).rows.anela.data.casts.now, 7);
  await pageC.goto(`${origin}/furikko-pair.html`); await pageC.locator('#create-room').click(); await pageC.locator('#links[open]').waitFor();
  assert.match(await pageC.locator('#link-message').textContent(), /保存できませんでした/);
  const otherLink = await pageC.locator('#link-list input').nth(1).inputValue();
  let releasePut; a.control.putGate = new Promise(resolve => { releasePut = resolve; });
  await pageA.locator('[data-table="t1"]').click(); await pageA.locator('#table-label').fill('旧店舗の遅い保存');
  await pageA.locator('#save-table').click();
  await eventually(() => pageA.locator('#pending').textContent().then(t => t.includes('確認中')), 'pending save');
  await eventually(() => calls.some(c => c.context === a.context && c.name === 'put_furikko_pair' && c.args.p_data.tables.some(t => t.label === '旧店舗の遅い保存')), 'delayed write request');
  expectedCancellations.add(calls.filter(c => c.context === a.context && c.name === 'put_furikko_pair').at(-1).request);
  await pageA.evaluate(link => { location.hash = new URL(link).hash; }, otherLink);
  await pageA.waitForFunction(() => document.getElementById('current-store')?.textContent.includes('ANELA'));
  releasePut(); a.control.putGate = null; await ready(pageA);
  assert.equal(await pageA.locator('#editor').evaluate(d => d.open), false);
  assert.equal(await pageA.locator('#mine').textContent().then(t => t.includes('旧店舗の遅い保存')), false);
  assert.equal(await pageA.locator('#mine .take').textContent().then(t => t.includes('0')), true);

  const d = await context(), pageD = await d.context.newPage();
  await pageD.addInitScript(() => {
    window.testHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.testHidden });
  });
  await pageD.clock.install();
  await pageD.goto(anelaLink); await ready(pageD);
  await eventually(() => calls.filter(c => c.context === d.context && c.name === 'heartbeat_furikko_pair').length === 1, 'initial heartbeat');
  await pageD.clock.fastForward(26000);
  await eventually(() => calls.filter(c => c.context === d.context && c.name === 'heartbeat_furikko_pair').length === 2, '25s heartbeat');
  await pageD.evaluate(() => { window.testHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenCount = calls.filter(c => c.context === d.context).length;
  await pageD.clock.fastForward(76000); await pageD.waitForTimeout(100);
  assert.equal(calls.filter(c => c.context === d.context).length, hiddenCount);
  await pageD.evaluate(() => { window.testHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await eventually(() => calls.filter(c => c.context === d.context && c.name === 'heartbeat_furikko_pair').length === 3, 'foreground refresh heartbeat');
  console.log('PASS occupied deletion confirmation/cancel, 25s presence cadence, hidden pause, foreground refresh');

  const parityRoom = randomToken(), parityV = randomToken(), parityA = randomToken();
  newRoom(parityRoom, parityV, parityA);
  const e = await context(), f = await context();
  const pageE = await e.context.newPage(), pageF = await f.context.newPage();
  for (const [page, control, side, key] of [[pageE, e.control, 'vivace', parityV], [pageF, f.control, 'anela', parityA]]) {
    await page.goto(invitation(`${origin}/furikko-pair.html`, parityRoom, side, key)); await ready(page);
    assert.equal(await page.locator('#mine .roster-view').isVisible(), true);
    await page.locator('[data-table="t1"]').click(); await page.locator('#table-label').fill(`${side}入口`); await page.locator('#table-cap').fill('6');
    await page.locator('#table-guests').selectOption('2');
    await page.locator('[data-set-min="60"]').click(); await page.locator('[data-set-min="50"]').click();
    assert.match(await page.locator('#duration').textContent(), /50分/);
    await page.locator('[data-set-min="60"]').click(); await page.locator('#table-now').click();
    assert.match(await page.locator('#duration').textContent(), /60分/);
    assert.equal(rooms.get(parityRoom).rows[side].revision, 0, 'set/now only change the draft');
    await noOverflow(page, 'direct set/now'); await page.locator('#start-table').click();
    await eventually(() => page.locator('#editor').evaluate(d => !d.open), 'direct draft start');
    assert.equal(rooms.get(parityRoom).rows[side].data.tables[0].min, 60);
    assert.equal(rooms.get(parityRoom).rows[side].data.tables[0].startAt % 300000, 0);
    await settings(page, 2, 3);
    await page.locator('[data-open-roster]').click();
    await page.locator('#roster-input').fill('あや ねおん\nさら、あや'); await page.locator('#add-roster').click();
    assert.equal(await page.locator('#roster-draft-list .name-chip').count(), 3);
    assert.equal(rooms.get(parityRoom).rows[side].data.castNames.length, 0);
    await noOverflow(page, 'roster editor');
    if (side === 'vivace') {
      control.failPut = true; await page.locator('#save-roster').click();
      await eventually(() => page.locator('#roster-error').textContent().then(t => t.includes('通信')), 'roster failed save');
      assert.equal(await page.locator('#roster-draft-list .name-chip').count(), 3);
      assert.equal(rooms.get(parityRoom).rows[side].data.castNames.length, 0);
      control.failPut = false; await page.evaluate(() => document.getElementById('refresh').click());
      await eventually(() => page.locator('#save-roster').isEnabled(), 'roster retry');
    }
    await page.locator('#save-roster').click(); await eventually(() => page.locator('#roster-editor').evaluate(d => !d.open), 'roster saved');
    assert.deepEqual(rooms.get(parityRoom).rows[side].data.castNames, ['あや', 'ねおん', 'さら']);
    await page.locator('[data-settings]').click(); assert.equal(await page.locator('#cast-total').evaluate(i => i.readOnly), true);
    assert.equal(await page.locator('#cast-total').inputValue(), '3'); await page.locator('#set-min').selectOption('60');
    await page.locator('#save-settings').click(); await eventually(() => page.locator('#settings').evaluate(d => !d.open), 'roster-linked settings');
    await page.locator('[data-open-wait]').click(); await page.locator('[data-wait-guests="8"]').click();
    assert.equal(await page.locator('#waiting-guests').inputValue(), '8'); await page.locator('#waiting-guests').fill('9');
    await noOverflow(page, 'waiting editor');
    if (side === 'vivace') {
      control.failPut = true; await page.locator('#save-waiting').click();
      await eventually(() => page.locator('#waiting-error').textContent().then(t => t.includes('通信')), 'waiting failed save');
      assert.equal(await page.locator('#waiting-guests').inputValue(), '9'); assert.equal(rooms.get(parityRoom).rows[side].data.waiting.length, 0);
      control.failPut = false; await page.evaluate(() => document.getElementById('refresh').click()); await eventually(() => page.locator('#save-waiting').isEnabled(), 'waiting retry');
    }
    await page.locator('#save-waiting').click(); await eventually(() => page.locator('#waiting-editor').evaluate(d => !d.open), 'waiting saved');
    assert.equal(rooms.get(parityRoom).rows[side].data.waiting[0].guests, 9);
  }
  await refresh(pageE); await refresh(pageF);
  for (const page of [pageE, pageF]) {
    await eventually(() => page.locator('#partner .waiting-list').textContent().then(t => t.includes('1組 / 9名')), 'peer waiting count');
    assert.deepEqual(await page.locator('#partner .roster-chip b').allTextContents(), ['あや', 'ねおん', 'さら']);
    assert.equal(await page.locator('#partner [data-guide-wait], #partner [data-open-roster]').count(), 0);
    const unchangedUrl = page.url(), ownSide = new URLSearchParams(new URL(unchangedUrl).hash.slice(1)).get('side');
    const peerSide = ownSide === 'vivace' ? 'anela' : 'vivace';
    await page.locator(`#tab-${peerSide}`).click();
    assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
    assert.equal(await page.locator('#partner').isVisible(), true);
    assert.equal(await page.locator('#mine').isVisible(), false);
    assert.equal(await page.locator('#partner button, #partner select').count(), 0);
    assert.equal(page.url(), unchangedUrl);
    await page.locator(`#tab-${ownSide}`).click(); assert.equal(page.url(), unchangedUrl);
    assert.equal(await page.locator('#mine').isVisible(), true);
    for (const id of ['tab-anela', 'tab-vivace']) assert.ok(await page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().height >= 48));
  }
  await noOverflow(pageE, 'parity board'); await pageE.screenshot({ path: 'output/furikko-pair-parity-mobile.png', fullPage: true });
  const tablesBeforeGuiding = clone(rooms.get(parityRoom).rows.vivace.data.tables);
  await pageE.locator('[data-guide-wait]').click(); await eventually(() => rooms.get(parityRoom).rows.vivace.data.waiting.length === 0, 'guided wait removed');
  assert.deepEqual(rooms.get(parityRoom).rows.vivace.data.tables, tablesBeforeGuiding, 'guiding does not auto-seat');
  await pageE.locator('[data-business-close]').click();
  const pState = rooms.get(parityRoom).rows.vivace;
  pState.data.waiting.push({ id: 'intervening', guests: 4, at: Date.now() }); pState.revision++;
  e.control.expectCAS = true;
  await pageE.locator('#confirm-business-close').click();
  await eventually(() => pageE.locator('#business-close-error').textContent().then(t => t.includes('他の端末')), 'reset stale confirmation');
  await eventually(() => pageE.locator('#confirm-business-close').isDisabled(), 'reset confirmation invalidated');
  assert.equal(pState.data.waiting.length, 1); assert.equal(pState.data.tables[0].guests, 2);
  await pageE.locator('[data-close="business-close"]').click();
  for (const [page, side, peer] of [[pageE, 'vivace', 'anela'], [pageF, 'anela', 'vivace']]) {
    const before = clone(rooms.get(parityRoom).rows[side].data), peerBefore = clone(rooms.get(parityRoom).rows[peer].data);
    await page.locator('[data-business-close]').click(); assert.deepEqual(rooms.get(parityRoom).rows[side].data, before);
    await noOverflow(page, 'business close confirmation'); await page.locator('#confirm-business-close').click();
    await eventually(() => page.locator('#business-close').evaluate(d => !d.open), 'business closed');
    const after = rooms.get(parityRoom).rows[side].data;
    assert.equal(after.setMin, 60); assert.ok(after.tables.every(t => !t.guests && !t.startAt && !t.planAt && t.min === 60));
    assert.deepEqual(after.tables.map(t => [t.id, t.label, t.cap]), before.tables.map(t => [t.id, t.label, t.cap]));
    assert.deepEqual(after.waiting, []); assert.deepEqual(after.castNames, []); assert.deepEqual(after.casts, { now: 0, total: 0 });
    assert.deepEqual(rooms.get(parityRoom).rows[peer].data, peerBefore);
  }
  console.log('PASS symmetric waiting/roster/daily close, failed drafts, revision-bound reset, direct set/now, fragment-preserving navigation');

  const overdue = rooms.get(parityRoom).rows.vivace;
  overdue.data.tables[0] = { ...overdue.data.tables[0], guests: 1, startAt: Date.now() - 51 * 60000, min: 50 };
  overdue.data.tables[1] = { ...overdue.data.tables[1], guests: 1, startAt: Date.now() - 70 * 60000, min: 50 };
  overdue.revision++; await refresh(pageE);
  await eventually(() => pageE.locator('#alerts').textContent().then(t => t.includes('経過')), 'overdue alert timing');
  assert.equal(await pageE.locator('#alerts .alert').count(), 1, 'old overdue table gets no fresh notification');
  assert.doesNotMatch(await pageE.locator('#alerts').textContent(), /5分前/);
  const g = await context(), pageG = await g.context.newPage(); let releaseGet;
  g.control.getGate = new Promise(resolve => { releaseGet = resolve; });
  await pageG.goto(vivaceLink);
  await eventually(() => calls.some(c => c.context === g.context && c.name === 'get_furikko_pair'), 'slow initial get');
  const initialGet = calls.find(c => c.context === g.context && c.name === 'get_furikko_pair'); expectedCancellations.add(initialGet.request);
  await pageG.evaluate(link => { location.hash = new URL(link).hash; }, otherLink);
  await pageG.waitForFunction(() => document.getElementById('current-store')?.textContent.includes('ANELA')); await ready(pageG);
  releaseGet(); await pageG.waitForTimeout(150);
  const currentRoom = new URLSearchParams(new URL(otherLink).hash.slice(1)).get('room');
  assert.equal(await pageG.locator('#mine').textContent().then(t => t.includes('旧店舗')), false);
  await settings(pageG, 1, 2);
  const ownWrites = calls.filter(c => c.context === g.context && c.name === 'put_furikko_pair');
  assert.equal(ownWrites.length, 1); assert.equal(ownWrites[0].args.p_store, 'anela'); assert.equal(ownWrites[0].args.p_room, currentRoom);
  console.log('PASS delayed initial GET identity cancellation, overdue timing, stale notification suppression, strict console/network error gate');
  const rosterRoom = randomToken(), rosterV = randomToken(), rosterA = randomToken();
  newRoom(rosterRoom, rosterV, rosterA);
  const rosterState = rooms.get(rosterRoom).rows;
  rosterState.vivace.data.castNames = [...attendanceNames]; rosterState.vivace.data.casts.total = 8;
  rosterState.anela.data.castNames = [...attendanceNames, 'あや']; rosterState.anela.data.casts.total = 9;
  const h = await context(), i = await context(), pageH = await h.context.newPage(), pageI = await i.context.newPage();
  const rosterLink = invitation(`${origin}/furikko-pair.html`, rosterRoom, 'vivace', rosterV);
  const putsH = () => calls.filter(c => c.context === h.context && c.name === 'put_furikko_pair');
  await pageH.goto(rosterLink); await ready(pageH);
  await eventually(() => pageH.locator('#mine .remainder b').textContent().then(t => t === '8'), 'legacy roster effective now 8');
  assert.equal(putsH().length, 0); assert.equal(rosterState.vivace.data.casts.now, 0);
  assert.equal(Object.hasOwn(rosterState.vivace.data, 'castStatus'), false);
  await pageI.goto(invitation(`${origin}/furikko-pair.html`, rosterRoom, 'anela', rosterA)); await ready(pageI);
  await eventually(() => Date.parse(rosterState.anela.seen_at) > 0, 'peer heartbeat confirmed');
  await refresh(pageH);
  await eventually(() => pageH.locator('#partner .remainder b').textContent().then(t => t === '9'), 'legacy peer effective now 9');
  assert.equal(await pageH.locator('#tab-vivace').getAttribute('aria-selected'), 'true');
  await pageH.locator('[data-open-roster]').click(); await pageH.locator('#roster-input').fill(attendanceText);
  await pageH.locator('#import-roster').click();
  assert.deepEqual(await pageH.locator('#roster-draft-list .name-chip > span').allTextContents(), attendanceNames);
  assert.equal(await pageH.locator('[data-name-status="3"]').inputValue(), 'late');
  assert.match(await pageH.locator('#roster-draft-note').textContent(), /出勤中 7人/);
  assert.equal(putsH().length, 0);
  await noOverflow(pageH, 'attendance preview');
  h.control.failPut = true; await pageH.locator('#save-roster').click();
  await eventually(() => pageH.locator('#roster-error').textContent().then(t => t.includes('通信')), 'attendance save failed');
  assert.equal(await pageH.locator('#roster-input').inputValue(), attendanceText);
  assert.equal(await pageH.locator('[data-name-status="3"]').inputValue(), 'late');
  assert.equal(rosterState.vivace.data.casts.now, 0); assert.equal(await pageH.locator('#roster-editor').evaluate(d => d.open), true);
  h.control.failPut = false; await pageH.evaluate(() => document.getElementById('refresh').click());
  await eventually(() => pageH.locator('#save-roster').isEnabled(), 'attendance retry ready');
  await pageH.locator('#save-roster').click(); await eventually(() => pageH.locator('#roster-editor').evaluate(d => !d.open), 'attendance saved');
  assert.deepEqual(rosterState.vivace.data.castNames, attendanceNames);
  assert.deepEqual(rosterState.vivace.data.casts, { now: 7, total: 8 });
  assert.equal(await pageH.locator('#mine .remainder b').textContent(), '7');
  await pageH.locator('[data-open-roster]').click(); await pageH.locator('[data-name-status="3"]').selectOption('present');
  await pageH.locator('#roster-input').fill(''); await pageH.locator('#roster-input').focus();
  await pageH.waitForTimeout(1200);
  assert.equal(await pageH.locator('#roster-input').evaluate(el => document.activeElement === el), true);
  h.control.failPut = true; await pageH.locator('#save-roster').click();
  await eventually(() => pageH.locator('#status').textContent().then(t => t === '保存できません'), 'status save failed');
  assert.equal(rosterState.vivace.data.castStatus['なつき'], 'late');
  assert.equal(await pageH.locator('[data-name-status="3"]').inputValue(), 'present');
  h.control.failPut = false; await pageH.evaluate(() => document.getElementById('refresh').click());
  await eventually(() => pageH.locator('#save-roster').isEnabled(), 'status retry ready');
  await pageH.locator('#save-roster').click(); await eventually(() => pageH.locator('#roster-editor').evaluate(d => !d.open), 'arrival saved');
  assert.deepEqual(rosterState.vivace.data.casts, { now: 8, total: 8 });
  for (const [status, now] of [['off', 7], ['present', 8]]) {
    await pageH.locator('[data-open-roster]').click(); await pageH.locator('[data-name-status="0"]').selectOption(status);
    await pageH.locator('#save-roster').click(); await eventually(() => pageH.locator('#roster-editor').evaluate(d => !d.open), 'status saved');
    assert.equal(rosterState.vivace.data.casts.now, now);
  }
  await pageH.locator('[data-table="t1"]').click(); await pageH.locator('#table-guests').selectOption('3');
  await pageH.locator('#save-table').click(); await eventually(() => pageH.locator('#editor').evaluate(d => !d.open), 'three guests saved');
  assert.equal(await pageH.locator('#mine .remainder b').textContent(), '5');
  assert.deepEqual(await pageH.locator('#mine .roster-chip b').allTextContents(), attendanceNames);
  await noOverflow(pageH, 'eight-name board'); await pageH.evaluate(() => scrollTo(0, 0));
  const layout = await pageH.evaluate(() => {
    const roster = document.querySelector('#mine .roster-view'), tables = document.querySelector('#mine .tables'), count = document.querySelector('#mine .remainder b');
    return { first: roster.previousElementSibling.className, rosterBottom: roster.getBoundingClientRect().bottom,
      tableTop: tables.getBoundingClientRect().top, countBottom: count.getBoundingClientRect().bottom,
      font: parseFloat(getComputedStyle(count).fontSize), height: document.documentElement.scrollHeight,
      columns: getComputedStyle(tables).gridTemplateColumns.split(' ').length,
      smallTargets: [...document.querySelectorAll('#mine button')].some(el => el.getBoundingClientRect().height < 48) };
  });
  assert.equal(layout.first, 'store-heading'); assert.ok(layout.rosterBottom < layout.tableTop);
  assert.ok(layout.rosterBottom < 844 && layout.countBottom < 844); assert.ok(layout.font >= 48);
  assert.equal(layout.columns, 2); assert.equal(layout.smallTargets, false);
  assert.ok(layout.height <= 1300, `ordinary board height: ${layout.height}`);
  await mkdir('output/playwright', { recursive: true });
  await pageH.screenshot({ path: 'output/playwright/roster-tabs-mobile.png', fullPage: true });
  await pageH.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await pageH.locator('[role="tabpanel"]:visible').count(), 1);
  await pageH.screenshot({ path: 'output/playwright/roster-tabs-desktop.png', fullPage: true });
  await pageH.setViewportSize({ width: 390, height: 844 });
  await pageH.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await pageH.locator('#tab-anela').click();
  assert.equal(pageH.url(), rosterLink); assert.equal(await pageH.locator('[role="tabpanel"]:visible').count(), 1);
  assert.equal(await pageH.locator('#partner button, #partner select, #partner input').count(), 0);
  assert.ok(await pageH.locator('#partner .roster-view').evaluate(el => el.getBoundingClientRect().top < 240));
  const pollCount = calls.filter(c => c.context === h.context && c.name === 'get_furikko_pair').length;
  await pageH.waitForTimeout(10500);
  assert.ok(calls.filter(c => c.context === h.context && c.name === 'get_furikko_pair').length > pollCount);
  assert.equal(await pageH.locator('#tab-anela').getAttribute('aria-selected'), 'true');
  assert.equal(await pageH.locator('#partner').isVisible(), true); assert.equal(pageH.url(), rosterLink);
  h.control.stale = true; await refresh(pageH);
  await eventually(() => pageH.locator('#partner .remainder b').textContent().then(t => t === '—'), 'stale remainder suppressed');
  assert.match(await pageH.locator('#partner').textContent(), /最終確認/);
  h.control.stale = false;
  await pageH.locator('#tab-anela').focus(); await pageH.keyboard.press('ArrowRight');
  assert.equal(await pageH.locator('#tab-vivace').getAttribute('aria-selected'), 'true');
  await pageH.keyboard.press('Home'); assert.equal(await pageH.locator('#tab-anela').getAttribute('aria-selected'), 'true');
  await pageH.keyboard.press('End'); assert.equal(await pageH.locator('#mine').isVisible(), true);
  await pageH.locator('[data-open-roster]').click();
  await pageH.locator('#roster-input').fill('ANELA\n2026/09/20\n出勤8人'); await pageH.locator('#import-roster').click();
  assert.match(await pageH.locator('#roster-error').textContent(), /名前が見つかりません/);
  assert.equal(await pageH.locator('#roster-draft-list .name-chip').count(), 8);
  const beforeDirect = putsH().length;
  await pageH.locator('#roster-input').fill(attendanceText.replace('8人', '9人')); await pageH.locator('#save-roster').click();
  assert.equal(putsH().length, beforeDirect); assert.match(await pageH.locator('#roster-draft-note').textContent(), /見出しは9人/);
  assert.equal(await pageH.locator('[data-name-status="3"]').inputValue(), 'late');
  await pageH.locator('#save-roster').click(); await eventually(() => pageH.locator('#roster-editor').evaluate(d => !d.open), 'direct save uses parsed preview');
  assert.equal(rosterState.vivace.data.casts.now, 7);
  await pageH.locator('[data-open-roster]').click(); await pageH.locator('[data-name-status="3"]').selectOption('present');
  const beforeConflict = putsH().length; h.control.conflict = true; await pageH.locator('#save-roster').click();
  await eventually(() => pageH.locator('#roster-error').textContent().then(t => t.includes('他の端末') || t.includes('更新されています')), 'status CAS conflict');
  await pageH.waitForTimeout(300); assert.equal(putsH().length, beforeConflict + 1);
  assert.equal(await pageH.locator('[data-name-status="3"]').inputValue(), 'present'); assert.equal(rosterState.vivace.data.castStatus['なつき'], 'late');
  await pageH.locator('#save-roster').click(); await pageH.waitForTimeout(200); assert.equal(putsH().length, beforeConflict + 1, 'old draft revision never replayed');
  await pageH.locator('#reload-roster').click(); assert.equal(await pageH.locator('[data-name-status="3"]').inputValue(), 'late');
  await pageH.locator('[data-close="roster-editor"]').click();
  for (const call of putsH()) { assert.equal(call.args.p_store, 'vivace'); assert.equal(call.args.p_room, rosterRoom); assert.equal(call.args.p_write_key, rosterV); }
  assert.equal(rosterState.anela.data.casts.now, 0); assert.equal(Object.hasOwn(rosterState.anela.data, 'castStatus'), false);
  console.log(`PASS exact attendance paste/preview, legacy 8/9 counts without writes, arrival/off, failed status drafts/CAS, tabs/poll/keyboard/credentials, stale remainder; mobile height ${layout.height}px`);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log('PASS storage failure session, hash identity change during save, no legacy/external requests, no page errors');
  console.log('BROWSER CHECK PASSED (mock RPC; no live backend). Screenshots: output/playwright/roster-tabs-mobile.png, output/playwright/roster-tabs-desktop.png');
} finally {
  closing = true;
  await browser.close(); await new Promise(resolve => server.close(resolve));
}

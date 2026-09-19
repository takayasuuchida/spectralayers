import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDoc, validateDoc, round5, startTime, durationTo, setGuests, startTable, extendTable,
  adjustTable, checkout, availability, addTable, orderedTables, endOf, parseIdentity, invitation, randomToken, isLive, createAlertTracker,
  addWaiting, removeWaiting, addRosterNames, replaceRoster, closeBusiness, setTableMinutes, setTableNow, checkTiming } from '../assets/furikko-pair-core.js';

test('initial six tables and document ranges', () => {
  const d = initialDoc(); assert.equal(validateDoc(d), d); assert.equal(d.tables.length, 6); assert.equal(d.setMin, 50);
  for (const mutate of [x => x.casts.now = true, x => x.tables[0].label = 'x'.repeat(25),
    x => x.tables[0].cap = 13, x => x.tables[0].guests = 21, x => x.tables[0].min = 601,
    x => x.tables[0].startAt = NaN, x => x.tables[0].label = 'bad\nlabel', x => x.tables.push(x.tables[0]),
    x => x.tables[0].name = 'no', x => x.casts.extra = 1, x => delete x.tables[0].planAt, x => x.setMin = null,
    x => x.tables[0].startAt = 4102444800001, x => x.tables[0].label = '\u0085', x => x.tables[0].cap = 1.5,
    x => x.tables[0].id = 'table\n', x => x.tables[0].id = 'table\u2028']) {
    const invalid = initialDoc(); mutate(invalid); assert.throws(() => validateDoc(invalid));
  }
});
test('5 minute rounding and both directions across midnight', () => {
  const beforeMidnight = new Date(2026, 8, 18, 23, 50).getTime();
  assert.equal(startTime('00:10', beforeMidnight), new Date(2026, 8, 19, 0, 10).getTime());
  assert.equal(startTime('23:55', new Date(2026, 8, 19, 0, 15).getTime()), new Date(2026, 8, 18, 23, 55).getTime());
  assert.equal(durationTo('00:40', beforeMidnight), 50);
  assert.equal(durationTo('00:42', beforeMidnight), 50);
  assert.equal(round5(new Date(2026, 8, 18, 23, 58).getTime()), new Date(2026, 8, 19, 0, 0).getTime());
  assert.throws(() => durationTo('12:00', beforeMidnight));
  assert.throws(() => startTime('24:00')); assert.throws(() => startTime('25:81')); assert.throws(() => durationTo('', beforeMidnight));
});
test('selected guests, preparation, start, extension, reset', () => {
  const now = round5(Date.now()); let t = initialDoc().tables[0];
  assert.throws(() => startTable(t));
  t = setGuests(t, 3, 50, now); assert.equal(t.startAt, 0); assert.equal(t.planAt, now);
  t = startTable(t); assert.equal(t.guests, 3); assert.equal(t.startAt, now); assert.equal(t.planAt, 0);
  t = extendTable(t, 25); assert.equal(t.min, 75);
  t = extendTable(t, 50); assert.equal(t.min, 125);
  assert.throws(() => extendTable({ ...t, min: 600 }, 25));
  assert.throws(() => extendTable(t, -25)); assert.throws(() => startTable(t));
  t = adjustTable(t, -5); assert.equal(t.min, 120);
  t = adjustTable(t, 5, 'start'); assert.equal(t.startAt, now + 300000);
  t = checkout(t, 60); assert.equal(t.min, 60); assert.equal(t.guests + t.startAt + t.planAt, 0);
});
test('availability uses guests including preparation and no cast fallback', () => {
  const doc = initialDoc(); assert.equal(availability(doc).take, 0);
  doc.casts = { now: 10, total: 12 }; assert.equal(availability(doc).take, 4);
  doc.tables[0] = setGuests(doc.tables[0], 4, 50); doc.tables[1] = setGuests(doc.tables[1], 4, 50);
  assert.deepEqual(availability(doc), { used: 8, freeTables: 4, freeCast: 2, take: 2 });
  doc.casts.now = 0; assert.equal(availability(doc).take, 0);
  doc.casts.now = 5; assert.equal(availability(doc).take, 0);
});
test('add up to twenty, unique ids after deletions', () => {
  const doc = initialDoc(); doc.tables.splice(2, 1); addTable(doc);
  assert.equal(new Set(doc.tables.map(t => t.id)).size, 6);
  for (let i = 6; i < 20; i++) addTable(doc);
  assert.equal(doc.tables.length, 20); assert.throws(() => addTable(doc));
});
test('sort active near checks, preparation, empty', () => {
  const doc = initialDoc(), now = round5(Date.now());
  doc.tables[4] = startTable(setGuests(doc.tables[4], 2, 50, now));
  doc.tables[2] = startTable(setGuests(doc.tables[2], 2, 50, now - 300000));
  doc.tables[3] = setGuests(doc.tables[3], 2, 50, now);
  assert.deepEqual(orderedTables(doc.tables).map(t => t.id), ['t3', 't5', 't4', 't1', 't2', 't6']);
  assert.equal(endOf(doc.tables[4]), now + 3000000);
});
test('identity only exact fragment, strong random tokens, no secrets in query', () => {
  const room = randomToken(), key = randomToken();
  assert.match(room, /^[a-f0-9]{48}$/); assert.notEqual(room, key);
  const url = new URL(invitation('https://example.invalid/furikko-pair.html?endpoint=bad', room, 'vivace', key));
  assert.equal(url.search, ''); assert.equal(parseIdentity(url.hash).side, 'vivace');
  assert.equal(parseIdentity(url.hash + '&side=anela'), null);
  assert.equal(parseIdentity(url.hash + '%0A'), null);
  assert.equal(parseIdentity(url.hash + '%E2%80%A8'), null);
  assert.equal(parseIdentity('#room=bad'), null);
  assert.equal(parseIdentity(url.hash.replace('vivace', 'other')), null);
});
test('presence expires at 90 seconds; zero/missing/future not accepted', () => {
  const now = Date.now();
  assert.equal(isLive({ seen_at: new Date(now - 89999).toISOString() }, now), true);
  for (const seen_at of [new Date(now - 90000).toISOString(), new Date(0).toISOString(), null, 'bad', new Date(now + 120000).toISOString()]) assert.equal(isLive({ seen_at }, now), false);
});
test('alerts once per table and check time, extension gets new alert', () => {
  const now = Date.now(), tracker = createAlertTracker();
  const t = { ...initialDoc().tables[0], guests: 1, startAt: now - 46 * 60000, min: 50 };
  assert.equal(tracker([t]).length, 1); assert.equal(tracker([t]).length, 0);
  assert.equal(tracker([{ ...t, startAt: now - 47 * 60000 }]).length, 1);
  assert.equal(tracker([{ ...t, id: 'other', startAt: now - 60 * 60000 }]).length, 0);
});
test('waiting groups are bounded, unique and never auto-seat on removal', () => {
  const original = initialDoc(); let d = addWaiting(original, { id: 'w1', guests: 20, at: 4102444800000 });
  assert.equal(original.waiting.length, 0);
  assert.throws(() => addWaiting(d, { id: 'w1', guests: 2, at: 1 }));
  for (const group of [{ id: 'w2', guests: 0, at: 1 }, { id: 'w2', guests: 21, at: 1 },
    { id: 'w2', guests: 1, at: 0 }, { id: 'w2', guests: 1, at: 4102444800001 },
    { id: 'w2', guests: true, at: 1 }, { id: 'w2', guests: 1, at: null }, { id: 'w2', guests: 1, at: 1, note: 'no' }]) assert.throws(() => addWaiting(d, group));
  for (let i = 2; i <= 30; i++) d = addWaiting(d, { id: `w${i}`, guests: 1, at: i });
  assert.throws(() => addWaiting(d, { id: 'w31', guests: 1, at: 1 }));
  const removed = removeWaiting(d, 'w1'); assert.equal(removed.waiting.length, 29); assert.deepEqual(removed.tables, original.tables);
  assert.equal(d.waiting.length, 30); assert.throws(() => removeWaiting(removed, 'w1'));
});
test('optional roster batches separators, deduplicates, bounds names and links counts', () => {
  const original = initialDoc(); original.casts = { now: 10, total: 12 };
  const d = addRosterNames(original, 'あや ねおん\nさら、あや，りん・はな/さき｜れい');
  assert.deepEqual(d.castNames, ['あや', 'ねおん', 'さら', 'りん', 'はな', 'さき', 'れい']);
  assert.deepEqual(d.casts, { now: 7, total: 7 }); assert.equal(original.castNames.length, 0);
  assert.throws(() => addRosterNames(d, 'x'.repeat(25))); assert.throws(() => addRosterNames(d, '  '));
  assert.throws(() => replaceRoster(d, ['あや', 'あや'])); assert.throws(() => replaceRoster(d, [null]));
  assert.throws(() => replaceRoster(d, ['bad\nname'])); assert.throws(() => replaceRoster(d, [' leading']));
  const full = replaceRoster(d, Array.from({ length: 60 }, (_, i) => `源氏名${i}`)); assert.equal(full.casts.total, 60);
  assert.throws(() => addRosterNames(full, '61人目'));
  const mismatch = structuredClone(d); mismatch.casts.total = 8; assert.throws(() => validateDoc(mismatch));
  assert.deepEqual(replaceRoster(d, []).casts, { now: 0, total: 0 });
});
test('daily reset clears operations but preserves table configuration and set', () => {
  let d = initialDoc(); d.setMin = 60; d.tables[0] = startTable(setGuests({ ...d.tables[0], label: '入口', cap: 8 }, 4, 60));
  d = addWaiting(d, { id: 'w1', guests: 3, at: Date.now() }); d = addRosterNames(d, 'あや、さら'); d.casts.now = 2;
  const closed = closeBusiness(d);
  assert.deepEqual(closed.tables.map(t => [t.id, t.label, t.cap]), d.tables.map(t => [t.id, t.label, t.cap]));
  assert.equal(closed.setMin, 60); assert.ok(closed.tables.every(t => t.guests === 0 && t.startAt === 0 && t.planAt === 0 && t.min === 60));
  assert.deepEqual(closed.waiting, []); assert.deepEqual(closed.castNames, []); assert.deepEqual(closed.casts, { now: 0, total: 0 });
  assert.equal(d.waiting.length, 1); assert.equal(d.tables[0].guests, 4);
});
test('direct set and current-time controls change only the supplied draft', () => {
  const t = setGuests(initialDoc().tables[0], 3, 50, 1800000);
  const min = setTableMinutes(t, 60); assert.equal(t.min, 50); assert.equal(min.min, 60);
  const now = setTableNow(min, 2460000); assert.equal(now.planAt, round5(2460000)); assert.equal(now.startAt, 0); assert.equal(now.min, 60);
  const started = startTable(now); const adjusted = setTableNow(started, 3090000);
  assert.equal(adjusted.planAt, 0); assert.equal(adjusted.startAt, round5(3090000));
  assert.throws(() => setTableMinutes(t, 55));
});
test('notification text distinguishes remaining, due and overdue checks', () => {
  assert.equal(checkTiming(300000, 60000), 'あと4分');
  assert.equal(checkTiming(300000, 300000), 'チェック時間です');
  assert.equal(checkTiming(300000, 360001), 'チェック時間を2分経過');
  const tracker = createAlertTracker(), t = { ...initialDoc().tables[0], guests: 1, startAt: Date.now() - 61 * 60000 };
  assert.equal(tracker([t]).length, 0, 'old overdue state does not trigger a fresh alert');
});

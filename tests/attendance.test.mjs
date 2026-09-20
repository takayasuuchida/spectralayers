import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDoc, validateDoc, parseAttendance, importAttendance, addRosterNames, replaceRoster, effectiveCasts,
  synchronizeAttendance, setCastStatus, availability, setGuests, addWaiting, closeBusiness } from '../assets/furikko-pair-core.js';
import { attendanceText, attendanceNames } from './attendance-fixture.mjs';

test('exact attendance message: names only, late excluded until confirmed arrival', () => {
  const parsed = parseAttendance(attendanceText);
  assert.deepEqual(parsed.names, attendanceNames); assert.equal(parsed.declaredCount, 8); assert.equal(parsed.mismatch, false);
  let d = importAttendance(initialDoc(), parsed);
  assert.deepEqual(d.casts, { now: 7, total: 8 }); assert.equal(d.castStatus['なつき'], 'late');
  assert.equal(availability(d).freeCast, 7);
  d = setCastStatus(d, 'なつき', 'present'); assert.deepEqual(d.casts, { now: 8, total: 8 });
  d = setCastStatus(d, 'かんな', 'off'); assert.deepEqual(d.casts, { now: 7, total: 8 });
  assert.throws(() => setCastStatus(d, '不在', 'present')); assert.throws(() => setCastStatus(d, 'ゆあ', 'invalid'));
});
test('whole-line header variants, delimiters, statuses, deduplication and mismatch', () => {
  for (const header of ['anela', 'VIVACE', 'viverce', 'アネラ', 'ビバーチェ', '2026/09/20', '2026-09-20(日)', '2026年9月20日（日曜日）', '２０２６／０９／２０ 日曜', '出勤8名', '出勤　８人']) {
    assert.deepEqual(parseAttendance(`${header}\n${attendanceNames.join('\n')}`).names, attendanceNames, header);
  }
  assert.deepEqual(parseAttendance('あや あや、ゆあ，りん・はな/さき｜れい.ねおん').names, ['あや', 'ゆあ', 'りん', 'はな', 'さき', 'れい', 'ねおん']);
  assert.deepEqual(parseAttendance('なつき（遅刻）\nゆあ (退勤)\nりん 出勤中').castStatus, { なつき: 'late', ゆあ: 'off', りん: 'present' });
  assert.deepEqual(parseAttendance('ANELA子\n出勤子\n遅刻子\n休憩').names, ['ANELA子', '出勤子', '遅刻子', '休憩']);
  assert.equal(parseAttendance('出勤9人\nあや、ゆあ').mismatch, true);
  assert.equal(parseAttendance('あや、ゆあ').declaredCount, null);
  assert.equal(parseAttendance('あや 遅刻\nあや').castStatus['あや'], 'late');
  for (const input of ['', ' \n　', 'ANELA\n2026/09/20\n出勤8人', '遅刻', 'あや\n退勤', 'あや 遅刻\nあや 退勤', 'a\u0000b', 'x'.repeat(25), Array.from({ length: 61 }, (_, i) => `名${i}`).join('\n')]) assert.throws(() => parseAttendance(input), input);
  assert.equal(parseAttendance('😀'.repeat(24)).names[0].length, 48);
  assert.throws(() => parseAttendance('😀'.repeat(25)));
});
test('legacy now zero is effective attendance without modifying the source; manual zero remains zero', () => {
  const d = initialDoc(); d.castNames = [...attendanceNames]; d.casts.total = 8;
  const before = structuredClone(d); validateDoc(d);
  assert.deepEqual(effectiveCasts(d), { now: 8, total: 8 }); assert.equal(availability(d).freeCast, 8); assert.deepEqual(d, before);
  const migrated = synchronizeAttendance(d); assert.equal(migrated.casts.now, 8); assert.equal(Object.keys(migrated.castStatus).length, 8);
  const manual = initialDoc(); manual.casts.total = 8;
  assert.deepEqual(effectiveCasts(manual), { now: 0, total: 8 }); assert.equal(synchronizeAttendance(manual).casts.now, 0);
});
test('eight present minus preparation/active guests; waiting never consumes casts', () => {
  const d = importAttendance(initialDoc(), parseAttendance(attendanceNames.join('\n')));
  for (const [guests, free] of [[0, 8], [3, 5], [8, 0], [9, 0]]) {
    d.tables[0] = setGuests(d.tables[0], guests, 50);
    assert.equal(availability(d).freeCast, free);
    assert.equal(availability(addWaiting(d, { id: 'wait', guests: 20, at: 1 })).freeCast, free);
  }
});
test('ordinary edits preserve statuses, full import replaces them, reset clears them', () => {
  let d = importAttendance(initialDoc(), parseAttendance(attendanceText)); d = setCastStatus(d, 'ゆあ', 'off');
  d = addRosterNames(d, '新入り なつき ゆあ');
  assert.equal(d.castStatus['なつき'], 'late'); assert.equal(d.castStatus['ゆあ'], 'off'); assert.equal(d.castStatus['新入り'], 'present');
  d = replaceRoster(d, ['なつき', 'ゆあ', '新入り']); assert.deepEqual(d.casts, { now: 1, total: 3 });
  d = importAttendance(d, parseAttendance('なつき ゆあ')); assert.deepEqual(d.casts, { now: 2, total: 2 });
  assert.deepEqual(replaceRoster(d, []).castStatus, {}); assert.deepEqual(closeBusiness(d).castStatus, {});
});
test('status schema rejects null/array/missing/unknown/invalid keys or counts; safe special names', () => {
  const valid = importAttendance(initialDoc(), parseAttendance('__proto__ constructor toString'));
  assert.deepEqual(valid.casts, { now: 3, total: 3 }); assert.ok(Object.hasOwn(valid.castStatus, '__proto__'));
  const off = setCastStatus(valid, '__proto__', 'off'); assert.equal(off.casts.now, 2); assert.equal({}.polluted, undefined);
  for (const mutate of [d => d.castStatus = null, d => d.castStatus = [], d => d.castStatus = {},
    d => delete d.castStatus.constructor, d => d.castStatus.extra = 'present', d => d.castStatus.constructor = 'unknown',
    d => d.castStatus.constructor = null, d => d.castStatus.constructor = ['present'], d => d.casts.now = 0,
    d => d.casts.total = 4, d => d.extra = 1, d => d.castStatus.constructor = 'present\n']) {
    const d = structuredClone(valid); mutate(d); assert.throws(() => validateDoc(d));
  }
  for (const status of [null, [], { absent: 'present' }]) assert.throws(() => validateDoc({ ...initialDoc(), castStatus: status }));
  validateDoc({ ...initialDoc(), castStatus: {} });
});

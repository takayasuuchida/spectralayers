export const STORES = Object.freeze({ vivace: 'VIVACE', anela: 'ANELA' });
export const STORE_KANA = Object.freeze({ vivace: 'ビバーチェ', anela: 'アネラ' });
export const MAX_TIME = 4102444800000;
export const CAST_STATUSES = Object.freeze({ present: '出勤中', late: '遅刻', off: '退勤' });
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const TOKEN = /^[0-9a-f]{48}$/;
const int = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export function validateDoc(d) {
  const fields = ['tables', 'setMin', 'casts', 'waiting', 'castNames'];
  if (!d || (!exact(d, fields) && !exact(d, [...fields, 'castStatus'])) || ![50, 60].includes(d.setMin) ||
      !exact(d.casts, ['now', 'total']) || !int(d.casts.now, 0, 60) || !int(d.casts.total, d.casts.now, 60) ||
      !Array.isArray(d.tables) || d.tables.length > 20 || !Array.isArray(d.waiting) || d.waiting.length > 30 ||
      !Array.isArray(d.castNames) || d.castNames.length > 60) throw new Error('店舗の入力内容を確認してください。');
  const names = new Set();
  for (const name of d.castNames) {
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || [...name].length > 24 || CONTROL.test(name) || names.has(name)) {
      throw new Error('出勤名簿は重複なし・1名24文字以内で入力してください。');
    }
    names.add(name);
  }
  if (names.size && d.casts.total !== names.size) throw new Error('本日の合計は出勤名簿の人数に合わせてください。');
  if (Object.hasOwn(d, 'castStatus')) {
    if (!exact(d.castStatus, [...names]) || [...names].some(name => typeof d.castStatus[name] !== 'string' || !Object.hasOwn(CAST_STATUSES, d.castStatus[name]))) {
      throw new Error('出勤状態は名簿の全員に出勤中・遅刻・退勤を指定してください。');
    }
    if (names.size && d.casts.now !== [...names].filter(name => d.castStatus[name] === 'present').length) {
      throw new Error('今いる人数は出勤中の人数に合わせてください。');
    }
  }
  const waitIds = new Set();
  for (const w of d.waiting) {
    if (!exact(w, ['id', 'guests', 'at']) || typeof w.id !== 'string' || !w.id.length || w.id.length > 48 ||
        /[^A-Za-z0-9_-]/.test(w.id) || waitIds.has(w.id) || !int(w.guests, 1, 20) || !int(w.at, 1, MAX_TIME)) {
      throw new Error('待ちのお客様は30組まで、1組1〜20名で入力してください。');
    }
    waitIds.add(w.id);
  }
  const ids = new Set();
  for (const t of d.tables) {
    if (!exact(t, ['id', 'label', 'cap', 'guests', 'startAt', 'planAt', 'min']) ||
        typeof t.id !== 'string' || !t.id.length || t.id.length > 48 || /[^A-Za-z0-9_-]/.test(t.id) || ids.has(t.id) ||
        typeof t.label !== 'string' || !t.label.trim() || [...t.label].length > 24 || CONTROL.test(t.label) ||
        !int(t.cap, 1, 12) || !int(t.guests, 0, 20) || !int(t.min, 5, 600) ||
        !int(t.startAt, 0, MAX_TIME) || !int(t.planAt, 0, MAX_TIME) ||
        (t.startAt > 0 && t.planAt > 0) || (t.guests === 0 && (t.startAt || t.planAt))) {
      throw new Error('卓の入力内容を確認してください。');
    }
    ids.add(t.id);
  }
  if (new TextEncoder().encode(JSON.stringify(d)).length > 65536) throw new Error('入力が長すぎます。');
  return d;
}
export const makeTable = (i, min = 50) => ({ id: `t${i}`, label: `卓${i}`, cap: 4, guests: 0, startAt: 0, planAt: 0, min });
export const initialDoc = () => ({ tables: Array.from({ length: 6 }, (_, i) => makeTable(i + 1)), setMin: 50, casts: { now: 0, total: 0 }, waiting: [], castNames: [] });
export const clone = d => structuredClone(d);
export const round5 = ms => Math.round(ms / 300000) * 300000;
export const endOf = t => (t.startAt || t.planAt || 0) + t.min * 60000;
export const hhmm = ms => new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function clockParts(value) {
  if (typeof value !== 'string' || value.length !== 5 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('時刻を入力してください。');
  return value.split(':').map(Number);
}
export function startTime(value, now = Date.now()) {
  const [h, m] = clockParts(value), d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() - now > 6 * 3600000) d.setDate(d.getDate() - 1);
  if (now - d.getTime() > 18 * 3600000) d.setDate(d.getDate() + 1);
  return round5(d.getTime());
}
export function durationTo(value, base) {
  const [h, m] = clockParts(value), d = new Date(base);
  d.setHours(h, m, 0, 0);
  let end = round5(d.getTime());
  if (end <= base) { d.setDate(d.getDate() + 1); end = round5(d.getTime()); }
  const min = Math.round((end - base) / 60000);
  if (!int(min, 5, 600)) throw new Error('チェックは開始から5〜600分の範囲にしてください。');
  return min;
}
export function setGuests(t, guests, setMin, now = Date.now()) {
  if (!int(guests, 0, 20)) throw new Error('お客様は0〜20名で入力してください。');
  if (!guests) return { ...t, guests: 0, startAt: 0, planAt: 0, min: setMin };
  return { ...t, guests, planAt: t.startAt ? 0 : (t.planAt || round5(now)) };
}
export function startTable(t, now = Date.now()) {
  if (!t.guests) throw new Error('お客様の人数を選んでください。');
  if (t.startAt) throw new Error('すでにスタートしています。');
  return { ...t, startAt: t.planAt || round5(now), planAt: 0 };
}
export function extendTable(t, delta) {
  if (!t.guests || !t.startAt) throw new Error('スタート後に延長できます。');
  if (![25, 50].includes(delta) || t.min + delta > 600) throw new Error('合計600分まで延長できます。');
  return { ...t, min: t.min + delta };
}
export function adjustTable(t, delta, target = 'end') {
  if (!t.guests || ![-5, 5].includes(delta)) throw new Error('人数と調整時間を確認してください。');
  if (target === 'end') {
    if (!int(t.min + delta, 5, 600)) throw new Error('チェックは5〜600分の範囲にしてください。');
    return { ...t, min: t.min + delta };
  }
  const field = t.startAt ? 'startAt' : 'planAt';
  const value = t[field] + delta * 60000;
  if (!int(value, 1, MAX_TIME)) throw new Error('開始時刻を確認してください。');
  return { ...t, [field]: value };
}
export const checkout = (t, setMin) => ({ ...t, guests: 0, startAt: 0, planAt: 0, min: setMin });
export function setTableMinutes(t, min) {
  if (![50, 60].includes(min)) throw new Error('セットは50分・60分から選んでください。');
  return { ...t, min };
}
export function setTableNow(t, now = Date.now()) {
  if (!t.guests) throw new Error('お客様の人数を選んでください。');
  return { ...t, [t.startAt ? 'startAt' : 'planAt']: round5(now) };
}
export function addWaiting(doc, group) {
  const next = clone(doc); next.waiting.push({ ...group }); return validateDoc(next);
}
export function removeWaiting(doc, id) {
  if (!doc.waiting.some(w => w.id === id)) throw new Error('この待ち組はすでに案内済みです。');
  const next = clone(doc); next.waiting = next.waiting.filter(w => w.id !== id); return next;
}
export function replaceRoster(doc, names) {
  const next = clone(doc); next.castNames = [...names];
  next.castStatus = Object.fromEntries(names.map(name => [name, doc.castStatus && Object.hasOwn(doc.castStatus, name) ? doc.castStatus[name] : 'present']));
  next.casts = { now: names.filter(name => next.castStatus[name] === 'present').length, total: names.length };
  return validateDoc(next);
}
export function effectiveCasts(doc) {
  return doc.castNames.length ? { now: doc.castNames.filter(name => !doc.castStatus || doc.castStatus[name] === 'present').length, total: doc.castNames.length } : { ...doc.casts };
}
// Reading never migrates a stored document. Call only on an explicit mutation.
export function synchronizeAttendance(doc) {
  validateDoc(doc);
  const next = clone(doc);
  next.castStatus = Object.fromEntries(doc.castNames.map(name => [name, doc.castStatus?.[name] ?? 'present']));
  next.casts = effectiveCasts(doc);
  return validateDoc(next);
}
export function setCastStatus(doc, name, status) {
  if (!doc.castNames.includes(name) || typeof status !== 'string' || !Object.hasOwn(CAST_STATUSES, status)) throw new Error('出勤状態を確認してください。');
  const next = synchronizeAttendance(doc); next.castStatus[name] = status;
  next.casts = effectiveCasts(next); return validateDoc(next);
}
export function parseAttendance(raw) {
  if (typeof raw !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(raw)) throw new Error('出勤表の文字を確認してください。');
  const entries = new Map(); let declaredCount = null;
  for (const input of raw.split(/\r?\n|\r/u)) {
    const line = input.trim(), header = line.normalize('NFKC');
    if (!line || /^(ANELA|VIVACE|VIVERCE|アネラ|ビバーチェ)$/i.test(header)) continue;
    if (/^\d{4}(?:\/\d{1,2}\/\d{1,2}|-\d{1,2}-\d{1,2}|年\s*\d{1,2}月\s*\d{1,2}日)(?:\s*(?:\([月火水木金土日](?:曜日|曜)?\)|[月火水木金土日](?:曜日|曜)?))?$/u.test(header)) continue;
    const count = header.match(/^出勤\s*(\d+)\s*[人名]$/u);
    if (count) { declaredCount = Number(count[1]); continue; }
    const parts = line.replace(/[（(]\s*(出勤中|遅刻|退勤)\s*[）)]/gu, ' $1 ').split(/[\s　,、，.．。・･\/｜|]+/u).filter(Boolean);
    let previous = null;
    for (const part of parts) {
      const status = Object.entries(CAST_STATUSES).find(([, label]) => label === part)?.[0];
      if (status) {
        if (previous === null) throw new Error('出勤状態は名前の後ろに付けてください。');
        const old = entries.get(previous);
        if (old.explicit && old.status !== status) throw new Error(`${previous}の出勤状態が重複しています。`);
        entries.set(previous, { status, explicit: true }); previous = null;
      } else {
        if (part === '出勤' || /^\d+[人名]$/u.test(part.normalize('NFKC'))) throw new Error('見出しは「出勤 8人」のように1行で入力してください。');
        if (!entries.has(part)) entries.set(part, { status: 'present', explicit: false });
        previous = part;
      }
    }
  }
  if (!entries.size) throw new Error('名前が見つかりません。出勤する名前を入力してください。');
  const names = [...entries.keys()], castStatus = Object.fromEntries([...entries].map(([name, value]) => [name, value.status]));
  const doc = replaceRoster(initialDoc(), names); doc.castStatus = castStatus; doc.casts = effectiveCasts(doc); validateDoc(doc);
  return { names, castStatus, declaredCount, mismatch: declaredCount !== null && declaredCount !== names.length };
}
export function importAttendance(doc, parsed) {
  const next = replaceRoster(doc, parsed.names); next.castStatus = clone(parsed.castStatus);
  next.casts = effectiveCasts(next); return validateDoc(next);
}
export function addRosterNames(doc, raw) {
  const parsed = parseAttendance(raw), next = replaceRoster(doc, [...new Set([...doc.castNames, ...parsed.names])]);
  for (const name of parsed.names) if (!doc.castNames.includes(name)) next.castStatus[name] = parsed.castStatus[name];
  next.casts = effectiveCasts(next); return validateDoc(next);
}
export function closeBusiness(doc) {
  const next = clone(doc); next.tables = next.tables.map(t => checkout(t, next.setMin));
  next.waiting = []; next.castNames = []; next.castStatus = {}; next.casts = { now: 0, total: 0 }; return validateDoc(next);
}
export function checkTiming(end, now = Date.now()) {
  const left = end - now;
  return left > 0 ? `あと${Math.ceil(left / 60000)}分` : left === 0 ? 'チェック時間です' : `チェック時間を${Math.ceil(-left / 60000)}分経過`;
}
export function addTable(doc) {
  if (doc.tables.length >= 20) throw new Error('卓は20卓までです。');
  let i = 1;
  while (doc.tables.some(t => t.id === `t${i}`)) i++;
  doc.tables.push(makeTable(i, doc.setMin));
  return doc;
}
export function availability(doc) {
  const used = doc.tables.reduce((n, t) => n + t.guests, 0);
  const free = doc.tables.filter(t => !t.guests);
  const freeCast = Math.max(0, effectiveCasts(doc).now - used);
  return { used, freeTables: free.length, freeCast, take: Math.min(freeCast, Math.max(0, ...free.map(t => t.cap))) };
}
export function orderedTables(tables) {
  const group = t => t.guests ? (t.startAt ? 0 : 1) : 2;
  return tables.map((t, i) => ({ t, i })).sort((a, b) => group(a.t) - group(b.t) ||
    (group(a.t) === 0 ? endOf(a.t) - endOf(b.t) : 0) || a.i - b.i).map(x => x.t);
}
export function isLive(row, now = Date.now()) {
  const seen = Date.parse(row?.seen_at);
  return Number.isFinite(seen) && seen <= now + 60000 && now - seen < 90000;
}
export function randomToken(cryptoAPI = globalThis.crypto) {
  return [...cryptoAPI.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function parseIdentity(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if ([...p.keys()].length !== 3 || !['room', 'side', 'key'].every(k => p.has(k))) return null;
  const identity = { room: p.get('room'), side: p.get('side'), key: p.get('key') };
  return identity.room.length === 48 && identity.key.length === 48 && TOKEN.test(identity.room) && TOKEN.test(identity.key) && identity.room !== identity.key &&
    Object.hasOwn(STORES, identity.side) ? Object.freeze(identity) : null;
}
export function invitation(base, room, side, key) {
  const url = new URL(base); url.search = ''; url.hash = new URLSearchParams({ room, side, key }).toString();
  return url.href;
}
export function createAlertTracker() {
  const fired = new Set();
  return tables => tables.filter(t => {
    const key = `${t.id}:${endOf(t)}`;
    const left = endOf(t) - Date.now();
    if (!t.startAt || !t.guests || left > 300000 || left < -300000 || fired.has(key)) return false;
    fired.add(key); return true;
  });
}

import { STORES, STORE_KANA, clone, validateDoc, round5, endOf, hhmm, startTime, durationTo, setGuests,
  startTable, extendTable, adjustTable, checkout, addTable, availability, orderedTables, isLive,
  randomToken, parseIdentity, invitation, createAlertTracker, setTableMinutes, setTableNow,
  addWaiting, removeWaiting, addRosterNames, replaceRoster, closeBusiness, checkTiming } from './furikko-pair-core.js';
import { createApi, PairSession } from './furikko-pair-api.js';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeLoad = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const safeSave = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const OWNER_KEY = 'furikko-pair:owners:v1', DEVICE_KEY = 'furikko-pair:device:v1';
const loadedOwners = safeLoad(OWNER_KEY);
const owners = loadedOwners && typeof loadedOwners === 'object' && !Array.isArray(loadedOwners) ? loadedOwners : {};
const api = createApi();
let session = null, identity = parseIdentity(location.hash), draft = null, settingsRevision = null;
let sound = null, soundOn = false, transitioning = false, creationPending = false;
const alertTracker = createAlertTracker();
let alerts = [];
let waitingDraft = null, rosterDraft = null, resetRevision = null, rosterExpanded = false;
const setMessage = (id, message) => { $(id).textContent = message; $(id).hidden = !message; };
const mineRow = () => session?.rows[identity.side];
const currentLink = () => invitation(location.href, identity.room, identity.side, identity.key);
const canSave = () => Boolean(session?.connected && !session.pending && !transitioning);
const showError = (id, error) => setMessage(id, error?.message || '操作を確認できませんでした。');

$('guide-link').href = `furikko-pair-guide.html${location.hash}`;
if (identity) {
  safeSave(DEVICE_KEY, identity);
  $('board').hidden = false;
  $('current-store').textContent = `${STORES[identity.side]} / ${STORE_KANA[identity.side]}`;
  session = new PairSession(identity, api, render);
  render();
} else {
  $('landing').hidden = false;
  if (location.hash) setMessage('landing-message', 'リンクの形式を確認できません。店舗用リンクを省略せず開いてください。');
  $('restore-links').hidden = !Object.keys(owners).some(room => ownerLinks(room));
  const previous = safeLoad(DEVICE_KEY);
  if (previous && parseIdentity(new URL(invitation(location.href, previous.room, previous.side, previous.key)).hash)) {
    $('resume-link').href = invitation(location.href, previous.room, previous.side, previous.key);
    $('resume-link').textContent = `前回の${STORES[previous.side]}を開く`;
    $('resume-link').hidden = false;
  }
}

function ownerLinks(room) {
  const entry = owners[room];
  if (!entry || typeof entry !== 'object') return null;
  const pair = Object.keys(STORES).map(side => ({ side, href: invitation(location.href, room, side, entry[side]) }));
  return pair.every(p => parseIdentity(new URL(p.href).hash)) ? pair : null;
}
function showLinks(room = identity?.room) {
  const links = ownerLinks(room) || (identity && room === identity.room ? [{ side: identity.side, href: currentLink() }] : []);
  $('link-list').replaceChildren();
  for (const link of links) {
    const card = document.createElement('section'); card.className = 'link-card';
    const title = document.createElement('h3'); title.textContent = `${STORES[link.side]} / ${STORE_KANA[link.side]} 用`;
    const input = document.createElement('input'); input.value = link.href; input.readOnly = true; input.setAttribute('aria-label', `${STORES[link.side]}用リンク`);
    input.addEventListener('click', () => input.select());
    const actions = document.createElement('div'); actions.className = 'link-actions';
    const copy = document.createElement('button'); copy.textContent = 'リンクをコピー';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(link.href); setMessage('link-message', `${STORES[link.side]}用リンクをコピーしました。`); }
      catch { input.focus(); input.select(); input.setSelectionRange(0, input.value.length); setMessage('link-message', 'リンクを選択しました。長押し、またはコピー操作で保管してください。'); }
    };
    const open = document.createElement('a'); open.className = 'button primary'; open.textContent = `${STORES[link.side]}を開く`; open.href = link.href;
    actions.append(copy, open);
    if (navigator.share) {
      const share = document.createElement('button'); share.textContent = '共有';
      share.onclick = async () => { try { await navigator.share({ title: `${STORES[link.side]} 振りっこボード`, url: link.href }); }
        catch (e) { if (e.name !== 'AbortError') setMessage('link-message', 'リンクをコピーして共有してください。'); } };
      actions.append(share);
    }
    card.append(title, input, actions); $('link-list').append(card);
  }
  setMessage('link-message', links.length === 1 ? 'この端末では、自店舗用リンクを共有できます。相手店舗の編集リンクは作成した方に確認してください。' : '店舗名を確認して、それぞれの担当者へ渡してください。');
  if (!$('links').open) $('links').showModal();
}
$('create-room').onclick = async () => {
  if (creationPending || transitioning) return;
  creationPending = true; $('create-room').disabled = true; setMessage('landing-message', '専用ボードを作成しています…');
  const room = randomToken(); let vivace = randomToken(), anela = randomToken();
  while (vivace === room) vivace = randomToken();
  while (anela === room || anela === vivace) anela = randomToken();
  try {
    const result = await api.call('create_furikko_pair', { p_room: room, p_vivace_key: vivace, p_anela_key: anela });
    if (transitioning) return;
    if (result?.created !== true) throw new Error('作成結果を確認できませんでした。もう一度お試しください。');
    owners[room] = { vivace, anela };
    const stored = safeSave(OWNER_KEY, owners);
    $('restore-links').hidden = false;
    setMessage('landing-message', '専用ボードを作成しました。店舗用リンクから開いてください。');
    showLinks(room);
    if (!stored) setMessage('link-message', 'このブラウザに保存できませんでした。画面を閉じる前に、2本の店舗用リンクをコピーして保管してください。');
  } catch (e) { if (!transitioning) showError('landing-message', e); }
  finally { creationPending = false; $('create-room').disabled = false; }
};
$('restore-links').onclick = () => {
  const rooms = Object.keys(owners).filter(room => ownerLinks(room));
  if (rooms.length) showLinks(rooms.at(-1));
};
$('share-links').onclick = () => showLinks();

async function refreshAndHeartbeat() {
  if (session && !document.hidden && await session.refresh()) await session.heartbeat();
}
$('refresh').onclick = refreshAndHeartbeat;
function render() {
  if (!session || transitioning) return;
  $('status').textContent = session.status;
  $('status').dataset.ok = String(session.connected && session.status === '共有中');
  $('status').dataset.error = String(['通信できません', '保存できません'].includes(session.status));
  $('pending').textContent = session.pending ? '保存を確認中…' : '';
  setMessage('notice', session.message);
  const peer = identity.side === 'vivace' ? 'anela' : 'vivace';
  renderStore($('mine'), identity.side, true); renderStore($('partner'), peer, false);
  updateEditorControls();
  $('save-settings').disabled = !canSave();
  for (const field of $('settings-form').querySelectorAll('input, select')) field.disabled = Boolean(session.pending);
  for (const id of ['save-waiting', 'save-roster']) $(id).disabled = !canSave();
  for (const field of document.querySelectorAll('#waiting-form input, #waiting-form [data-wait-guests], #roster-form textarea, #roster-form [data-remove-name], #add-roster')) field.disabled = Boolean(session.pending);
  $('confirm-business-close').disabled = !canSave() || resetRevision !== mineRow()?.revision;
  if ($('business-close').open && resetRevision !== mineRow()?.revision) setMessage('business-close-error', '他の端末で更新されました。閉じて最新の状況を確認し、営業終了をやり直してください。');
  if ($('roster-editor').open && rosterDraft?.revision !== mineRow()?.revision) {
    $('reload-roster').hidden = false;
    setMessage('roster-error', '保存済みの内容が更新されています。入力は残しています。最新の名簿を読み直してから操作してください。');
  }
  checkAlerts();
}
function renderStore(root, side, own) {
  const row = session.rows[side];
  const confirmed = session.connected && Date.now() - session.lastFetched < 90000;
  const live = confirmed && isLive(row);
  const unshared = row && Date.parse(row.seen_at) === 0;
  let summary;
  if (!row) summary = `<div class="summary waiting"><strong>${session.connected ? '未共有' : '確認待ち'}</strong><p class="muted">${own ? '店舗の情報を確認しています。' : '相手店舗の共有を待っています。'}</p></div>`;
  else {
    const a = availability(row.data);
    const state = !confirmed ? '確認待ち' : !live ? (own ? '自店舗の接続を確認' : unshared ? '未共有' : '相手店の接続を確認') : a.take > 0 ? '受け入れの目安' : !a.freeTables ? '空き卓なし' : 'キャスト待ち';
    summary = `<div class="summary ${live && a.take > 0 ? 'good' : 'waiting'}"><strong>${state}</strong><div class="take">${live ? a.take : '—'}<small>${live ? '名まで / 1組の目安' : '接続確認後に目安を表示'}</small></div><div class="metrics"><span>お客様 ${a.used}名</span><span>空き ${a.freeTables}卓</span><span>キャスト ${row.data.casts.now} / ${row.data.casts.total}名</span><span>キャスト余り ${a.freeCast}名</span></div>${!live ? '<p class="muted">表示中の卓・人数は最後に確認した内容です。</p>' : ''}</div>`;
  }
  const tables = row ? orderedTables(row.data.tables).map(t => tableMarkup(t, own)).join('') : '';
  const extras = row ? operationsMarkup(row.data, own) : '';
  const markup = `<div class="store-heading"><div><div class="eyebrow">${own ? '今使う店舗 · 編集できます' : '相手店舗 · 閲覧のみ'}</div><h2>${STORES[side]} <small>${STORE_KANA[side]}</small></h2></div></div>${summary}${!own ? '<button data-return-mine class="quiet">自店舗へ戻る</button>' : ''}<div class="tables">${tables}</div>${own && row ? `<div class="store-actions"><button data-settings ${!session.connected ? 'disabled' : ''}>キャスト・セット</button><button data-add ${!session.connected || row.data.tables.length >= 20 ? 'disabled' : ''}>＋ 卓を追加</button></div>` : ''}${extras}`;
  // Keep keyboard focus on the same table/action across poll and clock updates.
  const focused = root.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focused?.dataset.table;
  const focusAction = focused?.hasAttribute('data-settings') ? '[data-settings]' : focused?.hasAttribute('data-add') ? '[data-add]' : null;
  if (root.dataset.markup !== markup) {
    root.innerHTML = markup; root.dataset.markup = markup;
    const replacement = focusId ? root.querySelector(`[data-table="${CSS.escape(focusId)}"]`) : focusAction ? root.querySelector(focusAction) : null;
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
  }
}
function operationsMarkup(doc, own) {
  const disabled = !canSave() ? 'disabled' : '';
  const waiting = [...doc.waiting].sort((a, b) => a.at - b.at);
  const waitList = waiting.map((w, index) => `<div class="waiting-row"><span>${index + 1}組目 · ${w.guests}名<small>${hhmm(w.at)} 受付 · ${Math.max(0, Math.floor((Date.now() - w.at) / 60000))}分待ち</small></span>${own ? `<button data-guide-wait="${esc(w.id)}" ${disabled}>案内した</button>` : ''}</div>`).join('');
  const roster = `<p>${doc.castNames.length ? doc.castNames.map(esc).join('・') : '名簿は未入力です。人数だけでも使えます。'}</p>`;
  return `<section class="waiting-list"><h3>待ちのお客様 · ${waiting.length}組 / ${waiting.reduce((n, w) => n + w.guests, 0)}名</h3>${waitList}${own ? `<button data-open-wait ${disabled || (waiting.length >= 30 ? 'disabled' : '')}>＋ 待ちのお客様を入れる</button><p class="muted">「案内した」は待ち一覧から外します。卓への入店は別操作です。</p>` : ''}</section>${own ? `<details class="roster-view" data-roster-details ${rosterExpanded ? 'open' : ''}><summary>出勤名簿（任意） · ${doc.castNames.length}名</summary>${roster}<button data-open-roster ${disabled}>名簿を編集</button></details><div class="store-footer"><button data-business-close class="quiet danger-text" ${disabled}>営業終了</button></div>` : `<section class="roster-view"><h3>出勤名簿 · ${doc.castNames.length}名</h3>${roster}</section>`}`;
}
function scrollToStore(id) { $(id).scrollIntoView({ behavior: 'auto', block: 'start' }); }
$('jump-mine').onclick = () => scrollToStore('mine');
$('jump-partner').onclick = () => scrollToStore('partner');
$('partner').onclick = e => { if (e.target.closest('[data-return-mine]')) scrollToStore('mine'); };
$('mine').addEventListener('toggle', e => { if (e.target.matches('[data-roster-details]')) rosterExpanded = e.target.open; }, true);
function tableMarkup(t, own) {
  const active = t.guests > 0 && t.startAt > 0, left = endOf(t) - Date.now();
  const cls = active ? left <= 300000 ? 'due' : left <= 600000 ? 'soon' : '' : t.guests ? 'prep' : 'empty';
  const tag = own ? 'button' : 'div';
  const at = active ? hhmm(endOf(t)) : t.guests ? '準備中' : '空席';
  const meta = active ? `${t.guests}名 · ${hhmm(t.startAt)} 開始 · ${t.min}分` : t.guests ? `${t.guests}名 · ${hhmm(t.planAt)} 開始予定` : `${t.cap}席`;
  return `<${tag} class="table ${cls}" ${own ? `data-table="${esc(t.id)}" aria-label="${esc(t.label)}を編集" ${!session.connected ? 'disabled' : ''}` : ''}><div><strong>${esc(t.label)}</strong><small>${meta}</small></div><div class="table-check"><strong>${at}</strong><small>${active ? left <= 0 ? 'チェック時間です' : `あと${Math.ceil(left / 60000)}分` : own ? 'タップして編集' : ' '}</small></div></${tag}>`;
}
$('mine').onclick = async e => {
  const table = e.target.closest('[data-table]');
  if (table && session.connected) openEditor(table.dataset.table);
  if (e.target.closest('[data-settings]') && session.connected) openSettings();
  if (e.target.closest('[data-add]')) {
    try { await session.mutate(addTable); } catch (err) { showError('notice', err); }
  }
  if (e.target.closest('[data-open-wait]') && canSave()) {
    waitingDraft = { id: `w${randomToken().slice(0, 24)}`, at: Date.now() };
    $('waiting-guests').value = '1'; setMessage('waiting-error', ''); $('waiting-editor').showModal();
  }
  const guided = e.target.closest('[data-guide-wait]');
  if (guided && canSave()) {
    const id = guided.dataset.guideWait, revision = mineRow().revision;
    try { await session.mutate(doc => removeWaiting(doc, id), { expectedRevision: revision }); }
    catch (err) { showError('notice', err); }
  }
  if (e.target.closest('[data-open-roster]') && canSave()) openRoster();
  if (e.target.closest('[data-business-close]') && canSave()) {
    const row = mineRow(); resetRevision = row.revision;
    $('business-close-summary').textContent = `${STORES[identity.side]}：お客様 ${availability(row.data).used}名、待ち ${row.data.waiting.length}組、出勤名簿 ${row.data.castNames.length}名`;
    setMessage('business-close-error', ''); $('confirm-business-close').disabled = false; $('business-close').showModal();
  }
};
$('waiting-form').addEventListener('click', e => {
  const choice = e.target.closest('[data-wait-guests]'); if (choice) $('waiting-guests').value = choice.dataset.waitGuests;
});
$('waiting-form').onsubmit = async e => {
  e.preventDefault(); if (!canSave() || !waitingDraft) return;
  const group = { ...waitingDraft, guests: Number($('waiting-guests').value) };
  try { await session.mutate(doc => addWaiting(doc, group)); waitingDraft = null; $('waiting-editor').close(); }
  catch (err) { showError('waiting-error', err); }
};
function openRoster() {
  const row = mineRow(); rosterDraft = { doc: clone(row.data), revision: row.revision, originalNow: row.data.casts.now, dirty: false };
  $('roster-input').value = ''; setMessage('roster-error', ''); $('reload-roster').hidden = true;
  renderRosterDraft(); if (!$('roster-editor').open) $('roster-editor').showModal();
}
function renderRosterDraft() {
  rosterDraft.doc = replaceRoster(rosterDraft.doc, rosterDraft.doc.castNames);
  rosterDraft.doc.casts.now = Math.min(rosterDraft.originalNow, rosterDraft.doc.castNames.length);
  $('roster-draft-list').innerHTML = rosterDraft.doc.castNames.map((name, index) => `<div class="name-chip"><span>${esc(name)}</span><button type="button" data-remove-name="${index}" aria-label="${esc(name)}を名簿から外す">×</button></div>`).join('');
  $('roster-draft-note').textContent = `保存後の本日の合計：${rosterDraft.doc.castNames.length}名。今いる人数：${rosterDraft.doc.casts.now}名。保存するまで共有されません。名簿を空にすると人数も0名に戻ります。`;
}
function addRosterDraft() {
  rosterDraft.doc = addRosterNames(rosterDraft.doc, $('roster-input').value); rosterDraft.dirty = true;
  $('roster-input').value = ''; renderRosterDraft(); setMessage('roster-error', '');
}
$('add-roster').onclick = () => { try { addRosterDraft(); } catch (e) { showError('roster-error', e); } };
$('roster-draft-list').onclick = e => {
  const button = e.target.closest('[data-remove-name]'); if (!button || session.pending) return;
  rosterDraft.doc = replaceRoster(rosterDraft.doc, rosterDraft.doc.castNames.filter((_, index) => index !== Number(button.dataset.removeName)));
  rosterDraft.dirty = true; renderRosterDraft();
};
$('roster-form').onsubmit = async e => {
  e.preventDefault(); if (!canSave()) return;
  try {
    if ($('roster-input').value.trim()) addRosterDraft();
    const names = [...rosterDraft.doc.castNames], revision = rosterDraft.revision;
    await session.mutate(doc => replaceRoster(doc, names), { expectedRevision: revision });
    rosterDraft = null; $('roster-editor').close();
  } catch (err) { showError('roster-error', err); if (err.status === 409) $('reload-roster').hidden = false; }
};
$('reload-roster').onclick = () => { if (session.connected && confirm('入力中の名簿を破棄して、保存済みの名簿を読み直しますか？')) openRoster(); };
$('confirm-business-close').onclick = async () => {
  if (!canSave() || resetRevision === null) return;
  const revision = resetRevision;
  try { await session.mutate(closeBusiness, { expectedRevision: revision }); resetRevision = null; $('business-close').close(); }
  catch (err) { showError('business-close-error', err); }
};
function openEditor(id) {
  const row = mineRow(), t = row?.data.tables.find(x => x.id === id);
  if (!t) { setMessage('notice', 'この卓は削除されています。'); return; }
  draft = { table: clone(t), original: clone(t), revision: row.revision, setMin: row.data.setMin, dirty: false };
  setMessage('editor-error', ''); $('reload-draft').hidden = true;
  writeFields();
  if (!$('editor').open) $('editor').showModal();
}
function guestOptions() {
  const cap = Number($('table-cap').value), guests = draft.table.guests;
  $('table-guests').replaceChildren(...Array.from({ length: Math.max(Number.isInteger(cap) ? Math.min(12, Math.max(1, cap)) : 1, guests) + 1 }, (_, n) => {
    const option = document.createElement('option'); option.value = n; option.textContent = `${n}名`; return option;
  }));
  $('table-guests').value = String(guests);
}
function writeFields() {
  const t = draft.table;
  $('editor-title').textContent = `${STORES[identity.side]} · 卓の編集`;
  $('draft-notice').textContent = '保存するまで相手店舗には反映されません。';
  $('table-label').value = t.label; $('table-cap').value = t.cap; guestOptions();
  $('table-start').value = hhmm(t.startAt || t.planAt || round5(Date.now()));
  $('table-end').value = hhmm((t.startAt || t.planAt || round5(Date.now())) + t.min * 60000);
  $('start-label').firstChild.textContent = t.startAt ? '開始時刻' : '開始予定';
  $('duration').textContent = `合計 ${t.min}分 · 時刻は5分単位に丸めます`;
  for (const button of document.querySelectorAll('[data-set-min]')) button.setAttribute('aria-pressed', String(Number(button.dataset.setMin) === t.min));
  updateEditorControls();
}
function readFields() {
  let t = { ...draft.table, label: $('table-label').value.trim(), cap: Number($('table-cap').value) };
  const selectedMin = t.min;
  t = setGuests(t, Number($('table-guests').value), draft.setMin);
  if (!t.guests && !draft.original.guests) t.min = selectedMin;
  if (t.guests) {
    const base = startTime($('table-start').value, t.startAt || t.planAt || Date.now());
    t[t.startAt ? 'startAt' : 'planAt'] = base;
    t.min = durationTo($('table-end').value, base);
  }
  validateDoc({ tables: [t], setMin: draft.setMin, casts: { now: 0, total: 0 }, waiting: [], castNames: [] });
  return t;
}
function updateEditorControls() {
  if (!draft) return;
  const t = draft.table, guests = Number($('table-guests').value);
  $('time-fields').hidden = !guests;
  $('table-start').required = Boolean(guests); $('table-end').required = Boolean(guests);
  $('extensions').hidden = !t.startAt;
  $('start-table').hidden = Boolean(t.startAt);
  $('checkout-table').hidden = !draft.original.guests;
  for (const id of ['start-table', 'save-table', 'checkout-table', 'delete-table']) $(id).disabled = !canSave();
  for (const field of $('table-form').querySelectorAll('input, select, [data-adjust], [data-extend], [data-set-min], #table-now')) field.disabled = Boolean(session?.pending);
  if (!guests) $('start-table').disabled = true;
  if (mineRow()?.revision !== draft.revision) {
    $('draft-notice').textContent = '保存済みの内容が更新されています。入力は残しています。最新の卓を読み直してから操作してください。';
    $('reload-draft').hidden = false;
  }
}
$('table-form').addEventListener('input', () => { if (draft) draft.dirty = true; updateEditorControls(); });
$('table-cap').addEventListener('change', () => { draft.table.guests = Number($('table-guests').value); guestOptions(); });
$('table-guests').addEventListener('change', () => {
  try {
    // Capture the selection first; never start with an implicit default guest count.
    draft.table = setGuests({ ...draft.table, label: $('table-label').value, cap: Number($('table-cap').value) }, Number($('table-guests').value), draft.setMin);
    updateEditorControls();
  } catch (e) { showError('editor-error', e); }
});
$('table-form').addEventListener('click', e => {
  const adjust = e.target.closest('[data-adjust]'), extend = e.target.closest('[data-extend]'), setMin = e.target.closest('[data-set-min]'), now = e.target.closest('#table-now');
  if (!adjust && !extend && !setMin && !now) return;
  try {
    let t = readFields();
    if (adjust) { const [target, delta] = adjust.dataset.adjust.split(':'); t = adjustTable(t, Number(delta), target); }
    else if (extend) t = extendTable(t, Number(extend.dataset.extend));
    else if (setMin) t = setTableMinutes(t, Number(setMin.dataset.setMin));
    else t = setTableNow(t);
    draft.table = t; draft.dirty = true; writeFields(); setMessage('editor-error', '');
  } catch (err) { showError('editor-error', err); }
});
async function saveTable(mode) {
  if (!canSave()) return;
  const captured = draft;
  try {
    let t = mode === 'checkout' ? checkout(captured.original, captured.setMin) : mode === 'delete' ? captured.original : readFields();
    if (mode === 'start') t = startTable(t);
    if (mode === 'delete' && !confirm(captured.original.guests ? 'お客様がいる卓です。この卓を削除してよろしいですか？' : 'この卓を削除してよろしいですか？')) return;
    if ((mode === 'checkout' || (captured.original.guests && !t.guests && mode !== 'delete')) && !confirm('チェック完了として、この卓を空席にしますか？')) return;
    await session.mutate(doc => {
      const i = doc.tables.findIndex(x => x.id === t.id);
      if (i < 0) throw new Error('この卓は削除されています。');
      if (mode === 'delete') doc.tables.splice(i, 1); else doc.tables[i] = clone(t);
      return doc;
    }, { expectedRevision: captured.revision });
    if (draft === captured) { draft = null; $('editor').close(); }
  } catch (e) { showError('editor-error', e); if (e.status === 409) $('reload-draft').hidden = false; }
  finally { updateEditorControls(); }
}
$('table-form').onsubmit = e => { e.preventDefault(); void saveTable('save'); };
$('start-table').onclick = () => { if ($('table-form').reportValidity()) void saveTable('start'); };
$('checkout-table').onclick = () => saveTable('checkout');
$('delete-table').onclick = () => saveTable('delete');
$('reload-draft').onclick = () => { if (session.connected && confirm('入力中の内容を破棄して、保存済みの卓を読み直しますか？')) {
  const id = draft.table.id;
  if (!mineRow()?.data.tables.some(t => t.id === id)) { draft = null; $('editor').close(); setMessage('notice', 'この卓は削除されています。'); }
  else openEditor(id);
} };
function openSettings() {
  const row = mineRow(); settingsRevision = row.revision;
  $('cast-now').value = row.data.casts.now; $('cast-total').value = row.data.casts.total; $('set-min').value = row.data.setMin;
  $('cast-total').readOnly = row.data.castNames.length > 0; $('roster-count-note').hidden = !row.data.castNames.length;
  setMessage('settings-error', ''); $('reload-settings').hidden = true;
  if (!$('settings').open) $('settings').showModal();
}
$('settings-form').onsubmit = async e => {
  e.preventDefault();
  if (!canSave()) return;
  const now = Number($('cast-now').value), total = Number($('cast-total').value), setMin = Number($('set-min').value);
  if (now > total) { setMessage('settings-error', '今いる人数は本日の合計以下にしてください。'); return; }
  try {
    await session.mutate(doc => { doc.casts = { now, total: doc.castNames.length || total }; doc.setMin = setMin;
      doc.tables = doc.tables.map(t => t.guests ? t : { ...t, min: setMin }); return doc;
    }, { expectedRevision: settingsRevision });
    $('settings').close();
  } catch (err) { showError('settings-error', err); if (err.status === 409) $('reload-settings').hidden = false; }
};
$('reload-settings').onclick = () => { if (session.connected && confirm('入力中の内容を破棄して、保存済みの人数を読み直しますか？')) openSettings(); };
function closeDialog(id) {
  if (session?.pending && ['editor', 'waiting-editor', 'roster-editor', 'business-close', 'settings'].includes(id)) return;
  if (id === 'editor') {
    if (session?.pending) return;
    if (draft?.dirty && !confirm('保存していない入力を閉じますか？')) return;
    draft = null;
  }
  if (id === 'roster-editor') {
    if ((rosterDraft?.dirty || $('roster-input').value) && !confirm('保存していない名簿の入力を閉じますか？')) return;
    rosterDraft = null;
  }
  if (id === 'waiting-editor') waitingDraft = null;
  if (id === 'business-close') resetRevision = null;
  $(id).close();
}
document.addEventListener('click', e => { const close = e.target.closest('[data-close]'); if (close) closeDialog(close.dataset.close); });
$('editor').addEventListener('cancel', e => { e.preventDefault(); closeDialog('editor'); });
for (const id of ['waiting-editor', 'roster-editor', 'business-close', 'settings']) $(id).addEventListener('cancel', e => { e.preventDefault(); closeDialog(id); });
$('sound').onclick = async () => {
  if (soundOn) { soundOn = false; }
  else {
    try { sound ||= new (window.AudioContext || window.webkitAudioContext)(); await sound.resume(); soundOn = sound.state === 'running'; }
    catch { setMessage('notice', 'この端末では通知音を使えません。画面でお知らせします。'); }
  }
  $('sound').textContent = `通知音：${soundOn ? 'オン' : 'オフ'}`; $('sound').setAttribute('aria-pressed', String(soundOn));
};
function checkAlerts() {
  if (!mineRow() || !session.connected || !isLive(mineRow()) || Date.now() - session.lastFetched >= 90000 || document.hidden) { $('alerts').replaceChildren(); return; }
  const due = alertTracker(mineRow().data.tables);
  if (due.length) {
    alerts.push(...due.map(t => ({ id: `${t.id}:${endOf(t)}`, label: t.label, end: endOf(t) })));
    if (soundOn && sound?.state === 'running') {
      const osc = sound.createOscillator(), gain = sound.createGain(); osc.connect(gain); gain.connect(sound.destination);
      osc.frequency.value = 880; gain.gain.setValueAtTime(.1, sound.currentTime); gain.gain.exponentialRampToValueAtTime(.001, sound.currentTime + .35);
      osc.start(); osc.stop(sound.currentTime + .35);
    }
  }
  const active = new Set(mineRow().data.tables.filter(t => t.startAt && t.guests).map(t => `${t.id}:${endOf(t)}`));
  alerts = alerts.filter(a => active.has(a.id));
  $('alerts').innerHTML = alerts.map(a => `<div class="alert"><span>${esc(a.label)} · ${hhmm(a.end)} チェック（${checkTiming(a.end)}）</span><button class="quiet" data-dismiss="${esc(a.id)}">確認</button></div>`).join('');
}
$('alerts').onclick = e => { const b = e.target.closest('[data-dismiss]'); if (b) { alerts = alerts.filter(a => a.id !== b.dataset.dismiss); checkAlerts(); } };
setInterval(() => {
  if (!session || document.hidden || transitioning) return;
  $('clock').textContent = hhmm(Date.now());
  // Forms live outside the store panels: timer updates never replace a focused input.
  if (Date.now() - session.lastFetched >= 90000 && session.connected) {
    session.connected = false; session.epoch++; session.status = '接続確認中'; session.message = '接続を再確認してください。';
  }
  render();
}, 1000);
setInterval(() => { if (session && !document.hidden) void session.refresh(); }, 10000);
setInterval(() => { if (session && !document.hidden) void session.heartbeat(); }, 25000);
document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (!document.hidden) {
    session.connected = false; session.status = '接続確認中'; render(); void refreshAndHeartbeat();
  }
});
window.addEventListener('offline', () => {
  if (session) { session.connected = false; session.epoch++; session.status = '通信できません'; session.message = '接続を確認して再確認してください。'; render(); }
});
window.addEventListener('online', refreshAndHeartbeat);
window.addEventListener('hashchange', () => {
  // Dispose before reload: old requests cannot publish into a new room or store.
  transitioning = true; session?.dispose(); api.cancel(); $('board').hidden = true;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  location.reload();
});
window.addEventListener('pagehide', () => { session?.dispose(); api.cancel(); });
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
// Start only after all identity/visibility cancellation listeners are registered.
if (session) void refreshAndHeartbeat();

import { useState, useEffect, useMemo, useRef } from "react";
import { LayoutGrid, Sparkles, Settings, Crown, Plus, X, Clock, AlertTriangle, ChevronLeft, ChevronRight, Trash2, Wand2, UserPlus, Link2 } from "lucide-react";

const GOLD = "#c9a64e";
const TEAL = "#3fb6b0";
// URL パラメータで店舗を切り替え: ?store=viverce or ?store=ANELA など
const URL_STORE = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("store")) || "viverce";
const STORE_KEY = URL_STORE + "-v1";
const GENRES = ["綺麗", "可愛い", "おもしろい"];
const GENRE_COLOR = { "綺麗": "#7aa7ff", "可愛い": "#ff8fc4", "おもしろい": "#f0b54a" };

const DEFAULT_SETTINGS = { storeName: URL_STORE, target: 1000000, layoutLocked: true, overheadPct: 15 };
const DEFAULT_CAST_PAY = {
  hourlyWage: 3000,
  drinkBack: 500,
  shotBack: 500,
  bottleBackPct: 10,
  dohanBack: 3000,
  fieldNominationBack: 500,
  mainNominationBack: 1000,
  hasTransport: false,
  transportOut: 0,
  transportBack: 0,
  hasHairMake: false,
  hairMakeAmount: 0,
};
const DEFAULT_CAST_COUNTERS = {
  drinkCount: 0,
  shotCount: 0,
  bottleSales: 0,
  dohanCount: 0,
  fieldNominationCount: 0,
  mainNominationCount: 0,
  clockedInAt: null,
};
const mergeCastDefaults = (c) => ({ ...DEFAULT_CAST_PAY, ...DEFAULT_CAST_COUNTERS, ...c });
const DEFAULT_TABLES = [
  { id: "vip", label: "VIP", cap: 7 },
  { id: "t2", label: "卓2", cap: 4 },
  { id: "t3", label: "卓3", cap: 2 },
  { id: "t4", label: "卓4", cap: 2 },
  { id: "t5", label: "卓5", cap: 2 },
  { id: "t6", label: "卓6", cap: 2 },
  { id: "t7", label: "卓7", cap: 2 },
  { id: "t9", label: "卓9", cap: 4 },
  { id: "t10", label: "卓10", cap: 2 },
  { id: "t11", label: "卓11", cap: 2 },
  { id: "t12", label: "卓12", cap: 2 },
];
const DEFAULT_MERGE_GROUPS = { A: ["t3", "t4"], B: ["t5", "t6"], C: ["t10", "t11", "t12"] };

const SEED_CASTS = [
  { id: "c1", name: "リカ", score: 9, genres: ["綺麗"], status: "出勤" },
  { id: "c2", name: "マオ", score: 8, genres: ["可愛い"], status: "出勤" },
  { id: "c3", name: "ユイ", score: 7, genres: ["綺麗"], status: "出勤" },
  { id: "c4", name: "アヤ", score: 6, genres: ["おもしろい"], status: "出勤" },
  { id: "c5", name: "ミク", score: 6, genres: ["可愛い"], status: "出勤" },
  { id: "c6", name: "ナナ", score: 5, genres: ["おもしろい"], status: "出勤" },
  { id: "c7", name: "サキ", score: 7, genres: ["可愛い"], status: "出勤" },
  { id: "c8", name: "レイ", score: 8, genres: ["綺麗"], status: "出勤" },
  { id: "c9", name: "エマ", score: 4, genres: ["可愛い", "おもしろい"], status: "出勤" },
  { id: "c10", name: "カナ", score: 5, genres: ["綺麗"], status: "出勤" },
  { id: "c11", name: "ミナ", score: 6, genres: ["おもしろい"], status: "未出勤" },
  { id: "c12", name: "ホノカ", score: 7, genres: ["可愛い"], status: "未出勤" },
];

const yen = (n) => "¥" + (n || 0).toLocaleString("ja-JP");

// 保存先: Claude内ではwindow.storage / Vercel等ではlocalStorage / どちらも無ければメモリのみ
const storeGet = async (key) => {
  try { if (typeof window !== "undefined" && window.storage) { const l = await window.storage.list(key); if (l && l.keys && l.keys.includes(key)) { const g = await window.storage.get(key); return g.value; } return null; } } catch (e) {}
  try { if (typeof localStorage !== "undefined") return localStorage.getItem(key); } catch (e) {}
  return null;
};
const storeSet = async (key, val) => {
  try { if (typeof window !== "undefined" && window.storage) { await window.storage.set(key, val); return; } } catch (e) {}
  try { if (typeof localStorage !== "undefined") localStorage.setItem(key, val); } catch (e) {}
};

// 時計ロジック（各パーツが個別に持つ → アプリ全体は再描画されない）
const remainOf = (t, now) => t.setStart + t.setDuration * 60000 - now;
const tstateOf = (t, now) => { const r = remainOf(t, now); if (r <= 0) return "over"; if (r <= 600000) return "soon"; return "ok"; };
const fmt = (ms) => { const a = Math.abs(ms); const m = Math.floor(a / 60000); const s = Math.floor((a % 60000) / 1000); return `${m}:${String(s).padStart(2, "0")}`; };
function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [active]);
  return now;
}

export default function App() {
  const [view, setView] = useState("floor");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tables, setTables] = useState(DEFAULT_TABLES);
  const [mergeGroups, setMergeGroups] = useState(DEFAULT_MERGE_GROUPS);
  const [casts, setCasts] = useState(() => SEED_CASTS.map(mergeCastDefaults));
  const [salaryModal, setSalaryModal] = useState(null); // { cast, breakdown }
  const [ts, setTs] = useState({});
  const [served, setServed] = useState({});
  const [merges, setMerges] = useState({});
  const [sel, setSel] = useState(null);
  const [closed, setClosed] = useState([]);
  const [pick, setPick] = useState(null); // {tableId, customerId}
  const [modal, setModal] = useState(null); // {type, msg, onOk}
  const [loaded, setLoaded] = useState(false);

  // 永続化: 読み込み（保存データがあれば復元・無ければ空席スタート）
  useEffect(() => {
    (async () => {
      const raw = await storeGet(STORE_KEY);
      if (raw) {
        try {
          const d = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...(d.settings || {}) });
          setTables(d.tables || DEFAULT_TABLES);
          setMergeGroups(d.mergeGroups || DEFAULT_MERGE_GROUPS);
          setCasts((d.casts || SEED_CASTS).map(mergeCastDefaults));
          setTs(d.ts || {});
          setServed(d.served || {});
          setMerges(d.merges || {});
          setClosed(d.closed || []);
        } catch (e) { setTs({}); setServed({}); }
      } else { setTs({}); setServed({}); }
      setLoaded(true);
    })();
  }, []);

  // 永続化: 保存（500msデバウンス）
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => { storeSet(STORE_KEY, JSON.stringify({ settings, tables, mergeGroups, casts, ts, served, merges, closed })); }, 500);
    return () => clearTimeout(id);
  }, [loaded, settings, tables, mergeGroups, casts, ts, served, merges, closed]);

  function resetNight() {
    setTs({}); setServed({}); setClosed([]); setMerges({}); setSel(null);
    setCasts(cs => cs.map(c => ({ ...c, ...DEFAULT_CAST_COUNTERS, status: c.status === "出勤" ? "出勤" : c.status })));
  }

  // 稼働開始／終了
  function clockIn(castId) {
    setCasts(cs => cs.map(c => c.id === castId ? { ...c, clockedInAt: Date.now(), status: "出勤" } : c));
  }
  function clockOut(castId) {
    const c = casts.find(x => x.id === castId);
    if (!c) return;
    if (!c.clockedInAt) { alert("稼働開始していません"); return; }
    const breakdown = calcSalary(c);
    setSalaryModal({ cast: c, breakdown });
  }
  function confirmClockOut(castId) {
    setCasts(cs => cs.map(c => c.id === castId ? { ...c, ...DEFAULT_CAST_COUNTERS, status: "退勤済" } : c));
    setSalaryModal(null);
  }

  function calcSalary(c) {
    const hoursMs = c.clockedInAt ? Date.now() - c.clockedInAt : 0;
    const hours = hoursMs / 3600000;
    const wage = Math.round(c.hourlyWage * hours);
    const drinkBack = (c.drinkCount || 0) * c.drinkBack;
    const shotBack = (c.shotCount || 0) * c.shotBack;
    const bottleBack = Math.round((c.bottleSales || 0) * c.bottleBackPct / 100);
    const dohanBack = (c.dohanCount || 0) * c.dohanBack;
    const fieldBack = (c.fieldNominationCount || 0) * c.fieldNominationBack;
    const mainBack = (c.mainNominationCount || 0) * c.mainNominationBack;

    const gross = wage + drinkBack + shotBack + bottleBack + dohanBack + fieldBack + mainBack;

    const hairMake = c.hasHairMake ? (c.hairMakeAmount || 0) : 0;
    const transOut = c.hasTransport ? (c.transportOut || 0) : 0;
    const transBack = c.hasTransport ? (c.transportBack || 0) : 0;
    const afterCuts = gross - hairMake - transOut - transBack;

    const overhead = Math.round(afterCuts * (settings.overheadPct || 0) / 100);
    const net = afterCuts - overhead;

    return { hours, hoursMs, wage, drinkBack, shotBack, bottleBack, dohanBack, fieldBack, mainBack, gross, hairMake, transOut, transBack, afterCuts, overhead, net };
  }

  // カウンター増減
  const bumpCastCounter = (castId, key, delta) => setCasts(cs => cs.map(c => c.id === castId ? { ...c, [key]: Math.max(0, (c[key] || 0) + delta) } : c));
  const setCastCounter = (castId, key, val) => setCasts(cs => cs.map(c => c.id === castId ? { ...c, [key]: Math.max(0, val) } : c));

  const castById = useMemo(() => Object.fromEntries(casts.map(c => [c.id, c])), [casts]);
  const busy = useMemo(() => { const s = new Set(); Object.values(ts).forEach(t => t?.active && t.casts.forEach(a => s.add(a.castId))); return s; }, [ts]);
  const available = useMemo(() => casts.filter(c => c.status === "出勤" && !busy.has(c.id)), [casts, busy]);

  const upd = (id, fn) => setTs(s => ({ ...s, [id]: fn(s[id]) }));

  function secMerged(tid) { for (const [g, arr] of Object.entries(mergeGroups)) if (merges[g] && arr.slice(1).includes(tid)) return g; return null; }
  function primMerge(tid) { for (const [g, arr] of Object.entries(mergeGroups)) if (merges[g] && arr[0] === tid) return { g, arr }; return null; }
  function dispTable(t) {
    const pm = primMerge(t.id);
    if (pm) {
      const labels = pm.arr.map(id => tables.find(x => x.id === id)?.label.replace(/^卓/, "") || "?");
      const cap = pm.arr.reduce((s, id) => s + (tables.find(x => x.id === id)?.cap || 0), 0);
      return { ...t, label: "卓" + labels.join("+"), cap };
    }
    return t;
  }

  const tableTotal = (t) => (t.setType * t.customers.length) + t.orders.reduce((s, o) => s + o.price * o.qty, 0);

  // ---- 付け回しロジック ----
  function suggest(t, cust) {
    let pool = available.filter(c => !(served[cust.id] || []).includes(c.id));
    if (!pool.length) return null;
    if (cust.isBoss) { pool = [...pool].sort((a, b) => b.score - a.score || (b.genres.includes(cust.pref) ? 1 : 0) - (a.genres.includes(cust.pref) ? 1 : 0)); return pool[0]; }
    const matched = pool.filter(c => cust.pref && c.genres.includes(cust.pref));
    const base = matched.length ? matched : pool;
    return [...base].sort((a, b) => b.score - a.score)[0];
  }
  function doAssign(tableId, castId, customerId) {
    upd(tableId, t => {
      const seats = [...t.seats];
      const ci = seats.findIndex(s => s.k === "cust" && s.id === customerId);
      const entry = { k: "cast", id: castId };
      if (ci >= 0) seats.splice(ci + 1, 0, entry); else seats.push(entry);
      return { ...t, casts: [...t.casts, { castId, customerId }], seats };
    });
    setServed(s => ({ ...s, [customerId]: [...new Set([...(s[customerId] || []), castId])] }));
  }
  function tryAssign(tableId, castId, customerId) {
    const cust = ts[tableId].customers.find(c => c.id === customerId);
    if ((served[customerId] || []).includes(castId)) { setModal({ type: "ng", msg: `🚫 ${cust.name}さんには既に「${castById[castId].name}」が付いています。同じお客様への重複は絶対NG。` }); return; }
    if (ts[tableId].casts.some(a => a.castId === castId)) { setModal({ type: "warn", msg: `⚠️ 「${castById[castId].name}」はこの卓に既にいます。それでも付けますか？`, onOk: () => { doAssign(tableId, castId, customerId); setPick(null); } }); return; }
    doAssign(tableId, castId, customerId); setPick(null);
  }
  function autoCustomer(tableId, cust) {
    const s = suggest(ts[tableId], cust);
    if (!s) { setModal({ type: "ng", msg: `空きキャストが足りません（${cust.name}さんに付けられる子がいない）。` }); return; }
    doAssign(tableId, s.id, cust.id);
  }
  function autoTable(tableId) {
    const t = ts[tableId];
    const assigned = new Set(t.casts.map(a => a.customerId));
    let pool = available.slice();
    const ops = [];
    t.customers.forEach(cust => {
      if (assigned.has(cust.id)) return;
      let cand = pool.filter(c => !(served[cust.id] || []).includes(c.id));
      if (cust.isBoss) cand.sort((a, b) => b.score - a.score);
      else { const m = cand.filter(c => cust.pref && c.genres.includes(cust.pref)); cand = (m.length ? m : cand).sort((a, b) => b.score - a.score); }
      if (cand[0]) { ops.push([cust.id, cand[0].id]); pool = pool.filter(c => c.id !== cand[0].id); }
    });
    if (!ops.length) { setModal({ type: "ng", msg: "全員アサイン済み、または空き不足です。" }); return; }
    ops.forEach(([cu, ca]) => doAssign(tableId, ca, cu));
  }
  function removeCast(tableId, castId) { upd(tableId, t => ({ ...t, casts: t.casts.filter(a => a.castId !== castId), seats: t.seats.filter(s => !(s.k === "cast" && s.id === castId)) })); }
  function moveSeat(tableId, idx, dir) { upd(tableId, t => { const a = [...t.seats]; const j = idx + dir; if (j < 0 || j >= a.length) return t; [a[idx], a[j]] = [a[j], a[idx]]; return { ...t, seats: a }; }); }
  function addCustomer(tableId, name) {
    const id = "cu" + Math.random().toString(36).slice(2, 7);
    upd(tableId, t => ({ ...t, customers: [...t.customers, { id, name: name || "客", isBoss: t.customers.length === 0, pref: "綺麗" }], seats: [...t.seats, { k: "cust", id }] }));
  }
  function removeCustomer(tableId, custId) {
    upd(tableId, t => ({ ...t, customers: t.customers.filter(c => c.id !== custId), casts: t.casts.filter(a => a.customerId !== custId), seats: t.seats.filter(s => s.id !== custId && !(s.k === "cast" && t.casts.find(a => a.castId === s.id)?.customerId === custId)) }));
  }
  const setBoss = (tableId, id) => upd(tableId, t => ({ ...t, customers: t.customers.map(c => ({ ...c, isBoss: c.id === id })) }));
  const setPref = (tableId, id, pref) => upd(tableId, t => ({ ...t, customers: t.customers.map(c => c.id === id ? { ...c, pref } : c) }));
  const setSetType = (tableId, v) => upd(tableId, t => ({ ...t, setType: v }));
  const setDur = (tableId, v) => upd(tableId, t => ({ ...t, setDuration: v }));
  const addOrder = (tableId, o) => {
    upd(tableId, t => ({ ...t, orders: [...t.orders, { ...o, id: "o" + Math.random().toString(36).slice(2, 7), qty: 1 }] }));
    // カウンター自動加算（castId が付いていれば）
    if (o.castId) {
      if (o.kind === "drink") bumpCastCounter(o.castId, "drinkCount", 1);
      else if (o.kind === "shot") bumpCastCounter(o.castId, "shotCount", 1);
      else if (o.kind === "champagne" || o.kind === "bottle") setCasts(cs => cs.map(c => c.id === o.castId ? { ...c, bottleSales: (c.bottleSales || 0) + (o.price || 0) } : c));
    }
  };
  const ordQty = (tableId, oid, d) => upd(tableId, t => ({ ...t, orders: t.orders.map(o => o.id === oid ? { ...o, qty: Math.max(1, o.qty + d) } : o) }));
  const delOrder = (tableId, oid) => upd(tableId, t => ({ ...t, orders: t.orders.filter(o => o.id !== oid) }));
  function openTable(tableId) { setTs(s => ({ ...s, [tableId]: { active: true, setType: 4000, setDuration: 60, setStart: Date.now(), customers: [], casts: [], seats: [], orders: [] } })); }
  function closeTable(tableId) {
    const t = ts[tableId]; const total = tableTotal(t);
    const tRef = tables.find(x => x.id === tableId);
    setClosed(c => [...c, { label: tRef ? dispTable(tRef).label : tableId, total, n: t.customers.length }]);
    setTs(s => { const n = { ...s }; delete n[tableId]; return n; });
    setSel(null);
  }
  function toggleMerge(g) {
    if ((mergeGroups[g] || []).some(id => ts[id]?.active)) { setModal({ type: "ng", msg: "結合する卓に客がいる間は変更できません。会計後にどうぞ。" }); return; }
    setMerges(m => ({ ...m, [g]: !m[g] }));
  }

  const visibleTables = tables.filter(t => !secMerged(t.id));

  const brandDisplay = (settings.storeName || "").split("").join(" ").toUpperCase();

  if (!loaded) return (
    <div style={{ background: "#000", minHeight: "100vh" }} className="flex items-center justify-center">
      <span style={{ fontFamily: "Georgia,serif", letterSpacing: "0.35em", color: GOLD }} className="text-base">{brandDisplay}</span>
    </div>
  );

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", fontFamily: "system-ui, sans-serif" }} className="pb-24">
      <div style={{ borderBottom: "1px solid #1c1c22", background: "#000" }} className="px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div style={{ fontFamily: "Georgia, serif", letterSpacing: "0.35em", color: GOLD }} className="text-lg pl-1">{brandDisplay}</div>
        <TopClock />
      </div>

      {view === "floor" && <Floor {...{ visibleTables, dispTable, tables, ts, castById, setSel, merges, mergeGroups, toggleMerge }} />}
      {view === "cast" && <CastView {...{ casts, busy, clockIn, clockOut, bumpCastCounter }} />}
      {view === "sales" && <Sales {...{ ts, dispTable, tables, tableTotal, closed, target: settings.target }} />}
      {view === "admin" && <Admin {...{ casts, setCasts, resetNight, settings, setSettings, tables, setTables, mergeGroups, setMergeGroups }} />}

      {sel && ts[sel] !== undefined && (
        <Detail key={sel} {...{
          tableId: sel, t: ts[sel], disp: dispTable(tables.find(x => x.id === sel) || { id: sel, label: sel, cap: 0 }), close: () => setSel(null),
          castById, served, tableTotal, openTable, closeTable, addCustomer, removeCustomer, setBoss, setPref, setSetType, setDur,
          autoTable, autoCustomer, removeCast, moveSeat, setPick, addOrder, ordQty, delOrder,
        }} />
      )}

      {pick && (
        <CastPicker {...{ pick, close: () => setPick(null), available, tableCasts: ts[pick.tableId].casts, served, castById, casts, tryAssign, cust: ts[pick.tableId].customers.find(c => c.id === pick.customerId) }} />
      )}

      {salaryModal && (
        <SalaryModal {...{ ...salaryModal, overheadPct: settings.overheadPct, onConfirm: () => confirmClockOut(salaryModal.cast.id), onClose: () => setSalaryModal(null) }} />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,.7)" }} onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#15151a", border: `1px solid ${modal.type === "ng" ? "#7a2222" : "#7a5a1a"}` }} className="rounded-2xl p-5 max-w-sm w-full">
            <div className="flex items-start gap-2 mb-4">
              <AlertTriangle size={20} color={modal.type === "ng" ? "#e05555" : "#e0a84a"} />
              <p className="text-sm leading-relaxed">{modal.msg}</p>
            </div>
            <div className="flex gap-2 justify-end">
              {modal.onOk && <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm text-zinc-400">やめる</button>}
              <button onClick={() => { modal.onOk?.(); setModal(null); }} style={{ background: modal.onOk ? "#7a5a1a" : "#2a2a32" }} className="px-4 py-2 rounded-lg text-sm font-bold">{modal.onOk ? "続行する" : "OK"}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#0a0a0c", borderTop: "1px solid #1c1c22" }} className="fixed bottom-0 inset-x-0 z-30 flex">
        {[["floor", LayoutGrid, "フロア"], ["cast", Sparkles, "キャスト"], ["sales", null, "売上"], ["admin", Settings, "設定"]].map(([k, Icon, label]) => (
          <button key={k} onClick={() => setView(k)} className="flex-1 py-2.5 flex flex-col items-center gap-1" style={{ color: view === k ? GOLD : "#5a5a62" }}>
            {Icon ? <Icon size={20} /> : <span className="text-lg leading-none font-bold">¥</span>}
            <span className="text-[10px]">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopClock() {
  const now = useNow(true);
  return <div className="text-xs text-zinc-500">{new Date(now).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</div>;
}

function DetailClock({ t }) {
  const now = useNow(true);
  const r = remainOf(t, now);
  const red = r <= 600000;
  return <span style={{ color: red ? "#ff6a6a" : "#9a9aa2" }} className="text-sm font-bold flex items-center gap-1"><Clock size={14} />{r <= 0 ? "+" : ""}{fmt(r)}{red && " ラスト"}</span>;
}

function Chip({ k, name, boss }) {
  const isC = k === "cust";
  return (
    <span style={{ background: isC ? "rgba(201,166,78,.18)" : "rgba(63,182,176,.18)", border: `1px solid ${isC ? GOLD : TEAL}`, color: isC ? "#e8d29a" : "#a8e6e2" }} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap">
      {boss && <Crown size={10} color={GOLD} />}{name}
    </span>
  );
}

function FloorCard({ tt, disp, t, castById, onClick }) {
  const active = !!t?.active;
  const now = useNow(active);
  const tstate = active ? tstateOf(t, now) : null;
  const red = tstate === "soon" || tstate === "over";
  return (
    <button onClick={onClick} style={{ background: active ? "#141418" : "#0d0d10", border: `1.5px solid ${red ? "#a13b3b" : active ? GOLD : "#1c1c22"}`, boxShadow: red ? "0 0 14px rgba(180,60,60,.35)" : "none" }} className="rounded-2xl p-3 text-left min-h-[120px] flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: active ? "#fff" : "#555", fontFamily: "Georgia,serif" }} className="text-lg font-bold">{disp.label}</span>
        {active ? (
          <span style={{ color: red ? "#ff6a6a" : "#9a9aa2" }} className="text-[11px] font-bold flex items-center gap-0.5"><Clock size={11} />{tstate === "over" ? "+" : ""}{fmt(remainOf(t, now))}</span>
        ) : <span className="text-[10px] text-zinc-600">空席</span>}
      </div>
      {active ? (
        <>
          <div className="flex flex-wrap gap-1 mb-2">
            {t.seats.map((s, i) => {
              const name = s.k === "cust" ? t.customers.find(c => c.id === s.id)?.name : castById[s.id]?.name;
              const boss = s.k === "cust" && t.customers.find(c => c.id === s.id)?.isBoss;
              return <Chip key={i} k={s.k} name={name} boss={boss} />;
            })}
          </div>
          <div className="mt-auto flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">{t.customers.length}名</span>
            <span style={{ color: GOLD }} className="font-bold">{yen(t.setType * t.customers.length + t.orders.reduce((a, o) => a + o.price * o.qty, 0))}</span>
          </div>
        </>
      ) : <span className="text-[10px] text-zinc-600 mt-auto">定員 {disp.cap}名 ・ タップで開ける</span>}
    </button>
  );
}

function Floor({ visibleTables, dispTable, tables, ts, castById, setSel, merges, mergeGroups, toggleMerge }) {
  const groupEntries = Object.entries(mergeGroups || {});
  return (
    <div className="p-3">
      {groupEntries.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-zinc-500">卓結合:</span>
          {groupEntries.map(([g, arr]) => {
            const label = arr.map(id => (tables.find(t => t.id === id)?.label || "?").replace(/^卓/, "")).join("+");
            return (
              <button key={g} onClick={() => toggleMerge(g)} style={{ background: merges[g] ? "rgba(201,166,78,.2)" : "#15151a", border: `1px solid ${merges[g] ? GOLD : "#2a2a32"}`, color: merges[g] ? GOLD : "#777" }} className="text-[11px] rounded-full px-2.5 py-1 flex items-center gap-1">
                <Link2 size={11} />{label || g}
              </button>
            );
          })}
        </div>
      )}
      {visibleTables.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm">
          卓が登録されていません。<br />設定タブから卓を追加してください。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {visibleTables.map(tt => (
            <FloorCard key={tt.id} tt={tt} disp={dispTable(tt)} t={ts[tt.id]} castById={castById} onClick={() => setSel(tt.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Detail(p) {
  const { tableId, t, disp, close, castById, served, tableTotal, openTable, closeTable, addCustomer, removeCustomer, setBoss, setPref, setSetType, setDur, autoTable, autoCustomer, removeCast, moveSeat, setPick, addOrder, ordQty, delOrder } = p;
  const cnameRef = useRef(null);
  const chLabelRef = useRef(null);
  const chPriceRef = useRef(null);
  const active = t?.active;

  const submitCustomer = () => {
    const v = (cnameRef.current?.value || "").trim();
    if (!v) return;
    addCustomer(tableId, v);
    if (cnameRef.current) cnameRef.current.value = "";
  };
  const submitChampagne = () => {
    const l = (chLabelRef.current?.value || "").trim();
    const pr = (chPriceRef.current?.value || "").replace(/[^0-9]/g, "");
    if (!l || !pr) return;
    addOrder(tableId, { label: l, price: +pr, kind: "champagne" });
    if (chLabelRef.current) chLabelRef.current.value = "";
    if (chPriceRef.current) chPriceRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: "#0a0a0c" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: "#0a0a0c", borderBottom: "1px solid #1c1c22" }}>
        <div className="flex items-center gap-3">
          <button onClick={close}><X size={22} color="#888" /></button>
          <span style={{ fontFamily: "Georgia,serif", color: GOLD }} className="text-xl font-bold">{disp.label}</span>
          {active && <DetailClock t={t} />}
        </div>
        {active && <button onClick={() => closeTable(tableId)} style={{ background: "#1c1c22", color: GOLD }} className="text-xs px-3 py-1.5 rounded-lg font-bold">会計</button>}
      </div>

      {!active ? (
        <div className="p-10 text-center">
          <p className="text-zinc-500 mb-4 text-sm">この卓は空席です（定員 {disp.cap}名）</p>
          <button onClick={() => openTable(tableId)} style={{ background: GOLD, color: "#000" }} className="px-6 py-3 rounded-xl font-bold">卓を開ける</button>
        </div>
      ) : (
        <div className="p-4 space-y-5 pb-16">
          <Section title="座席（誰の隣に誰）">
            <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
              {t.seats.map((s, i) => {
                const isC = s.k === "cust";
                const cust = isC && t.customers.find(c => c.id === s.id);
                const name = isC ? cust?.name : castById[s.id]?.name;
                return (
                  <div key={i} className="flex flex-col items-center gap-1 min-w-[58px]">
                    <div style={{ background: isC ? "rgba(201,166,78,.15)" : "rgba(63,182,176,.15)", border: `1.5px solid ${isC ? GOLD : TEAL}` }} className="rounded-xl px-1 py-2 w-full text-center relative">
                      {isC && cust?.isBoss && <Crown size={11} color={GOLD} className="absolute -top-1.5 left-1/2 -translate-x-1/2" />}
                      <div style={{ color: isC ? "#e8d29a" : "#a8e6e2" }} className="text-xs font-bold">{name}</div>
                      <div className="text-[8px] text-zinc-600">{isC ? "客" : "嬢"}</div>
                    </div>
                    <div className="flex gap-0.5">
                      <button onClick={() => moveSeat(tableId, i, -1)} className="text-zinc-600"><ChevronLeft size={14} /></button>
                      <button onClick={() => moveSeat(tableId, i, 1)} className="text-zinc-600"><ChevronRight size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {t.seats.length === 0 && <span className="text-xs text-zinc-600 py-3">まだ誰もいません</span>}
            </div>
          </Section>

          <Section title="お客様 ＆ 付け回し" right={<button onClick={() => autoTable(tableId)} style={{ background: GOLD, color: "#000" }} className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1"><Wand2 size={12} />卓を自動付け回し</button>}>
            <div className="space-y-2">
              {t.customers.map(cust => {
                const myCasts = t.casts.filter(a => a.customerId === cust.id).map(a => castById[a.castId]);
                return (
                  <div key={cust.id} style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <button onClick={() => setBoss(tableId, cust.id)} className="flex items-center gap-1.5">
                        <Crown size={15} color={cust.isBoss ? GOLD : "#3a3a42"} />
                        <span className="font-bold text-sm">{cust.name}</span>
                        {cust.isBoss && <span style={{ color: GOLD }} className="text-[10px]">ボス</span>}
                      </button>
                      <button onClick={() => removeCustomer(tableId, cust.id)}><Trash2 size={14} color="#555" /></button>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[10px] text-zinc-500">好み</span>
                      {GENRES.map(g => (
                        <button key={g} onClick={() => setPref(tableId, cust.id, g)} style={{ background: cust.pref === g ? GENRE_COLOR[g] : "#1c1c22", color: cust.pref === g ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{g}</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {myCasts.map(c => (
                        <span key={c.id} style={{ background: "rgba(63,182,176,.15)", border: `1px solid ${TEAL}`, color: "#a8e6e2" }} className="text-[11px] rounded-full pl-2 pr-1 py-0.5 font-bold flex items-center gap-1">
                          {c.name}<button onClick={() => removeCast(tableId, c.id)}><X size={11} /></button>
                        </span>
                      ))}
                      <button onClick={() => autoCustomer(tableId, cust)} style={{ border: `1px dashed ${GOLD}`, color: GOLD }} className="text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1"><Wand2 size={11} />おすすめ</button>
                      <button onClick={() => setPick({ tableId, customerId: cust.id })} style={{ border: "1px dashed #444", color: "#999" }} className="text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1"><Plus size={11} />指名</button>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <input ref={cnameRef} placeholder="お客様名" enterKeyHint="done" onKeyDown={e => { if (e.key === "Enter") submitCustomer(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
                <button onClick={submitCustomer} style={{ background: "#22222a", color: GOLD }} className="px-3 rounded-lg text-sm font-bold flex items-center gap-1"><UserPlus size={14} />追加</button>
              </div>
            </div>
          </Section>

          <Section title="セット">
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className="text-[10px] text-zinc-500">料金</span>
              {[4000, 4500, 5000, 5500].map(v => (
                <button key={v} onClick={() => setSetType(tableId, v)} style={{ background: t.setType === v ? GOLD : "#1c1c22", color: t.setType === v ? "#000" : "#888" }} className="text-[11px] rounded-lg px-2 py-1 font-bold">{yen(v)}</button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">時間</span>
              {[50, 60].map(v => (
                <button key={v} onClick={() => setDur(tableId, v)} style={{ background: t.setDuration === v ? GOLD : "#1c1c22", color: t.setDuration === v ? "#000" : "#888" }} className="text-[11px] rounded-lg px-2.5 py-1 font-bold">{v}分</button>
              ))}
            </div>
          </Section>

          <Section title="ドリンク・ボトル">
            <div className="flex gap-2 mb-2">
              <button onClick={() => addOrder(tableId, { label: "ドリンク", price: 1500, kind: "drink" })} style={{ background: "#141418", border: "1px solid #22222a" }} className="flex-1 rounded-lg py-2 text-xs font-bold">＋ドリンク ¥1,500</button>
              <button onClick={() => addOrder(tableId, { label: "ショット", price: 3000, kind: "shot" })} style={{ background: "#141418", border: "1px solid #22222a" }} className="flex-1 rounded-lg py-2 text-xs font-bold">＋ショット ¥3,000</button>
            </div>
            <div className="flex gap-2 mb-3">
              <input ref={chLabelRef} placeholder="シャンパン等" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-2 py-2 outline-none min-w-0" />
              <input ref={chPriceRef} placeholder="価格" inputMode="numeric" enterKeyHint="done" onKeyDown={e => { if (e.key === "Enter") submitChampagne(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-24 rounded-lg px-2 py-2 outline-none" />
              <button onClick={submitChampagne} style={{ background: "#22222a", color: GOLD }} className="px-3 rounded-lg text-xs font-bold">追加</button>
            </div>
            <div className="space-y-1.5">
              {t.orders.map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{o.label} <span className="text-zinc-500 text-xs">{yen(o.price)}</span></span>
                  <button onClick={() => ordQty(tableId, o.id, -1)} style={{ background: "#1c1c22" }} className="w-7 h-7 rounded text-zinc-400">−</button>
                  <span className="w-5 text-center text-sm">{o.qty}</span>
                  <button onClick={() => ordQty(tableId, o.id, 1)} style={{ background: "#1c1c22" }} className="w-7 h-7 rounded text-zinc-400">＋</button>
                  <span style={{ color: GOLD }} className="w-20 text-right text-sm font-bold">{yen(o.price * o.qty)}</span>
                  <button onClick={() => delOrder(tableId, o.id)}><Trash2 size={13} color="#555" /></button>
                </div>
              ))}
            </div>
          </Section>

          <div style={{ background: "#141418", border: `1px solid ${GOLD}` }} className="rounded-2xl p-4 flex items-center justify-between">
            <div className="text-xs text-zinc-400">
              <div>セット {yen(t.setType)} × {t.customers.length}名</div>
              <div>飲食 {yen(t.orders.reduce((a, o) => a + o.price * o.qty, 0))}</div>
            </div>
            <div style={{ color: GOLD }} className="text-2xl font-bold">{yen(tableTotal(t))}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-zinc-400">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function CastPicker({ pick, close, available, tableCasts, served, castById, casts, tryAssign, cust }) {
  const inTable = new Set(tableCasts.map(a => a.castId));
  const list = casts.filter(c => c.status === "出勤" && (available.find(a => a.id === c.id) || inTable.has(c.id)));
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,.6)" }} onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d10", borderTop: "1px solid #22222a" }} className="w-full rounded-t-3xl p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">{cust?.name}さんに付ける（好み: <span style={{ color: GENRE_COLOR[cust?.pref] }}>{cust?.pref}</span>）</h3>
          <button onClick={close}><X size={20} color="#888" /></button>
        </div>
        <p className="text-[10px] text-zinc-600 mb-3">※ ランクは非表示。ジャンル一致を上に表示。</p>
        <div className="grid grid-cols-2 gap-2">
          {list.sort((a, b) => (b.genres.includes(cust?.pref) ? 1 : 0) - (a.genres.includes(cust?.pref) ? 1 : 0)).map(c => {
            const ng = (served[cust.id] || []).includes(c.id);
            const here = inTable.has(c.id);
            const match = c.genres.includes(cust?.pref);
            return (
              <button key={c.id} onClick={() => tryAssign(pick.tableId, c.id, pick.customerId)} disabled={ng}
                style={{ background: ng ? "#161013" : "#141418", border: `1px solid ${ng ? "#5a2222" : match ? TEAL : "#22222a"}`, opacity: ng ? 0.55 : 1 }} className="rounded-xl p-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{c.name}</span>
                  {ng && <span style={{ color: "#e05555" }} className="text-[9px] font-bold">NG重複</span>}
                  {!ng && here && <span style={{ color: "#e0a84a" }} className="text-[9px] font-bold">在卓⚠</span>}
                </div>
                <div className="flex gap-1 mt-1">
                  {c.genres.map(g => <span key={g} style={{ color: GENRE_COLOR[g], border: `1px solid ${GENRE_COLOR[g]}` }} className="text-[9px] rounded px-1">{g}</span>)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CastView({ casts, busy, clockIn, clockOut, bumpCastCounter }) {
  const working = casts.filter(c => c.clockedInAt);
  const notYet = casts.filter(c => !c.clockedInAt && c.status !== "退勤済");
  const done = casts.filter(c => c.status === "退勤済");
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="p-4 pb-4">
      <p className="text-xs text-zinc-500 mb-1">キャスト稼働・指名・給料</p>
      <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: "Georgia,serif" }}>稼働中 {working.length}名</h2>

      <div className="space-y-2 mb-6">
        {working.map(c => (
          <WorkingCastCard key={c.id} c={c} busy={busy} onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)} expanded={expandedId === c.id} clockOut={clockOut} bumpCastCounter={bumpCastCounter} />
        ))}
        {working.length === 0 && <p className="text-zinc-600 text-sm">まだ誰も出勤していません</p>}
      </div>

      {notYet.length > 0 && (
        <>
          <p className="text-xs text-zinc-500 mb-2">未出勤（タップで出勤）</p>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {notYet.map(c => (
              <button key={c.id} onClick={() => clockIn(c.id)} style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-xl p-2 flex flex-col items-center gap-1">
                <div style={{ background: "#1c1c22" }} className="w-11 h-11 rounded-full flex items-center justify-center text-sm text-zinc-400">{c.name.slice(0, 2)}</div>
                <span className="text-xs">{c.name}</span>
                <span style={{ color: GOLD }} className="text-[10px] font-bold">＋ 出勤</span>
              </button>
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <p className="text-xs text-zinc-500 mb-2">退勤済</p>
          <div className="flex gap-3 flex-wrap">
            {done.map(c => (
              <div key={c.id} className="flex flex-col items-center gap-1">
                <div style={{ background: "#0d0d10" }} className="w-11 h-11 rounded-full flex items-center justify-center text-sm text-zinc-600">{c.name.slice(0, 2)}</div>
                <span className="text-[10px] text-zinc-600">{c.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WorkingCastCard({ c, busy, onToggle, expanded, clockOut, bumpCastCounter }) {
  const now = useNow(true);
  const elapsed = c.clockedInAt ? now - c.clockedInAt : 0;
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const isBusy = busy.has(c.id);
  return (
    <div style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-2xl overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <div style={{ border: `2px solid ${isBusy ? GOLD : TEAL}` }} className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold">{c.name.slice(0, 2)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold">{c.name}</div>
          <div className="text-[11px] text-zinc-500">稼働 {h}h {String(m).padStart(2,"0")}m ・ {isBusy ? "接客中" : "フリー"}</div>
        </div>
        <button onClick={onToggle} style={{ background: "#1c1c22", color: GOLD }} className="text-[11px] rounded-full px-3 py-1 font-bold">{expanded ? "閉じる" : "詳細"}</button>
        <button onClick={() => clockOut(c.id)} style={{ background: "#7a2222", color: "#fff" }} className="text-[11px] rounded-full px-3 py-1 font-bold">退勤</button>
      </div>
      {expanded && (
        <div className="border-t border-[#22222a] p-3 space-y-2">
          <CounterRow label="ドリンク" val={c.drinkCount} onDelta={d => bumpCastCounter(c.id, "drinkCount", d)} back={`¥${c.drinkBack}/杯`} />
          <CounterRow label="ショット" val={c.shotCount} onDelta={d => bumpCastCounter(c.id, "shotCount", d)} back={`¥${c.shotBack}/杯`} />
          <CounterRow label="本指名" val={c.mainNominationCount} onDelta={d => bumpCastCounter(c.id, "mainNominationCount", d)} back={`¥${c.mainNominationBack}/本`} />
          <CounterRow label="場内指名" val={c.fieldNominationCount} onDelta={d => bumpCastCounter(c.id, "fieldNominationCount", d)} back={`¥${c.fieldNominationBack}/場`} />
          <CounterRow label="同伴" val={c.dohanCount} onDelta={d => bumpCastCounter(c.id, "dohanCount", d)} back={`¥${c.dohanBack}/同`} />
          <div className="flex items-center gap-2 text-sm">
            <span className="w-16 text-xs text-zinc-500">ボトル売上</span>
            <span style={{ color: GOLD }} className="flex-1 text-right font-bold">¥{(c.bottleSales || 0).toLocaleString("ja-JP")}</span>
            <span className="text-[10px] text-zinc-500">×{c.bottleBackPct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CounterRow({ label, val, onDelta, back }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 text-xs text-zinc-500">{label}</span>
      <button onClick={() => onDelta(-1)} style={{ background: "#1c1c22" }} className="w-8 h-8 rounded text-zinc-400">−</button>
      <span className="w-8 text-center text-base font-bold">{val || 0}</span>
      <button onClick={() => onDelta(1)} style={{ background: "#1c1c22" }} className="w-8 h-8 rounded text-zinc-400">＋</button>
      <span className="text-[10px] text-zinc-500 ml-auto">{back}</span>
    </div>
  );
}

function SalaryModal({ cast, breakdown, overheadPct, onConfirm, onClose }) {
  const b = breakdown;
  const hDisp = `${Math.floor(b.hoursMs / 3600000)}h ${String(Math.floor((b.hoursMs % 3600000) / 60000)).padStart(2, "0")}m`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.75)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#141418", border: `1px solid ${GOLD}` }} className="rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="mb-4">
          <p className="text-xs text-zinc-500">給料明細</p>
          <h3 style={{ fontFamily: "Georgia,serif", color: GOLD }} className="text-2xl font-bold">{cast.name}</h3>
          <p className="text-xs text-zinc-500 mt-1">稼働 {hDisp}</p>
        </div>
        <div className="space-y-1 text-sm mb-4">
          <SalaryLine l={`時給 ¥${cast.hourlyWage.toLocaleString()} × ${b.hours.toFixed(2)}h`} v={b.wage} />
          {b.drinkBack > 0 && <SalaryLine l={`ドリンクバック ¥${cast.drinkBack} × ${cast.drinkCount}杯`} v={b.drinkBack} />}
          {b.shotBack > 0 && <SalaryLine l={`ショットバック ¥${cast.shotBack} × ${cast.shotCount}杯`} v={b.shotBack} />}
          {b.bottleBack > 0 && <SalaryLine l={`ボトルバック ${cast.bottleBackPct}% × ¥${(cast.bottleSales||0).toLocaleString()}`} v={b.bottleBack} />}
          {b.mainBack > 0 && <SalaryLine l={`本指名 ¥${cast.mainNominationBack} × ${cast.mainNominationCount}`} v={b.mainBack} />}
          {b.fieldBack > 0 && <SalaryLine l={`場内指名 ¥${cast.fieldNominationBack} × ${cast.fieldNominationCount}`} v={b.fieldBack} />}
          {b.dohanBack > 0 && <SalaryLine l={`同伴 ¥${cast.dohanBack} × ${cast.dohanCount}`} v={b.dohanBack} />}
        </div>
        <div className="border-t border-[#2a2a32] pt-2 mb-2 flex justify-between text-sm">
          <span className="text-zinc-400">総支給</span>
          <span className="font-bold">¥{b.gross.toLocaleString()}</span>
        </div>
        <div className="space-y-1 text-sm mb-2">
          {b.hairMake > 0 && <SalaryLine l="ヘアメイク" v={-b.hairMake} cut />}
          {b.transOut > 0 && <SalaryLine l="送迎（行き）" v={-b.transOut} cut />}
          {b.transBack > 0 && <SalaryLine l="送迎（帰り）" v={-b.transBack} cut />}
          <SalaryLine l={`構成費 ${overheadPct}%`} v={-b.overhead} cut />
        </div>
        <div style={{ background: "rgba(201,166,78,.1)", border: `1px solid ${GOLD}` }} className="rounded-xl p-3 mt-3 flex justify-between items-center">
          <span className="text-sm text-zinc-400">小計（女子給料）</span>
          <span style={{ color: GOLD }} className="text-2xl font-bold">¥{b.net.toLocaleString()}</span>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} style={{ background: "#22222a", color: "#aaa" }} className="flex-1 py-2 rounded-lg text-sm">戻る</button>
          <button onClick={onConfirm} style={{ background: GOLD, color: "#000" }} className="flex-1 py-2 rounded-lg text-sm font-bold">退勤確定</button>
        </div>
      </div>
    </div>
  );
}

function SalaryLine({ l, v, cut }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-400 text-xs truncate flex-1">{l}</span>
      <span style={{ color: cut ? "#ff8888" : "#fff" }} className="font-bold ml-2 whitespace-nowrap">¥{v.toLocaleString()}</span>
    </div>
  );
}

function Sales({ ts, dispTable, tables, tableTotal, closed, target }) {
  const rows = [
    ...Object.entries(ts).filter(([, t]) => t?.active).map(([id, t]) => {
      const ref = tables.find(x => x.id === id);
      return { label: ref ? dispTable(ref).label : id, total: tableTotal(t), n: t.customers.length, live: true };
    }),
    ...closed.map(c => ({ ...c, live: false })),
  ].sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const pct = target > 0 ? Math.min(100, Math.round(total / target * 100)) : 0;
  return (
    <div className="p-4">
      <p className="text-xs text-zinc-500 mb-1">本日の売上 ・ {new Date().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}</p>
      <div style={{ background: "linear-gradient(180deg,#f3e2a0,#c9a64e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }} className="text-5xl font-bold mb-4">{yen(total)}</div>
      <div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">目標 {yen(target)}</span><span style={{ color: GOLD }} className="font-bold">{pct}%</span></div>
      <div style={{ background: "#1c1c22" }} className="h-2 rounded-full overflow-hidden mb-6">
        <div style={{ width: pct + "%", background: "linear-gradient(90deg,#f3e2a0,#c9a64e)" }} className="h-full" />
      </div>
      <p className="text-xs text-zinc-500 mb-2">卓別 売上</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} style={{ background: "#141418", border: `1px solid ${i === 0 ? GOLD : "#22222a"}` }} className="rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="flex items-center gap-2"><span style={{ fontFamily: "Georgia,serif", color: i === 0 ? GOLD : "#fff" }} className="text-lg font-bold">{r.label}</span><span className="text-xs text-zinc-500">{r.n}名{!r.live && " ・会計済"}</span></span>
            <span style={{ color: GOLD }} className="text-lg font-bold">{yen(r.total)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-center text-zinc-600 text-sm py-8">まだ売上がありません</p>}
      </div>
    </div>
  );
}

function Admin({ casts, setCasts, resetNight, settings, setSettings, tables, setTables, mergeGroups, setMergeGroups }) {
  const nameRef = useRef(null);
  const tblLabelRef = useRef(null);
  const tblCapRef = useRef(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tblEdit, setTblEdit] = useState(null); // {id, label, cap}
  const [mergeEdit, setMergeEdit] = useState(null); // {key, tableIds:[]}

  const upd = (id, fn) => setCasts(cs => cs.map(c => c.id === id ? fn(c) : c));
  const toggleGenre = (id, g) => upd(id, c => ({ ...c, genres: c.genres.includes(g) ? c.genres.filter(x => x !== g) : [...c.genres, g] }));
  const addCast = () => {
    const v = (nameRef.current?.value || "").trim();
    if (!v) return;
    setCasts(cs => [...cs, { id: "c" + Math.random().toString(36).slice(2, 6), name: v, score: 5, genres: ["可愛い"], status: "出勤" }]);
    if (nameRef.current) nameRef.current.value = "";
  };

  const addTable = () => {
    const label = (tblLabelRef.current?.value || "").trim();
    const cap = parseInt(tblCapRef.current?.value || "2", 10) || 2;
    if (!label) return;
    const id = "t" + Math.random().toString(36).slice(2, 6);
    setTables(ts => [...ts, { id, label, cap }]);
    if (tblLabelRef.current) tblLabelRef.current.value = "";
    if (tblCapRef.current) tblCapRef.current.value = "2";
  };
  const saveTblEdit = () => {
    if (!tblEdit) return;
    setTables(ts => ts.map(t => t.id === tblEdit.id ? { ...t, label: tblEdit.label.trim() || t.label, cap: Math.max(1, +tblEdit.cap || 1) } : t));
    setTblEdit(null);
  };
  const delTable = (id) => {
    if (!confirm("この卓を削除しますか？結合設定からも外れます。")) return;
    setTables(ts => ts.filter(t => t.id !== id));
    setMergeGroups(mg => {
      const next = {};
      Object.entries(mg).forEach(([k, arr]) => {
        const filtered = arr.filter(x => x !== id);
        if (filtered.length >= 2) next[k] = filtered;
      });
      return next;
    });
  };

  const addMergeGroup = () => {
    const keys = Object.keys(mergeGroups);
    const nextKey = String.fromCharCode(65 + keys.length); // A, B, C, ...
    setMergeEdit({ key: nextKey, tableIds: [], isNew: true });
  };
  const saveMergeEdit = () => {
    if (!mergeEdit) return;
    if (mergeEdit.tableIds.length < 2) { alert("2つ以上の卓を選択してください"); return; }
    setMergeGroups(mg => ({ ...mg, [mergeEdit.key]: mergeEdit.tableIds }));
    setMergeEdit(null);
  };
  const delMergeGroup = (k) => {
    if (!confirm(`結合グループ ${k} を削除しますか？`)) return;
    setMergeGroups(mg => { const n = { ...mg }; delete n[k]; return n; });
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-lg font-bold mb-1">店舗設定</h2>
        <p className="text-xs text-zinc-500 mb-3">店名・売上目標。すべて自動保存されます。</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">店名</span>
            <input value={settings.storeName} onChange={e => setSettings(s => ({ ...s, storeName: e.target.value }))} placeholder="viverce" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">売上目標</span>
            <input type="number" value={settings.target} onChange={e => setSettings(s => ({ ...s, target: +e.target.value || 0 }))} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
            <span className="text-xs text-zinc-500">円</span>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">卓レイアウト</h2>
          <button onClick={() => {
            if (settings.layoutLocked) {
              if (confirm("卓レイアウトのロックを解除しますか？\n（誤操作防止のため、通常はロックしたままご使用ください）")) {
                setSettings(s => ({ ...s, layoutLocked: false }));
              }
            } else {
              setSettings(s => ({ ...s, layoutLocked: true }));
              setTblEdit(null);
              setMergeEdit(null);
            }
          }} style={{ background: settings.layoutLocked ? "rgba(63,182,176,.15)" : "rgba(224,168,74,.15)", border: `1px solid ${settings.layoutLocked ? TEAL : "#e0a84a"}`, color: settings.layoutLocked ? TEAL : "#e0a84a" }} className="text-[11px] rounded-full px-3 py-1 font-bold">
            {settings.layoutLocked ? "🔒 ロック中" : "🔓 編集モード"}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          {settings.layoutLocked
            ? "レイアウトは固定されています。変更するには右上の 🔒 をタップして解除してください。"
            : "⚠️ 編集モード：卓番号・定員・削除が可能。作業が終わったら再度ロックしてください。"}
        </p>
        {!settings.layoutLocked && (
          <div className="flex gap-2 mb-3">
            <input ref={tblLabelRef} placeholder="卓名（例: 卓13, VIP2）" onKeyDown={e => { if (e.key === "Enter") addTable(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none min-w-0" />
            <input ref={tblCapRef} type="number" defaultValue="2" min="1" placeholder="定員" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-16 rounded-lg px-2 py-2 outline-none" />
            <button onClick={addTable} style={{ background: GOLD, color: "#000" }} className="px-3 rounded-lg text-sm font-bold">追加</button>
          </div>
        )}
        <div className="space-y-2">
          {tables.map(t => (
            <div key={t.id} style={{ background: "#141418", border: "1px solid #22222a", opacity: settings.layoutLocked ? 0.75 : 1 }} className="rounded-xl p-3">
              {!settings.layoutLocked && tblEdit?.id === t.id ? (
                <div className="flex items-center gap-2">
                  <input value={tblEdit.label} onChange={e => setTblEdit(x => ({ ...x, label: e.target.value }))} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded px-2 py-1.5 outline-none" />
                  <input type="number" value={tblEdit.cap} onChange={e => setTblEdit(x => ({ ...x, cap: e.target.value }))} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "16px" }} className="w-16 rounded px-2 py-1.5 outline-none" />
                  <button onClick={saveTblEdit} style={{ background: GOLD, color: "#000" }} className="px-3 py-1.5 rounded text-xs font-bold">保存</button>
                  <button onClick={() => setTblEdit(null)} className="text-xs text-zinc-500">×</button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span style={{ fontFamily: "Georgia,serif", color: GOLD }} className="text-lg font-bold">{t.label}</span>
                    <span className="text-xs text-zinc-500">定員 {t.cap}名</span>
                    {settings.layoutLocked && <span className="text-[10px] text-zinc-600">🔒</span>}
                  </div>
                  {!settings.layoutLocked && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setTblEdit({ id: t.id, label: t.label, cap: t.cap })} style={{ background: "#22222a", color: GOLD }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">編集</button>
                      <button onClick={() => delTable(t.id)}><Trash2 size={14} color="#555" /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-1">卓結合グループ</h2>
        <p className="text-xs text-zinc-500 mb-3">
          {settings.layoutLocked
            ? "編集にはロック解除が必要です（上の卓レイアウトの 🔒 を解除）。"
            : "2卓以上をまとめて1つの卓として扱えるようにする設定。"}
        </p>
        <div className="space-y-2 mb-3">
          {Object.entries(mergeGroups).map(([k, arr]) => {
            const labels = arr.map(id => tables.find(t => t.id === id)?.label || "?").join(" + ");
            return (
              <div key={k} style={{ background: "#141418", border: "1px solid #22222a", opacity: settings.layoutLocked ? 0.75 : 1 }} className="rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span style={{ color: GOLD }} className="text-sm font-bold mr-2">グループ {k}</span>
                  <span className="text-xs text-zinc-400">{labels}</span>
                </div>
                {!settings.layoutLocked && (
                  <div className="flex gap-2">
                    <button onClick={() => setMergeEdit({ key: k, tableIds: [...arr], isNew: false })} style={{ background: "#22222a", color: GOLD }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">編集</button>
                    <button onClick={() => delMergeGroup(k)}><Trash2 size={14} color="#555" /></button>
                  </div>
                )}
                {settings.layoutLocked && <span className="text-[10px] text-zinc-600">🔒</span>}
              </div>
            );
          })}
        </div>
        {!settings.layoutLocked && (
          <button onClick={addMergeGroup} style={{ background: "#22222a", color: GOLD }} className="w-full rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1"><Plus size={12} />結合グループを追加</button>
        )}
      </div>

      {mergeEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,.7)" }} onClick={() => setMergeEdit(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#15151a", border: "1px solid #2a2a32" }} className="rounded-2xl p-5 max-w-md w-full">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-zinc-500">グループ名</span>
              <input value={mergeEdit.key} onChange={e => setMergeEdit(x => ({ ...x, key: e.target.value }))} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded px-2 py-1.5 outline-none" />
            </div>
            <p className="text-xs text-zinc-500 mb-2">結合する卓を選択（順番＝並ぶ順）</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {tables.map(t => {
                const idx = mergeEdit.tableIds.indexOf(t.id);
                const on = idx >= 0;
                return (
                  <button key={t.id} onClick={() => setMergeEdit(x => on
                    ? { ...x, tableIds: x.tableIds.filter(y => y !== t.id) }
                    : { ...x, tableIds: [...x.tableIds, t.id] })}
                    style={{ background: on ? "rgba(201,166,78,.2)" : "#0d0d10", border: `1px solid ${on ? GOLD : "#22222a"}`, color: on ? GOLD : "#888" }} className="text-xs rounded-lg py-2 px-1 font-bold relative">
                    {t.label}
                    {on && <span style={{ background: GOLD, color: "#000" }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold">{idx + 1}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMergeEdit(null)} className="px-4 py-2 rounded-lg text-sm text-zinc-400">キャンセル</button>
              <button onClick={saveMergeEdit} style={{ background: GOLD, color: "#000" }} className="px-4 py-2 rounded-lg text-sm font-bold">保存</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-zinc-500 w-16">構成費</span>
          <input type="number" value={settings.overheadPct} onChange={e => setSettings(s => ({ ...s, overheadPct: +e.target.value || 0 }))} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-20 rounded-lg px-3 py-2 outline-none" />
          <span className="text-xs text-zinc-500">%（全キャスト共通の給料からの控除率）</span>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-1">キャスト設定</h2>
        <p className="text-xs text-zinc-500 mb-3">※ ランク・ジャンル・給料条件をここで設定。フロアでは非表示。</p>
        <div className="flex gap-2 mb-4">
          <input ref={nameRef} placeholder="新規キャスト名" onKeyDown={e => { if (e.key === "Enter") addCast(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
          <button onClick={addCast} style={{ background: GOLD, color: "#000" }} className="px-3 rounded-lg text-sm font-bold">追加</button>
        </div>
        <div className="space-y-2">
          {casts.map(c => (
            <CastAdminCard key={c.id} c={c} upd={upd} setCasts={setCasts} toggleGenre={toggleGenre} />
          ))}
        </div>
      </div>

      <button onClick={() => { if (confirmReset) { resetNight(); setConfirmReset(false); } else setConfirmReset(true); }} style={{ background: confirmReset ? "#7a2222" : "#15151a", border: `1px solid ${confirmReset ? "#a13b3b" : "#2a2a32"}`, color: confirmReset ? "#fff" : "#999" }} className="w-full rounded-lg py-2.5 text-sm font-bold">{confirmReset ? "⚠ もう一度タップで全卓クリア確定" : "営業リセット（全卓クリア・名簿は保持）"}</button>
    </div>
  );
}

function CastAdminCard({ c, upd, setCasts, toggleGenre }) {
  const [open, setOpen] = useState(false);
  const num = (v) => +v || 0;
  return (
    <div style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <input value={c.name} onChange={e => upd(c.id, x => ({ ...x, name: e.target.value }))} style={{ background: "transparent", border: "none", fontSize: "16px" }} className="font-bold outline-none flex-1 min-w-0" />
        <div className="flex items-center gap-2">
          <button onClick={() => upd(c.id, x => ({ ...x, status: x.status === "出勤" ? "未出勤" : "出勤" }))} style={{ background: c.status === "出勤" ? "rgba(201,166,78,.15)" : "#1c1c22", border: `1px solid ${c.status === "出勤" ? GOLD : "#3a3a42"}`, color: c.status === "出勤" ? GOLD : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{c.status}</button>
          <button onClick={() => setCasts(cs => cs.filter(x => x.id !== c.id))}><Trash2 size={14} color="#555" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-zinc-500 w-12">ランク</span>
        <input type="range" min="1" max="10" value={c.score} onChange={e => upd(c.id, x => ({ ...x, score: +e.target.value }))} className="flex-1" style={{ accentColor: GOLD }} />
        <span style={{ color: GOLD }} className="text-sm font-bold w-6 text-center">{c.score}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] text-zinc-500 w-12">ジャンル</span>
        {GENRES.map(g => (
          <button key={g} onClick={() => toggleGenre(c.id, g)} style={{ background: c.genres.includes(g) ? GENRE_COLOR[g] : "#1c1c22", color: c.genres.includes(g) ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{g}</button>
        ))}
      </div>
      <button onClick={() => setOpen(o => !o)} style={{ background: "#0d0d10", border: "1px dashed #2a2a32", color: GOLD }} className="w-full rounded-lg py-1.5 text-[11px] font-bold">{open ? "▲ 給料条件を閉じる" : "▼ 給料条件を編集"}</button>
      {open && (
        <div className="mt-3 pt-3 border-t border-[#22222a] space-y-2">
          <PayRow label="時給" value={c.hourlyWage} onChange={v => upd(c.id, x => ({ ...x, hourlyWage: num(v) }))} suffix="円" />
          <PayRow label="ドリンクバック" value={c.drinkBack} onChange={v => upd(c.id, x => ({ ...x, drinkBack: num(v) }))} suffix="円/杯" />
          <PayRow label="ショットバック" value={c.shotBack} onChange={v => upd(c.id, x => ({ ...x, shotBack: num(v) }))} suffix="円/杯" />
          <PayRow label="ボトルバック" value={c.bottleBackPct} onChange={v => upd(c.id, x => ({ ...x, bottleBackPct: num(v) }))} suffix="%" />
          <PayRow label="同伴バック" value={c.dohanBack} onChange={v => upd(c.id, x => ({ ...x, dohanBack: num(v) }))} suffix="円/回" />
          <PayRow label="場内指名" value={c.fieldNominationBack} onChange={v => upd(c.id, x => ({ ...x, fieldNominationBack: num(v) }))} suffix="円/回" />
          <PayRow label="本指名" value={c.mainNominationBack} onChange={v => upd(c.id, x => ({ ...x, mainNominationBack: num(v) }))} suffix="円/回" />

          <div className="pt-2 border-t border-[#22222a]">
            <label className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={c.hasHairMake} onChange={e => upd(c.id, x => ({ ...x, hasHairMake: e.target.checked }))} style={{ accentColor: GOLD }} />
              <span className="text-xs">ヘアメイクあり</span>
            </label>
            {c.hasHairMake && <PayRow label="ヘアメイク金額" value={c.hairMakeAmount} onChange={v => upd(c.id, x => ({ ...x, hairMakeAmount: num(v) }))} suffix="円" />}
          </div>

          <div className="pt-2 border-t border-[#22222a]">
            <label className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={c.hasTransport} onChange={e => upd(c.id, x => ({ ...x, hasTransport: e.target.checked }))} style={{ accentColor: GOLD }} />
              <span className="text-xs">送迎あり</span>
            </label>
            {c.hasTransport && (
              <>
                <PayRow label="送迎（行き）" value={c.transportOut} onChange={v => upd(c.id, x => ({ ...x, transportOut: num(v) }))} suffix="円" />
                <PayRow label="送迎（帰り）" value={c.transportBack} onChange={v => upd(c.id, x => ({ ...x, transportBack: num(v) }))} suffix="円" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PayRow({ label, value, onChange, suffix }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500 w-24">{label}</span>
      <input type="number" value={value ?? 0} onChange={e => onChange(e.target.value)} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "15px" }} className="flex-1 rounded px-2 py-1 outline-none" />
      <span className="text-[10px] text-zinc-500 w-12">{suffix}</span>
    </div>
  );
}

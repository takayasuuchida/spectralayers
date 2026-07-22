import { useState, useEffect, useMemo, useRef } from "react";
import { LayoutGrid, Sparkles, Settings, Crown, Plus, X, Clock, AlertTriangle, ChevronLeft, ChevronRight, Trash2, Wand2, UserPlus, Link2, CalendarDays, Users, Cake, Package } from "lucide-react";

const APP_VERSION = "2.1.0"; // 画面右上に表示。リリースごとに上げる
const GOLD = "#c9a64e";
const TEAL = "#3fb6b0";
// URL パラメータで店舗を切り替え: ?store=viverce or ?store=ANELA など
const URL_STORE = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("store")) || "viverce";
const STORE_KEY = URL_STORE + "-v1";
const GENRES = ["綺麗", "可愛い", "おもしろい", "オタク系", "ギャル系", "ヤンキー系"];
const GENRE_COLOR = { "綺麗": "#7aa7ff", "可愛い": "#ff8fc4", "おもしろい": "#f0b54a", "オタク系": "#a78bfa", "ギャル系": "#ff9f45", "ヤンキー系": "#4ade80" };

const DEFAULT_SETTINGS = { storeName: URL_STORE, target: 1000000, layoutLocked: true, overheadPct: 15, taxRate: 10, latePenaltyPerMin: 0, withholdTax: false, gpsClockIn: false, shareEnabled: false };

// ---- リアルタイム卓状況共有（B案: 卓の空き状況だけクラウド、名前・売上・給料は端末内のみ） ----
// share-endpoint-override は E2E テスト用フック（通常運用では未設定）
const SHARE_BASE = (() => { try { return localStorage.getItem("share-endpoint-override") || "https://kngkckweonnnhfocfqan.supabase.co"; } catch { return "https://kngkckweonnnhfocfqan.supabase.co"; } })();
const SHARE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuZ2tja3dlb25ubmhmb2NmcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTQwODUsImV4cCI6MjA5NzU3MDA4NX0.lUeIniKLSh3wxjTL0JGB0PAamSv3X8JEidZtvKhO8-E"; // 公開前提の anon キー
const shareHeaders = { apikey: SHARE_API_KEY, Authorization: `Bearer ${SHARE_API_KEY}` };
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
  shiftStart: "", // 出勤予定時刻 "20:00" 形式。空なら遅刻判定なし
};
const DEFAULT_CAST_COUNTERS = {
  drinkCount: 0,
  shotCount: 0,
  bottleSales: 0,
  dohanCount: 0,
  fieldNominationCount: 0,
  mainNominationCount: 0,
  clockedInAt: null,
  lateMinutes: 0,
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

const DEFAULT_SEED_CASTS = [
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

const ANELA_SEED_CASTS = [
  "あいり", "あや", "あやな", "うた", "えな", "かれん", "かんな",
  "さはな", "さら", "のぞみ", "はのん", "ひより", "まい", "まゆ",
  "みき", "もえ", "もか", "ゆい", "ゆあ", "わかな", "なつき",
].map((name, i) => ({
  id: "a" + (i + 1),
  name,
  score: 5,
  genres: ["可愛い"],
  status: "出勤",
}));

const SEED_CASTS = URL_STORE === "ANELA" ? ANELA_SEED_CASTS : DEFAULT_SEED_CASTS;

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
// 業務日: AM6:00 未満は前日扱い（キャバクラの深夜業態向け）
function businessDateOfNow(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [active]);
  return now;
}

export default function App() {
  const [view, setView] = useState("floor");
  // 外用ビュー（キャッチ用・読み取り専用）。?watch=店コード or 設定から起動
  const [watchCode, setWatchCode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("watch") || localStorage.getItem("tsuke-watch-code") || "";
    } catch { return ""; }
  });
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
  const [history, setHistory] = useState([]); // [{ businessDate, subtotal, tax, grand, tableCount, activeCount, timestamp }]
  const [customerBook, setCustomerBook] = useState([]); // 客名帳マスタ [{ id, name, birthday, pref, memo, favoriteCastIds, visits, lastVisitAt }]
  const [bottleKeeps, setBottleKeeps] = useState([]); // [{ id, customerBookId, label, openedAt, expiresAt, memo, status }]
  const [auditLog, setAuditLog] = useState([]); // 監査ログ [{ t, action, detail }] 最新が先頭・最大1000件
  const [salaryHistory, setSalaryHistory] = useState([]); // 給料履歴（退勤確定ごと・最新が先頭・最大2000件）
  const [salaryAdjust, setSalaryAdjust] = useState({}); // 月次調整 { "YYYY-MM": { castId: { bonus, deduct, memo } } }
  const [reservations, setReservations] = useState([]); // 来店予約 [{ id, customerBookId, date, time, memo }]
  const [products, setProducts] = useState([]); // 商品マスタ [{ id, name, category, price, cost, stock, lowStockAt }]
  const [salesLog, setSalesLog] = useState([]); // 売上明細ログ（会計時に確定・原価分析用・最大3000件）
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
          setSettings({ ...DEFAULT_SETTINGS, ...(d.settings || {}), storeName: URL_STORE });
          setTables(d.tables || DEFAULT_TABLES);
          setMergeGroups(d.mergeGroups || DEFAULT_MERGE_GROUPS);
          setCasts((d.casts || SEED_CASTS).map(mergeCastDefaults));
          setTs(d.ts || {});
          setServed(d.served || {});
          setMerges(d.merges || {});
          setClosed(d.closed || []);
          setHistory(d.history || []);
          setCustomerBook(d.customerBook || []);
          setBottleKeeps(d.bottleKeeps || []);
          setAuditLog(d.auditLog || []);
          setSalaryHistory(d.salaryHistory || []);
          setSalaryAdjust(d.salaryAdjust || {});
          setReservations(d.reservations || []);
          setProducts(d.products || []);
          setSalesLog(d.salesLog || []);
        } catch (e) { setTs({}); setServed({}); }
      } else { setTs({}); setServed({}); }
      setLoaded(true);
    })();
  }, []);

  // 永続化: 保存（500msデバウンス）
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => { storeSet(STORE_KEY, JSON.stringify({ settings, tables, mergeGroups, casts, ts, served, merges, closed, history, customerBook, bottleKeeps, auditLog, salaryHistory, salaryAdjust, reservations, products, salesLog })); }, 500);
    return () => clearTimeout(id);
  }, [loaded, settings, tables, mergeGroups, casts, ts, served, merges, closed, history, customerBook, bottleKeeps, auditLog, salaryHistory, salaryAdjust, reservations, products, salesLog]);

  // ---- 監査ログ ----
  const logAudit = (action, detail = "") =>
    setAuditLog(l => [{ t: Date.now(), action, detail }, ...l].slice(0, 1000));

  // ---- バックアップ ----
  const buildPayload = () => ({ settings, tables, mergeGroups, casts, ts, served, merges, closed, history, customerBook, bottleKeeps, auditLog, salaryHistory, salaryAdjust, reservations, products, salesLog });

  function exportData() {
    const data = { app: "tsukemawashi", version: APP_VERSION, store: URL_STORE, exportedAt: new Date().toISOString(), payload: buildPayload() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tsukemawashi-${URL_STORE}-${businessDateOfNow()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    logAudit("バックアップ書き出し");
  }

  function applyPayload(p) {
    setSettings({ ...DEFAULT_SETTINGS, ...(p.settings || {}), storeName: URL_STORE });
    setTables(p.tables || DEFAULT_TABLES);
    setMergeGroups(p.mergeGroups || DEFAULT_MERGE_GROUPS);
    setCasts((p.casts || SEED_CASTS).map(mergeCastDefaults));
    setTs(p.ts || {});
    setServed(p.served || {});
    setMerges(p.merges || {});
    setClosed(p.closed || []);
    setHistory(p.history || []);
    setCustomerBook(p.customerBook || []);
    setBottleKeeps(p.bottleKeeps || []);
    setAuditLog(p.auditLog || []);
    setSalaryHistory(p.salaryHistory || []);
    setSalaryAdjust(p.salaryAdjust || {});
    setReservations(p.reservations || []);
    setProducts(p.products || []);
    setSalesLog(p.salesLog || []);
    setSel(null);
  }

  function importData(fileText, onResult) {
    try {
      const data = JSON.parse(fileText);
      if (data?.app !== "tsukemawashi" || !data.payload) { onResult?.({ ok: false, msg: "このアプリのバックアップファイルではありません。" }); return; }
      applyPayload(data.payload);
      setAuditLog(l => [{ t: Date.now(), action: "バックアップから復元", detail: `${data.store || "?"} / ${data.exportedAt || "?"}` }, ...l].slice(0, 1000));
      onResult?.({ ok: true, msg: `復元しました（${data.store || "?"} / ${(data.exportedAt || "").slice(0, 10)}）` });
    } catch (e) {
      onResult?.({ ok: false, msg: "ファイルを読み込めませんでした: " + (e.message || e) });
    }
  }

  // 自動世代バックアップ（営業リセット時に保存・最新5世代）
  const BAK_PREFIX = STORE_KEY + ":bak:";
  function writeAutoBackup() {
    try {
      const key = BAK_PREFIX + businessDateOfNow() + "-" + Date.now();
      localStorage.setItem(key, JSON.stringify({ app: "tsukemawashi", version: APP_VERSION, store: URL_STORE, exportedAt: new Date().toISOString(), payload: buildPayload() }));
      const keys = Object.keys(localStorage).filter(k => k.startsWith(BAK_PREFIX)).sort().reverse();
      keys.slice(5).forEach(k => localStorage.removeItem(k));
    } catch (e) { /* 容量オーバー等は黙って諦める（本体保存を優先） */ }
  }
  function listAutoBackups() {
    try {
      return Object.keys(localStorage).filter(k => k.startsWith(BAK_PREFIX)).sort().reverse().map(k => {
        try {
          const d = JSON.parse(localStorage.getItem(k));
          return { key: k, exportedAt: d.exportedAt, casts: (d.payload?.casts || []).length, customers: (d.payload?.customerBook || []).length, historyDays: (d.payload?.history || []).length };
        } catch { return { key: k, exportedAt: null }; }
      });
    } catch { return []; }
  }
  function restoreAutoBackup(key, onResult) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { onResult?.({ ok: false, msg: "バックアップが見つかりません" }); return; }
      importData(raw, onResult);
    } catch (e) { onResult?.({ ok: false, msg: String(e) }); }
  }

  function resetNight() {
    writeAutoBackup(); // リセット前の状態を自動バックアップ（5世代保持）
    // 今日の集計を history に保存
    const activeRows = Object.values(ts).filter(t => t?.active);
    const activeSubtotal = activeRows.reduce((s, t) => s + tableTotal(t), 0);
    const closedSubtotal = closed.reduce((s, r) => s + (r.total || 0), 0);
    const subtotal = activeSubtotal + closedSubtotal;
    const tax = Math.floor(subtotal * taxRate);
    const grand = subtotal + tax;
    const tableCount = closed.length;
    const activeCount = activeRows.length;
    if (subtotal > 0 || tableCount > 0) {
      // 卓別内訳（稼働率ヒートマップ用）
      const byTable = {};
      closed.forEach(r => { byTable[r.label] = (byTable[r.label] || 0) + (r.total || 0); });
      Object.entries(ts).filter(([, t]) => t?.active).forEach(([id, t]) => {
        const ref = tables.find(x => x.id === id);
        const label = ref ? dispTable(ref).label : id;
        byTable[label] = (byTable[label] || 0) + tableTotal(t);
      });
      const entry = {
        businessDate: businessDateOfNow(),
        subtotal, tax, grand, tableCount, activeCount, byTable,
        timestamp: Date.now(),
      };
      setHistory(h => [entry, ...h].slice(0, 365));
    }
    setTs({}); setServed({}); setClosed([]); setMerges({}); setSel(null);
    setCasts(cs => cs.map(c => ({ ...c, ...DEFAULT_CAST_COUNTERS, status: c.status === "出勤" ? "出勤" : c.status })));
    logAudit("営業リセット", `小計${yen(subtotal)} / 会計済${tableCount}卓`);
  }

  // 稼働開始／終了
  function clockIn(castId) {
    const c = casts.find(x => x.id === castId);
    const now = new Date();
    // 遅刻判定: shiftStart "HH:MM" が設定されていれば予定時刻との差分（分）
    let lateMinutes = 0;
    if (c?.shiftStart && /^\d{1,2}:\d{2}$/.test(c.shiftStart)) {
      const [h, m] = c.shiftStart.split(":").map(Number);
      const sched = new Date(now);
      sched.setHours(h, m, 0, 0);
      // 深夜営業: 予定が 0-5 時台で現在が夕方以降なら翌日扱い
      if (h < 6 && now.getHours() >= 12) sched.setDate(sched.getDate() + 1);
      lateMinutes = Math.max(0, Math.floor((now - sched) / 60000));
    }
    setCasts(cs => cs.map(x => x.id === castId ? { ...x, clockedInAt: Date.now(), status: "出勤", lateMinutes } : x));
    logAudit("出勤打刻", `${c?.name || "?"}${lateMinutes > 0 ? ` 遅刻${lateMinutes}分` : ""}`);
    // GPS打刻（設定でONの場合のみ・失敗しても打刻自体は成立）
    if (settings.gpsClockIn && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => logAudit("出勤GPS", `${c?.name || "?"} ${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`),
        () => logAudit("出勤GPS", `${c?.name || "?"} 取得失敗`),
        { timeout: 8000, maximumAge: 60000 }
      );
    }
  }
  function clockOut(castId) {
    const c = casts.find(x => x.id === castId);
    if (!c) return;
    if (!c.clockedInAt) { alert("稼働開始していません"); return; }
    const breakdown = calcSalary(c);
    setSalaryModal({ cast: c, breakdown });
  }
  function confirmClockOut(castId) {
    const c = casts.find(x => x.id === castId);
    if (c && salaryModal?.cast?.id === castId) {
      const b = salaryModal.breakdown;
      // 給料履歴に確定スナップショットを保存（月次集計・明細・CSV の元データ）
      setSalaryHistory(h => [{
        id: "sr" + Math.random().toString(36).slice(2, 8),
        castId, castName: c.name,
        businessDate: businessDateOfNow(),
        clockedInAt: c.clockedInAt, clockedOutAt: Date.now(),
        hours: +(b.hours || 0).toFixed(2),
        lateMinutes: b.lateMinutes || 0,
        wage: b.wage, drinkBack: b.drinkBack, shotBack: b.shotBack, bottleBack: b.bottleBack,
        dohanBack: b.dohanBack, fieldBack: b.fieldBack, mainBack: b.mainBack,
        gross: b.gross, hairMake: b.hairMake, transOut: b.transOut, transBack: b.transBack,
        latePenalty: b.latePenalty || 0, overhead: b.overhead, net: b.net,
        drinkCount: c.drinkCount || 0, shotCount: c.shotCount || 0, bottleSales: c.bottleSales || 0,
        dohanCount: c.dohanCount || 0, fieldNominationCount: c.fieldNominationCount || 0, mainNominationCount: c.mainNominationCount || 0,
      }, ...h].slice(0, 2000));
      logAudit("退勤確定", `${c.name} 給料${yen(b?.net || 0)}`);
    }
    setCasts(cs => cs.map(x => x.id === castId ? { ...x, ...DEFAULT_CAST_COUNTERS, status: "退勤済" } : x));
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
    const latePenalty = (c.lateMinutes || 0) * (settings.latePenaltyPerMin || 0);
    const afterCuts = gross - hairMake - transOut - transBack - latePenalty;

    const overhead = Math.round(afterCuts * (settings.overheadPct || 0) / 100);
    const net = afterCuts - overhead;

    return { hours, hoursMs, wage, drinkBack, shotBack, bottleBack, dohanBack, fieldBack, mainBack, gross, hairMake, transOut, transBack, latePenalty, lateMinutes: c.lateMinutes || 0, afterCuts, overhead, net };
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
  const taxRate = (settings.taxRate ?? 10) / 100;
  const tableTax = (t) => Math.floor(tableTotal(t) * taxRate);
  const tableGrand = (t) => tableTotal(t) + tableTax(t);

  // ---- 付け回しロジック（公平ドラフト方式） ----
  // 客がこれまで受けた「質」= 付いたキャスト（現在含む）の最高ランク。
  // まだいい子が付いてない客から順に、その時点の最良を配る。
  // → ボスに上位が集中せず、3名様なら3人に1回ずついい子が回る。
  const qualityReceived = (custId) =>
    Math.max(0, ...((served[custId] || []).map(id => castById[id]?.score || 0)));

  function fairDraft(targetCustomers, pool) {
    const order = [...targetCustomers].sort((a, b) =>
      qualityReceived(a.id) - qualityReceived(b.id) ||
      (b.isBoss ? 1 : 0) - (a.isBoss ? 1 : 0));
    let avail = [...pool];
    const plan = [];
    for (const cust of order) {
      const cand = avail.filter(c => !(served[cust.id] || []).includes(c.id));
      if (!cand.length) continue;
      const matched = cand.filter(c => cust.pref && c.genres.includes(cust.pref));
      const base = matched.length ? matched : cand;
      const pick = [...base].sort((a, b) => b.score - a.score)[0];
      plan.push([cust.id, pick.id]);
      avail = avail.filter(c => c.id !== pick.id);
    }
    return plan;
  }

  function suggest(t, cust) {
    const plan = fairDraft([cust], available);
    return plan.length ? castById[plan[0][1]] : null;
  }

  // ---- Phase G: 頭脳（ルールベース AI アドバイザー） ----
  // 30秒ごとに再評価（回転超過などの時間依存アドバイスのため）
  const [brainTick, setBrainTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setBrainTick(t => t + 1), 30000); return () => clearInterval(id); }, []);

  const WD_JP = ["日", "月", "火", "水", "木", "金", "土"];
  const advices = useMemo(() => {
    if (!loaded) return [];
    const out = [];
    const today = businessDateOfNow();
    const nowMs = Date.now();

    // 1) リアルタイム助言: 回転超過の卓 → 次の一手
    Object.entries(ts).forEach(([tid, t]) => {
      if (!t?.active) return;
      const rotMs = (t.setDuration / 3) * 60000;
      const over = t.casts.filter(a => (a.at ?? t.setStart) + rotMs - nowMs <= 0);
      if (over.length) {
        const label = tables.find(x => x.id === tid)?.label || tid;
        const names = over.map(a => castById[a.castId]?.name).filter(Boolean).join("・");
        const plan = fairDraft(t.customers, available);
        const nextNames = plan.slice(0, over.length).map(([, cid]) => castById[cid]?.name).filter(Boolean);
        out.push({ icon: "♻", level: "act", title: `${label}: ${names} が回転時間超過`, detail: nextNames.length ? `次候補: ${nextNames.join("・")}（卓詳細の 次▶ で1タップ交代）` : "空きキャストが不足。他卓からの回転を検討" });
      }
    });

    // 2) 異常検知: 今日のドリンク単価 vs 平常
    const drinkLogs = (salesLog || []).filter(r => r.label !== "セット");
    const todayDr = drinkLogs.filter(r => r.businessDate === today);
    const pastDr = drinkLogs.filter(r => r.businessDate !== today);
    const qtyOf = a => a.reduce((s, r) => s + (r.qty || 0), 0);
    if (qtyOf(todayDr) >= 3 && qtyOf(pastDr) >= 10) {
      const avg = a => a.reduce((s, r) => s + r.price * r.qty, 0) / Math.max(1, a.reduce((s, r) => s + r.qty, 0));
      const t0 = avg(todayDr), p0 = avg(pastDr);
      const pct = Math.round(t0 / p0 * 100);
      if (pct <= 75) out.push({ icon: "📉", level: "warn", title: `今日のドリンク単価が平常の${pct}%`, detail: `平均${yen(Math.round(t0))}/杯（普段${yen(Math.round(p0))}）。ボトル・シャンパン提案を強化` });
      else if (pct >= 150) out.push({ icon: "📈", level: "info", title: `今日のドリンク単価が平常の${pct}%`, detail: `平均${yen(Math.round(t0))}/杯。高単価が出てる、この調子` });
    }

    // 3) 売上ペース vs 同曜日平均
    const dow = new Date().getDay();
    const sameWd = (history || []).filter(h => new Date(h.businessDate + "T12:00:00").getDay() === dow);
    const todaySub = Object.values(ts).filter(t => t?.active).reduce((s, t) => s + tableTotal(t), 0) + closed.reduce((s, r) => s + (r.total || 0), 0);
    if (sameWd.length >= 2 && todaySub > 0) {
      const wavg = sameWd.reduce((s, h) => s + (h.subtotal || 0), 0) / sameWd.length;
      const pct = Math.round(todaySub / wavg * 100);
      out.push({ icon: pct >= 100 ? "🔥" : "🐢", level: "info", title: `本日 ${yen(todaySub)} — ${WD_JP[dow]}曜平均の${pct}%`, detail: `この曜日の平均は ${yen(Math.round(wavg))}` });
    }

    // 4) 需要予測: 明日の曜日ランク + 給料日前後
    if ((history || []).length >= 7) {
      const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
      const wdAvgAll = [0, 1, 2, 3, 4, 5, 6].map(d => {
        const rows = (history || []).filter(h => new Date(h.businessDate + "T12:00:00").getDay() === d);
        return rows.length ? rows.reduce((s, h) => s + (h.subtotal || 0), 0) / rows.length : 0;
      });
      const rank = [...wdAvgAll].sort((a, b) => b - a).indexOf(wdAvgAll[tmr.getDay()]);
      const paydayNear = [24, 25, 26].includes(tmr.getDate()) || tmr.getDate() >= 28 || tmr.getDate() === 1;
      if ((rank <= 1 && wdAvgAll[tmr.getDay()] > 0) || paydayNear) {
        out.push({ icon: "🔮", level: "info", title: `明日(${WD_JP[tmr.getDay()]})は混雑予想`, detail: [rank <= 1 ? "売上上位の曜日" : null, paydayNear ? "給料日前後" : null].filter(Boolean).join(" + ") + "。キャストの出勤を厚めに" });
      }
    }

    // 5) キープ提案: 残量30%以下（来店中なら今夜提案）
    (bottleKeeps || []).filter(k => k.status !== "empty" && k.status !== "disposed" && (k.remainingPct ?? 100) <= 30).forEach(k => {
      const cust = (customerBook || []).find(c => c.id === k.customerBookId);
      const inStore = Object.values(ts).some(t => t?.active && t.customers.some(cu => cu.customerBookId === k.customerBookId));
      out.push({ icon: "🍾", level: inStore ? "act" : "info", title: `${cust?.name || "?"}様「${k.label}」残り${k.remainingPct ?? 100}%`, detail: inStore ? "ご来店中！今夜が追加ボトル提案のチャンス" : "次回来店時に新しいボトルを提案する時期" });
    });

    // 6) キャストコーチング（直近30日の実績パターン）
    const c30 = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
    const agg = {};
    (salaryHistory || []).filter(r => r.businessDate >= c30).forEach(r => {
      const a = agg[r.castName] || (agg[r.castName] = { main: 0, dohan: 0, drink: 0, days: 0 });
      a.main += r.mainNominationCount || 0; a.dohan += r.dohanCount || 0; a.drink += r.drinkCount || 0; a.days += 1;
    });
    Object.entries(agg).forEach(([name, a]) => {
      if (a.days < 3) return;
      if (a.dohan >= 3 && a.main < a.dohan) out.push({ icon: "🎓", level: "info", title: `${name}: 同伴${a.dohan}回 / 本指名${a.main}回`, detail: "同伴は強いのに指名に繋がってない。同伴後の指名打診を仕込むと伸びる" });
      else if (a.drink >= 30 && a.main === 0) out.push({ icon: "🎓", level: "info", title: `${name}: ドリンク${a.drink}杯で本指名0`, detail: "卓では人気。連絡先交換と再来店の口実づくりを強化" });
    });

    // 7) 離脱リスク客（30日以上・利用額の大きい順）
    const ghosts = (customerBook || []).filter(c => (c.visits || 0) > 1 && c.lastVisitAt && nowMs - c.lastVisitAt >= 30 * 86400000)
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 3);
    if (ghosts.length) out.push({ icon: "💤", level: "warn", title: `離脱リスク: ${ghosts.map(c => c.name).join("・")}`, detail: `累計${yen(ghosts.reduce((s, c) => s + (c.totalSpent || 0), 0))}の常連。客名帳の「ご無沙汰DM」で声かけを` });

    // act(今すぐ) → warn → info の順
    const rank = { act: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }, [loaded, brainTick, ts, closed, history, salesLog, salaryHistory, customerBook, bottleKeeps, casts, served]);

  // ---- 共有パブリッシャー: 卓状況スナップショット（客名・売上は一切含めない） ----
  const sharePayload = useMemo(() => {
    if (!loaded || !settings.shareEnabled) return null;
    const nowMs = Date.now();
    return {
      at: nowMs,
      tables: tables.filter(tt => !secMerged(tt.id)).map(tt => {
        const disp = dispTable(tt);
        const t = ts[tt.id];
        if (!t?.active) return { label: disp.label, cap: disp.cap, busy: false };
        const remainMin = Math.ceil((t.setStart + t.setDuration * 60000 - nowMs) / 60000);
        const rotMs = (t.setDuration / 3) * 60000;
        const rotOver = t.casts.some(a => (a.at ?? t.setStart) + rotMs - nowMs <= 0);
        return { label: disp.label, cap: disp.cap, busy: true, guests: t.customers.length, remainMin, rotOver };
      }),
    };
  }, [loaded, settings.shareEnabled, ts, tables, merges, brainTick]);

  useEffect(() => {
    if (!sharePayload) return;
    const id = setTimeout(() => {
      fetch(`${SHARE_BASE}/rest/v1/floor?on_conflict=key`, {
        method: "POST",
        headers: { ...shareHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{ key: "share:" + URL_STORE, data: sharePayload, updated_at: new Date().toISOString() }]),
      }).catch(() => { /* 電波なしでも営業継続（オフラインファースト） */ });
    }, 2000);
    return () => clearTimeout(id);
  }, [sharePayload]);
  function doAssign(tableId, castId, customerId) {
    upd(tableId, t => {
      const seats = [...t.seats];
      const ci = seats.findIndex(s => s.k === "cust" && s.id === customerId);
      const entry = { k: "cast", id: castId };
      if (ci >= 0) seats.splice(ci + 1, 0, entry); else seats.push(entry);
      return { ...t, casts: [...t.casts, { castId, customerId, at: Date.now() }], seats };
    });
    setServed(s => ({ ...s, [customerId]: [...new Set([...(s[customerId] || []), castId])] }));
    const cust = ts[tableId]?.customers.find(c => c.id === customerId);
    // お気に入り自動検出: 付いた回数を客名帳に累積（多い順に自動お気に入り扱い）
    if (cust?.customerBookId) {
      setCustomerBook(cb => cb.map(c => c.id === cust.customerBookId
        ? { ...c, castAffinity: { ...(c.castAffinity || {}), [castId]: ((c.castAffinity || {})[castId] || 0) + 1 } }
        : c));
    }
    logAudit("付け回し", `${castById[castId]?.name || "?"} → ${cust?.name || "?"}`);
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
  // 卓のドラフト計画（2段方式）:
  //   1段目 = 未アサイン客（「卓を自動付け回し」が実行するのはここだけ）
  //   2段目 = アサイン済み客の次ローテ候補（1段目で使わなかった残りプールから）
  // 次▶チップ表示と自動付け回しの実行結果が常に一致する。
  function draftPlan(t, pool) {
    const assigned = new Set(t.casts.map(a => a.customerId));
    const nowStage = fairDraft(t.customers.filter(c => !assigned.has(c.id)), pool);
    const used = new Set(nowStage.map(([, castId]) => castId));
    const nextStage = fairDraft(t.customers.filter(c => assigned.has(c.id)), pool.filter(c => !used.has(c.id)));
    return { nowStage, all: [...nowStage, ...nextStage] };
  }

  function autoTable(tableId) {
    const t = ts[tableId];
    const ops = draftPlan(t, available).nowStage;
    if (!ops.length) { setModal({ type: "ng", msg: "全員アサイン済み、または空き不足です。" }); return; }
    ops.forEach(([cu, ca]) => doAssign(tableId, ca, cu));
  }
  function removeCast(tableId, castId) { upd(tableId, t => ({ ...t, casts: t.casts.filter(a => a.castId !== castId), seats: t.seats.filter(s => !(s.k === "cast" && s.id === castId)) })); }
  function moveSeat(tableId, idx, dir) { upd(tableId, t => { const a = [...t.seats]; const j = idx + dir; if (j < 0 || j >= a.length) return t; [a[idx], a[j]] = [a[j], a[idx]]; return { ...t, seats: a }; }); }
  function ensureCustomerBookEntry(name) {
    const nm = (name || "").trim();
    if (!nm) return null;
    const found = customerBook.find(c => c.name === nm);
    if (found) return found;
    const newCust = { id: "cb" + Math.random().toString(36).slice(2, 8), name: nm, birthday: "", pref: "綺麗", memo: "", favoriteCastIds: [], visits: 0, lastVisitAt: null };
    setCustomerBook(cb => [...cb, newCust]);
    return newCust;
  }
  function addCustomer(tableId, arg) {
    // arg: string (新規) | { customerBookId, name } (既存 or 新規)
    let cbId, name, pref;
    if (typeof arg === "string") {
      const cust = ensureCustomerBookEntry(arg);
      if (!cust) return;
      cbId = cust.id; name = cust.name; pref = cust.pref || "綺麗";
    } else if (arg?.customerBookId) {
      const existing = customerBook.find(c => c.id === arg.customerBookId);
      if (!existing) return;
      cbId = existing.id; name = existing.name; pref = existing.pref || "綺麗";
    } else {
      const cust = ensureCustomerBookEntry(arg?.name);
      if (!cust) return;
      cbId = cust.id; name = cust.name; pref = cust.pref || "綺麗";
    }
    setCustomerBook(cb => cb.map(c => c.id === cbId ? { ...c, visits: (c.visits || 0) + 1, lastVisitAt: Date.now() } : c));
    const id = "cu" + Math.random().toString(36).slice(2, 7);
    upd(tableId, t => ({ ...t, customers: [...t.customers, { id, customerBookId: cbId, name, isBoss: t.customers.length === 0, pref }], seats: [...t.seats, { k: "cust", id }] }));
  }
  function removeCustomer(tableId, custId) {
    upd(tableId, t => ({ ...t, customers: t.customers.filter(c => c.id !== custId), casts: t.casts.filter(a => a.customerId !== custId), seats: t.seats.filter(s => s.id !== custId && !(s.k === "cast" && t.casts.find(a => a.castId === s.id)?.customerId === custId)) }));
  }
  const setBoss = (tableId, id) => upd(tableId, t => ({ ...t, customers: t.customers.map(c => ({ ...c, isBoss: c.id === id })) }));
  const setPref = (tableId, id, pref) => upd(tableId, t => ({ ...t, customers: t.customers.map(c => c.id === id ? { ...c, pref } : c) }));
  const setSetType = (tableId, v) => upd(tableId, t => ({ ...t, setType: v }));
  const setDur = (tableId, v) => upd(tableId, t => ({ ...t, setDuration: v }));
  const bumpStock = (productId, delta) => {
    if (!productId || !delta) return;
    setProducts(ps => ps.map(p => p.id === productId ? { ...p, stock: Math.max(0, (p.stock || 0) + delta) } : p));
  };
  const addOrder = (tableId, o) => {
    upd(tableId, t => ({ ...t, orders: [...t.orders, { ...o, id: "o" + Math.random().toString(36).slice(2, 7), qty: 1 }] }));
    bumpStock(o.productId, -1); // リアルタイム在庫減算
    // カウンター自動加算（castId が付いていれば）
    if (o.castId) {
      if (o.kind === "drink") bumpCastCounter(o.castId, "drinkCount", 1);
      else if (o.kind === "shot") bumpCastCounter(o.castId, "shotCount", 1);
      else if (o.kind === "champagne" || o.kind === "bottle") setCasts(cs => cs.map(c => c.id === o.castId ? { ...c, bottleSales: (c.bottleSales || 0) + (o.price || 0) } : c));
    }
  };
  const ordQty = (tableId, oid, d) => {
    const o = ts[tableId]?.orders.find(x => x.id === oid);
    if (o) {
      const delta = Math.max(1, o.qty + d) - o.qty; // 下限1でクランプした実変化量
      bumpStock(o.productId, -delta);
    }
    upd(tableId, t => ({ ...t, orders: t.orders.map(o2 => o2.id === oid ? { ...o2, qty: Math.max(1, o2.qty + d) } : o2) }));
  };
  const delOrder = (tableId, oid) => {
    const o = ts[tableId]?.orders.find(x => x.id === oid);
    if (o) bumpStock(o.productId, o.qty); // 在庫を戻す
    upd(tableId, t => ({ ...t, orders: t.orders.filter(o2 => o2.id !== oid) }));
  };
  function openTable(tableId) {
    setTs(s => ({ ...s, [tableId]: { active: true, setType: 4000, setDuration: 60, setStart: Date.now(), customers: [], casts: [], seats: [], orders: [] } }));
    logAudit("卓オープン", tables.find(x => x.id === tableId)?.label || tableId);
  }
  function closeTable(tableId) {
    const t = ts[tableId]; const total = tableTotal(t);
    const tRef = tables.find(x => x.id === tableId);
    const label = tRef ? dispTable(tRef).label : tableId;
    const grand = total + Math.floor(total * taxRate);
    setClosed(c => [...c, { label, total, n: t.customers.length }]);
    // LTV: 客名帳連携済みのお客様に税込頭割り額を累積 + 来店履歴
    if (t.customers.length > 0) {
      const share = Math.round(grand / t.customers.length);
      const bookIds = new Set(t.customers.filter(c => c.customerBookId).map(c => c.customerBookId));
      if (bookIds.size > 0) {
        const bd = businessDateOfNow();
        setCustomerBook(cb => cb.map(c => bookIds.has(c.id)
          ? { ...c, totalSpent: (c.totalSpent || 0) + share, visitLog: [{ date: bd, amount: share }, ...(c.visitLog || [])].slice(0, 100) }
          : c));
      }
    }
    // 売上明細ログ（原価・粗利分析用）: セット + 各注文を確定記録
    {
      const bd = businessDateOfNow();
      const hour = new Date().getHours();
      const entries = [
        ...(t.customers.length > 0 ? [{ businessDate: bd, hour, label: "セット", price: t.setType * t.customers.length, qty: 1, cost: 0, productId: null }] : []),
        ...t.orders.map(o => ({
          businessDate: bd, hour, label: o.label, price: o.price, qty: o.qty,
          cost: (products.find(p => p.id === o.productId)?.cost || 0) * o.qty,
          productId: o.productId || null,
        })),
      ];
      if (entries.length) setSalesLog(sl => [...entries, ...sl].slice(0, 3000));
    }
    setTs(s => { const n = { ...s }; delete n[tableId]; return n; });
    setSel(null);
    logAudit("会計", `${label} ${yen(grand)}（税込・${t.customers.length}名)`);
  }
  function toggleMerge(g) {
    if ((mergeGroups[g] || []).some(id => ts[id]?.active)) { setModal({ type: "ng", msg: "結合する卓に客がいる間は変更できません。会計後にどうぞ。" }); return; }
    setMerges(m => ({ ...m, [g]: !m[g] }));
  }

  const visibleTables = tables.filter(t => !secMerged(t.id));

  const brandDisplay = (settings.storeName || "").split("").join(" ").toUpperCase();

  function enterWatch(code) {
    const c = (code || "").trim();
    if (!c) return;
    try { localStorage.setItem("tsuke-watch-code", c); } catch { /* noop */ }
    setWatchCode(c);
  }

  if (watchCode) {
    return <WatchView code={watchCode} onExit={() => { try { localStorage.removeItem("tsuke-watch-code"); } catch { /* noop */ } setWatchCode(""); }} />;
  }

  if (!loaded) return (
    <div style={{ background: "#000", minHeight: "100vh" }} className="flex items-center justify-center">
      <span style={{ fontFamily: "Georgia,serif", letterSpacing: "0.35em", color: GOLD }} className="text-base">{brandDisplay}</span>
    </div>
  );

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", fontFamily: "system-ui, sans-serif" }} className="pb-24">
      <div style={{ borderBottom: "1px solid #1c1c22", background: "#000" }} className="px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div style={{ fontFamily: "Georgia, serif", letterSpacing: "0.35em", color: GOLD }} className="text-lg pl-1">{brandDisplay}</div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-700">v{APP_VERSION}</span>
          <TopClock />
        </div>
      </div>

      {view === "floor" && <Floor {...{ visibleTables, dispTable, tables, ts, castById, setSel, merges, mergeGroups, toggleMerge, customerBook, reservations, products, advices }} />}
      {view === "stock" && <InventoryView {...{ products, setProducts, salesLog, logAudit }} />}
      {view === "cast" && <CastView {...{ casts, busy, clockIn, clockOut, bumpCastCounter, salaryHistory, salaryAdjust, setSalaryAdjust, settings }} />}
      {view === "sales" && <Sales {...{ ts, dispTable, tables, tableTotal, closed, target: settings.target, taxRate: settings.taxRate ?? 10, history, salesLog, salaryHistory, customerBook }} />}
      {view === "book" && <CustomerBookView {...{ customerBook, setCustomerBook, casts, bottleKeeps, setBottleKeeps, reservations, setReservations, storeName: settings.storeName, logAudit }} />}
      {view === "admin" && <Admin {...{ casts, setCasts, resetNight, settings, setSettings, tables, setTables, mergeGroups, setMergeGroups, ts, exportData, importData, listAutoBackups, restoreAutoBackup, auditLog, enterWatch }} />}

      {sel && tables.find(x => x.id === sel) && (
        <Detail key={sel} {...{
          tableId: sel, t: ts[sel], disp: dispTable(tables.find(x => x.id === sel) || { id: sel, label: sel, cap: 0 }), close: () => setSel(null),
          castById, served, tableTotal, tableTax, tableGrand, taxRate: settings.taxRate ?? 10, openTable, closeTable, addCustomer, removeCustomer, setBoss, setPref, setSetType, setDur,
          autoTable, autoCustomer, removeCast, moveSeat, setPick, addOrder, ordQty, delOrder, tryAssign,
          castsInTable: (ts[sel]?.casts || []).map(a => castById[a.castId]).filter(Boolean),
          customerBook, bottleKeeps, products,
          nextPlan: ts[sel]?.active
            ? Object.fromEntries(draftPlan(ts[sel], available).all)
            : {},
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
        {[["floor", LayoutGrid, "フロア"], ["cast", Sparkles, "キャスト"], ["book", Users, "客名帳"], ["sales", null, "売上"], ["stock", Package, "在庫"], ["admin", Settings, "設定"]].map(([k, Icon, label]) => (
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
  // 回転警告: 1回転 = セット時間÷3。いずれかのキャストが残3分以内/超過なら表示
  const rotMs = active ? (t.setDuration / 3) * 60000 : 0;
  const rotRemains = active ? t.casts.map(a => (a.at ?? t.setStart) + rotMs - now) : [];
  const rotOver = rotRemains.some(r => r <= 0);
  const rotSoon = !rotOver && rotRemains.some(r => r <= 3 * 60000);
  return (
    <button onClick={onClick} style={{ background: active ? "#141418" : "#0d0d10", border: `1.5px solid ${red ? "#a13b3b" : active ? GOLD : "#1c1c22"}`, boxShadow: red ? "0 0 14px rgba(180,60,60,.35)" : "none" }} className="rounded-2xl p-3 text-left min-h-[120px] flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: active ? "#fff" : "#555", fontFamily: "Georgia,serif" }} className="text-lg font-bold">{disp.label}</span>
        {active ? (
          <span className="flex items-center gap-1.5">
            {(rotOver || rotSoon) && (
              <span style={{ color: rotOver ? "#ff6a6a" : "#e0a84a" }} className="text-[10px] font-bold">♻{rotOver ? "交代!" : "まもなく"}</span>
            )}
            <span style={{ color: red ? "#ff6a6a" : "#9a9aa2" }} className="text-[11px] font-bold flex items-center gap-0.5"><Clock size={11} />{tstate === "over" ? "+" : ""}{fmt(remainOf(t, now))}</span>
          </span>
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

// ============ 外用ビュー（キャッチ用・読み取り専用・10秒ポーリング） ============
function WatchView({ code, onExit }) {
  const [state, setState] = useState(null); // { row, fetchedAt, error }
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`${SHARE_BASE}/rest/v1/floor?key=eq.${encodeURIComponent("share:" + code)}&select=data,updated_at`, { headers: shareHeaders });
        const rows = await res.json();
        if (alive) setState({ row: Array.isArray(rows) ? rows[0] || null : null, fetchedAt: Date.now(), error: null });
      } catch (e) {
        if (alive) setState(s => ({ row: s?.row || null, fetchedAt: Date.now(), error: String(e?.message || e) }));
      }
    }
    poll();
    const id = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [code]);

  const d = state?.row?.data;
  const stale = d?.at ? Date.now() - d.at > 3 * 60000 : false;
  const freeTables = d ? d.tables.filter(t => !t.busy) : [];
  const soonFree = d ? d.tables.filter(t => t.busy && (t.remainMin ?? 99) <= 15) : [];

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", fontFamily: "system-ui, sans-serif" }} className="pb-10">
      <div style={{ borderBottom: "1px solid #1c1c22", paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }} className="px-4 pb-3 flex items-center justify-between">
        <div>
          <div style={{ fontFamily: "Georgia,serif", letterSpacing: "0.3em", color: GOLD }} className="text-base">{(code || "").toUpperCase()}</div>
          <div className="text-[10px] text-zinc-500">外用ビュー（読み取り専用）</div>
        </div>
        <button onClick={onExit} style={{ background: "#1c1c22", color: "#999" }} className="text-xs px-3 py-1.5 rounded-lg">終了</button>
      </div>

      <div className="p-4">
        {!state && <p className="text-center text-zinc-500 py-16 text-sm">読み込み中…</p>}
        {state && !d && (
          <p className="text-center text-zinc-500 py-16 text-sm">
            まだ共有データがありません。<br />
            <span className="text-[11px]">店内の端末で 設定 →「リアルタイム共有」を ON にしてください{state.error ? `（通信エラー: 電波を確認）` : ""}</span>
          </p>
        )}
        {d && (
          <>
            {stale && (
              <div style={{ background: "rgba(224,85,85,.08)", border: "1px solid #a15050", color: "#e08484" }} className="rounded-xl p-2.5 mb-3 text-[11px] font-bold">
                ⚠ 店側の更新が {Math.floor((Date.now() - d.at) / 60000)}分前 から止まっています（電波 or 共有OFFの可能性）
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div style={{ background: "rgba(63,182,176,.08)", border: `1px solid ${TEAL}` }} className="rounded-2xl p-4 text-center">
                <div style={{ color: TEAL }} className="text-4xl font-bold">{freeTables.length}</div>
                <div className="text-[11px] text-zinc-400 mt-1">今すぐ入れる卓</div>
              </div>
              <div style={{ background: "rgba(224,168,74,.08)", border: "1px solid #e0a84a" }} className="rounded-2xl p-4 text-center">
                <div style={{ color: "#e0a84a" }} className="text-4xl font-bold">{soonFree.length}</div>
                <div className="text-[11px] text-zinc-400 mt-1">15分以内に空きそう</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {d.tables.map((t, i) => (
                <div key={i} style={{ background: t.busy ? "#141418" : "rgba(63,182,176,.06)", border: `1.5px solid ${t.busy ? ((t.remainMin ?? 99) <= 15 ? "#e0a84a" : "#2a2a32") : TEAL}` }} className="rounded-2xl p-3 min-h-[80px] flex flex-col">
                  <div className="flex items-center justify-between">
                    <span style={{ fontFamily: "Georgia,serif" }} className="text-base font-bold">{t.label}</span>
                    <span className="text-[10px] text-zinc-500">{t.cap}名卓</span>
                  </div>
                  {t.busy ? (
                    <div className="mt-auto">
                      <span style={{ color: (t.remainMin ?? 99) <= 15 ? "#e0a84a" : "#999" }} className="text-sm font-bold">
                        使用中{t.remainMin != null && t.remainMin > 0 ? ` 残${t.remainMin}分` : t.remainMin != null ? " 延長中" : ""}
                      </span>
                      <div className="text-[10px] text-zinc-500">{t.guests || 0}名{t.rotOver ? " ・♻交代中" : ""}</div>
                    </div>
                  ) : (
                    <span style={{ color: TEAL }} className="text-lg font-bold mt-auto">空き ◎</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-center text-[10px] text-zinc-600 mt-4">
              最終更新 {d.at ? new Date(d.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "?"} ・ 10秒ごとに自動取得
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function AdvisorPanel({ advices }) {
  const [open, setOpen] = useState(false);
  if (!advices?.length) return null;
  const urgent = advices.filter(a => a.level === "act").length;
  const LEVEL_STYLE = {
    act: { border: GOLD, bg: "rgba(201,166,78,.08)" },
    warn: { border: "#a15050", bg: "rgba(224,85,85,.06)" },
    info: { border: "#2a2a32", bg: "#141418" },
  };
  return (
    <div className="mb-3">
      <button onClick={() => setOpen(o => !o)} style={{ background: urgent ? "rgba(201,166,78,.12)" : "#141418", border: `1px solid ${urgent ? GOLD : "#2a2a32"}` }} className="w-full rounded-xl px-3 py-2.5 flex items-center justify-between">
        <span className="text-xs font-bold flex items-center gap-2">
          🧠 頭脳アドバイス
          <span style={{ background: urgent ? GOLD : "#2a2a32", color: urgent ? "#000" : "#999" }} className="rounded-full px-2 py-0.5 text-[10px] font-bold">{advices.length}</span>
          {urgent > 0 && <span style={{ color: GOLD }} className="text-[10px]">今すぐ対応 {urgent}件</span>}
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {advices.map((a, i) => {
            const st = LEVEL_STYLE[a.level] || LEVEL_STYLE.info;
            return (
              <div key={i} style={{ background: st.bg, border: `1px solid ${st.border}` }} className="rounded-xl p-2.5">
                <div className="text-xs font-bold mb-0.5">{a.icon} {a.title}</div>
                <div className="text-[11px] text-zinc-400">{a.detail}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Floor({ visibleTables, dispTable, tables, ts, castById, setSel, merges, mergeGroups, toggleMerge, customerBook, reservations, products, advices }) {
  const groupEntries = Object.entries(mergeGroups || {});
  const bdToday = (customerBook || []).filter(c => daysToBirthday(c.birthday) === 0);
  const bdTomorrow = (customerBook || []).filter(c => daysToBirthday(c.birthday) === 1);
  const today = businessDateOfNow();
  const resToday = (reservations || []).filter(r => r.date === today).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const custName = (id) => (customerBook || []).find(c => c.id === id)?.name || "?";
  const lowStock = (products || []).filter(p => p.lowStockAt != null && (p.stock || 0) <= p.lowStockAt);
  return (
    <div className="p-3">
      <AdvisorPanel advices={advices} />
      {(bdToday.length > 0 || bdTomorrow.length > 0 || resToday.length > 0 || lowStock.length > 0) && (
        <div style={{ background: "rgba(224,168,74,.08)", border: "1px solid #7a5a1a" }} className="rounded-xl p-2.5 mb-3 space-y-1 text-[11px]">
          {bdToday.length > 0 && <div><span style={{ color: "#e0a84a" }} className="font-bold">🎂 本日誕生日:</span> {bdToday.map(c => c.name).join("・")}</div>}
          {bdTomorrow.length > 0 && <div><span style={{ color: "#e0a84a" }} className="font-bold">🎂 明日誕生日:</span> {bdTomorrow.map(c => c.name).join("・")}<span className="text-zinc-500">（ボトル/花の手配を）</span></div>}
          {resToday.length > 0 && <div><span style={{ color: TEAL }} className="font-bold">📅 本日予約:</span> {resToday.map(r => `${r.time || ""} ${custName(r.customerBookId)}`).join("・")}</div>}
          {lowStock.length > 0 && <div><span style={{ color: "#e08484" }} className="font-bold">📦 在庫少:</span> {lowStock.map(p => `${p.name}(残${p.stock || 0})`).join("・")}</div>}
        </div>
      )}
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
  const { tableId, t, disp, close, castById, served, tableTotal, tableTax, tableGrand, taxRate, openTable, closeTable, addCustomer, removeCustomer, setBoss, setPref, setSetType, setDur, autoTable, autoCustomer, removeCast, moveSeat, setPick, addOrder, ordQty, delOrder, tryAssign, castsInTable, customerBook, bottleKeeps, products, nextPlan } = p;
  const [drinkPick, setDrinkPick] = useState(null); // { label, price, kind } — キャスト選択待ちのドリンク
  const [bookPickOpen, setBookPickOpen] = useState(false);
  // この卓のお客様たちのお気に入りキャストID（客名帳から）→ ドリンクピッカーで先頭表示
  const favCastIds = useMemo(() => {
    const s = new Set();
    (t?.customers || []).forEach(cu => {
      const cb = (customerBook || []).find(x => x.id === cu.customerBookId);
      (cb?.favoriteCastIds || []).forEach(id => s.add(id));
      // 自動検出: よく付く子 TOP2 も先頭グループに含める
      Object.entries(cb?.castAffinity || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([id]) => s.add(id));
    });
    return s;
  }, [t?.customers, customerBook]);
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
    setDrinkPick({ label: l, price: +pr, kind: "champagne" });
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
                const myAssigns = t.casts.filter(a => a.customerId === cust.id);
                const myCasts = myAssigns.map(a => castById[a.castId]).filter(Boolean);
                const pastCasts = (served[cust.id] || [])
                  .filter(id => !myCasts.some(c => c.id === id))
                  .map(id => castById[id]).filter(Boolean);
                const nextCast = nextPlan?.[cust.id] ? castById[nextPlan[cust.id]] : null;
                const rotMs = (t.setDuration / 3) * 60000;
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
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <span className="text-[10px] text-zinc-500">好み</span>
                      {GENRES.map(g => (
                        <button key={g} onClick={() => setPref(tableId, cust.id, g)} style={{ background: cust.pref === g ? GENRE_COLOR[g] : "#1c1c22", color: cust.pref === g ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{g}</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {myAssigns.map(a => {
                        const c = castById[a.castId];
                        if (!c) return null;
                        return (
                          <RotationChip key={a.castId} cast={c} at={a.at ?? t.setStart} rotMs={rotMs} onRemove={() => removeCast(tableId, c.id)} />
                        );
                      })}
                      {nextCast && (
                        <button onClick={() => tryAssign(tableId, nextCast.id, cust.id)} style={{ background: "rgba(201,166,78,.08)", border: `1px dashed ${GOLD}`, color: GOLD }} className="text-[11px] rounded-full px-2 py-0.5 font-bold flex items-center gap-1">
                          <Wand2 size={11} />次▶ {nextCast.name}
                        </button>
                      )}
                      <button onClick={() => setPick({ tableId, customerId: cust.id })} style={{ border: "1px dashed #444", color: "#999" }} className="text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1"><Plus size={11} />指名</button>
                    </div>
                    {pastCasts.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1.5">
                        <span className="text-[9px] text-zinc-600">済:</span>
                        {pastCasts.map(c => (
                          <span key={c.id} style={{ background: "#1a1a20", border: "1px solid #2a2a32", color: "#777" }} className="text-[10px] rounded-full px-1.5 py-0.5">{c.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2">
                <input ref={cnameRef} placeholder="お客様名（新規）" enterKeyHint="done" onKeyDown={e => { if (e.key === "Enter") submitCustomer(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none min-w-0" />
                <button onClick={submitCustomer} style={{ background: "#22222a", color: GOLD }} className="px-3 rounded-lg text-sm font-bold flex items-center gap-1"><UserPlus size={14} />新規</button>
                <button onClick={() => setBookPickOpen(true)} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="px-3 rounded-lg text-sm font-bold flex items-center gap-1"><Users size={14} />名帳</button>
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
              <button onClick={() => setDrinkPick({ label: "ドリンク", price: 1500, kind: "drink" })} style={{ background: "#141418", border: "1px solid #22222a" }} className="flex-1 rounded-lg py-2 text-xs font-bold">＋ドリンク ¥1,500</button>
              <button onClick={() => setDrinkPick({ label: "ショット", price: 3000, kind: "shot" })} style={{ background: "#141418", border: "1px solid #22222a" }} className="flex-1 rounded-lg py-2 text-xs font-bold">＋ショット ¥3,000</button>
            </div>
            {(products || []).length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {products.slice(0, 8).map(pr => (
                  <button key={pr.id} onClick={() => setDrinkPick({ label: pr.name, price: pr.price, kind: pr.category || "drink", productId: pr.id })} style={{ background: "#141418", border: "1px solid #2a2a32" }} className="rounded-lg py-2 px-2 text-[11px] font-bold text-left">
                    <span className="block truncate">{pr.name}</span>
                    <span className="text-zinc-500">{yen(pr.price)}</span>
                    {pr.lowStockAt != null && (pr.stock || 0) <= pr.lowStockAt && <span style={{ color: "#e0a84a" }}> 残{pr.stock || 0}</span>}
                  </button>
                ))}
              </div>
            )}
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

          <div style={{ background: "#141418", border: `1px solid ${GOLD}` }} className="rounded-2xl p-4">
            <div className="text-xs text-zinc-400 mb-2 space-y-0.5">
              <div className="flex justify-between"><span>セット {yen(t.setType)} × {t.customers.length}名</span><span>{yen(t.setType * t.customers.length)}</span></div>
              <div className="flex justify-between"><span>飲食</span><span>{yen(t.orders.reduce((a, o) => a + o.price * o.qty, 0))}</span></div>
            </div>
            <div className="border-t border-[#2a2a32] pt-2 space-y-1">
              <div className="flex justify-between text-xs text-zinc-400"><span>小計</span><span>{yen(tableTotal(t))}</span></div>
              <div className="flex justify-between text-xs text-zinc-500"><span>消費税 {taxRate}%</span><span>{yen(tableTax(t))}</span></div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm text-zinc-300 font-bold">合計（税込）</span>
                <span style={{ color: GOLD }} className="text-2xl font-bold">{yen(tableGrand(t))}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {drinkPick && (
        <DrinkCastPicker
          drink={drinkPick}
          castsInTable={castsInTable}
          favCastIds={favCastIds}
          onPick={(castId) => { addOrder(tableId, { ...drinkPick, castId }); setDrinkPick(null); }}
          onFree={() => { addOrder(tableId, { ...drinkPick }); setDrinkPick(null); }}
          onClose={() => setDrinkPick(null)}
        />
      )}

      {bookPickOpen && (
        <CustomerBookPicker
          customerBook={customerBook}
          bottleKeeps={bottleKeeps}
          onPick={(cbId) => { addCustomer(tableId, { customerBookId: cbId }); setBookPickOpen(false); }}
          onClose={() => setBookPickOpen(false)}
        />
      )}
    </div>
  );
}

function daysToBirthday(md) {
  if (!md) return null;
  const now = new Date();
  const [_, m, d] = /^(\d{4})?-?(\d{2})-(\d{2})$/.exec(md) || [null, null, null, null];
  if (!m || !d) return null;
  let target = new Date(now.getFullYear(), +m - 1, +d);
  if (target < now) target = new Date(now.getFullYear() + 1, +m - 1, +d);
  return Math.ceil((target - now) / 86400000);
}

function CustomerBookPicker({ customerBook, bottleKeeps, onPick, onClose }) {
  const [q, setQ] = useState("");
  const activeKeeps = (bottleKeeps || []).filter(k => k.status !== "empty" && k.status !== "disposed");
  const keepCountByCust = activeKeeps.reduce((acc, k) => { acc[k.customerBookId] = (acc[k.customerBookId] || 0) + 1; return acc; }, {});
  const filtered = (customerBook || [])
    .filter(c => !q || c.name.includes(q))
    .sort((a, b) => (b.lastVisitAt || 0) - (a.lastVisitAt || 0));
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,.6)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d10", borderTop: "1px solid #22222a" }} className="w-full rounded-t-3xl p-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">客名帳から選ぶ</h3>
          <button onClick={onClose}><X size={20} color="#888" /></button>
        </div>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="名前で検索" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-full rounded-lg px-3 py-2 outline-none mb-3" />
        {filtered.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-6">
            {customerBook?.length ? "該当なし" : "客名帳がまだ空です。新規で追加すると自動で登録されます。"}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filtered.map(c => {
              const days = daysToBirthday(c.birthday);
              const nearBd = days !== null && days <= 30;
              const last = c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "未来店";
              return (
                <button key={c.id} onClick={() => onPick(c.id)} style={{ background: "#141418", border: `1px solid ${nearBd ? "#e0a84a" : "#22222a"}` }} className="rounded-xl p-3 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{c.name}</span>
                      {c.pref && <span style={{ background: GENRE_COLOR[c.pref] || "#22222a", color: "#000" }} className="text-[10px] rounded-full px-1.5 py-0.5 font-bold">{c.pref}</span>}
                      {nearBd && <span style={{ color: "#e0a84a" }} className="text-[10px] flex items-center gap-0.5"><Cake size={10} />誕生日 {days === 0 ? "本日" : `あと${days}日`}</span>}
                      {keepCountByCust[c.id] > 0 && <span style={{ color: "#e8d29a", background: "rgba(201,166,78,.15)" }} className="text-[10px] rounded-full px-1.5 py-0.5 font-bold">🍾 キープ{keepCountByCust[c.id]}本</span>}
                    </div>
                    <span className="text-[10px] text-zinc-500">{c.visits || 0}回 / {last}</span>
                  </div>
                  {c.memo && <p className="text-[11px] text-zinc-500 mt-1 truncate">📝 {c.memo}</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DrinkCastPicker({ drink, castsInTable, favCastIds, onPick, onFree, onClose }) {
  const fav = favCastIds || new Set();
  // お気に入りキャストを先頭に（同グループ内は元の並び順を維持）
  const sorted = [...castsInTable].sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0));
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,.6)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d10", borderTop: "1px solid #22222a" }} className="w-full rounded-t-3xl p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">
            <span className="text-zinc-500">{drink.label} </span>
            <span style={{ color: GOLD }}>{yen(drink.price)}</span>
            <span className="text-zinc-500 text-xs"> を誰につける？</span>
          </h3>
          <button onClick={onClose}><X size={20} color="#888" /></button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-xs text-zinc-500 mb-3">この卓にはまだキャストが付いていません。「フリー」で追加します。</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {sorted.map(c => {
              const isFav = fav.has(c.id);
              return (
                <button key={c.id} onClick={() => onPick(c.id)} style={{ background: isFav ? "rgba(201,166,78,.1)" : "#141418", border: `1px solid ${isFav ? GOLD : TEAL}` }} className="rounded-xl p-3 text-left">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-sm">{c.name}</span>
                    {isFav && <span style={{ color: GOLD }} className="text-[10px] font-bold">⭐ お気に入り</span>}
                  </div>
                  <div className="text-[10px] text-zinc-500">バック ¥{(drink.kind === "shot" ? c.shotBack : c.drinkBack) || 0}</div>
                </button>
              );
            })}
          </div>
        )}
        <button onClick={onFree} style={{ background: "#22222a", color: "#aaa", border: "1px dashed #444" }} className="w-full rounded-lg py-2 text-xs font-bold">キャスト指定なし（フリー）で追加</button>
      </div>
    </div>
  );
}

// 「今 ○○」チップ + 回転残り時間。1回転 = セット時間÷3。
// 残り3分で黄色、超過で赤「交代!」
function RotationChip({ cast, at, rotMs, onRemove }) {
  const now = useNow(true);
  const remain = at + rotMs - now;
  const over = remain <= 0;
  const soon = !over && remain <= 3 * 60000;
  const color = over ? "#ff6a6a" : soon ? "#e0a84a" : TEAL;
  const bg = over ? "rgba(224,85,85,.12)" : soon ? "rgba(224,168,74,.12)" : "rgba(63,182,176,.15)";
  const fg = over ? "#ffb3b3" : soon ? "#f0cf9a" : "#a8e6e2";
  return (
    <span style={{ background: bg, border: `1px solid ${color}`, color: fg }} className="text-[11px] rounded-full pl-2 pr-1 py-0.5 font-bold flex items-center gap-1">
      今 {cast.name}
      <span className="text-[9px] opacity-90">{over ? "交代!" : `残${Math.ceil(remain / 60000)}分`}</span>
      <button onClick={onRemove}><X size={11} /></button>
    </span>
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
  const nowNames = tableCasts.filter(a => a.customerId === cust?.id).map(a => castById[a.castId]?.name).filter(Boolean);
  const pastNames = (served[cust?.id] || [])
    .filter(id => !tableCasts.some(a => a.customerId === cust?.id && a.castId === id))
    .map(id => castById[id]?.name).filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,.6)" }} onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d10", borderTop: "1px solid #22222a" }} className="w-full rounded-t-3xl p-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold">{cust?.name}さんに付ける（好み: <span style={{ color: GENRE_COLOR[cust?.pref] }}>{cust?.pref}</span>）</h3>
          <button onClick={close}><X size={20} color="#888" /></button>
        </div>
        {(nowNames.length > 0 || pastNames.length > 0) && (
          <p className="text-[11px] mb-1">
            {nowNames.length > 0 && <span style={{ color: "#a8e6e2" }}>今: {nowNames.join("・")}　</span>}
            {pastNames.length > 0 && <span className="text-zinc-500">済: {pastNames.join("・")}</span>}
          </p>
        )}
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
                <div className="flex gap-1 mt-1 flex-wrap">
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

function CastView({ casts, busy, clockIn, clockOut, bumpCastCounter, salaryHistory, salaryAdjust, setSalaryAdjust, settings }) {
  const [tab, setTab] = useState("today");
  if (tab === "salary") {
    return (
      <div className="p-4 pb-4">
        <CastTabBar tab={tab} setTab={setTab} />
        <SalaryView {...{ salaryHistory, salaryAdjust, setSalaryAdjust, settings, casts }} />
      </div>
    );
  }
  return <CastToday {...{ casts, busy, clockIn, clockOut, bumpCastCounter, tab, setTab }} />;
}

function CastTabBar({ tab, setTab }) {
  return (
    <div className="flex gap-2 mb-4">
      <button onClick={() => setTab("today")} style={{ background: tab === "today" ? GOLD : "#141418", color: tab === "today" ? "#000" : "#888", border: `1px solid ${tab === "today" ? GOLD : "#22222a"}` }} className="flex-1 rounded-lg py-2 text-xs font-bold">出勤・稼働</button>
      <button onClick={() => setTab("salary")} style={{ background: tab === "salary" ? GOLD : "#141418", color: tab === "salary" ? "#000" : "#888", border: `1px solid ${tab === "salary" ? GOLD : "#22222a"}` }} className="flex-1 rounded-lg py-2 text-xs font-bold">給料集計（月次）</button>
    </div>
  );
}

function CastToday({ casts, busy, clockIn, clockOut, bumpCastCounter, tab, setTab }) {
  const working = casts.filter(c => c.clockedInAt);
  const notYet = casts.filter(c => !c.clockedInAt && c.status !== "退勤済");
  const done = casts.filter(c => c.status === "退勤済");
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="p-4 pb-4">
      <CastTabBar tab={tab} setTab={setTab} />
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

function SalaryView({ salaryHistory, salaryAdjust, setSalaryAdjust, settings, casts }) {
  const months = useMemo(() => [...new Set((salaryHistory || []).map(r => r.businessDate.slice(0, 7)))].sort().reverse(), [salaryHistory]);
  const [month, setMonth] = useState(months[0] || businessDateOfNow().slice(0, 7));
  useEffect(() => { if (months.length && !months.includes(month)) setMonth(months[0]); }, [months.join("|")]);
  const [detailCastId, setDetailCastId] = useState(null);

  const recs = (salaryHistory || []).filter(r => r.businessDate.startsWith(month));
  const byCast = {};
  recs.forEach(r => {
    const b = byCast[r.castId] || (byCast[r.castId] = { castId: r.castId, name: r.castName, days: new Set(), hours: 0, gross: 0, net: 0, drinkCount: 0, shotCount: 0, dohanCount: 0, fieldNominationCount: 0, mainNominationCount: 0, bottleSales: 0, lateMinutes: 0, records: [] });
    b.days.add(r.businessDate); b.hours += r.hours || 0; b.gross += r.gross || 0; b.net += r.net || 0;
    b.drinkCount += r.drinkCount || 0; b.shotCount += r.shotCount || 0; b.dohanCount += r.dohanCount || 0;
    b.fieldNominationCount += r.fieldNominationCount || 0; b.mainNominationCount += r.mainNominationCount || 0;
    b.bottleSales += r.bottleSales || 0; b.lateMinutes += r.lateMinutes || 0;
    b.records.push(r);
  });
  const rows = Object.values(byCast).map(b => {
    const adj = salaryAdjust?.[month]?.[b.castId] || {};
    const bonus = +adj.bonus || 0, deduct = +adj.deduct || 0;
    const payable = b.net + bonus - deduct;
    const tax = settings.withholdTax ? Math.round(payable * 0.1021) : 0;
    return { ...b, dayCount: b.days.size, bonus, deduct, payable, tax, final: payable - tax };
  }).sort((a, b) => b.final - a.final);
  const total = rows.reduce((s, r) => s + r.final, 0);

  function exportCsv() {
    const head = "キャスト,出勤日数,稼働時間,総支給,純支給,賞与,追加控除,源泉徴収,振込額";
    const lines = rows.map(r => [r.name, r.dayCount, r.hours.toFixed(1), r.gross, r.net, r.bonus, r.deduct, r.tax, r.final].join(","));
    const csv = "﻿" + [head, ...lines, `合計,,,,,,,,${total}`].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `給料_${month}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const detail = rows.find(r => r.castId === detailCastId);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-zinc-500">対象月</span>
        {(months.length ? months : [month]).map(m => (
          <button key={m} onClick={() => setMonth(m)} style={{ background: month === m ? GOLD : "#141418", color: month === m ? "#000" : "#888", border: `1px solid ${month === m ? GOLD : "#22222a"}` }} className="text-[11px] rounded-full px-2.5 py-1 font-bold">{m}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-zinc-500 text-sm py-12">
          {month} の給料データがありません。<br />
          <span className="text-[11px] text-zinc-600">キャストの「退勤」→「退勤確定」で自動的に記録されます。</span>
        </div>
      ) : (
        <>
          <div style={{ background: "rgba(201,166,78,.08)", border: `1px solid ${GOLD}` }} className="rounded-xl p-3 mb-3 flex items-center justify-between">
            <span className="text-xs text-zinc-400">{month} 人件費合計（{rows.length}名）</span>
            <span style={{ color: GOLD }} className="text-xl font-bold">{yen(total)}</span>
          </div>
          <button onClick={exportCsv} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="w-full rounded-lg py-2 text-xs font-bold mb-3">📄 振込用CSVを書き出す</button>
          <div className="space-y-2">
            {rows.map(r => (
              <button key={r.castId} onClick={() => setDetailCastId(r.castId)} style={{ background: "#141418", border: "1px solid #22222a" }} className="w-full rounded-xl p-3 text-left">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">{r.name}</span>
                  <span style={{ color: GOLD }} className="font-bold">{yen(r.final)}</span>
                </div>
                <div className="text-[11px] text-zinc-500 flex gap-3 flex-wrap">
                  <span>{r.dayCount}日 / {r.hours.toFixed(1)}h</span>
                  <span>本指{r.mainNominationCount} 場内{r.fieldNominationCount} 同伴{r.dohanCount}</span>
                  <span>Dr{r.drinkCount} 🍾{yen(r.bottleSales)}</span>
                  {r.lateMinutes > 0 && <span style={{ color: "#e0a84a" }}>遅刻{r.lateMinutes}分</span>}
                  {(r.bonus > 0 || r.deduct > 0 || r.tax > 0) && <span>調整 +{r.bonus}/-{r.deduct}{r.tax > 0 ? ` 源泉-${r.tax}` : ""}</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {detail && (
        <CastSalaryDetail
          r={detail} month={month} settings={settings}
          onAdjust={(key, val) => setSalaryAdjust(sa => ({ ...sa, [month]: { ...(sa[month] || {}), [detail.castId]: { ...((sa[month] || {})[detail.castId] || {}), [key]: val } } }))}
          onClose={() => setDetailCastId(null)}
        />
      )}
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-12 text-zinc-500">{label}</span>
      <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: "#1c1c22" }}>
        <div style={{ width: pct + "%", background: color, minWidth: value > 0 ? 4 : 0 }} className="h-full" />
      </div>
      <span className="w-8 text-right font-bold">{value}</span>
    </div>
  );
}

function CastSalaryDetail({ r, month, settings, onAdjust, onClose }) {
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const maxCount = Math.max(r.mainNominationCount, r.fieldNominationCount, r.dohanCount, r.drinkCount, r.shotCount, 1);

  const slipText = [
    `【給与明細】${month} ${r.name}`,
    `出勤 ${r.dayCount}日 / 稼働 ${r.hours.toFixed(1)}h${r.lateMinutes > 0 ? ` / 遅刻 ${r.lateMinutes}分` : ""}`,
    `総支給 ${yen(r.gross)}`,
    `純支給（各種控除後） ${yen(r.net)}`,
    r.bonus > 0 ? `賞与 +${yen(r.bonus)}` : null,
    r.deduct > 0 ? `追加控除 -${yen(r.deduct)}` : null,
    r.tax > 0 ? `源泉徴収(10.21%) -${yen(r.tax)}` : null,
    `━━━━━━━━━━`,
    `支給額 ${yen(r.final)}`,
    ``,
    `実績: 本指名${r.mainNominationCount} / 場内${r.fieldNominationCount} / 同伴${r.dohanCount} / ドリンク${r.drinkCount} / ショット${r.shotCount} / ボトル売上${yen(r.bottleSales)}`,
  ].filter(x => x !== null).join("\n");

  async function copySlip() {
    try {
      await navigator.clipboard.writeText(slipText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowText(true); // クリップボード不可の環境では全文表示して手動コピー
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.75)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#141418", border: `1px solid ${GOLD}` }} className="rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 style={{ fontFamily: "Georgia,serif", color: GOLD }} className="text-xl font-bold">{r.name}</h3>
          <button onClick={onClose}><X size={20} color="#888" /></button>
        </div>
        <p className="text-xs text-zinc-500 mb-3">{month} 月次明細 ・ {r.dayCount}日 / {r.hours.toFixed(1)}h</p>

        <div className="space-y-1.5 mb-4">
          <MiniBar label="本指名" value={r.mainNominationCount} max={maxCount} color={GOLD} />
          <MiniBar label="場内" value={r.fieldNominationCount} max={maxCount} color="#e0a84a" />
          <MiniBar label="同伴" value={r.dohanCount} max={maxCount} color={TEAL} />
          <MiniBar label="ドリンク" value={r.drinkCount} max={maxCount} color="#7aa7ff" />
          <MiniBar label="ショット" value={r.shotCount} max={maxCount} color="#a78bfa" />
        </div>

        <div className="space-y-1 text-sm mb-3">
          <SalaryLine l="総支給（月合計）" v={r.gross} />
          <SalaryLine l="純支給（控除後）" v={r.net} />
        </div>

        <div className="border-t border-[#22222a] pt-3 mb-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">賞与</span>
            <input type="number" value={r.bonus || ""} placeholder="0" onChange={e => onAdjust("bonus", +e.target.value || 0)} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "15px" }} className="flex-1 rounded px-2 py-1.5 outline-none" />
            <span className="text-[10px] text-zinc-500">円</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">追加控除</span>
            <input type="number" value={r.deduct || ""} placeholder="0" onChange={e => onAdjust("deduct", +e.target.value || 0)} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "15px" }} className="flex-1 rounded px-2 py-1.5 outline-none" />
            <span className="text-[10px] text-zinc-500">円</span>
          </div>
          {r.tax > 0 && <div className="flex justify-between text-xs"><span className="text-zinc-500">源泉徴収 10.21%</span><span style={{ color: "#ff8888" }}>-{yen(r.tax)}</span></div>}
        </div>

        <div style={{ background: "rgba(201,166,78,.1)", border: `1px solid ${GOLD}` }} className="rounded-xl p-3 mb-3 flex justify-between items-center">
          <span className="text-sm text-zinc-400">支給額</span>
          <span style={{ color: GOLD }} className="text-2xl font-bold">{yen(r.final)}</span>
        </div>

        <div className="mb-3">
          <p className="text-[10px] text-zinc-500 mb-1.5">日別</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {r.records.map(rec => (
              <div key={rec.id} className="flex items-center justify-between text-[11px]" style={{ background: "#0d0d10", border: "1px solid #1c1c22" }}>
                <span className="px-2 py-1 text-zinc-400">{rec.businessDate.slice(5).replace("-", "/")} ・ {rec.hours.toFixed(1)}h{rec.lateMinutes > 0 ? ` ・遅${rec.lateMinutes}分` : ""}</span>
                <span className="px-2 py-1 font-bold">{yen(rec.net)}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={copySlip} style={{ background: GOLD, color: "#000" }} className="w-full rounded-lg py-2.5 text-sm font-bold">{copied ? "✅ コピーしました（LINE等に貼り付け）" : "📋 明細テキストをコピー"}</button>
        {showText && (
          <textarea readOnly value={slipText} rows={8} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "12px" }} className="w-full rounded-lg p-2 mt-2 outline-none" onFocus={e => e.target.select()} />
        )}
      </div>
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
          {b.latePenalty > 0 && <SalaryLine l={`遅刻ペナルティ ${b.lateMinutes}分`} v={-b.latePenalty} cut />}
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

function Sales({ ts, dispTable, tables, tableTotal, closed, target, taxRate, history, salesLog, salaryHistory, customerBook }) {
  const [tab, setTab] = useState("today");
  const TabBtn = ({ k, children }) => (
    <button onClick={() => setTab(k)} style={{ background: tab === k ? GOLD : "#141418", color: tab === k ? "#000" : "#888", border: `1px solid ${tab === k ? GOLD : "#22222a"}` }} className="flex-1 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1">{children}</button>
  );
  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <TabBtn k="today">今日</TabBtn>
        <TabBtn k="history"><CalendarDays size={13} />履歴</TabBtn>
        <TabBtn k="bi">📊 分析</TabBtn>
      </div>
      {tab === "today" && <SalesToday ts={ts} dispTable={dispTable} tables={tables} tableTotal={tableTotal} closed={closed} target={target} taxRate={taxRate} />}
      {tab === "history" && <SalesHistory history={history} />}
      {tab === "bi" && <AnalyticsView {...{ history, salesLog, salaryHistory, customerBook }} />}
    </div>
  );
}

// ============ Phase F: BI ダッシュボード ============
function csvDownload(filename, head, rows) {
  const csv = "﻿" + [head, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function AnalyticsView({ history, salesLog, salaryHistory, customerBook }) {
  const [range, setRange] = useState(30); // 7 / 30 / 90 / 9999 日
  const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - range); return d.toISOString().slice(0, 10); })();
  const hist = (history || []).filter(h => h.businessDate >= cutoff).sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  const logs = (salesLog || []).filter(r => r.businessDate >= cutoff);
  const sals = (salaryHistory || []).filter(r => r.businessDate >= cutoff);

  const totalSales = hist.reduce((s, h) => s + (h.subtotal || 0), 0);
  const avgDay = hist.length ? Math.round(totalSales / hist.length) : 0;
  const maxDay = Math.max(1, ...hist.map(h => h.subtotal || 0));

  // 曜日別平均
  const wd = [[], [], [], [], [], [], []];
  hist.forEach(h => { const d = new Date(h.businessDate + "T12:00:00"); wd[d.getDay()].push(h.subtotal || 0); });
  const wdAvg = wd.map(a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  const wdMax = Math.max(1, ...wdAvg);
  const WD_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  // 時間帯別（18時〜翌5時）
  const hourly = {};
  logs.forEach(r => { if (r.hour != null) hourly[r.hour] = (hourly[r.hour] || 0) + r.price * r.qty; });
  const HOURS = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
  const hourMax = Math.max(1, ...HOURS.map(h => hourly[h] || 0));

  // キャスト別（給料履歴から: 純支給と指名数）
  const castAgg = {};
  sals.forEach(r => {
    const a = castAgg[r.castName] || (castAgg[r.castName] = { net: 0, main: 0, dohan: 0, bottle: 0 });
    a.net += r.net || 0; a.main += r.mainNominationCount || 0; a.dohan += r.dohanCount || 0; a.bottle += r.bottleSales || 0;
  });
  const castRows = Object.entries(castAgg).map(([name, a]) => ({ name, ...a })).sort((a, b) => b.bottle + b.net - (a.bottle + a.net)).slice(0, 10);
  const castMax = Math.max(1, ...castRows.map(r => r.net));

  // 卓稼働ヒートマップ（直近14日 × 卓、履歴の byTable から）
  const heatDays = (history || []).filter(h => h.byTable).sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 14).reverse();
  const heatTables = [...new Set(heatDays.flatMap(h => Object.keys(h.byTable || {})))];
  const heatMax = Math.max(1, ...heatDays.flatMap(h => Object.values(h.byTable || {})));

  // 顧客セグメント
  const segs = { A: [], B: [], C: [], 休眠: [] };
  const now = Date.now();
  (customerBook || []).forEach(c => {
    if ((c.visits || 0) === 0) return;
    if (c.lastVisitAt && now - c.lastVisitAt >= 30 * 86400000) segs["休眠"].push(c);
    else if ((c.totalSpent || 0) >= 100000) segs.A.push(c);
    else if ((c.totalSpent || 0) >= 30000) segs.B.push(c);
    else segs.C.push(c);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {[[7, "7日"], [30, "30日"], [90, "90日"], [9999, "全部"]].map(([d, l]) => (
          <button key={d} onClick={() => setRange(d)} style={{ background: range === d ? GOLD : "#141418", color: range === d ? "#000" : "#888", border: `1px solid ${range === d ? GOLD : "#22222a"}` }} className="text-[11px] rounded-full px-3 py-1 font-bold">{l}</button>
        ))}
        <span className="text-[10px] text-zinc-500 ml-auto">計{yen(totalSales)} / 平均{yen(avgDay)}/日</span>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">売上推移（税抜/日）</p>
        {hist.length === 0 ? <p className="text-[11px] text-zinc-600">データなし（営業リセットで日次が記録されます）</p> : (
          <div className="overflow-x-auto pb-1">
            <div className="flex items-end gap-1 h-28" style={{ minWidth: hist.length * 18 }}>
              {hist.map((h, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5" style={{ width: 16 }}>
                  <div style={{ height: Math.max(2, Math.round((h.subtotal || 0) / maxDay * 96)), width: 12, background: "linear-gradient(180deg,#f3e2a0,#c9a64e)", borderRadius: 2 }} />
                  <span className="text-[8px] text-zinc-600">{h.businessDate.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">曜日別 平均売上</p>
        <div className="space-y-1">
          {WD_LABELS.map((l, i) => (
            <MiniBar key={l} label={l} value={wdAvg[i]} max={wdMax} color={i === 5 || i === 6 ? GOLD : TEAL} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">時間帯別 売上（会計時刻ベース）</p>
        {Object.keys(hourly).length === 0 ? <p className="text-[11px] text-zinc-600">データなし（会計すると記録されます）</p> : (
          <div className="flex items-end gap-1 h-20">
            {HOURS.map(h => (
              <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                <div style={{ height: Math.max(2, Math.round((hourly[h] || 0) / hourMax * 64)), width: "100%", maxWidth: 20, background: TEAL, borderRadius: 2, opacity: hourly[h] ? 1 : 0.15 }} />
                <span className="text-[8px] text-zinc-600">{h}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">キャスト別（純支給と実績・期間内）</p>
        {castRows.length === 0 ? <p className="text-[11px] text-zinc-600">データなし（退勤確定で記録されます）</p> : (
          <div className="space-y-1.5">
            {castRows.map(r => (
              <div key={r.name}>
                <MiniBar label={r.name} value={r.net} max={castMax} color={GOLD} />
                <div className="text-[9px] text-zinc-600 pl-14">本指{r.main} / 同伴{r.dohan} / 🍾{yen(r.bottle)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">卓稼働ヒートマップ（直近14営業日）</p>
        {heatTables.length === 0 ? <p className="text-[11px] text-zinc-600">データなし（営業リセット時に卓別内訳が記録されます）</p> : (
          <div className="overflow-x-auto">
            <table className="text-[9px]" style={{ borderCollapse: "separate", borderSpacing: 2 }}>
              <thead><tr><th></th>{heatDays.map(h => <th key={h.businessDate} className="text-zinc-600 font-normal">{h.businessDate.slice(8)}</th>)}</tr></thead>
              <tbody>
                {heatTables.map(tl => (
                  <tr key={tl}>
                    <td className="text-zinc-500 pr-1 whitespace-nowrap">{tl}</td>
                    {heatDays.map(h => {
                      const v = (h.byTable || {})[tl] || 0;
                      const alpha = v > 0 ? 0.15 + (v / heatMax) * 0.85 : 0;
                      return <td key={h.businessDate}><div title={yen(v)} style={{ width: 18, height: 18, borderRadius: 3, background: v > 0 ? `rgba(201,166,78,${alpha})` : "#141418", border: "1px solid #1c1c22" }} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">顧客セグメント（累計利用額）</p>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[["A", "10万〜", "#e0a84a"], ["B", "3万〜", TEAL], ["C", "〜3万", "#7aa7ff"], ["休眠", "30日〜", "#888"]].map(([k, sub, color]) => (
            <div key={k} style={{ background: "#141418", border: `1px solid ${color}` }} className="rounded-xl p-2 text-center">
              <div style={{ color }} className="text-lg font-bold">{segs[k].length}</div>
              <div className="text-[9px] text-zinc-500">{k}ランク<br />{sub}</div>
            </div>
          ))}
        </div>
        {segs.A.length > 0 && (
          <p className="text-[10px] text-zinc-500">A: {segs.A.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 5).map(c => `${c.name}(${yen(c.totalSpent || 0)})`).join("・")}</p>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => csvDownload(`売上日別_${businessDateOfNow()}.csv`, "日付,税抜売上,消費税,税込,会計卓数", (history || []).map(h => [h.businessDate, h.subtotal, h.tax, h.grand, h.tableCount].join(",")))} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="flex-1 rounded-lg py-2 text-xs font-bold">📄 日別売上CSV</button>
        <button onClick={() => csvDownload(`顧客_${businessDateOfNow()}.csv`, "名前,来店回数,累計利用額,最終来店", (customerBook || []).map(c => [c.name, c.visits || 0, c.totalSpent || 0, c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString("ja-JP") : ""].join(",")))} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="flex-1 rounded-lg py-2 text-xs font-bold">📄 顧客CSV</button>
      </div>
    </div>
  );
}

function SalesToday({ ts, dispTable, tables, tableTotal, closed, target, taxRate }) {
  const rows = [
    ...Object.entries(ts).filter(([, t]) => t?.active).map(([id, t]) => {
      const ref = tables.find(x => x.id === id);
      return { label: ref ? dispTable(ref).label : id, total: tableTotal(t), n: t.customers.length, live: true };
    }),
    ...closed.map(c => ({ ...c, live: false })),
  ].sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const totalTax = Math.floor(total * (taxRate ?? 10) / 100);
  const grand = total + totalTax;
  const pct = target > 0 ? Math.min(100, Math.round(total / target * 100)) : 0;
  return (
    <>
      <p className="text-xs text-zinc-500 mb-1">本日の売上 ・ {new Date().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}</p>
      <div style={{ background: "linear-gradient(180deg,#f3e2a0,#c9a64e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }} className="text-5xl font-bold">{yen(total)}</div>
      <p className="text-xs text-zinc-500 mb-4">税込 {yen(grand)}（内税 {yen(totalTax)}）</p>
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
    </>
  );
}

function SalesHistory({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="text-center text-zinc-500 text-sm py-16">
        まだ履歴がありません。<br />
        <span className="text-[11px] text-zinc-600">営業リセット時に自動で記録されます。</span>
      </div>
    );
  }
  const monthly = history.reduce((acc, h) => {
    const ym = h.businessDate.slice(0, 7);
    if (!acc[ym]) acc[ym] = { subtotal: 0, grand: 0, days: 0, tableCount: 0 };
    acc[ym].subtotal += h.subtotal || 0;
    acc[ym].grand += h.grand || 0;
    acc[ym].days += 1;
    acc[ym].tableCount += h.tableCount || 0;
    return acc;
  }, {});
  const months = Object.entries(monthly).sort((a, b) => b[0].localeCompare(a[0]));
  return (
    <>
      {months.map(([ym, m]) => (
        <div key={ym} className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: GOLD, fontFamily: "Georgia,serif" }} className="text-lg font-bold">{ym.replace("-", "年") + "月"}</span>
            <div className="text-right">
              <div style={{ color: GOLD }} className="text-sm font-bold">{yen(m.subtotal)}</div>
              <div className="text-[10px] text-zinc-500">税込 {yen(m.grand)} / {m.days}日 / 卓 {m.tableCount}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {history.filter(h => h.businessDate.startsWith(ym)).map((h, i) => {
              const d = new Date(h.businessDate + "T00:00:00");
              const wd = ["日","月","火","水","木","金","土"][d.getDay()];
              return (
                <div key={i} style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-lg px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{h.businessDate.slice(5).replace("-", "/")}</span>
                    <span className="text-[10px] text-zinc-500">({wd})</span>
                    <span className="text-[10px] text-zinc-500">卓 {h.tableCount}</span>
                  </div>
                  <div className="text-right">
                    <div style={{ color: GOLD }} className="text-sm font-bold">{yen(h.subtotal)}</div>
                    <div className="text-[9px] text-zinc-500">税込 {yen(h.grand)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function CustomerBookView({ customerBook, setCustomerBook, casts, bottleKeeps, setBottleKeeps, reservations, setReservations, storeName, logAudit }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // customer object
  const nameRef = useRef(null);
  const sorted = useMemo(() => {
    return [...(customerBook || [])].sort((a, b) => (b.lastVisitAt || 0) - (a.lastVisitAt || 0));
  }, [customerBook]);
  const filtered = sorted.filter(c => !q || c.name.includes(q) || (c.memo || "").includes(q));

  const upcomingBd = sorted
    .map(c => ({ c, days: daysToBirthday(c.birthday) }))
    .filter(x => x.days !== null && x.days <= 30)
    .sort((a, b) => a.days - b.days);

  const activeKeeps = (bottleKeeps || []).filter(k => k.status !== "empty" && k.status !== "disposed");
  const keepCountByCust = activeKeeps.reduce((acc, k) => { acc[k.customerBookId] = (acc[k.customerBookId] || 0) + 1; return acc; }, {});
  const now = Date.now();
  const expiringKeeps = activeKeeps
    .filter(k => k.expiresAt && (k.expiresAt - now) <= 14 * 86400000)
    .sort((a, b) => a.expiresAt - b.expiresAt);

  // ご無沙汰リスト（再来店提案）: 来店実績があり30日以上来ていない客
  const ghosting = sorted
    .filter(c => (c.visits || 0) > 0 && c.lastVisitAt && (now - c.lastVisitAt) >= 30 * 86400000)
    .map(c => ({ c, days: Math.floor((now - c.lastVisitAt) / 86400000) }))
    .sort((a, b) => b.days - a.days);

  // 今後の予約（今日以降）
  const today = businessDateOfNow();
  const upcomingRes = (reservations || [])
    .filter(r => r.date >= today)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  function addNew() {
    const v = (nameRef.current?.value || "").trim();
    if (!v) return;
    const newCust = { id: "cb" + Math.random().toString(36).slice(2, 8), name: v, birthday: "", pref: "綺麗", memo: "", favoriteCastIds: [], visits: 0, lastVisitAt: null };
    setCustomerBook(cb => [...cb, newCust]);
    if (nameRef.current) nameRef.current.value = "";
    setEditing(newCust);
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-1">客名帳</h2>
      <p className="text-xs text-zinc-500 mb-3">お客様の好み・誕生日・注意事項を登録。卓の「名帳」ボタンから呼び出せます。</p>

      {upcomingBd.length > 0 && (
        <div style={{ background: "rgba(224,168,74,.08)", border: "1px solid #e0a84a" }} className="rounded-xl p-3 mb-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold" style={{ color: "#e0a84a" }}>
            <Cake size={14} />誕生日が近い（30日以内）
          </div>
          <div className="space-y-1">
            {upcomingBd.slice(0, 5).map(({ c, days }) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="font-bold">{c.name}</span>
                <span style={{ color: "#e0a84a" }}>{days === 0 ? "本日🎉" : `あと ${days}日`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expiringKeeps.length > 0 && (
        <div style={{ background: "rgba(224,74,74,.08)", border: "1px solid #a15050" }} className="rounded-xl p-3 mb-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold" style={{ color: "#e08484" }}>
            🍾 期限が近いキープ本（14日以内）
          </div>
          <div className="space-y-1">
            {expiringKeeps.slice(0, 5).map(k => {
              const cust = customerBook.find(x => x.id === k.customerBookId);
              const daysLeft = Math.ceil((k.expiresAt - now) / 86400000);
              return (
                <div key={k.id} className="flex items-center justify-between text-xs">
                  <span><span className="font-bold">{cust?.name || "?"}</span> <span className="text-zinc-500">/ {k.label}</span></span>
                  <span style={{ color: daysLeft <= 0 ? "#ff6a6a" : "#e08484" }}>{daysLeft <= 0 ? "期限切れ" : `あと ${daysLeft}日`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upcomingRes.length > 0 && (
        <div style={{ background: "rgba(63,182,176,.06)", border: `1px solid ${TEAL}` }} className="rounded-xl p-3 mb-3">
          <div className="text-xs font-bold mb-2" style={{ color: TEAL }}>📅 来店予約</div>
          <div className="space-y-1">
            {upcomingRes.slice(0, 8).map(r => {
              const cust = customerBook.find(x => x.id === r.customerBookId);
              return (
                <div key={r.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="min-w-0 truncate">
                    <span className="text-zinc-400">{r.date === today ? "今日" : r.date.slice(5).replace("-", "/")} {r.time || ""}</span>{" "}
                    <span className="font-bold">{cust?.name || "?"}</span>
                    {r.memo && <span className="text-zinc-500"> / {r.memo}</span>}
                  </span>
                  <button onClick={() => setReservations(rs => rs.filter(x => x.id !== r.id))} className="shrink-0"><Trash2 size={12} color="#555" /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ghosting.length > 0 && (
        <div style={{ background: "#141418", border: "1px solid #2a2a32" }} className="rounded-xl p-3 mb-4">
          <div className="text-xs font-bold mb-2 text-zinc-400">💤 ご無沙汰リスト（30日以上・再来店の声かけ推奨）</div>
          <div className="space-y-1">
            {ghosting.slice(0, 5).map(({ c, days }) => (
              <button key={c.id} onClick={() => setEditing(c)} className="w-full flex items-center justify-between text-xs">
                <span className="font-bold">{c.name}</span>
                <span className="text-zinc-500">{days}日ぶり ・ 累計{yen(c.totalSpent || 0)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <input ref={nameRef} placeholder="新規お客様名" onKeyDown={e => { if (e.key === "Enter") addNew(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
        <button onClick={addNew} style={{ background: GOLD, color: "#000" }} className="px-3 rounded-lg text-sm font-bold">追加</button>
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="検索（名前・メモ）" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-full rounded-lg px-3 py-2 outline-none mb-3" />

      <p className="text-xs text-zinc-500 mb-2">{filtered.length}名</p>
      <div className="space-y-2">
        {filtered.map(c => {
          const days = daysToBirthday(c.birthday);
          const nearBd = days !== null && days <= 30;
          const last = c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "未来店";
          return (
            <button key={c.id} onClick={() => setEditing(c)} style={{ background: "#141418", border: `1px solid ${nearBd ? "#e0a84a" : "#22222a"}` }} className="w-full rounded-xl p-3 text-left">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.photo && <img src={c.photo} alt="" className="w-7 h-7 rounded-full object-cover" />}
                  <span className="font-bold text-sm">{c.name}</span>
                  {c.pref && <span style={{ background: GENRE_COLOR[c.pref] || "#22222a", color: "#000" }} className="text-[10px] rounded-full px-1.5 py-0.5 font-bold">{c.pref}</span>}
                  {nearBd && <span style={{ color: "#e0a84a" }} className="text-[10px] flex items-center gap-0.5"><Cake size={10} />{days === 0 ? "本日🎉" : `+${days}d`}</span>}
                  {keepCountByCust[c.id] > 0 && <span style={{ color: "#e8d29a", background: "rgba(201,166,78,.15)" }} className="text-[10px] rounded-full px-1.5 py-0.5 font-bold">🍾 {keepCountByCust[c.id]}本</span>}
                </div>
                <span className="text-[10px] text-zinc-500 text-right">{c.visits || 0}回 / {last}<br />累計 {yen(c.totalSpent || 0)}</span>
              </div>
              {c.memo && <p className="text-[11px] text-zinc-500 truncate">📝 {c.memo}</p>}
              {c.favoriteCastIds?.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[10px] text-zinc-600">好き:</span>
                  {c.favoriteCastIds.map(id => {
                    const cast = casts.find(x => x.id === id);
                    return cast && <span key={id} style={{ background: "rgba(63,182,176,.15)", color: TEAL }} className="text-[10px] rounded-full px-1.5 py-0.5">{cast.name}</span>;
                  })}
                </div>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-zinc-500 text-sm py-8">客名帳が空です</p>}
      </div>

      {editing && (
        <CustomerBookEditor
          customer={editing}
          casts={casts}
          bottleKeeps={bottleKeeps}
          setBottleKeeps={setBottleKeeps}
          reservations={reservations}
          setReservations={setReservations}
          storeName={storeName}
          onSave={(next) => {
            setCustomerBook(cb => cb.map(c => c.id === next.id ? next : c));
            setEditing(null);
          }}
          onDelete={() => {
            if (confirm(`${editing.name} を客名帳から削除しますか？（キープ本も一緒に削除されます）`)) {
              setCustomerBook(cb => cb.filter(c => c.id !== editing.id));
              setBottleKeeps(bk => bk.filter(k => k.customerBookId !== editing.id));
              setEditing(null);
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CustomerBookEditor({ customer, casts, bottleKeeps, setBottleKeeps, reservations, setReservations, storeName, onSave, onDelete, onClose }) {
  const [c, setC] = useState(customer);
  const [newBottle, setNewBottle] = useState({ label: "", days: 90 });
  const [newRes, setNewRes] = useState({ date: "", time: "", memo: "" });
  const [dmText, setDmText] = useState(null);
  const [dmCopied, setDmCopied] = useState(false);
  const photoRef = useRef(null);
  const toggleFav = (id) => setC(x => ({ ...x, favoriteCastIds: (x.favoriteCastIds || []).includes(id) ? x.favoriteCastIds.filter(y => y !== id) : [...(x.favoriteCastIds || []), id] }));

  const myKeeps = (bottleKeeps || []).filter(k => k.customerBookId === customer.id).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
  const now = Date.now();

  // 自動お気に入り（付け回し回数の多い順 TOP3）
  const autoFavs = Object.entries(c.castAffinity || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, n]) => ({ cast: casts.find(x => x.id === id), n }))
    .filter(x => x.cast);

  const myRes = (reservations || []).filter(r => r.customerBookId === customer.id && r.date >= businessDateOfNow())
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  function addReservation() {
    if (!newRes.date) return;
    setReservations(rs => [...rs, { id: "rv" + Math.random().toString(36).slice(2, 8), customerBookId: customer.id, date: newRes.date, time: newRes.time, memo: newRes.memo }]);
    setNewRes({ date: "", time: "", memo: "" });
  }

  function onPhoto(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 128;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      setC(x => ({ ...x, photo: cv.toDataURL("image/jpeg", 0.7) }));
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = "";
  }

  function buildDm(kind) {
    const favName = autoFavs[0]?.cast?.name || casts.find(x => (c.favoriteCastIds || []).includes(x.id))?.name || null;
    const activeKeep = myKeeps.find(k => k.status !== "empty" && k.status !== "disposed");
    const keepSoon = activeKeep?.expiresAt && (activeKeep.expiresAt - now) <= 14 * 86400000;
    let text;
    if (kind === "birthday") {
      text = [
        `${c.name}さん🎂`,
        `お誕生日おめでとうございます！`,
        `${storeName || "当店"}一同、${c.name}さんの一年が最高になるようにお祝いの準備をしてお待ちしてます🍾`,
        favName ? `${favName}も会いたがってます！` : null,
        activeKeep ? `キープ中の「${activeKeep.label}」も冷やしてあります✨` : null,
        `ぜひ近いうちに顔出してください！`,
      ].filter(Boolean).join("\n");
    } else {
      const days = c.lastVisitAt ? Math.floor((now - c.lastVisitAt) / 86400000) : null;
      text = [
        `${c.name}さん、お久しぶりです！`,
        days ? `最後に来ていただいてから${days}日…寂しいです😢` : `最近お顔を見れてなくて寂しいです😢`,
        activeKeep ? `キープボトル「${activeKeep.label}」がまだ残ってますよ🍾${keepSoon ? "（期限が近いのでお早めに！）" : ""}` : null,
        favName ? `${favName}も「最近${c.name}さん来ないね」って言ってます。` : null,
        `また顔見せてください！お待ちしてます✨`,
      ].filter(Boolean).join("\n");
    }
    setDmText(text);
    setDmCopied(false);
    navigator.clipboard?.writeText(text).then(() => setDmCopied(true)).catch(() => {});
  }

  function addBottle() {
    const label = newBottle.label.trim();
    if (!label) return;
    const days = Math.max(1, +newBottle.days || 90);
    const openedAt = Date.now();
    const expiresAt = openedAt + days * 86400000;
    const k = { id: "bk" + Math.random().toString(36).slice(2, 8), customerBookId: customer.id, label, openedAt, expiresAt, memo: "", status: "active" };
    setBottleKeeps(bks => [k, ...bks]);
    setNewBottle({ label: "", days: 90 });
  }
  function markEmpty(id) {
    setBottleKeeps(bks => bks.map(k => k.id === id ? { ...k, status: "empty" } : k));
  }
  function removeBottle(id) {
    if (!confirm("このキープ本を削除しますか？")) return;
    setBottleKeeps(bks => bks.filter(k => k.id !== id));
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.75)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#141418", border: `1px solid ${GOLD}` }} className="rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => photoRef.current?.click()} className="relative">
              {c.photo ? (
                <img src={c.photo} alt="" className="w-12 h-12 rounded-full object-cover" style={{ border: `2px solid ${GOLD}` }} />
              ) : (
                <div style={{ background: "#1c1c22", border: "2px dashed #3a3a42" }} className="w-12 h-12 rounded-full flex items-center justify-center text-[9px] text-zinc-500">写真<br />＋</div>
              )}
            </button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            <h3 style={{ color: GOLD, fontFamily: "Georgia,serif" }} className="text-xl font-bold">お客様情報</h3>
          </div>
          <button onClick={onClose}><X size={20} color="#888" /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <div className="text-[10px] text-zinc-500 mb-1">名前</div>
            <input value={c.name} onChange={e => setC(x => ({ ...x, name: e.target.value }))} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "16px" }} className="w-full rounded px-3 py-2 outline-none" />
          </label>
          <label className="block">
            <div className="text-[10px] text-zinc-500 mb-1">誕生日 (YYYY-MM-DD or MM-DD)</div>
            <input value={c.birthday || ""} onChange={e => setC(x => ({ ...x, birthday: e.target.value }))} placeholder="例: 1990-05-14 or --05-14" style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "16px" }} className="w-full rounded px-3 py-2 outline-none" />
          </label>
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">好み</div>
            <div className="flex gap-1.5 flex-wrap">
              {GENRES.map(g => (
                <button key={g} onClick={() => setC(x => ({ ...x, pref: g }))} style={{ background: c.pref === g ? GENRE_COLOR[g] : "#1c1c22", color: c.pref === g ? "#000" : "#888" }} className="text-[11px] rounded-full px-2.5 py-0.5 font-bold">{g}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <div className="text-[10px] text-zinc-500 mb-1">注意事項・メモ</div>
            <textarea value={c.memo || ""} onChange={e => setC(x => ({ ...x, memo: e.target.value }))} rows={3} placeholder="例: シャンパン強め、○○さんNG、深酒注意" style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "15px" }} className="w-full rounded px-3 py-2 outline-none" />
          </label>
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">お気に入りキャスト（複数可）</div>
            <div className="flex flex-wrap gap-1.5">
              {casts.map(cast => {
                const on = (c.favoriteCastIds || []).includes(cast.id);
                return (
                  <button key={cast.id} onClick={() => toggleFav(cast.id)} style={{ background: on ? "rgba(63,182,176,.2)" : "#1c1c22", border: `1px solid ${on ? TEAL : "#2a2a32"}`, color: on ? TEAL : "#888" }} className="text-[11px] rounded-full px-2.5 py-0.5 font-bold">{cast.name}</button>
                );
              })}
            </div>
          </div>
          <div style={{ background: "rgba(201,166,78,.06)", border: "1px solid #3a3421" }} className="rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500">累計利用額（LTV）</span>
              <span style={{ color: GOLD }} className="text-lg font-bold">{yen(c.totalSpent || 0)}</span>
            </div>
            <div className="text-[10px] text-zinc-500 mb-1">
              来店 {c.visits || 0}回 / 最終 {c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString("ja-JP") : "未来店"}
            </div>
            {(c.visitLog || []).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {(c.visitLog || []).slice(0, 5).map((v, i) => (
                  <span key={i} className="text-[10px] text-zinc-500">{v.date.slice(5).replace("-", "/")} {yen(v.amount)}</span>
                ))}
              </div>
            )}
          </div>

          {autoFavs.length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 mb-1">よく付く子（自動検出・付け回し回数順）</div>
              <div className="flex gap-1.5 flex-wrap">
                {autoFavs.map(({ cast, n }) => (
                  <span key={cast.id} style={{ background: "rgba(63,182,176,.12)", border: `1px solid ${TEAL}`, color: "#a8e6e2" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{cast.name} ×{n}</span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-[#22222a]">
            <div className="text-[10px] text-zinc-500 mb-1.5">📅 来店予約</div>
            {myRes.length > 0 && (
              <div className="space-y-1 mb-2">
                {myRes.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span>{r.date.slice(5).replace("-", "/")} {r.time || ""} {r.memo && <span className="text-zinc-500">/ {r.memo}</span>}</span>
                    <button onClick={() => setReservations(rs => rs.filter(x => x.id !== r.id))}><Trash2 size={12} color="#555" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 items-center">
              <input type="date" value={newRes.date} onChange={e => setNewRes(x => ({ ...x, date: e.target.value }))} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "13px", colorScheme: "dark" }} className="rounded px-1.5 py-1.5 outline-none w-32" />
              <input type="time" value={newRes.time} onChange={e => setNewRes(x => ({ ...x, time: e.target.value }))} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "13px", colorScheme: "dark" }} className="rounded px-1.5 py-1.5 outline-none w-24" />
              <input value={newRes.memo} onChange={e => setNewRes(x => ({ ...x, memo: e.target.value }))} placeholder="メモ" style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "13px" }} className="rounded px-1.5 py-1.5 outline-none flex-1 min-w-0" />
              <button onClick={addReservation} style={{ background: TEAL, color: "#000" }} className="px-2.5 py-1.5 rounded text-xs font-bold shrink-0">＋</button>
            </div>
          </div>

          <div className="pt-2 border-t border-[#22222a]">
            <div className="text-[10px] text-zinc-500 mb-1.5">✉️ DM文生成（コピーして送るだけ）</div>
            <div className="flex gap-2">
              <button onClick={() => buildDm("birthday")} style={{ background: "rgba(224,168,74,.15)", border: "1px solid #e0a84a", color: "#e0a84a" }} className="flex-1 rounded-lg py-2 text-xs font-bold">🎂 誕生日DM</button>
              <button onClick={() => buildDm("comeback")} style={{ background: "rgba(63,182,176,.12)", border: `1px solid ${TEAL}`, color: TEAL }} className="flex-1 rounded-lg py-2 text-xs font-bold">💤 ご無沙汰DM</button>
            </div>
            {dmText && (
              <div className="mt-2">
                {dmCopied && <p className="text-[10px] mb-1" style={{ color: "#7ae0a0" }}>✅ コピーしました — LINEに貼り付けて送信</p>}
                <textarea readOnly value={dmText} rows={5} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "13px" }} className="w-full rounded-lg p-2 outline-none" onFocus={e => e.target.select()} />
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#22222a]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold" style={{ color: "#e8d29a" }}>🍾 ボトルキープ ({myKeeps.filter(k => k.status !== "empty" && k.status !== "disposed").length}本 有効)</div>
            </div>
            <div className="space-y-1.5 mb-2">
              {myKeeps.map(k => {
                const daysLeft = k.expiresAt ? Math.ceil((k.expiresAt - now) / 86400000) : null;
                const expired = daysLeft !== null && daysLeft <= 0;
                const soon = daysLeft !== null && daysLeft > 0 && daysLeft <= 14;
                const inactive = k.status === "empty" || k.status === "disposed";
                const pct = k.remainingPct ?? 100;
                return (
                  <div key={k.id} style={{ background: "#0d0d10", border: `1px solid ${inactive ? "#2a2a32" : expired ? "#a15050" : soon ? "#e0a84a" : "#22222a"}`, opacity: inactive ? 0.5 : 1 }} className="rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate">{k.label} {inactive && <span className="text-[10px] text-zinc-500">({k.status === "empty" ? "空" : "廃棄"})</span>}</div>
                        <div className="text-[10px] text-zinc-500">
                          入 {new Date(k.openedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                          {daysLeft !== null && !inactive && (
                            <> ・ 期限 {new Date(k.expiresAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                              <span style={{ color: expired ? "#ff6a6a" : soon ? "#e0a84a" : "#666" }}> ({expired ? "切れ" : `+${daysLeft}d`})</span>
                            </>
                          )}
                        </div>
                      </div>
                      {!inactive && <button onClick={() => markEmpty(k.id)} style={{ background: "#22222a", color: "#aaa" }} className="text-[10px] rounded px-2 py-1 font-bold">空</button>}
                      {!inactive && <button onClick={() => setBottleKeeps(bks => bks.map(x => x.id === k.id ? { ...x, status: "disposed" } : x))} style={{ background: "#3a1010", color: "#ff8888" }} className="text-[10px] rounded px-2 py-1 font-bold">廃棄</button>}
                      <button onClick={() => removeBottle(k.id)}><Trash2 size={12} color="#555" /></button>
                    </div>
                    {!inactive && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#1c1c22" }}>
                          <div style={{ width: pct + "%", background: pct <= 20 ? "#e08484" : pct <= 50 ? "#e0a84a" : TEAL }} className="h-full" />
                        </div>
                        <input type="range" min="0" max="100" step="10" value={pct}
                          onChange={e => setBottleKeeps(bks => bks.map(x => x.id === k.id ? { ...x, remainingPct: +e.target.value } : x))}
                          className="w-20" style={{ accentColor: GOLD }} />
                        <span className="text-[10px] w-9 text-right font-bold" style={{ color: pct <= 20 ? "#e08484" : "#aaa" }}>{pct}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {myKeeps.length === 0 && <p className="text-[11px] text-zinc-500 py-1">キープ本はありません</p>}
            </div>
            <div className="flex gap-2 items-center">
              <input value={newBottle.label} onChange={e => setNewBottle(x => ({ ...x, label: e.target.value }))} placeholder="ボトル名（例: ドンペリ白）" style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "15px" }} className="flex-1 rounded px-2 py-1.5 outline-none min-w-0" />
              <input type="number" value={newBottle.days} onChange={e => setNewBottle(x => ({ ...x, days: e.target.value }))} min="1" style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "15px" }} className="w-14 rounded px-2 py-1.5 outline-none" />
              <span className="text-[10px] text-zinc-500">日</span>
              <button onClick={addBottle} style={{ background: GOLD, color: "#000" }} className="px-2.5 rounded text-xs font-bold py-1.5">＋</button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onDelete} style={{ background: "#3a1010", border: "1px solid #7a2222", color: "#ff8888" }} className="px-3 py-2 rounded-lg text-xs font-bold">削除</button>
          <button onClick={onClose} style={{ background: "#22222a", color: "#aaa" }} className="flex-1 py-2 rounded-lg text-sm">キャンセル</button>
          <button onClick={() => onSave(c)} style={{ background: GOLD, color: "#000" }} className="flex-1 py-2 rounded-lg text-sm font-bold">保存</button>
        </div>
      </div>
    </div>
  );
}

function Admin({ casts, setCasts, resetNight, settings, setSettings, tables, setTables, mergeGroups, setMergeGroups, ts, exportData, importData, listAutoBackups, restoreAutoBackup, auditLog, enterWatch }) {
  const nameRef = useRef(null);
  const tblLabelRef = useRef(null);
  const tblCapRef = useRef(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tblEdit, setTblEdit] = useState(null); // {id, label, cap}
  const [mergeEdit, setMergeEdit] = useState(null); // {key, tableIds:[]}
  const [confirmDelTbl, setConfirmDelTbl] = useState(null); // 2度押し削除用: 卓id
  const [confirmDelGrp, setConfirmDelGrp] = useState(null); // 2度押し削除用: グループkey
  const [tblMsg, setTblMsg] = useState(null);
  const [mergeErr, setMergeErr] = useState(null);

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
    if (ts?.[id]?.active) { setTblMsg("この卓は接客中です。会計してから削除してください。"); setConfirmDelTbl(null); return; }
    if (confirmDelTbl !== id) { setConfirmDelTbl(id); return; } // 1回目は確認待ち
    setTables(list => list.filter(t => t.id !== id));
    setMergeGroups(mg => {
      const next = {};
      Object.entries(mg).forEach(([k, arr]) => {
        const filtered = arr.filter(x => x !== id);
        if (filtered.length >= 2) next[k] = filtered;
      });
      return next;
    });
    setConfirmDelTbl(null);
  };
  const moveTable = (id, dir) => setTables(list => {
    const i = list.findIndex(t => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const a = [...list]; [a[i], a[j]] = [a[j], a[i]]; return a;
  });

  const addMergeGroup = () => {
    const keys = Object.keys(mergeGroups);
    const nextKey = String.fromCharCode(65 + keys.length); // A, B, C, ...
    setMergeEdit({ key: nextKey, tableIds: [], isNew: true });
  };
  const saveMergeEdit = () => {
    if (!mergeEdit) return;
    if (mergeEdit.tableIds.length < 2) { setMergeErr("2つ以上の卓を選択してください"); return; }
    setMergeGroups(mg => ({ ...mg, [mergeEdit.key]: mergeEdit.tableIds }));
    setMergeEdit(null);
    setMergeErr(null);
  };
  const delMergeGroup = (k) => {
    if (confirmDelGrp !== k) { setConfirmDelGrp(k); return; } // 1回目は確認待ち
    setMergeGroups(mg => { const n = { ...mg }; delete n[k]; return n; });
    setConfirmDelGrp(null);
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
        <h2 className="text-lg font-bold mb-1">卓の編集</h2>
        <p className="text-xs text-zinc-500 mb-3">卓の名前・定員（何人入るか）・並び順・追加・削除。すべて自動保存。接客中の卓は削除できません。</p>
        {tblMsg && (
          <button onClick={() => setTblMsg(null)} className="w-full text-left mb-2 text-xs rounded-lg p-2" style={{ color: "#e0a84a", background: "rgba(224,168,74,.08)", border: "1px solid #7a5a1a" }}>{tblMsg}（タップで閉じる）</button>
        )}
        <div className="flex gap-2 mb-3">
          <input ref={tblLabelRef} placeholder="卓名（例: 卓13, VIP2）" onKeyDown={e => { if (e.key === "Enter") addTable(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none min-w-0" />
          <input ref={tblCapRef} type="number" defaultValue="2" min="1" placeholder="定員" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-16 rounded-lg px-2 py-2 outline-none" />
          <button onClick={addTable} style={{ background: GOLD, color: "#000" }} className="px-3 rounded-lg text-sm font-bold">追加</button>
        </div>
        <div className="space-y-2">
          {tables.map((t, idx) => (
            <div key={t.id} style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-xl p-3">
              {tblEdit?.id === t.id ? (
                <div className="flex items-center gap-2">
                  <input value={tblEdit.label} onChange={e => setTblEdit(x => ({ ...x, label: e.target.value }))} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded px-2 py-1.5 outline-none min-w-0" />
                  <input type="number" value={tblEdit.cap} onChange={e => setTblEdit(x => ({ ...x, cap: e.target.value }))} min="1" style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "16px" }} className="w-16 rounded px-2 py-1.5 outline-none" />
                  <button onClick={saveTblEdit} style={{ background: GOLD, color: "#000" }} className="px-3 py-1.5 rounded text-xs font-bold">保存</button>
                  <button onClick={() => setTblEdit(null)} className="text-xs text-zinc-500 px-1">×</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span style={{ fontFamily: "Georgia,serif", color: GOLD }} className="text-lg font-bold whitespace-nowrap">{t.label}</span>
                    <span className="text-xs text-zinc-500 whitespace-nowrap">定員 {t.cap}名</span>
                    {ts?.[t.id]?.active && <span style={{ color: GOLD }} className="text-[10px] font-bold whitespace-nowrap">接客中</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => moveTable(t.id, -1)} disabled={idx === 0} style={{ background: "#1c1c22", color: idx === 0 ? "#333" : "#999" }} className="w-8 h-8 rounded text-sm">↑</button>
                    <button onClick={() => moveTable(t.id, 1)} disabled={idx === tables.length - 1} style={{ background: "#1c1c22", color: idx === tables.length - 1 ? "#333" : "#999" }} className="w-8 h-8 rounded text-sm">↓</button>
                    <button onClick={() => { setConfirmDelTbl(null); setTblEdit({ id: t.id, label: t.label, cap: t.cap }); }} style={{ background: "#22222a", color: GOLD }} className="text-[11px] rounded-full px-2.5 py-1.5 font-bold">編集</button>
                    {confirmDelTbl === t.id ? (
                      <button onClick={() => delTable(t.id)} style={{ background: "#7a2222", color: "#fff" }} className="text-[11px] rounded-full px-2.5 py-1.5 font-bold whitespace-nowrap">削除確定</button>
                    ) : (
                      <button onClick={() => delTable(t.id)} className="p-1.5"><Trash2 size={14} color="#555" /></button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-1">卓結合グループ</h2>
        <p className="text-xs text-zinc-500 mb-3">2卓以上をまとめて1つの卓として扱えるようにする設定。</p>
        <div className="space-y-2 mb-3">
          {Object.entries(mergeGroups).map(([k, arr]) => {
            const labels = arr.map(id => tables.find(t => t.id === id)?.label || "?").join(" + ");
            return (
              <div key={k} style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span style={{ color: GOLD }} className="text-sm font-bold mr-2">グループ {k}</span>
                  <span className="text-xs text-zinc-400">{labels}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => { setConfirmDelGrp(null); setMergeEdit({ key: k, tableIds: [...arr], isNew: false }); }} style={{ background: "#22222a", color: GOLD }} className="text-[11px] rounded-full px-2.5 py-1 font-bold">編集</button>
                  {confirmDelGrp === k ? (
                    <button onClick={() => delMergeGroup(k)} style={{ background: "#7a2222", color: "#fff" }} className="text-[11px] rounded-full px-2.5 py-1 font-bold whitespace-nowrap">削除確定</button>
                  ) : (
                    <button onClick={() => delMergeGroup(k)} className="p-1"><Trash2 size={14} color="#555" /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={addMergeGroup} style={{ background: "#22222a", color: GOLD }} className="w-full rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1"><Plus size={12} />結合グループを追加</button>
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
            {mergeErr && <p className="text-xs mb-2" style={{ color: "#e08484" }}>{mergeErr}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setMergeEdit(null); setMergeErr(null); }} className="px-4 py-2 rounded-lg text-sm text-zinc-400">キャンセル</button>
              <button onClick={saveMergeEdit} style={{ background: GOLD, color: "#000" }} className="px-4 py-2 rounded-lg text-sm font-bold">保存</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold mb-1">給料設定</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-20">構成費</span>
            <input type="number" value={settings.overheadPct} onChange={e => setSettings(s => ({ ...s, overheadPct: +e.target.value || 0 }))} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-20 rounded-lg px-3 py-2 outline-none" />
            <span className="text-xs text-zinc-500">%（全キャスト共通の控除率）</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-20">遅刻ペナルティ</span>
            <input type="number" value={settings.latePenaltyPerMin ?? 0} onChange={e => setSettings(s => ({ ...s, latePenaltyPerMin: +e.target.value || 0 }))} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-20 rounded-lg px-3 py-2 outline-none" />
            <span className="text-xs text-zinc-500">円/分（キャストの出勤予定時刻を設定した場合のみ）</span>
          </div>
          <label className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={!!settings.withholdTax} onChange={e => setSettings(s => ({ ...s, withholdTax: e.target.checked }))} style={{ accentColor: GOLD }} />
            <span className="text-xs">源泉徴収 10.21% を月次給料から差し引く</span>
          </label>
          <label className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={!!settings.gpsClockIn} onChange={e => setSettings(s => ({ ...s, gpsClockIn: e.target.checked }))} style={{ accentColor: GOLD }} />
            <span className="text-xs">出勤打刻時に GPS 位置を記録する（変更履歴に残る・位置情報の許可が必要）</span>
          </label>
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

      <div>
        <h2 className="text-lg font-bold mb-1">リアルタイム共有（外のキャッチ用）</h2>
        <p className="text-xs text-zinc-500 mb-3">
          ONにすると<b>卓の空き状況だけ</b>がクラウドに送られ、外のスタッフが携帯から見られます。
          お客様の名前・客名帳・売上・給料は<b>一切送信されません</b>（この端末の中だけ）。
        </p>
        <label className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={!!settings.shareEnabled} onChange={e => setSettings(s => ({ ...s, shareEnabled: e.target.checked }))} style={{ accentColor: GOLD }} />
          <span className="text-sm font-bold">{settings.shareEnabled ? "🟢 共有中（卓状況のみ）" : "⚫ 共有OFF"}</span>
        </label>
        <div style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-xl p-3 text-[11px] text-zinc-400 mb-2">
          <b className="text-zinc-300">外のスタッフの設定手順:</b><br />
          ① 同じアプリのURLを開く → ② 設定タブ → ③ 下の「外用ビューを開く」<br />
          （店コード: <b style={{ color: GOLD }}>{URL_STORE}</b>）
        </div>
        <button onClick={() => enterWatch(URL_STORE)} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="w-full rounded-lg py-2.5 text-sm font-bold">👀 外用ビューを開く（この端末で確認）</button>
      </div>

      <DataManagement {...{ exportData, importData, listAutoBackups, restoreAutoBackup }} />

      <AuditLogView auditLog={auditLog} />

      <button onClick={() => { if (confirmReset) { resetNight(); setConfirmReset(false); } else setConfirmReset(true); }} style={{ background: confirmReset ? "#7a2222" : "#15151a", border: `1px solid ${confirmReset ? "#a13b3b" : "#2a2a32"}`, color: confirmReset ? "#fff" : "#999" }} className="w-full rounded-lg py-2.5 text-sm font-bold">{confirmReset ? "⚠ もう一度タップで全卓クリア確定" : "営業リセット（全卓クリア・名簿は保持・自動バックアップされます）"}</button>

      <button onClick={() => {
        if (confirm("この店舗のすべてのデータ（キャスト・卓・設定）を完全削除して初期状態に戻します。よろしいですか？")) {
          try { localStorage.removeItem(STORE_KEY); } catch (e) {}
          location.reload();
        }
      }} style={{ background: "#3a1010", border: "1px solid #7a2222", color: "#ff8888" }} className="w-full rounded-lg py-2.5 text-sm font-bold mt-2">🗑 完全リセット（この店舗の全データ削除）</button>
    </div>
  );
}

const PRODUCT_CATEGORIES = [["drink", "ドリンク"], ["shot", "ショット"], ["bottle", "ボトル"], ["other", "その他"]];

function InventoryView({ products, setProducts, salesLog, logAudit }) {
  const [newP, setNewP] = useState({ name: "", category: "drink", price: "", cost: "", stock: "", lowStockAt: "" });
  const [stocktake, setStocktake] = useState(false);
  const [orderSheet, setOrderSheet] = useState(null);
  const [month] = useState(businessDateOfNow().slice(0, 7));

  const lowStock = (products || []).filter(p => p.lowStockAt != null && (p.stock || 0) <= p.lowStockAt);

  // 今月の原価・粗利（会計確定した売上明細ログから）
  const monthLog = (salesLog || []).filter(r => r.businessDate.startsWith(month));
  const revenue = monthLog.reduce((s, r) => s + r.price * r.qty, 0);
  const cost = monthLog.reduce((s, r) => s + (r.cost || 0), 0);
  const gp = revenue - cost;
  const costRate = revenue > 0 ? (cost / revenue * 100) : 0;

  function addProduct() {
    if (!newP.name.trim()) return;
    setProducts(ps => [...ps, {
      id: "p" + Math.random().toString(36).slice(2, 8),
      name: newP.name.trim(), category: newP.category,
      price: +newP.price || 0, cost: +newP.cost || 0,
      stock: +newP.stock || 0, lowStockAt: newP.lowStockAt === "" ? null : +newP.lowStockAt,
    }]);
    logAudit("商品追加", newP.name.trim());
    setNewP({ name: "", category: "drink", price: "", cost: "", stock: "", lowStockAt: "" });
  }
  const updP = (id, patch) => setProducts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  const delP = (id) => { const p = products.find(x => x.id === id); setProducts(ps => ps.filter(x => x.id !== id)); if (p) logAudit("商品削除", p.name); };

  function makeOrderSheet() {
    const items = lowStock.map(p => {
      const suggest = Math.max((p.lowStockAt || 0) * 2 - (p.stock || 0), 1);
      return `・${p.name}（現在 ${p.stock || 0}） → ${suggest}本`;
    });
    const text = [`【発注書】${businessDateOfNow()}`, ...(items.length ? items : ["発注が必要な商品はありません"]), "", "よろしくお願いします。"].join("\n");
    setOrderSheet(text);
    navigator.clipboard?.writeText(text).catch(() => {});
    logAudit("発注書生成", `${items.length}品目`);
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h2 className="text-lg font-bold mb-1">在庫・原価管理</h2>
        <p className="text-xs text-zinc-500">商品を登録すると卓のドリンク画面にボタンが出て、注文のたびに在庫が自動で減ります。</p>
      </div>

      {lowStock.length > 0 && (
        <div style={{ background: "rgba(224,74,74,.08)", border: "1px solid #a15050" }} className="rounded-xl p-3">
          <div className="text-xs font-bold mb-1" style={{ color: "#e08484" }}>📦 低在庫アラート</div>
          <div className="text-[11px] text-zinc-300">{lowStock.map(p => `${p.name}(残${p.stock || 0}/基準${p.lowStockAt})`).join("・")}</div>
        </div>
      )}

      <div style={{ background: "rgba(201,166,78,.06)", border: "1px solid #3a3421" }} className="rounded-xl p-3">
        <div className="text-xs text-zinc-500 mb-2">{month} 原価・粗利（会計確定分）</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-[10px] text-zinc-500">売上</div><div style={{ color: GOLD }} className="text-sm font-bold">{yen(revenue)}</div></div>
          <div><div className="text-[10px] text-zinc-500">原価</div><div className="text-sm font-bold text-zinc-300">{yen(cost)}</div></div>
          <div><div className="text-[10px] text-zinc-500">粗利</div><div style={{ color: "#7ae0a0" }} className="text-sm font-bold">{yen(gp)}</div></div>
        </div>
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5"><span>原価率</span><span>{costRate.toFixed(1)}%</span></div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#1c1c22" }}>
            <div style={{ width: Math.min(100, costRate) + "%", background: costRate > 30 ? "#e08484" : "#7ae0a0" }} className="h-full" />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold">商品マスタ（{(products || []).length}品目）</h3>
          <button onClick={() => setStocktake(s => !s)} style={{ background: stocktake ? GOLD : "#22222a", color: stocktake ? "#000" : GOLD }} className="text-[11px] rounded-full px-3 py-1 font-bold">{stocktake ? "棚卸し終了" : "📋 棚卸しモード"}</button>
        </div>
        <div className="space-y-2 mb-3">
          {(products || []).map(p => (
            <div key={p.id} style={{ background: "#141418", border: `1px solid ${p.lowStockAt != null && (p.stock || 0) <= p.lowStockAt ? "#a15050" : "#22222a"}` }} className="rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <span className="font-bold text-sm">{p.name}</span>
                  <span className="text-[10px] text-zinc-500 ml-2">{(PRODUCT_CATEGORIES.find(([k]) => k === p.category) || [])[1] || p.category}</span>
                </div>
                <button onClick={() => delP(p.id)}><Trash2 size={13} color="#555" /></button>
              </div>
              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="text-zinc-500">売価</span>
                <input type="number" value={p.price} onChange={e => updP(p.id, { price: +e.target.value || 0 })} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "14px" }} className="w-20 rounded px-1.5 py-1 outline-none" />
                <span className="text-zinc-500">原価</span>
                <input type="number" value={p.cost} onChange={e => updP(p.id, { cost: +e.target.value || 0 })} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "14px" }} className="w-20 rounded px-1.5 py-1 outline-none" />
                {stocktake ? (
                  <>
                    <span style={{ color: GOLD }} className="font-bold">実在庫</span>
                    <input type="number" value={p.stock || 0} onChange={e => { updP(p.id, { stock: Math.max(0, +e.target.value || 0) }); }} onBlur={() => logAudit("棚卸し補正", `${p.name} → ${p.stock || 0}`)} style={{ background: "#0d0d10", border: `1px solid ${GOLD}`, fontSize: "14px" }} className="w-16 rounded px-1.5 py-1 outline-none" />
                  </>
                ) : (
                  <span className="text-zinc-400">在庫 <b style={{ color: p.lowStockAt != null && (p.stock || 0) <= p.lowStockAt ? "#e08484" : "#fff" }}>{p.stock || 0}</b></span>
                )}
                <span className="text-zinc-500">基準</span>
                <input type="number" value={p.lowStockAt ?? ""} placeholder="-" onChange={e => updP(p.id, { lowStockAt: e.target.value === "" ? null : +e.target.value })} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "14px" }} className="w-14 rounded px-1.5 py-1 outline-none" />
              </div>
            </div>
          ))}
          {(products || []).length === 0 && <p className="text-[11px] text-zinc-500 py-2">まだ商品がありません。下から追加してください。</p>}
        </div>

        <div style={{ background: "#0d0d10", border: "1px dashed #2a2a32" }} className="rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <input value={newP.name} onChange={e => setNewP(x => ({ ...x, name: e.target.value }))} placeholder="商品名（例: シャンパンA）" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none min-w-0" />
            <select value={newP.category} onChange={e => setNewP(x => ({ ...x, category: e.target.value }))} style={{ background: "#141418", border: "1px solid #22222a", color: "#fff", fontSize: "14px" }} className="rounded-lg px-2 py-2 outline-none">
              {PRODUCT_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-center text-[11px]">
            <input type="number" value={newP.price} onChange={e => setNewP(x => ({ ...x, price: e.target.value }))} placeholder="売価" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "15px" }} className="w-20 rounded-lg px-2 py-2 outline-none" />
            <input type="number" value={newP.cost} onChange={e => setNewP(x => ({ ...x, cost: e.target.value }))} placeholder="原価" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "15px" }} className="w-20 rounded-lg px-2 py-2 outline-none" />
            <input type="number" value={newP.stock} onChange={e => setNewP(x => ({ ...x, stock: e.target.value }))} placeholder="在庫" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "15px" }} className="w-16 rounded-lg px-2 py-2 outline-none" />
            <input type="number" value={newP.lowStockAt} onChange={e => setNewP(x => ({ ...x, lowStockAt: e.target.value }))} placeholder="基準" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "15px" }} className="w-16 rounded-lg px-2 py-2 outline-none" />
            <button onClick={addProduct} style={{ background: GOLD, color: "#000" }} className="px-3 py-2 rounded-lg text-xs font-bold shrink-0">追加</button>
          </div>
          <p className="text-[10px] text-zinc-600">基準 = 低在庫アラートを出す残数（空欄でアラートなし）</p>
        </div>
      </div>

      <div>
        <button onClick={makeOrderSheet} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="w-full rounded-lg py-2.5 text-sm font-bold">📝 発注書を自動生成（低在庫分）</button>
        {orderSheet && (
          <textarea readOnly value={orderSheet} rows={6} style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "13px" }} className="w-full rounded-lg p-2 mt-2 outline-none" onFocus={e => e.target.select()} />
        )}
      </div>
    </div>
  );
}

function DataManagement({ exportData, importData, listAutoBackups, restoreAutoBackup }) {
  const fileRef = useRef(null);
  const [staged, setStaged] = useState(null); // { text, name, summary }
  const [msg, setMsg] = useState(null); // { ok, msg }
  const [bakConfirm, setBakConfirm] = useState(null); // 自動バックアップ復元の2度押し用 key
  const [showBaks, setShowBaks] = useState(false);
  const baks = showBaks ? listAutoBackups() : [];

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      let summary = null;
      try {
        const d = JSON.parse(text);
        summary = { store: d.store, exportedAt: (d.exportedAt || "").slice(0, 16).replace("T", " "), casts: (d.payload?.casts || []).length, customers: (d.payload?.customerBook || []).length, historyDays: (d.payload?.history || []).length };
      } catch { /* importData 側でエラーにする */ }
      setStaged({ text, name: f.name, summary });
      setMsg(null);
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">データ管理（バックアップ）</h2>
      <p className="text-xs text-zinc-500 mb-3">端末の故障・ブラウザのデータ消去に備えて、全データ（キャスト・客名帳・売上履歴・キープ）をファイルに保存できます。営業リセット時にも自動でこの端末内に5世代保存されます。</p>

      <div className="flex gap-2 mb-3">
        <button onClick={exportData} style={{ background: GOLD, color: "#000" }} className="flex-1 rounded-lg py-2.5 text-sm font-bold">⬇ 書き出す（ファイル保存）</button>
        <button onClick={() => fileRef.current?.click()} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="flex-1 rounded-lg py-2.5 text-sm font-bold">⬆ 読み込む（復元）</button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
      </div>

      {staged && (
        <div style={{ background: "rgba(224,168,74,.08)", border: "1px solid #7a5a1a" }} className="rounded-xl p-3 mb-3">
          <div className="text-xs font-bold mb-1" style={{ color: "#e0a84a" }}>復元の確認 — 現在のデータは上書きされます</div>
          <div className="text-[11px] text-zinc-400 mb-2">
            {staged.name}
            {staged.summary && <> ／ {staged.summary.store} ／ {staged.summary.exportedAt}<br />キャスト{staged.summary.casts}名・客名帳{staged.summary.customers}名・履歴{staged.summary.historyDays}日</>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStaged(null)} style={{ background: "#22222a", color: "#aaa" }} className="flex-1 rounded-lg py-2 text-xs">やめる</button>
            <button onClick={() => { importData(staged.text, setMsg); setStaged(null); }} style={{ background: "#7a2222", color: "#fff" }} className="flex-1 rounded-lg py-2 text-xs font-bold">復元実行（上書き）</button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ color: msg.ok ? "#7ae0a0" : "#ff8888", background: msg.ok ? "rgba(74,222,128,.08)" : "rgba(224,85,85,.08)", border: `1px solid ${msg.ok ? "#2a5a3a" : "#7a2222"}` }} className="rounded-lg p-2 text-xs mb-3">{msg.msg}</div>
      )}

      <button onClick={() => setShowBaks(s => !s)} style={{ background: "#0d0d10", border: "1px dashed #2a2a32", color: "#999" }} className="w-full rounded-lg py-2 text-xs font-bold mb-2">{showBaks ? "▲ 自動バックアップを閉じる" : "▼ 自動バックアップ一覧（営業リセット時に保存）"}</button>
      {showBaks && (
        <div className="space-y-1.5">
          {baks.length === 0 && <p className="text-[11px] text-zinc-500">まだ自動バックアップがありません（営業リセットすると作られます）</p>}
          {baks.map(b => (
            <div key={b.key} style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-lg p-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0 text-[11px]">
                <div className="font-bold">{(b.exportedAt || "?").slice(0, 16).replace("T", " ")}</div>
                <div className="text-zinc-500">キャスト{b.casts ?? "?"}・客{b.customers ?? "?"}・履歴{b.historyDays ?? "?"}日</div>
              </div>
              {bakConfirm === b.key ? (
                <button onClick={() => { restoreAutoBackup(b.key, setMsg); setBakConfirm(null); }} style={{ background: "#7a2222", color: "#fff" }} className="text-[11px] rounded-full px-2.5 py-1.5 font-bold whitespace-nowrap">上書き確定</button>
              ) : (
                <button onClick={() => setBakConfirm(b.key)} style={{ background: "#22222a", color: GOLD }} className="text-[11px] rounded-full px-2.5 py-1.5 font-bold whitespace-nowrap">復元</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditLogView({ auditLog }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ background: "#0d0d10", border: "1px dashed #2a2a32", color: "#999" }} className="w-full rounded-lg py-2 text-xs font-bold">
        {open ? "▲ 変更履歴を閉じる" : `▼ 変更履歴（監査ログ・${(auditLog || []).length}件）`}
      </button>
      {open && (
        <div className="mt-2 space-y-1 max-h-80 overflow-y-auto">
          {(auditLog || []).slice(0, 100).map((e, i) => (
            <div key={i} style={{ background: "#141418", border: "1px solid #1c1c22" }} className="rounded-lg px-2.5 py-1.5 flex items-start gap-2 text-[11px]">
              <span className="text-zinc-600 whitespace-nowrap">{new Date(e.t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <span style={{ color: GOLD }} className="font-bold whitespace-nowrap">{e.action}</span>
              <span className="text-zinc-400 min-w-0 break-all">{e.detail}</span>
            </div>
          ))}
          {(auditLog || []).length === 0 && <p className="text-[11px] text-zinc-500 py-2">まだ記録がありません</p>}
        </div>
      )}
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
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-24">出勤予定時刻</span>
            <input value={c.shiftStart || ""} onChange={e => upd(c.id, x => ({ ...x, shiftStart: e.target.value }))} placeholder="例: 20:00（空欄=遅刻判定なし）" style={{ background: "#0d0d10", border: "1px solid #22222a", fontSize: "15px" }} className="flex-1 rounded px-2 py-1 outline-none" />
          </div>

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

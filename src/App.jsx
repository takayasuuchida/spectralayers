import { useState, useEffect, useMemo, useRef } from "react";
import { LayoutGrid, Sparkles, Settings, Crown, Plus, X, Clock, AlertTriangle, ChevronLeft, ChevronRight, Trash2, Wand2, UserPlus, Link2, CalendarDays, Users, Cake, Package } from "lucide-react";

const APP_VERSION = "3.7.0"; // 画面右上に表示。リリースごとに上げる
const GOLD = "#c9a64e";
const TEAL = "#3fb6b0";
// URL パラメータで店舗を切り替え: ?store=viverce or ?store=ANELA など
const URL_STORE = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("store")) || "viverce";
// 保存領域の識別子。"vivace" と "viverce" は同じ店の綴り違いなので同じ領域に寄せる
// （URLに ?store=vivace を付けても入力済みデータが行方不明にならないようにするため）。
const STORE_ALIASES = { vivace: "viverce" };
const STORE_ID = STORE_ALIASES[URL_STORE] || URL_STORE;
const STORE_KEY = STORE_ID + "-v1";
// 綴り違いで保存されていた場合の読み込みフォールバック（データを見失わないため）
const LEGACY_STORE_KEYS = ["vivace-v1", "viverce-v1", URL_STORE + "-v1"].filter(k => k !== STORE_KEY);
// 画面に出す店名の既定値。STORE_ID は保存キーなので変更禁止だが、表示名は別物として扱う。
// 過去の綴り "viverce" は誤記なので "vivace" に直す。
const STORE_NAME_FIX = { viverce: "vivace" };
const DEFAULT_STORE_NAME = STORE_NAME_FIX[STORE_ID] || STORE_ID;
// 店名は「ユーザーが入力した値」が最優先。空のときだけ既定値、既知の誤記だけ直す。
const normalizeStoreName = (n) => {
  const v = String(n ?? "").trim();
  if (!v) return DEFAULT_STORE_NAME;
  return STORE_NAME_FIX[v] || v;
};
const GENRES = ["綺麗", "可愛い", "おもしろい", "オタク系", "ギャル系", "ヤンキー系"];
const GENRE_COLOR = { "綺麗": "#7aa7ff", "可愛い": "#ff8fc4", "おもしろい": "#f0b54a", "オタク系": "#a78bfa", "ギャル系": "#ff9f45", "ヤンキー系": "#4ade80" };

// ============================================================
// 付け回しの理念（黒服の教科書）を実装するための分類軸
//   付け回しは「お客様」「お店」「キャバ嬢」の三者にとって意味を持つ業務。
//   - お客様: 好みに合う子と出会える／色々な子と話せる／また来たくなる
//   - お店  : 場内指名が増える／延長が増える／リピーターが増える
//   - 嬢    : 自分の魅力を活かせる客と出会える／場内指名のチャンスが増える
// ============================================================

// 接客スタイル（異なるタイプを順に付けて「お客様の好み」を探るための軸）
const STYLES = ["トーク", "聞き上手", "盛り上げ", "癒し"];
const STYLE_COLOR = { "トーク": "#ffb347", "聞き上手": "#7aa7ff", "盛り上げ": "#ff6fa5", "癒し": "#5fd6a0" };
const STYLE_DESC = {
  "トーク": "会話力が高い・話題豊富",
  "聞き上手": "お客様の話をじっくり聞ける",
  "盛り上げ": "場を盛り上げるパフォーマンス型",
  "癒し": "穏やかな雰囲気で癒しを提供",
};
// 接客レベル（1番目＝お店の顔／初回・太客への配置に使う）
const RANKS = ["S", "A", "B", "新人"];
const RANK_WEIGHT = { "S": 30, "A": 20, "B": 10, "新人": 0 };
const RANK_COLOR = { "S": "#e8c96a", "A": "#a8e6e2", "B": "#8a8a92", "新人": "#7fdc8a" };
// 得意な客層（年代）
const AGE_BANDS = ["20代", "30代", "40代以上"];
// 売上傾向・強み
const STRENGTHS = ["延長に強い", "新規に強い", "団体OK", "同伴多い", "指名率高い"];

// 交代の時間配分（教科書: 60分1セットなら 1人目=開始直後 / 2人目=15〜20分 / 3人目=35〜40分）
// セット時間に対する割合で持つことで50分セットでも同じ考え方が使える。
const ROT_RATIO = [0, 0.30, 0.65];
const rotationSchedule = (setDuration) => ROT_RATIO.map(r => Math.round(setDuration * r));
// n人目（0始まり）の担当時間が終わる「目安の分」。最後の子はセット終了まで。
function rotWindowEndMin(setDuration, n) {
  const sc = rotationSchedule(setDuration);
  return n + 1 < sc.length ? sc[n + 1] : setDuration;
}
// 反応: 1=◎相性良い / -1=✗合わない / 未記録=0
const REACT_GOOD = 1, REACT_BAD = -1;

const DEFAULT_SETTINGS = { storeName: DEFAULT_STORE_NAME, target: 1000000, layoutLocked: true, overheadPct: 15, taxRate: 10, cardFeePct: 10, roundUnit: 100, bottleBackPresets: [20, 25, 35], latePenaltyPerMin: 0, withholdTax: false, gpsClockIn: false, shareEnabled: false, cloudBackup: false };

// ---- リアルタイム卓状況共有（B案: 卓の空き状況だけクラウド、名前・売上・給料は端末内のみ） ----
// share-endpoint-override は E2E テスト用フック（通常運用では未設定）
const SHARE_BASE = (() => { try { return localStorage.getItem("share-endpoint-override") || "https://kngkckweonnnhfocfqan.supabase.co"; } catch { return "https://kngkckweonnnhfocfqan.supabase.co"; } })();
const SHARE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuZ2tja3dlb25ubmhmb2NmcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTQwODUsImV4cCI6MjA5NzU3MDA4NX0.lUeIniKLSh3wxjTL0JGB0PAamSv3X8JEidZtvKhO8-E"; // 公開前提の anon キー
const shareHeaders = { apikey: SHARE_API_KEY, Authorization: `Bearer ${SHARE_API_KEY}` };

// ---- クラウド金庫: パスワード暗号化(AES-GCM)した全データバックアップ ----
// パスワードを知らない限りサーバー側でも復号不可。パスワードを忘れると復元不可。
const _b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const _un64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function vaultDeriveKey(pass, saltU8) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: saltU8, iterations: 100000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function vaultEncrypt(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultDeriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return { salt: _b64(salt), iv: _b64(iv), ct: _b64(ct) };
}
async function vaultDecrypt(blob, pass) {
  const key = await vaultDeriveKey(pass, _un64(blob.salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: _un64(blob.iv) }, key, _un64(blob.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
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
  // ボトルは銘柄ごとにバック率が違うので、注文した瞬間に実額を積む。
  // bottleSalesBacked = そのうち実額計算済みの売上（旧方式との二重計上を防ぐため）
  bottleBackYen: 0,
  bottleSalesBacked: 0,
  dohanCount: 0,
  fieldNominationCount: 0,
  mainNominationCount: 0,
  clockedInAt: null,
  lateMinutes: 0,
};
// 付け回しの判断材料（教科書の「キャバ嬢の分類」）
const DEFAULT_CAST_PROFILE = {
  style: "トーク",       // 接客スタイル
  rank: "B",             // 接客レベル S/A/B/新人
  ageFit: [],            // 得意な客層（年代）
  strengths: [],         // 延長に強い・新規に強い 等
  ngCustomerIds: [],     // このキャストが「付きたくない」お客様（客名帳ID）。付け回しから完全除外
};
const mergeCastDefaults = (c) => ({ ...DEFAULT_CAST_PAY, ...DEFAULT_CAST_COUNTERS, ...DEFAULT_CAST_PROFILE, ...c });
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
  { id: "c1", name: "リカ", score: 9, genres: ["綺麗"], status: "出勤", style: "トーク", rank: "S", strengths: ["延長に強い", "新規に強い"] },
  { id: "c2", name: "マオ", score: 8, genres: ["可愛い"], status: "出勤", style: "盛り上げ", rank: "A", strengths: ["団体OK"] },
  { id: "c3", name: "ユイ", score: 7, genres: ["綺麗"], status: "出勤", style: "聞き上手", rank: "A" },
  { id: "c4", name: "アヤ", score: 6, genres: ["おもしろい"], status: "出勤", style: "盛り上げ", rank: "B" },
  { id: "c5", name: "ミク", score: 6, genres: ["可愛い"], status: "出勤", style: "癒し", rank: "B" },
  { id: "c6", name: "ナナ", score: 5, genres: ["おもしろい"], status: "出勤", style: "トーク", rank: "B" },
  { id: "c7", name: "サキ", score: 7, genres: ["可愛い"], status: "出勤", style: "癒し", rank: "A", strengths: ["同伴多い"] },
  { id: "c8", name: "レイ", score: 8, genres: ["綺麗"], status: "出勤", style: "聞き上手", rank: "S", strengths: ["延長に強い", "指名率高い"] },
  { id: "c9", name: "エマ", score: 4, genres: ["可愛い", "おもしろい"], status: "出勤", style: "盛り上げ", rank: "新人" },
  { id: "c10", name: "カナ", score: 5, genres: ["綺麗"], status: "出勤", style: "聞き上手", rank: "B" },
  { id: "c11", name: "ミナ", score: 6, genres: ["おもしろい"], status: "未出勤", style: "トーク", rank: "B" },
  { id: "c12", name: "ホノカ", score: 7, genres: ["可愛い"], status: "未出勤", style: "癒し", rank: "A" },
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

const SEED_CASTS = STORE_ID === "ANELA" ? ANELA_SEED_CASTS : DEFAULT_SEED_CASTS;

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
// 指名の種類。ボトルバックは本指名のキャストで折半する（場内・ヘルプには付かない）
const NOM_MAIN = "main", NOM_FIELD = "field", NOM_HELP = "help";
const NOM_LABEL = { main: "本", field: "場内", help: "ヘルプ" };
const NOM_COLOR = { main: "#c9a64e", field: "#3fb6b0", help: "#5a5a62" };
const NOM_ORDER = [NOM_HELP, NOM_FIELD, NOM_MAIN];
// セット時間 + 延長ぶん
const setMinOf = (t) => (t.setDuration || 0) + (t.extendMin || 0);
const remainOf = (t, now) => t.setStart + setMinOf(t) * 60000 - now;
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
  // お客様の反応記録 { [custId]: { [castId]: 1(◎相性良い) | -1(✗合わない) } }
  // 教科書「お客様の反応を見極めて場内指名や延長に繋ぐ」の実装。3人目・延長の人選に使う。
  const [reactions, setReactions] = useState({});
  // 伝票記録（印刷しても会計しても金額がデータとして残る）。最新が先頭・最大2000件
  const [receipts, setReceipts] = useState([]);
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
      let raw = await storeGet(STORE_KEY);
      // 綴り違い（vivace / viverce）の領域に保存されていたら拾って引き継ぐ
      if (!raw) {
        for (const k of LEGACY_STORE_KEYS) {
          const alt = await storeGet(k);
          if (alt) { raw = alt; break; }
        }
      }
      if (raw) {
        try {
          const d = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...(d.settings || {}), storeName: normalizeStoreName(d.settings?.storeName) });
          setTables(d.tables || DEFAULT_TABLES);
          setMergeGroups(d.mergeGroups || DEFAULT_MERGE_GROUPS);
          setCasts((d.casts || SEED_CASTS).map(mergeCastDefaults));
          setTs(d.ts || {});
          setServed(d.served || {});
          setReactions(d.reactions || {});
          setReceipts(d.receipts || []);
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
    const id = setTimeout(() => { storeSet(STORE_KEY, JSON.stringify({ settings, tables, mergeGroups, casts, ts, served, reactions, receipts, merges, closed, history, customerBook, bottleKeeps, auditLog, salaryHistory, salaryAdjust, reservations, products, salesLog })); }, 500);
    return () => clearTimeout(id);
  }, [loaded, settings, tables, mergeGroups, casts, ts, served, reactions, receipts, merges, closed, history, customerBook, bottleKeeps, auditLog, salaryHistory, salaryAdjust, reservations, products, salesLog]);

  // ---- 監査ログ ----
  const logAudit = (action, detail = "") =>
    setAuditLog(l => [{ t: Date.now(), action, detail }, ...l].slice(0, 1000));

  // ---- バックアップ ----
  const buildPayload = () => ({ settings, tables, mergeGroups, casts, ts, served, reactions, receipts, merges, closed, history, customerBook, bottleKeeps, auditLog, salaryHistory, salaryAdjust, reservations, products, salesLog });

  function exportData() {
    const data = { app: "tsukemawashi", version: APP_VERSION, store: STORE_ID, exportedAt: new Date().toISOString(), payload: buildPayload() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tsukemawashi-${STORE_ID}-${businessDateOfNow()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    logAudit("バックアップ書き出し");
  }

  function applyPayload(p) {
    setSettings({ ...DEFAULT_SETTINGS, ...(p.settings || {}), storeName: normalizeStoreName(p.settings?.storeName) });
    setTables(p.tables || DEFAULT_TABLES);
    setMergeGroups(p.mergeGroups || DEFAULT_MERGE_GROUPS);
    setCasts((p.casts || SEED_CASTS).map(mergeCastDefaults));
    setTs(p.ts || {});
    setServed(p.served || {});
    setReactions(p.reactions || {});
    setReceipts(p.receipts || []);
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
      localStorage.setItem(key, JSON.stringify({ app: "tsukemawashi", version: APP_VERSION, store: STORE_ID, exportedAt: new Date().toISOString(), payload: buildPayload() }));
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

  // ---- 端末内レスキュー: 別キーに残っている保存データを探して復旧 ----
  // （URLパラメータ違い・バージョン切替等で保存先が変わってしまった場合の救出用）
  function listRescueData() {
    const out = [];
    try {
      for (const k of Object.keys(localStorage)) {
        if (k === STORE_KEY) continue;
        let d;
        try { d = JSON.parse(localStorage.getItem(k)); } catch { continue; }
        const payload = d?.payload || d; // 自動バックアップ形式 or 素の保存形式の両対応
        if (!payload || typeof payload !== "object") continue;
        const hasCasts = Array.isArray(payload.casts) && payload.casts.length > 0;
        const hasBook = Array.isArray(payload.customerBook) && payload.customerBook.length > 0;
        const hasTables = Array.isArray(payload.tables) && payload.tables.length > 0;
        if (!hasCasts && !hasBook && !hasTables) continue;
        out.push({
          key: k,
          casts: (payload.casts || []).length,
          castNames: (payload.casts || []).slice(0, 8).map(c => c.name).join("・"),
          customers: (payload.customerBook || []).length,
          tables: (payload.tables || []).length,
          exportedAt: d.exportedAt || null,
        });
      }
    } catch { /* noop */ }
    return out;
  }
  function restoreRescue(key, onResult) {
    try {
      const d = JSON.parse(localStorage.getItem(key));
      const payload = d?.payload || d;
      writeAutoBackup(); // 現状も念のため退避してから
      applyPayload(payload);
      setAuditLog(l => [{ t: Date.now(), action: "端末内データ復旧", detail: key }, ...l].slice(0, 1000));
      onResult?.({ ok: true, msg: `復旧しました（${key} から）` });
    } catch (e) { onResult?.({ ok: false, msg: "復旧失敗: " + String(e?.message || e) }); }
  }

  function resetNight() {
    writeAutoBackup(); // リセット前の状態を自動バックアップ（5世代保持）
    // 今日の集計を history に保存
    const activeRows = Object.values(ts).filter(t => t?.active);
    const activeSubtotal = activeRows.reduce((s, t) => s + tableTotal(t), 0);
    const closedSubtotal = closed.reduce((s, r) => s + (r.total || 0), 0);
    const subtotal = activeSubtotal + closedSubtotal;
    const tax = closed.reduce((s2, r) => s2 + (r.tax ?? Math.round((r.total || 0) * taxRate)), 0)
      + activeRows.reduce((s2, t) => s2 + tableTax(t), 0);
    const grand = subtotal + tax;
    const cardFee = closed.reduce((s2, r) => s2 + (r.fee || 0), 0)
      + activeRows.reduce((s2, t) => s2 + tableCardFee(t), 0);
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
        subtotal, tax, grand, cardFee, tableCount, activeCount, byTable,
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
        drinkCount: c.drinkCount || 0, shotCount: c.shotCount || 0, bottleSales: c.bottleSales || 0, bottleBackYen: b.bottleBack || 0,
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
    // ボトルは銘柄ごとに率が違うので、注文時に積んだ実額を使う。
    // 実額計算されていない分（旧データ）だけキャストの既定率で計算して合算する。
    const legacySales = Math.max(0, (c.bottleSales || 0) - (c.bottleSalesBacked || 0));
    const bottleBack = (c.bottleBackYen || 0) + Math.round(legacySales * c.bottleBackPct / 100);
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

  // ---- 会計の端数処理 ----
  // 丸めるのは「最後の合計」だけ。途中（小計・消費税・サービス料）は素の金額のまま。
  // 途中で切り上げると二重に上乗せされてしまうため。
  //   例) 小計27,830 / 税2,783 / サービス料2,783 = 33,396 → 繰り上げ 33,400
  const roundUnit = Math.max(1, settings.roundUnit ?? 100);
  const roundMoney = (n) => Math.ceil(n / roundUnit) * roundUnit;
  const tableTotal = (t) => (t.setType * t.customers.length) + t.orders.reduce((s, o) => s + o.price * o.qty, 0); // 小計（素のまま）
  const tableRawTotal = tableTotal; // 互換: 小計は丸めないので同じ
  const taxRate = (settings.taxRate ?? 10) / 100;
  const tableTax = (t) => Math.round(tableTotal(t) * taxRate);
  const tableGrand = (t) => tableTotal(t) + tableTax(t);
  // カード決済サービス料。消費税と同じく「小計」に対して設定の%（既定10%）。
  const cardFeePct = settings.cardFeePct ?? 10;
  const tableCardFee = (t) => (t?.payMethod === "card" ? Math.round(tableTotal(t) * cardFeePct / 100) : 0);
  // 実際にお客様からいただく額。ここで初めて端数を繰り上げる。
  const tablePayable = (t) => roundMoney(tableGrand(t) + tableCardFee(t));
  const tableRoundAdj = (t) => tablePayable(t) - (tableGrand(t) + tableCardFee(t)); // 端数調整額
  const setPayMethod = (tableId, m) => upd(tableId, t => ({ ...t, payMethod: m }));

  // ---- 付け回しロジック（公平ドラフト方式） ----
  // 客がこれまで受けた「質」= 付いたキャスト（現在含む）の最高ランク。
  // まだいい子が付いてない客から順に、その時点の最良を配る。
  // → ボスに上位が集中せず、3名様なら3人に1回ずついい子が回る。
  const qualityReceived = (custId) =>
    Math.max(0, ...((served[custId] || []).map(id => castById[id]?.score || 0)));

  // 客の属性を客名帳から解決（初回か・太客か・年代）
  function custProfile(cust) {
    const cb = cust?.customerBookId ? customerBook.find(c => c.id === cust.customerBookId) : null;
    const visits = cb?.visits || 0;
    const spent = cb?.totalSpent || 0;
    return {
      cb,
      isFirst: visits <= 1,                 // 初回来店 → お店の第一印象を決める大事な機会
      isVip: spent >= 100000 || visits >= 10, // 太客 → 高スキル・教養のあるベテランを
      ageBand: cb?.ageBand || cust?.ageBand || "",
      goodStyles: new Set(                   // 反応◎だった子のスタイル（好みの手がかり）
        Object.entries(reactions[cust?.id] || {})
          .filter(([, v]) => v === REACT_GOOD)
          .map(([cid]) => castById[cid]?.style).filter(Boolean)),
      badStyles: new Set(
        Object.entries(reactions[cust?.id] || {})
          .filter(([, v]) => v === REACT_BAD)
          .map(([cid]) => castById[cid]?.style).filter(Boolean)),
    };
  }

  // ---- 付け回しスコアリング（教科書のルールをそのまま点数化） ----
  // nth = このお客様にとって何人目か（1始まり）
  function castScore(cast, cust, t, nth, prof, nowH) {
    let s = (cast.score || 5) * 10;                       // 基礎ランク
    const prevStyles = new Set((served[cust.id] || []).map(id => castById[id]?.style).filter(Boolean));
    const tableStyles = new Set((t?.casts || []).map(a => castById[a.castId]?.style).filter(Boolean));

    // 好みのジャンル一致（お客様の好みに合った子を見つけやすく）
    if (cust.pref && (cast.genres || []).includes(cust.pref)) s += 45;
    // 年代の相性（会話の内容・接し方が大きく変わるため）
    if (prof.ageBand && (cast.ageFit || []).includes(prof.ageBand)) s += 35;
    else if (prof.ageBand && (cast.ageFit || []).length) s -= 20; // 得意層が明示されていて外れている

    // 何人目かで役割が変わる
    if (nth === 1) {
      // 1番目 = お店の顔。見た目・接客スキル・情報収集力。初回客なら特にトップクラスを。
      s += RANK_WEIGHT[cast.rank] ?? 10;
      if (prof.isFirst) s += (RANK_WEIGHT[cast.rank] ?? 10) + ((cast.strengths || []).includes("新規に強い") ? 40 : 0);
    } else if (nth === 2) {
      // 2番目 = 1番目で得た情報を活かす。
      //   反応◎ → 似たタイプで満足度を維持 / それ以外 → 対照的な魅力で新鮮さを演出
      if (prof.goodStyles.size) { if (prof.goodStyles.has(cast.style)) s += 90; }
      else if (!prevStyles.has(cast.style)) s += 35;
      if (prof.badStyles.has(cast.style)) s -= 60;
    } else {
      // 3番目以降 = 最後の逆転チャンス。場内指名・延長・再来店を狙う。
      if (prof.goodStyles.has(cast.style)) s += 50;
      if (prof.badStyles.has(cast.style)) s -= 70;
      if ((cast.strengths || []).includes("延長に強い")) s += 35;
      if ((cast.strengths || []).includes("指名率高い")) s += 30;
      s += (RANK_WEIGHT[cast.rank] ?? 10) / 2;
    }

    // 様々な出会いを作る: 既に同じスタイルが付いた/卓にいるなら減点
    if (prevStyles.has(cast.style)) s -= 30;
    if (tableStyles.has(cast.style)) s -= 15;

    // 客層別
    if (prof.isVip) s += (RANK_WEIGHT[cast.rank] ?? 10) * 1.5; // 太客には総合力の高い子
    if ((t?.customers?.length || 1) >= 3) {                    // 団体客 → 場を盛り上げられる子
      if (cast.style === "盛り上げ") s += 30;
      if ((cast.strengths || []).includes("団体OK")) s += 30;
    } else if ((t?.customers?.length || 1) === 1) {            // おひとり様 → 聞き上手・気配り
      if (cast.style === "聞き上手") s += 35;
      if (cast.style === "癒し") s += 20;
    }

    // 時間帯別（開店直後は明るく元気に／ラスト前は落ち着いたベテランで延長・再来店へ）
    if (nowH >= 19 && nowH < 21) { if (cast.style === "盛り上げ" || cast.style === "トーク") s += 20; }
    if (nowH >= 1 || nowH < 4) { if (cast.rank === "S" || cast.rank === "A") s += 15; }

    // セット終盤に投入するなら延長に強い子を（終了5〜10分前の布石）
    if (t?.setStart) {
      const remainMin = (t.setStart + setMinOf(t) * 60000 - Date.now()) / 60000;
      if (remainMin <= 12 && (cast.strengths || []).includes("延長に強い")) s += 45;
    }

    // ボスは同点時に優先（既存の考え方を維持）
    if (cust.isBoss) s += 3;
    return s;
  }

  // キャストが「付きたくない」と申告したお客様は付け回しから完全に外す（キャストが安心して働ける環境）
  const isNgPair = (cast, cust) =>
    !!(cust?.customerBookId && (cast?.ngCustomerIds || []).includes(cust.customerBookId));

  function fairDraft(targetCustomers, pool) {
    const order = [...targetCustomers].sort((a, b) =>
      qualityReceived(a.id) - qualityReceived(b.id) ||
      (b.isBoss ? 1 : 0) - (a.isBoss ? 1 : 0));
    let avail = [...pool];
    const plan = [];
    const nowH = new Date().getHours();
    for (const cust of order) {
      const t = Object.values(ts).find(x => x?.active && x.customers.some(c => c.id === cust.id));
      const prof = custProfile(cust);
      const nth = (served[cust.id] || []).length + 1;
      const cand = avail.filter(c => !(served[cust.id] || []).includes(c.id) && !isNgPair(c, cust));
      if (!cand.length) continue;
      const pick = [...cand].sort((a, b) => castScore(b, cust, t, nth, prof, nowH) - castScore(a, cust, t, nth, prof, nowH))[0];
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

    // 1-b) 付け回しの偏り検知: 手薄な卓と余裕のある卓が同時に存在する
    {
      const rows = Object.entries(ts)
        .filter(([, t]) => t?.active && t.customers.length > 0)
        .map(([tid, t]) => ({
          label: tables.find(x => x.id === tid)?.label || tid,
          cust: t.customers.length, cast: t.casts.length,
          ratio: t.casts.length / t.customers.length,
        }));
      if (rows.length >= 2) {
        const thin = rows.filter(r => r.ratio < 0.5 && r.cust - r.cast >= 2); // 客2人以上に対し女の子が半分未満
        const rich = rows.filter(r => r.ratio >= 1);
        if (thin.length && (rich.length || available.length)) {
          out.push({
            icon: "⚖️", level: "act",
            title: `付け回しが偏っています: ${thin.map(r => `${r.label}(客${r.cust}・嬢${r.cast})`).join("・")}`,
            detail: available.length
              ? `空き${available.length}名います。フロア上部の「⚖️ 全卓バランス付け回し」で均等に配れます`
              : `${rich.map(r => r.label).join("・")}は足りています。1名回して均衡させると全卓の満足度が上がります`,
          });
        }
      }
    }

    // 1-c) 理念に沿った接客ナビ（教科書のルールをその場の助言に）
    Object.entries(ts).forEach(([tid, t]) => {
      if (!t?.active || !t.setStart || !t.customers.length) return;
      const label = tables.find(x => x.id === tid)?.label || tid;
      const remainMin = (t.setStart + setMinOf(t) * 60000 - nowMs) / 60000;

      // 延長クロージング: 終了5〜10分前にお気に入り／延長に強い子を入れる
      if (remainMin > 0 && remainMin <= 10) {
        const inT = new Set(t.casts.map(a => a.castId));
        const favNames = [];
        t.customers.forEach(cu => Object.entries(reactions[cu.id] || {}).forEach(([cid, v]) => {
          if (v === REACT_GOOD && !inT.has(cid) && castById[cid]) favNames.push(castById[cid].name);
        }));
        const closers = available.filter(c => (c.strengths || []).includes("延長に強い")).map(c => c.name);
        out.push({
          icon: "⏰", level: "act",
          title: `${label}: 残り${Math.ceil(remainMin)}分 — 延長クロージングの時間`,
          detail: [favNames.length ? `反応◎: ${favNames.slice(0, 3).join("・")}を席へ` : null,
          closers.length ? `延長に強い: ${closers.slice(0, 3).join("・")}` : null,
          "ドリンクの残量を見てタイミングを計る"].filter(Boolean).join(" / "),
        });
      }

      // まだ誰の反応も記録されていない → 好みを掴めていない
      const anyReact = t.customers.some(cu => Object.keys(reactions[cu.id] || {}).length > 0);
      const served2 = t.customers.some(cu => (served[cu.id] || []).length >= 2);
      if (served2 && !anyReact && remainMin > 10) {
        out.push({ icon: "👀", level: "info", title: `${label}: 反応がまだ記録されていません`, detail: "チップの ◎/✗ を押して反応を残すと、3人目と延長の人選が精度よく提案されます（場内指名の種）" });
      }

      // プラス付けの好機: 空きに余裕があり、初回客 or 太客 or 長時間滞在
      const need = t.customers.filter(c => !new Set(t.casts.map(a => a.customerId)).has(c.id)).length;
      if (available.length >= 2 && need === 0 && t.casts.length <= t.customers.length) {
        const first = t.customers.some(cu => { const cb = customerBook.find(x => x.id === cu.customerBookId); return (cb?.visits || 0) <= 1; });
        const vip = t.customers.some(cu => { const cb = customerBook.find(x => x.id === cu.customerBookId); return (cb?.totalSpent || 0) >= 100000; });
        if (first || vip) {
          out.push({ icon: "➕", level: "info", title: `${label}: プラス付けの好機（空き${available.length}名）`, detail: `${first ? "初めてのお客様" : "太客"}へのおもてなし。人数より多く付けると好みの子と出会う確率が上がり、場内指名に繋がります` });
        }
      }
    });

    // 1-d) マイナス営業 → 他卓から交代時間の近い子を回す
    {
      let need = 0;
      const shorts = [];
      Object.entries(ts).forEach(([tid, t]) => {
        if (!t?.active) return;
        const assigned = new Set(t.casts.map(a => a.customerId));
        const n = t.customers.filter(c => !assigned.has(c.id)).length;
        if (n > 0) shorts.push(`${tables.find(x => x.id === tid)?.label || tid}(待ち${n}名)`);
        need += n;
      });
      if (need > available.length) {
        // 抜きやすい子＝交代までの残りが少ない子を先に提示
        const soon = [];
        Object.entries(ts).forEach(([tid, t]) => {
          if (!t?.active || !t.setStart) return;
          t.casts.forEach(a => {
            const at = a.at ?? t.setStart;
            const n = Math.max(0, (served[a.customerId] || []).indexOf(a.castId));
            const end = Math.max((t.setStart || at) + rotWindowEndMin(t.setDuration, n) * 60000, at + 10 * 60000);
            if (nowMs - at >= 10 * 60000) soon.push({ name: castById[a.castId]?.name, remain: end - nowMs, label: tables.find(x => x.id === tid)?.label || tid });
          });
        });
        soon.sort((a, b) => a.remain - b.remain);
        out.push({
          icon: "🈵", level: "act",
          title: `マイナス営業 — 女の子待ち${need}名 / 空き${available.length}名`,
          detail: [shorts.join("・"),
          soon.length ? `回せる候補: ${soon.slice(0, 3).map(s => `${s.name}(${s.label}・交代まで${Math.max(0, Math.ceil(s.remain / 60000))}分)`).join("・")}` : "他卓もまだ交代時間に達していません",
            "卓を開いて「🆘 他卓から応援を呼ぶ」"].filter(Boolean).join(" / "),
        });
      } else if (available.length === 0 && casts.some(c => c.status === "出勤")) {
        out.push({ icon: "🈵", level: "warn", title: "予備キャスト0名", detail: "急な団体・新規のご来店に対応できません。どこかの卓から1名回せないか確認を（お客様を長く待たせるのが最悪の失敗）" });
      }
    }

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
  }, [loaded, brainTick, ts, closed, history, salesLog, salaryHistory, customerBook, bottleKeeps, casts, served, reactions]);

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
        if (!t.setStart) return { label: disp.label, cap: disp.cap, busy: true, preparing: true, guests: t.customers.length };
        const remainMin = Math.ceil((t.setStart + setMinOf(t) * 60000 - nowMs) / 60000);
        const rotMs = (t.setDuration / 3) * 60000;
        const rotOver = t.casts.some(a => (a.at ?? t.setStart) + rotMs - nowMs <= 0);
        return { label: disp.label, cap: disp.cap, busy: true, guests: t.customers.length, remainMin, rotOver };
      }),
      // 振りっこボード用: 卓が空いていてもキャストがいなければ振れないため人数だけ共有（名前は送らない）
      casts: {
        now: casts.filter(c => c.status === "出勤").length,
        total: casts.filter(c => c.status !== "退勤済").length,
        free: available.length,
      },
    };
  }, [loaded, settings.shareEnabled, ts, tables, merges, brainTick, casts, available]);

  useEffect(() => {
    if (!sharePayload) return;
    const id = setTimeout(() => {
      fetch(`${SHARE_BASE}/rest/v1/floor?on_conflict=key`, {
        method: "POST",
        headers: { ...shareHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{ key: "share:" + STORE_ID, data: sharePayload, updated_at: new Date().toISOString() }]),
      }).catch(() => { /* 電波なしでも営業継続（オフラインファースト） */ });
    }, 2000);
    return () => clearTimeout(id);
  }, [sharePayload]);

  // ---- クラウド金庫（暗号化自動バックアップ） ----
  const [cloudPass, _setCloudPass] = useState(() => { try { return localStorage.getItem("tsuke-cloud-pass") || ""; } catch { return ""; } });
  const setCloudPass = (v) => { _setCloudPass(v); try { localStorage.setItem("tsuke-cloud-pass", v); } catch { /* noop */ } };
  const [cloudInfo, setCloudInfo] = useState({ lastPushAt: null, lastError: null, remote: null });

  async function cloudPush() {
    if (!settings.cloudBackup || !cloudPass) return;
    try {
      const blob = await vaultEncrypt(buildPayload(), cloudPass);
      const res = await fetch(`${SHARE_BASE}/rest/v1/floor?on_conflict=key`, {
        method: "POST",
        headers: { ...shareHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{ key: "vault:" + STORE_ID, data: { v: 1, at: Date.now(), meta: { casts: casts.length, customers: customerBook.length }, ...blob }, updated_at: new Date().toISOString() }]),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setCloudInfo(i => ({ ...i, lastPushAt: Date.now(), lastError: null }));
      return true;
    } catch (e) {
      setCloudInfo(i => ({ ...i, lastError: String(e?.message || e) }));
      return false;
    }
  }
  // データ変更の5秒後に自動保存（ON かつパスワード設定済みの時のみ）
  useEffect(() => {
    if (!loaded || !settings.cloudBackup || !cloudPass) return;
    const id = setTimeout(cloudPush, 5000);
    return () => clearTimeout(id);
  }, [loaded, settings.cloudBackup, cloudPass, settings, tables, mergeGroups, casts, served, closed, history, customerBook, bottleKeeps, salaryHistory, salaryAdjust, reservations, products, salesLog]);

  async function cloudCheck() {
    try {
      const res = await fetch(`${SHARE_BASE}/rest/v1/floor?key=eq.${encodeURIComponent("vault:" + STORE_ID)}&select=data,updated_at`, { headers: shareHeaders });
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      setCloudInfo(i => ({ ...i, remote: row ? { at: row.data?.at, casts: row.data?.meta?.casts, customers: row.data?.meta?.customers } : null, lastError: null }));
      return row;
    } catch (e) {
      setCloudInfo(i => ({ ...i, lastError: String(e?.message || e) }));
      return null;
    }
  }
  async function cloudRestore(pass, onResult) {
    try {
      const res = await fetch(`${SHARE_BASE}/rest/v1/floor?key=eq.${encodeURIComponent("vault:" + STORE_ID)}&select=data`, { headers: shareHeaders });
      const rows = await res.json();
      const blob = Array.isArray(rows) ? rows[0]?.data : null;
      if (!blob) { onResult?.({ ok: false, msg: "クラウド上にバックアップが見つかりません" }); return; }
      let payload;
      try { payload = await vaultDecrypt(blob, pass); }
      catch { onResult?.({ ok: false, msg: "パスワードが違います（復号できませんでした）" }); return; }
      writeAutoBackup();
      applyPayload(payload);
      setAuditLog(l => [{ t: Date.now(), action: "クラウド金庫から復元", detail: new Date(blob.at || 0).toLocaleString("ja-JP") }, ...l].slice(0, 1000));
      onResult?.({ ok: true, msg: `復元しました（${new Date(blob.at || 0).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 時点）` });
    } catch (e) {
      onResult?.({ ok: false, msg: "復元失敗: " + String(e?.message || e) });
    }
  }
  // ---- 指名の種類（本指名 / 場内 / ヘルプ） ----
  // ボトルバックは「その卓の本指名キャスト」で均等に折半する。
  // 場内は延長になった時点で本指名に昇格し、そこから折半に加わる。
  function bumpNomCounter(castId, type, delta) {
    if (type === NOM_MAIN) bumpCastCounter(castId, "mainNominationCount", delta);
    else if (type === NOM_FIELD) bumpCastCounter(castId, "fieldNominationCount", delta);
  }
  function setNomType(tableId, castId, next) {
    const cur = ts[tableId]?.casts.find(a => a.castId === castId)?.nomType || NOM_HELP;
    if (cur === next) return;
    bumpNomCounter(castId, cur, -1);   // 前の種別のカウントを戻す
    bumpNomCounter(castId, next, 1);   // 新しい種別を加算
    upd(tableId, t => ({ ...t, casts: t.casts.map(a => a.castId === castId ? { ...a, nomType: next } : a) }));
    logAudit("指名種別", `${castById[castId]?.name || "?"} → ${NOM_LABEL[next]}`);
  }
  // 延長: セット時間を延ばし、場内指名を本指名に昇格させる（そこからボトルバックは全員で折半）
  function extendTable(tableId, minutes) {
    const t = ts[tableId];
    if (!t?.active) return;
    const promoted = t.casts.filter(a => a.nomType === NOM_FIELD).map(a => a.castId);
    promoted.forEach(id => { bumpNomCounter(id, NOM_FIELD, -1); bumpNomCounter(id, NOM_MAIN, 1); });
    upd(tableId, t2 => ({
      ...t2,
      extendMin: (t2.extendMin || 0) + minutes,
      casts: t2.casts.map(a => a.nomType === NOM_FIELD ? { ...a, nomType: NOM_MAIN } : a),
    }));
    const label = tables.find(x => x.id === tableId)?.label || tableId;
    logAudit("延長", `${label} +${minutes}分${promoted.length ? ` / 場内→本指名: ${promoted.map(id => castById[id]?.name).join("・")}` : ""}`);
  }

  function doAssign(tableId, castId, customerId) {
    upd(tableId, t => {
      const seats = [...t.seats];
      const ci = seats.findIndex(s => s.k === "cust" && s.id === customerId);
      const entry = { k: "cast", id: castId };
      if (ci >= 0) seats.splice(ci + 1, 0, entry); else seats.push(entry);
      return { ...t, casts: [...t.casts, { castId, customerId, at: Date.now(), nomType: NOM_HELP }], seats };
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
  // お客様の反応を記録（◎ / ✗ をもう一度押すと解除）。3人目・延長の人選に効く。
  function setReaction(custId, castId, val) {
    setReactions(r => {
      const cur = r[custId] || {};
      const next = { ...cur };
      if (next[castId] === val) delete next[castId]; else next[castId] = val;
      return { ...r, [custId]: next };
    });
    const cust = Object.values(ts).flatMap(t => t?.customers || []).find(c => c.id === custId);
    // 反応◎はお気に入り検出にも反映（客名帳のお気に入り＝場内指名の候補）
    if (val === REACT_GOOD && cust?.customerBookId) {
      setCustomerBook(cb => cb.map(c => c.id === cust.customerBookId
        ? { ...c, castAffinity: { ...(c.castAffinity || {}), [castId]: ((c.castAffinity || {})[castId] || 0) + 2 } }
        : c));
    }
    logAudit("反応記録", `${cust?.name || "?"} → ${castById[castId]?.name || "?"} ${val === REACT_GOOD ? "◎" : "✗"}`);
  }

  function tryAssign(tableId, castId, customerId) {
    const cust = ts[tableId].customers.find(c => c.id === customerId);
    const cast = castById[castId];
    if ((served[customerId] || []).includes(castId)) { setModal({ type: "ng", msg: `🚫 ${cust.name}さんには既に「${cast.name}」が付いています。同じお客様への重複は絶対NG。` }); return; }
    // キャスト本人が「付きたくない」と申告している相手 → 強制配置しない（無視すると退職に繋がる）
    if (isNgPair(cast, cust)) { setModal({ type: "ng", msg: `🚫 「${cast.name}」は ${cust.name}さんへの接客をNG登録しています。人手不足でも強制配置はしないでください（設定→キャスト設定で変更可）。` }); return; }
    const prof = custProfile(cust);
    // 年代のミスマッチ警告（落ち着いた年配客にハイテンションな新人 等の事故防止）
    if (prof.ageBand && (cast.ageFit || []).length && !cast.ageFit.includes(prof.ageBand)) {
      setModal({ type: "warn", msg: `⚠️ ${cust.name}さんは${prof.ageBand}、「${cast.name}」の得意層は ${cast.ageFit.join("・")} です。相性が合わない可能性があります。それでも付けますか？`, onOk: () => { doAssign(tableId, castId, customerId); setPick(null); } });
      return;
    }
    if (ts[tableId].casts.some(a => a.castId === castId)) { setModal({ type: "warn", msg: `⚠️ 「${cast.name}」はこの卓に既にいます。それでも付けますか？`, onOk: () => { doAssign(tableId, castId, customerId); setPick(null); } }); return; }
    doAssign(tableId, castId, customerId); setPick(null);
  }

  // ---- マイナス営業のリカバリー（他卓からの応援リコール） ----
  // 先に4名様、その後3名・3名と来て空きが尽きる＝マイナス営業。
  // 実際の営業では「今いる子を外して人数合わせ」は無理なので、
  // 他卓で回転の残り時間が少ない子（＝どのみち交代が近い子）を早めに抜いて新しい卓へ回す。
  // 付けたばかりの子は候補の最後に回し、警告を出す。
  const MIN_STAY_MS = 10 * 60000;

  // その子が今の卓であと何ms担当予定か（教科書の時間配分に基づく）
  function rotEndOf(t, a) {
    const at = a.at ?? t.setStart;
    const n = Math.max(0, (served[a.customerId] || []).indexOf(a.castId));
    const schedEnd = (t.setStart || at) + rotWindowEndMin(t.setDuration, n) * 60000;
    return Math.max(schedEnd, at + MIN_STAY_MS);
  }

  function recallCandidates(excludeTableId, forCust) {
    const now = Date.now();
    const out = [];
    Object.entries(ts).forEach(([tid, t]) => {
      if (!t?.active || tid === excludeTableId || !t.setStart) return;
      t.casts.forEach(a => {
        const cast = castById[a.castId];
        if (!cast) return;
        // 同じお客様への重複・本人NGは応援でも不可
        if (forCust && ((served[forCust.id] || []).includes(a.castId) || isNgPair(cast, forCust))) return;
        const at = a.at ?? t.setStart;
        out.push({
          castId: a.castId, name: cast.name, style: cast.style, rank: cast.rank,
          fromTableId: tid,
          fromLabel: tables.find(x => x.id === tid)?.label || tid,
          fromCustName: t.customers.find(c => c.id === a.customerId)?.name || "",
          rotRemainMs: rotEndOf(t, a) - now,           // 交代までの残り
          tableRemainMs: t.setStart + setMinOf(t) * 60000 - now, // その卓の残り時間
          satMs: now - at,                              // 着席してからの経過
          fresh: now - at < MIN_STAY_MS,                // 付けたばかり＝抜くべきでない
          lastOne: t.casts.length <= 1,                 // 抜くとその卓が女の子ゼロ
          // 高額ドリンクを入れた直後に移動させない（教科書の失敗例）
          bigDrink: (t.orders || []).some(o => o.castId === a.castId && (o.price || 0) >= 3000 && now - (o.at || 0) < 20 * 60000),
        });
      });
    });
    // 付けたばかりを後ろへ。それ以外は「交代までの残りが少ない順」＝抜きやすい順
    return out.sort((a, b) =>
      (a.fresh ? 1 : 0) - (b.fresh ? 1 : 0) ||
      (a.lastOne ? 1 : 0) - (b.lastOne ? 1 : 0) ||
      a.rotRemainMs - b.rotRemainMs);
  }

  // 応援を実行: 元の卓から外して新しい卓のお客様へ付ける
  function recallTo(toTableId, cand, customerId) {
    removeCast(cand.fromTableId, cand.castId);
    doAssign(toTableId, cand.castId, customerId);
    const toLabel = tables.find(x => x.id === toTableId)?.label || toTableId;
    logAudit("応援リコール", `${cand.name}: ${cand.fromLabel} → ${toLabel}`);
  }

  // マイナス営業の判定: 全卓で女の子待ちの客数 > 空きキャスト
  const minusInfo = useMemo(() => {
    let need = 0;
    const shortTables = [];
    Object.entries(ts).forEach(([tid, t]) => {
      if (!t?.active) return;
      const assigned = new Set(t.casts.map(a => a.customerId));
      const n = t.customers.filter(c => !assigned.has(c.id)).length;
      if (n > 0) shortTables.push({ tid, label: tables.find(x => x.id === tid)?.label || tid, n });
      need += n;
    });
    return { need, avail: available.length, isMinus: need > available.length, shortTables };
  }, [ts, available, tables]);

  // プラス付け: お客様の人数より多くキャストを付ける（暇な時間帯・新規・太客へのおもてなし）
  function plusAssign(tableId) {
    const t = ts[tableId];
    if (!t?.customers.length) return;
    const nowH = new Date().getHours();
    // ボス（居なければ先頭）に、まだ付いていない中からいちばん合う子を1名追加
    const cust = t.customers.find(c => c.isBoss) || t.customers[0];
    const prof = custProfile(cust);
    const nth = (served[cust.id] || []).length + 1;
    const cand = available.filter(c => !(served[cust.id] || []).includes(c.id) && !isNgPair(c, cust));
    if (!cand.length) { setModal({ type: "ng", msg: "プラス付けできる空きキャストがいません。" }); return; }
    const pick = [...cand].sort((a, b) => castScore(b, cust, t, nth, prof, nowH) - castScore(a, cust, t, nth, prof, nowH))[0];
    doAssign(tableId, pick.id, cust.id);
    logAudit("プラス付け", `${pick.name} → ${cust.name}`);
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

  // ---- 全卓バランス（卓ごとの割当上限） ----
  // 空きキャストが全卓の必要数に足りない時、先に付け回した卓が独り占めすると
  // 後の卓が「客3人に女の子1人」になってしまう。
  // そこで空き分を1人ずつ、「客数に対していちばん女の子が足りない卓」へ順番に配って
  // 卓ごとの上限（quota）を決める。例) 空き4名／卓A客2・卓B客3 → A2名・B2名。
  function castQuotas(poolSize) {
    const state = Object.entries(ts)
      .filter(([, t]) => t?.active && t.customers.length > 0)
      .map(([id, t]) => {
        const assigned = new Set(t.casts.map(a => a.customerId));
        return {
          id,
          need: t.customers.filter(c => !assigned.has(c.id)).length, // まだ誰も付いていない客の数
          have: t.casts.length,
          cust: t.customers.length,
          quota: 0,
        };
      });
    let left = poolSize;
    while (left > 0) {
      const cand = state.filter(s => s.quota < s.need);
      if (!cand.length) break;
      // 手薄な卓（客1人あたりの女の子が少ない卓）から1人ずつ。同率なら大きい卓を優先
      cand.sort((a, b) =>
        ((a.have + a.quota) / a.cust) - ((b.have + b.quota) / b.cust) ||
        b.cust - a.cust);
      cand[0].quota++;
      left--;
    }
    return Object.fromEntries(state.map(s => [s.id, s.quota]));
  }

  function autoTable(tableId) {
    const t = ts[tableId];
    const full = draftPlan(t, available).nowStage;
    if (!full.length) { setModal({ type: "ng", msg: "全員アサイン済み、または空き不足です。" }); return; }
    const quota = castQuotas(available.length)[tableId] ?? full.length;
    const ops = full.slice(0, quota);
    if (!ops.length) {
      setModal({ type: "ng", msg: `空きキャストは他卓の分として確保されています（他卓の方が手薄）。この卓に付けるなら「指名」から手動で選んでください。` });
      return;
    }
    ops.forEach(([cu, ca]) => doAssign(tableId, ca, cu));
    if (ops.length < full.length) {
      setModal({ type: "warn", msg: `⚖️ ${ops.length}名だけ付けました。空きキャストが全卓分に足りないため、残りは他卓へ確保しています（1卓が独占して他が「客3人に1人」になるのを防止）。` });
    }
  }

  // フロアの「⚖️ 全卓バランス付け回し」: 空いている子を全卓へ均等に配る
  function autoAllTables() {
    const quotas = castQuotas(available.length);
    let pool = [...available];
    let assigned = 0;
    const lines = [];
    // 手薄な卓から順に処理（同じプールを奪い合うので順序が結果に効く）
    const order = Object.keys(quotas).sort((a, b) =>
      (ts[a].casts.length / ts[a].customers.length) - (ts[b].casts.length / ts[b].customers.length));
    for (const tid of order) {
      const q = quotas[tid];
      if (!q) continue;
      const ops = draftPlan(ts[tid], pool).nowStage.slice(0, q);
      if (!ops.length) continue;
      ops.forEach(([cu, ca]) => doAssign(tid, ca, cu));
      pool = pool.filter(c => !ops.some(([, ca]) => ca === c.id));
      assigned += ops.length;
      const label = tables.find(x => x.id === tid)?.label || tid;
      lines.push(`${label}: ${ops.map(([, ca]) => castById[ca]?.name).join("・")}`);
    }
    if (!assigned) { setModal({ type: "ng", msg: "配れる空きキャストがいません（全員在卓中 or 未出勤）。" }); return; }
    logAudit("全卓バランス付け回し", `${assigned}名を配置`);
    setModal({ type: "warn", msg: `⚖️ ${assigned}名を各卓へ均等に配置しました。\n\n${lines.join("\n")}` });
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
  const isBottleKind = (k) => k === "champagne" || k === "bottle";
  // ボトルのバック率: 注文に付いた率 → 商品マスタの率 → キャストの既定率 の順で決まる
  const resolveBackPct = (o, cast) => {
    if (o?.backPct != null) return o.backPct;
    const pr = products.find(p => p.id === o?.productId);
    if (pr?.backPct != null) return pr.backPct;
    return cast?.bottleBackPct ?? 0;
  };
  // ボトルバックを受け取るキャスト。その卓の「本指名」で折半。
  // 本指名がいなければ、そのボトルを入れたキャスト本人へ（従来どおり）。
  function bottleRecipients(tableId, o) {
    const t = ts[tableId];
    const mains = (t?.casts || []).filter(a => a.nomType === NOM_MAIN).map(a => a.castId);
    if (mains.length) return [...new Set(mains)];
    return o?.castId ? [o.castId] : [];
  }
  // 総額を人数で割る。1円単位の端数は先頭の人に寄せて合計が必ず一致するようにする。
  function splitYen(total, ids) {
    if (!ids.length) return [];
    const base = Math.floor(total / ids.length);
    let rest = total - base * ids.length;
    return ids.map(id => { const extra = rest > 0 ? 1 : 0; rest -= extra; return { castId: id, yen: base + extra }; });
  }

  // 注文の増減に合わせてキャストのカウンター・ボトルバック実額を増減する
  function applyOrderCounters(o, unit) {
    if (!unit) return;
    if (o?.castId) setCasts(cs => cs.map(c => {
      if (c.id !== o.castId) return c;
      if (o.kind === "drink") return { ...c, drinkCount: Math.max(0, (c.drinkCount || 0) + unit) };
      if (o.kind === "shot") return { ...c, shotCount: Math.max(0, (c.shotCount || 0) + unit) };
      return c;
    }));
    // ボトルは「売った子」に売上、「本指名の子たち」にバックを折半して積む
    if (isBottleKind(o.kind)) {
      const split = o.backSplit || [];
      setCasts(cs => cs.map(c => {
        let n = c;
        if (c.id === o.castId) {
          const sales = (o.price || 0) * unit;
          n = { ...n, bottleSales: Math.max(0, (n.bottleSales || 0) + sales), bottleSalesBacked: Math.max(0, (n.bottleSalesBacked || 0) + sales) };
        }
        const part = split.find(x => x.castId === c.id);
        if (part) n = { ...n, bottleBackYen: Math.max(0, (n.bottleBackYen || 0) + part.yen * unit) };
        return n;
      }));
    }
  }
  const addOrder = (tableId, o) => {
    // 注文時点のバック率を確定して保存（あとで設定を変えても過去の伝票は動かない）
    const cast = o.castId ? castById[o.castId] : null;
    const entry = { ...o, id: "o" + Math.random().toString(36).slice(2, 7), qty: 1, at: Date.now() };
    if (isBottleKind(o.kind)) {
      entry.backPct = resolveBackPct(o, cast);
      const recips = bottleRecipients(tableId, o);
      entry.backSplit = splitYen(Math.round((o.price || 0) * entry.backPct / 100), recips);
    }
    upd(tableId, t => ({ ...t, orders: [...t.orders, entry] }));
    bumpStock(o.productId, -1); // リアルタイム在庫減算
    applyOrderCounters(entry, 1);
  };
  const ordQty = (tableId, oid, d) => {
    const o = ts[tableId]?.orders.find(x => x.id === oid);
    if (o) {
      const delta = Math.max(1, o.qty + d) - o.qty; // 下限1でクランプした実変化量
      bumpStock(o.productId, -delta);
      applyOrderCounters(o, delta); // 本数を変えたらバック額も連動
    }
    upd(tableId, t => ({ ...t, orders: t.orders.map(o2 => o2.id === oid ? { ...o2, qty: Math.max(1, o2.qty + d) } : o2) }));
  };
  const delOrder = (tableId, oid) => {
    const o = ts[tableId]?.orders.find(x => x.id === oid);
    if (o) {
      bumpStock(o.productId, o.qty); // 在庫を戻す
      applyOrderCounters(o, -o.qty); // 取り消した分のバック・カウントも戻す
    }
    upd(tableId, t => ({ ...t, orders: t.orders.filter(o2 => o2.id !== oid) }));
  };
  function openTable(tableId) {
    // setStart: null = 準備中。「▶ セット開始」ボタンでタイマー開始
    setTs(s => ({ ...s, [tableId]: { active: true, sessionId: "s" + Math.random().toString(36).slice(2, 9), setType: 4000, setDuration: 60, setStart: null, payMethod: "cash", extendMin: 0, customers: [], casts: [], seats: [], orders: [] } }));
    logAudit("卓オープン", tables.find(x => x.id === tableId)?.label || tableId);
  }
  function startTable(tableId) {
    const now = Date.now();
    // セット開始と同時に、既に付いているキャストの回転タイマーも開始
    upd(tableId, t => ({ ...t, setStart: now, casts: t.casts.map(a => ({ ...a, at: now })) }));
    logAudit("セット開始", tables.find(x => x.id === tableId)?.label || tableId);
  }
  // ---- 伝票記録 ----
  // 印刷しても会計しても金額が残るように、その時点の明細をまるごと保存する。
  // 同じ卓の同じセッションは上書き更新（印刷を何度押しても増えない）。
  function buildReceipt(tableId, opts = {}) {
    const t = ts[tableId];
    if (!t?.active) return null;
    const ref = tables.find(x => x.id === tableId);
    const label = ref ? dispTable(ref).label : tableId;
    const subtotal = tableTotal(t);
    const tax = tableTax(t);
    const grand = subtotal + tax;
    const fee = tableCardFee(t);
    return {
      id: "rc" + Math.random().toString(36).slice(2, 9),
      sessionId: t.sessionId || `${tableId}-${t.setStart || 0}`,
      at: Date.now(),
      businessDate: businessDateOfNow(),
      storeName: settings.storeName,
      tableLabel: label,
      customerNames: t.customers.map(c => c.name),
      castNames: [...new Set(t.casts.map(a => castById[a.castId]?.name).filter(Boolean))],
      setPrice: t.setType, setCount: t.customers.length, setAmount: t.setType * t.customers.length,
      orders: t.orders.map(o => ({ label: o.label, qty: o.qty, price: o.price, castName: castById[o.castId]?.name || "" })),
      rawSubtotal: tableRawTotal(t),
      subtotal, taxRate: settings.taxRate ?? 10, tax, grand,
      cardFeePct, cardFee: fee, payable: tablePayable(t), roundAdj: tableRoundAdj(t), roundUnit,
      payMethod: t.payMethod || "cash",
      settled: !!opts.settled, // 会計済みか（印刷しただけならfalse）
    };
  }
  function saveReceipt(tableId, opts = {}) {
    const r = buildReceipt(tableId, opts);
    if (!r) return null;
    setReceipts(list => {
      const i = list.findIndex(x => x.sessionId === r.sessionId);
      if (i >= 0) { const n = [...list]; n[i] = { ...r, id: list[i].id }; return n; }
      return [r, ...list].slice(0, 2000);
    });
    return r;
  }

  function closeTable(tableId) {
    const t = ts[tableId]; const total = tableTotal(t);
    saveReceipt(tableId, { settled: true }); // 会計しても金額はデータとして残す
    const tRef = tables.find(x => x.id === tableId);
    const label = tRef ? dispTable(tRef).label : tableId;
    const tax = tableTax(t);
    const grand = total + tax;
    const fee = tableCardFee(t);                 // カード決済サービス料（現金なら0）
    const payable = tablePayable(t);             // 実際にいただいた額（50円単位）
    const adj = payable - (grand + fee);         // 端数調整
    setClosed(c => [...c, { label, total, tax, n: t.customers.length, fee, adj, payable, payMethod: t.payMethod || "cash" }]);
    // LTV: 客名帳連携済みのお客様に税込頭割り額を累積 + 来店履歴
    if (t.customers.length > 0) {
      const share = Math.round(payable / t.customers.length);
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
        ...(fee > 0 ? [{ businessDate: bd, hour, label: "カード決済サービス料", price: fee, qty: 1, cost: 0, productId: null }] : []),
        ...(adj !== 0 ? [{ businessDate: bd, hour, label: "端数調整", price: adj, qty: 1, cost: 0, productId: null }] : []),
      ];
      if (entries.length) setSalesLog(sl => [...entries, ...sl].slice(0, 3000));
    }
    setTs(s => { const n = { ...s }; delete n[tableId]; return n; });
    setSel(null);
    logAudit("会計", `${label} ${yen(payable)}（${t.payMethod === "card" ? `カード・決済サービス料${yen(fee)}込` : "現金"}・${t.customers.length}名)`);
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

      {view === "floor" && <Floor {...{ visibleTables, dispTable, tables, ts, castById, setSel, merges, mergeGroups, toggleMerge, customerBook, reservations, products, advices, autoAllTables, availCount: available.length, minusInfo }} />}
      {view === "stock" && <InventoryView {...{ products, setProducts, salesLog, logAudit, backPresets: settings.bottleBackPresets || [20, 25, 35] }} />}
      {view === "cast" && <CastView {...{ casts, busy, clockIn, clockOut, bumpCastCounter, salaryHistory, salaryAdjust, setSalaryAdjust, settings }} />}
      {view === "sales" && <Sales {...{ receipts, ts, dispTable, tables, tableTotal, tableCardFee, closed, target: settings.target, taxRate: settings.taxRate ?? 10, history, salesLog, salaryHistory, customerBook }} />}
      {view === "book" && <CustomerBookView {...{ customerBook, setCustomerBook, casts, bottleKeeps, setBottleKeeps, reservations, setReservations, storeName: settings.storeName, logAudit }} />}
      {view === "admin" && <Admin {...{ casts, setCasts, resetNight, settings, setSettings, tables, setTables, mergeGroups, setMergeGroups, ts, customerBook, exportData, importData, listAutoBackups, restoreAutoBackup, listRescueData, restoreRescue, auditLog, enterWatch, cloudPass, setCloudPass, cloudInfo, cloudPush, cloudCheck, cloudRestore }} />}

      {sel && tables.find(x => x.id === sel) && (
        <Detail key={sel} {...{
          tableId: sel, t: ts[sel], disp: dispTable(tables.find(x => x.id === sel) || { id: sel, label: sel, cap: 0 }), close: () => setSel(null),
          castById, served, tableTotal, tableTax, tableGrand, taxRate: settings.taxRate ?? 10, openTable, startTable, closeTable, addCustomer, removeCustomer, setBoss, setPref, setSetType, setDur,
          autoTable, autoCustomer, removeCast, moveSeat, setPick, addOrder, ordQty, delOrder, tryAssign,
          reactions, setReaction, plusAssign, availCount: available.length,
          tableCardFee, tablePayable, setPayMethod, cardFeePct, saveReceipt, tableRawTotal, tableRoundAdj, roundUnit,
          setNomType, extendTable,
          backPresets: settings.bottleBackPresets || [20, 25, 35],
          recallCandidates, recallTo, minusInfo, storeName: settings.storeName,
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
  const started = active && !!t.setStart;
  const now = useNow(started);
  const tstate = started ? tstateOf(t, now) : null;
  const red = tstate === "soon" || tstate === "over";
  // 回転警告: 1回転 = セット時間÷3。いずれかのキャストが残3分以内/超過なら表示（開始後のみ）
  const rotMs = started ? (t.setDuration / 3) * 60000 : 0;
  const rotRemains = started ? t.casts.map(a => (a.at ?? t.setStart) + rotMs - now) : [];
  const rotOver = rotRemains.some(r => r <= 0);
  const rotSoon = !rotOver && rotRemains.some(r => r <= 3 * 60000);
  return (
    <button onClick={onClick} style={{ background: active ? "#141418" : "#0d0d10", border: `1.5px solid ${red ? "#a13b3b" : active ? GOLD : "#1c1c22"}`, borderStyle: active && !started ? "dashed" : "solid", boxShadow: red ? "0 0 14px rgba(180,60,60,.35)" : "none" }} className="rounded-2xl p-3 text-left min-h-[120px] flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: active ? "#fff" : "#555", fontFamily: "Georgia,serif" }} className="text-lg font-bold">{disp.label}</span>
        {active ? (
          started ? (
            <span className="flex items-center gap-1.5">
              {(rotOver || rotSoon) && (
                <span style={{ color: rotOver ? "#ff6a6a" : "#e0a84a" }} className="text-[10px] font-bold">♻{rotOver ? "交代!" : "まもなく"}</span>
              )}
              <span style={{ color: red ? "#ff6a6a" : "#9a9aa2" }} className="text-[11px] font-bold flex items-center gap-0.5"><Clock size={11} />{tstate === "over" ? "+" : ""}{fmt(remainOf(t, now))}</span>
            </span>
          ) : (
            <span style={{ color: "#e0a84a" }} className="text-[10px] font-bold">準備中 ▶押して開始</span>
          )
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
            <span className="text-zinc-500">
              客{t.customers.length}
              <span style={{ color: t.casts.length < t.customers.length ? "#e0a84a" : "#71717a" }} className={t.casts.length < t.customers.length ? "font-bold" : ""}>
                {" / 嬢"}{t.casts.length}{t.casts.length < t.customers.length ? " 手薄" : ""}
              </span>
            </span>
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
                      <span style={{ color: t.preparing ? "#e0a84a" : (t.remainMin ?? 99) <= 15 ? "#e0a84a" : "#999" }} className="text-sm font-bold">
                        {t.preparing ? "準備中" : `使用中${t.remainMin != null && t.remainMin > 0 ? ` 残${t.remainMin}分` : t.remainMin != null ? " 延長中" : ""}`}
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

function Floor({ visibleTables, dispTable, tables, ts, castById, setSel, merges, mergeGroups, toggleMerge, customerBook, reservations, products, advices, autoAllTables, availCount, minusInfo }) {
  const groupEntries = Object.entries(mergeGroups || {});
  // 全卓の「まだ女の子が付いていない客」の総数。空きキャストが足りない＝バランス配分の出番
  const totalNeed = Object.values(ts).reduce((s, t) => {
    if (!t?.active) return s;
    const assigned = new Set(t.casts.map(a => a.customerId));
    return s + t.customers.filter(c => !assigned.has(c.id)).length;
  }, 0);
  const activeTableCount = Object.values(ts).filter(t => t?.active && t.customers.length > 0).length;
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
      {minusInfo?.isMinus && (
        <div style={{ background: "rgba(224,85,85,.1)", border: "1px solid #a15050" }} className="rounded-xl p-3 mb-3">
          <div style={{ color: "#ff9a9a" }} className="text-[12px] font-bold mb-1">
            🈵 マイナス営業 — 女の子待ち {minusInfo.need}名 / 空き {minusInfo.avail}名
          </div>
          <p className="text-[10px] text-zinc-400 mb-2 leading-relaxed">
            今いる子を外して人数合わせはしません。卓を開いて「🆘 他卓から応援を呼ぶ」で、
            交代時間が近い子を早めに回してください。
          </p>
          <div className="flex flex-wrap gap-1.5">
            {minusInfo.shortTables.map(s => (
              <button key={s.tid} onClick={() => setSel(s.tid)} style={{ background: "#7a2222", color: "#fff" }} className="text-[11px] rounded-full px-3 py-1.5 font-bold">
                {s.label} 待ち{s.n}名 ▶
              </button>
            ))}
          </div>
        </div>
      )}
      {totalNeed > 0 && activeTableCount >= 1 && (
        <div className="mb-3">
          <button onClick={autoAllTables} style={{ background: GOLD, color: "#000" }} className="w-full rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-1.5">
            <Wand2 size={15} />⚖️ 全卓バランス付け回し
          </button>
          <div className="text-[10px] text-zinc-500 mt-1 text-center">
            空き {availCount}名 / 女の子待ちのお客様 {totalNeed}名
            {availCount < totalNeed && activeTableCount >= 2 && <span style={{ color: "#e0a84a" }} className="font-bold">　※足りないので均等に配分します</span>}
          </div>
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
  const { tableId, t, disp, close, castById, served, tableTotal, tableTax, tableGrand, taxRate, openTable, startTable, closeTable, addCustomer, removeCustomer, setBoss, setPref, setSetType, setDur, autoTable, autoCustomer, removeCast, moveSeat, setPick, addOrder, ordQty, delOrder, tryAssign, castsInTable, customerBook, bottleKeeps, products, nextPlan, reactions, setReaction, plusAssign, availCount, recallCandidates, recallTo, minusInfo, storeName, tableCardFee, tablePayable, setPayMethod, cardFeePct, saveReceipt, backPresets, tableRawTotal, tableRoundAdj, roundUnit, setNomType, extendTable } = p;
  const [chBack, setChBack] = useState(null); // 手入力ボトルのバック率（null=既定）
  const [recallOpen, setRecallOpen] = useState(false); // 他卓からの応援リコール
  const [receiptOpen, setReceiptOpen] = useState(false); // 伝票印刷
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
    setDrinkPick({ label: l, price: +pr, kind: "champagne", backPct: chBack });
    if (chLabelRef.current) chLabelRef.current.value = "";
    if (chPriceRef.current) chPriceRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: "#0a0a0c" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: "#0a0a0c", borderBottom: "1px solid #1c1c22" }}>
        <div className="flex items-center gap-3">
          <button onClick={close}><X size={22} color="#888" /></button>
          <span style={{ fontFamily: "Georgia,serif", color: GOLD }} className="text-xl font-bold">{disp.label}</span>
          {active && (t.setStart ? <DetailClock t={t} /> : <span style={{ color: "#e0a84a" }} className="text-xs font-bold">準備中</span>)}
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
          {!t.setStart && (
            <button onClick={() => startTable(tableId)} style={{ background: GOLD, color: "#000" }} className="w-full rounded-2xl py-4 text-base font-bold shadow-lg">
              ▶ セット開始（タイマースタート）
            </button>
          )}
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

          {/* マイナス営業: 空きが尽きている時は他卓から応援を呼ぶ（今いる子を外して人数合わせはしない） */}
          {(() => {
            const assigned = new Set(t.casts.map(a => a.customerId));
            const waiting = t.customers.filter(c => !assigned.has(c.id));
            if (!waiting.length) return null;
            return (
              <div style={{ background: availCount > 0 ? "#141418" : "rgba(224,85,85,.08)", border: `1px solid ${availCount > 0 ? "#22222a" : "#a15050"}` }} className="rounded-xl p-3">
                <div className="text-[11px] font-bold mb-1" style={{ color: availCount > 0 ? "#e0a84a" : "#ff9a9a" }}>
                  {availCount > 0 ? `女の子待ちのお客様 ${waiting.length}名（空き${availCount}名）` : `🈵 マイナス営業 — 女の子待ち ${waiting.length}名・空きキャスト0名`}
                </div>
                <p className="text-[10px] text-zinc-400 mb-2 leading-relaxed">
                  {availCount > 0 ? "「卓を自動付け回し」で配置できます。" : "他の卓から、交代時間が近い子を早めに抜いて回します。付けたばかりの子は候補の最後に並びます。"}
                </p>
                <button onClick={() => setRecallOpen(true)} style={{ background: "#7a2222", color: "#fff" }} className="w-full rounded-lg py-2.5 text-sm font-bold">
                  🆘 他卓から応援を呼ぶ
                </button>
              </div>
            );
          })()}

          {t.setStart && <RotationPlan t={t} plusAssign={() => plusAssign(tableId)} availCount={availCount} castById={castById} reactions={reactions} tryAssign={(castId, custId) => tryAssign(tableId, castId, custId)} extendTable={(m) => extendTable(tableId, m)} />}

          <Section title="お客様 ＆ 付け回し" right={<button onClick={() => autoTable(tableId)} style={{ background: GOLD, color: "#000" }} className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1"><Wand2 size={12} />卓を自動付け回し</button>}>
            <div className="space-y-2">
              {t.customers.map(cust => {
                const myAssigns = t.casts.filter(a => a.customerId === cust.id);
                const myCasts = myAssigns.map(a => castById[a.castId]).filter(Boolean);
                const pastCasts = (served[cust.id] || [])
                  .filter(id => !myCasts.some(c => c.id === id))
                  .map(id => castById[id]).filter(Boolean);
                const nextCast = nextPlan?.[cust.id] ? castById[nextPlan[cust.id]] : null;
                const servedIds = served[cust.id] || [];
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
                        // 教科書の時間配分: 60分なら 1人目=0分 / 2人目=18分 / 3人目=39分 で交代。
                        // 何人目かでその子の担当終了時刻が決まる（遅れて付いた子には最低10分を保証）。
                        const n = Math.max(0, servedIds.indexOf(c.id));
                        const at = a.at ?? t.setStart;
                        const schedEnd = (t.setStart || at) + rotWindowEndMin(t.setDuration, n) * 60000;
                        const end = Math.max(schedEnd, at + 10 * 60000);
                        const nom = a.nomType || "help";
                        return (
                          <RotationChip key={a.castId} cast={c} at={at} rotMs={end - at} started={!!t.setStart}
                            nth={n + 1} reaction={reactions?.[cust.id]?.[c.id]} onReact={(v) => setReaction(cust.id, c.id, v)}
                            nomType={nom}
                            onNom={() => setNomType(tableId, c.id, NOM_ORDER[(NOM_ORDER.indexOf(nom) + 1) % NOM_ORDER.length])}
                            onRemove={() => removeCast(tableId, c.id)} />
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
                  <button key={pr.id} onClick={() => setDrinkPick({ label: pr.name, price: pr.price, kind: pr.category || "drink", productId: pr.id, backPct: pr.backPct ?? null })} style={{ background: "#141418", border: "1px solid #2a2a32" }} className="rounded-lg py-2 px-2 text-[11px] font-bold text-left">
                    <span className="block truncate">{pr.name}</span>
                    <span className="text-zinc-500">{yen(pr.price)}</span>
                    {pr.backPct != null && <span style={{ color: GOLD }}> ・バック{pr.backPct}%</span>}
                    {pr.lowStockAt != null && (pr.stock || 0) <= pr.lowStockAt && <span style={{ color: "#e0a84a" }}> 残{pr.stock || 0}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 mb-1.5">
              <input ref={chLabelRef} placeholder="シャンパン等" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-2 py-2 outline-none min-w-0" />
              <input ref={chPriceRef} placeholder="価格" inputMode="numeric" enterKeyHint="done" onKeyDown={e => { if (e.key === "Enter") submitChampagne(); }} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="w-24 rounded-lg px-2 py-2 outline-none" />
              <button onClick={submitChampagne} style={{ background: "#22222a", color: GOLD }} className="px-3 rounded-lg text-xs font-bold">追加</button>
            </div>
            {/* 銘柄ごとにバック率が違うので、その場で選べるようにする */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              <span className="text-[10px] text-zinc-500">バック</span>
              <button onClick={() => setChBack(null)} style={{ background: chBack == null ? GOLD : "#1c1c22", color: chBack == null ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">既定</button>
              {(backPresets || []).map(v => (
                <button key={v} onClick={() => setChBack(v)} style={{ background: chBack === v ? GOLD : "#1c1c22", color: chBack === v ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{v}%</button>
              ))}
              <span className="text-[9px] text-zinc-600">よく出す銘柄は 在庫タブの商品マスタに登録すると率が自動で入ります</span>
            </div>
            <div className="space-y-1.5">
              {t.orders.map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{o.label} <span className="text-zinc-500 text-xs">{yen(o.price)}</span>{o.backPct != null && <span style={{ color: GOLD }} className="text-[10px] ml-1">バック{o.backPct}%</span>}</span>
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
              <div className="flex justify-between text-xs text-zinc-400">
                <span>小計</span>
                <span>{yen(tableTotal(t))}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500"><span>消費税 {taxRate}%</span><span>{yen(tableTax(t))}</span></div>

              {/* 支払い方法。カードは手数料を上乗せ */}
              <div className="flex items-center gap-1.5 pt-2">
                <span className="text-[10px] text-zinc-500 w-14">お支払い</span>
                <button onClick={() => setPayMethod(tableId, "cash")}
                  style={{ background: (t.payMethod || "cash") === "cash" ? GOLD : "#1c1c22", color: (t.payMethod || "cash") === "cash" ? "#000" : "#888" }}
                  className="flex-1 rounded-lg py-1.5 text-xs font-bold">💴 現金</button>
                <button onClick={() => setPayMethod(tableId, "card")}
                  style={{ background: t.payMethod === "card" ? GOLD : "#1c1c22", color: t.payMethod === "card" ? "#000" : "#888" }}
                  className="flex-1 rounded-lg py-1.5 text-xs font-bold">💳 カード（+{cardFeePct}%）</button>
              </div>

              {tableCardFee(t) > 0 && (
                <div className="flex justify-between text-xs" style={{ color: "#e0a84a" }}>
                  <span>カード決済サービス料 {cardFeePct}%</span><span>{yen(tableCardFee(t))}</span>
                </div>
              )}
              {tableRoundAdj(t) !== 0 && (
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>端数調整（合計を{roundUnit}円単位に繰り上げ）</span><span>+{yen(tableRoundAdj(t))}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-[#2a2a32] mt-1">
                <span className="text-sm text-zinc-300 font-bold">{t.payMethod === "card" ? "カードご請求額" : "お会計（税込）"}</span>
                <span style={{ color: GOLD }} className="text-2xl font-bold">{yen(tablePayable(t))}</span>
              </div>
            </div>
            <button onClick={() => { const r = saveReceipt(tableId); if (r) setReceiptOpen(r); }} style={{ background: "#22222a", color: GOLD, border: `1px solid ${GOLD}` }} className="w-full rounded-lg py-2.5 text-sm font-bold mt-3">
              🧾 伝票を印刷する
            </button>
            <p className="text-[10px] text-zinc-600 mt-1.5 text-center">印刷しても金額は保存されます（売上タブ →「🧾 伝票」）</p>
          </div>
        </div>
      )}

      {recallOpen && (
        <RecallPicker
          t={t} tableId={tableId} label={disp.label}
          recallCandidates={recallCandidates} recallTo={recallTo}
          castById={castById} served={served}
          onClose={() => setRecallOpen(false)}
        />
      )}

      {receiptOpen && <ReceiptModal r={receiptOpen} onClose={() => setReceiptOpen(false)} />}

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
                  <div className="text-[10px] text-zinc-500">
                    {drink.kind === "champagne" || drink.kind === "bottle"
                      ? (() => { const pct = drink.backPct ?? c.bottleBackPct ?? 0; return `バック ${pct}% = ¥${Math.round((drink.price || 0) * pct / 100).toLocaleString("ja-JP")}`; })()
                      : `バック ¥${(drink.kind === "shot" ? c.shotBack : c.drinkBack) || 0}`}
                  </div>
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
// 他卓からの応援リコール（マイナス営業のリカバリー）
// 交代時間が近い子＝どのみち抜ける子から順に並べる。付けたばかりの子は最後＋警告。
function RecallPicker({ t, tableId, label, recallCandidates, recallTo, castById, served, onClose }) {
  useNow(true); // 残り時間を毎秒更新
  const [warn, setWarn] = useState(null); // 確認待ちの候補
  const assigned = new Set(t.casts.map(a => a.customerId));
  // 付ける相手＝まだ女の子が付いていない客のうち、これまでの「質」がいちばん低い人（公平ドラフトと同じ考え方）
  const waiting = t.customers.filter(c => !assigned.has(c.id));
  const qual = (c) => Math.max(0, ...((served[c.id] || []).map(id => castById[id]?.score || 0)));
  const target = [...waiting].sort((a, b) => qual(a) - qual(b) || (b.isBoss ? 1 : 0) - (a.isBoss ? 1 : 0))[0];
  const cands = target ? recallCandidates(tableId, target) : [];
  const mins = (ms) => Math.max(0, Math.ceil(ms / 60000));

  function go(c) {
    if ((c.fresh || c.lastOne || c.bigDrink) && warn !== c.castId) { setWarn(c.castId); return; }
    recallTo(tableId, c, target.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,.75)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#141418", border: `1px solid ${GOLD}` }} className="rounded-t-2xl p-4 w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold">🆘 {label} へ応援を呼ぶ</h3>
          <button onClick={onClose}><X size={18} color="#888" /></button>
        </div>
        {!target ? (
          <p className="text-xs text-zinc-500 py-6 text-center">この卓は全員に女の子が付いています。</p>
        ) : (
          <>
            <p className="text-[11px] text-zinc-400 mb-3">
              <span style={{ color: GOLD }} className="font-bold">{target.name}さん</span> に付けます。
              交代時間が近い子（＝どのみち抜ける子）から順に並んでいます。
            </p>
            {cands.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">他の卓にも回せる子がいません。</p>
            ) : (
              <div className="space-y-2">
                {cands.map(c => {
                  const risky = c.fresh || c.lastOne || c.bigDrink;
                  const confirming = warn === c.castId;
                  return (
                    <button key={c.castId} onClick={() => go(c)}
                      style={{
                        background: confirming ? "#7a2222" : risky ? "#161013" : "#0d0d10",
                        border: `1px solid ${confirming ? "#a13b3b" : risky ? "#5a4422" : TEAL}`,
                      }} className="w-full rounded-xl p-3 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{c.name}
                          <span style={{ color: STYLE_COLOR[c.style] }} className="text-[10px] ml-1.5">{c.style}</span>
                          <span style={{ color: RANK_COLOR[c.rank] }} className="text-[10px] ml-1">{c.rank}</span>
                        </span>
                        <span style={{ color: c.rotRemainMs <= 0 ? "#ff6a6a" : c.rotRemainMs <= 5 * 60000 ? "#e0a84a" : "#8a8a92" }} className="text-[11px] font-bold">
                          {c.rotRemainMs <= 0 ? "交代時間 超過" : `交代まで ${mins(c.rotRemainMs)}分`}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {c.fromLabel} の {c.fromCustName}さんに着席中 ・ 着席 {mins(c.satMs)}分 ・ 卓の残り {mins(c.tableRemainMs)}分
                      </div>
                      {risky && (
                        <div style={{ color: confirming ? "#fff" : "#e0a84a" }} className="text-[10px] font-bold mt-1">
                          {confirming ? "⚠ もう一度タップで確定" : [
                            c.fresh ? "付けたばかり" : null,
                            c.lastOne ? "抜くとその卓が女の子ゼロ" : null,
                            c.bigDrink ? "高額ドリンクを入れた直後" : null,
                          ].filter(Boolean).join(" / ")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 伝票印刷（サーマルレシート幅）。感熱紙 58mm / 80mm を切り替え可能。
// 伝票の記録一覧。印刷しても会計しても金額は残り、ここから見直し・再印刷できる。
function ReceiptHistory({ receipts }) {
  const [open, setOpen] = useState(null);
  const list = receipts || [];
  const byDate = {};
  list.forEach(r => { (byDate[r.businessDate] = byDate[r.businessDate] || []).push(r); });
  const dates = Object.keys(byDate).sort().reverse();

  function csv() {
    const head = "日時,営業日,卓,人数,お客様,小計,消費税,税込,カード決済サービス料,お預り合計,支払方法,担当,状態";
    const rows = list.map(r => [
      new Date(r.at).toLocaleString("ja-JP"), r.businessDate, r.tableLabel, r.setCount,
      `"${r.customerNames.join(" / ")}"`, r.subtotal, r.tax, r.grand, r.cardFee, r.payable,
      r.payMethod === "card" ? "カード" : "現金", `"${r.castNames.join(" / ")}"`,
      r.settled ? "会計済" : "接客中",
    ].join(","));
    csvDownload(`伝票_${businessDateOfNow()}.csv`, head, rows);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold">伝票の記録</h2>
          <p className="text-[11px] text-zinc-500">印刷・会計した伝票が全部残ります（{list.length}件）</p>
        </div>
        {list.length > 0 && (
          <button onClick={csv} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="text-xs px-3 py-2 rounded-lg font-bold">📄 CSV</button>
        )}
      </div>
      {list.length === 0 && (
        <p className="text-center text-zinc-600 text-sm py-12">まだ伝票がありません。<br />卓の「🧾 伝票を印刷する」か会計をすると記録されます。</p>
      )}
      {dates.map(d => (
        <div key={d} className="mb-4">
          <div className="text-[11px] text-zinc-500 mb-1.5">{d}（{byDate[d].length}件 / 合計 {yen(byDate[d].reduce((s, r) => s + r.payable, 0))}）</div>
          <div className="space-y-2">
            {byDate[d].sort((a, b) => b.at - a.at).map(r => (
              <button key={r.id} onClick={() => setOpen(r)} style={{ background: "#141418", border: `1px solid ${r.settled ? "#22222a" : "#7a5a1a"}` }} className="w-full rounded-xl p-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span style={{ fontFamily: "Georgia,serif", color: GOLD }} className="text-base font-bold">{r.tableLabel}</span>
                    <span className="text-[11px] text-zinc-500">{new Date(r.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} ・ {r.setCount}名</span>
                    {!r.settled && <span style={{ color: "#e0a84a" }} className="text-[9px] font-bold">接客中</span>}
                  </span>
                  <span style={{ color: GOLD }} className="text-lg font-bold">{yen(r.payable)}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {r.customerNames.join(" / ") || "（お客様名なし）"}
                  {r.payMethod === "card" && <span style={{ color: "#e0a84a" }}> ・💳カード（サービス料 {yen(r.cardFee)}）</span>}
                </div>
                {r.castNames.length > 0 && <div className="text-[10px] text-zinc-600 mt-0.5">担当: {r.castNames.join("・")}</div>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {open && <ReceiptModal r={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// 伝票（サーマルレシート幅 58mm/80mm）。保存済みの伝票記録 r をそのまま描画するので、
// 印刷後・会計後でも同じ内容を何度でも出し直せる。
function ReceiptModal({ r, onClose }) {
  const [w, setW] = useState(58);
  const stamp = new Date(r.at).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const line = { display: "flex", justifyContent: "space-between", gap: "2mm" };
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,.85)" }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-paper, #receipt-paper * { visibility: visible !important; }
          #receipt-paper { position: absolute !important; left: 0; top: 0; margin: 0 !important; box-shadow: none !important; }
          @page { size: ${w}mm auto; margin: 3mm; }
        }
      `}</style>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: "#0a0a0c", borderBottom: "1px solid #1c1c22" }}>
        <button onClick={onClose}><X size={22} color="#888" /></button>
        <div className="flex gap-2">
          {[58, 80].map(v => (
            <button key={v} onClick={() => setW(v)} style={{ background: w === v ? GOLD : "#1c1c22", color: w === v ? "#000" : "#888" }} className="text-xs px-3 py-1.5 rounded-lg font-bold">{v}mm</button>
          ))}
        </div>
        <button onClick={() => window.print()} style={{ background: GOLD, color: "#000" }} className="text-sm px-4 py-1.5 rounded-lg font-bold">🖨 印刷</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex justify-center">
        <div id="receipt-paper" style={{
          width: `${w}mm`, background: "#fff", color: "#000", padding: "4mm 3mm",
          fontFamily: '"Hiragino Sans", system-ui, sans-serif', fontSize: w === 58 ? "9pt" : "10pt", lineHeight: 1.5,
        }}>
          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: w === 58 ? "12pt" : "14pt", letterSpacing: "0.1em", marginBottom: "2mm" }}>
            {r.storeName || "当店"}
          </div>
          <div style={{ textAlign: "center", fontSize: "8pt", marginBottom: "2mm" }}>領 収 書</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          <div style={line}><span>{r.tableLabel}</span><span>{r.setCount}名様</span></div>
          <div style={{ fontSize: "8pt" }}>{stamp}</div>
          {r.customerNames.length > 0 && (
            <div style={{ fontSize: "8pt", marginTop: "1mm" }}>{r.customerNames.join(" / ")} 様</div>
          )}
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          <div style={line}>
            <span>セット {yen(r.setPrice)}×{r.setCount}</span>
            <span>{yen(r.setAmount)}</span>
          </div>
          {r.orders.map((o, i) => (
            <div key={i}>
              <div style={line}>
                <span>{o.label}{o.qty > 1 ? ` ×${o.qty}` : ""}</span>
                <span>{yen(o.price * o.qty)}</span>
              </div>
              {o.castName && <div style={{ fontSize: "7pt", paddingLeft: "2mm" }}>（{o.castName}）</div>}
            </div>
          ))}
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          <div style={line}><span>小計</span><span>{yen(r.subtotal)}</span></div>
          <div style={line}><span>消費税 {r.taxRate}%</span><span>{yen(r.tax)}</span></div>
          {r.cardFee > 0 && (
            <div style={line}><span>カード決済サービス料 {r.cardFeePct}%</span><span>{yen(r.cardFee)}</span></div>
          )}
          {!!r.roundAdj && (
            <div style={line}><span>端数調整</span><span>+{yen(r.roundAdj)}</span></div>
          )}
          <div style={{ ...line, fontWeight: "bold", fontSize: w === 58 ? "12pt" : "14pt", marginTop: "1mm", borderTop: "2px solid #000", paddingTop: "1mm" }}>
            <span>合計</span><span>{yen(r.payable)}</span>
          </div>
          <div style={{ ...line, fontSize: "8pt" }}>
            <span>お支払い</span><span>{r.payMethod === "card" ? "クレジットカード" : "現金"}</span>
          </div>
          {r.castNames.length > 0 && (
            <>
              <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
              <div style={{ fontSize: "8pt" }}>担当: {r.castNames.join(" / ")}</div>
            </>
          )}
          <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />
          <div style={{ textAlign: "center", fontSize: "8pt" }}>ありがとうございました</div>
          <div style={{ textAlign: "center", fontSize: "7pt", marginTop: "1mm" }}>またのご来店をお待ちしております</div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 text-center pb-3 px-4">
        この伝票は保存されています。売上タブ →「🧾 伝票」からいつでも見直し・再印刷できます。
      </p>
    </div>
  );
}

// 接客プラン: 教科書の時間配分（1人目0分/2人目15〜20分/3人目35〜40分）を可視化し、
// セット終了5〜10分前の延長クロージングを促す。プラス付けもここから。
function RotationPlan({ t, plusAssign, availCount, castById, reactions, tryAssign, extendTable }) {
  const now = useNow(true);
  const elapsedMin = Math.max(0, Math.floor((now - t.setStart) / 60000));
  const remainMin = Math.ceil((t.setStart + setMinOf(t) * 60000 - now) / 60000);
  const sched = rotationSchedule(t.setDuration);
  const closing = remainMin <= 10 && remainMin > 0;   // 延長交渉の準備タイム
  const urgent = remainMin <= 5 && remainMin > 0;     // 延長交渉そのもの
  // 反応◎だった子（＝場内指名の最有力）で、今この卓にいない子
  const inTable = new Set(t.casts.map(a => a.castId));
  const favs = [];
  t.customers.forEach(cu => {
    Object.entries(reactions?.[cu.id] || {}).forEach(([cid, v]) => {
      if (v === REACT_GOOD && !inTable.has(cid) && castById[cid]) favs.push({ cast: castById[cid], custId: cu.id, custName: cu.name });
    });
  });
  const canPlus = availCount > 0;
  const mains = t.casts.filter(a => a.nomType === "main");
  const fields = t.casts.filter(a => a.nomType === "field");
  const nameOf = (a) => castById[a.castId]?.name || "?";
  return (
    <div style={{ background: closing ? "rgba(224,168,74,.08)" : "#141418", border: `1px solid ${closing ? "#7a5a1a" : "#22222a"}` }} className="rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-zinc-400">接客プラン（交代の目安）</span>
        <span className="text-[10px] text-zinc-500">経過 {elapsedMin}分 / 残り {remainMin > 0 ? `${remainMin}分` : "超過"}</span>
      </div>
      <div className="flex items-center gap-1 mb-2">
        {sched.map((m, i) => {
          const passed = elapsedMin >= m;
          const isNow = passed && (i + 1 >= sched.length || elapsedMin < sched[i + 1]);
          return (
            <div key={i} className="flex-1 text-center">
              <div style={{ height: 4, background: isNow ? GOLD : passed ? "#4a4a52" : "#22222a" }} className="rounded-full mb-1" />
              <div style={{ color: isNow ? GOLD : "#6a6a72" }} className="text-[9px] font-bold">{i + 1}人目 {m}分〜</div>
            </div>
          );
        })}
      </div>
      {closing && (
        <div style={{ background: urgent ? "rgba(224,85,85,.12)" : "transparent", border: `1px dashed ${urgent ? "#a15050" : "#7a5a1a"}` }} className="rounded-lg p-2 mb-2">
          <div style={{ color: urgent ? "#ff9a9a" : "#e0a84a" }} className="text-[11px] font-bold mb-1">
            {urgent ? "⏰ 今すぐ延長交渉を！" : "⏰ 延長クロージングの時間です（残り10分）"}
          </div>
          <div className="text-[10px] text-zinc-400 leading-relaxed">
            反応◎の子・延長に強い子を席に入れてから交渉。ドリンクの残量を見てタイミングを計ってください。
          </div>
          {favs.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {favs.slice(0, 4).map((f, i) => (
                <button key={i} onClick={() => tryAssign(f.cast.id, f.custId)} style={{ background: "rgba(201,166,78,.15)", border: `1px solid ${GOLD}`, color: GOLD }} className="text-[10px] rounded-full px-2 py-0.5 font-bold">
                  ◎ {f.cast.name} を {f.custName}さんへ
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ボトルバックの行き先。本指名で折半、いなければ入れた子へ */}
      <div style={{ background: "#0d0d10", border: "1px solid #22222a" }} className="rounded-lg p-2 mb-2">
        <div className="text-[10px] text-zinc-500 mb-1">🍾 ボトルバックの行き先</div>
        {mains.length ? (
          <div className="text-[11px]" style={{ color: GOLD }}>
            <b>{mains.map(nameOf).join("・")}</b>
            <span className="text-zinc-500">{mains.length > 1 ? ` の${mains.length}名で折半` : " に全額"}</span>
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500">本指名がいないので、ボトルを入れた子に付きます</div>
        )}
        {fields.length > 0 && (
          <div className="text-[10px] text-zinc-500 mt-1">
            場内: {fields.map(nameOf).join("・")} — 延長すると本指名になり折半に加わります
          </div>
        )}
        <div className="text-[9px] text-zinc-600 mt-1">チップの「本/場内/ヘルプ」をタップして切替</div>
      </div>

      {/* 延長: 場内→本指名に昇格させ、以降のボトルバックを全員で折半 */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-500">延長</span>
        {[30, 60].map(m => (
          <button key={m} onClick={() => extendTable(m)} style={{ background: "#22222a", color: GOLD, border: `1px solid ${GOLD}` }} className="text-[11px] rounded-lg px-3 py-1.5 font-bold">＋{m}分</button>
        ))}
        {(t.extendMin || 0) > 0 && <span style={{ color: GOLD }} className="text-[10px] font-bold">延長中 +{t.extendMin}分</span>}
      </div>

      <button onClick={plusAssign} disabled={!canPlus}
        style={{ background: canPlus ? "#22222a" : "#141418", color: canPlus ? TEAL : "#4a4a52", border: `1px solid ${canPlus ? TEAL : "#2a2a32"}` }}
        className="w-full rounded-lg py-2 text-[11px] font-bold">
        ＋ プラス付け（客数より多く付ける）{canPlus ? `　空き${availCount}名` : "　空きなし"}
      </button>
    </div>
  );
}

function RotationChip({ cast, at, rotMs, started = true, onRemove, nth, reaction, onReact, nomType, onNom }) {
  const now = useNow(started);
  // 反応ボタン（◎/✗）— お客様の反応を見極めて場内指名・延長に繋ぐための記録
  const React2 = () => onReact ? (
    <>
      <button onClick={() => onReact(REACT_GOOD)} style={{ opacity: reaction === REACT_GOOD ? 1 : 0.35 }} className="text-[10px] leading-none px-0.5" title="相性◎">◎</button>
      <button onClick={() => onReact(REACT_BAD)} style={{ opacity: reaction === REACT_BAD ? 1 : 0.35 }} className="text-[10px] leading-none px-0.5" title="合わない">✗</button>
    </>
  ) : null;
  const numBadge = nth ? <span className="text-[8px] opacity-60">{nth}人目</span> : null;
  // 指名バッジ。タップで ヘルプ→場内→本 と切り替わる。本指名だけボトルバックの折半対象。
  const nomBadge = onNom ? (
    <button onClick={onNom} title="タップで 本指名/場内/ヘルプ を切替"
      style={{ background: nomType === "main" ? GOLD : nomType === "field" ? TEAL : "#2a2a32", color: nomType === "help" ? "#9a9aa2" : "#000" }}
      className="text-[8px] rounded px-1 font-bold leading-tight">{NOM_LABEL[nomType] || "ヘルプ"}</button>
  ) : null;
  if (!started || !at) {
    // セット開始前: タイマーなしの待機チップ
    return (
      <span style={{ background: "rgba(63,182,176,.15)", border: `1px solid ${TEAL}`, color: "#a8e6e2" }} className="text-[11px] rounded-full pl-2 pr-1 py-0.5 font-bold flex items-center gap-1">
        今 {cast.name}{numBadge}{nomBadge}
        <span className="text-[9px] opacity-70">待機</span>
        <React2 />
        <button onClick={onRemove}><X size={11} /></button>
      </span>
    );
  }
  const remain = Math.min(at + rotMs - now, rotMs); // now が at より最大1秒遅れても「残21分」と出ないように上限クランプ
  const over = remain <= 0;
  const soon = !over && remain <= 3 * 60000;
  const good = reaction === REACT_GOOD;
  const color = over ? "#ff6a6a" : soon ? "#e0a84a" : good ? GOLD : TEAL;
  const bg = over ? "rgba(224,85,85,.12)" : soon ? "rgba(224,168,74,.12)" : good ? "rgba(201,166,78,.18)" : "rgba(63,182,176,.15)";
  const fg = over ? "#ffb3b3" : soon ? "#f0cf9a" : good ? "#e8d29a" : "#a8e6e2";
  return (
    <span style={{ background: bg, border: `1px solid ${color}`, color: fg }} className="text-[11px] rounded-full pl-2 pr-1 py-0.5 font-bold flex items-center gap-1">
      今 {cast.name}{numBadge}{nomBadge}
      <span className="text-[9px] opacity-90">{over ? "交代!" : `残${Math.ceil(remain / 60000)}分`}</span>
      <React2 />
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
        <p className="text-[10px] text-zinc-600 mb-3">※ ジャンル一致を上に表示。接客スタイルは「済」と違うタイプを選ぶと新しい魅力を提示できます。</p>
        <div className="grid grid-cols-2 gap-2">
          {list.sort((a, b) => (b.genres.includes(cust?.pref) ? 1 : 0) - (a.genres.includes(cust?.pref) ? 1 : 0)).map(c => {
            const ng = (served[cust.id] || []).includes(c.id);
            const ngPair = !!(cust?.customerBookId && (c.ngCustomerIds || []).includes(cust.customerBookId));
            const here = inTable.has(c.id);
            const match = c.genres.includes(cust?.pref);
            const usedStyle = (served[cust.id] || []).some(id => casts.find(x => x.id === id)?.style === c.style);
            const blocked = ng || ngPair;
            return (
              <button key={c.id} onClick={() => tryAssign(pick.tableId, c.id, pick.customerId)} disabled={blocked}
                style={{ background: blocked ? "#161013" : "#141418", border: `1px solid ${blocked ? "#5a2222" : match ? TEAL : "#22222a"}`, opacity: blocked ? 0.55 : 1 }} className="rounded-xl p-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{c.name}</span>
                  {ngPair ? <span style={{ color: "#e05555" }} className="text-[9px] font-bold">本人NG</span>
                    : ng ? <span style={{ color: "#e05555" }} className="text-[9px] font-bold">NG重複</span>
                      : here ? <span style={{ color: "#e0a84a" }} className="text-[9px] font-bold">在卓⚠</span> : null}
                </div>
                <div className="flex gap-1 mt-1 flex-wrap items-center">
                  <span style={{ background: STYLE_COLOR[c.style] || "#333", color: "#000", opacity: usedStyle ? 0.4 : 1 }} className="text-[9px] rounded px-1 font-bold">{c.style}{usedStyle ? "(済)" : ""}</span>
                  <span style={{ color: RANK_COLOR[c.rank] || "#888", border: `1px solid ${RANK_COLOR[c.rank] || "#444"}` }} className="text-[9px] rounded px-1 font-bold">{c.rank}</span>
                  {c.genres.map(g => <span key={g} style={{ color: GENRE_COLOR[g], border: `1px solid ${GENRE_COLOR[g]}` }} className="text-[9px] rounded px-1">{g}</span>)}
                </div>
                {(c.strengths || []).length > 0 && (
                  <div className="text-[8px] text-zinc-500 mt-0.5">{c.strengths.join("・")}</div>
                )}
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

// 開店前の情報整理: その日の出勤キャストをレベル別・タイプ別に並べて全体像を掴む
// （教科書「開店前に出勤キャバ嬢の人数・タイプ・レベルを分類しておく」）
function RosterBrief({ casts }) {
  const [open, setOpen] = useState(false);
  const on = casts.filter(c => c.status === "出勤");
  if (!on.length) return null;
  const byRank = RANKS.map(r => [r, on.filter(c => c.rank === r)]).filter(([, a]) => a.length);
  const byStyle = STYLES.map(s => [s, on.filter(c => c.style === s)]).filter(([, a]) => a.length);
  const missing = STYLES.filter(s => !on.some(c => c.style === s));
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(o => !o)} style={{ background: "#141418", border: "1px solid #22222a", color: GOLD }} className="w-full rounded-xl py-2 text-[11px] font-bold">
        {open ? "▲ 閉じる" : `📋 開店前チェック — 出勤${on.length}名のタイプ構成を見る`}
      </button>
      {open && (
        <div style={{ background: "#0d0d10", border: "1px solid #22222a" }} className="rounded-xl p-3 mt-2 space-y-2.5">
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">接客レベル</div>
            <div className="space-y-1">
              {byRank.map(([r, arr]) => (
                <div key={r} className="flex items-start gap-2">
                  <span style={{ background: RANK_COLOR[r], color: "#000" }} className="text-[10px] rounded px-1.5 font-bold shrink-0">{r}</span>
                  <span className="text-[11px] text-zinc-300">{arr.map(c => c.name).join("・")}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">接客スタイル（異なるタイプを順に付けるための組み合わせ）</div>
            <div className="space-y-1">
              {byStyle.map(([s, arr]) => (
                <div key={s} className="flex items-start gap-2">
                  <span style={{ background: STYLE_COLOR[s], color: "#000" }} className="text-[10px] rounded px-1.5 font-bold shrink-0">{s}</span>
                  <span className="text-[11px] text-zinc-300">{arr.map(c => c.name).join("・")}</span>
                </div>
              ))}
            </div>
            {missing.length > 0 && (
              <div style={{ color: "#e0a84a" }} className="text-[10px] mt-1.5 font-bold">
                ⚠ 今夜いないタイプ: {missing.join("・")} — 変化をつけた付け回しがしづらくなります
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">強み</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {STRENGTHS.map(st => {
                const arr = on.filter(c => (c.strengths || []).includes(st));
                if (!arr.length) return null;
                return <span key={st} className="text-[10px]"><span style={{ color: GOLD }} className="font-bold">{st}:</span> <span className="text-zinc-400">{arr.map(c => c.name).join("・")}</span></span>;
              })}
            </div>
          </div>
          <p className="text-[9px] text-zinc-600">※ レベル・スタイル・強みは 設定タブ →「キャスト設定」で編集できます</p>
        </div>
      )}
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

      <RosterBrief casts={casts} />

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
            <span className="text-[10px]" style={{ color: GOLD }}>→ バック ¥{(((c.bottleBackYen || 0) + Math.round(Math.max(0, (c.bottleSales || 0) - (c.bottleSalesBacked || 0)) * c.bottleBackPct / 100))).toLocaleString("ja-JP")}</span>
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
          {b.bottleBack > 0 && <SalaryLine l={`ボトルバック（売上 ¥${(cast.bottleSales || 0).toLocaleString()}・銘柄ごとの率で計算）`} v={b.bottleBack} />}
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

function Sales({ receipts, ts, dispTable, tables, tableTotal, tableCardFee, closed, target, taxRate, history, salesLog, salaryHistory, customerBook }) {
  const [tab, setTab] = useState("today");
  const TabBtn = ({ k, children }) => (
    <button onClick={() => setTab(k)} style={{ background: tab === k ? GOLD : "#141418", color: tab === k ? "#000" : "#888", border: `1px solid ${tab === k ? GOLD : "#22222a"}` }} className="flex-1 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1">{children}</button>
  );
  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <TabBtn k="today">今日</TabBtn>
        <TabBtn k="history"><CalendarDays size={13} />履歴</TabBtn>
        <TabBtn k="receipt">🧾 伝票</TabBtn>
        <TabBtn k="bi">📊 分析</TabBtn>
      </div>
      {tab === "today" && <SalesToday ts={ts} dispTable={dispTable} tables={tables} tableTotal={tableTotal} tableCardFee={tableCardFee} closed={closed} target={target} taxRate={taxRate} />}
      {tab === "history" && <SalesHistory history={history} />}
      {tab === "receipt" && <ReceiptHistory receipts={receipts} />}
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
        <button onClick={() => csvDownload(`売上日別_${businessDateOfNow()}.csv`, "日付,税抜売上,消費税,税込,カード決済サービス料,お預り合計,会計卓数", (history || []).map(h => [h.businessDate, h.subtotal, h.tax, h.grand, h.cardFee || 0, h.grand + (h.cardFee || 0), h.tableCount].join(",")))} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="flex-1 rounded-lg py-2 text-xs font-bold">📄 日別売上CSV</button>
        <button onClick={() => csvDownload(`顧客_${businessDateOfNow()}.csv`, "名前,来店回数,累計利用額,最終来店", (customerBook || []).map(c => [c.name, c.visits || 0, c.totalSpent || 0, c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString("ja-JP") : ""].join(",")))} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="flex-1 rounded-lg py-2 text-xs font-bold">📄 顧客CSV</button>
      </div>
    </div>
  );
}

function SalesToday({ ts, dispTable, tables, tableTotal, tableCardFee, closed, target, taxRate }) {
  const rows = [
    ...Object.entries(ts).filter(([, t]) => t?.active).map(([id, t]) => {
      const ref = tables.find(x => x.id === id);
      return { label: ref ? dispTable(ref).label : id, total: tableTotal(t), n: t.customers.length, live: true };
    }),
    ...closed.map(c => ({ ...c, live: false })),
  ].sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const totalTax = Math.round(total * (taxRate ?? 10) / 100);
  const grand = total + totalTax;
  // カード決済サービス料（会計済み分＋接客中の卓でカードを選んでいる分）
  const cardFee = closed.reduce((s, r) => s + (r.fee || 0), 0)
    + Object.values(ts).filter(t => t?.active).reduce((s, t) => s + (tableCardFee ? tableCardFee(t) : 0), 0);
  const pct = target > 0 ? Math.min(100, Math.round(total / target * 100)) : 0;
  return (
    <>
      <p className="text-xs text-zinc-500 mb-1">本日の売上 ・ {new Date().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })}</p>
      <div style={{ background: "linear-gradient(180deg,#f3e2a0,#c9a64e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }} className="text-5xl font-bold">{yen(total)}</div>
      <p className="text-xs text-zinc-500 mb-1">税込 {yen(grand)}（内税 {yen(totalTax)}）</p>
      {cardFee > 0 && (
        <p className="text-xs mb-4" style={{ color: "#e0a84a" }}>💳 カード決済サービス料 {yen(cardFee)} ・ お預り合計 {yen(grand + cardFee)}</p>
      )}
      {cardFee === 0 && <div className="mb-4" />}
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
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">年代（付け回しの相性判定に使用）</div>
            <div className="flex gap-1.5 flex-wrap">
              {AGE_BANDS.map(a => (
                <button key={a} onClick={() => setC(x => ({ ...x, ageBand: x.ageBand === a ? "" : a }))} style={{ background: c.ageBand === a ? TEAL : "#1c1c22", color: c.ageBand === a ? "#000" : "#888" }} className="text-[11px] rounded-full px-2.5 py-0.5 font-bold">{a}</button>
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

function Admin({ casts, setCasts, resetNight, settings, setSettings, tables, setTables, mergeGroups, setMergeGroups, ts, customerBook, exportData, importData, listAutoBackups, restoreAutoBackup, listRescueData, restoreRescue, auditLog, enterWatch, cloudPass, setCloudPass, cloudInfo, cloudPush, cloudCheck, cloudRestore }) {
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
      <a href="https://takayasuuchida.github.io/spectralayers/manual.html" target="_blank" rel="noreferrer"
        style={{ background: "rgba(201,166,78,.1)", border: `1px solid ${GOLD}`, color: GOLD }}
        className="block w-full rounded-xl py-3 text-center text-sm font-bold">📖 使い方ガイド（説明書）を開く</a>

      <div>
        <h2 className="text-lg font-bold mb-1">店舗設定</h2>
        <p className="text-xs text-zinc-500 mb-3">店名・売上目標。すべて自動保存されます。</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">店名</span>
            <input value={settings.storeName} onChange={e => setSettings(s => ({ ...s, storeName: e.target.value }))} placeholder="vivace" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">売上目標</span>
            <input type="number" value={settings.target} onChange={e => setSettings(s => ({ ...s, target: +e.target.value || 0 }))} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
            <span className="text-xs text-zinc-500">円</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">消費税</span>
            <input type="number" value={settings.taxRate ?? 10} onChange={e => setSettings(s => ({ ...s, taxRate: Math.max(0, +e.target.value || 0) }))} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
            <span className="text-xs text-zinc-500">%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">カード<br />手数料</span>
            <input type="number" value={settings.cardFeePct ?? 10} onChange={e => setSettings(s => ({ ...s, cardFeePct: Math.max(0, +e.target.value || 0) }))} style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
            <span className="text-xs text-zinc-500">%</span>
          </div>
          <p className="text-[10px] text-zinc-600">カード払いを選ぶと、この%を上乗せしてご請求します。</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">端数の<br />繰り上げ</span>
            <div className="flex-1 flex gap-1.5 flex-wrap">
              {[1, 10, 50, 100].map(v => (
                <button key={v} onClick={() => setSettings(s2 => ({ ...s2, roundUnit: v }))}
                  style={{ background: (settings.roundUnit ?? 100) === v ? GOLD : "#1c1c22", color: (settings.roundUnit ?? 100) === v ? "#000" : "#888" }}
                  className="text-[11px] rounded-full px-3 py-1.5 font-bold">{v === 1 ? "なし" : v + "円"}</button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-zinc-600"><b>最後の合計だけ</b>この単位に切り上げます。小計・消費税・サービス料は素の金額のまま計算するので、二重に上乗せされません。</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16">ボトル<br />バック候補</span>
            <input value={(settings.bottleBackPresets || [20, 25, 35]).join(",")}
              onChange={e => setSettings(s2 => ({ ...s2, bottleBackPresets: e.target.value.split(",").map(v => Math.max(0, parseInt(v, 10) || 0)).filter(v => v > 0).slice(0, 6) }))}
              placeholder="20,25,35" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
            <span className="text-xs text-zinc-500">%</span>
          </div>
          <p className="text-[10px] text-zinc-600">ボトルのバック率をワンタップで選べるようにする候補（カンマ区切り）。銘柄ごとの率は 在庫タブの商品マスタで設定します。</p>
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
            <CastAdminCard key={c.id} c={c} upd={upd} setCasts={setCasts} toggleGenre={toggleGenre} customerBook={customerBook} />
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
          （店コード: <b style={{ color: GOLD }}>{STORE_ID}</b>）
        </div>
        <button onClick={() => enterWatch(STORE_ID)} style={{ background: "#22222a", color: TEAL, border: `1px solid ${TEAL}` }} className="w-full rounded-lg py-2.5 text-sm font-bold">👀 外用ビューを開く（この端末で確認）</button>
      </div>

      <CloudVault {...{ settings, setSettings, cloudPass, setCloudPass, cloudInfo, cloudPush, cloudCheck, cloudRestore }} />

      <DataManagement {...{ exportData, importData, listAutoBackups, restoreAutoBackup, listRescueData, restoreRescue }} />

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

const PRODUCT_CATEGORIES = [["drink", "ドリンク"], ["shot", "ショット"], ["bottle", "ボトル"], ["champagne", "シャンパン"], ["other", "その他"]];

function InventoryView({ products, setProducts, salesLog, logAudit, backPresets }) {
  const [newP, setNewP] = useState({ name: "", category: "drink", price: "", cost: "", stock: "", lowStockAt: "", backPct: "" });
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
      backPct: newP.backPct === "" ? null : +newP.backPct, // ボトルバック率（空=キャストの既定率）
    }]);
    logAudit("商品追加", newP.name.trim());
    setNewP({ name: "", category: "drink", price: "", cost: "", stock: "", lowStockAt: "", backPct: "" });
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
              {/* ボトル・シャンパンは銘柄ごとにバック率が違うのでここで設定する */}
              {(p.category === "bottle" || p.category === "champagne") && (
              <div className="flex items-center gap-2 text-[11px] mt-1.5 flex-wrap">
                <span style={{ color: p.backPct != null ? GOLD : "#71717a" }} className="font-bold">バック</span>
                <input type="number" value={p.backPct ?? ""} placeholder="既定" onChange={e => updP(p.id, { backPct: e.target.value === "" ? null : Math.max(0, +e.target.value) })} style={{ background: "#0d0d10", border: `1px solid ${p.backPct != null ? GOLD : "#22222a"}`, fontSize: "14px" }} className="w-16 rounded px-1.5 py-1 outline-none" />
                <span className="text-zinc-500">%</span>
                {(backPresets || []).map(v => (
                  <button key={v} onClick={() => updP(p.id, { backPct: v })} style={{ background: p.backPct === v ? GOLD : "#1c1c22", color: p.backPct === v ? "#000" : "#888" }} className="rounded-full px-2 py-0.5 font-bold">{v}%</button>
                ))}
                {p.backPct != null && <button onClick={() => updP(p.id, { backPct: null })} className="text-zinc-500 underline">既定に戻す</button>}
                <span className="text-[9px] text-zinc-600 w-full">空欄＝キャストごとの既定バック率を使用</span>
              </div>
              )}
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
            {(newP.category === "bottle" || newP.category === "champagne") && (
              <input type="number" value={newP.backPct} onChange={e => setNewP(x => ({ ...x, backPct: e.target.value }))} placeholder="バック%" title="ボトルバック率（空=キャスト既定）" style={{ background: "#141418", border: `1px solid ${GOLD}`, fontSize: "15px" }} className="w-20 rounded-lg px-2 py-2 outline-none" />
            )}
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

function CloudVault({ settings, setSettings, cloudPass, setCloudPass, cloudInfo, cloudPush, cloudCheck, cloudRestore }) {
  const [msg, setMsg] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { cloudCheck(); }, []); // 開いた時にクラウド上の状態を確認

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">☁️ クラウド金庫（自動バックアップ）</h2>
      <p className="text-xs text-zinc-500 mb-3">
        全データを<b>パスワードで暗号化してから</b>クラウドに自動保存します。パスワードを知らない限り、サーバー側でも誰にも読めません。
        アプリの更新や端末の故障でデータが消えても、パスワード1つで全復元できます。
        <b style={{ color: "#e0a84a" }}>※パスワードを忘れると誰にも復元できません。</b>
      </p>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-zinc-500 w-20">パスワード</span>
        <input type="text" value={cloudPass} onChange={e => setCloudPass(e.target.value)} placeholder="例: vivace2026（忘れない物に）" style={{ background: "#141418", border: "1px solid #22222a", fontSize: "16px" }} className="flex-1 rounded-lg px-3 py-2 outline-none" />
      </div>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={!!settings.cloudBackup} onChange={e => setSettings(s => ({ ...s, cloudBackup: e.target.checked }))} style={{ accentColor: GOLD }} />
        <span className="text-sm font-bold">{settings.cloudBackup ? "🟢 自動保存ON（変更の5秒後に保存）" : "⚫ 自動保存OFF"}</span>
      </label>

      <div style={{ background: "#141418", border: "1px solid #22222a" }} className="rounded-xl p-3 mb-2 text-[11px] text-zinc-400 space-y-0.5">
        <div>この端末からの最終保存: {cloudInfo.lastPushAt ? new Date(cloudInfo.lastPushAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "まだ"}</div>
        <div>クラウド上のバックアップ: {cloudInfo.remote ? `${new Date(cloudInfo.remote.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 時点（キャスト${cloudInfo.remote.casts ?? "?"}名・客名帳${cloudInfo.remote.customers ?? "?"}名）` : "なし"}</div>
        {cloudInfo.lastError && <div style={{ color: "#e08484" }}>エラー: {cloudInfo.lastError}</div>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={async () => { setBusy(true); setMsg(null); const ok = await cloudPush(); await cloudCheck(); setBusy(false); setMsg(ok ? { ok: true, msg: "保存しました" } : { ok: false, msg: "保存に失敗しました（電波を確認して再試行）" }); }}
          disabled={busy || !cloudPass || !settings.cloudBackup}
          style={{ background: (!cloudPass || !settings.cloudBackup) ? "#1c1c22" : GOLD, color: (!cloudPass || !settings.cloudBackup) ? "#555" : "#000" }}
          className="flex-1 rounded-lg py-2.5 text-sm font-bold">⬆ 今すぐ保存</button>
        {restoreConfirm ? (
          <button
            onClick={async () => { setBusy(true); setMsg(null); await cloudRestore(cloudPass, setMsg); setBusy(false); setRestoreConfirm(false); await cloudCheck(); }}
            disabled={busy || !cloudPass}
            style={{ background: "#7a2222", color: "#fff" }}
            className="flex-1 rounded-lg py-2.5 text-sm font-bold">上書き復元（確定）</button>
        ) : (
          <button
            onClick={() => setRestoreConfirm(true)}
            disabled={busy || !cloudPass || !cloudInfo.remote}
            style={{ background: "#22222a", color: (!cloudPass || !cloudInfo.remote) ? "#555" : TEAL, border: `1px solid ${(!cloudPass || !cloudInfo.remote) ? "#2a2a32" : TEAL}` }}
            className="flex-1 rounded-lg py-2.5 text-sm font-bold">⬇ クラウドから復元</button>
        )}
      </div>
      {msg && (
        <div style={{ color: msg.ok ? "#7ae0a0" : "#ff8888" }} className="text-xs mt-2">{msg.msg}</div>
      )}
    </div>
  );
}

function DataManagement({ exportData, importData, listAutoBackups, restoreAutoBackup, listRescueData, restoreRescue }) {
  const fileRef = useRef(null);
  const [staged, setStaged] = useState(null); // { text, name, summary }
  const [msg, setMsg] = useState(null); // { ok, msg }
  const [bakConfirm, setBakConfirm] = useState(null); // 自動バックアップ復元の2度押し用 key
  const [showBaks, setShowBaks] = useState(false);
  const baks = showBaks ? listAutoBackups() : [];
  const [showRescue, setShowRescue] = useState(false);
  const [rescueConfirm, setRescueConfirm] = useState(null);
  const rescues = showRescue ? listRescueData() : [];

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

      <button onClick={() => setShowRescue(s => !s)} style={{ background: "rgba(224,168,74,.06)", border: "1px dashed #7a5a1a", color: "#e0a84a" }} className="w-full rounded-lg py-2 text-xs font-bold mb-2">{showRescue ? "▲ 閉じる" : "🔍 消えたデータを探す（端末内レスキュー）"}</button>
      {showRescue && (
        <div className="space-y-1.5 mb-3">
          {rescues.length === 0 && <p className="text-[11px] text-zinc-500">この端末内に他の保存データは見つかりませんでした。</p>}
          {rescues.map(r => (
            <div key={r.key} style={{ background: "#141418", border: "1px solid #7a5a1a" }} className="rounded-lg p-2.5">
              <div className="text-[11px] mb-1">
                <span className="font-bold" style={{ color: "#e0a84a" }}>キャスト{r.casts}名</span>
                <span className="text-zinc-500">・客名帳{r.customers}名・卓{r.tables}</span>
                {r.exportedAt && <span className="text-zinc-600"> ・{String(r.exportedAt).slice(0, 16).replace("T", " ")}</span>}
              </div>
              {r.castNames && <div className="text-[11px] text-zinc-300 mb-1.5 break-all">{r.castNames}{r.casts > 8 ? " …" : ""}</div>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-zinc-600 font-mono truncate">{r.key}</span>
                {rescueConfirm === r.key ? (
                  <button onClick={() => { restoreRescue(r.key, setMsg); setRescueConfirm(null); setShowRescue(false); }} style={{ background: "#7a2222", color: "#fff" }} className="text-[11px] rounded-full px-3 py-1.5 font-bold whitespace-nowrap shrink-0">このデータに戻す（確定）</button>
                ) : (
                  <button onClick={() => setRescueConfirm(r.key)} style={{ background: GOLD, color: "#000" }} className="text-[11px] rounded-full px-3 py-1.5 font-bold whitespace-nowrap shrink-0">これに戻す</button>
                )}
              </div>
            </div>
          ))}
        </div>
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

function CastAdminCard({ c, upd, setCasts, toggleGenre, customerBook }) {
  const [ngOpen, setNgOpen] = useState(false);
  const toggleIn = (key, v) => upd(c.id, x => ({ ...x, [key]: (x[key] || []).includes(v) ? x[key].filter(y => y !== v) : [...(x[key] || []), v] }));
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
      {/* 付け回しの判断材料（教科書の「キャバ嬢の分類」） */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-500 w-12">レベル</span>
        {RANKS.map(r => (
          <button key={r} onClick={() => upd(c.id, x => ({ ...x, rank: r }))} style={{ background: c.rank === r ? RANK_COLOR[r] : "#1c1c22", color: c.rank === r ? "#000" : "#888" }} className="text-[11px] rounded-full px-2.5 py-0.5 font-bold">{r}</button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-500 w-12">接客</span>
        {STYLES.map(st => (
          <button key={st} onClick={() => upd(c.id, x => ({ ...x, style: st }))} title={STYLE_DESC[st]} style={{ background: c.style === st ? STYLE_COLOR[st] : "#1c1c22", color: c.style === st ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{st}</button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-500 w-12">得意層</span>
        {AGE_BANDS.map(a => (
          <button key={a} onClick={() => toggleIn("ageFit", a)} style={{ background: (c.ageFit || []).includes(a) ? TEAL : "#1c1c22", color: (c.ageFit || []).includes(a) ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{a}</button>
        ))}
        <span className="text-[9px] text-zinc-600">未選択=全年齢</span>
      </div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-500 w-12">強み</span>
        {STRENGTHS.map(st => (
          <button key={st} onClick={() => toggleIn("strengths", st)} style={{ background: (c.strengths || []).includes(st) ? GOLD : "#1c1c22", color: (c.strengths || []).includes(st) ? "#000" : "#888" }} className="text-[11px] rounded-full px-2 py-0.5 font-bold">{st}</button>
        ))}
      </div>

      <button onClick={() => setNgOpen(o => !o)} style={{ background: "#0d0d10", border: "1px dashed #7a2222", color: "#e08484" }} className="w-full rounded-lg py-1.5 text-[11px] font-bold mb-2">
        {ngOpen ? "▲ 閉じる" : `🚫 付けたくないお客様${(c.ngCustomerIds || []).length ? `（${(c.ngCustomerIds || []).length}名）` : ""}`}
      </button>
      {ngOpen && (
        <div style={{ background: "#0d0d10", border: "1px solid #22222a" }} className="rounded-lg p-2 mb-2">
          <p className="text-[10px] text-zinc-500 mb-1.5">本人から「このお客様は付きたくない」と相談があった相手を登録します。付け回しから完全に外れ、手動でも配置できなくなります。</p>
          {(customerBook || []).length === 0 ? <p className="text-[10px] text-zinc-600">客名帳が空です</p> : (
            <div className="flex flex-wrap gap-1">
              {(customerBook || []).map(cu => {
                const on = (c.ngCustomerIds || []).includes(cu.id);
                return (
                  <button key={cu.id} onClick={() => toggleIn("ngCustomerIds", cu.id)} style={{ background: on ? "#7a2222" : "#1c1c22", color: on ? "#fff" : "#888", border: `1px solid ${on ? "#a13b3b" : "#2a2a32"}` }} className="text-[10px] rounded-full px-2 py-0.5 font-bold">{on ? "🚫 " : ""}{cu.name}</button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button onClick={() => setOpen(o => !o)} style={{ background: "#0d0d10", border: "1px dashed #2a2a32", color: GOLD }} className="w-full rounded-lg py-1.5 text-[11px] font-bold">{open ? "▲ 給料条件を閉じる" : "▼ 給料条件を編集"}</button>
      {open && (
        <div className="mt-3 pt-3 border-t border-[#22222a] space-y-2">
          <PayRow label="時給" value={c.hourlyWage} onChange={v => upd(c.id, x => ({ ...x, hourlyWage: num(v) }))} suffix="円" />
          <PayRow label="ドリンクバック" value={c.drinkBack} onChange={v => upd(c.id, x => ({ ...x, drinkBack: num(v) }))} suffix="円/杯" />
          <PayRow label="ショットバック" value={c.shotBack} onChange={v => upd(c.id, x => ({ ...x, shotBack: num(v) }))} suffix="円/杯" />
          <PayRow label="ボトルバック(既定)" value={c.bottleBackPct} onChange={v => upd(c.id, x => ({ ...x, bottleBackPct: num(v) }))} suffix="%" />
          <p className="text-[9px] text-zinc-600 -mt-1">※ 商品マスタでバック%を設定した銘柄はそちらが優先されます（オリジナルシャンパン35% 等）</p>
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

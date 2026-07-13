import { useState } from "react";
import { LogOut, Store, Users, ChevronDown, RefreshCw } from "lucide-react";
import AuthGate from "./AuthGate.jsx";
import { signOut } from "./auth.js";
import { supabase } from "./supabase.js";

const ROLE_LABEL = {
  owner: "オーナー",
  manager: "店長",
  floor: "フロア",
  catch: "キャッチ",
  viewer: "閲覧",
};

const INDUSTRY_LABEL = {
  cabaret: "キャバクラ",
  lounge: "ラウンジ",
  snack: "スナック",
  oppub: "おっぱぶ",
  other: "その他",
};

function StorePicker({ ctx, onSwitch }) {
  const [open, setOpen] = useState(false);
  const stores = ctx.accessible_stores || [];
  const current = ctx.current_store;
  if (stores.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Store size={16} className="text-neutral-400" />
        <span>{current?.name || "-"}</span>
      </div>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm bg-neutral-800 rounded-lg px-3 py-1.5 hover:bg-neutral-700"
      >
        <Store size={16} className="text-neutral-400" />
        <span>{current?.name || "-"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50">
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => { setOpen(false); onSwitch?.(s.id); }}
              className={
                "w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 " +
                (current?.id === s.id ? "text-fuchsia-400" : "")
              }
            >
              {s.name}
              <div className="text-xs text-neutral-500">
                {INDUSTRY_LABEL[s.industry] || s.industry}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard({ ctx, reload }) {
  const staff = ctx.staff;
  const store = ctx.current_store;
  const account = ctx.account;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header
        className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)", paddingBottom: 12 }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-600 flex items-center justify-center">
              <Store size={16} />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">つけ回しツール</div>
              <div className="text-[10px] text-neutral-400 leading-tight">
                {account?.name} · {ROLE_LABEL[staff?.role] || staff?.role}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StorePicker ctx={ctx} />
            <button
              onClick={reload}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700"
              title="再読込"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={async () => { await signOut(); }}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
              title="ログアウト"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-3xl mx-auto">
        <section className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
          <div className="text-xs text-neutral-400 mb-2">現在の店舗</div>
          <div className="text-2xl font-bold">{store?.name}</div>
          <div className="text-sm text-neutral-400 mt-1">
            {INDUSTRY_LABEL[store?.industry] || store?.industry} ·
            税率 {store?.tax_rate}% · タイムゾーン {store?.timezone}
          </div>
        </section>

        <section className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
          <div className="flex items-center gap-2 text-sm text-neutral-400 mb-2">
            <Users size={14} /> あなたの権限
          </div>
          <div className="text-lg font-semibold">
            {staff?.display_name}（{ROLE_LABEL[staff?.role] || staff?.role}）
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            store_id: <span className="font-mono">{store?.id}</span>
          </div>
        </section>

        <section className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
          <div className="text-sm text-neutral-400 mb-2">セットアップ完了</div>
          <div className="text-sm">
            初期卓 6卓と基本ドリンク 6品目を投入済みです。<br />
            次のフェーズでフロア画面・つけ回し・キャスト管理を実装していきます。
          </div>
        </section>

        <section className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800 text-xs text-neutral-500">
          <div>account_id: <span className="font-mono">{account?.id}</span></div>
          <div>staff_id: <span className="font-mono">{staff?.staff_id}</span></div>
          <div>plan: <span className="font-mono">{account?.plan}</span></div>
        </section>

        <QuickDataCheck />
      </main>
    </div>
  );
}

function QuickDataCheck() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setResult(null);
    const [tables, products] = await Promise.all([
      supabase.from("tables").select("id, code, seats").order("sort_order"),
      supabase.from("products").select("id, name, price_yen, category").order("sort_order"),
    ]);
    setResult({
      tables: tables.data,
      products: products.data,
      err: tables.error || products.error,
    });
    setBusy(false);
  }
  return (
    <section className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-neutral-400">RLS 動作確認（自店舗のデータのみ見える）</div>
        <button
          onClick={run}
          disabled={busy}
          className="text-xs bg-neutral-800 hover:bg-neutral-700 px-3 py-1 rounded"
        >
          {busy ? "..." : "実行"}
        </button>
      </div>
      {result?.err && (
        <div className="text-xs text-red-400">{result.err.message}</div>
      )}
      {result && !result.err && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-neutral-500 mb-1">卓 ({result.tables?.length || 0})</div>
            <ul className="space-y-1">
              {result.tables?.map((t) => (
                <li key={t.id}>{t.code} ({t.seats}席)</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-neutral-500 mb-1">商品 ({result.products?.length || 0})</div>
            <ul className="space-y-1">
              {result.products?.map((p) => (
                <li key={p.id}>{p.name} <span className="text-neutral-500">¥{p.price_yen.toLocaleString()}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SaasApp() {
  return <AuthGate>{(ctx, reload) => <Dashboard ctx={ctx} reload={reload} />}</AuthGate>;
}

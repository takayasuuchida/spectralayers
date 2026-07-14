import { useState, useEffect, useCallback } from "react";
import { Clock, Plus, X, Users, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "./supabase.js";
import {
  GOLD, TEAL, yen, fmt, remainMs, plannedEnd, hhmm, useNow,
  businessDate, SET_MINUTES, SET_FEES,
} from "./saasLib.js";
import TableDetailModal from "./TableDetailModal.jsx";

// 進行中の1卓分カード。タイマは自身の useNow で 1秒更新（親は再描画しない）。
function TableCard({ table, session, onOpen, onStart }) {
  const active = !!session;
  const now = useNow(active);
  const remain = active ? remainMs(session, now) : 0;
  const warn = active && remain <= 600000; // 残り10分以下で警告色
  const elapsed = active ? now - new Date(session.started_at).getTime() : 0;

  return (
    <button
      onClick={active ? onOpen : onStart}
      style={{
        background: active ? "#141418" : "#0d0d10",
        border: `1.5px solid ${warn ? "#a13b3b" : active ? GOLD : "#1c1c22"}`,
        boxShadow: warn ? "0 0 14px rgba(180,60,60,.35)" : "none",
      }}
      className="rounded-2xl p-3 text-left min-h-[132px] flex flex-col"
    >
      <div className="flex items-center justify-between mb-1">
        <span
          style={{ color: active ? "#fff" : "#555", fontFamily: "Georgia,serif" }}
          className="text-lg font-bold"
        >
          {table.label || table.code}
        </span>
        {active ? (
          <span
            style={{ color: warn ? "#ff6a6a" : "#9a9aa2" }}
            className="text-[11px] font-bold flex items-center gap-0.5"
          >
            <Clock size={11} />
            {remain < 0 ? "+" : ""}
            {fmt(remain)}
          </span>
        ) : (
          <span className="text-[10px] text-neutral-600">空席</span>
        )}
      </div>

      {active ? (
        <>
          <div className="text-[11px] text-neutral-400 space-y-0.5 mt-0.5">
            <div>経過 {fmt(elapsed)}</div>
            <div>終了予定 {hhmm(plannedEnd(session))}</div>
          </div>
          <div className="mt-auto flex items-center justify-between text-[11px] pt-2">
            <span className="text-neutral-500 flex items-center gap-1">
              <Users size={11} />
              {session.head_count}名
            </span>
            <span style={{ color: GOLD }} className="font-bold">
              {session.status === "extended" ? "延長中" : "接客中"}
            </span>
          </div>
        </>
      ) : (
        <span className="text-[10px] text-neutral-600 mt-auto">
          定員 {table.seats}名 ・ タップで開ける
        </span>
      )}
    </button>
  );
}

// 空き卓 → セッション開始ダイアログ
function StartDialog({ table, storeId, onClose, onStarted }) {
  const [minutes, setMinutes] = useState(60);
  const [fee, setFee] = useState(4000);
  const [head, setHead] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function start() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("table_sessions").insert({
      store_id: storeId,
      table_id: table.id,
      business_date: businessDate(),
      started_at: new Date().toISOString(),
      planned_minutes: minutes,
      set_fee_yen: fee,
      head_count: head,
      status: "active",
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onStarted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-neutral-900 rounded-2xl p-5 border border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-bold" style={{ fontFamily: "Georgia,serif" }}>
            {table.label || table.code} を開ける
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
            <X size={18} />
          </button>
        </div>

        <div className="text-[10px] text-neutral-500 mb-1">セット時間</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {SET_MINUTES.map((v) => (
            <button
              key={v}
              onClick={() => setMinutes(v)}
              style={{
                background: minutes === v ? "rgba(201,166,78,.18)" : "#141418",
                border: `1px solid ${minutes === v ? GOLD : "#2a2a32"}`,
                color: minutes === v ? "#e8d29a" : "#888",
              }}
              className="rounded-lg py-2.5 text-sm font-bold"
            >
              {v}分
            </button>
          ))}
        </div>

        <div className="text-[10px] text-neutral-500 mb-1">セット料金</div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {SET_FEES.map((v) => (
            <button
              key={v}
              onClick={() => setFee(v)}
              style={{
                background: fee === v ? "rgba(63,182,176,.15)" : "#141418",
                border: `1px solid ${fee === v ? TEAL : "#2a2a32"}`,
                color: fee === v ? "#a8e6e2" : "#888",
              }}
              className="rounded-lg py-2 text-xs font-bold"
            >
              {(v / 1000).toLocaleString()}k
            </button>
          ))}
        </div>

        <div className="text-[10px] text-neutral-500 mb-1">人数</div>
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setHead((h) => Math.max(1, h - 1))}
            className="w-10 h-10 rounded-lg bg-neutral-800 text-lg font-bold"
          >
            −
          </button>
          <span className="text-xl font-bold w-8 text-center">{head}</span>
          <button
            onClick={() => setHead((h) => Math.min(20, h + 1))}
            className="w-10 h-10 rounded-lg bg-neutral-800 text-lg font-bold"
          >
            ＋
          </button>
          <span className="text-xs text-neutral-500 ml-auto">
            セット計 {yen(fee * head)}
          </span>
        </div>

        {err && (
          <div className="mb-3 text-xs text-red-400 bg-red-950/50 rounded-lg p-2">{err}</div>
        )}

        <button
          onClick={start}
          disabled={busy}
          className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-700 rounded-lg py-3 font-semibold flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          セット開始
        </button>
      </div>
    </div>
  );
}

export default function FloorTab({ ctx }) {
  const storeId = ctx.current_store?.id;
  const staffId = ctx.staff?.staff_id;
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState([]); // 進行中のみ
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [starting, setStarting] = useState(null); // 開始ダイアログ対象テーブル
  const [detailSession, setDetailSession] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [t, s] = await Promise.all([
      supabase
        .from("tables")
        .select("*")
        .eq("status", "active")
        .order("sort_order"),
      supabase
        .from("table_sessions")
        .select("*")
        .is("ended_at", null)
        .in("status", ["active", "extended"]),
    ]);
    if (t.error || s.error) {
      setErr((t.error || s.error).message);
    } else {
      setTables(t.data || []);
      setSessions(s.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const sessionByTable = {};
  for (const s of sessions) sessionByTable[s.table_id] = s;

  const openCount = sessions.length;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-neutral-400">
          稼働 {openCount} / {tables.length} 卓
        </div>
        <button
          onClick={refetch}
          className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700"
          title="再読込"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {err && (
        <div className="mb-3 text-xs text-red-400 bg-red-950/50 rounded-lg p-2">{err}</div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center text-neutral-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : tables.length === 0 ? (
        <div className="py-16 text-center text-neutral-500 text-sm">卓がありません</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {tables.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              session={sessionByTable[t.id]}
              onStart={() => setStarting(t)}
              onOpen={() => setDetailSession({ session: sessionByTable[t.id], table: t })}
            />
          ))}
        </div>
      )}

      {starting && (
        <StartDialog
          table={starting}
          storeId={storeId}
          onClose={() => setStarting(null)}
          onStarted={() => {
            setStarting(null);
            refetch();
          }}
        />
      )}

      {detailSession && (
        <TableDetailModal
          session={detailSession.session}
          table={detailSession.table}
          storeId={storeId}
          staffId={staffId}
          onClose={() => setDetailSession(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}

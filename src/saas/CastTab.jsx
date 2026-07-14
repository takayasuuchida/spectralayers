import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Check, Plus, Pencil, RotateCcw } from "lucide-react";
import { supabase } from "./supabase.js";
import { GOLD, TEAL, businessDate, CAST_RANK_LABEL } from "./saasLib.js";
import CastForm from "./CastForm.jsx";

export default function CastTab({ ctx }) {
  const storeId = ctx.current_store?.id;
  const [casts, setCasts] = useState([]); // 全ステータス取得（retired 含む）
  const [attByCast, setAttByCast] = useState({}); // cast_id -> attendance row
  const [busyIds, setBusyIds] = useState(new Set()); // 接客中の cast_id
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(null); // 保存中の cast_id
  const [showRetired, setShowRetired] = useState(false);
  const [form, setForm] = useState(null); // { mode, cast }

  const workDate = businessDate();

  const refetch = useCallback(async () => {
    setLoading(true);
    setErr(null);
    // 進行中セッション → その session_casts（未退席）から接客中キャストを算出
    const sess = await supabase
      .from("table_sessions")
      .select("id")
      .is("ended_at", null)
      .in("status", ["active", "extended"]);
    const sessionIds = (sess.data || []).map((s) => s.id);

    const [c, att, sc] = await Promise.all([
      supabase.from("casts").select("*").order("display_name"),
      supabase.from("cast_attendance").select("*").eq("work_date", workDate),
      sessionIds.length
        ? supabase.from("session_casts").select("cast_id").in("session_id", sessionIds).is("ended_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const e = sess.error || c.error || att.error || sc.error;
    if (e) {
      setErr(e.message);
      setLoading(false);
      return;
    }
    setCasts(c.data || []);
    const map = {};
    for (const a of att.data || []) map[a.cast_id] = a;
    setAttByCast(map);
    setBusyIds(new Set((sc.data || []).map((r) => r.cast_id)));
    setLoading(false);
  }, [workDate]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const isPresent = (castId) => attByCast[castId]?.status === "present";

  async function toggleAttendance(cast) {
    setSaving(cast.id);
    setErr(null);
    const existing = attByCast[cast.id];
    const nowIso = new Date().toISOString();
    let error;
    if (!existing) {
      // 未記録 → 出勤
      ({ error } = await supabase.from("cast_attendance").insert({
        cast_id: cast.id,
        store_id: storeId,
        work_date: workDate,
        status: "present",
        clock_in_at: nowIso,
      }));
    } else if (existing.status === "present") {
      // 出勤中 → 退勤（未出勤扱い）
      ({ error } = await supabase
        .from("cast_attendance")
        .update({ status: "left", clock_out_at: nowIso })
        .eq("id", existing.id));
    } else {
      // 退勤/欠勤 → 再出勤
      ({ error } = await supabase
        .from("cast_attendance")
        .update({ status: "present", clock_in_at: nowIso, clock_out_at: null })
        .eq("id", existing.id));
    }
    setSaving(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await refetch();
  }

  async function restore(cast) {
    setSaving(cast.id);
    setErr(null);
    const { error } = await supabase
      .from("casts")
      .update({ status: "active" })
      .eq("id", cast.id);
    setSaving(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await refetch();
  }

  const roster = casts.filter((c) => c.status !== "retired"); // 在籍（active/off）
  const retiredList = casts.filter((c) => c.status === "retired");
  const present = roster.filter((c) => isPresent(c.id));
  const off = roster.filter((c) => !isPresent(c.id));

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-neutral-400">
          出勤 {present.length} / {roster.length} 名
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setForm({ mode: "create" })}
            className="text-xs bg-fuchsia-600 hover:bg-fuchsia-500 rounded-lg px-3 py-2 font-semibold flex items-center gap-1"
          >
            <Plus size={14} /> キャスト追加
          </button>
          <button
            onClick={refetch}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700"
            title="再読込"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-3 text-xs text-red-400 bg-red-950/50 rounded-lg p-2">{err}</div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center text-neutral-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <div className="text-xs text-neutral-500 mb-2">出勤中（タップで退勤 / 鉛筆で編集）</div>
            <div className="grid grid-cols-2 gap-2">
              {present.map((c) => {
                const busy = busyIds.has(c.id);
                return (
                  <div
                    key={c.id}
                    style={{ border: `1px solid ${GOLD}`, background: "rgba(201,166,78,.1)" }}
                    className="relative rounded-xl"
                  >
                    <button
                      onClick={() => toggleAttendance(c)}
                      disabled={saving === c.id}
                      className="w-full p-3 pr-9 text-left flex items-center gap-3 disabled:opacity-50"
                    >
                      <div
                        style={{ border: `2px solid ${busy ? GOLD : TEAL}` }}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      >
                        {c.display_name.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{c.display_name}</div>
                        <div className="text-[11px]" style={{ color: busy ? GOLD : TEAL }}>
                          {busy ? "接客中" : "フリー"}
                          <span className="text-neutral-600"> · {CAST_RANK_LABEL[c.rank] || c.rank}</span>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setForm({ mode: "edit", cast: c })}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-black/30"
                      title="編集"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                );
              })}
              {present.length === 0 && (
                <div className="col-span-2 text-xs text-neutral-600">出勤中のキャストはいません</div>
              )}
            </div>
          </section>

          <section>
            <div className="text-xs text-neutral-500 mb-2">未出勤（タップで出勤 / 鉛筆で編集）</div>
            <div className="grid grid-cols-2 gap-2">
              {off.map((c) => (
                <div
                  key={c.id}
                  className="relative rounded-xl bg-neutral-900 border border-neutral-800"
                >
                  <button
                    onClick={() => toggleAttendance(c)}
                    disabled={saving === c.id}
                    className="w-full p-3 pr-9 text-left flex items-center gap-3 hover:bg-neutral-800 rounded-xl disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-sm text-neutral-400 shrink-0">
                      {c.display_name.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate text-neutral-300">
                        {c.display_name}
                      </div>
                      <div className="text-[11px] text-neutral-600">
                        {CAST_RANK_LABEL[c.rank] || c.rank}
                      </div>
                    </div>
                    {saving === c.id ? (
                      <Loader2 size={14} className="animate-spin ml-auto" />
                    ) : (
                      <Check size={14} className="ml-auto text-neutral-700" />
                    )}
                  </button>
                  <button
                    onClick={() => setForm({ mode: "edit", cast: c })}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-100 hover:bg-black/30"
                    title="編集"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
              {roster.length === 0 && (
                <div className="col-span-2 text-xs text-neutral-600">
                  キャストがいません。「キャスト追加」から登録してください。
                </div>
              )}
            </div>
          </section>

          <section>
            <button
              onClick={() => setShowRetired((v) => !v)}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              {showRetired ? "▾" : "▸"} 引退（{retiredList.length}）
            </button>
            {showRetired && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {retiredList.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl bg-neutral-950 border border-neutral-800 p-3 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center text-sm text-neutral-600 shrink-0">
                      {c.display_name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate text-neutral-500">
                        {c.display_name}
                      </div>
                      <div className="text-[11px] text-neutral-700">
                        {CAST_RANK_LABEL[c.rank] || c.rank} · 引退
                      </div>
                    </div>
                    <button
                      onClick={() => restore(c)}
                      disabled={saving === c.id}
                      className="text-[11px] rounded-full px-2 py-1 bg-neutral-800 hover:bg-neutral-700 flex items-center gap-1 disabled:opacity-50"
                      title="復帰"
                    >
                      {saving === c.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RotateCcw size={12} />
                      )}
                      復帰
                    </button>
                  </div>
                ))}
                {retiredList.length === 0 && (
                  <div className="col-span-2 text-xs text-neutral-600">引退キャストはいません</div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {form && (
        <CastForm
          mode={form.mode}
          cast={form.cast}
          storeId={storeId}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

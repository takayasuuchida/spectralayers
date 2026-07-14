import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Check } from "lucide-react";
import { supabase } from "./supabase.js";
import { GOLD, TEAL, businessDate, CAST_RANK_LABEL } from "./saasLib.js";

export default function CastTab({ ctx }) {
  const storeId = ctx.current_store?.id;
  const [casts, setCasts] = useState([]);
  const [attByCast, setAttByCast] = useState({}); // cast_id -> attendance row
  const [busyIds, setBusyIds] = useState(new Set()); // 接客中の cast_id
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(null); // 保存中の cast_id

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
      supabase.from("casts").select("*").eq("status", "active").order("display_name"),
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

  const present = casts.filter((c) => isPresent(c.id));
  const off = casts.filter((c) => !isPresent(c.id));

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-neutral-400">
          出勤 {present.length} / {casts.length} 名
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
      ) : casts.length === 0 ? (
        <div className="py-16 text-center text-neutral-500 text-sm">キャストがいません</div>
      ) : (
        <div className="space-y-6">
          <section>
            <div className="text-xs text-neutral-500 mb-2">出勤中（タップで退勤）</div>
            <div className="grid grid-cols-2 gap-2">
              {present.map((c) => {
                const busy = busyIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleAttendance(c)}
                    disabled={saving === c.id}
                    style={{ border: `1px solid ${GOLD}`, background: "rgba(201,166,78,.1)" }}
                    className="rounded-xl p-3 text-left flex items-center gap-3 disabled:opacity-50"
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
                        <span className="text-neutral-600">
                          {" "}
                          · {CAST_RANK_LABEL[c.rank] || c.rank}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {present.length === 0 && (
                <div className="col-span-2 text-xs text-neutral-600">出勤中のキャストはいません</div>
              )}
            </div>
          </section>

          <section>
            <div className="text-xs text-neutral-500 mb-2">未出勤（タップで出勤）</div>
            <div className="grid grid-cols-2 gap-2">
              {off.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleAttendance(c)}
                  disabled={saving === c.id}
                  className="rounded-xl p-3 text-left flex items-center gap-3 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 disabled:opacity-50"
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
                  {saving === c.id && <Loader2 size={14} className="animate-spin ml-auto" />}
                  {saving !== c.id && (
                    <Check size={14} className="ml-auto text-neutral-700" />
                  )}
                </button>
              ))}
              {off.length === 0 && (
                <div className="col-span-2 text-xs text-neutral-600">全員出勤しています</div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

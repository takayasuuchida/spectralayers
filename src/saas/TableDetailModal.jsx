import { useState, useEffect, useCallback } from "react";
import { X, Clock, Plus, UserPlus, Loader2, LogOut, Wine } from "lucide-react";
import { supabase } from "./supabase.js";
import {
  GOLD, TEAL, yen, fmt, remainMs, plannedEnd, hhmm, useNow, CATEGORY_LABEL,
} from "./saasLib.js";

export default function TableDetailModal({
  session, table, storeId, staffId, onClose, onChanged,
}) {
  const [sess, setSess] = useState(session);
  const now = useNow(true);
  const remain = remainMs(sess, now);
  const warn = remain <= 600000;

  const [casts, setCasts] = useState([]);
  const [assigned, setAssigned] = useState([]); // session_casts (ended_at null)
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [showDrinks, setShowDrinks] = useState(false);
  const [drinkCast, setDrinkCast] = useState(""); // ドリンクを付けるキャスト（任意）

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [c, sc, o, p] = await Promise.all([
      supabase.from("casts").select("id, display_name, rank, status").eq("status", "active").order("display_name"),
      supabase.from("session_casts").select("*").eq("session_id", sess.id).is("ended_at", null).order("rotation_no"),
      supabase.from("drink_orders").select("*").eq("session_id", sess.id).order("created_at"),
      supabase.from("products").select("*").eq("is_active", true).order("sort_order"),
    ]);
    const e = c.error || sc.error || o.error || p.error;
    if (e) setErr(e.message);
    else {
      setCasts(c.data || []);
      setAssigned(sc.data || []);
      setOrders(o.data || []);
      setProducts(p.data || []);
    }
    setLoading(false);
  }, [sess.id]);

  useEffect(() => {
    load();
  }, [load]);

  const castById = {};
  for (const c of casts) castById[c.id] = c;
  const assignedIds = new Set(assigned.map((a) => a.cast_id));

  const drinkSubtotal = orders.reduce((a, o) => a + o.unit_price * o.quantity, 0);
  const setFee = (sess.set_fee_yen || 0) * (sess.head_count || 0);
  const total = drinkSubtotal + setFee;

  async function extend(delta) {
    setBusy(true);
    const next = (sess.planned_minutes || 0) + delta;
    const { data, error } = await supabase
      .from("table_sessions")
      .update({ planned_minutes: next, status: "extended" })
      .eq("id", sess.id)
      .select()
      .single();
    setBusy(false);
    if (error) return setErr(error.message);
    setSess(data);
    onChanged?.();
  }

  async function closeSession() {
    if (!window.confirm(`${table.label || table.code} を会計・終了しますか？`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("table_sessions")
      .update({ ended_at: new Date().toISOString(), status: "closed", closed_by: staffId || null })
      .eq("id", sess.id);
    setBusy(false);
    if (error) return setErr(error.message);
    onChanged?.();
    onClose();
  }

  async function assignCast(castId) {
    setBusy(true);
    const nextRotation =
      assigned.reduce((m, a) => Math.max(m, a.rotation_no || 0), 0) + 1;
    const { error } = await supabase.from("session_casts").insert({
      session_id: sess.id,
      cast_id: castId,
      rotation_no: nextRotation,
      role: "free",
      started_at: new Date().toISOString(),
      assigned_by: "manual",
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setShowAssign(false);
    await load();
    onChanged?.();
  }

  async function removeCast(sc) {
    setBusy(true);
    const { error } = await supabase
      .from("session_casts")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sc.id);
    setBusy(false);
    if (error) return setErr(error.message);
    await load();
    onChanged?.();
  }

  async function addDrink(product) {
    setBusy(true);
    const { error } = await supabase.from("drink_orders").insert({
      store_id: storeId,
      session_id: sess.id,
      cast_id: drinkCast || null,
      product_id: product.id,
      item_name: product.name,
      category: product.category,
      unit_price: product.price_yen,
      quantity: 1,
      back_rate: product.back_rate || 0,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    await load();
    onChanged?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,.65)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-neutral-900 border-t sm:border border-neutral-800 rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダ + タイマ + 終了/延長 */}
        <div className="sticky top-0 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-bold" style={{ fontFamily: "Georgia,serif" }}>
              {table.label || table.code}
            </div>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span
              style={{ color: warn ? "#ff6a6a" : "#9a9aa2" }}
              className="font-bold flex items-center gap-1"
            >
              <Clock size={14} />
              残り {remain < 0 ? "+" : ""}
              {fmt(remain)}
            </span>
            <span className="text-neutral-500 text-xs">
              終了予定 {hhmm(plannedEnd(sess))}
            </span>
            <span className="text-neutral-500 text-xs">{sess.head_count}名</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => extend(50)}
              disabled={busy}
              style={{ border: `1px solid ${TEAL}`, color: "#a8e6e2" }}
              className="text-xs rounded-full px-3 py-1.5 font-bold disabled:opacity-50"
            >
              +50分
            </button>
            <button
              onClick={() => extend(60)}
              disabled={busy}
              style={{ border: `1px solid ${TEAL}`, color: "#a8e6e2" }}
              className="text-xs rounded-full px-3 py-1.5 font-bold disabled:opacity-50"
            >
              +60分
            </button>
            <button
              onClick={closeSession}
              disabled={busy}
              className="ml-auto text-xs rounded-full px-3 py-1.5 font-bold bg-red-900/70 hover:bg-red-800 text-red-100 flex items-center gap-1 disabled:opacity-50"
            >
              <LogOut size={12} /> 終了
            </button>
          </div>
        </div>

        {err && (
          <div className="mx-4 mt-3 text-xs text-red-400 bg-red-950/50 rounded-lg p-2">{err}</div>
        )}

        {loading ? (
          <div className="py-16 flex justify-center text-neutral-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {/* キャスト */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-neutral-400">キャスト（{assigned.length}）</div>
                <button
                  onClick={() => setShowAssign((v) => !v)}
                  style={{ border: `1px dashed ${GOLD}`, color: GOLD }}
                  className="text-[11px] rounded-full px-3 py-1 flex items-center gap-1"
                >
                  <UserPlus size={12} /> アサイン
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {assigned.length === 0 && (
                  <div className="text-xs text-neutral-600">まだいません</div>
                )}
                {assigned.map((a) => (
                  <span
                    key={a.id}
                    style={{ background: "rgba(63,182,176,.15)", border: `1px solid ${TEAL}`, color: "#a8e6e2" }}
                    className="text-[12px] rounded-full pl-3 pr-1 py-1 font-bold flex items-center gap-1"
                  >
                    {castById[a.cast_id]?.display_name || "?"}
                    <button
                      onClick={() => removeCast(a)}
                      className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              {showAssign && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {casts
                    .filter((c) => !assignedIds.has(c.id))
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => assignCast(c.id)}
                        disabled={busy}
                        className="rounded-lg py-2 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {c.display_name}
                      </button>
                    ))}
                  {casts.filter((c) => !assignedIds.has(c.id)).length === 0 && (
                    <div className="col-span-3 text-xs text-neutral-600">
                      アサインできるキャストがいません
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ドリンク追加 */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-neutral-400">注文</div>
                <button
                  onClick={() => setShowDrinks((v) => !v)}
                  style={{ border: `1px dashed ${GOLD}`, color: GOLD }}
                  className="text-[11px] rounded-full px-3 py-1 flex items-center gap-1"
                >
                  <Plus size={12} /> ドリンク
                </button>
              </div>

              {showDrinks && (
                <div className="mb-3 bg-neutral-950/60 rounded-xl p-3 border border-neutral-800">
                  <div className="text-[10px] text-neutral-500 mb-1">付けるキャスト（任意）</div>
                  <select
                    value={drinkCast}
                    onChange={(e) => setDrinkCast(e.target.value)}
                    className="w-full bg-neutral-800 rounded-lg px-2 py-1.5 text-sm mb-3 outline-none"
                  >
                    <option value="">— なし —</option>
                    {assigned.map((a) => (
                      <option key={a.id} value={a.cast_id}>
                        {castById[a.cast_id]?.display_name || "?"}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    {products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addDrink(p)}
                        disabled={busy}
                        className="rounded-lg p-2 text-left bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
                      >
                        <div className="text-xs font-bold flex items-center gap-1">
                          <Wine size={11} className="text-neutral-500" />
                          {p.name}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {CATEGORY_LABEL[p.category] || p.category} · {yen(p.price_yen)}
                        </div>
                      </button>
                    ))}
                    {products.length === 0 && (
                      <div className="col-span-2 text-xs text-neutral-600">商品がありません</div>
                    )}
                  </div>
                </div>
              )}

              <ul className="space-y-1">
                {orders.length === 0 && (
                  <li className="text-xs text-neutral-600">注文はまだありません</li>
                )}
                {orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between text-sm bg-neutral-800/50 rounded-lg px-3 py-1.5"
                  >
                    <span className="flex-1 truncate">
                      {o.item_name}
                      {o.quantity > 1 && (
                        <span className="text-neutral-500"> ×{o.quantity}</span>
                      )}
                      {o.cast_id && (
                        <span className="text-[10px] text-teal-300 ml-2">
                          → {castById[o.cast_id]?.display_name || "?"}
                        </span>
                      )}
                    </span>
                    <span className="text-neutral-300">{yen(o.unit_price * o.quantity)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 小計 */}
            <section className="border-t border-neutral-800 pt-3 text-sm space-y-1">
              <div className="flex justify-between text-neutral-400">
                <span>セット（{yen(sess.set_fee_yen)} × {sess.head_count}）</span>
                <span>{yen(setFee)}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>ドリンク小計</span>
                <span>{yen(drinkSubtotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1">
                <span>小計</span>
                <span style={{ color: GOLD }}>{yen(total)}</span>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  X, Clock, Plus, UserPlus, Loader2, LogOut, Wine, Crown, Wand2, Users,
} from "lucide-react";
import { supabase } from "./supabase.js";
import {
  GOLD, TEAL, yen, fmt, remainMs, plannedEnd, hhmm, useNow, CATEGORY_LABEL,
} from "./saasLib.js";

// v1（src/App.jsx）の付け回しと揃えたジャンル定義
const GENRES = ["綺麗", "可愛い", "おもしろい"];
const GENRE_COLOR = { "綺麗": "#7aa7ff", "可愛い": "#ff8fc4", "おもしろい": "#f0b54a" };

// SaaS casts には数値 score が無いため rank から擬似スコアを算出（v1 の c.score 相当）
const RANK_SCORE = { vip: 4, shimei: 3, helper: 2, regular: 1 };
const scoreOf = (cast) => RANK_SCORE[cast.rank] || 1;
const castGenres = (cast) => (Array.isArray(cast.genre) ? cast.genre : []);

export default function TableDetailModal({
  session, table, storeId, staffId, onClose, onChanged,
}) {
  const [sess, setSess] = useState(session);
  const now = useNow(true);
  const remain = remainMs(sess, now);
  const warn = remain <= 600000;

  const [casts, setCasts] = useState([]);
  const [guests, setGuests] = useState([]);
  const [assigned, setAssigned] = useState([]); // session_casts (ended_at null)
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [presentIds, setPresentIds] = useState(new Set()); // 本日出勤中
  const [busyIds, setBusyIds] = useState(new Set()); // 全稼働卓で接客中
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // ゲストの好み・付いたキャストは session_guests / session_casts にカラムが無いため
  // モーダル内のクライアント状態として保持（永続化はスキーマ追加が必要 → 報告参照）
  const [guestPref, setGuestPref] = useState({}); // guestId -> pref
  const [guestServed, setGuestServed] = useState({}); // guestId -> [castId]

  const [newGuest, setNewGuest] = useState("");
  const [pickGuest, setPickGuest] = useState(null); // 指名ピッカー対象ゲスト
  const [notice, setNotice] = useState(null); // { type:'ng'|'warn', msg, onOk? }
  const [showDrinks, setShowDrinks] = useState(false);
  const [drinkCast, setDrinkCast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    // 全稼働セッション → busy 判定用
    const activeSess = await supabase
      .from("table_sessions")
      .select("id")
      .is("ended_at", null)
      .in("status", ["active", "extended"]);
    const activeIds = (activeSess.data || []).map((s) => s.id);

    const todayBusy = activeIds.length
      ? await supabase.from("session_casts").select("cast_id").in("session_id", activeIds).is("ended_at", null)
      : { data: [], error: null };

    const [c, g, sc, o, p, att] = await Promise.all([
      supabase.from("casts").select("*").eq("status", "active").order("display_name"),
      supabase.from("session_guests").select("*").eq("session_id", sess.id).is("left_at", null).order("joined_at"),
      supabase.from("session_casts").select("*").eq("session_id", sess.id).is("ended_at", null).order("rotation_no"),
      supabase.from("drink_orders").select("*").eq("session_id", sess.id).order("created_at"),
      supabase.from("products").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("cast_attendance").select("cast_id, status").eq("status", "present"),
    ]);
    const e = activeSess.error || todayBusy.error || c.error || g.error || sc.error || o.error || p.error || att.error;
    if (e) {
      setErr(e.message);
      setLoading(false);
      return;
    }
    setCasts(c.data || []);
    setGuests(g.data || []);
    setAssigned(sc.data || []);
    setOrders(o.data || []);
    setProducts(p.data || []);
    setPresentIds(new Set((att.data || []).map((r) => r.cast_id)));
    setBusyIds(new Set((todayBusy.data || []).map((r) => r.cast_id)));
    // 好みの初期化（未設定ゲストは既定「綺麗」）
    setGuestPref((prev) => {
      const next = { ...prev };
      for (const gu of g.data || []) if (!next[gu.id]) next[gu.id] = "綺麗";
      return next;
    });
    setLoading(false);
  }, [sess.id]);

  useEffect(() => {
    load();
  }, [load]);

  const castById = {};
  for (const c of casts) castById[c.id] = c;
  const assignedIds = new Set(assigned.map((a) => a.cast_id));

  // v1 の available: 出勤中 かつ フリー（他卓・自卓で接客していない）
  const available = casts.filter(
    (c) => presentIds.has(c.id) && !busyIds.has(c.id)
  );

  const drinkSubtotal = orders.reduce((a, o) => a + o.unit_price * o.quantity, 0);
  const setFee = (sess.set_fee_yen || 0) * (sess.head_count || 0);
  const total = drinkSubtotal + setFee;

  // ---- タイマ操作 ----
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

  // ---- ゲスト（お客様）----
  async function addGuest() {
    const name = newGuest.trim();
    setBusy(true);
    const { error } = await supabase.from("session_guests").insert({
      session_id: sess.id,
      guest_name: name || "客",
      is_boss: guests.length === 0, // 最初の1名をボスに（v1準拠）
      seat_no: guests.length + 1,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setNewGuest("");
    await load();
    onChanged?.();
  }

  async function removeGuest(guest) {
    setBusy(true);
    const { error } = await supabase
      .from("session_guests")
      .update({ left_at: new Date().toISOString() })
      .eq("id", guest.id);
    setBusy(false);
    if (error) return setErr(error.message);
    setGuestServed((m) => {
      const n = { ...m };
      delete n[guest.id];
      return n;
    });
    await load();
    onChanged?.();
  }

  async function setBoss(guest) {
    setBusy(true);
    const off = await supabase
      .from("session_guests")
      .update({ is_boss: false })
      .eq("session_id", sess.id);
    if (off.error) {
      setBusy(false);
      return setErr(off.error.message);
    }
    const { error } = await supabase
      .from("session_guests")
      .update({ is_boss: true })
      .eq("id", guest.id);
    setBusy(false);
    if (error) return setErr(error.message);
    await load();
  }

  const setPref = (guestId, pref) =>
    setGuestPref((m) => ({ ...m, [guestId]: pref }));

  // ---- 付け回し（v1 移植）----
  function nextRotation() {
    return assigned.reduce((m, a) => Math.max(m, a.rotation_no || 0), 0) + 1;
  }

  async function doAssign(guest, castId, mode) {
    setBusy(true);
    const cast = castById[castId];
    const { error } = await supabase.from("session_casts").insert({
      session_id: sess.id,
      cast_id: castId,
      rotation_no: nextRotation(),
      role: guest.is_boss ? "main" : "free",
      started_at: new Date().toISOString(),
      assigned_by: mode, // 'auto' = おすすめ / 'manual' = 指名
      score: cast ? scoreOf(cast) : null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setGuestServed((m) => ({
      ...m,
      [guest.id]: [...new Set([...(m[guest.id] || []), castId])],
    }));
    setPickGuest(null);
    await load();
    onChanged?.();
  }

  // v1 tryAssign: 同一ゲスト重複=絶対NG、同卓既在=警告
  function tryAssign(guest, castId, mode = "manual") {
    if ((guestServed[guest.id] || []).includes(castId)) {
      setNotice({
        type: "ng",
        msg: `🚫 ${guest.guest_name} さんには既に「${castById[castId]?.display_name}」が付いています。同じお客様への重複はNGです。`,
      });
      return;
    }
    if (assignedIds.has(castId)) {
      setNotice({
        type: "warn",
        msg: `⚠️ 「${castById[castId]?.display_name}」はこの卓に既にいます。それでも付けますか？`,
        onOk: () => {
          setNotice(null);
          doAssign(guest, castId, mode);
        },
      });
      return;
    }
    doAssign(guest, castId, mode);
  }

  // v1 suggest: ボスは score優先（同点でジャンル一致）、他は好み一致→score
  function suggest(guest) {
    const pref = guestPref[guest.id];
    let pool = available.filter((c) => !(guestServed[guest.id] || []).includes(c.id));
    if (!pool.length) return null;
    if (guest.is_boss) {
      pool = [...pool].sort(
        (a, b) =>
          scoreOf(b) - scoreOf(a) ||
          (castGenres(b).includes(pref) ? 1 : 0) - (castGenres(a).includes(pref) ? 1 : 0)
      );
      return pool[0];
    }
    const matched = pool.filter((c) => pref && castGenres(c).includes(pref));
    const base = matched.length ? matched : pool;
    return [...base].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  }

  function recommend(guest) {
    const s = suggest(guest);
    if (!s) {
      setNotice({ type: "ng", msg: `空きキャストが足りません（${guest.guest_name} さんに付けられる子がいません）。` });
      return;
    }
    tryAssign(guest, s.id, "auto");
  }

  // v1 autoTable: 未アサインのゲストへ順に1名ずつ、プールを消費
  async function autoTable() {
    let pool = available.slice();
    const ops = [];
    for (const guest of guests) {
      if ((guestServed[guest.id] || []).length) continue;
      const pref = guestPref[guest.id];
      let cand = pool.filter((c) => !(guestServed[guest.id] || []).includes(c.id));
      if (guest.is_boss) cand = [...cand].sort((a, b) => scoreOf(b) - scoreOf(a));
      else {
        const m = cand.filter((c) => pref && castGenres(c).includes(pref));
        cand = (m.length ? m : cand).sort((a, b) => scoreOf(b) - scoreOf(a));
      }
      if (cand[0]) {
        ops.push([guest, cand[0].id]);
        pool = pool.filter((c) => c.id !== cand[0].id);
      }
    }
    if (!ops.length) {
      setNotice({ type: "ng", msg: "全員アサイン済み、または空き不足です。" });
      return;
    }
    for (const [guest, castId] of ops) await doAssign(guest, castId, "auto");
  }

  async function removeCast(sc) {
    setBusy(true);
    const { error } = await supabase
      .from("session_casts")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sc.id);
    setBusy(false);
    if (error) return setErr(error.message);
    setGuestServed((m) => {
      const n = {};
      for (const k of Object.keys(m)) n[k] = m[k].filter((id) => id !== sc.cast_id);
      return n;
    });
    await load();
    onChanged?.();
  }

  // ---- ドリンク ----
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
        <div className="sticky top-0 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 p-4 z-10">
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
            <span className="text-neutral-500 text-xs">終了予定 {hhmm(plannedEnd(sess))}</span>
            <span className="text-neutral-500 text-xs">{sess.head_count}名</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => extend(50)} disabled={busy} style={{ border: `1px solid ${TEAL}`, color: "#a8e6e2" }} className="text-xs rounded-full px-3 py-1.5 font-bold disabled:opacity-50">+50分</button>
            <button onClick={() => extend(60)} disabled={busy} style={{ border: `1px solid ${TEAL}`, color: "#a8e6e2" }} className="text-xs rounded-full px-3 py-1.5 font-bold disabled:opacity-50">+60分</button>
            <button onClick={closeSession} disabled={busy} className="ml-auto text-xs rounded-full px-3 py-1.5 font-bold bg-red-900/70 hover:bg-red-800 text-red-100 flex items-center gap-1 disabled:opacity-50">
              <LogOut size={12} /> 終了
            </button>
          </div>
        </div>

        {err && <div className="mx-4 mt-3 text-xs text-red-400 bg-red-950/50 rounded-lg p-2">{err}</div>}

        {loading ? (
          <div className="py-16 flex justify-center text-neutral-500"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="p-4 space-y-5">
            {/* お客様 ＆ 付け回し */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-neutral-400 flex items-center gap-1">
                  <Users size={14} /> お客様（{guests.length}）
                </div>
                <button
                  onClick={autoTable}
                  disabled={busy || guests.length === 0}
                  style={{ background: GOLD, color: "#000" }}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 disabled:opacity-40"
                >
                  <Wand2 size={12} /> 卓を自動付け回し
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  value={newGuest}
                  onChange={(e) => setNewGuest(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } }}
                  placeholder="お客様名（空欄可）"
                  style={{ fontSize: 16 }}
                  className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500"
                />
                <button onClick={addGuest} disabled={busy} className="px-3 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-700 flex items-center gap-1 text-sm font-semibold">
                  <UserPlus size={15} /> 追加
                </button>
              </div>

              <div className="space-y-3">
                {guests.length === 0 && <div className="text-xs text-neutral-600">お客様を追加してください</div>}
                {guests.map((g) => {
                  const pref = guestPref[g.id];
                  const myCasts = (guestServed[g.id] || [])
                    .map((id) => castById[id])
                    .filter(Boolean);
                  return (
                    <div key={g.id} className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => setBoss(g)}
                          title="ボス指定"
                          className="shrink-0"
                          style={{ color: g.is_boss ? GOLD : "#555" }}
                        >
                          <Crown size={16} />
                        </button>
                        <span className="font-bold text-sm flex-1 truncate">
                          {g.guest_name}
                          {g.is_boss && <span style={{ color: GOLD }} className="text-[10px] ml-1">ボス</span>}
                        </span>
                        <button onClick={() => removeGuest(g)} className="text-neutral-600 hover:text-red-400">
                          <X size={14} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-[10px] text-neutral-500 mr-1">好み</span>
                        {GENRES.map((genre) => (
                          <button
                            key={genre}
                            onClick={() => setPref(g.id, genre)}
                            style={{
                              background: pref === genre ? GENRE_COLOR[genre] : "#1c1c22",
                              color: pref === genre ? "#000" : "#888",
                            }}
                            className="text-[11px] rounded-full px-2 py-0.5 font-bold"
                          >
                            {genre}
                          </button>
                        ))}
                      </div>

                      {myCasts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {myCasts.map((c) => (
                            <span
                              key={c.id}
                              style={{ background: "rgba(63,182,176,.15)", border: `1px solid ${TEAL}`, color: "#a8e6e2" }}
                              className="text-[11px] rounded-full px-2 py-0.5 font-bold"
                            >
                              {c.display_name}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => recommend(g)}
                          disabled={busy}
                          style={{ border: `1px dashed ${GOLD}`, color: GOLD }}
                          className="text-[11px] rounded-full px-2.5 py-1 flex items-center gap-1 disabled:opacity-50"
                        >
                          <Wand2 size={11} /> おすすめ
                        </button>
                        <button
                          onClick={() => setPickGuest(g)}
                          disabled={busy}
                          style={{ border: "1px dashed #444", color: "#999" }}
                          className="text-[11px] rounded-full px-2.5 py-1 flex items-center gap-1 disabled:opacity-50"
                        >
                          <Plus size={11} /> 指名で選ぶ
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* この卓のキャスト（session_casts 実体） */}
            <section>
              <div className="text-sm text-neutral-400 mb-2">この卓のキャスト（{assigned.length}）</div>
              <div className="flex flex-wrap gap-2">
                {assigned.length === 0 && <div className="text-xs text-neutral-600">まだいません</div>}
                {assigned.map((a) => (
                  <span
                    key={a.id}
                    style={{ background: "rgba(201,166,78,.12)", border: `1px solid ${GOLD}`, color: "#e8d29a" }}
                    className="text-[12px] rounded-full pl-3 pr-1 py-1 font-bold flex items-center gap-1"
                  >
                    {castById[a.cast_id]?.display_name || "?"}
                    {a.assigned_by === "auto" && <span className="text-[9px] text-neutral-400">自動</span>}
                    <button onClick={() => removeCast(a)} className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </section>

            {/* ドリンク */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-neutral-400">注文</div>
                <button onClick={() => setShowDrinks((v) => !v)} style={{ border: `1px dashed ${GOLD}`, color: GOLD }} className="text-[11px] rounded-full px-3 py-1 flex items-center gap-1">
                  <Plus size={12} /> ドリンク
                </button>
              </div>

              {showDrinks && (
                <div className="mb-3 bg-neutral-950/60 rounded-xl p-3 border border-neutral-800">
                  <div className="text-[10px] text-neutral-500 mb-1">付けるキャスト（任意）</div>
                  <select value={drinkCast} onChange={(e) => setDrinkCast(e.target.value)} className="w-full bg-neutral-800 rounded-lg px-2 py-1.5 text-sm mb-3 outline-none">
                    <option value="">— なし —</option>
                    {assigned.map((a) => (
                      <option key={a.id} value={a.cast_id}>{castById[a.cast_id]?.display_name || "?"}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    {products.map((p) => (
                      <button key={p.id} onClick={() => addDrink(p)} disabled={busy} className="rounded-lg p-2 text-left bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">
                        <div className="text-xs font-bold flex items-center gap-1"><Wine size={11} className="text-neutral-500" />{p.name}</div>
                        <div className="text-[10px] text-neutral-500">{CATEGORY_LABEL[p.category] || p.category} · {yen(p.price_yen)}</div>
                      </button>
                    ))}
                    {products.length === 0 && <div className="col-span-2 text-xs text-neutral-600">商品がありません</div>}
                  </div>
                </div>
              )}

              <ul className="space-y-1">
                {orders.length === 0 && <li className="text-xs text-neutral-600">注文はまだありません</li>}
                {orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm bg-neutral-800/50 rounded-lg px-3 py-1.5">
                    <span className="flex-1 truncate">
                      {o.item_name}
                      {o.quantity > 1 && <span className="text-neutral-500"> ×{o.quantity}</span>}
                      {o.cast_id && <span className="text-[10px] text-teal-300 ml-2">→ {castById[o.cast_id]?.display_name || "?"}</span>}
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

        {/* 指名ピッカー（v1 CastPicker 相当） */}
        {pickGuest && (
          <CastPicker
            guest={pickGuest}
            pref={guestPref[pickGuest.id]}
            casts={casts}
            presentIds={presentIds}
            busyIds={busyIds}
            assignedIds={assignedIds}
            served={guestServed[pickGuest.id] || []}
            onPick={(castId) => tryAssign(pickGuest, castId, "manual")}
            onClose={() => setPickGuest(null)}
          />
        )}

        {/* NG/警告ダイアログ */}
        {notice && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,.7)" }} onClick={() => setNotice(null)}>
            <div className="w-full max-w-xs bg-neutral-900 rounded-2xl p-5 border border-neutral-800" onClick={(e) => e.stopPropagation()}>
              <div className="text-sm mb-4">{notice.msg}</div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNotice(null)} className="text-xs px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700">
                  {notice.onOk ? "やめる" : "OK"}
                </button>
                {notice.onOk && (
                  <button onClick={notice.onOk} className="text-xs px-3 py-2 rounded-lg font-bold" style={{ background: GOLD, color: "#000" }}>
                    それでも付ける
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// v1 CastPicker 相当: 出勤中で（フリー or 自卓在籍）のキャストを、ジャンル一致を上に表示。
// 同一ゲスト重複は NG（無効化）、同卓既在は警告表示。
function CastPicker({ guest, pref, casts, presentIds, busyIds, assignedIds, served, onPick, onClose }) {
  const list = casts.filter(
    (c) =>
      c.status === "active" &&
      presentIds.has(c.id) &&
      (!busyIds.has(c.id) || assignedIds.has(c.id))
  );
  const sorted = [...list].sort(
    (a, b) =>
      ((Array.isArray(b.genre) && b.genre.includes(pref)) ? 1 : 0) -
      ((Array.isArray(a.genre) && a.genre.includes(pref)) ? 1 : 0)
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-end" style={{ background: "rgba(0,0,0,.6)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-3xl p-4 max-h-[70vh] overflow-y-auto bg-neutral-950 border-t border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">
            {guest.guest_name} さんに付ける（好み: <span style={{ color: GENRE_COLOR[pref] }}>{pref}</span>）
          </h3>
          <button onClick={onClose}><X size={20} color="#888" /></button>
        </div>
        <p className="text-[10px] text-neutral-600 mb-3">※ 出勤中のみ。ジャンル一致を上に表示。</p>
        <div className="grid grid-cols-2 gap-2">
          {sorted.length === 0 && <div className="col-span-2 text-xs text-neutral-600">出勤中のキャストがいません</div>}
          {sorted.map((c) => {
            const ng = served.includes(c.id);
            const here = assignedIds.has(c.id);
            const match = Array.isArray(c.genre) && c.genre.includes(pref);
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                disabled={ng}
                style={{
                  background: ng ? "#161013" : "#141418",
                  border: `1px solid ${ng ? "#5a2222" : match ? TEAL : "#22222a"}`,
                  opacity: ng ? 0.55 : 1,
                }}
                className="rounded-xl p-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{c.display_name}</span>
                  {ng && <span style={{ color: "#e05555" }} className="text-[9px] font-bold">NG重複</span>}
                  {!ng && here && <span style={{ color: "#e0a84a" }} className="text-[9px] font-bold">在卓⚠</span>}
                </div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {(Array.isArray(c.genre) ? c.genre : []).map((g) => (
                    <span key={g} style={{ color: GENRE_COLOR[g] || "#888", border: `1px solid ${GENRE_COLOR[g] || "#444"}` }} className="text-[9px] rounded px-1">{g}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

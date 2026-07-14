import { useState } from "react";
import { X, Loader2, Save, UserMinus, Plus } from "lucide-react";
import { supabase } from "./supabase.js";
import { GOLD, CAST_RANK_LABEL } from "./saasLib.js";

// db.d.ts の CastRank と厳密に一致（DBに CHECK 制約あり）
const RANKS = ["regular", "helper", "shimei", "vip"];

export default function CastForm({ mode, cast, storeId, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [displayName, setDisplayName] = useState(cast?.display_name || "");
  const [rank, setRank] = useState(cast?.rank || "regular");
  const [genre, setGenre] = useState(Array.isArray(cast?.genre) ? cast.genre : []);
  const [genreInput, setGenreInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  function addGenre() {
    const g = genreInput.trim();
    if (g && !genre.includes(g)) setGenre((xs) => [...xs, g]);
    setGenreInput("");
  }
  function removeGenre(g) {
    setGenre((xs) => xs.filter((x) => x !== g));
  }

  async function save() {
    const name = displayName.trim();
    if (!name) {
      setErr("表示名は必須です");
      return;
    }
    setBusy(true);
    setErr(null);
    let error;
    if (isEdit) {
      ({ error } = await supabase
        .from("casts")
        .update({ display_name: name, rank, genre })
        .eq("id", cast.id));
    } else {
      ({ error } = await supabase.from("casts").insert({
        store_id: storeId,
        display_name: name,
        rank,
        genre,
        status: "active",
      }));
    }
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved();
  }

  async function retire() {
    if (!window.confirm(`${cast.display_name} を引退（一覧から非表示）にしますか？`)) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from("casts")
      .update({ status: "retired" })
      .eq("id", cast.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-neutral-900 rounded-2xl p-5 border border-neutral-800 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-bold">
            {isEdit ? "キャスト編集" : "キャスト追加"}
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
            <X size={18} />
          </button>
        </div>

        <div className="text-[10px] text-neutral-500 mb-1">表示名 *</div>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="例: リカ"
          style={{ fontSize: 16 }}
          className="w-full bg-neutral-800 rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-fuchsia-500"
        />

        <div className="text-[10px] text-neutral-500 mb-1">ランク</div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {RANKS.map((r) => (
            <button
              key={r}
              onClick={() => setRank(r)}
              style={{
                background: rank === r ? "rgba(201,166,78,.18)" : "#141418",
                border: `1px solid ${rank === r ? GOLD : "#2a2a32"}`,
                color: rank === r ? "#e8d29a" : "#888",
              }}
              className="rounded-lg py-2 text-xs font-bold"
            >
              {CAST_RANK_LABEL[r]}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-neutral-500 mb-1">ジャンル（自由入力）</div>
        <div className="flex gap-2 mb-2">
          <input
            value={genreInput}
            onChange={(e) => setGenreInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGenre();
              }
            }}
            placeholder="例: 綺麗"
            style={{ fontSize: 16 }}
            className="flex-1 bg-neutral-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500"
          />
          <button
            onClick={addGenre}
            className="px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 flex items-center"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-5 min-h-[1.5rem]">
          {genre.map((g) => (
            <span
              key={g}
              className="text-[12px] rounded-full pl-3 pr-1 py-1 font-bold bg-neutral-800 border border-neutral-700 flex items-center gap-1"
            >
              {g}
              <button
                onClick={() => removeGenre(g)}
                className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {genre.length === 0 && (
            <span className="text-xs text-neutral-600">未設定</span>
          )}
        </div>

        {err && (
          <div className="mb-3 text-xs text-red-400 bg-red-950/50 rounded-lg p-2">{err}</div>
        )}

        <button
          onClick={save}
          disabled={busy}
          className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-700 rounded-lg py-3 font-semibold flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isEdit ? "保存" : "追加"}
        </button>

        {isEdit && (
          <button
            onClick={retire}
            disabled={busy}
            className="mt-3 w-full text-sm text-red-300 hover:text-red-200 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <UserMinus size={14} /> 引退にする（非表示）
          </button>
        )}
      </div>
    </div>
  );
}

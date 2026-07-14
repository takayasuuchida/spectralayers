import { useState, useEffect } from "react";

// v1（src/App.jsx）と揃えたアクセントカラー。フロアの卓カードで使用。
export const GOLD = "#c9a64e";
export const TEAL = "#3fb6b0";

export const yen = (n) => "¥" + (Number(n) || 0).toLocaleString("ja-JP");

// ミリ秒 → "m:ss"（v1の fmt 相当。負値は絶対値で返す）
export const fmt = (ms) => {
  const a = Math.abs(ms);
  const m = Math.floor(a / 60000);
  const s = Math.floor((a % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// セッションの残り時間（ミリ秒）。started_at + planned_minutes - now。
export const remainMs = (session, now) => {
  if (!session) return 0;
  const start = new Date(session.started_at).getTime();
  return start + (session.planned_minutes || 0) * 60000 - now;
};

// 終了予定時刻（Date）
export const plannedEnd = (session) => {
  const start = new Date(session.started_at).getTime();
  return new Date(start + (session.planned_minutes || 0) * 60000);
};

export const hhmm = (d) =>
  d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

// 1秒ごとに現在時刻を返すフック（v1の useNow 相当）。active=false のときは止める。
export function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// 営業日（YYYY-MM-DD）。深夜営業を考慮し、朝6時より前は前日扱い。
export function businessDate(d = new Date()) {
  const x = new Date(d.getTime());
  if (x.getHours() < 6) x.setDate(x.getDate() - 1);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// セット時間の選択肢（分）
export const SET_MINUTES = [50, 60];
// セット料金の選択肢（円）
export const SET_FEES = [4000, 4500, 5000, 6000];

export const CATEGORY_LABEL = {
  drink: "ドリンク",
  bottle: "ボトル",
  shot: "ショット",
  food: "フード",
  set: "セット",
  other: "その他",
};

export const CAST_RANK_LABEL = {
  regular: "レギュラー",
  helper: "ヘルプ",
  shimei: "指名",
  vip: "VIP",
};

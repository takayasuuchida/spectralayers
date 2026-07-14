import { useState } from "react";
import { LogIn, UserPlus, Store, Loader2, LogOut } from "lucide-react";
import { signIn, signUp, signOut, useSession, useMyContext } from "./auth.js";
import { setupAccount } from "./supabase.js";

const INDUSTRIES = [
  { key: "cabaret", label: "キャバクラ" },
  { key: "lounge",  label: "ラウンジ" },
  { key: "snack",   label: "スナック" },
  { key: "oppub",   label: "おっぱぶ" },
  { key: "other",   label: "その他" },
];

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs text-neutral-400 mb-1">{label}</div>
      {children}
    </label>
  );
}

function AuthScreen({ onDone }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        onDone?.();
      } else {
        const r = await signUp(email.trim(), password);
        if (!r?.session) {
          setInfo("確認メールを送信しました。メール内のリンクからログインしてください。");
        } else {
          onDone?.();
        }
      }
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 rounded-2xl p-6 shadow-xl border border-neutral-800">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-600 flex items-center justify-center">
            <Store size={20} />
          </div>
          <div>
            <div className="font-bold text-lg">つけ回しツール</div>
            <div className="text-xs text-neutral-400">
              {mode === "signin" ? "ログイン" : "新規登録"}
            </div>
          </div>
        </div>

        <form onSubmit={submit}>
          <Field label="メールアドレス">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </Field>
          <Field label="パスワード">
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </Field>

          {err && (
            <div className="mb-3 text-sm text-red-400 bg-red-950/50 rounded-lg p-2">
              {err}
            </div>
          )}
          {info && (
            <div className="mb-3 text-sm text-emerald-300 bg-emerald-950/50 rounded-lg p-2">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-neutral-700 disabled:text-neutral-400 rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : mode === "signin" ? (
              <LogIn size={18} />
            ) : (
              <UserPlus size={18} />
            )}
            {mode === "signin" ? "ログイン" : "新規登録"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-neutral-400">
          {mode === "signin" ? (
            <>
              まだアカウントがない？{" "}
              <button
                onClick={() => { setMode("signup"); setErr(null); setInfo(null); }}
                className="text-fuchsia-400 hover:underline"
              >新規登録</button>
            </>
          ) : (
            <>
              すでにアカウントがある？{" "}
              <button
                onClick={() => { setMode("signin"); setErr(null); setInfo(null); }}
                className="text-fuchsia-400 hover:underline"
              >ログイン</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OnboardingScreen({ email, onDone }) {
  const [accountName, setAccountName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [industry, setIndustry] = useState("cabaret");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await setupAccount({
        accountName: accountName.trim(),
        storeName: storeName.trim(),
        industry,
        displayName: displayName.trim(),
      });
      onDone?.();
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 rounded-2xl p-6 shadow-xl border border-neutral-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
            <Store size={20} />
          </div>
          <div>
            <div className="font-bold text-lg">はじめまして</div>
            <div className="text-xs text-neutral-400">{email}</div>
          </div>
        </div>
        <div className="text-sm text-neutral-400 mb-4">
          最初のお店をセットアップします。
        </div>

        <form onSubmit={submit}>
          <Field label="オーナー表示名（任意）">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: たかや"
              className="w-full bg-neutral-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </Field>
          <Field label="会社名 / 屋号（任意）">
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="例: 株式会社◯◯"
              className="w-full bg-neutral-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </Field>
          <Field label="店名">
            <input
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="例: vivace"
              className="w-full bg-neutral-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </Field>
          <Field label="業態">
            <div className="grid grid-cols-3 gap-2">
              {INDUSTRIES.map((it) => (
                <button
                  type="button"
                  key={it.key}
                  onClick={() => setIndustry(it.key)}
                  className={
                    "rounded-lg py-2 text-sm border " +
                    (industry === it.key
                      ? "bg-emerald-600 border-emerald-500"
                      : "bg-neutral-800 border-neutral-700 hover:bg-neutral-700")
                  }
                >{it.label}</button>
              ))}
            </div>
          </Field>

          {err && (
            <div className="mb-3 text-sm text-red-400 bg-red-950/50 rounded-lg p-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Store size={18} />}
            店舗を作成
          </button>
        </form>

        <button
          onClick={async () => { await signOut(); }}
          className="mt-4 w-full text-sm text-neutral-400 hover:text-neutral-200 flex items-center justify-center gap-2"
        >
          <LogOut size={14} /> ログアウト
        </button>
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const { session, loading: loadingSession } = useSession();
  const { ctx, loading: loadingCtx, reload } = useMyContext(session);

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onDone={() => { /* auth change auto-fires */ }} />;
  }

  if (loadingCtx || ctx == null) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!ctx.authenticated) {
    return (
      <OnboardingScreen
        email={session.user?.email}
        onDone={reload}
      />
    );
  }

  return children(ctx, reload);
}

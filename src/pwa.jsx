import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

export function PWAUpdater() {
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateSW, setUpdateSW] = useState(() => () => {});

  useEffect(() => {
    const sw = registerSW({
      onNeedRefresh() { setUpdateReady(true); },
      onOfflineReady() { setOfflineReady(true); setTimeout(() => setOfflineReady(false), 4000); },
    });
    setUpdateSW(() => sw);
  }, []);

  if (!updateReady && !offlineReady) return null;

  return (
    <div style={{
      position: "fixed", bottom: 76, left: 12, right: 12, zIndex: 60,
      background: "#141418", border: "1px solid #c9a64e", borderRadius: 14,
      padding: 12, display: "flex", alignItems: "center", gap: 10, color: "#fff",
      boxShadow: "0 6px 24px rgba(0,0,0,.5)"
    }}>
      {updateReady ? (
        <>
          <span style={{ fontSize: 13, flex: 1 }}>新しいバージョンがあります</span>
          <button onClick={() => updateSW(true)} style={{ background: "#c9a64e", color: "#000", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>更新</button>
          <button onClick={() => setUpdateReady(false)} style={{ background: "#22222a", color: "#aaa", padding: "6px 10px", borderRadius: 8, fontSize: 12 }}>後で</button>
        </>
      ) : (
        <span style={{ fontSize: 13, color: "#a8e6e2" }}>✓ オフラインで使えるようになりました</span>
      )}
    </div>
  );
}

import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { PWAUpdater } from "./pwa.jsx";
import "./index.css";

const SaasApp = lazy(() => import("./saas/SaasApp.jsx"));

function isSaasMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("saas") === "1" || params.get("saas") === "true") return true;
    if (import.meta.env.VITE_SAAS_MODE === "1") return true;
    const host = window.location.hostname;
    if (host.startsWith("app.") || host.startsWith("saas.")) return true;
  } catch { /* noop */ }
  return false;
}

const saas = isSaasMode();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {saas ? (
      <Suspense fallback={<div style={{ padding: 24, color: "#eee" }}>Loading…</div>}>
        <SaasApp />
      </Suspense>
    ) : (
      <>
        <App />
        <PWAUpdater />
      </>
    )}
  </StrictMode>
);

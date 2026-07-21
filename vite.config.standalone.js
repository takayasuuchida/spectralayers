// ダブルクリックで開ける1ファイル版のビルド設定
//   npm run build:standalone → dist-standalone/index.html（全部入り1ファイル）
// PWA プラグインは virtual:pwa-register の解決のためだけに入れている。
// file:// では Service Worker は動かないが registerSW が対応チェックするので無害。
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({ disable: true }),
    viteSingleFile(),
  ],
  build: { outDir: "dist-standalone" },
});

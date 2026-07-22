# つけ回しツール — プロジェクトメモ

キャバクラ卓管理・付け回しアプリ。ユーザーは自店舗（vivace ほか）で実運用中。

## 【最重要】成果物の届け方ルール

**ユーザーは基本モバイル（携帯）で会話している。**

1. **アプリの更新は必ず Artifact（URL）で届ける。** ZIP・PowerShell 手順・ダブルクリック等の PC 前提の案内をデフォルトにしない。
   - 手順: `npm run build:standalone` → `dist-standalone/index.html` から `<style>` と `<script type="module">` を抽出して fragment 化（doctype/html/head/body を除去、`<title>` + `html,body{margin:0;padding:0;background:#000}` を付与）→ Artifact ツールで公開
   - **既存 Artifact URL**: https://claude.ai/code/artifact/365e61fe-c617-4ab0-83d1-ab0c1bce2e18
   - 更新時は**同じ URL を維持**すること（同一会話なら同じ file_path で再公開、別会話なら `url` パラメータに上記 URL を渡す。URL を見失ったら Artifact の `action: "list"` で探す）
   - favicon は 🍾 固定
2. ZIP を渡すのはユーザーが「コードをいじりたい」「PC でやる」と明言した時だけ。その際コマンドは省略せず毎回全部書く（「いつもの3コマンド」等の省略は禁止）。
3. リリースごとに `src/App.jsx` の `APP_VERSION` を上げる（画面右上に表示され、ユーザーがどのビルドか判別する唯一の手段）。

## 開発ルール（ユーザーからの明示指示）

- 新機能を足す時、既存機能を確実に保持する
- 勝手にコミット履歴を消さない（reset/rebase 禁止）
- 修正したら実ブラウザ E2E（Playwright, `/opt/pw-browsers/chromium`）で動作確認してから届ける
- 店名は「vivace」（viverce は誤記）。併存店舗「ANELA」。URL パラメータ `?store=` で切替

## 構成

- `src/App.jsx` — v1 本体（現在 v2.1.x・全フェーズA〜G+リアルタイム共有まで実装済）。実店舗はこれを使用中
  - 実装済: 公平ドラフト付け回し/回転警告/税込会計/客名帳CRM(LTV・DM生成・予約)/ボトルキープ残量/月次給料・振込CSV/在庫・原価/BI分析/頭脳アドバイザー/バックアップ・監査ログ/卓状況のリアルタイム共有(外用ビュー、Supabase public.floor 経由・機密はローカル完結)
  - 未実装: 全データの複数端末同期(共有は卓状況のみ)、Phase H(App Store/Capacitor)は対象外と合意済み
  - 注意: この開発環境から supabase.co へは直接通信不可(プロキシ403)。共有機能の検証は scratchpad の mock-supabase.mjs (PostgREST互換モック) + localStorage "share-endpoint-override" で行う
- `src/saas/` — SaaS 版（Supabase auth + マルチテナント）。プロジェクト `kngkckweonnnhfocfqan`、スキーマ `saas.*`（23テーブル + RLS 投入済）
- `vite.config.standalone.js` — 1ファイル版ビルド（`npm run build:standalone`）
- GitHub リポジトリ `takayasuuchida/spectralayers` は削除済で push 不可。成果物は Artifact URL（+必要時 ZIP）で配布

## 環境の既知問題

- Stop hook の「Unverified commit」警告は GPG 鍵なし環境のため対処不能。無視してよい
- confirm()/alert() はモバイル環境でブロックされることがある → アプリ内 UI（2度押し確認等）を使う

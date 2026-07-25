# つけ回しツール（本番配信リポジトリ）

**アプリURL（恒久固定・変更禁止）: https://takayasuuchida.github.io/spectralayers/**

## AIアシスタント向けの絶対ルール

1. アプリの修正は必ずこのリポジトリの main に `index.html`（ビルド済み1ファイル）を置いて push する。**新しいURL・別のArtifact・別プロジェクトを作らない**
2. main への force push 禁止（履歴保持）。通常コミットで上書きする
3. ソースコードの最新版は `claude/` 系ブランチにある。古いコードから作り直さない。修正前に必ず `src/App.jsx` の `APP_VERSION` を確認し、公開中の版以上であることを確かめる
4. ビルド手順: `npm install` → `npm run build:standalone` → `dist-standalone/index.html` を main の `index.html` として配置
5. データはユーザー端末の localStorage + Supabase クラウド金庫にある。このリポジトリには一切含まれない

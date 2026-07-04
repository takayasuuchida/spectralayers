# ANELA つけ回し管理

キャバクラ「ANELA」向けの卓管理・付け回しアプリ（React + Vite + Tailwind + lucide-react）。
Vercel に自動デプロイされ、iPad / スマホ Safari から使用可能。

## 機能

- **フロア**：VIP・卓2〜卓12 の固定レイアウト（結合対応：3+4／5+6／10-12）
- **卓詳細**：お客様追加、ボス指定、好み（綺麗／可愛い／おもしろい）、座席並び、セット料金／時間（50/60分）、ドリンク・ボトル、会計
- **付け回し**：ボス優先・好みジャンル一致のスコアリングで自動アサイン。同一お客様への同一キャスト重複は禁止、同卓在籍は警告
- **キャスト**：出勤／未出勤、接客中／フリーの状態表示
- **売上**：目標¥1,000,000 に対する進捗、卓別ランキング（会計済含む）
- **設定**：キャストのランク・ジャンル・出勤状況の管理、営業リセット

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド (dist/)
npm run preview  # 本番ビルドをローカルで確認
```

## デプロイ

Vercel が Vite プロジェクトとして自動検出しビルド／デプロイします。

## 永続化

- `localStorage` (`anela-v1`) に自動保存（500msデバウンス）
- Claude 環境上では `window.storage` があればそちらを優先

## 構成

- `src/App.jsx` — アプリ本体（全画面ロジック）
- `src/main.jsx` — エントリ
- `src/index.css` — Tailwind + グローバル
- `index.html` — Vite HTML entry
- `public/manifest.json` — PWA マニフェスト

# viverce つけ回し管理

キャバクラ「viverce」の卓管理・付け回しアプリ（React + Vite + Tailwind + lucide-react + PWA）。
Vercel 自動デプロイ、iPad / スマホから **完全オフライン** で使用可能。

## iPad で使う手順（初回のみ）

1. Safari で Vercel のプレビュー URL を開く
2. ネットに繋がった状態で1回だけロード（Service Worker が全アセットをキャッシュ）
3. 共有ボタン →「ホーム画面に追加」
4. **以降は機内モードでもホーム画面から起動して動作可能**

差分アップデートは自動検知され、画面下部に「新しいバージョンがあります」トーストが出る → 更新ボタンでリロード。

## 機能

- **フロア**：卓を円形カードで表示。50/60分のタイマ、経過・残時間・終了予定
- **卓詳細**：お客様追加、ボス指定、好み（綺麗／可愛い／おもしろい）、座席並び、セット料金／時間、ドリンク・ボトル、会計
- **付け回し**：スコアリング＋好み一致で自動アサイン、同一お客様への重複禁止、同卓在籍は警告
- **キャスト**：出勤／未出勤、接客中／フリーの状態
- **売上**：目標に対する進捗、卓別ランキング
- **設定**：店名（viverce）、売上目標、卓レイアウト（🔒ロック付）、結合グループ、キャスト（ランク・ジャンル）

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド (dist/)
npm run preview  # 本番ビルドをローカル確認
```

アイコン再生成:
```bash
node scripts/gen-icons.mjs
```

## 構成

- `src/App.jsx` — アプリ本体
- `src/main.jsx` — エントリ
- `src/pwa.jsx` — SW 更新通知UI
- `src/index.css` — Tailwind + グローバル
- `public/favicon.svg` / `pwa-*.png` — アイコン類
- `vite.config.js` — Vite + PWA プラグイン
- `scripts/gen-icons.mjs` — SVG から PNG アイコン生成

## 永続化

- `localStorage` (`viverce-v1`) に自動保存（500msデバウンス）
- キャッシュ: Service Worker が全アセットをプリキャッシュ

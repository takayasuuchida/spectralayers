# このリポジトリで作業するときの決まりごと

## ⚠️ 一番やってはいけない失敗：取れなかった応答を「変わっていない」と読むこと

**2026-08-21 に実際にやらかした。二度と繰り返さない。**

board.html を更新して main にマージしたあと、公開ページが反映されたかを
`curl https://takayasuuchida.github.io/spectralayers/board.html | grep 新しい文言`
で10回くり返し確認し、毎回「まだ旧版」と判定した。

実際は **反映済みだった**。この環境から `takayasuuchida.github.io` へは出られず
（egress proxy が CONNECT を 403 で拒否）、curl は毎回**空**を返していた。
空に grep をかければ当然0件になる。それを「古いままだ」と読み違えた。

### ルール

1. **応答が空・exit code≠0・http_code=000 は「結果なし」であって「変化なし」ではない。**
   grep の0件を根拠にする前に、**取得そのものが成功したか**を必ず確かめる。
   ```bash
   curl -sS -w "\nhttp_code=%{http_code}\n" "$URL" -o /tmp/out.html || echo "FETCH FAILED"
   ```
   `-sS` でエラーを出す、`-w` で状態コードを出す、`||` で失敗を明示する。
   パイプで grep に直結しない（失敗が握りつぶされる）。

2. **`*.github.io` にはこの環境から到達できない。** 公開ページの中身を
   直接見にいこうとしないこと。代わりにこの2つで確認する。
   - `https://raw.githubusercontent.com/takayasuuchida/spectralayers/main/<file>`
     → main に何が入っているか（これは到達できる）
   - GitHub Actions の `pages` ワークフローの run が `success` か
     → 配信されたか
   この2つが揃えば「配信済み」と言い切ってよい。**実物の目視は本人に頼む。**

3. **確認できていないことを「確認した」と言わない。** 手段が無いなら
   「ここからは見られないので、そちらで見てほしい」と最初に言う。
   間違った断定は、本人に無駄な調査をさせる。

## 公開のしくみ

- GitHub Pages。`main` に push すると `.github/workflows/pages.yml` が
  リポジトリ全体をそのまま配信する（ビルド無し・`.nojekyll` あり）。
- 反映まで **マージから30秒〜1分**。それでも見えない時は端末のキャッシュ。
  `?v=2` のようにクエリを足して開けば切り分けられる（特に iPhone の
  ホーム画面追加は強くキャッシュする）。

## ファイル

| ファイル | 中身 |
|---|---|
| `index.html` | つけ回しツール本体（vivace が使う。ビルド済み1ファイル・約600KB） |
| `manual.html` | つけ回しツールの説明書 |
| `board.html` | 2店舗の振りっこボード（vivace ⇄ ANELA） |
| `board-manual.html` | 振りっこボードの使い方ガイド |

`board.html` と `board-manual.html` は**必ずセットで直す**。
片方だけ変えると、ガイドが実物に無いボタンを説明する状態になる。

## 振りっこボードのデータの持ち方

Supabase の `public.floor` テーブル（key / data / updated_at）を共有している。

- `board:vivace` / `board:anela` … ボードが書く。
  `{ at, name, leaving[], tables[], setMin, casts{now,total} }`
- `share:viverce` / `share:ANELA` … つけ回しツール（`index.html`）が書く。
  ボードは**読むだけ**。vivace 側はこれがあるので卓の手入力欄を出さない。

**この形は勝手に変えない。** 変えると相手店の画面とつけ回しツールが同時に壊れる。
卓の項目は `{ id, label, cap, guests, startAt, planAt, min }`。
`startAt` が入って初めて「接客中」で、相手店の一覧に載る。

書き込みは必ず「読んでから足す」（`updateMine`）。同じ店で2台同時に触っても
消し合わないようにするため。

## 画面を触るときの前提

深夜営業のキャバクラの、**外に立っているキャッチが片手で使う**画面。

- タップ数を増やさない。文字を小さくしない。1画面に詰め込まない。
- 時刻は5分単位に丸める（両店で読み合うため）。
- 深夜0時をまたぐ。時刻の計算では必ず日またぎを考える
  （`timeToMs` は6時間以上先の指定を前日として扱う）。
- 用語は店の言い方に合わせる：退店予定→**チェック**、延長は
  **ハーフ(25分) / ワンタイム(50分)**、セットは **50分 / 60分**。

## 動作確認のやり方

Playwright + プリインストールの Chromium で確認できる。ブラウザは
ダウンロードしない（`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を
`executablePath` に指定する）。Supabase は `page.route()` で差し替えて、
画面幅は iPhone 相当（390×844）で見る。

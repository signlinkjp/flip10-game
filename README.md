# FLIP 10

数字をひっくり返して、行か列の合計を **10** にして消す1人用パズル。
HTML / CSS / JavaScript（素の ES Modules）＋ Capacitor 8 の iOS アプリ。Build 1。

![home](../downloads/flip10-b1-home.png)

## ルール（3秒でわかる）

1. タップすると、そのマスと上下左右（＋の字）がひっくり返る。青＝表、ピンク＝裏。
2. **基本ルール（Rule B）**: 表と裏は必ず足して5。`0↔5` `1↔4` `2↔3` の3組だけ。
3. 行か列の合計が **10**（設定で 9 / 11 にも変更可）になると、そのラインが金色に光って消え、
   上から新しいタイルが落ちてくる。続けて消すとコンボで得点が上がる。
4. **PRO（買い切り ¥300）**: 上級ルール（Rule A＝裏がバラバラ・右上に裏の数字）、5×5、
   タイムアタック 60秒 / 120秒。

得点は `100 × ライン数 × コンボ（連鎖段数） × 連続消し（最大5）`。

## 遊び方（開発）

```bash
npm test          # ルールと Build 1 の検品（node --test）
npm run serve     # http://localhost:4173 （?test=1 で検証用の窓口が付く）
npm run shots     # 実 Chromium で操作テスト＋スクリーンショット
npm run www       # 配布用 www/ を作る（Capacitor の webDir）
npm run ios:sync  # node tools/make-www.mjs && npx cap sync ios
```

スクリーンショットは `/workspace/downloads/flip10-b1-home.png` / `-play.png` / `-howto.png` / `-pro.png`。

## 構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面（ホーム / プレイ / シート6種）。アイコンは SVG スプライト |
| `styles.css` | 375 / 393px 基準。セーフエリア・Dynamic Island 対応 |
| `src/core.js` | ルールと盤面（DOM も音も知らない純粋なゲーム） |
| `src/i18n.js` | 12言語（ja / en / ko / zh-Hans / zh-Hant / es / fr / de / pt / it / hi / id）。未知の言語は英語 |
| `src/audio.js` | Web Audio のシンセ効果音＋静かなBGM。iOS の消音スイッチ対策3点セット |
| `src/pro.js` | StoreKit 2（`jp.signlink.Flip10.pro`）と PRO の線引き |
| `src/storage.js` | 端末内だけの設定とベストスコア |
| `src/main.js` | 画面・タップ・シート・タイマー |
| `ios/` | Capacitor iOS（`AppDelegate.swift` に StoreKit 2 と音の橋） |
| `docs/privacy.md` | プライバシーポリシー（日本語・英語） |
| `docs/ios-testflight-build1.yml` | GitHub Actions 用 TestFlight ワークフロー |

## プライバシー

完全オフライン・1人プレイ。アカウントなし、入力欄なし、広告・解析なし。
スコアと設定はこの端末の中だけに残り、アプリを消すと一緒に消える。詳細は `docs/privacy.md`。

## TestFlight（Build 1）

1. GitHub に `signlinkjp/flip10-game` を作る（トモアキさん）
2. `.github/workflows/ios-testflight-build1.yml` に `docs/ios-testflight-build1.yml` の中身を貼る（Safari）
3. Actions →「FLIP 10 iOS TestFlight」→ `confirm_bundle_id` に `jp.signlink.Flip10`、`upload_to_testflight` = true
4. App Store Connect: アプリ `FLIP 10`（`jp.signlink.Flip10`）と非消耗型 IAP `jp.signlink.Flip10.pro`
   （表示名 `FLIP 10 PRO`・¥300 プレースホルダ）を登録しておく

ビルド番号は `docs/ios-testflight-build1.yml` の `BUILD_NUMBER` と
`ios/App/App.xcodeproj/project.pbxproj` の `CURRENT_PROJECT_VERSION` を同じ数字に上げる（preflight が食い違いを止める）。

---

© 2026 T-maks Games ・ t.maks.ts@gmail.com

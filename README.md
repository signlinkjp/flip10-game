# FLIP 10

好きな2マスを入れ替えて、行か列の合計を **10** にして消す1人用パズル。
HTML / CSS / JavaScript（素の ES Modules）＋ Capacitor 8 の iOS アプリ。**Build 2**。

![home](../downloads/flip10-b2-home.png)

## ルール（3秒でわかる）

1. **1マス目をタップ**（青く光る）→ **2マス目をタップ**で、2つが入れ替わる。同じマスをもう一度押すと選び直し。
2. 右側に**各行の合計**、下側に**各列の合計**がいつでも出る。合計に近い行・列は黄色く光る。
3. 行か列の合計が **10**（PRO では行・列それぞれ 9〜40）になると、そのラインが金色に光って消え、
   上から新しい数字が落ちてくる。連鎖はコンボで得点アップ。
4. **手数ライフ**: 7手からスタート。1手で −1。1ライン消すと **+3**、2ラインで **+5**、
   3ライン以上か連鎖で **満タン（7）** に回復。0 になったらゲームオーバー（エンドレス得点モード）。
5. **PRO（買い切り ¥300）**: 十字フリップ特別モード（＋の字が反転・表裏で5）、5×5、タイムアタック 60秒 / 120秒、
   行・列の合計を 9〜40 で自由に設定。数字の範囲は target と盤面サイズから自動で決まる。

得点は `100 × ライン数 × コンボ（連鎖段数） × 連続消し（最大5）`。

### 十字フリップ（PRO 特別モード）

Build 1 のルールをそのまま残した特別モード。タップしたマスと上下左右（＋の字）が裏返り、
**表と裏は足して5**（`0↔5` `1↔4` `2↔3`）。行か列の合計が 10 で消える。

### 数字の出し方（スマートプール）

| 盤面 | 合計 | 出す数字 |
| --- | --- | --- |
| 4×4 | 9〜10 | 0〜6 |
| 4×4 | 20 | 2〜8 |
| 4×4 | 28 | 4〜9 |
| 4×4 | 36（4×4 の上限） | 6〜9 |
| 5×5 | 9 | 0〜5 |
| 5×5 | 25 | 2〜8 |
| 5×5 | 40 | 5〜9 |

9 が使いづらい低い合計では小さい数字だけ、0 を多用しない高い合計では 6〜9 だけ、というように
`target / 盤面サイズ` の平均まわり ±3 で決める（`digitPool`）。4×4 は 9×4 = 36 が上限。
盤面は「最初から消えていない」「必ず1手ある」状態で作る（`makeBoard` / `ensurePlayable`）。

## 画面と設定

- **明るいポップなライトテーマ**（空色〜クリームの背景・白い数字カード・紺の文字）
- **文字サイズ** 標準 / 大きめ / 特大（設定。375px でもはみ出さない）
- **プレイ中の ⚙️ 設定ボタン**と、設定シート（音・BGM・バイブ・ヒント・文字サイズ・合計）
- **ヒント** ON/OFF（既定 ON）。ヒントボタンで消せる2マス（十字フリップは1マス）がやさしく脈打つ。
  9秒操作がないときも自動でヒントを出す。
- **バイブ（iOS Haptics）** ON/OFF（既定 ON）。選択 light / 入れ替え medium / ライン消去 success /
  コンボ2以上 heavy+success / ゲームオーバー error。
- **BGM のバックグラウンド漏れ対策**: `visibilitychange` / `pagehide` / `blur` で `AudioContext` を suspend、
  `AppDelegate.swift` でも `willResignActive` / `didEnterBackground` で JS を呼び、`AVAudioSession` を
  `setActive(false)` する（ホーム画面に BGM を残さない）。

## 遊び方（開発）

```bash
npm test          # ルールと Build 2 の検品（node --test）
npm run serve     # http://localhost:4173 （?test=1 で検証用の窓口が付く）
npm run shots     # 実 Chromium で操作テスト＋スクリーンショット
npm run www       # 配布用 www/ を作る（Capacitor の webDir）
npm run ios:sync  # node tools/make-www.mjs && npx cap sync ios
```

スクリーンショットは `/workspace/downloads/flip10-b2-home.png` / `-play.png` / `-pro.png` / `-howto.png`。

## 構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面（ホーム / プレイ / シート6種）。アイコンは SVG スプライト |
| `styles.css` | 明るいライトテーマ。375 / 393px 基準。セーフエリア・文字サイズ3段階 |
| `src/core.js` | ルールと盤面（DOM も音も知らない純粋なゲーム） |
| `src/i18n.js` | 12言語（ja / en / ko / zh-Hans / zh-Hant / es / fr / de / pt / it / hi / id）。未知の言語は英語 |
| `src/audio.js` | Web Audio のシンセ効果音＋静かなBGM。コンボで音程と和音が厚くなる。画面を離れると suspend |
| `src/haptics.js` | iOS のバイブ（`FlipHaptics`）。Web では navigator.vibrate |
| `src/pro.js` | StoreKit 2（`jp.signlink.Flip10.pro`）と PRO の線引き |
| `src/storage.js` | 端末内だけの設定とベストスコア |
| `src/main.js` | 画面・タップ・シート・タイマー |
| `ios/` | Capacitor iOS（`AppDelegate.swift` に StoreKit 2・音・バイブの橋） |
| `docs/privacy.md` | プライバシーポリシー（日本語・英語） |
| `docs/ios-testflight-build1.yml` | GitHub Actions 用 TestFlight ワークフロー（ビルド番号は自動で読む） |

## プライバシー

完全オフライン・1人プレイ。アカウントなし、入力欄なし、広告・解析なし。
スコアと設定はこの端末の中だけに残り、アプリを消すと一緒に消える。詳細は `docs/privacy.md`。

## TestFlight（Build 2）

1. `docs/ios-testflight-build1.yml` の中身を `.github/workflows/ios-testflight-build1.yml` に貼る
   （Build 2 からビルド番号を iOS プロジェクトから自動で読むので、次のビルド以降は貼り替え不要）
2. Actions →「FLIP 10 iOS TestFlight」→ `confirm_bundle_id` に `jp.signlink.Flip10`、`upload_to_testflight` = true
3. App Store Connect: アプリ `FLIP 10`（`jp.signlink.Flip10`）と非消耗型 IAP `jp.signlink.Flip10.pro`
   （表示名 `FLIP 10 PRO`・¥300 プレースホルダ）

ビルド番号は `ios/App/App.xcodeproj/project.pbxproj` の `CURRENT_PROJECT_VERSION`（Debug / Release 両方）で管理する。
ワークフローの preflight が食い違いを止める。

---

© 2026 T-maks Games ・ t.maks.ts@gmail.com

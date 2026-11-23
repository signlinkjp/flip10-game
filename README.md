# LINEZAP

好きな2マスを入れ替えて、行か列の合計を**目標の数字**にそろえて消す1人用パズル。
HTML / CSS / JavaScript（素の ES Modules）＋ Capacitor 8 の iOS アプリ。**Build 3**。

![home](../downloads/linezap-b3-home.png)

## ルール（3秒でわかる）

1. **1マス目を押したまま、入れ替えたいマスまでドラッグ**して離すと、2つが入れ替わる。
   **タップ → タップ**でも同じ（同じマスをもう一度押すと選び直し）。
2. 右側に**各行の合計**、下側に**各列の合計**が **`今の合計/目標`**（例 `9/10`）で出る。
   設定の「ヒント」を OFF にすると分子が **`？/10`** になり、暗算で遊べる（分母の目標は常に表示）。
3. 行か列の合計が**目標**とぴったりになると、そのラインが金色に光って消え、
   上から新しい数字が落ちてくる。連鎖はコンボで得点アップ。
4. **手数ライフ**: 7手からスタート。1手で −1。1ライン消すと **+3**、2ラインで **+5**、
   3ライン以上か連鎖で **満タン（7）** に回復。0 になったらゲームオーバー（エンドレス得点モード）。
5. **PRO（買い切り ¥300）**: 十字フリップ特別モード（＋の字が反転・表裏で5）、**5×5**、**6×6**、
   タイムアタック 60秒 / 120秒、**5×5 / 6×6 の消える合計を 12〜42 で設定**。

得点は `100 × ライン数 × コンボ（連鎖段数） × 連続消し（最大5）`。

### 消える合計（Build 3 から行も列も同じ1つ）

| 盤面 | 消える合計 |
| --- | --- |
| 4×4（クラシック / 十字フリップ / タイムアタック） | **10 固定** |
| 5×5（PRO） | **12〜42**（既定 20） |
| 6×6（PRO） | **12〜42**（既定 20） |

設定画面のステッパーは **`− 20 ＋` の1つだけ**。行と列で別々の数字にはしない
（大きく離すと数字が噛み合わず詰みやすいため）。

### 十字フリップ（PRO 特別モード）

Build 1 のルールをそのまま残した特別モード。タップしたマスと上下左右（＋の字）が裏返り、
**表と裏は足して5**（`0↔5` `1↔4` `2↔3`）。行か列の合計が 10 で消える。
ホームの十字フリップのカードに、この表裏の対応を小さく入れている。

### 数字の出し方（スマートプール）

| 盤面 | 合計 | 出す数字 |
| --- | --- | --- |
| 4×4 | 10（固定） | 0〜6 |
| 5×5 | 12 | 0〜6 |
| 5×5 | 20 | 1〜7 |
| 5×5 | 42 | 5〜9 |
| 6×6 | 12 | 0〜5 |
| 6×6 | 20 | 0〜7 |
| 6×6 | 42 | 4〜9 |

`target / 盤面サイズ` の平均まわり ±3 で範囲を決め（`digitPool`）、盤面を作るときは
その平均を頂点にした山なり分布で出す（`poolFor` の `center` / `bell`）。
だから平均 2〜7 の数字が自然に作れて、目標 12〜42 のどこでも「1手でそろえられる」盤面になる。
盤面は「最初から消えていない」「必ず1手ある」状態で作る（`makeBoard` / `ensurePlayable`）。

## 画面と設定

- **初回起動のオープニング**: `LINEZAP` ロゴと黄金ラインが「パチッ」と光る 1.6秒の演出。
  **画面タップで即スキップ**。演出が終わるとホームへ。
- **明るいポップなライトテーマ**（空色〜クリームの背景・白い数字カード・紺の文字）
- **文字サイズ** 標準 / 大きめ / 特大（設定。375px でもはみ出さない）
- **BGM は Build 3 から最初から ON**（`bgmDefault: 3`。ユーザーが OFF にしたら以降は尊重する）
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
npm test          # ルールと Build 3 の検品（node --test）
npm run serve     # http://localhost:4173 （?test=1 で検証用の窓口が付く）
npm run shots     # 実 Chromium で操作テスト＋スクリーンショット
npm run www       # 配布用 www/ を作る（Capacitor の webDir）
npm run ios:sync  # node tools/make-www.mjs && npx cap sync ios
python3 tools/build-i18n.py   # 12言語の表から src/i18n.js を作り直す
python3 tools/make-icon.py    # アイコンを各サイズに書き出す
```

スクリーンショットは `/workspace/downloads/linezap-b3-opening.png` / `-home.png` / `-play6.png` /
`-hint-off.png` / `-settings.png`（と 375px・特大の `-home-375-xl.png` / `-play6-375-xl.png`）。

## 構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | オープニング / ホーム / プレイ / シート6種。アイコンは SVG スプライト |
| `styles.css` | 明るいライトテーマ。375 / 393px 基準。セーフエリア・文字サイズ3段階・6×6 の寸法 |
| `src/core.js` | ルールと盤面（DOM も音も知らない純粋なゲーム） |
| `src/i18n.js` | 12言語（ja / en / ko / zh-Hans / zh-Hant / es / fr / de / pt / it / hi / id）。未知の言語は英語 |
| `src/audio.js` | Web Audio のシンセ効果音（オープニングの zap を含む）＋静かなBGM |
| `src/haptics.js` | iOS のバイブ（`FlipHaptics`）。Web では navigator.vibrate |
| `src/pro.js` | StoreKit 2（`jp.signlink.Flip10.pro`）と PRO の線引き |
| `src/storage.js` | 端末内だけの設定（消える合計・BGM の既定版）とベストスコア |
| `src/main.js` | 画面・ドラッグ/タップ・シート・タイマー・オープニング |
| `ios/` | Capacitor iOS（`AppDelegate.swift` に StoreKit 2・音・バイブの橋） |
| `assets/linezap-appicon-1024.png` | アプリアイコン（1024・RGB・透過なし）。`assets/appicon/` に各サイズ |
| `docs/privacy.md` | プライバシーポリシー（日本語・英語） |
| `docs/ios-testflight-build1.yml` | GitHub Actions 用 TestFlight ワークフロー（ビルド番号は自動で読む） |

## プライバシー

完全オフライン・1人プレイ。アカウントなし、入力欄なし、広告・解析なし。
スコアと設定はこの端末の中だけに残り、アプリを消すと一緒に消える。詳細は `docs/privacy.md`。

## TestFlight（Build 3）

1. `docs/ios-testflight-build1.yml` の中身を `.github/workflows/ios-testflight-build1.yml` に貼る
   （ビルド番号は iOS プロジェクトの `CURRENT_PROJECT_VERSION` から自動で読むので、
   次のビルド以降は貼り替え不要。Build 3 では表示名 `LINEZAP` のチェックが入っている）
2. Actions →「LINEZAP iOS TestFlight」→ `confirm_bundle_id` に `jp.signlink.Flip10`、`upload_to_testflight` = true
3. App Store Connect: アプリ `LINEZAP`（`jp.signlink.Flip10`）と非消耗型 IAP `jp.signlink.Flip10.pro`
   （表示名 `LINEZAP PRO`・¥300 プレースホルダ）
   ※ Bundle ID と IAP 製品 ID は登録済みのため **変更しない**（表示名だけ LINEZAP）

ビルド番号は `ios/App/App.xcodeproj/project.pbxproj` の `CURRENT_PROJECT_VERSION`（Debug / Release 両方）で管理する。
ワークフローの preflight が食い違いを止める。

---

© 2026 T-maks Games ・ t.maks.ts@gmail.com

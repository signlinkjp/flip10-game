/**
 * LINEZAP — Build 3 の検品（node --test）
 *
 * 「12言語そろっている」「画面と操作のキーが全部ある」「iOS の約束が守られている」
 * 「オープニング・ドラッグ・6×6・今の合計/目標・BGM 既定ON が入っている」
 * 「端末の記録が壊れても遊べる」を、ファイルと純関数の両方から確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as i18n from '../src/i18n.js';
import * as pro from '../src/pro.js';
import * as storage from '../src/storage.js';
import * as core from '../src/core.js';
import { createAudioEngine } from '../src/audio.js';
import { createHaptics, HAPTIC_PLUGIN, HAPTIC_KINDS } from '../src/haptics.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(resolve(ROOT, relative), 'utf8');
const exists = (relative) => existsSync(resolve(ROOT, relative));

const HTML = read('index.html');
const CSS = read('styles.css');
const MAIN = read('src/main.js');
const CORE = read('src/core.js');
const STORE = read('src/storage.js');
const AUDIO = read('src/audio.js');
const I18N = read('src/i18n.js');
const HAPTICS = read('src/haptics.js');
const PBX = read('ios/App/App.xcodeproj/project.pbxproj');
const APPDELEGATE = read('ios/App/App/AppDelegate.swift');
const SCENEDELEGATE = read('ios/App/App/SceneDelegate.swift');
const INFO = read('ios/App/App/Info.plist');
const WORKFLOW = read('docs/ios-testflight-build1.yml');
const PRIVACY = read('docs/privacy.md');
const README = read('README.md');

function memoryBackend() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/* ------------------------------------------------------------------ */
/* 12言語                                                              */
/* ------------------------------------------------------------------ */

test('12言語がそろっていて、どの言語にも全キーがある', () => {
  assert.equal(i18n.LOCALES.length, 12);
  const ids = i18n.LOCALES.map((locale) => locale.id);
  for (const expected of ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt', 'it', 'hi', 'id']) {
    assert.ok(ids.includes(expected), `${expected} が無い`);
  }
  for (const locale of i18n.LOCALES) {
    const table = i18n.DICT[locale.id];
    assert.ok(table, `${locale.id} の辞書が無い`);
    for (const key of i18n.KEYS) {
      assert.equal(typeof table[key], 'string', `${locale.id} に ${key} が無い`);
      assert.ok(table[key].trim().length > 0, `${locale.id} の ${key} が空`);
    }
  }
});

test('Build 3 の新しい文言が12言語にある（6×6・？・オープニング・合計）', () => {
  for (const key of [
    'mode.wide6',
    'mode.wide6.desc',
    'hud.sumHidden',
    'opening.skip',
    'settings.targetKey',
    'settings.targetFixed',
    'settings.targetNote',
    'rules.line',
    'rules.swap',
    'pro.f2',
    'pro.f4',
  ]) {
    assert.ok(i18n.KEYS.includes(key), `${key} が辞書に無い`);
    for (const locale of i18n.LOCALES) {
      assert.ok(i18n.DICT[locale.id][key].trim().length > 0, `${locale.id}の${key}`);
    }
  }
  // 行・列別々の古いキーは消えている
  for (const gone of ['settings.targetRow', 'settings.targetCol', 'settings.targetCap', 'toast.cap']) {
    assert.ok(!i18n.KEYS.includes(gone), `${gone} が残っている`);
  }
  // どこにも FLIP 10 が残っていない
  assert.ok(!I18N.includes('FLIP 10'), 'FLIP 10 が辞書に残っている');
  assert.ok(I18N.includes('LINEZAP PRO'));
});

test('モードの説明は2行に分かれていて、不自然な1文字折り返しをしない', () => {
  for (const locale of i18n.LOCALES) {
    for (const id of ['classic', 'wide', 'wide6', 'cross', 'time']) {
      const desc = i18n.DICT[locale.id][`mode.${id}.desc`];
      assert.ok(desc.includes('\n'), `${locale.id}/${id} が2行になっていない`);
      assert.equal(desc.split('\n').length, 2, `${locale.id}/${id} が2行でない`);
      assert.ok(desc.split('\n').every((line) => line.trim().length > 0));
    }
  }
  assert.ok(CSS.includes('white-space: pre-line'));
});

test('数字のプレースホルダ（合計・？）が言語ごとに置き換わる', () => {
  const ja = i18n.DICT.ja['rules.line'];
  assert.ok(ja.includes('{target}'));
  assert.equal(i18n.t('rules.line', 'ja', { target: 20 }), '行も列も 20 でラインが消える');
  assert.equal(i18n.t('rules.line', 'en', { target: 30 }), 'Rows and columns clear at 30');
  assert.equal(i18n.DICT.ja['hud.sumHidden'], '？');
  assert.equal(i18n.DICT.en['hud.sumHidden'], '?');
});

/* ------------------------------------------------------------------ */
/* 設定（端末の中だけ）                                                */
/* ------------------------------------------------------------------ */

test('設定の既定値は 音ON / BGM ON / ヒントON / バイブON / 標準 / 合計20', () => {
  const clean = storage.normalizeSettings({});
  assert.deepEqual(clean, {
    sound: true,
    bgm: true,
    bgmDefault: storage.BGM_DEFAULT_VERSION,
    hint: true,
    haptic: true,
    textSize: 'normal',
    locale: null,
    target: 20,
  });
  assert.equal(storage.BGM_DEFAULT_VERSION, 3);
});

test('古い設定（BGM OFF・行/列別々）から Build 3 に引き継ぐ', () => {
  // Build 2 までの設定: bgm=false, rowTarget=14, colTarget=22
  const migrated = storage.normalizeSettings({ sound: false, bgm: false, hint: false, haptic: false, textSize: 'xl', locale: 'ko', rowTarget: 14, colTarget: 22 });
  assert.equal(migrated.bgm, true, 'Build 3 で一度だけ ON になる');
  assert.equal(migrated.bgmDefault, 3);
  assert.equal(migrated.target, 14, '行の合計を引き継ぐ');
  assert.equal(migrated.sound, false);
  assert.equal(migrated.textSize, 'xl');
  assert.equal(migrated.locale, 'ko');
  // 一度保存したあとは、ユーザーの OFF を尊重する
  const backend = memoryBackend();
  storage.saveSettings({ ...migrated, bgm: false }, backend);
  assert.equal(storage.loadSettings(backend).bgm, false);
  storage.saveSettings({ ...migrated, bgm: true }, backend);
  assert.equal(storage.loadSettings(backend).bgm, true);
});

test('Build 3 の BGM 既定を通したかどうかを判定できる', () => {
  const backend = memoryBackend();
  assert.equal(storage.needsBgmDefault(backend), true);
  storage.saveSettings({}, backend);
  assert.equal(storage.needsBgmDefault(backend), false);
  backend.setItem(storage.SETTINGS_KEY, JSON.stringify({ bgm: false, bgmDefault: 2 }));
  assert.equal(storage.needsBgmDefault(backend), true);
});

test('設定は壊れた値でも既定に戻る（合計は 12〜42）', () => {
  const clean = storage.normalizeSettings({ sound: 'yes', bgm: null, hint: 'no', haptic: 'maybe', textSize: 'huge', locale: 'klingon', target: 999 });
  assert.equal(clean.sound, true);
  assert.equal(clean.hint, true);
  assert.equal(clean.haptic, true);
  assert.equal(clean.textSize, 'normal');
  assert.equal(clean.locale, null);
  assert.equal(clean.target, 42);
  assert.equal(storage.normalizeSettings({ target: 3 }).target, 12);
  assert.equal(storage.normalizeSettings({ target: 'x' }).target, 20);
  assert.equal(storage.normalizeTarget(30), 30);
});

test('設定は保存して読み戻せる', () => {
  const backend = memoryBackend();
  storage.saveSettings({ sound: false, bgm: false, hint: false, haptic: false, textSize: 'large', locale: 'en', target: 26 }, backend);
  assert.deepEqual(storage.loadSettings(backend), {
    sound: false,
    bgm: false,
    bgmDefault: 3,
    hint: false,
    haptic: false,
    textSize: 'large',
    locale: 'en',
    target: 26,
  });
  backend.setItem(storage.SETTINGS_KEY, '{{ broken');
  assert.deepEqual(storage.loadSettings(backend), storage.DEFAULT_SETTINGS);
});

test('4×4 の合計は 10 固定、5×5 / 6×6 は設定値', () => {
  assert.deepEqual(storage.targetsFor({ target: 30 }, 4), { rows: 10, cols: 10 });
  assert.deepEqual(storage.targetsFor({ target: 30 }, 5), { rows: 30, cols: 30 });
  assert.deepEqual(storage.targetsFor({ target: 42 }, 6), { rows: 42, cols: 42 });
  assert.deepEqual(storage.targetsFor({ target: 5 }, 6), { rows: 12, cols: 12 });
});

test('ベストは上がるときだけ更新し、モード別に持つ（6×6 も別）', () => {
  const backend = memoryBackend();
  assert.equal(storage.bestFor('classic', backend), 0);
  assert.deepEqual(storage.recordScore('classic', 1200, backend), { best: 1200, isNew: true });
  assert.deepEqual(storage.recordScore('classic', 900, backend), { best: 1200, isNew: false });
  storage.recordScore('wide6', 700, backend);
  assert.equal(storage.bestFor('wide6', backend), 700);
  storage.clearBests(backend);
  assert.deepEqual(storage.loadBests(backend), {});
});

test('最初の言語は 保存 → 端末 → 英語 の順', () => {
  assert.equal(storage.initialLocale({ locale: 'ko' }, { language: 'ja-JP' }), 'ko');
  assert.equal(storage.initialLocale({ locale: null }, { language: 'ja-JP' }), 'ja');
  assert.equal(storage.initialLocale({ locale: null }, { language: 'th-TH' }), 'en');
  assert.equal(storage.initialLocale({ locale: null }, null), i18n.DEFAULT_LOCALE);
});

/* ------------------------------------------------------------------ */
/* PRO                                                                 */
/* ------------------------------------------------------------------ */

test('無料はクラシックだけ。5×5・6×6・十字フリップ・タイムアタックは PRO', () => {
  assert.equal(pro.canPlayMode(false, 'classic'), true);
  for (const id of ['wide', 'wide6', 'cross', 'time']) {
    assert.equal(pro.canPlayMode(false, id), false, `${id} が無料になっている`);
    assert.equal(pro.canPlayMode(true, id), true, `PRO で ${id} が遊べない`);
  }
  assert.deepEqual(pro.modesFor(false), ['classic']);
  assert.deepEqual(pro.modesFor(true), ['classic', 'wide', 'wide6', 'cross', 'time']);
});

test('商品IDと価格のプレースホルダ', () => {
  assert.equal(pro.PRODUCT_ID, 'jp.signlink.Flip10.pro');
  assert.equal(pro.fallbackPrice('ja'), '¥300');
  assert.equal(pro.priceFor('ja', { price: '¥350' }), '¥350');
  assert.ok(MAIN.includes('pro.priceFor'));
});

test('StoreKit が無い Web プレビューは preview（課金しない）', () => {
  assert.equal(pro.mode(), 'preview');
  assert.equal(pro.previewAllowed(), true);
  assert.equal(pro.initialEntitlement(), false);
});

/* ------------------------------------------------------------------ */
/* 画面（index.html / styles.css / main.js）                           */
/* ------------------------------------------------------------------ */

test('タイトル・表示名・メタが LINEZAP（Build 3）', () => {
  assert.ok(HTML.includes('<title>LINEZAP</title>'));
  assert.ok(HTML.includes('content="Build 3"'));
  assert.ok(HTML.includes('<span class="brand__name">LINEZAP</span>'));
  assert.ok(HTML.includes('class="hero__logo"'));
  assert.ok(!HTML.includes('FLIP 10'), 'index.html に FLIP 10 が残っている');
  assert.ok(MAIN.includes("document.title = 'LINEZAP'"));
  assert.ok(CSS.includes('LINEZAP — styles (Build 3)'));
});

test('オープニング画面（ロゴ＋黄金ライン・タップでスキップ）がある', () => {
  assert.ok(HTML.includes('id="opening"'));
  assert.ok(HTML.includes('class="opening__logo"'));
  assert.ok(HTML.includes('class="opening__zap"'));
  assert.ok(HTML.includes('data-i18n="opening.skip"'));
  assert.ok(CSS.includes('.opening__zap'));
  assert.ok(CSS.includes('@keyframes zapLine'));
  assert.ok(CSS.includes('@keyframes openingZap'));
  assert.ok(MAIN.includes('const OPENING_MS'));
  assert.ok(MAIN.includes('function finishOpening'));
  assert.ok(MAIN.includes('function startOpening'));
  assert.ok(MAIN.includes('node.addEventListener(\'pointerdown\''));
  assert.ok(AUDIO.includes('function zap()'));
  assert.ok(MAIN.includes('audio.zap()'));
});

test('ホームは 5モード・十字フリップの説明はカードの中・中央の凡例は外した', () => {
  assert.ok(HTML.includes('id="mode-list"'));
  assert.ok(!HTML.includes('id="legend-home"'), 'ホーム中央の凡例が残っている');
  assert.ok(MAIN.includes('mode__pairs'));
  assert.ok(MAIN.includes('core.pairLegend()'));
  assert.ok(CSS.includes('.mode__pairs'));
  // ロゴとミニ盤面が重ならないように、ホームは縦スクロールを許す
  assert.ok(CSS.includes('.screen--home'));
  assert.ok(CSS.includes('overflow-y: auto'));
});

test('合計バッジは「今の合計/目標」・ヒントOFFで「？/目標」', () => {
  assert.ok(MAIN.includes('hud.sumHidden'));
  assert.ok(MAIN.includes('`${show ? value : hidden}/${rowTarget}`'));
  assert.ok(MAIN.includes('state.settings.hint'));
  assert.ok(MAIN.includes("node.classList.toggle('is-hit', show && value === rowTarget)"));
  assert.ok(HTML.includes('id="sums-rows"'));
  assert.ok(HTML.includes('id="sums-cols"'));
});

test('ドラッグで2マス入れ替え（タップ2回も併用）', () => {
  for (const piece of ['function tileIndexAt', 'function paintDrag', 'function onBoardPointerDown', 'function onPointerMove', 'function onPointerUp', 'elementFromPoint', 'DRAG_THRESHOLD']) {
    assert.ok(MAIN.includes(piece), `${piece} が無い`);
  }
  assert.ok(MAIN.includes("addEventListener('pointerdown', onBoardPointerDown)"));
  assert.ok(MAIN.includes("addEventListener('pointermove', onPointerMove"));
  assert.ok(MAIN.includes("addEventListener('pointerup'"));
  assert.ok(MAIN.includes('state.suppressClick'), 'ドラッグ後の click を捨てていない');
  assert.ok(CSS.includes('.tile.is-drag-source'));
  assert.ok(CSS.includes('.tile.is-drop-target'));
  assert.ok(CSS.includes('touch-action: none'));
  // 十字フリップはタップのまま（ドラッグでは入れ替えない）
  assert.ok(MAIN.includes('game.mechanic !== core.MECHANIC.swap || state.busy'));
});

test('6×6 の盤面と、1マス44px以上を守る CSS がある', () => {
  assert.ok(HTML.includes('id="board-wrap"'));
  assert.ok(CSS.includes('.board--6'));
  assert.ok(CSS.includes('.board-wrap.is-6'));
  assert.ok(MAIN.includes('`board board--${game.size}`'));
  assert.ok(MAIN.includes('`board-wrap is-${game.size}`'));
  assert.ok(CORE.includes("id: 'wide6'"));
});

test('設定の消える合計は1つのステッパー（12〜42）', () => {
  assert.ok(HTML.includes('id="set-target-value"'));
  assert.equal((HTML.match(/class="stepper"/g) ?? []).length, 1);
  assert.ok(!HTML.includes('data-axis'));
  assert.ok(MAIN.includes('core.MIN_TARGET'));
  assert.ok(MAIN.includes('core.MAX_TARGET'));
  assert.ok(HTML.includes('data-i18n="settings.targetFixed"'));
});

test('プレイ中の目標表示は「目標 20」', () => {
  assert.ok(HTML.includes('id="target-text"'));
  assert.ok(HTML.includes('data-i18n="settings.targetKey"'));
  assert.ok(MAIN.includes("targetText.textContent = String(game.targets.rows)"));
});

test('ビルド番号の表示は Build 3', () => {
  assert.ok(MAIN.includes('(Build ${state.build})'));
  assert.ok(MAIN.includes('build: core.BUILD'));
  assert.equal(core.BUILD, 3);
});

/* ------------------------------------------------------------------ */
/* 音・バイブ                                                          */
/* ------------------------------------------------------------------ */

test('BGM はまず ON で始まる（設定の既定 true）', () => {
  assert.equal(storage.DEFAULT_SETTINGS.bgm, true);
  assert.ok(MAIN.includes('storage.needsBgmDefault()'));
  assert.ok(MAIN.includes('audio.setBgm(true)'));
  assert.ok(STORE.includes('BGM_DEFAULT_VERSION'));
});

test('音はマナースイッチ対策の3点セットを持ち、画面を離れると止まる', () => {
  assert.ok(AUDIO.includes("AUDIO_SESSION_TYPE = 'playback'"));
  assert.ok(AUDIO.includes('navigatorLike.audioSession'));
  assert.ok(AUDIO.includes('SILENT_WAV'));
  assert.ok(AUDIO.includes('FlipAudio'));
  assert.ok(AUDIO.includes('function pause()'));
  assert.ok(AUDIO.includes('ctx.suspend()'));
  assert.ok(MAIN.includes('window.__flipPauseAudio'));
  assert.ok(AUDIO.includes('zap'));
});

test('AudioContext が無くても音の関数は落ちない（zap を含む）', () => {
  const engine = createAudioEngine({ AudioContextClass: null, navigatorLike: null, capacitorLike: null });
  assert.equal(engine.unlock(), false);
  for (const name of ['tap', 'flip', 'clear', 'drop', 'record', 'over', 'zap']) {
    assert.equal(typeof engine[name], 'function', `${name} が無い`);
    engine[name]();
  }
  engine.setBgm(true);
  engine.setBgm(false);
  engine.pause();
  engine.resume();
  assert.equal(engine.bgm, false);
});

test('バイブ（FlipHaptics）が選択・入れ替え・消去・終了で呼ばれる', () => {
  const calls = [];
  const haptics = createHaptics({
    enabled: true,
    capacitorLike: { isNativePlatform: () => true, Plugins: { [HAPTIC_PLUGIN]: { haptic: (options) => calls.push(options.kind) } } },
  });
  haptics.select();
  haptics.swap();
  haptics.clear();
  haptics.combo();
  haptics.over();
  haptics.haptic('warning');
  assert.deepEqual(calls, ['light', 'medium', 'success', 'heavy', 'success', 'error', 'warning']);
  assert.deepEqual([...HAPTIC_KINDS], ['light', 'medium', 'heavy', 'success', 'warning', 'error']);
  haptics.setEnabled(false);
  haptics.select();
  assert.equal(calls.length, 7, 'OFF のときは震えない');
  assert.equal(haptics.enabled, false);
  for (const piece of ['haptics.select()', 'haptics.swap()', 'haptics.clear()', 'haptics.combo()', 'haptics.over()', 'haptics.setEnabled']) {
    assert.ok(MAIN.includes(piece), `${piece} が無い`);
  }
  assert.ok(APPDELEGATE.includes('@objc(FlipHapticsPlugin)'));
  assert.ok(APPDELEGATE.includes('jsName = "FlipHaptics"'));
  assert.ok(APPDELEGATE.includes('registerPluginInstance(FlipHapticsPlugin())'));
  assert.ok(HAPTICS.includes("HAPTIC_PLUGIN = 'FlipHaptics'"));
});

/* ------------------------------------------------------------------ */
/* iOS プロジェクトと配信                                              */
/* ------------------------------------------------------------------ */

test('iOS は jp.signlink.Flip10 / LINEZAP / 1.0.0 / Build 3', () => {
  assert.ok(PBX.includes('PRODUCT_BUNDLE_IDENTIFIER = jp.signlink.Flip10;'));
  assert.ok(PBX.includes('MARKETING_VERSION = 1.0.0;'));
  const builds = [...PBX.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((match) => match[1]);
  assert.ok(builds.length >= 2, 'Debug/Release の両方にビルド番号が無い');
  assert.ok(builds.every((value) => value === '3'), `ビルド番号が3でない: ${builds.join(',')}`);
  assert.ok(INFO.includes('<string>LINEZAP</string>'));
  assert.ok(!INFO.includes('FLIP 10'));
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'jp.signlink.Flip10', 'Bundle ID は変えない');
  assert.equal(config.appName, 'LINEZAP');
  const iosConfig = JSON.parse(read('ios/App/App/capacitor.config.json'));
  assert.equal(iosConfig.appName, 'LINEZAP');
  assert.equal(core.BUILD, 3);
});

test('AppDelegate は StoreKit 2・音・バイブのブリッジを登録している', () => {
  assert.ok(APPDELEGATE.includes('jp.signlink.Flip10.pro'));
  assert.ok(APPDELEGATE.includes('StoreKitPlugin'));
  assert.ok(APPDELEGATE.includes('FlipAudioPlugin'));
  assert.ok(APPDELEGATE.includes('FlipHapticsPlugin'));
  assert.ok(APPDELEGATE.includes('AVAudioSession'));
  assert.ok(APPDELEGATE.includes('registerPluginInstance'));
  assert.ok(SCENEDELEGATE.includes('FlipBridgeViewController'));
  assert.ok(exists('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  assert.ok(exists('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'));
  assert.ok(!exists('ios/App/App/public'), 'public/ を焼き付けない');
});

test('アイコンは LINEZAP の 1024×1024 RGB（透過なし）で、各サイズも書き出してある', () => {
  for (const path of ['assets/linezap-appicon-1024.png', 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png']) {
    const data = readFileSync(resolve(ROOT, path));
    assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${path} が PNG でない`);
    assert.equal(data.readUInt32BE(16), 1024, `${path} の幅`);
    assert.equal(data.readUInt32BE(20), 1024, `${path} の高さ`);
    assert.equal(data[24], 8);
    assert.equal(data[25], 2, `${path} が RGB でない（透過あり）`);
    assert.ok(statSync(resolve(ROOT, path)).size > 20000, `${path} が小さすぎる`);
  }
  for (const size of [180, 120, 87, 60]) {
    const data = readFileSync(resolve(ROOT, `assets/appicon/icon-${size}.png`));
    assert.equal(data.readUInt32BE(16), size, `icon-${size}.png の幅`);
    assert.equal(data[25], 2, `icon-${size}.png が RGB でない`);
  }
  assert.ok(!exists('assets/flip10-appicon-1024.png'), '古いアイコンが残っている');
});

test('TestFlight ワークフローはビルド番号を iOS から自動で読む（Build 3 版）', () => {
  assert.ok(WORKFLOW.includes('BUNDLE_ID: jp.signlink.Flip10'));
  assert.ok(WORKFLOW.includes('APP_NAME: LINEZAP'));
  assert.ok(WORKFLOW.includes('CURRENT_PROJECT_VERSION'));
  assert.ok(WORKFLOW.includes('BUILD_NUMBER='), 'ビルド番号を書き出す行が無い');
  assert.ok(WORKFLOW.includes('$GITHUB_ENV'));
  assert.ok(WORKFLOW.includes('npm test'));
  assert.ok(WORKFLOW.includes('jp.signlink.Flip10.pro'));
  assert.ok(WORKFLOW.includes('upload_to_testflight'));
  assert.ok(WORKFLOW.includes('macos-26'));
  assert.ok(WORKFLOW.includes('confirm_bundle_id'));
  assert.ok(!WORKFLOW.includes('BUILD_NUMBER: "1"'), 'ビルド番号が1に固定されている');
  assert.ok(WORKFLOW.includes("assert plist['CFBundleDisplayName'] == 'LINEZAP'"));
  assert.ok(WORKFLOW.includes('MAX_TARGET = 42'));
  assert.ok(WORKFLOW.includes("id: 'wide6'"));
});

test('プライバシーポリシーは LINEZAP として両言語でオフラインを明記', () => {
  assert.ok(PRIVACY.includes('LINEZAP'));
  assert.ok(PRIVACY.includes('データを収集しません'));
  assert.ok(PRIVACY.includes('does not collect personal information'));
  assert.ok(PRIVACY.includes('t.maks.ts@gmail.com'));
  assert.ok(PRIVACY.includes('jp.signlink.Flip10.pro'));
  assert.ok(!PRIVACY.includes('FLIP 10'));
});

test('README と package.json が Build 3 の配布物として揃っている', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'linezap');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.build, 3);
  assert.ok(pkg.scripts.test.includes('test/core.test.js'));
  assert.ok(pkg.scripts.test.includes('test/build3.test.js'));
  assert.ok(pkg.scripts.shots.includes('tools/shots-b3.mjs'));
  assert.equal(pkg.dependencies['@capacitor/core'], '8.6.2');
  assert.ok(exists('docs/ios-testflight-build1.yml'));
  assert.ok(exists('docs/privacy.md'));
  assert.ok(exists('tools/make-www.mjs'));
  assert.ok(exists('tools/shots-b3.mjs'));
  assert.ok(exists('tools/build-i18n.py'));
  assert.ok(exists('tools/make-icon.py'));
  assert.ok(README.includes('LINEZAP'));
  assert.ok(README.includes('Build 3'));
  assert.ok(README.includes('6×6'));
  assert.ok(README.includes('ドラッグ'));
  assert.ok(!README.includes('FLIP 10'));
});

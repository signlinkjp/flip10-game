/**
 * FLIP 10 — Build 2 の検品（node --test）
 *
 * 「12言語そろっている」「画面のキーが全部ある」「iOS の約束が守られている」
 * 「バイブ・BGM の停止・明るいテーマ・文字サイズが入っている」
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
const AUDIO = read('src/audio.js');
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

test('ビルド2の新しい文言（バイブ・文字サイズ・手数・十字フリップ・コンボ）が12言語にある', () => {
  for (const key of [
    'settings.haptic',
    'settings.hint',
    'settings.textSize',
    'settings.textSize.normal',
    'settings.textSize.large',
    'settings.textSize.xl',
    'settings.targetRow',
    'settings.targetCol',
    'settings.targetCap',
    'hud.moves',
    'howto.4.t',
    'howto.5.t',
    'rules.moves',
    'combo.nice',
    'combo.fever',
    'result.movesOut',
    'toast.shuffle',
  ]) {
    assert.ok(i18n.KEYS.includes(key), `${key} が辞書に無い`);
    for (const locale of i18n.LOCALES) {
      assert.equal(typeof i18n.DICT[locale.id][key], 'string', `${locale.id} に ${key} が無い`);
    }
  }
});

test('差し込み（{target} / {row} / {col} / {price}）を落としていない', () => {
  for (const key of i18n.KEYS) {
    const jaText = i18n.DICT.ja[key];
    const vars = [...jaText.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    if (vars.length === 0) continue;
    for (const locale of i18n.LOCALES) {
      const text = i18n.DICT[locale.id][key];
      for (const name of vars) {
        assert.ok(text.includes(`{${name}}`), `${locale.id} の ${key} に {${name}} が無い`);
      }
    }
  }
});

test('t() は差し込みと、無いキーの逃げ道を持つ', () => {
  assert.equal(i18n.t('rules.line', 'ja', { row: 12, col: 14 }), '行 12 / 列 14 の合計でラインが消える');
  assert.equal(i18n.t('rules.line', 'en', { row: 9, col: 40 }), 'Lines clear at row 9 / column 40');
  assert.equal(i18n.t('nope.key', 'ja'), 'nope.key');
  assert.equal(i18n.t('home.play', 'xx'), i18n.DICT.en['home.play'], '未知の言語は英語');
});

test('端末の言語から12言語を選び、知らない言語は英語', () => {
  assert.equal(i18n.detectLocale('ja-JP'), 'ja');
  assert.equal(i18n.detectLocale('ko-KR'), 'ko');
  assert.equal(i18n.detectLocale('zh-TW'), 'zh-Hant');
  assert.equal(i18n.detectLocale('zh-CN'), 'zh-Hans');
  assert.equal(i18n.detectLocale('es-MX'), 'es');
  assert.equal(i18n.detectLocale('pt-BR'), 'pt');
  assert.equal(i18n.detectLocale('hi-IN'), 'hi');
  assert.equal(i18n.detectLocale('id-ID'), 'id');
  assert.equal(i18n.detectLocale('th-TH'), 'en', 'タイ語は12言語に無いので英語');
  assert.equal(i18n.detectLocale(''), 'en');
});

test('プライバシー全文は日本語と英語。ほかの言語は英語を出す', () => {
  const ja = i18n.prose('privacy', 'ja');
  const en = i18n.prose('privacy', 'en');
  assert.ok(ja.intro.includes('個人情報'));
  assert.ok(en.intro.includes('personal information'));
  assert.equal(ja.sections.length, 5);
  assert.equal(en.sections.length, 5);
  assert.equal(i18n.prose('privacy', 'de').intro, en.intro);
  assert.equal(i18n.prose('privacy', 'zh-Hans').intro, en.intro);
  // 設定の保存項目が増えたことをプライバシーにも書いてある
  assert.ok(ja.sections.some((section) => section.body.includes('ヒント')));
  assert.ok(en.sections.some((section) => section.body.includes('hint')));
});

test('画面の data-i18n はすべて辞書にある', () => {
  const used = new Set();
  for (const match of HTML.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)) used.add(match[1]);
  assert.ok(used.size > 30, `data-i18n が少なすぎる (${used.size})`);
  for (const key of used) {
    assert.ok(i18n.KEYS.includes(key), `index.html の ${key} が辞書に無い`);
  }
  for (const config of core.MODES) {
    assert.ok(i18n.KEYS.includes(`mode.${config.id}`), `mode.${config.id} が無い`);
    assert.ok(i18n.KEYS.includes(`mode.${config.id}.desc`), `mode.${config.id}.desc が無い`);
  }
});

/* ------------------------------------------------------------------ */
/* 画面とデザイン                                                      */
/* ------------------------------------------------------------------ */

test('画面のシートと主要なボタンがそろっている', () => {
  for (const sheet of ['howto', 'settings', 'language', 'privacy', 'pro', 'result']) {
    assert.ok(HTML.includes(`id="sheet-${sheet}"`), `${sheet} のシートが無い`);
    assert.ok(HTML.includes(`data-sheet="${sheet}"`), `${sheet} の data-sheet が無い`);
  }
  for (const id of [
    'btn-play', 'btn-howto', 'btn-settings', 'btn-lang-home', 'btn-pro',
    'board', 'btn-quit', 'btn-restart', 'btn-home', 'btn-settings-play', 'btn-hint', 'btn-hint-foot',
    'btn-buy', 'btn-restore', 'btn-again', 'set-haptic', 'set-hint', 'set-text-size', 'set-target',
    'sums-rows', 'sums-cols', 'hud-moves', 'moves-pips', 'combo-word',
  ]) {
    assert.ok(HTML.includes(`id="${id}"`), `#${id} が無い`);
  }
  assert.ok(HTML.includes('src="src/main.js"'), 'main.js を読んでいない');
  assert.ok(HTML.includes('content="Build 2"'), 'index.html に Build 2 の表示が無い');
});

test('あそびかたは5ステップ＋図（入れ替え・合計・ライン・手数・十字）', () => {
  for (const kind of ['swap', 'sums', 'line', 'moves', 'cross']) {
    assert.ok(HTML.includes(`diag--${kind}`), `diag--${kind} が無い`);
  }
  for (const key of ['howto.1.t', 'howto.2.t', 'howto.3.t', 'howto.4.t', 'howto.5.t']) {
    assert.ok(HTML.includes(`data-i18n="${key}"`), `${key} が無い`);
  }
  assert.ok(HTML.includes('data-i18n="howto.5.b"'));
});

test('設定にバイブ・ヒント・文字サイズ・PRO の合計（行/列）がある', () => {
  assert.ok(HTML.includes('data-i18n="settings.haptic"'));
  assert.ok(HTML.includes('data-i18n="settings.hint"'));
  assert.ok(HTML.includes('data-i18n="settings.textSize"'));
  assert.ok(HTML.includes('data-size="normal"'));
  assert.ok(HTML.includes('data-size="large"'));
  assert.ok(HTML.includes('data-size="xl"'));
  assert.ok(HTML.includes('data-axis="row"'));
  assert.ok(HTML.includes('data-axis="col"'));
  assert.ok(HTML.includes('data-i18n="settings.targetCap"'));
});

test('明るいテーマ（ライト背景・紺の文字・数字カード）になっている', () => {
  assert.ok(CSS.includes('--bg: #f1f8ff'), '明るい背景色が無い');
  assert.ok(CSS.includes('--ink: #16214a'), '紺の文字色が無い');
  assert.ok(CSS.includes("html[data-text='xl']"), '文字サイズ 特大 の指定が無い');
  assert.ok(CSS.includes('radial-gradient'), '明るい背景のグラデーションが無い');
  assert.ok(!CSS.includes('--bg: #070b1c'), 'Build 1 の暗い背景が残っている');
});

test('iPhone で切れない（セーフエリア・拡大禁止・文字サイズ）', () => {
  assert.ok(HTML.includes('viewport-fit=cover'));
  assert.ok(HTML.includes('maximum-scale=1'));
  assert.ok(CSS.includes('env(safe-area-inset-top'));
  assert.ok(CSS.includes('env(safe-area-inset-bottom'));
  assert.ok(CSS.includes('100dvh'));
  assert.ok(CSS.includes('@media (max-height: 700px)'));
  assert.ok(CSS.includes('@media (max-width: 360px)'));
  assert.ok(CSS.includes('-webkit-touch-callout: none'));
  assert.ok(CSS.includes('min(94vw, 100%, 470px)'), '盤面が画面幅に収まる指定が無い');
});

test('行の合計は右・列の合計は下に出る', () => {
  assert.ok(CSS.includes('.sums--rows'));
  assert.ok(CSS.includes('grid-column: 2'));
  assert.ok(CSS.includes('.sums--cols'));
  assert.ok(CSS.includes('grid-row: 2'));
  assert.ok(CSS.includes('.sum.is-near'));
  assert.ok(CSS.includes('.sum.is-hit'));
  assert.ok(MAIN.includes('renderSums'));
});

test('入力欄が無い（オフライン・個人情報を集めない）', () => {
  assert.ok(!/<textarea/i.test(HTML));
  assert.ok(!/<input/i.test(HTML));
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(MAIN), 'メイン画面が通信していない');
  assert.ok(!/supabase|https?:\/\//i.test(MAIN), '外部URLを読んでいない');
});

/* ------------------------------------------------------------------ */
/* 音とバイブ・バックグラウンド                                        */
/* ------------------------------------------------------------------ */

test('音は AudioContext が無くても落ちない（プレビュー・テスト環境）', () => {
  const engine = createAudioEngine({ AudioContextClass: null, mediaElementClass: null, navigatorLike: null, capacitorLike: null });
  assert.doesNotThrow(() => {
    engine.unlock();
    engine.tap();
    engine.flip();
    engine.clear({ combo: 3, lines: 2 });
    engine.drop();
    engine.record();
    engine.over();
    engine.setMuted(true);
    engine.setMuted(false);
    engine.setBgm(true);
    engine.setBgm(false);
    engine.pause();
    engine.resume();
    engine.revive();
  });
  assert.equal(engine.unlocked, false);
  assert.equal(engine.paused, false);
});

test('BGM は画面を離れると suspend、戻ると再開する仕組みを持つ', () => {
  let suspended = 0;
  let resumed = 0;
  let gain = null;
  class FakeContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.state = 'running';
      this.destination = {};
    }
    createGain() {
      const node = {
        gain: {
          value: 1,
          cancelScheduledValues() {},
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
      gain = gain ?? node;
      return node;
    }
    createOscillator() {
      return {
        frequency: { value: 0 },
        detune: { value: 0 },
        type: 'sine',
        connect() {},
        start() {},
        stop() {},
      };
    }
    createBiquadFilter() {
      return { frequency: { value: 0 }, Q: { value: 0 }, type: 'lowpass', connect() {} };
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(8) };
    }
    createBufferSource() {
      return { buffer: null, connect() {}, start() {}, stop() {} };
    }
    suspend() {
      suspended += 1;
      this.state = 'suspended';
      return Promise.resolve();
    }
    resume() {
      resumed += 1;
      this.state = 'running';
      return Promise.resolve();
    }
  }
  const engine = createAudioEngine({ AudioContextClass: FakeContext, mediaElementClass: null, navigatorLike: null, capacitorLike: null });
  engine.unlock();
  engine.pause();
  assert.equal(suspended, 1);
  assert.equal(engine.paused, true);
  engine.resume();
  assert.equal(resumed, 1);
  assert.equal(engine.paused, false);
  assert.ok(gain, 'ゲインが作られている');
});

test('アプリ側（JS）が画面を離れたら音を止める', () => {
  assert.ok(MAIN.includes("document.addEventListener('visibilitychange'"));
  assert.ok(MAIN.includes("window.addEventListener('pagehide'"));
  assert.ok(MAIN.includes("window.addEventListener('blur'"));
  assert.ok(MAIN.includes('window.__flipPauseAudio'));
  assert.ok(MAIN.includes('window.__flipResumeAudio'));
  assert.ok(AUDIO.includes('ctx.suspend()'));
  assert.ok(AUDIO.includes('pauseNative'));
});

test('iOS の消音スイッチ対策（playback・無音WAV・ネイティブ）', () => {
  assert.ok(AUDIO.includes("AUDIO_SESSION_TYPE = 'playback'"));
  assert.ok(AUDIO.includes('audioSession.type'));
  assert.ok(AUDIO.includes('SILENT_WAV'));
  assert.ok(AUDIO.includes("NATIVE_PLUGIN = 'FlipAudio'"));
  assert.ok(APPDELEGATE.includes('setCategory(.playback'));
  assert.ok(APPDELEGATE.includes('class FlipAudioPlugin'));
});

test('iOS はホーム画面・バックグラウンドで AudioSession を下げ、JS にも止めさせる', () => {
  assert.ok(APPDELEGATE.includes('applicationWillResignActive'));
  assert.ok(APPDELEGATE.includes('applicationDidEnterBackground'));
  assert.ok(APPDELEGATE.includes('setActive(false'));
  assert.ok(APPDELEGATE.includes('window.__flipPauseAudio'));
  assert.ok(APPDELEGATE.includes('window.__flipResumeAudio'));
 });

test('バイブ（Haptics）の純関数: ON のときだけネイティブを呼ぶ', () => {
  const calls = [];
  const capacitorLike = {
    Plugins: {
      [HAPTIC_PLUGIN]: {
        haptic(options) {
          calls.push(options.kind);
          return Promise.resolve({ kind: options.kind });
        },
      },
    },
  };
  const haptics = createHaptics({ capacitorLike, navigatorLike: null, enabled: true });
  assert.equal(haptics.available, true);
  assert.equal(haptics.select(), true);
  assert.equal(haptics.swap(), true);
  assert.equal(haptics.clear(), true);
  assert.equal(haptics.combo(), true);
  assert.equal(haptics.over(), true);
  assert.deepEqual(calls, ['light', 'medium', 'success', 'heavy', 'success', 'error']);
  haptics.setEnabled(false);
  assert.equal(haptics.select(), false);
  assert.equal(calls.length, 6, 'OFF のときは呼ばない');
  assert.deepEqual(HAPTIC_KINDS, ['light', 'medium', 'heavy', 'success', 'warning', 'error']);
});

test('バイブは Capacitor が無くても navigator.vibrate で動く（Web プレビュー）', () => {
  const buzz = [];
  const navigatorLike = { vibrate: (pattern) => { buzz.push(pattern); return true; } };
  const haptics = createHaptics({ capacitorLike: null, navigatorLike, enabled: true });
  haptics.select();
  haptics.over();
  assert.equal(buzz.length, 2);
  // 何も無い環境でも落ちない
  assert.doesNotThrow(() => {
    const quiet = createHaptics({ capacitorLike: null, navigatorLike: null, enabled: true });
    quiet.select();
    quiet.combo();
    quiet.over();
  });
});

test('main.js が選択・入れ替え・消去・コンボ・終了でバイブを呼ぶ', () => {
  assert.ok(MAIN.includes("from './haptics.js'"));
  assert.ok(MAIN.includes('haptics.select()'));
  assert.ok(MAIN.includes('haptics.swap()'));
  assert.ok(MAIN.includes('haptics.clear()'));
  assert.ok(MAIN.includes('haptics.combo()'));
  assert.ok(MAIN.includes('haptics.over()'));
  assert.ok(MAIN.includes('haptics.setEnabled'));
});

test('AppDelegate に FlipHaptics プラグインがあり、登録されている', () => {
  assert.ok(APPDELEGATE.includes('@objc(FlipHapticsPlugin)'));
  assert.ok(APPDELEGATE.includes('class FlipHapticsPlugin'));
  assert.ok(APPDELEGATE.includes('jsName = "FlipHaptics"'));
  assert.ok(APPDELEGATE.includes('CAPPluginMethod(name: "haptic"'));
  assert.ok(APPDELEGATE.includes('UIImpactFeedbackGenerator'));
  assert.ok(APPDELEGATE.includes('UINotificationFeedbackGenerator'));
  assert.ok(APPDELEGATE.includes('.impactOccurred()'));
  assert.ok(APPDELEGATE.includes('.notificationOccurred(.success)'));
  assert.ok(APPDELEGATE.includes('.notificationOccurred(.error)'));
  assert.ok(APPDELEGATE.includes('registerPluginInstance(FlipHapticsPlugin())'));
  assert.ok(HAPTICS.includes("HAPTIC_PLUGIN = 'FlipHaptics'"));
});

/* ------------------------------------------------------------------ */
/* 記録（端末の中だけ）                                                */
/* ------------------------------------------------------------------ */

test('設定の既定値は 音ON / BGM OFF / ヒントON / バイブON / 標準サイズ / 合計10', () => {
  const clean = storage.normalizeSettings({});
  assert.deepEqual(clean, {
    sound: true,
    bgm: false,
    hint: true,
    haptic: true,
    textSize: 'normal',
    locale: null,
    rowTarget: 10,
    colTarget: 10,
  });
  assert.equal(storage.DEFAULT_SETTINGS.haptic, true);
});

test('設定は壊れた値でも既定に戻る（バイブ・文字サイズ・合計）', () => {
  const clean = storage.normalizeSettings({
    sound: 'yes',
    bgm: null,
    hint: 'no',
    haptic: 'maybe',
    textSize: 'huge',
    locale: 'klingon',
    rowTarget: 999,
    colTarget: 3,
  });
  assert.deepEqual(clean, {
    sound: true,
    bgm: false,
    hint: true,
    haptic: true,
    textSize: 'normal',
    locale: null,
    rowTarget: 40,
    colTarget: 9,
  });
  assert.deepEqual(storage.normalizeSettings({ sound: false, bgm: true, hint: false, haptic: false, textSize: 'xl', locale: 'ko', rowTarget: 14, colTarget: 22 }), {
    sound: false,
    bgm: true,
    hint: false,
    haptic: false,
    textSize: 'xl',
    locale: 'ko',
    rowTarget: 14,
    colTarget: 22,
  });
});

test('設定は保存して読み戻せる（バイブの ON/OFF も残る）', () => {
  const backend = memoryBackend();
  storage.saveSettings({ sound: false, bgm: true, hint: false, haptic: false, textSize: 'large', locale: 'en', rowTarget: 12, colTarget: 18 }, backend);
  assert.deepEqual(storage.loadSettings(backend), {
    sound: false,
    bgm: true,
    hint: false,
    haptic: false,
    textSize: 'large',
    locale: 'en',
    rowTarget: 12,
    colTarget: 18,
  });
  backend.setItem(storage.SETTINGS_KEY, '{{ broken');
  assert.deepEqual(storage.loadSettings(backend), storage.DEFAULT_SETTINGS);
});

test('古い target（9/10/11）は行・列の合計として引き継ぐ', () => {
  assert.equal(storage.normalizeSettings({ target: 11 }).rowTarget, 11);
  assert.equal(storage.normalizeSettings({ target: 11 }).colTarget, 11);
});

test('4×4 の合計は 36 までに丸め、5×5 は 40 までそのまま', () => {
  assert.deepEqual(storage.targetsFor({ rowTarget: 40, colTarget: 40 }, 4), { rows: 36, cols: 36 });
  assert.deepEqual(storage.targetsFor({ rowTarget: 40, colTarget: 40 }, 5), { rows: 40, cols: 40 });
  assert.deepEqual(storage.targetsFor({ rowTarget: 12, colTarget: 24 }, 4), { rows: 12, cols: 24 });
});

test('ベストは上がるときだけ更新し、モード別に持つ', () => {
  const backend = memoryBackend();
  assert.equal(storage.bestFor('classic', backend), 0);
  assert.deepEqual(storage.recordScore('classic', 1200, backend), { best: 1200, isNew: true });
  assert.deepEqual(storage.recordScore('classic', 900, backend), { best: 1200, isNew: false });
  assert.deepEqual(storage.recordScore('classic', 1500, backend), { best: 1500, isNew: true });
  storage.recordScore('cross', 700, backend);
  assert.equal(storage.bestFor('cross', backend), 700);
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

test('無料はクラシックだけ。ワイド・十字フリップ・タイムアタックは PRO', () => {
  assert.equal(pro.canPlayMode(false, 'classic'), true);
  assert.equal(pro.canPlayMode(false, 'wide'), false);
  assert.equal(pro.canPlayMode(false, 'cross'), false);
  assert.equal(pro.canPlayMode(false, 'time'), false);
  assert.deepEqual(pro.modesFor(false), ['classic']);
  for (const id of ['classic', 'wide', 'cross', 'time']) {
    assert.equal(pro.canPlayMode(true, id), true, `PRO で ${id} が遊べない`);
  }
  assert.equal(pro.needsPro('cross'), true);
});

test('商品IDと価格のプレースホルダ', () => {
  assert.equal(pro.PRODUCT_ID, 'jp.signlink.Flip10.pro');
  assert.equal(pro.fallbackPrice('ja'), '¥300');
  assert.equal(pro.fallbackPrice('en'), '$1.99');
  assert.equal(pro.priceFor('ja', { price: '¥350' }), '¥350');
  assert.ok(MAIN.includes('pro.priceFor'));
});

test('StoreKit が無い Web プレビューは preview（課金しない）', () => {
  assert.equal(pro.mode(), 'preview');
  assert.equal(pro.previewAllowed(), true);
  assert.equal(pro.initialEntitlement(), false);
});

/* ------------------------------------------------------------------ */
/* iOS プロジェクトと配信                                              */
/* ------------------------------------------------------------------ */

test('iOS は jp.signlink.Flip10 / 1.0.0 / Build 2', () => {
  assert.ok(PBX.includes('PRODUCT_BUNDLE_IDENTIFIER = jp.signlink.Flip10;'));
  assert.ok(PBX.includes('MARKETING_VERSION = 1.0.0;'));
  const builds = [...PBX.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((match) => match[1]);
  assert.ok(builds.length >= 2, 'Debug/Release の両方にビルド番号が無い');
  assert.ok(builds.every((value) => value === '2'), `ビルド番号が2でない: ${builds.join(',')}`);
  assert.ok(INFO.includes('FLIP 10'));
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'jp.signlink.Flip10');
  assert.equal(config.appName, 'FLIP 10');
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

test('アイコンは 1024×1024 の RGB（透過なし）', () => {
  for (const path of ['assets/flip10-appicon-1024.png', 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png']) {
    const data = readFileSync(resolve(ROOT, path));
    assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${path} が PNG でない`);
    assert.equal(data.readUInt32BE(16), 1024, `${path} の幅`);
    assert.equal(data.readUInt32BE(20), 1024, `${path} の高さ`);
    assert.equal(data[24], 8);
    assert.equal(data[25], 2, `${path} が RGB でない（透過あり）`);
    assert.ok(statSync(resolve(ROOT, path)).size > 20000, `${path} が小さすぎる`);
  }
});

test('TestFlight ワークフローはビルド番号を iOS から自動で読む', () => {
  assert.ok(WORKFLOW.includes('BUNDLE_ID: jp.signlink.Flip10'));
  assert.ok(WORKFLOW.includes('APP_NAME: FLIP 10'));
  assert.ok(WORKFLOW.includes('CURRENT_PROJECT_VERSION'));
  assert.ok(WORKFLOW.includes('BUILD_NUMBER='), 'ビルド番号を書き出す行が無い');
  assert.ok(WORKFLOW.includes('$GITHUB_ENV'));
  assert.ok(WORKFLOW.includes('npm test'));
  assert.ok(WORKFLOW.includes('jp.signlink.Flip10.pro'));
  assert.ok(WORKFLOW.includes('upload_to_testflight'));
  assert.ok(WORKFLOW.includes('macos-26'));
  assert.ok(WORKFLOW.includes('altool --upload-app'));
  assert.ok(WORKFLOW.includes('confirm_bundle_id'));
  assert.ok(!WORKFLOW.includes('BUILD_NUMBER: "1"'), 'ビルド番号が1に固定されている');
});

test('プライバシーポリシーは両言語でオフラインを明記', () => {
  assert.ok(PRIVACY.includes('データを収集しません'));
  assert.ok(PRIVACY.includes('does not collect personal information'));
  assert.ok(PRIVACY.includes('t.maks.ts@gmail.com'));
  assert.ok(PRIVACY.includes('jp.signlink.Flip10.pro'));
});

test('README と package.json が Build 2 の配布物として揃っている', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'flip10');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.build, 2);
  assert.ok(pkg.scripts.test.includes('test/core.test.js'));
  assert.ok(pkg.scripts.test.includes('test/build2.test.js'));
  assert.equal(pkg.dependencies['@capacitor/core'], '8.6.2');
  assert.ok(exists('docs/ios-testflight-build1.yml'));
  assert.ok(exists('docs/privacy.md'));
  assert.ok(exists('tools/make-www.mjs'));
  assert.ok(exists('tools/shots-b2.mjs'));
  assert.ok(README.includes('Build 2'));
  assert.ok(README.includes('2マス'));
  assert.ok(README.includes('バイブ'));
});

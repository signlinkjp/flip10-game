/**
 * FLIP 10 — Build 1 の検品（node --test）
 *
 * 「12言語そろっている」「画面のキーが全部ある」「iOS の約束が守られている」
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(resolve(ROOT, relative), 'utf8');
const exists = (relative) => existsSync(resolve(ROOT, relative));

const HTML = read('index.html');
const CSS = read('styles.css');
const MAIN = read('src/main.js');
const PBX = read('ios/App/App.xcodeproj/project.pbxproj');
const APPDELEGATE = read('ios/App/App/AppDelegate.swift');
const SCENEDELEGATE = read('ios/App/App/SceneDelegate.swift');
const INFO = read('ios/App/App/Info.plist');
const WORKFLOW = read('docs/ios-testflight-build1.yml');
const PRIVACY = read('docs/privacy.md');

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

test('日本語と英語以外も、数字の差し込み（{target} / {price}）を落としていない', () => {
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
  assert.equal(i18n.t('rules.target', 'ja', { target: 11 }), '行か列の合計が 11 で消える');
  assert.equal(i18n.t('rules.target', 'en', { target: 9 }), 'A row or column clears at a total of 9');
  assert.equal(i18n.t('nope.key', 'ja'), 'nope.key');
  assert.equal(i18n.t('home.play', 'xx'), i18n.DICT.en['home.play'], '未知の言語は英語');
});

test('端末の言語から12言語を選び、知らない言語は英語', () => {
  assert.equal(i18n.detectLocale('ja-JP'), 'ja');
  assert.equal(i18n.detectLocale('ko-KR'), 'ko');
  assert.equal(i18n.detectLocale('zh-TW'), 'zh-Hant');
  assert.equal(i18n.detectLocale('zh-HK'), 'zh-Hant');
  assert.equal(i18n.detectLocale('zh-CN'), 'zh-Hans');
  assert.equal(i18n.detectLocale('es-MX'), 'es');
  assert.equal(i18n.detectLocale('pt-BR'), 'pt');
  assert.equal(i18n.detectLocale('hi-IN'), 'hi');
  assert.equal(i18n.detectLocale('id-ID'), 'id');
  assert.equal(i18n.detectLocale('th-TH'), 'en', 'タイ語は12言語に無いので英語');
  assert.equal(i18n.detectLocale('ar-EG'), 'en');
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
  for (const id of ['btn-play', 'btn-howto', 'btn-settings', 'btn-lang-home', 'btn-pro', 'board', 'btn-quit', 'btn-restart', 'btn-home', 'btn-buy', 'btn-restore', 'btn-again']) {
    assert.ok(HTML.includes(`id="${id}"`), `#${id} が無い`);
  }
  assert.ok(HTML.includes('src="src/main.js"'), 'main.js を読んでいない');
});

test('あそびかたは4ステップ＋図（十字・ペア・合計10・PROの覗き見）', () => {
  assert.ok(HTML.includes('diag--cross'));
  assert.ok(HTML.includes('diag--pairs'));
  assert.ok(HTML.includes('diag--line'));
  assert.ok(HTML.includes('diag--peek'));
  assert.ok(HTML.includes('pair__tile--front') && HTML.includes('pair__tile--back'));
  assert.ok(HTML.includes('data-i18n="howto.1.t"'));
  assert.ok(HTML.includes('data-i18n="howto.4.b"'));
});

test('iPhone で切れない（セーフエリア・拡大禁止・文字サイズ）', () => {
  assert.ok(HTML.includes('viewport-fit=cover'));
  assert.ok(HTML.includes('maximum-scale=1'));
  assert.ok(CSS.includes('env(safe-area-inset-top'));
  assert.ok(CSS.includes('env(safe-area-inset-bottom'));
  assert.ok(CSS.includes('100dvh'));
  assert.ok(CSS.includes('@media (max-height: 700px)'));
  assert.ok(CSS.includes('-webkit-touch-callout: none'));
  // 375px 幅ではみ出さない
  assert.ok(CSS.includes('min(94vw, 100%, 470px)'), '盤面が画面幅に収まる指定が無い');
});

test('入力欄が無い（オフライン・個人情報を集めない）', () => {
  assert.ok(!/<textarea/i.test(HTML));
  assert.ok(!/<input/i.test(HTML));
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(MAIN), 'メイン画面が通信していない');
  assert.ok(!/supabase|https?:\/\//i.test(MAIN), '外部URLを読んでいない');
});

test('凡例の 0↔5 / 1↔4 / 2↔3 を出せる', () => {
  const pairs = core.pairLegend(core.RULES.base);
  assert.deepEqual(pairs.map((p) => `${p.front}${p.back}`), ['05', '14', '23']);
  assert.ok(MAIN.includes('buildLegend'));
});

/* ------------------------------------------------------------------ */
/* 音                                                                  */
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
    engine.revive();
  });
  assert.equal(engine.unlocked, false);
});

test('iOS の消音スイッチ対策（playback・無音WAV・ネイティブ）', () => {
  const audio = read('src/audio.js');
  assert.ok(audio.includes("AUDIO_SESSION_TYPE = 'playback'"));
  assert.ok(audio.includes('audioSession.type'));
  assert.ok(audio.includes('SILENT_WAV'));
  assert.ok(audio.includes("NATIVE_PLUGIN = 'FlipAudio'"));
  assert.ok(APPDELEGATE.includes('setCategory(.playback'));
  assert.ok(APPDELEGATE.includes('class FlipAudioPlugin'));
});

/* ------------------------------------------------------------------ */
/* 記録（端末の中だけ）                                                */
/* ------------------------------------------------------------------ */

test('設定は壊れた値でも既定に戻る', () => {
  const clean = storage.normalizeSettings({ sound: 'yes', bgm: null, locale: 'klingon', target: 77 });
  assert.deepEqual(clean, { sound: true, bgm: false, locale: null, target: 10 });
  assert.deepEqual(storage.normalizeSettings({ sound: false, bgm: true, locale: 'ko', target: 11 }), {
    sound: false,
    bgm: true,
    locale: 'ko',
    target: 11,
  });
});

test('設定は保存して読み戻せる。壊れたJSONでも既定', () => {
  const backend = memoryBackend();
  storage.saveSettings({ sound: false, bgm: true, locale: 'en', target: 9 }, backend);
  assert.deepEqual(storage.loadSettings(backend), { sound: false, bgm: true, locale: 'en', target: 9 });
  backend.setItem(storage.SETTINGS_KEY, '{{ broken');
  assert.deepEqual(storage.loadSettings(backend), storage.DEFAULT_SETTINGS);
});

test('ベストは上がるときだけ更新し、モード別に持つ', () => {
  const backend = memoryBackend();
  assert.equal(storage.bestFor('classic', backend), 0);
  assert.deepEqual(storage.recordScore('classic', 1200, backend), { best: 1200, isNew: true });
  assert.deepEqual(storage.recordScore('classic', 900, backend), { best: 1200, isNew: false });
  assert.deepEqual(storage.recordScore('classic', 1500, backend), { best: 1500, isNew: true });
  assert.equal(storage.bestFor('time60', backend), 0);
  storage.recordScore('time60', 800, backend);
  assert.equal(storage.bestFor('time60', backend), 800);
  assert.equal(storage.loadBests(backend).classic, 1500);
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

test('無料はクラシックだけ。上級・5×5・タイムアタックは PRO', () => {
  assert.equal(pro.canPlayMode(false, 'classic'), true);
  assert.equal(pro.canPlayMode(false, 'advanced'), false);
  assert.equal(pro.canPlayMode(false, 'wide'), false);
  assert.equal(pro.canPlayMode(false, 'time'), false);
  assert.deepEqual(pro.modesFor(false), ['classic']);
  for (const id of ['classic', 'advanced', 'wide', 'time']) {
    assert.equal(pro.canPlayMode(true, id), true, `PRO で ${id} が遊べない`);
  }
  assert.equal(pro.needsPro('classic'), false);
  assert.equal(pro.needsPro('wide'), true);
});

test('商品IDと価格のプレースホルダ', () => {
  assert.equal(pro.PRODUCT_ID, 'jp.signlink.Flip10.pro');
  assert.equal(pro.fallbackPrice('ja'), '¥300');
  assert.equal(pro.fallbackPrice('en'), '$1.99');
  assert.equal(pro.fallbackPrice('unknown'), pro.FALLBACK_PRICES.en);
  assert.equal(pro.priceFor('ja', null), '¥300');
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

test('iOS は jp.signlink.Flip10 / 1.0.0 / Build 1', () => {
  assert.ok(PBX.includes('PRODUCT_BUNDLE_IDENTIFIER = jp.signlink.Flip10;'));
  assert.ok(PBX.includes('MARKETING_VERSION = 1.0.0;'));
  assert.ok(PBX.includes('CURRENT_PROJECT_VERSION = 1;'));
  assert.ok(INFO.includes('FLIP 10'));
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'jp.signlink.Flip10');
  assert.equal(config.appName, 'FLIP 10');
  const iosConfig = JSON.parse(read('ios/App/App/capacitor.config.json'));
  assert.equal(iosConfig.appId, 'jp.signlink.Flip10');
});

test('AppDelegate は StoreKit 2 と音のブリッジを登録している', () => {
  assert.ok(APPDELEGATE.includes('jp.signlink.Flip10.pro'));
  assert.ok(APPDELEGATE.includes('StoreKitPlugin'));
  assert.ok(APPDELEGATE.includes('FlipAudioPlugin'));
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
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    const depth = data[24];
    const color = data[25];
    assert.equal(width, 1024, `${path} の幅`);
    assert.equal(height, 1024, `${path} の高さ`);
    assert.equal(depth, 8, `${path} のビット深度`);
    assert.equal(color, 2, `${path} が RGB でない（透過あり）`);
    assert.ok(statSync(resolve(ROOT, path)).size > 20000, `${path} が小さすぎる`);
  }
});

test('TestFlight ワークフローは bundle ID・PRO・テストを通す', () => {
  assert.ok(WORKFLOW.includes('BUNDLE_ID: jp.signlink.Flip10'));
  assert.ok(WORKFLOW.includes('APP_NAME: FLIP 10'));
  assert.ok(WORKFLOW.includes('BUILD_NUMBER: "1"'));
  assert.ok(WORKFLOW.includes('npm test'));
  assert.ok(WORKFLOW.includes('jp.signlink.Flip10.pro'));
  assert.ok(WORKFLOW.includes('upload_to_testflight'));
  assert.ok(WORKFLOW.includes('macos-26'));
  assert.ok(WORKFLOW.includes('altool --upload-app'));
  assert.ok(WORKFLOW.includes('confirm_bundle_id'));
});

test('プライバシーポリシーは両言語でオフラインを明記', () => {
  assert.ok(PRIVACY.includes('データを収集しません'));
  assert.ok(PRIVACY.includes('does not collect personal information'));
  assert.ok(PRIVACY.includes('t.maks.ts@gmail.com'));
  assert.ok(PRIVACY.includes('jp.signlink.Flip10.pro'));
});

test('README と package.json が配布物として揃っている', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'flip10');
  assert.equal(pkg.version, '1.0.0');
  assert.ok(pkg.scripts.test.includes('test/core.test.js'));
  assert.equal(pkg.dependencies['@capacitor/core'], '8.6.2');
  assert.ok(exists('docs/ios-testflight-build1.yml'));
  assert.ok(exists('docs/privacy.md'));
  assert.ok(exists('tools/make-www.mjs'));
  assert.ok(exists('tools/shots.mjs'));
});

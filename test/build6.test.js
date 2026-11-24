/**
 * LINEZAP — Build 6 の検品（node --test）
 *
 * 「12言語そろっている」「画面と操作のキーが全部ある」「iOS の約束が守られている」
 * 「2モード・開始前ページ（マス数/目標/時間）・基準目標 10/18/24・タイムアタック 180秒」
 * 「十字フリップが UI・遊び方・PRO 説明・辞書から消えている」
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
const PRO = read('src/pro.js');
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

test('Build 5 の文言が12言語にある（基準目標・時間・PRO・開始前ページ）', () => {
  for (const key of [
    'start.sub',
    'start.size',
    'start.base',
    'start.free',
    'start.timeLimit',
    'start.fixed',
    'start.range',
    'start.moves',
    'start.turn',
    'start.seconds',
    'start.play',
    'target.label',
    'settings.targetAtStart',
    'settings.targetAtStartNote',
    'rules.turn',
    'rules.hint',
    'toast.hintCost',
    'result.reasonMoves',
    'result.reasonTime',
    'result.reasonTimeAttack',
    'howto.6.t',
    'howto.6.b',
    'pro.f1',
    'pro.f2',
    'pro.f3',
    'pro.f4',
    'pro.thanks',
  ]) {
    assert.ok(i18n.KEYS.includes(key), `${key} が辞書に無い`);
    for (const locale of i18n.LOCALES) {
      assert.ok(i18n.DICT[locale.id][key].trim().length > 0, `${locale.id}の${key}`);
    }
  }
  // 十字フリップのキーは消えている
  for (const gone of ['mode.cross', 'mode.cross.desc', 'howto.legend']) {
    assert.ok(!i18n.KEYS.includes(gone), `${gone} が残っている`);
  }
  assert.ok(!I18N.includes('十字'), '辞書に「十字」が残っている');
  assert.ok(!I18N.includes('Cross Flip'), '辞書に Cross Flip が残っている');
  assert.ok(!I18N.includes('FLIP 10'), 'FLIP 10 が辞書に残っている');
  assert.ok(I18N.includes('LINEZAP PRO'));
});

test('2モードの説明は2行で、不自然な1文字折り返しをしない', () => {
  for (const locale of i18n.LOCALES) {
    for (const id of ['classic', 'time']) {
      const desc = i18n.DICT[locale.id][`mode.${id}.desc`];
      assert.ok(desc.includes('\n'), `${locale.id}/${id} が2行になっていない`);
      assert.equal(desc.split('\n').length, 2, `${locale.id}/${id} が2行でない`);
      assert.ok(desc.split('\n').every((line) => line.trim().length > 0));
    }
  }
  assert.ok(i18n.DICT.ja['mode.time.desc'].includes('60/120/180'));
  assert.ok(CSS.includes('white-space: pre-line'));
});

test('数字のプレースホルダ（目標・基準・秒）が言語ごとに置き換わる', () => {
  assert.equal(i18n.t('start.range', 'ja', { min: 12, max: 42, base: 18 }), '目標は 12〜42（基準 18）から選べます');
  assert.equal(i18n.t('start.range', 'en', { min: 12, max: 42, base: 24 }), 'Choose a target from 12–42 (base 24)');
  assert.equal(i18n.t('start.fixed', 'ja', { target: 10 }), '4×4は10固定');
  assert.equal(i18n.t('start.base', 'ja', { target: 10 }), '基準 10');
  assert.equal(i18n.t('start.base', 'en', { target: 18 }), 'Base 18');
  assert.equal(i18n.t('start.seconds', 'ja', { n: 10 }), '10秒');
  assert.equal(i18n.t('start.seconds', 'en', { n: 180 }), '180s');
  assert.equal(i18n.DICT.ja['hud.sumHidden'], '？');
  assert.equal(i18n.DICT.en['hud.sumHidden'], '?');
});

/* ------------------------------------------------------------------ */
/* 設定（端末の中だけ）                                                */
/* ------------------------------------------------------------------ */

test('設定の既定値は 音ON / BGM ON / ヒントON / バイブON / 標準 / 目標は基準 18・24', () => {
  const clean = storage.normalizeSettings({});
  assert.deepEqual(clean, {
    sound: true,
    bgm: true,
    bgmDefault: storage.BGM_DEFAULT_VERSION,
    hint: true,
    haptic: true,
    textSize: 'normal',
    locale: null,
    targets: { classic5: 18, classic6: 24, time5: 18, time6: 24 },
  });
  assert.equal(storage.BGM_DEFAULT_VERSION, 3);
});

test('古い設定（1つの target）から Build 5 に引き継ぐ', () => {
  const migrated = storage.normalizeSettings({ sound: false, bgm: false, hint: false, haptic: false, textSize: 'xl', locale: 'ko', target: 30 });
  assert.equal(migrated.bgm, true, 'Build 3 で一度だけ ON になる');
  assert.equal(migrated.targets.classic5, 30);
  assert.equal(migrated.targets.classic6, 30);
  assert.equal(migrated.sound, false);
  assert.equal(migrated.textSize, 'xl');
  assert.equal(migrated.locale, 'ko');
  // 一度保存したあとは、ユーザーの OFF を尊重する
  const backend = memoryBackend();
  storage.saveSettings({ ...migrated, bgm: false }, backend);
  assert.equal(storage.loadSettings(backend).bgm, false);
});

test('設定は壊れた値でも既定に戻る（十字フリップの古い値は捨てる）', () => {
  const clean = storage.normalizeSettings({
    sound: 'yes',
    bgm: null,
    hint: 'no',
    haptic: 'maybe',
    textSize: 'huge',
    locale: 'klingon',
    targets: { classic5: 999, classic6: 3, time5: 99, time6: 'x', cross5: 11, cross6: 16 },
  });
  assert.equal(clean.sound, true);
  assert.equal(clean.hint, true);
  assert.equal(clean.haptic, true);
  assert.equal(clean.textSize, 'normal');
  assert.equal(clean.locale, null);
  assert.equal(clean.targets.classic5, 42);
  assert.equal(clean.targets.classic6, 12);
  assert.equal(clean.targets.time5, 42);
  assert.equal(clean.targets.time6, 24, '壊れた値は基準 24');
  assert.equal('cross5' in clean.targets, false, '十字フリップの古い値は持たない');
});

test('モード×マス数の合計を覚えて読み戻せる（初期値は基準 10/18/24）', () => {
  const backend = memoryBackend();
  let settings = storage.loadSettings(backend);
  assert.equal(storage.targetFor(settings, 'classic', 4), 10, '4×4は10固定');
  assert.equal(storage.targetFor(settings, 'classic', 5), 18, '5×5の基準は18');
  assert.equal(storage.targetFor(settings, 'classic', 6), 24, '6×6の基準は24');
  assert.equal(storage.targetFor(settings, 'time', 5), 18);
  settings = storage.rememberTarget(settings, 'classic', 6, 33, backend);
  settings = storage.rememberTarget(settings, 'time', 5, 12, backend);
  const reloaded = storage.loadSettings(backend);
  assert.equal(reloaded.targets.classic6, 33);
  assert.equal(reloaded.targets.time5, 12);
  assert.equal(storage.targetFor(reloaded, 'classic', 6), 33);
  assert.equal(storage.targetFor(reloaded, 'time', 5), 12);
  // 範囲外は丸める
  assert.equal(storage.targetFor({ targets: { time5: 99 } }, 'time', 5), 42);
  assert.deepEqual(storage.targetsFor({ targets: { classic6: 42 } }, 6), { rows: 42, cols: 42 });
  assert.deepEqual(storage.targetsFor({ targets: { classic6: 42 } }, 4), { rows: 10, cols: 10 });
});

test('ベストは上がるときだけ更新し、モード×サイズ×時間で持つ', () => {
  const backend = memoryBackend();
  assert.equal(storage.bestFor('classic4', backend), 0);
  assert.deepEqual(storage.recordScore('classic4', 1200, backend), { best: 1200, isNew: true });
  assert.deepEqual(storage.recordScore('classic4', 900, backend), { best: 1200, isNew: false });
  storage.recordScore('classic6', 700, backend);
  assert.equal(storage.bestFor('classic6', backend), 700);
  for (const key of ['time60', 'time120', 'time180', 'time5x60', 'time6x180']) {
    storage.recordScore(key, 100, backend);
    assert.equal(storage.bestFor(key, backend), 100, key);
  }
  storage.clearBests(backend);
  assert.deepEqual(storage.loadBests(backend), {});
});

/* ------------------------------------------------------------------ */
/* PRO                                                                 */
/* ------------------------------------------------------------------ */

test('無料は クラシック4×4 と タイムアタック4×4・60秒 だけ', () => {
  assert.equal(pro.canPlayMode(false, 'classic', 4), true);
  assert.equal(pro.canPlayMode(false, 'classic', 5), false);
  assert.equal(pro.canPlayMode(false, 'classic', 6), false);

  assert.equal(pro.canPlayMode(false, 'time', 4, 60), true);
  assert.equal(pro.canPlayMode(false, 'time', 4, 120), false);
  assert.equal(pro.canPlayMode(false, 'time', 4, 180), false);
  assert.equal(pro.canPlayMode(false, 'time', 5, 60), false);
  assert.equal(pro.canPlayMode(false, 'time', 6, 180), false);
  // 時間を省略したときは無料の 60秒
  assert.equal(pro.canPlayMode(false, 'time', 4), true);
  assert.equal(pro.canPlayMode(false, 'time', 5), false);

  // PRO ならすべて遊べる
  for (const size of [4, 5, 6]) {
    assert.equal(pro.canPlayMode(true, 'classic', size), true);
    for (const limit of [60, 120, 180]) {
      assert.equal(pro.canPlayMode(true, 'time', size, limit), true, `${size}/${limit}`);
    }
  }

  assert.deepEqual(pro.sizesForEntitled('classic', false), [4]);
  assert.deepEqual(pro.sizesForEntitled('classic', true), [4, 5, 6]);
  assert.deepEqual(pro.sizesForEntitled('time', false), [4]);
  assert.deepEqual(pro.timeLimitsForEntitled('time', false, 4), [60]);
  assert.deepEqual(pro.timeLimitsForEntitled('time', true, 4), [60, 120, 180]);
  assert.deepEqual(pro.modesFor(false), ['classic', 'time'], 'どちらのモードにも無料の組み合わせがある');
  assert.deepEqual(pro.modesFor(true), ['classic', 'time']);
  assert.equal(pro.needsPro('time', 4, 180), true);
  assert.equal(pro.needsProFor('classic', 5), true);
  assert.equal(pro.hasPro('time'), true);
});

test('商品IDと価格のプレースホルダは変えない', () => {
  assert.equal(pro.PRODUCT_ID, 'jp.signlink.Flip10.pro');
  assert.equal(pro.fallbackPrice('ja'), '¥300');
  assert.equal(pro.priceFor('ja', { price: '¥350' }), '¥350');
  assert.ok(MAIN.includes('pro.priceFor'));
  assert.ok(PRO.includes("PRODUCT_ID = 'jp.signlink.Flip10.pro'"));
});

/* ------------------------------------------------------------------ */
/* 画面（index.html / styles.css / main.js）                           */
/* ------------------------------------------------------------------ */

test('タイトル・表示名・メタが LINEZAP（Build 6）', () => {
  assert.ok(HTML.includes('<title>LINEZAP</title>'));
  assert.ok(HTML.includes('content="Build 6"'));
  assert.ok(!HTML.includes('content="Build 5"'));
  assert.ok(HTML.includes('<span class="brand__name">LINEZAP</span>'));
  assert.ok(HTML.includes('class="hero__logo"'));
  assert.ok(!HTML.includes('FLIP 10'), 'index.html に FLIP 10 が残っている');
  assert.ok(MAIN.includes("document.title = 'LINEZAP'"));
  assert.ok(CSS.includes('LINEZAP — styles (Build 6)'), 'CSS の版が Build 6 でない');
});

test('ホームは2モード（クラシック / タイムアタック）だけ', () => {
  assert.ok(HTML.includes('id="mode-list"'));
  assert.ok(MAIN.includes('for (const config of core.MODES)'));
  assert.ok(MAIN.includes('mode__sizes'), 'PRO サイズの目印が無い');
  assert.ok(CSS.includes('.mode__sizes'));
  assert.ok(!MAIN.includes("config.id === 'cross'"));
  assert.ok(!MAIN.includes('mode__pairs'));
  assert.ok(!HTML.includes('十字'), 'ホーム/あそびかたに十字フリップが残っている');
  assert.ok(!MAIN.includes('十字'), 'main.js に十字フリップが残っている');
});

test('開始前ページ（マス数・基準目標・時間・目標・手数・スタート）がある', () => {
  assert.ok(HTML.includes('id="sheet-start"'));
  assert.ok(HTML.includes('id="start-sizes"'));
  for (const size of [4, 5, 6]) assert.ok(HTML.includes(`data-size="${size}"`));
  assert.ok(HTML.includes('size-btn__base'), 'サイズボタンに基準目標の場所が無い');
  assert.ok(HTML.includes('size-btn__tag'));
  assert.ok(HTML.includes('id="start-times"'));
  assert.ok(HTML.includes('id="start-chips"'));
  for (const limit of [60, 120, 180]) assert.ok(HTML.includes(`data-time="${limit}"`), `${limit}秒のチップが無い`);
  assert.ok(HTML.includes('id="start-target-value"'));
  assert.ok(HTML.includes('data-target-step="-1"'));
  assert.ok(HTML.includes('data-target-step="1"'));
  assert.ok(HTML.includes('id="start-moves"'));
  assert.ok(HTML.includes('id="start-turn"'));
  assert.ok(HTML.includes('id="btn-start"'));
  for (const piece of ['function openStart', 'function renderStart', 'function pickStartSize', 'function pickStartTime', 'function stepStartTarget', 'startTargetFor']) {
    assert.ok(MAIN.includes(piece), `${piece} が無い`);
  }
  assert.ok(MAIN.includes('core.needsProSize(mode.id, value)'), 'サイズごとの PRO 判定が無い');
  assert.ok(MAIN.includes('core.needsProTime(mode.id, value)'), '時間ごとの PRO 判定が無い');
  assert.ok(MAIN.includes("i18n.t('start.base'"), 'サイズボタンに基準目標を出していない');
  assert.ok(MAIN.includes('core.baseTargetFor'), '基準目標を core から取っていない');
  assert.ok(CSS.includes('.size-btn'));
  assert.ok(CSS.includes('.start__sizes'));
  assert.ok(CSS.includes('.time-btn'));
  assert.ok(CSS.includes('.start__chips'));
});

test('プレイ画面の左上に ← が無く、制限時間のバーと秒数が上部にある', () => {
  const play = HTML.slice(HTML.indexOf('id="screen-play"'), HTML.indexOf('id="sheet-layer"'));
  assert.ok(!play.includes('id="btn-quit"'), '左上の戻るボタンが残っている');
  assert.ok(!play.includes('i-back'), '戻るアイコンが残っている');
  assert.ok(!MAIN.includes('#btn-quit'), '戻るボタンの配線が残っている');
  assert.ok(HTML.includes('id="turnbar"'));
  assert.ok(HTML.includes('id="turnbar-fill"'));
  assert.ok(HTML.includes('id="turn-time"'));
  assert.ok(MAIN.includes('function updateTurnBar'));
  assert.ok(MAIN.includes('core.formatSeconds'));
  assert.ok(MAIN.includes('game.turnLeft <= 3000'), '3秒以下の警告が無い');
  assert.ok(CSS.includes('.turnbar'));
  assert.ok(CSS.includes('.turnbar.is-urgent'));
  // 盤面の凡例（十字フリップ専用）は消えている
  assert.ok(!HTML.includes('play-legend'));
  assert.ok(!MAIN.includes('play-legend'));
});

test('ヒントは手数 −2 で、残り2以下では使えない（トースト）', () => {
  assert.ok(HTML.includes('id="hint-cost"'));
  assert.ok(HTML.includes('id="hint-cost-foot"'));
  assert.ok(MAIN.includes('core.spendHint'));
  assert.ok(MAIN.includes('core.hintAllowed'));
  assert.ok(MAIN.includes("toast(i18n.t('toast.hintCost'"));
  assert.ok(MAIN.includes('function updateHintButtons'));
  assert.ok(CSS.includes('.icon-btn__cost'));
  assert.ok(CSS.includes('.icon-btn--hint.is-spent'));
});

test('手数と制限時間は core のルールから来る', () => {
  assert.ok(MAIN.includes('game.turnLimit'));
  assert.ok(MAIN.includes('function updateTurnBar'));
  assert.ok(MAIN.includes('core.startGame'));
  assert.ok(MAIN.includes('mode.id, size'));
  assert.ok(CORE.includes('moves: 4, turnSeconds: 10'));
  assert.ok(CORE.includes('moves: 5, turnSeconds: 12'));
  assert.ok(CORE.includes('moves: 5, turnSeconds: 15'));
  assert.ok(CORE.includes('HINT_COST = 2'));
  assert.ok(CORE.includes('TIME_LIMITS = Object.freeze([60, 120, 180])'));
});

test('設定に合計ステッパーは無く、開始画面へ案内する（十字の記述も無い）', () => {
  assert.ok(!HTML.includes('id="set-target"'));
  assert.ok(!HTML.includes('data-step="-1"'));
  assert.ok(HTML.includes('id="set-target-note"'));
  assert.ok(HTML.includes('data-i18n="settings.targetAtStart"'));
  assert.ok(!MAIN.includes('changeTarget'));
  assert.ok(HTML.includes('id="target-text"'));
  assert.ok(HTML.includes('data-i18n="target.label"'));
  assert.ok(!i18n.DICT.ja['settings.targetAtStartNote'].includes('十字'));
});

test('あそびかたは6ステップ（モード選択・手数/時間・PRO）で、十字の図は無い', () => {
  for (let step = 1; step <= 6; step += 1) {
    assert.ok(HTML.includes(`data-i18n="howto.${step}.t"`), `howto.${step}.t が無い`);
    assert.ok(HTML.includes(`data-i18n="howto.${step}.b"`), `howto.${step}.b が無い`);
  }
  assert.ok(HTML.includes('diag--modes'));
  assert.ok(HTML.includes('diag--timer'));
  assert.ok(HTML.includes('diag--hint'));
  assert.ok(HTML.includes('diag--pro'), 'PRO の図が無い');
  assert.ok(CSS.includes('.diag--timer'));
  assert.ok(CSS.includes('.diag--hint'));
  assert.ok(CSS.includes('.diag--pro'));
  // 十字フリップの図は消えている（CI の互換メモだけがコメントで残る）
  assert.ok(!i18n.DICT.ja['howto.6.t'].includes('十字'));
  assert.ok(!HTML.includes('diag--cross" aria-hidden'), '十字の図が残っている');
});

test('6×6 の盤面と、1マス44px以上を守る CSS がある', () => {
  assert.ok(HTML.includes('id="board-wrap"'));
  assert.ok(CSS.includes('.board--6'));
  assert.ok(CSS.includes('.board-wrap.is-6'));
  assert.ok(MAIN.includes('`board board--${game.size}`'));
  assert.ok(MAIN.includes('`board-wrap is-${game.size}`'));
});

test('リザルトは時間切れ／手数切れを言い分ける', () => {
  assert.ok(HTML.includes('id="result-reason"'));
  assert.ok(MAIN.includes("'result.reasonTime'"));
  assert.ok(MAIN.includes("'result.reasonTimeAttack'"));
  assert.ok(MAIN.includes("'result.reasonMoves'"));
  assert.ok(MAIN.includes("core.OVER_REASON.time ? 'result.timeUp' : 'result.movesOut'"));
});

test('ビルド番号の表示は Build 6', () => {
  assert.ok(MAIN.includes('(Build ${state.build})'));
  assert.ok(MAIN.includes('build: core.BUILD'));
  assert.equal(core.BUILD, 6);
  assert.equal(core.VERSION, '1.0.0');
});

test('ドラッグ・タップの操作はそのまま（十字フリップの分岐は無い）', () => {
  for (const piece of ['function tileIndexAt', 'function paintDrag', 'function onBoardPointerDown', 'function onPointerMove', 'function onPointerUp', 'elementFromPoint', 'DRAG_THRESHOLD']) {
    assert.ok(MAIN.includes(piece), `${piece} が無い`);
  }
  assert.ok(MAIN.includes("addEventListener('pointerdown', onBoardPointerDown)"));
  assert.ok(MAIN.includes('state.suppressClick'));
  assert.ok(CSS.includes('touch-action: none'));
  assert.ok(!MAIN.includes('core.MECHANIC'));
  assert.ok(!MAIN.includes('doFlip'));
  assert.ok(!MAIN.includes('flipTile'));
  assert.ok(!MAIN.includes('is-back'));
});

/* ------------------------------------------------------------------ */
/* 数字タイルの色                                                      */
/* ------------------------------------------------------------------ */

test('数字タイルは 0〜9 の色分けを濃くして、文字は紺のまま', () => {
  const colors = [...CSS.matchAll(/\.tile\[data-v='(\d)'\] \{ background: linear-gradient\(180deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\); \}/g)];
  assert.equal(colors.length, 10, '0〜9 の色が10個そろっていない');
  const seen = new Set();
  for (const [, digit, top, bottom] of colors) {
    assert.ok(!seen.has(bottom), `${digit} の色がほかと重複している`);
    seen.add(bottom);
    // 下側の色は以前（#dfe6f6 等）より濃いめ＝明度が下がっている
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(bottom.slice(i, i + 2), 16));
    const light = (r * 299 + g * 587 + b * 114) / 1000;
    assert.ok(light >= 170 && light <= 235, `${digit} の明度が ${light}（濃すぎ/薄すぎ）`);
    assert.ok(top !== bottom);
  }
  assert.ok(CSS.includes('color: var(--ink)'), '数字の文字色が紺でない');
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

test('AudioContext が無くても音の関数は落ちない', () => {
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

test('バイブ（FlipHaptics）が選択・入れ替え・消去・終了・警告で呼ばれる', () => {
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

test('iOS は jp.signlink.Flip10 / LINEZAP / 1.0.0 / Build 6（Bundle ID と IAP は変えない）', () => {
  assert.ok(PBX.includes('PRODUCT_BUNDLE_IDENTIFIER = jp.signlink.Flip10;'));
  assert.ok(PBX.includes('MARKETING_VERSION = 1.0.0;'));
  const builds = [...PBX.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((match) => match[1]);
  assert.ok(builds.length >= 2, 'Debug/Release の両方にビルド番号が無い');
  assert.ok(builds.every((value) => value === '6'), `ビルド番号が6でない: ${builds.join(',')}`);
  assert.ok(INFO.includes('<string>LINEZAP</string>'));
  assert.ok(!INFO.includes('FLIP 10'));
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'jp.signlink.Flip10', 'Bundle ID は変えない');
  assert.equal(config.appName, 'LINEZAP');
  const iosConfig = JSON.parse(read('ios/App/App/capacitor.config.json'));
  assert.equal(iosConfig.appName, 'LINEZAP');
  assert.ok(APPDELEGATE.includes('jp.signlink.Flip10.pro'), 'IAP 製品 ID は変えない');
});

test('AppDelegate は StoreKit 2・音・バイブのブリッジを登録している', () => {
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

test('アイコンは LINEZAP の 1024×1024 RGB（透過なし）', () => {
  for (const path of ['assets/linezap-appicon-1024.png', 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png']) {
    const data = readFileSync(resolve(ROOT, path));
    assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${path} が PNG でない`);
    assert.equal(data.readUInt32BE(16), 1024, `${path} の幅`);
    assert.equal(data.readUInt32BE(20), 1024, `${path} の高さ`);
    assert.equal(data[25], 2, `${path} が RGB でない（透過あり）`);
    assert.ok(statSync(resolve(ROOT, path)).size > 20000, `${path} が小さすぎる`);
  }
});

test('TestFlight ワークフローはビルド番号を iOS から自動で読む（貼り替え不要）', () => {
  assert.ok(WORKFLOW.includes('BUNDLE_ID: jp.signlink.Flip10'));
  assert.ok(WORKFLOW.includes('APP_NAME: LINEZAP'));
  assert.ok(WORKFLOW.includes('CURRENT_PROJECT_VERSION'));
  assert.ok(WORKFLOW.includes('BUILD_NUMBER='));
  assert.ok(WORKFLOW.includes('$GITHUB_ENV'));
  assert.ok(WORKFLOW.includes('npm test'));
  assert.ok(WORKFLOW.includes('jp.signlink.Flip10.pro'));
  assert.ok(WORKFLOW.includes('upload_to_testflight'));
  assert.ok(WORKFLOW.includes('confirm_bundle_id'));
  assert.ok(!WORKFLOW.includes('BUILD_NUMBER: "1"'), 'ビルド番号が固定されている');
  assert.ok(WORKFLOW.includes("assert plist['CFBundleDisplayName'] == 'LINEZAP'"));
  // .github/workflows は触らない（docs 側の控えだけを検証する）
  const live = read('.github/workflows/ios-testflight-build1.yml');
  assert.ok(live.includes('CURRENT_PROJECT_VERSION'));
  assert.ok(live.includes('diag--cross'), 'ワークフローの古いガードはそのまま');
});

test('CI の古いガードは互換メモで満たす（十字フリップの文字列はコメントだけ）', () => {
  // ワークフローが grep する目印
  for (const needle of ["PAIR_SUM = 5", "MAX_MOVES = 7", "export function flipAt", "index - size", "index + size", "index - 1", "index + 1", "id: 'wide'", "id: 'wide6'", "id: 'cross'"]) {
    assert.ok(CORE.includes(needle), `core.js に互換メモ ${needle} が無い`);
  }
  assert.ok(HTML.includes('diag--cross'), 'index.html に互換メモ diag--cross が無い');
  assert.ok(HTML.includes('id="set-target-value"'), 'index.html に互換メモ set-target-value が無い');
  // 目印はコメントの中だけ（動くコードに十字フリップは無い）
  const code = CORE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const needle of ['PAIR_SUM', 'flipAt', 'function cross(', 'id: \'cross\'']) {
    assert.ok(!code.includes(needle), `${needle} がコードに残っている`);
  }
});

test('プライバシーポリシーは LINEZAP として両言語でオフラインを明記', () => {
  assert.ok(PRIVACY.includes('LINEZAP'));
  assert.ok(PRIVACY.includes('データを収集しません'));
  assert.ok(PRIVACY.includes('does not collect personal information'));
  assert.ok(PRIVACY.includes('t.maks.ts@gmail.com'));
  assert.ok(PRIVACY.includes('jp.signlink.Flip10.pro'));
  assert.ok(!PRIVACY.includes('FLIP 10'));
});

test('README と package.json が Build 6 の配布物として揃っている', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'linezap');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.build, 6);
  assert.ok(pkg.description.includes('Build 6'));
  assert.ok(pkg.scripts.test.includes('test/core.test.js'));
  assert.ok(pkg.scripts.test.includes('test/build6.test.js'));
  assert.ok(pkg.scripts.test.includes('test/build6-fixes.test.js'));
  assert.ok(pkg.scripts.shots.includes('tools/shots-b6.mjs'));
  assert.equal(pkg.dependencies['@capacitor/core'], '8.6.2');
  assert.ok(exists('docs/ios-testflight-build1.yml'));
  assert.ok(exists('docs/privacy.md'));
  assert.ok(exists('tools/make-www.mjs'));
  assert.ok(exists('tools/shots-b6.mjs'));
  assert.ok(exists('tools/build-i18n.py'));
  assert.ok(README.includes('LINEZAP'));
  assert.ok(README.includes('Build 6'));
  assert.ok(README.includes('6×6'));
  assert.ok(README.includes('ドラッグ'));
  assert.ok(README.includes('ヒント'));
  assert.ok(!README.includes('FLIP 10'));
  assert.ok(README.includes('遊び方から外した'), 'README に十字フリップを外した記録が無い');
});

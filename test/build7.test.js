/**
 * LINEZAP — Build 7 の検品（node --test）
 *
 * トモアキさんから預かった3つの要望に、ここで歯止めをかける。
 *
 *   1. クラシックの開始前ページは、いつもそのサイズの基準数（10 / 18 / 24）から。
 *      Build 3〜6 の試遊で localStorage に残った 13 / 18 に引きずられない
 *      （`storage.targetForStart`。タイムアタックは今までどおり覚えた値）。
 *   2. プレイ画面の目標数の表記を大きく（目標カード＋「今/目標」を読みやすく）。
 *   3. ホーム画面のボタンを大きく、縦に心地よく配置。
 *
 * 実際の画面は tools/shots-b7.mjs（Playwright / Chromium）が見た目と寸法で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as core from '../src/core.js';
import * as storage from '../src/storage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(resolve(ROOT, relative), 'utf8');

const MAIN = read('src/main.js');
const HTML = read('index.html');
const CSS = read('styles.css');

function memoryBackend(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/* ------------------------------------------------------------------ */
/* 1. クラシックは基準数からスタート                                    */
/* ------------------------------------------------------------------ */

test('クラシックの開始前ページは保存値ではなく基準数（10 / 18 / 24）から始まる', () => {
  // Build 3〜4 の試遊で書かれた「5×5 に 13、6×6 に 18」が残っている端末
  const stale = storage.normalizeSettings({
    targets: { classic5: 13, classic6: 18, time5: 30, time6: 24 },
  });
  assert.equal(storage.targetForStart(stale, 'classic', 4), 10, '4×4 は 10');
  assert.equal(storage.targetForStart(stale, 'classic', 5), 18, '5×5 は基準 18（保存値 13 を使わない）');
  assert.equal(storage.targetForStart(stale, 'classic', 6), 24, '6×6 は基準 24（保存値 18 を使わない）');

  // 古い1つの目標（Build 3 までの `target`）が残っていても同じ
  const legacy = storage.normalizeSettings({ target: 30 });
  assert.equal(storage.targetForStart(legacy, 'classic', 5), 18);
  assert.equal(storage.targetForStart(legacy, 'classic', 6), 24);

  // 保存値そのものは壊さない（タイムアタックの選択は引き続き読める）
  assert.equal(storage.targetFor(stale, 'classic', 5), 13, 'targetFor は今までどおり保存値を読む');
  assert.equal(storage.targetForStart(stale, 'time', 5), 30, 'タイムアタックは覚えた値');
});

test('タイムアタックは最後に選んだ目標を開始前ページに戻す（基準も範囲も守る）', () => {
  const backend = memoryBackend();
  let settings = storage.loadSettings(backend);
  assert.equal(storage.targetForStart(settings, 'time', 5), 18, '最初は基準 18');
  settings = storage.rememberTarget(settings, 'time', 5, 12, backend);
  settings = storage.loadSettings(backend);
  assert.equal(storage.targetForStart(settings, 'time', 5), 12);
  assert.equal(storage.targetForStart({ targets: { time6: 99 } }, 'time', 6), 42, '範囲外は 42');
  assert.equal(storage.targetForStart({}, 'time', 4), 10, '4×4 は 10 固定');
});

test('開始前ページ・スタートは targetForStart を通り、クラシックの選択は保存しない', () => {
  assert.ok(MAIN.includes('storage.targetForStart(state.settings, modeId, size)'), 'startTargetFor が targetForStart を使う');
  assert.ok(MAIN.includes("if (mode.id !== 'classic') {\n    state.settings = storage.rememberTarget(state.settings, mode.id, size, next);"), 'ステッパーの保存はクラシック以外');
  assert.ok(MAIN.includes("if (!core.targetBounds(boardSize).fixed && mode.id !== 'classic')"), 'スタート時の保存もクラシック以外');
  // ステッパー自体は残る（その場で 12〜42 を選べる）
  assert.ok(HTML.includes('data-target-step="-1"') && HTML.includes('data-target-step="1"'));
});

test('Build 7 の目印（1.0.1 / Build 7）', () => {
  assert.equal(core.BUILD, 7);
  assert.equal(core.VERSION, '1.0.1');
  assert.ok(HTML.includes('content="Build 7"'));
  assert.ok(CSS.includes('LINEZAP — styles (Build 7)'));
});

/* ------------------------------------------------------------------ */
/* 2. プレイ画面の目標数を大きく                                        */
/* ------------------------------------------------------------------ */

test('プレイ画面の目標は盤面の上に大きなカードで出る', () => {
  const target = HTML.indexOf('class="targetbar"');
  const wrap = HTML.indexOf('id="board-wrap"');
  assert.ok(target > 0 && wrap > 0);
  assert.ok(target < wrap, '目標カードが盤面より上にある');
  assert.ok(HTML.includes('id="target-text"'), '目標の数字の要素');
  const rule = CSS.match(/\.targetbar b \{[\s\S]*?\}/);
  assert.ok(rule, '目標の数字のスタイルが無い');
  const size = Number(rule[0].match(/font-size:\s*([\d.]+)rem/)[1]);
  assert.ok(size >= 2.8, `目標の数字が小さい（${size}rem）`);
  assert.ok(CSS.includes('.targetbar__key'), '「目標」の見出し');
});

test('「今/目標」の合計は大きな数字＋小さな /目標 で1行に収まる', () => {
  assert.ok(MAIN.includes('class="sum__val"'), '合計の入れ物');
  assert.ok(MAIN.includes('<i>/${rowTarget}</i>') && MAIN.includes('<i>/${colTarget}</i>'), '/目標 を小さく出す');
  assert.ok(CSS.includes('.sum__val'), '合計の入れ物のスタイル');
  const val = CSS.match(/\.sum__val \{[\s\S]*?\}/);
  assert.ok(val && val[0].includes('white-space: nowrap'), '「今/目標」が折り返さない');
  const sum = CSS.match(/\n\.sum \{[\s\S]*?\}/);
  assert.ok(sum, '.sum のスタイルが無い');
  const size = Number(sum[0].match(/font-size:\s*([\d.]+)rem/)[1]);
  assert.ok(size >= 0.9, `合計の数字が小さい（${size}rem）`);
  assert.ok(CSS.includes('.sum i'), '/目標 は少し小さく');
});

test('6×6 の合計も読める大きさで、1マス44px以上を守る', () => {
  const six = CSS.match(/\.board-wrap\.is-6 \.sum \{[\s\S]*?\}/);
  assert.ok(six, '6×6 の合計のスタイルが無い');
  const size = Number(six[0].match(/font-size:\s*([\d.]+)rem/)[1]);
  assert.ok(size >= 0.68, `6×6 の合計が小さい（${size}rem）`);
  assert.ok(CSS.includes('.board-wrap.is-6 .sums--cols .sum'), '6×6 の下の合計はもっと大きく');
  assert.ok(CSS.includes('.board-wrap.is-6 .tile'), '6×6 のマスの寸法');
});

test('背の低い端末では目標カードだけを縮めて、盤面と操作を残す', () => {
  const compact = CSS.slice(CSS.indexOf('@media (max-height: 700px)'));
  assert.ok(compact.includes('.targetbar b'), '目標の数字を縮める指定が無い');
  assert.ok(compact.includes('.board-area'), '盤面の間隔を詰める指定が無い');
});

/* ------------------------------------------------------------------ */
/* 3. ホーム画面のボタンを大きく                                        */
/* ------------------------------------------------------------------ */

test('ホームのボタン類を大きくした（あそぶ・モード・下部のピル・右上のアイコン）', () => {
  const play = CSS.match(/\.btn-play \{[\s\S]*?\}/)[0];
  assert.ok(/padding:\s*1[6-9]px/.test(play), `あそぶボタンの高さが足りない: ${play}`);
  const label = CSS.match(/\.btn-play__label \{[\s\S]*?\}/)[0];
  assert.ok(Number(label.match(/font-size:\s*([\d.]+)rem/)[1]) >= 1.7, '「あそぶ」の文字が小さい');
  const mode = CSS.match(/\.mode__main \{[\s\S]*?\}/)[0];
  assert.ok(/padding:\s*1[3-9]px/.test(mode), 'モードカードの余白が足りない');
  const pill = CSS.match(/\.pill \{[\s\S]*?\}/)[0];
  assert.ok(Number(pill.match(/min-height:\s*(\d+)px/)[1]) >= 48, '下部のボタンが低い');
  const icon = CSS.match(/\.icon-btn \{[\s\S]*?\}/)[0];
  assert.ok(Number(icon.match(/width:\s*(\d+)px/)[1]) >= 46, '右上のアイコンが小さい');
  const foot = CSS.match(/\.playfoot \.pill \{[\s\S]*?\}/)[0];
  assert.ok(foot.includes('font-size'), 'プレイ下部の3つは文字を詰めて1行に保つ');
});

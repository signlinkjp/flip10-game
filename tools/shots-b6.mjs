/**
 * 実ブラウザ（Chromium）での操作テスト＋スクリーンショット（Build 6）
 *   npm run shots
 *
 * 確かめること:
 *   オープニング（LINEZAP ロゴ＋黄金ライン）が出て、タップで即スキップ
 *   タイトルと表示名が LINEZAP・メタが Build 6
 *   ホームは2モード（クラシック / タイムアタック）。十字フリップの文字はどこにも無い
 *   開始前ページ: サイズボタンに「基準 10 / 18 / 24」、4×4 は無料・5×5/6×6 は PRO
 *   タイムアタック: 60秒は無料、120秒・180秒は PRO。5×5/6×6 は PRO
 *   クラシック4×4 は目標10固定・手数4・10秒。1ライン消すと制限時間が戻る
 *   6×6 は目標24（基準）・手数5・15秒・1マス44px以上
 *   タイムアタック180秒は 3:00 から。手数もターンタイマーも無い
 *   数字タイルの色が0〜9で分かれ、文字は紺のまま
 *   375px / 393px / 特大文字で崩れない・コンソールエラーと404がゼロ
 *
 * 出力: /workspace/downloads/linezap-b6-*.png
 *       審査用の 6.3インチ（1206×2622）= `-63` / iPad 13インチ（2064×2752）= `-ipad13`
 *
 * 環境変数（この環境の Chromium 用）:
 *   PLAYWRIGHT_LIBS … libnspr4 等の場所
 *   PLAYWRIGHT_PATH … playwright 本体の場所
 */

import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = resolve(ROOT, '../..');
const OUT = resolve(WORKSPACE, 'downloads');

const LIBS = process.env.PLAYWRIGHT_LIBS ?? '/workspace/work/dorokei-game/.browser-libs/usr/lib/x86_64-linux-gnu';
const PLAYWRIGHT_FALLBACK = process.env.PLAYWRIGHT_PATH ?? '/workspace/work/dcd-b17/node_modules/playwright/index.js';

async function loadChromium() {
  for (const specifier of ['playwright', PLAYWRIGHT_FALLBACK]) {
    try {
      const mod = await import(specifier);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      /* 次の候補へ */
    }
  }
  throw new Error('playwright が見つかりません（npm i -D playwright で導入してください）');
}

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) throw new Error(`NG: ${name} ${JSON.stringify(detail)}`);
}
const step = (msg) => console.error(`[step] ${msg}`);

async function tiles(page) {
  return page.$$eval('#board .tile', (nodes) =>
    nodes.map((node) => ({
      value: Number(node.querySelector('.tile__value').textContent),
      picked: node.classList.contains('is-picked'),
      hint: node.classList.contains('is-hint'),
      bg: getComputedStyle(node).backgroundImage,
      color: getComputedStyle(node).color,
    })),
  );
}

async function sumTexts(page) {
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll('#sums-rows .sum')].map((node) => node.textContent),
    cols: [...document.querySelectorAll('#sums-cols .sum')].map((node) => node.textContent),
  }));
}

async function tileCenter(page, index) {
  return page.evaluate((i) => {
    const node = document.querySelector(`#board .tile[data-i="${i}"]`);
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, index);
}

/** 指で押したまま（pointerdown → move → up）2マス目まで運ぶ */
async function dragTile(page, from, to) {
  const a = await tileCenter(page, from);
  const b = await tileCenter(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 12, a.y + 12, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 10 });
  const mid = await page.evaluate(() => ({
    source: document.querySelectorAll('#board .tile.is-drag-source').length,
    target: document.querySelectorAll('#board .tile.is-drop-target').length,
  }));
  await page.mouse.up();
  return mid;
}

/** トーストが消えるまで待つ（スクリーンショットに被らないように） */
async function waitToast(page) {
  try {
    await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('is-show'), null, { timeout: 4000 });
  } catch {
    /* 出ていないときはそのまま */
  }
  await page.waitForTimeout(180);
}

async function settle(page, extra = 220) {
  try {
    await page.waitForFunction(() => window.__linezap && window.__linezap.state.busy === false, null, { timeout: 8000 });
  } catch {
    /* busy が取れないときはそのまま */
  }
  await page.waitForTimeout(extra);
}

async function openHome(page) {
  await page.evaluate(() => {
    window.__linezap.closeSheet();
    if (document.querySelector('#screen-play.is-active')) document.querySelector('#btn-home').click();
  });
  await page.waitForFunction(() => document.querySelector('#screen-home.is-active') !== null);
  await page.waitForTimeout(160);
}

/** ホームの「重なり」と「はみ出し」を測る */
async function homeLayout(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const node = document.querySelector(sel);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const home = document.querySelector('#screen-home');
    const names = [...document.querySelectorAll('#mode-list .mode__name')].map((node) => {
      const r = node.getBoundingClientRect();
      const line = parseFloat(getComputedStyle(node).lineHeight) || 20;
      return { text: node.textContent, lines: Math.round(r.height / line) };
    });
    return {
      brand: box('.brand'),
      demo: box('#hero-demo'),
      logo: box('.hero__logo'),
      play: box('#btn-play'),
      modes: box('#mode-list'),
      foot: box('.homefoot'),
      homeOverflow: home.scrollHeight - home.clientHeight,
      pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      modeNames: names,
      descLines: [...document.querySelectorAll('#mode-list .mode__desc')].map((node) => {
        const r = node.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(node).lineHeight) || 16;
        return Math.round(r.height / line);
      }),
    };
  });
}

async function readTurn(page) {
  return page.evaluate(() => ({
    hidden: document.querySelector('#turnbar').hidden,
    text: document.querySelector('#turn-time').textContent,
    urgent: document.querySelector('#turnbar').classList.contains('is-urgent'),
    ratio: document.querySelector('#turnbar-fill').style.transform,
  }));
}

/** 開始前ページの見た目をまとめて読む */
async function readStart(page) {
  return page.evaluate(() => ({
    title: document.querySelector('#start-title').textContent.trim(),
    sizes: [...document.querySelectorAll('#start-sizes .size-btn')].map((node) => ({
      size: Number(node.dataset.size),
      on: node.classList.contains('is-on'),
      locked: node.classList.contains('is-locked'),
      base: node.querySelector('.size-btn__base').textContent.trim(),
      tag: node.querySelector('.size-btn__tag').textContent.trim(),
    })),
    timesHidden: document.querySelector('#start-times').hidden,
    times: [...document.querySelectorAll('#start-chips .time-btn')].map((node) => ({
      time: Number(node.dataset.time),
      on: node.classList.contains('is-on'),
      locked: node.classList.contains('is-locked'),
      label: node.querySelector('b').textContent.trim(),
      tag: node.querySelector('.time-btn__tag').textContent.trim(),
    })),
    target: document.querySelector('#start-target-value').textContent.trim(),
    stepperDisabled: document.querySelector('#sheet-start [data-target-step="1"]').disabled,
    note: document.querySelector('#start-target-note').textContent.trim(),
    movesHidden: document.querySelector('#start-moves-wrap').hidden,
    moves: document.querySelector('#start-moves').textContent.trim(),
    turn: document.querySelector('#start-turn').textContent.trim(),
    sub: document.querySelector('#start-play-sub').textContent.trim(),
  }));
}

/** PNG の幅・高さを読む（依存を増やさない） */
function pngSize(path) {
  const data = readFileSync(path);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function main() {
  const chromium = await loadChromium();
  const server = await startServer();
  await mkdir(OUT, { recursive: true });

  let browser = null;
  const consoleErrors = [];
  const badResponses = [];
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      env: { ...process.env, LD_LIBRARY_PATH: `${LIBS}:${process.env.LD_LIBRARY_PATH ?? ''}` },
    });

    const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    await page.addInitScript(() => {
      window.__hapticCalls = [];
      window.Capacitor = window.Capacitor || {};
      window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.FlipHaptics = {
        haptic(options) {
          window.__hapticCalls.push(options.kind);
          return Promise.resolve({ kind: options.kind });
        },
      };
    });

    /* ---------------------------------------------------------------- */
    /* 1. 初回起動                                                        */
    /* ---------------------------------------------------------------- */
    step('オープニング');
    await page.goto(`${server.url}/?test=1`, { waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible', timeout: 10000 });
    const openingLogo = await page.textContent('.opening__logo');
    check('オープニングに LINEZAP ロゴが出る', openingLogo.replace(/\s/g, '') === 'LINEZAP', openingLogo);
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 6000 });
    check('起動直後はホームが出ている', await page.isVisible('#screen-home'));

    step('タイトル・ブランド・既定の設定');
    await page.waitForSelector('#mode-list .mode', { timeout: 10000 });
    await page.waitForFunction(() => Boolean(window.__linezap));
    check('タイトルが LINEZAP', (await page.title()) === 'LINEZAP', await page.title());
    check('左上のブランドが LINEZAP', (await page.textContent('.brand__name')).trim() === 'LINEZAP');
    check('メタのビルドが Build 6', (await page.getAttribute('meta[name="app-build"]', 'content')) === 'Build 6');
    await page.click('#btn-lang-home');
    await page.waitForSelector('#sheet-language:not([hidden])');
    await page.click('#lang-grid [data-locale="ja"]');
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.waitForTimeout(200);

    step('オープニングのスクリーンショット（日本語）');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-opening.png') });
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 6000 });
    await page.waitForFunction(() => Boolean(window.__linezap));

    step('ホームの2モード');
    const modeIds = await page.$$eval('#mode-list .mode', (nodes) => nodes.map((node) => node.dataset.mode));
    check('モードは クラシック→タイムアタック の2つ', modeIds.join(',') === 'classic,time', modeIds);
    const homeText = await page.evaluate(() => document.body.innerText);
    for (const word of ['十字', 'Cross Flip', '表裏']) {
      check(`ホームに「${word}」が無い`, !homeText.includes(word));
    }
    const classicTags = await page.$$eval('#mode-list .mode--classic .mode__sizes b', (nodes) => nodes.map((node) => node.textContent.trim()));
    check('クラシックに 4×4 / 5×5 / 6×6 の目印', classicTags.join(' ').replace(/\s+/g, ' ') === '4×4 5×5PRO 6×6PRO', classicTags);
    const timeTags = await page.$$eval('#mode-list .mode--time .mode__sizes b', (nodes) => nodes.map((node) => node.textContent.trim()));
    check('タイムアタックにもサイズの目印', timeTags.length === 3, timeTags);
    const bgmDefault = await page.getAttribute('#set-bgm', 'aria-checked');
    check('BGM が最初から ON', bgmDefault === 'true', bgmDefault);

    step('ホームのレイアウト（393px）');
    let layout = await homeLayout(page);
    check('左上ロゴとミニ盤面が重ならない (393px)', layout.brand.bottom <= layout.demo.top + 0.5, { brand: layout.brand, demo: layout.demo });
    check('ホームが縦にはみ出さない (393px)', layout.homeOverflow <= 1, layout.homeOverflow);
    check('ホームが横にはみ出さない (393px)', layout.pageOverflowX <= 0, layout.pageOverflowX);
    check('モード名が折り返さない (393px)', layout.modeNames.every((item) => item.lines === 1), layout.modeNames);
    check('モードの説明が2行以内 (393px)', layout.descLines.every((lines) => lines <= 2), layout.descLines);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-home.png') });

    step('オープニングはタップで即スキップできる');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible' });
    const skipStart = Date.now();
    await page.mouse.click(200, 400);
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 3000 });
    check('タップで 1秒以内に閉じる', Date.now() - skipStart < 1100, Date.now() - skipStart);
    await page.waitForFunction(() => Boolean(window.__linezap));

    /* ---------------------------------------------------------------- */
    /* 2. クラシックの開始前ページ（無料）                                 */
    /* ---------------------------------------------------------------- */
    step('クラシックの開始前ページ（4×4）');
    await page.click('#mode-list [data-mode="classic"]');
    await page.waitForSelector('#sheet-start:not([hidden])');
    let start = await readStart(page);
    check('開始前ページのタイトルがクラシック', start.title === 'クラシック', start);
    check('マス数は 4×4 / 5×5 / 6×6 の3つ', start.sizes.map((b) => b.size).join(',') === '4,5,6', start.sizes);
    check('最初は 4×4 が選ばれている', start.sizes[0].on === true, start.sizes);
    check('サイズボタンに基準 10 / 18 / 24', start.sizes.map((b) => b.base).join('|') === '基準 10|基準 18|基準 24', start.sizes);
    check('4×4 は無料、5×5 / 6×6 は PRO', start.sizes.map((b) => b.tag).join('|') === '無料|PRO|PRO', start.sizes);
    check('PRO 未購入では 5×5・6×6 に鍵', start.sizes[1].locked === true && start.sizes[2].locked === true, start.sizes);
    check('タイムアタックの時間はクラシックでは出ない', start.timesHidden === true, start);
    check('4×4 の目標は 10 固定', start.target === '10', start);
    check('4×4 はステッパーが無効', start.stepperDisabled === true, start);
    check('手数 4', start.moves === '4', start);
    check('制限時間 10秒', start.turn === '10秒', start);
    check('スタートの補助が 4×4 · 10', start.sub === '4×4 · 10', start.sub);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-start-classic.png') });

    step('PRO 未購入で 5×5 を押すと購入画面');
    await page.click('#start-sizes [data-size="5"]');
    await page.waitForSelector('#sheet-pro:not([hidden])');
    check('PRO の購入画面が出る', await page.isVisible('#sheet-pro'));
    const proText = await page.textContent('#sheet-pro');
    for (const word of ['十字', 'Cross Flip']) check(`PRO の説明に「${word}」が無い`, !proText.includes(word));
    for (const word of ['5×5', '6×6', '120秒', '180秒']) check(`PRO の説明に「${word}」がある`, proText.includes(word));
    await page.evaluate(() => window.__linezap.closeSheet());

    step('クラシック 4×4 を開始');
    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 250);
    const count = await page.$$eval('#board .tile', (nodes) => nodes.length);
    check('4×4 の16マス', count === 16, count);
    check('手数は4', (await page.textContent('#hud-moves')).trim() === '4');
    const turn = await readTurn(page);
    check('制限時間バーが出ている', turn.hidden === false, turn);
    check('秒数が 10 前後で出る', /^9\.\d$|^10\.0$/.test(turn.text), turn.text);
    check('左上に ← が無い', (await page.$$('#btn-quit, .icon-btn--back')).length === 0);
    check('ヒントに −2 のコスト表示', await page.$eval('#hint-cost', (node) => node.hidden === false));
    const sums = await sumTexts(page);
    check('右のバッジが「今の合計/10」', sums.rows.length === 4 && sums.rows.every((text) => /^\d+\/10$/.test(text)), sums.rows);
    check('目標の表示は 10', (await page.textContent('#target-text')).trim() === '10');

    step('数字タイルの色分け（0〜9）');
    await page.evaluate(() => {
      window.__linezap.setBoard([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5]);
    });
    const painted = await tiles(page);
    const backgrounds = new Set(painted.slice(0, 10).map((tile) => tile.bg));
    check('0〜9 の背景色がすべて違う', backgrounds.size === 10, [...backgrounds].slice(0, 3));
    check('数字の文字は濃い紺（rgb(21, 32, 70) 系）', painted.every((tile) => /rgb\((1[0-9]|2[0-9]|3[0-9]), (2[0-9]|3[0-9]|4[0-9]), (5[0-9]|6[0-9]|7[0-9])\)/.test(tile.color)), painted[0].color);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-colors.png') });

    step('タイマー警告色（残り3秒以下）');
    await page.evaluate(() => window.__linezap.setTurnLeft(2500));
    await page.waitForTimeout(250);
    const urgent = await readTurn(page);
    check('残り3秒以下で警告色になる', urgent.urgent === true, urgent);

    step('ヒントで手数 −2');
    await page.evaluate(() => window.__linezap.setTurnLeft(9000));
    const movesBefore = Number(await page.textContent('#hud-moves'));
    await page.click('#btn-hint');
    await page.waitForTimeout(300);
    const movesAfterHint = Number(await page.textContent('#hud-moves'));
    check('ヒントで手数が2減る', movesAfterHint === movesBefore - 2, { movesBefore, movesAfterHint });
    const hinted = (await tiles(page)).filter((tile) => tile.hint).length;
    check('ヒントのマスが光る', hinted >= 2, hinted);

    step('残り2以下ではヒントを使えない');
    await page.evaluate(() => document.querySelector('#btn-hint').click());
    await page.waitForTimeout(300);
    const toastText = await page.textContent('#toast');
    check('「残り3以上」のトーストが出る', toastText.includes('残り3以上'), toastText);
    check('手数は減らない', Number(await page.textContent('#hud-moves')) === 2);
    check('ヒントボタンが使用不可の見た目', await page.$eval('#btn-hint', (node) => node.classList.contains('is-spent')));

    step('ライン消去で手数とタイマーが戻る');
    await page.evaluate(() => {
      window.__linezap.setMoves(4);
      window.__linezap.setTurnLeft(3000);
      window.__linezap.setBoard([
        3, 2, 4, 0,
        1, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);
    });
    const scoreBefore = await page.evaluate(() => window.__linezap.game.score);
    await dragTile(page, 3, 4);
    await settle(page, 420);
    const afterClear = await page.evaluate(() => ({ score: window.__linezap.game.score, moves: window.__linezap.game.moves, turnLeft: window.__linezap.game.turnLeft, limit: window.__linezap.game.turnLimit }));
    check('合計10の行が消えて得点が入る', afterClear.score - scoreBefore >= 100, { scoreBefore, afterClear });
    check('1ライン消しで手数は減らない（4のまま）', afterClear.moves === 4, afterClear);
    check('消すとタイマーが満タンに戻る', afterClear.turnLeft > 8000 && afterClear.limit === 10000, afterClear);
    await waitToast(page);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-play.png') });

    step('0秒で時間切れゲームオーバー');
    await page.evaluate(() => window.__linezap.setTurnLeft(600));
    await page.waitForTimeout(1100);
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 5000 });
    const resultTitle = await page.textContent('#result-title');
    const resultReason = await page.textContent('#result-reason');
    check('結果が「タイムアップ！」', /タイムアップ|時間切れ/.test(resultTitle), resultTitle);
    check('結果に制限時間の文言が出る', /制限時間/.test(resultReason), resultReason);
    const overMoves = await page.evaluate(() => window.__linezap.game.moves);
    check('手数が残っていても終わる', overMoves > 0, overMoves);
    await waitToast(page);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-result-timeout.png') });

    /* ---------------------------------------------------------------- */
    /* 3. PRO（5×5・6×6・120秒・180秒）                                  */
    /* ---------------------------------------------------------------- */
    step('PRO を解放してクラシック 5×5');
    await page.evaluate(() => {
      window.__linezap.closeSheet();
      window.__linezap.setEntitled(true);
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    await page.click('#start-sizes [data-size="5"]');
    await page.waitForTimeout(150);
    start = await readStart(page);
    check('5×5 を選ぶと鍵が消える', start.sizes.every((b) => !b.locked), start.sizes);
    check('5×5 の目標は基準 18', start.target === '18', start.target);
    check('5×5 の注記に基準 18', start.note.includes('基準 18'), start.note);
    check('5×5 の手数は5', start.moves === '5', start.moves);
    check('5×5 の制限時間は12秒', start.turn === '12秒', start.turn);
    for (let i = 0; i < 7; i += 1) await page.click('#sheet-start [data-target-step="1"]');
    const value5b = Number(await page.textContent('#start-target-value'));
    check('目標ステッパーが動く', value5b > 18, { value5b });
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-start-5.png') });
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 260);
    check('5×5 は25マス', (await page.$$eval('#board .tile', (nodes) => nodes.length)) === 25);
    check('5×5 の目標が反映される', (await page.textContent('#target-text')).trim() === String(value5b));
    check('5×5 のタイマーは12秒から', /^1[12]\.\d$/.test((await readTurn(page)).text), (await readTurn(page)).text);

    step('クラシック 6×6（基準 24）');
    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    await page.click('#start-sizes [data-size="6"]');
    await page.waitForTimeout(150);
    start = await readStart(page);
    check('6×6 の目標は基準 24', start.target === '24', start.target);
    check('6×6 の手数は5', start.moves === '5');
    check('6×6 の制限時間は15秒', start.turn === '15秒');
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 260);
    check('6×6 は36マス', (await page.$$eval('#board .tile', (nodes) => nodes.length)) === 36);
    check('6×6 の手数は5', (await page.textContent('#hud-moves')).trim() === '5');
    check('6×6 の制限時間は15秒', /^1[45]\.\d$/.test((await readTurn(page)).text));
    check('6×6 の目標は24', (await page.textContent('#target-text')).trim() === '24');
    const tileSize = await page.evaluate(() => {
      const r = document.querySelector('#board .tile').getBoundingClientRect();
      const wrap = document.querySelector('#board-wrap').getBoundingClientRect();
      return { w: r.width, h: r.height, wrapRight: wrap.right, viewport: window.innerWidth };
    });
    check('6×6 で1マス44px以上', tileSize.w >= 44 && tileSize.h >= 44, tileSize);
    check('6×6 が横にはみ出さない', tileSize.wrapRight <= tileSize.viewport, tileSize);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-play-6.png') });

    /* ---------------------------------------------------------------- */
    /* 4. タイムアタック（60/120/180秒）                                  */
    /* ---------------------------------------------------------------- */
    step('タイムアタックの開始前ページ（時間の選択）');
    await openHome(page);
    await page.click('#mode-list [data-mode="time"]');
    await page.waitForSelector('#sheet-start:not([hidden])');
    start = await readStart(page);
    check('タイトルがタイムアタック', start.title === 'タイムアタック', start.title);
    check('時間のチップが出る', start.timesHidden === false, start);
    check('時間は 60 / 120 / 180 の3つ', start.times.map((t) => t.time).join(',') === '60,120,180', start.times);
    check('60秒が選ばれている', start.times[0].on === true, start.times);
    check('60秒は無料、120秒・180秒は PRO', start.times.map((t) => t.tag).join('|') === '無料|PRO|PRO', start.times);
    check('時間の表記が 60秒 / 120秒 / 180秒', start.times.map((t) => t.label).join('|') === '60秒|120秒|180秒', start.times);
    check('タイムアタックでも 4×4 は無料・5×5/6×6 は PRO', start.sizes.map((b) => b.tag).join('|') === '無料|PRO|PRO', start.sizes);
    check('タイムアタックでは手数を出さない', start.movesHidden === true, start);
    check('制限時間 60秒', start.turn === '60秒', start.turn);
    check('スタートの補助が 4×4 · 10 · 60秒', start.sub === '4×4 · 10 · 60秒', start.sub);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-start-time.png') });

    step('タイムアタック 180秒（PRO）を選ぶ');
    await page.click('#start-chips [data-time="180"]');
    await page.waitForTimeout(150);
    start = await readStart(page);
    check('180秒が選ばれている', start.times[2].on === true, start.times);
    check('180秒で制限時間が 180秒', start.turn === '180秒', start.turn);
    await page.click('#start-sizes [data-size="6"]');
    await page.waitForTimeout(150);
    start = await readStart(page);
    check('タイムアタック 6×6 の目標は基準 24', start.target === '24', start.target);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-start-time-6.png') });
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 250);
    const timeState = await page.evaluate(() => ({
      mode: window.__linezap.game.modeId,
      size: window.__linezap.game.size,
      limit: window.__linezap.game.timeLimit,
      moves: window.__linezap.game.moves,
      turn: window.__linezap.game.turnLimit,
      hud: document.querySelector('#hud-time').textContent,
      clockHidden: document.querySelector('#hud-time-wrap').hidden,
      turnbarHidden: document.querySelector('#turnbar').hidden,
      movesHidden: document.querySelector('#hud-moves-wrap').hidden,
      costHidden: document.querySelector('#hint-cost').hidden,
      tiles: document.querySelectorAll('#board .tile').length,
      target: document.querySelector('#target-text').textContent,
    }));
    check('タイムアタック 6×6・180秒', timeState.mode === 'time' && timeState.size === 6 && timeState.limit === 180, timeState);
    check('タイムアタックは手数もターンタイマーも無い', timeState.moves === null && timeState.turn === 0, timeState);
    check('全体タイマーが 3:00 から', timeState.hud === '3:00' && timeState.clockHidden === false, timeState);
    check('制限時間バーも手数もヒント−2も出ない', timeState.turnbarHidden === true && timeState.movesHidden === true && timeState.costHidden === true, timeState);
    check('36マス・目標24', timeState.tiles === 36 && timeState.target === '24', timeState);
    await waitToast(page);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-play-time.png') });

    step('タイムアタック 0秒で終了');
    await page.evaluate(() => {
      window.__linezap.state.game = { ...window.__linezap.state.game, timeLeft: 400 };
    });
    await page.waitForTimeout(1000);
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 5000 });
    check('タイムアタックの時間切れリザルト', /タイムアップ|時間切れ/.test(await page.textContent('#result-title')));
    await page.evaluate(() => window.__linezap.closeSheet());

    /* ---------------------------------------------------------------- */
    /* 4.5 無料のタイムアタック 4×4・60秒                                */
    /* ---------------------------------------------------------------- */
    step('無料のタイムアタック 4×4・60秒');
    await page.evaluate(() => {
      window.__linezap.setEntitled(false);
      window.__linezap.closeSheet();
    });
    await openHome(page);
    await page.click('#mode-list [data-mode="time"]');
    await page.waitForSelector('#sheet-start:not([hidden])');
    await page.click('#start-chips [data-time="120"]');
    await page.waitForSelector('#sheet-pro:not([hidden])');
    check('無料では 120秒を押すと購入画面', await page.isVisible('#sheet-pro'));
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.evaluate(() => window.__linezap.openStart('time'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 220);
    const freeTime = await page.evaluate(() => ({
      size: window.__linezap.game.size,
      limit: window.__linezap.game.timeLimit,
      hud: document.querySelector('#hud-time').textContent,
    }));
    check('無料のタイムアタックは 4×4・60秒', freeTime.size === 4 && freeTime.limit === 60, freeTime);
    check('時計が 1:00 から', freeTime.hud === '1:00', freeTime.hud);
    await openHome(page);

    /* ---------------------------------------------------------------- */
    /* 5. あそびかた・設定                                               */
    /* ---------------------------------------------------------------- */
    step('あそびかた');
    await page.click('#btn-howto');
    await page.waitForSelector('#sheet-howto:not([hidden])');
    const steps = await page.$$eval('#sheet-howto .howto__step', (nodes) => nodes.length);
    check('あそびかたは6ステップ', steps === 6, steps);
    const howtoText = await page.textContent('#sheet-howto');
    for (const word of ['手数', '制限時間', 'ヒント', 'PRO']) {
      check(`あそびかたに「${word}」がある`, howtoText.includes(word));
    }
    check('あそびかたに「十字」が無い', !howtoText.includes('十字'), howtoText.slice(0, 80));
    check('PRO の図（5×5・6×6・120s・180s）がある', await page.$eval('#sheet-howto .diag--pro', (node) => node.textContent.includes('5×5')));
    await page.evaluate(() => (document.querySelector('#sheet-howto .sheet__body').scrollTop = 0));
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-howto.png') });
    await page.evaluate(() => window.__linezap.closeSheet());

    step('設定画面');
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.waitForSelector('#sheet-settings:not([hidden])');
    const version = await page.textContent('#settings-version');
    check('設定に Build 6 が出る', version.includes('Build 6'), version);
    check('合計ステッパーは無い', (await page.$$('#set-target')).length === 0);
    const settingsText = await page.textContent('#sheet-settings');
    check('開始画面での選択を案内している', settingsText.includes('スタート画面'));
    check('設定に「十字」が無い', !settingsText.includes('十字'));
    check('基準 18 / 24 を案内している', settingsText.includes('基準18') || settingsText.includes('基準 18'), settingsText.slice(0, 0));
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-settings.png') });
    await page.evaluate(() => window.__linezap.closeSheet());

    /* ---------------------------------------------------------------- */
    /* 6. 375px / 特大                                                    */
    /* ---------------------------------------------------------------- */
    step('375px・特大のホーム');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.waitForSelector('#sheet-settings:not([hidden])');
    await page.click('#set-text-size [data-size="xl"]');
    await page.evaluate(() => window.__linezap.closeSheet());
    await openHome(page);
    await page.waitForTimeout(200);
    layout = await homeLayout(page);
    check('ホームが縦にはみ出さない (375px・特大)', layout.homeOverflow <= 1, layout.homeOverflow);
    check('ホームが横にはみ出さない (375px・特大)', layout.pageOverflowX <= 0, layout.pageOverflowX);
    check('モード名が折り返さない (375px・特大)', layout.modeNames.every((item) => item.lines === 1), layout.modeNames);
    check('モードの説明が2行以内 (375px・特大)', layout.descLines.every((lines) => lines <= 2), layout.descLines);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-home-375-xl.png') });

    step('375px・特大の開始前ページ（タイムアタック）');
    await page.evaluate(() => window.__linezap.setEntitled(true));
    await page.evaluate(() => window.__linezap.openStart('time'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    const sheetFits = await page.evaluate(() => {
      const sheet = document.querySelector('#sheet-start').getBoundingClientRect();
      const body = document.querySelector('#sheet-start .sheet__body');
      return { right: sheet.right, viewport: window.innerWidth, overflowX: body.scrollWidth - body.clientWidth, scrollable: body.scrollHeight > body.clientHeight };
    });
    check('開始前ページが横にはみ出さない (375px・特大)', sheetFits.right <= sheetFits.viewport && sheetFits.overflowX <= 1, sheetFits);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-start-375-xl.png') });
    await page.evaluate(() => window.__linezap.closeSheet());

    step('375px・特大の 6×6（タイマー付き）');
    await page.evaluate(() => window.__linezap.startGame('classic', { size: 6, target: 24 }));
    await settle(page, 300);
    const size375 = await page.evaluate(() => {
      const r = document.querySelector('#board .tile').getBoundingClientRect();
      const wrap = document.querySelector('#board-wrap').getBoundingClientRect();
      return { w: r.width, h: r.height, wrapRight: wrap.right, viewport: window.innerWidth };
    });
    check('375px・特大でも1マス44px以上', size375.w >= 44 && size375.h >= 44, size375);
    check('375px・特大でも横にはみ出さない', size375.wrapRight <= size375.viewport, size375);
    const overflowPlay = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('プレイ画面が横にはみ出さない', overflowPlay <= 0, overflowPlay);
    const turn375 = await page.evaluate(() => {
      const bar = document.querySelector('#turnbar').getBoundingClientRect();
      const hud = document.querySelector('.hud').getBoundingClientRect();
      return { barTop: bar.top, hudBottom: hud.bottom, right: bar.right, viewport: window.innerWidth };
    });
    check('タイマーが HUD の下に収まる', turn375.barTop >= turn375.hudBottom - 2 && turn375.right <= turn375.viewport, turn375);
    await page.screenshot({ path: resolve(OUT, 'linezap-b6-play-375-xl.png') });

    step('393px・特大のプレイ（元に戻して確認）');
    await page.setViewportSize({ width: 393, height: 852 });
    await page.waitForTimeout(200);
    const overflow393 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('393px で横にはみ出さない', overflow393 <= 0, overflow393);
    await page.evaluate(() => {
      window.__linezap.openSheet('settings');
    });
    await page.waitForSelector('#sheet-settings:not([hidden])');
    await page.click('#set-text-size [data-size="normal"]');
    await page.evaluate(() => window.__linezap.closeSheet());
    await openHome(page);

    /* ---------------------------------------------------------------- */
    /* 7. 審査提出用のスクリーンショット（6.3インチ / iPad 13インチ）      */
    /* ---------------------------------------------------------------- */
    const reviewShots = [
      {
        name: 'home',
        entitled: false,
        run: async (target) => {
          await target.evaluate(() => {
            window.__linezap.closeSheet();
            if (document.querySelector('#screen-play.is-active')) document.querySelector('#btn-home').click();
          });
          await target.waitForTimeout(300);
        },
      },
      {
        name: 'start',
        entitled: false,
        run: async (target) => {
          await target.evaluate(() => window.__linezap.openStart('classic'));
          await target.waitForSelector('#sheet-start:not([hidden])');
          await target.waitForTimeout(300);
        },
      },
      {
        name: 'play',
        entitled: false,
        run: async (target) => {
          await target.evaluate(() => window.__linezap.startGame('classic', { size: 4, target: 10 }));
          await target.waitForTimeout(500);
        },
      },
      {
        name: 'play-6',
        entitled: true,
        run: async (target) => {
          await target.evaluate(() => window.__linezap.startGame('classic', { size: 6, target: 24 }));
          await target.waitForTimeout(500);
        },
      },
      {
        name: 'play-time',
        entitled: true,
        run: async (target) => {
          await target.evaluate(() => window.__linezap.startGame('time', { size: 4, timeLimit: 180 }));
          await target.waitForTimeout(400);
        },
      },
      {
        name: 'howto',
        run: async (target) => {
          await target.evaluate(() => window.__linezap.openSheet('howto'));
          await target.waitForSelector('#sheet-howto:not([hidden])');
          await target.evaluate(() => (document.querySelector('#sheet-howto .sheet__body').scrollTop = 0));
          await target.waitForTimeout(250);
        },
      },
      {
        name: 'settings',
        run: async (target) => {
          await target.evaluate(() => window.__linezap.openSheet('settings'));
          await target.waitForSelector('#sheet-settings:not([hidden])');
          await target.waitForTimeout(250);
        },
      },
    ];

    /** 指定サイズの紙面で、同じ画面を撮って書き出す */
    async function captureSet(tag, viewport, deviceScaleFactor, expected) {
      const target = await browser.newPage({ viewport, deviceScaleFactor, hasTouch: true });
      try {
        await target.addInitScript(() => {
          window.Capacitor = window.Capacitor || {};
          window.Capacitor.Plugins = window.Capacitor.Plugins || {};
          window.Capacitor.Plugins.FlipHaptics = { haptic: () => Promise.resolve({}) };
          // 審査用は日本語で撮る
          window.localStorage.setItem('flip10.settings.v1', JSON.stringify({ locale: 'ja', bgmDefault: 3 }));
        });
        await target.goto(`${server.url}/?test=1`, { waitUntil: 'load' });
        await target.waitForSelector('#opening', { state: 'visible' });
        await target.evaluate(() => window.__linezap.skipOpening());
        await target.waitForFunction(() => Boolean(window.__linezap));
        await target.evaluate(() => {
          document.documentElement.dataset.text = 'normal';
        });
        await target.waitForTimeout(250);
        for (const shot of reviewShots) {
          await target.evaluate((entitled) => window.__linezap.setEntitled(entitled), Boolean(shot.entitled));
          await shot.run(target);
          const file = resolve(OUT, `linezap-b6-${shot.name}-${tag}.png`);
          await target.screenshot({ path: file });
          const size = pngSize(file);
          check(`${tag} ${shot.name} が ${expected.width}×${expected.height}`, size.width === expected.width && size.height === expected.height, size);
        }
      } finally {
        await target.close();
      }
    }

    step('6.3インチ（1206×2622）の審査用スクリーンショット');
    await captureSet('63', { width: 402, height: 874 }, 3, { width: 1206, height: 2622 });
    step('iPad 13インチ（2064×2752）の審査用スクリーンショット');
    await captureSet('ipad13', { width: 1032, height: 1376 }, 2, { width: 2064, height: 2752 });

    /* ---------------------------------------------------------------- */
    /* 8. エラー確認                                                      */
    /* ---------------------------------------------------------------- */
    check('コンソールエラーがゼロ', consoleErrors.length === 0, consoleErrors.slice(0, 5));
    check('404 がゼロ', badResponses.length === 0, badResponses.slice(0, 5));

    const ng = checks.filter((item) => !item.ok).length;
    console.log(`\nLINEZAP Build 6 — ${checks.length} checks, ${checks.length - ng} passed`);
    if (ng > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`\n${error.message}`);
    console.log(`\nLINEZAP Build 6 — ${checks.length} checks, ${checks.filter((item) => item.ok).length} passed (stopped on failure)`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main();

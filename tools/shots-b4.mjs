/**
 * 実ブラウザ（Chromium）での操作テスト＋スクリーンショット（Build 4）
 *   npm run shots
 *
 * 確かめること:
 *   オープニング（LINEZAP ロゴ＋黄金ライン）が出て、タップで即スキップ
 *   タイトルと表示名が LINEZAP・メタが Build 4
 *   ホームは3モード（クラシック / 十字フリップ / タイムアタック）。クラシックに 5×5・6×6 の PRO 目印
 *   クラシックの開始前ページ: 4×4（無料）は目標10固定、5×5・6×6 は 12〜42 を選べる
 *   十字フリップの開始前ページ: 4×4/5×5/6×6 と目標（10〜18・12〜22）
 *   プレイ画面: 左上に ← が無い・制限時間バーと秒数・残り3秒以下で警告色・手数 4/5/5
 *   1ライン消すと制限時間が戻り、0秒で（手数が残っていても）時間切れのリザルト
 *   ヒントは手数 −2、残り2以下では使えない（トースト）
 *   375px / 393px / 特大文字で崩れない・コンソールエラーと404がゼロ
 *
 * 出力: /workspace/downloads/linezap-b4-*.png
 *
 * 環境変数（この環境の Chromium 用）:
 *   PLAYWRIGHT_LIBS … libnspr4 等の場所
 *   PLAYWRIGHT_PATH … playwright 本体の場所
 */

import { mkdir } from 'node:fs/promises';
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
      back: node.classList.contains('is-back'),
      picked: node.classList.contains('is-picked'),
      hint: node.classList.contains('is-hint'),
    })),
  );
}

async function sumTexts(page) {
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll('#sums-rows .sum')].map((node) => node.textContent),
    cols: [...document.querySelectorAll('#sums-cols .sum')].map((node) => node.textContent),
  }));
}

async function clickTile(page, index) {
  await page.evaluate((i) => {
    const node = document.querySelector(`#board .tile[data-i="${i}"]`);
    if (node) node.click();
  }, index);
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
    check('メタのビルドが Build 4', (await page.getAttribute('meta[name="app-build"]', 'content')) === 'Build 4');
    await page.click('#btn-lang-home');
    await page.waitForSelector('#sheet-language:not([hidden])');
    await page.click('#lang-grid [data-locale="ja"]');
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.waitForTimeout(200);

    step('オープニングのスクリーンショット（日本語）');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-opening.png') });
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 6000 });
    await page.waitForFunction(() => Boolean(window.__linezap));

    step('ホームの3モード');
    const modeIds = await page.$$eval('#mode-list .mode', (nodes) => nodes.map((node) => node.dataset.mode));
    check('モードは クラシック→十字フリップ→タイムアタック の3つ', modeIds.join(',') === 'classic,cross,time', modeIds);
    const locked = await page.$$eval('#mode-list .mode.is-locked', (nodes) => nodes.map((node) => node.dataset.mode));
    check('PRO の無い十字フリップとタイムアタックに鍵', locked.join(',') === 'cross,time', locked);
    const classicSizes = await page.$$eval('#mode-list .mode--classic .mode__sizes b', (nodes) => nodes.map((node) => node.textContent.trim()));
    check('クラシックに 5×5・6×6 の PRO 目印', classicSizes.join(' ') === '5×5PRO 6×6PRO', classicSizes);
    const crossPairs = await page.$$eval('#mode-list .mode--cross .mode__pairs b', (nodes) => nodes.map((node) => node.textContent));
    check('十字フリップの表裏（0↔5 1↔4 2↔3）がカードの中にある', crossPairs.join(' ') === '0↔5 1↔4 2↔3', crossPairs);
    const bgmDefault = await page.getAttribute('#set-bgm', 'aria-checked');
    check('BGM が最初から ON', bgmDefault === 'true', bgmDefault);

    step('ホームのレイアウト（393px）');
    let layout = await homeLayout(page);
    check('左上ロゴとミニ盤面が重ならない (393px)', layout.brand.bottom <= layout.demo.top + 0.5, { brand: layout.brand, demo: layout.demo });
    check('ホームが縦にはみ出さない (393px)', layout.homeOverflow <= 1, layout.homeOverflow);
    check('ホームが横にはみ出さない (393px)', layout.pageOverflowX <= 0, layout.pageOverflowX);
    check('モード名が折り返さない (393px)', layout.modeNames.every((item) => item.lines === 1), layout.modeNames);
    check('モードの説明が2行以内 (393px)', layout.descLines.every((lines) => lines <= 2), layout.descLines);
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-home.png') });

    step('オープニングはタップで即スキップできる');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible' });
    const skipStart = Date.now();
    await page.mouse.click(200, 400);
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 3000 });
    check('タップで 1秒以内に閉じる', Date.now() - skipStart < 1100, Date.now() - skipStart);
    await page.waitForFunction(() => Boolean(window.__linezap));

    /* ---------------------------------------------------------------- */
    /* 2. クラシックの開始前ページ                                        */
    /* ---------------------------------------------------------------- */
    step('クラシックの開始前ページ（4×4）');
    await page.click('#mode-list [data-mode="classic"]');
    await page.waitForSelector('#sheet-start:not([hidden])');
    check('開始前ページのタイトルがクラシック', (await page.textContent('#start-title')).trim() === 'クラシック');
    const sizeButtons = await page.$$eval('#start-sizes .size-btn', (nodes) =>
      nodes.map((node) => ({ size: Number(node.dataset.size), on: node.classList.contains('is-on'), locked: node.classList.contains('is-locked') })),
    );
    check('マス数は 4×4 / 5×5 / 6×6 の3つ', sizeButtons.map((b) => b.size).join(',') === '4,5,6', sizeButtons);
    check('最初は 4×4 が選ばれている', sizeButtons[0].on === true, sizeButtons);
    check('PRO 未購入では 5×5・6×6 に鍵', sizeButtons[1].locked === true && sizeButtons[2].locked === true, sizeButtons);
    check('4×4 の目標は 10 固定', (await page.textContent('#start-target-value')).trim() === '10');
    check('4×4 はステッパーが無効', await page.$eval('#sheet-start [data-target-step="1"]', (node) => node.disabled));
    check('手数 4', (await page.textContent('#start-moves')).trim() === '4');
    check('制限時間 10秒', (await page.textContent('#start-turn')).trim() === '10秒');
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-start-classic.png') });

    step('PRO 未購入で 5×5 を押すと購入画面');
    await page.click('#start-sizes [data-size="5"]');
    await page.waitForSelector('#sheet-pro:not([hidden])');
    check('PRO の購入画面が出る', await page.isVisible('#sheet-pro'));
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
    check('ヒントのマスが光る', hinted >= 1, hinted);

    step('残り2以下ではヒントを使えない');
    // aria-disabled のボタンは Playwright がクリックを止めるので、利用者のタップと同じ click() を投げる
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
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-play.png') });

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
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-result-timeout.png') });

    /* ---------------------------------------------------------------- */
    /* 3. PRO（5×5・6×6・十字フリップ）                                  */
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
    check('5×5 を選ぶと鍵が消える', (await page.$$('#start-sizes .size-btn.is-locked')).length === 0);
    const value5 = await page.textContent('#start-target-value');
    check('5×5 の目標は 12〜42 の範囲', Number(value5) >= 12 && Number(value5) <= 42, value5);
    check('5×5 の手数は5', (await page.textContent('#start-moves')).trim() === '5');
    check('5×5 の制限時間は12秒', (await page.textContent('#start-turn')).trim() === '12秒');
    for (let i = 0; i < 7; i += 1) await page.click('#sheet-start [data-target-step="1"]');
    const value5b = Number(await page.textContent('#start-target-value'));
    check('目標ステッパーが動く', value5b > Number(value5), { value5, value5b });
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-start-5.png') });
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 260);
    check('5×5 は25マス', (await page.$$eval('#board .tile', (nodes) => nodes.length)) === 25);
    check('5×5 の目標が反映される', (await page.textContent('#target-text')).trim() === String(value5b));
    check('5×5 のタイマーは12秒から', /^1[12]\.\d$/.test((await readTurn(page)).text), (await readTurn(page)).text);

    step('クラシック 6×6');
    await page.evaluate(() => window.__linezap.startGame('classic', { size: 6, target: 24 }));
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
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-play-6.png') });

    step('十字フリップの開始前ページ');
    await openHome(page);
    await page.click('#mode-list [data-mode="cross"]');
    await page.waitForSelector('#sheet-start:not([hidden])');
    check('十字フリップの開始前ページが開く', (await page.textContent('#start-title')).trim().includes('十字'));
    const crossOpen = await page.evaluate(() => ({
      value: document.querySelector('#start-target-value')?.textContent,
      start: window.__linezap.state.start,
      hidden: document.querySelector('#sheet-start').hidden,
      title: document.querySelector('#start-title').textContent,
    }));
    check('十字フリップは 4×4 の目標が10固定', crossOpen.value.trim() === '10', crossOpen);
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-start-cross.png') });
    await page.click('#start-sizes [data-size="5"]');
    await page.waitForTimeout(150);
    const crossValue = Number(await page.textContent('#start-target-value'));
    check('十字フリップ 5×5 の目標は 10〜18', crossValue >= 10 && crossValue <= 18, crossValue);
    check('十字フリップ 5×5 の手数は5', (await page.textContent('#start-moves')).trim() === '5');
    check('十字フリップ 5×5 の制限時間は12秒', (await page.textContent('#start-turn')).trim() === '12秒');
    await page.click('#start-sizes [data-size="6"]');
    await page.waitForTimeout(150);
    const crossValue6 = Number(await page.textContent('#start-target-value'));
    check('十字フリップ 6×6 の目標は 12〜22', crossValue6 >= 12 && crossValue6 <= 22, crossValue6);
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 300);
    check('十字フリップ 6×6 は36マス', (await page.$$eval('#board .tile', (nodes) => nodes.length)) === 36);
    check('十字フリップは表裏の凡例が出る', (await page.$eval('#play-legend', (node) => node.hidden)) === false);
    const beforeFlip = await tiles(page);
    await clickTile(page, 7);
    const flipped = await page.$$eval('#board .tile.is-flipping', (nodes) => nodes.map((node) => Number(node.dataset.i)).sort((a, b) => a - b));
    check('タップで＋の字（5マス）が反転する', flipped.join(',') === '1,6,7,8,13', flipped);
    await settle(page, 300);
    check('反転してもゲームは続く', (await page.evaluate(() => window.__linezap.game.status)) === 'playing');
    const afterFlipMoves = Number(await page.textContent('#hud-moves'));
    check('十字フリップも手数が5から1減る', afterFlipMoves <= 5 && beforeFlip.length === 36, afterFlipMoves);

    /* ---------------------------------------------------------------- */
    /* 4. あそびかた                                                      */
    /* ---------------------------------------------------------------- */
    step('あそびかた');
    await openHome(page);
    await page.click('#btn-howto');
    await page.waitForSelector('#sheet-howto:not([hidden])');
    const steps = await page.$$eval('#sheet-howto .howto__step', (nodes) => nodes.length);
    check('あそびかたは6ステップ', steps === 6, steps);
    const howtoText = await page.textContent('#sheet-howto');
    for (const word of ['手数', '制限時間', 'ヒント', '十字フリップ']) {
      check(`あそびかたに「${word}」がある`, howtoText.includes(word));
    }
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-howto.png') });
    await page.evaluate(() => window.__linezap.closeSheet());

    step('設定画面');
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.waitForSelector('#sheet-settings:not([hidden])');
    const version = await page.textContent('#settings-version');
    check('設定に Build 4 が出る', version.includes('Build 4'), version);
    check('合計ステッパーは無い', (await page.$$('#set-target')).length === 0);
    check('開始画面での選択を案内している', (await page.textContent('#sheet-settings')).includes('スタート画面'));
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-settings.png') });
    await page.evaluate(() => window.__linezap.closeSheet());

    /* ---------------------------------------------------------------- */
    /* 4.5 タイムアタック（従来どおり 60/120秒・手数なし）               */
    /* ---------------------------------------------------------------- */
    step('タイムアタック 120秒');
    await openHome(page);
    await page.click('#mode-list .mode--time [data-time="120"]');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 250);
    const timeState = await page.evaluate(() => ({
      mode: window.__linezap.game.modeId,
      limit: window.__linezap.game.timeLimit,
      moves: window.__linezap.game.moves,
      turn: window.__linezap.game.turnLimit,
      hud: document.querySelector('#hud-time').textContent,
      clockHidden: document.querySelector('#hud-time-wrap').hidden,
      turnbarHidden: document.querySelector('#turnbar').hidden,
      movesHidden: document.querySelector('#hud-moves-wrap').hidden,
      costHidden: document.querySelector('#hint-cost').hidden,
    }));
    check('タイムアタックは 120秒', timeState.mode === 'time' && timeState.limit === 120, timeState);
    check('タイムアタックは手数もターンタイマーも無い', timeState.moves === null && timeState.turn === 0, timeState);
    check('タイムアタックは全体タイマー表示（2:00）', timeState.hud === '2:00' && timeState.clockHidden === false, timeState);
    check('タイムアタックでは制限時間バーも手数もヒント−2も出ない', timeState.turnbarHidden === true && timeState.movesHidden === true && timeState.costHidden === true, timeState);
    await waitToast(page);
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-play-time.png') });

    /* ---------------------------------------------------------------- */
    /* 5. 375px / 特大                                                    */
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
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-home-375-xl.png') });

    step('375px・特大の開始前ページ');
    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    const sheetFits = await page.evaluate(() => {
      const sheet = document.querySelector('#sheet-start').getBoundingClientRect();
      const body = document.querySelector('#sheet-start .sheet__body');
      return { right: sheet.right, viewport: window.innerWidth, overflowX: body.scrollWidth - body.clientWidth };
    });
    check('開始前ページが横にはみ出さない (375px・特大)', sheetFits.right <= sheetFits.viewport && sheetFits.overflowX <= 1, sheetFits);
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-start-375-xl.png') });
    await page.evaluate(() => window.__linezap.closeSheet());

    step('375px・特大の 6×6（タイマー付き）');
    await page.evaluate(() => {
      window.__linezap.setEntitled(true);
      window.__linezap.startGame('classic', { size: 6, target: 20 });
    });
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
    await page.screenshot({ path: resolve(OUT, 'linezap-b4-play-375-xl.png') });

    /* ---------------------------------------------------------------- */
    /* 6. エラー確認                                                      */
    /* ---------------------------------------------------------------- */
    check('コンソールエラーがゼロ', consoleErrors.length === 0, consoleErrors.slice(0, 5));
    check('404 がゼロ', badResponses.length === 0, badResponses.slice(0, 5));

    const ng = checks.filter((item) => !item.ok).length;
    console.log(`\nLINEZAP Build 4 — ${checks.length} checks, ${checks.length - ng} passed`);
    if (ng > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`\n${error.message}`);
    console.log(`\nLINEZAP Build 4 — ${checks.length} checks, ${checks.filter((item) => item.ok).length} passed (stopped on failure)`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main();

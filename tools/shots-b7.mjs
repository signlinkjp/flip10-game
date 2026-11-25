/**
 * LINEZAP — Build 7 の実ブラウザ検証（Playwright / Chromium）
 *   npm run shots（Build 6 の回帰のあとに実行される）
 *
 * 確かめること（トモアキさんの3つの要望）:
 *   1. クラシックの開始前ページは、古い保存値（5×5 に 13 / 6×6 に 18）があっても
 *      基準数 10 / 18 / 24 から始まる。ステッパーはその場で使え、開き直すと基準に戻る。
 *      タイムアタックは最後に選んだ目標を覚えている。
 *   2. プレイ画面の目標は盤面の上に大きなカードで出る（数字は44px以上）。
 *      右と下の「今/目標」は1行で、前より大きい。6×6 でも 1マス44px以上。
 *   3. ホームのボタンを大きく：あそぶ・モードカード・下部ピル・右上アイコン。
 *      393×852 と 375×667（特大文字）で、はみ出し・重なりなし。
 *
 * 出力: /workspace/downloads/linezap-b7-*.png
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
  console.log(`${condition ? 'ok' : 'NG'} - ${name}`);
  if (!condition) console.log(`    ${JSON.stringify(detail)}`);
}
const step = (msg) => console.error(`[step] ${msg}`);

/** ホームの寸法とはみ出し */
async function homeLayout(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const node = document.querySelector(sel);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const home = document.querySelector('#screen-home');
    const lines = (sel) =>
      [...document.querySelectorAll(sel)].map((node) => {
        const r = node.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(node).lineHeight) || 20;
        return Math.round(r.height / line);
      });
    return {
      brand: box('.brand'),
      demo: box('#hero-demo'),
      play: box('#btn-play'),
      best: box('.hero__best'),
      modes: box('#mode-list'),
      mode: box('#mode-list .mode'),
      foot: box('.homefoot .pill'),
      footRow: box('.homefoot'),
      icon: box('#btn-settings'),
      overflow: home.scrollHeight - home.clientHeight,
      pageX: document.documentElement.scrollWidth - window.innerWidth,
      modeLines: lines('#mode-list .mode__name'),
      descLines: lines('#mode-list .mode__desc'),
    };
  });
}

/** プレイ画面の目標・合計・盤面の寸法 */
async function playLayout(page) {
  return page.evaluate(() => {
    const rect = (sel) => {
      const node = document.querySelector(sel);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const target = document.querySelector('#target-text');
    const rowSum = document.querySelector('#sums-rows .sum');
    const colSum = document.querySelector('#sums-cols .sum');
    const rowVal = rowSum.querySelector('.sum__val');
    const colVal = colSum.querySelector('.sum__val');
    const screen = document.querySelector('#screen-play');
    const tile = rect('#board .tile');
    const wrap = rect('#board-wrap');
    return {
      target: target.textContent.trim(),
      targetFont: parseFloat(getComputedStyle(target).fontSize),
      key: document.querySelector('#targetbar .targetbar__key').textContent.trim(),
      targetBox: rect('#targetbar'),
      board: rect('#board'),
      tile: { width: tile.width, height: tile.height },
      wrapRight: wrap.right,
      rowSumText: rowSum.textContent,
      rowSumFont: parseFloat(getComputedStyle(rowSum).fontSize),
      colSumFont: colSum ? parseFloat(getComputedStyle(colSum).fontSize) : 0,
      rowValHeight: rowVal.getBoundingClientRect().height,
      colValHeight: colVal.getBoundingClientRect().height,
      rowValWrap: rowVal.scrollWidth > rowVal.clientWidth + 1,
      overflow: screen.scrollHeight - screen.clientHeight,
      pageX: document.documentElement.scrollWidth - window.innerWidth,
      size: Number(document.querySelector('#board').className.replace(/\D/g, '') || 4),
    };
  });
}

async function readStart(page) {
  return page.evaluate(() => ({
    target: document.querySelector('#start-target-value').textContent.trim(),
    bases: [...document.querySelectorAll('.size-btn__base')].map((node) => node.textContent.trim()),
    sub: document.querySelector('#start-play-sub').textContent.trim(),
    note: document.querySelector('#start-target-note').textContent.trim(),
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

    // Build 3〜6 の試遊で残った古い目標値（5×5 に 13 / 6×6 に 18）が入った端末
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'flip10.settings.v1',
          JSON.stringify({
            sound: true,
            bgm: false,
            hint: true,
            haptic: true,
            textSize: 'normal',
            locale: 'ja',
            targets: { classic5: 13, classic6: 18, time5: 30, time6: 24 },
          }),
        );
      } catch {
        /* localStorage が使えない環境ではそのまま */
      }
      window.Capacitor = window.Capacitor || {};
      window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.FlipHaptics = { haptic: () => Promise.resolve({}) };
    });

    step('起動してホーム（393×852）');
    await page.goto(`${server.url}/?test=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__linezap));
    await page.evaluate(() => window.__linezap.skipOpening());
    await page.waitForTimeout(320);

    check('メタのビルドが Build 7', (await page.getAttribute('meta[name="app-build"]', 'content')) === 'Build 7');
    check('バージョン表示が 1.0.1 (Build 7)', (await page.textContent('#settings-version')).includes('1.0.1 (Build 7)'));

    let home = await homeLayout(page);
    check('ホームが縦にはみ出さない (393px)', home.overflow <= 1, home.overflow);
    check('ホームが横にはみ出さない (393px)', home.pageX <= 0, home.pageX);
    check('ロゴとミニ盤面が重ならない (393px)', home.brand.bottom <= home.demo.top + 0.5, { brand: home.brand, demo: home.demo });
    check('ベストとモードカードが重ならない (393px)', home.best.bottom <= home.modes.top + 0.5, { best: home.best, modes: home.modes });
    check('モード名が1行 (393px)', home.modeLines.every((n) => n === 1), home.modeLines);
    check('モードの説明が2行以内 (393px)', home.descLines.every((n) => n <= 2), home.descLines);
    check('あそぶボタンが大きい（高さ84px以上）', home.play.height >= 84 && home.play.width >= 320, home.play);
    check('モードカードが大きい（高さ130px以上）', home.mode.height >= 130, home.mode);
    check('下部のボタンが押しやすい（高さ48px以上）', home.foot.height >= 48, home.foot);
    check('右上のアイコンが大きい（48px）', home.icon.width >= 46 && home.icon.height >= 46, home.icon);
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-home.png') });

    step('クラシックの開始前ページ（古い保存値があっても基準数）');
    await page.evaluate(() => window.__linezap.setEntitled(true));
    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    let start = await readStart(page);
    check('4×4 の目標が基準 10', start.target === '10', start);
    check('サイズボタンに基準 10 / 18 / 24', start.bases.join('|') === '基準 10|基準 18|基準 24', start.bases);
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-start-classic-4.png') });

    await page.evaluate(() => window.__linezap.pickStartSize(5));
    await page.waitForTimeout(180);
    start = await readStart(page);
    check('5×5 の目標が基準 18（保存値 13 を使わない）', start.target === '18', start);
    check('5×5 のスタート補助が 5×5 · 18', start.sub === '5×5 · 18', start.sub);
    check('5×5 の注記が基準 18', start.note.includes('基準 18'), start.note);
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-start-classic-5.png') });

    await page.click('#sheet-start [data-target-step="1"]');
    await page.waitForTimeout(160);
    start = await readStart(page);
    check('ステッパーはその場で使える（18 → 19）', start.target === '19', start);

    await page.evaluate(() => window.__linezap.pickStartSize(6));
    await page.waitForTimeout(180);
    start = await readStart(page);
    check('6×6 の目標が基準 24（保存値 18 を使わない）', start.target === '24', start);
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-start-classic-6.png') });

    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForTimeout(180);
    await page.evaluate(() => window.__linezap.pickStartSize(5));
    await page.waitForTimeout(160);
    start = await readStart(page);
    check('開き直すと 5×5 は基準 18 に戻る', start.target === '18', start);
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-start-classic-reopen-5.png') });

    step('タイムアタックは選んだ目標を覚えている');
    await page.evaluate(() => window.__linezap.openStart('time'));
    await page.waitForTimeout(160);
    await page.evaluate(() => window.__linezap.pickStartSize(5));
    await page.waitForTimeout(120);
    start = await readStart(page);
    check('タイムアタック 5×5 は覚えていた 30', start.target === '30', start);
    await page.click('#sheet-start [data-target-step="-1"]');
    await page.waitForTimeout(160);
    await page.evaluate(() => window.__linezap.openStart('time'));
    await page.waitForTimeout(180);
    start = await readStart(page);
    check('タイムアタックは選び直した 29 を覚える', start.target === '29', start);

    step('プレイ画面 4×4 / 5×5 / 6×6（目標を大きく）');
    for (const size of [4, 5, 6]) {
      await page.evaluate((value) => {
        window.__linezap.closeSheet();
        window.__linezap.startGame('classic', { size: value });
      }, size);
      await page.waitForSelector('#screen-play.is-active');
      await page.waitForTimeout(420);
      const play = await playLayout(page);
      const base = { 4: '10', 5: '18', 6: '24' }[size];
      check(`${size}×${size} の目標が基準 ${base}`, play.target === base, play.target);
      check(`${size}×${size} の目標カードが見出し「目標」付き`, play.key === '目標', play.key);
      check(`${size}×${size} の目標の数字が大きい（44px以上）`, play.targetFont >= 44, play.targetFont);
      check(`${size}×${size} の目標カードが盤面の上`, play.targetBox.bottom <= play.board.top, { target: play.targetBox, board: play.board });
      check(`${size}×${size} の目標と盤面が近い（8〜24px）`, play.board.top - play.targetBox.bottom >= 8 && play.board.top - play.targetBox.bottom <= 24, play.board.top - play.targetBox.bottom);
      check(`${size}×${size} の「今/目標」が1行`, play.rowValHeight <= 24 && play.colValHeight <= 24 && !play.rowValWrap, { row: play.rowValHeight, col: play.colValHeight, wrap: play.rowValWrap });
      check(`${size}×${size} の「今/目標」が n/${base} の形`, new RegExp(`^\\d+/${base}$`).test(play.rowSumText), play.rowSumText);
      check(`${size}×${size} の合計の数字が読める（${size === 6 ? '10' : '13'}px以上）`, play.rowSumFont >= (size === 6 ? 10 : 13), play.rowSumFont);
      check(`${size}×${size} が横にはみ出さない`, play.wrapRight <= 393 && play.pageX <= 0, { wrapRight: play.wrapRight, pageX: play.pageX });
      check(`${size}×${size} が縦にはみ出さない`, play.overflow <= 1, play.overflow);
      await page.screenshot({ path: resolve(OUT, `linezap-b7-play-${size}.png`) });
    }

    step('375×667・特大文字（トモアキさんの端末に近い条件）');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => {
      document.querySelector('#btn-home').click();
    });
    await page.waitForTimeout(260);
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.click('#set-text-size [data-size="xl"]');
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.waitForTimeout(260);

    const xl = await page.evaluate(() => ({
      text: document.documentElement.dataset.text,
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
    }));
    check('375px は文字サイズ「特大」で確認している', xl.text === 'xl' && xl.root >= 20, xl);

    home = await homeLayout(page);
    check('ホームが縦にはみ出さない (375px・特大)', home.overflow <= 1, home.overflow);
    check('ホームが横にはみ出さない (375px・特大)', home.pageX <= 0, home.pageX);
    // 667px ではミニ盤面を出さない（@media max-height:700px）ので、出ているときだけ重なりを見る
    check('ロゴとミニ盤面が重ならない (375px・特大)', home.demo.height === 0 || home.brand.bottom <= home.demo.top + 0.5, { brand: home.brand, demo: home.demo });
    check('モード名が1行 (375px・特大)', home.modeLines.every((n) => n === 1), home.modeLines);
    check('モードの説明が2行以内 (375px・特大)', home.descLines.every((n) => n <= 2), home.descLines);
    check('ベストとモードカードが重ならない (375px・特大)', home.best.bottom <= home.modes.top + 0.5, { best: home.best, modes: home.modes });
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-home-375-xl.png') });

    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForTimeout(220);
    await page.evaluate(() => window.__linezap.pickStartSize(4));
    await page.waitForTimeout(160);
    const sheetFit = await page.evaluate(() => {
      const sheet = document.querySelector('#sheet-start').getBoundingClientRect();
      const body = document.querySelector('#sheet-start .sheet__body');
      return { right: sheet.right, viewport: window.innerWidth, overflowX: body.scrollWidth - body.clientWidth, target: document.querySelector('#start-target-value').textContent.trim() };
    });
    check('開始前ページが横にはみ出さない (375px・特大)', sheetFit.right <= sheetFit.viewport && sheetFit.overflowX <= 1, sheetFit);
    check('開始前ページの目標が基準 10 (375px・特大)', sheetFit.target === '10', sheetFit.target);
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-start-375-xl.png') });

    await page.evaluate(() => {
      window.__linezap.closeSheet();
      window.__linezap.startGame('classic', { size: 6 });
    });
    await page.waitForSelector('#screen-play.is-active');
    await page.waitForTimeout(420);
    const small = await playLayout(page);
    check('375px・特大でも 6×6 の1マスが44px以上', small.tile.width >= 44 && small.tile.height >= 44, small.tile);
    check('375px・特大でも 6×6 が横にはみ出さない', small.wrapRight <= 375 && small.pageX <= 0, { wrapRight: small.wrapRight, pageX: small.pageX });
    check('375px・特大でも 6×6 が縦にはみ出さない', small.overflow <= 1, small.overflow);
    check('375px・特大でも目標の数字が大きい（34px以上）', small.targetFont >= 34, small.targetFont);
    check('375px・特大でも「今/目標」が1行', small.rowValHeight <= 24 && small.colValHeight <= 24 && !small.rowValWrap, { row: small.rowValHeight, col: small.colValHeight, wrap: small.rowValWrap });
    await page.screenshot({ path: resolve(OUT, 'linezap-b7-play-6-375-xl.png') });

    step('コンソールエラーと404がゼロ');
    check('コンソールエラーが無い', consoleErrors.length === 0, consoleErrors.slice(0, 5));
    check('404・500 が無い', badResponses.length === 0, badResponses.slice(0, 5));

    const failed = checks.filter((item) => !item.ok);
    console.log(`\nLINEZAP Build 7 — ${checks.length} checks, ${checks.length - failed.length} passed`);
    if (failed.length) {
      console.log(`NG: ${failed.map((item) => item.name).join(' / ')}`);
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    await server.close?.();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

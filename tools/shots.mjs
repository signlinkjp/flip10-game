/**
 * 実ブラウザ（Chromium）での操作テスト＋スクリーンショット（Build 1）
 *   npm run shots
 *
 * 確かめること:
 *   ホーム / 盤面 / あそびかた / PRO シートが実際に描ける
 *   Rule B の反転が「押したマス＋上下左右だけ・表裏で5」になっている（DOM で確認）
 *   合計10の行が消えて得点が入る（金色の光・コンボ表示）
 *   PRO の右上の覗き見数字が出る（5×5 も）
 *   12言語の切替・あそびかた・プライバシー・設定の合計変更
 *   375px / 393px ではみ出さない
 *   コンソールエラー・404 がゼロ
 *
 * 出力: /workspace/downloads/flip10-b1-home.png / -play.png / -howto.png / -pro.png
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

async function values(page) {
  return page.$$eval('#board .tile', (nodes) =>
    nodes.map((node) => ({
      value: Number(node.querySelector('.tile__value').textContent),
      back: node.classList.contains('is-back'),
      peek: Number(node.querySelector('.tile__peek').textContent),
    })),
  );
}

async function tap(page, index) {
  await page.evaluate((i) => {
    const node = document.querySelector(`#board .tile[data-i="${i}"]`);
    if (node) node.click();
  }, index);
}

/** アニメとスコアの更新が終わるまで待つ */
async function settle(page) {
  try {
    await page.waitForFunction(() => window.__flip10 && window.__flip10.state.busy === false, null, { timeout: 6000 });
  } catch {
    /* busy が取れないときはそのまま */
  }
  await page.waitForTimeout(120);
}

async function openHome(page) {
  await page.evaluate(() => {
    if (document.querySelector('#screen-play.is-active')) {
      document.querySelector('#btn-home').click();
    }
    window.__flip10.closeSheet();
  });
  await page.waitForFunction(() => document.querySelector('#screen-home.is-active') !== null);
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

    step('ホーム');
    await page.goto(`${server.url}/?test=1`, { waitUntil: 'load' });
    await page.waitForSelector('#mode-list .mode', { timeout: 10000 });
    await page.waitForFunction(() => Boolean(window.__flip10));
    // ヘッドレス Chromium は en-US。スクリーンショットと確認は日本語に固定する
    await page.click('#btn-lang-home');
    await page.waitForSelector('#sheet-language:not([hidden])');
    await page.click('#lang-grid [data-locale="ja"]');
    await page.evaluate(() => window.__flip10.closeSheet());
    await page.waitForTimeout(200);
    check('タイトルが FLIP 10', (await page.title()) === 'FLIP 10', await page.title());
    check('ホームが見えている', await page.isVisible('#btn-play'));
    const modeCount = await page.$$eval('#mode-list .mode', (nodes) => nodes.length);
    check('4モードが並ぶ', modeCount === 4, modeCount);
    const locked = await page.$$eval('#mode-list .mode.is-locked', (nodes) => nodes.length);
    check('PRO の3モードが最初は鍵つき', locked === 3, locked);
    check('クラシックは無料', await page.$eval('#mode-list [data-mode="classic"]', (n) => !n.closest('.mode').classList.contains('is-locked')));
    check('凡例 0↔5 / 1↔4 / 2↔3', (await page.textContent('#legend-home')).replace(/\s+/g, '').includes('0↔51↔42↔3'), await page.textContent('#legend-home'));
    const overflowHome = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('ホームが横にはみ出さない (393px)', overflowHome <= 0, overflowHome);
    await page.screenshot({ path: resolve(OUT, 'flip10-b1-home.png') });

    step('クラシックで遊ぶ');
    await page.click('#btn-play');
    await page.waitForSelector('#screen-play.is-active');
    const tiles = await page.$$eval('#board .tile', (nodes) => nodes.length);
    check('4×4 の16マス', tiles === 16, tiles);
    check('タイマーは出ない（エンドレス）', await page.isHidden('#hud-time-wrap'));
    check('合計の表示は10', (await page.textContent('#hud-target')) === '10');

    // Rule B: 押したマスと上下左右だけが 5-x になる
    // 反転しても合計10の行・列ができない盤面（消去と混ざらないように）
    await page.evaluate(() => window.__flip10.setBoard([
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 2, 0,
      1, 0, 0, 3,
    ]));
    const before = await values(page);
    await tap(page, 5);
    await settle(page);
    await page.waitForTimeout(200);
    const after = await values(page);
    const expected = [5, 1, 4, 6, 9];
    for (let i = 0; i < 16; i += 1) {
      const sideChanged = after[i].back !== before[i].back;
      if (expected.includes(i)) {
        check(`マス${i} が裏返る`, sideChanged, { before: before[i], after: after[i] });
        check(`マス${i} が 5-x（${before[i].value}→${after[i].value}）`, after[i].value === 5 - before[i].value, after[i]);
      } else {
        check(`マス${i} は変わらない`, !sideChanged && after[i].value === before[i].value, { before: before[i], after: after[i] });
      }
    }

    // 合計10の行が消える（右下を押しても1行目は変わらない盤面）
    await page.evaluate(() => window.__flip10.setBoard([
      3, 2, 4, 1,
      1, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]));
    const scoreBefore = await page.evaluate(() => window.__flip10.game.score);
    await tap(page, 15);
    let flashCount = 0;
    try {
      await page.waitForFunction(() => document.querySelectorAll('#board .tile.is-clearing').length >= 4, null, { timeout: 2500 });
      flashCount = await page.$$eval('#board .tile.is-clearing', (nodes) => nodes.length);
    } catch {
      flashCount = 0;
    }
    check('消える行が金色に光る', flashCount >= 4, flashCount);
    const comboText = await page.textContent('#combo');
    check('コンボ表示に得点が出る', /\+\d+/.test(comboText), comboText);
    await settle(page);
    const scoreAfter = await page.evaluate(() => window.__flip10.game.score);
    const gain = scoreAfter - scoreBefore;
    check('ライン消去で得点が入る（100点の倍数）', gain >= 100 && gain % 100 === 0, { scoreBefore, scoreAfter, comboText });
    const holes = await page.$$eval('#board .tile', (nodes) => nodes.length);
    check('消えたあとも16マス（上から補充）', holes === 16, holes);

    // 実際に何度か遊んで、盤面が壊れない
    for (let i = 0; i < 6; i += 1) {
      await tap(page, (i * 5 + 3) % 16);
      await settle(page);
    }
    const valuesNow = await values(page);
    check('どのマスも 0〜5', valuesNow.every((tile) => tile.value >= 0 && tile.value <= 5), valuesNow);
    const scoreShown = await page.textContent('#hud-score');
    const scoreReal = await page.evaluate(() => window.__flip10.game.score);
    check('HUD のスコアが実際の得点と一致', scoreShown.replace(/[^0-9]/g, '') === String(scoreReal), { scoreShown, scoreReal });
    await page.screenshot({ path: resolve(OUT, 'flip10-b1-play.png') });

    const overflowPlay = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('プレイ画面が横にはみ出さない (393px)', overflowPlay <= 0, overflowPlay);

    step('あそびかた');
    await openHome(page);
    await page.click('#btn-howto');
    await page.waitForSelector('#sheet-howto:not([hidden])');
    const steps = await page.$$eval('#sheet-howto .howto__step', (nodes) => nodes.length);
    check('あそびかたは4ステップ', steps === 4, steps);
    check('十字の図がある', await page.isVisible('#sheet-howto .diag--cross'));
    check('ペアの図がある', await page.isVisible('#sheet-howto .diag--pairs'));
    await page.screenshot({ path: resolve(OUT, 'flip10-b1-howto.png') });
    await page.evaluate(() => window.__flip10.closeSheet());

    step('PRO シートと解錠（プレビュー）');
    await page.click('#btn-pro');
    await page.waitForSelector('#sheet-pro:not([hidden])');
    const features = await page.$$eval('#sheet-pro .pro__features li', (nodes) => nodes.length);
    check('PRO の特典が4つ', features === 4, features);
    check('価格が出ている（¥300）', (await page.textContent('#buy-label')).includes('¥300'), await page.textContent('#buy-label'));
    check('開発用スイッチがある（Webプレビュー）', await page.isVisible('#set-dev'));
    await page.screenshot({ path: resolve(OUT, 'flip10-b1-pro.png') });
    await page.click('#btn-buy');
    await page.waitForTimeout(300);
    check('Webでは購入せず案内を出す', (await page.textContent('#toast')).includes('テスト用プレビュー'), await page.textContent('#toast'));
    check('購入ボタンは押せる状態に戻る', await page.isEnabled('#btn-buy'));
    await page.click('#set-dev');
    await page.waitForTimeout(250);
    check('解錠すると鍵が消える', (await page.$$eval('#mode-list .mode.is-locked', (nodes) => nodes.length)) === 0);
    check('PRO ピルが解放中になる', (await page.textContent('#pro-label')).includes('PRO'), await page.textContent('#pro-label'));

    step('上級ルール（右上の覗き見）');
    await page.click('#mode-list [data-mode="advanced"]');
    await page.waitForSelector('#screen-play.is-active');
    check('上級は4×4', (await page.$$eval('#board .tile', (n) => n.length)) === 16);
    check('盤面が peek 表示', await page.$eval('#board', (n) => n.classList.contains('board--peek')));
    const peekVisible = await page.$eval('#board .tile__peek', (n) => getComputedStyle(n).display !== 'none');
    check('右上の数字が見えている', peekVisible);
    const peekSample = await values(page);
    check('覗き見の数字は 0〜5', peekSample.every((t) => t.peek >= 0 && t.peek <= 5), peekSample.slice(0, 4));
    await page.screenshot({ path: resolve(OUT, 'flip10-b1-advanced.png') });

    step('5×5 とタイムアタック');
    await openHome(page);
    await page.click('#mode-list [data-mode="wide"]');
    await page.waitForSelector('#screen-play.is-active');
    check('5×5 は25マス', (await page.$$eval('#board .tile', (n) => n.length)) === 25);
    await page.screenshot({ path: resolve(OUT, 'flip10-b1-wide.png') });
    await openHome(page);
    await page.click('#mode-list [data-mode="time"] [data-time="120"]');
    await page.waitForSelector('#screen-play.is-active');
    check('タイムアタックは残り時間が出る', await page.isVisible('#hud-time-wrap'));
    check('120秒で始まる', (await page.textContent('#hud-time')) === '2:00', await page.textContent('#hud-time'));

    step('12言語の切替');
    await openHome(page);
    await page.click('#btn-lang-home');
    await page.waitForSelector('#sheet-language:not([hidden])');
    const langs = await page.$$eval('#lang-grid .lang', (nodes) => nodes.length);
    check('12言語が並ぶ', langs === 12, langs);
    await page.click('#lang-grid [data-locale="ko"]');
    await page.waitForTimeout(250);
    check('韓国語で「플레이」', (await page.textContent('#btn-play')).includes('플레이'), await page.textContent('#btn-play'));
    check('html lang が ko-KR', (await page.getAttribute('html', 'lang')) === 'ko-KR');
    await page.evaluate(() => window.__flip10.closeSheet());
    await page.click('#btn-lang-home');
    await page.click('#lang-grid [data-locale="ja"]');
    await page.waitForTimeout(250);
    check('日本語に戻る「あそぶ」', (await page.textContent('#btn-play')).includes('あそぶ'), await page.textContent('#btn-play'));
    await page.evaluate(() => window.__flip10.closeSheet());

    step('設定・プライバシー・合計の変更');
    await page.click('#btn-settings');
    await page.waitForSelector('#sheet-settings:not([hidden])');
    const soundOn = await page.getAttribute('#set-sound', 'aria-checked');
    check('効果音は最初 ON', soundOn === 'true', soundOn);
    await page.click('#set-sound');
    check('効果音を OFF にできる', (await page.getAttribute('#set-sound', 'aria-checked')) === 'false');
    await page.click('#set-sound');
    await page.click('#set-target [data-target="11"]');
    check('合計11に変えられる', (await page.textContent('#rules-target')).includes('11'), await page.textContent('#rules-target'));
    await page.click('#set-target [data-target="10"]');
    await page.click('#set-privacy');
    await page.waitForSelector('#sheet-privacy:not([hidden])');
    const legal = await page.textContent('#legal-body');
    check('プライバシー全文に「個人情報」', legal.includes('個人情報'), legal.slice(0, 60));
    check('オフライン・記録は端末内と書いてある', legal.includes('オフライン') && legal.includes('この端末'), legal.slice(0, 120));
    await page.evaluate(() => window.__flip10.closeSheet());

    step('タイムアップ → リザルト → もう一度');
    await openHome(page);
    await page.click('#mode-list [data-mode="time"] [data-time="60"]');
    await page.waitForSelector('#screen-play.is-active');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const game = window.__flip10.state.game;
      window.__flip10.state.game = { ...game, score: 500, timeLeft: 1200 };
      window.__flip10.state.shownScore = 500;
    });
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 8000 });
    check('タイムアップでリザルトが出る', await page.isVisible('#sheet-result'));
    check('リザルトにスコア500', (await page.textContent('#result-score')).replace(/[^0-9]/g, '') === '500', await page.textContent('#result-score'));
    check('自己ベスト更新の表示', await page.isVisible('#result-record'));
    check('ベストが記録される（time60）', await page.evaluate(() => window.__flip10.state.bests.time60 === 500));
    await page.click('#btn-again');
    await page.waitForSelector('#screen-play.is-active');
    await page.waitForTimeout(200);
    check('もう一度で60秒から再開', (await page.textContent('#hud-time')) === '1:00', await page.textContent('#hud-time'));
    await page.evaluate(() => window.__flip10.closeSheet());

    step('375px（iPhone SE 幅）でも収まる');
    await openHome(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);
    const overflow375 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('375px で横にはみ出さない（ホーム）', overflow375 <= 0, overflow375);
    await page.click('#btn-play');
    await page.waitForSelector('#screen-play.is-active');
    await page.waitForTimeout(200);
    const boardBox = await page.$eval('#board', (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    });
    check('盤面が 375px に収まる', boardBox.left >= 0 && boardBox.right <= 375 && boardBox.width > 300, boardBox);
    check('盤面の下が画面内', boardBox.bottom <= 667, boardBox);
    const footVisible = await page.isVisible('#btn-home');
    check('下のボタンが見えている', footVisible);
    await page.screenshot({ path: resolve(OUT, 'flip10-b1-play-375.png') });

    step('エラーの確認');
    check('404 が無い', badResponses.length === 0, badResponses.slice(0, 6));
    check('コンソールエラーがゼロ', consoleErrors.length === 0, consoleErrors.slice(0, 6));

    const ng = checks.filter((entry) => !entry.ok).length;
    console.log(`\nFLIP 10 Build 1 — ${checks.length} checks, ${checks.length - ng} passed`);
    console.log('screenshots:');
    for (const name of ['flip10-b1-home.png', 'flip10-b1-play.png', 'flip10-b1-howto.png', 'flip10-b1-pro.png', 'flip10-b1-advanced.png', 'flip10-b1-wide.png', 'flip10-b1-play-375.png']) {
      console.log(`  ${resolve(OUT, name)}`);
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  console.error(`\n${checks.filter((entry) => entry.ok).length}/${checks.length} checks passed before the failure`);
  process.exit(1);
});

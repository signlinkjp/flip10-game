/**
 * 実ブラウザ（Chromium）での操作テスト＋スクリーンショット（Build 2）
 *   npm run shots
 *
 * 確かめること:
 *   明るいテーマのホーム / 盤面 / あそびかた / PRO が実際に描ける
 *   2マス入れ替え（選択 → 入れ替え → 合計10で消える → 上から補充）
 *   行の合計は右・列の合計は下に出て、実際の合計と一致する
 *   手数ライフ（1手 −1 / 1ライン +3 / 0でゲームオーバー）
 *   ヒント（ON/OFF）と、消せる2マスが光る
 *   バイブ（Capacitor の FlipHaptics）が選択・入れ替え・消去・終了で呼ばれる
 *   文字サイズ 標準/大きめ/特大、設定の保存、PRO の合計ステッパー
 *   十字フリップ（PRO）の大きな凡例と反転
 *   タイムアタック 60/120秒
 *   375px / 393px ではみ出さない・コンソールエラーと404がゼロ
 *
 * 出力: /workspace/downloads/flip10-b2-home.png / -play.png / -pro.png / -howto.png
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

async function sums(page) {
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll('#sums-rows .sum')].map((node) => Number(node.textContent)),
    cols: [...document.querySelectorAll('#sums-cols .sum')].map((node) => Number(node.textContent)),
    n: document.querySelectorAll('#sums-rows .sum').length,
  }));
}

async function clickTile(page, index) {
  await page.evaluate((i) => {
    const node = document.querySelector(`#board .tile[data-i="${i}"]`);
    if (node) node.click();
  }, index);
}

async function settle(page, extra = 200) {
  try {
    await page.waitForFunction(() => window.__flip10 && window.__flip10.state.busy === false, null, { timeout: 8000 });
  } catch {
    /* busy が取れないときはそのまま */
  }
  await page.waitForTimeout(extra);
}

async function openHome(page) {
  await page.evaluate(() => {
    window.__flip10.closeSheet();
    if (document.querySelector('#screen-play.is-active')) document.querySelector('#btn-home').click();
  });
  await page.waitForFunction(() => document.querySelector('#screen-home.is-active') !== null);
  await page.waitForTimeout(120);
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

    // Capacitor の FlipHaptics を模して、震えの呼び出しを記録する（Web プレビュー）
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

    step('ホーム（明るいテーマ）');
    await page.goto(`${server.url}/?test=1`, { waitUntil: 'load' });
    await page.waitForSelector('#mode-list .mode', { timeout: 10000 });
    await page.waitForFunction(() => Boolean(window.__flip10));
    await page.click('#btn-lang-home');
    await page.waitForSelector('#sheet-language:not([hidden])');
    await page.click('#lang-grid [data-locale="ja"]');
    await page.evaluate(() => window.__flip10.closeSheet());
    await page.waitForTimeout(250);

    check('タイトルが FLIP 10', (await page.title()) === 'FLIP 10', await page.title());
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const rgb = bg.match(/\d+/g).map(Number);
    check('背景が明るい（各成分が200以上）', rgb.every((value) => value >= 200), bg);
    const ink = await page.evaluate(() => getComputedStyle(document.body).color);
    const inkRgb = ink.match(/\d+/g).map(Number);
    check('文字が濃い紺（暗い）', inkRgb[0] < 80 && inkRgb[2] < 120, ink);
    const modeCount = await page.$$eval('#mode-list .mode', (nodes) => nodes.length);
    check('4モードが並ぶ', modeCount === 4, modeCount);
    const locked = await page.$$eval('#mode-list .mode.is-locked', (nodes) => nodes.length);
    check('PRO の3モードが最初は鍵つき', locked === 3, locked);
    check('クラシックは無料', await page.$eval('#mode-list [data-mode="classic"]', (n) => !n.closest('.mode').classList.contains('is-locked')));
    const overflowHome = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('ホームが横にはみ出さない (393px)', overflowHome <= 0, overflowHome);
    await page.screenshot({ path: resolve(OUT, 'flip10-b2-home.png') });

    step('クラシックで遊ぶ（2マス入れ替え・合計バッジ）');
    await page.click('#btn-play');
    await page.waitForSelector('#screen-play.is-active');
    const count = await page.$$eval('#board .tile', (nodes) => nodes.length);
    check('4×4 の16マス', count === 16, count);
    check('タイマーは出ない（エンドレス）', await page.isHidden('#hud-time-wrap'));
    check('手数は7から', (await page.textContent('#hud-moves')) === '7', await page.textContent('#hud-moves'));
    const pipsOn = await page.$$eval('#moves-pips i.is-on', (nodes) => nodes.length);
    check('手数の玉が7つ点いている', pipsOn === 7, pipsOn);
    const sumsNow = await sums(page);
    check('行の合計が4つある', sumsNow.rows.length === 4, sumsNow);
    check('列の合計が4つある', sumsNow.cols.length === 4, sumsNow);
    const real = await page.evaluate(() => {
      const game = window.__flip10.game;
      const rows = [0, 0, 0, 0];
      const cols = [0, 0, 0, 0];
      game.board.forEach((tile, i) => {
        const value = tile.digit !== undefined ? tile.digit : tile.side === 'back' ? tile.back : tile.front;
        rows[Math.floor(i / game.size)] += value;
        cols[i % game.size] += value;
      });
      return { rows, cols };
    });
    check('行の合計が盤面と一致', JSON.stringify(sumsNow.rows) === JSON.stringify(real.rows), { shown: sumsNow.rows, real: real.rows });
    check('列の合計が盤面と一致', JSON.stringify(sumsNow.cols) === JSON.stringify(real.cols), { shown: sumsNow.cols, real: real.cols });

    step('選択 → 同じマスで解除 → 入れ替え');
    await page.evaluate(() => window.__flip10.setBoard([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6]));
    await clickTile(page, 0);
    await page.waitForTimeout(120);
    let board = await tiles(page);
    check('1マス目が青く光る', board[0].picked === true, board[0]);
    await clickTile(page, 0);
    await page.waitForTimeout(120);
    board = await tiles(page);
    check('同じマスで選択解除', board[0].picked === false, board[0]);
    const before = await tiles(page);
    await clickTile(page, 0);
    await clickTile(page, 5);
    await settle(page);
    const after = await tiles(page);
    check('入れ替えで2つの数字が交換される', after[0].value === before[5].value && after[5].value === before[0].value, { before: before.slice(0, 6), after: after.slice(0, 6) });

    step('合計10のラインが光って消え、手数が回復する');
    await page.evaluate(() => window.__flip10.setBoard([
      3, 2, 4, 0,
      1, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]));
    const scoreBefore = await page.evaluate(() => window.__flip10.game.score);
    await clickTile(page, 3);
    await clickTile(page, 4);
    let flashed = 0;
    try {
      await page.waitForFunction(() => document.querySelectorAll('#board .tile.is-clearing').length >= 4, null, { timeout: 2500 });
      flashed = await page.$$eval('#board .tile.is-clearing', (nodes) => nodes.length);
    } catch {
      flashed = 0;
    }
    check('消える行が金色に光る', flashed >= 4, flashed);
    const comboWord = await page.textContent('#combo-word');
    check('コンボの見出しが出る（NICE!）', comboWord.length > 0, comboWord);
    await settle(page);
    const scoreAfter = await page.evaluate(() => window.__flip10.game.score);
    const gain = scoreAfter - scoreBefore;
    check('ライン消去で得点が入る（100点の倍数）', gain >= 100 && gain % 100 === 0, { scoreBefore, scoreAfter });
    check('1ライン消して手数は満タン7に戻る', (await page.textContent('#hud-moves')) === '7', await page.textContent('#hud-moves'));
    const holes = await page.$$eval('#board .tile .tile__value', (nodes) => nodes.filter((node) => node.textContent !== '').length);
    check('消えたあとも16マスに数字が入る', holes === 16, holes);
    const hapticCalls = await page.evaluate(() => window.__hapticCalls);
    check('選択・入れ替え・消去でバイブが鳴る', hapticCalls.includes('light') && hapticCalls.includes('medium') && hapticCalls.includes('success'), hapticCalls);

    step('ヒント');
    await page.evaluate(() => window.__flip10.setBoard([
      3, 2, 4, 0,
      1, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]));
    await page.click('#btn-hint');
    await page.waitForTimeout(200);
    const hints = await page.$$eval('#board .tile.is-hint', (nodes) => nodes.length);
    check('ヒントで2マスが光る', hints === 2, hints);
    const hintPair = await page.evaluate(() => window.__flip10.hint());
    check('ヒントは本当に消せる手', Boolean(hintPair) && hintPair.rows.length + hintPair.cols.length > 0, hintPair);

    step('手数ライフ: 消えない入れ替えで −1');
    await page.evaluate(() => {
      window.__flip10.setBoard(new Array(16).fill(0));
      window.__flip10.setMoves(5);
    });
    await clickTile(page, 0);
    await clickTile(page, 1);
    await settle(page);
    check('消えない入れ替えで手数が1減る', (await page.textContent('#hud-moves')) === '4', await page.textContent('#hud-moves'));

    step('プレイ中の設定ボタン・文字サイズ');
    await page.click('#btn-settings-play');
    await page.waitForSelector('#sheet-settings:not([hidden])');
    const sizeButtons = await page.$$eval('#set-text-size button', (nodes) => nodes.map((node) => node.dataset.size));
    check('文字サイズが3段階', sizeButtons.join(',') === 'normal,large,xl', sizeButtons);
    await page.click('#set-text-size [data-size="xl"]');
    await page.waitForTimeout(150);
    check('特大で html に data-text=xl', (await page.getAttribute('html', 'data-text')) === 'xl');
    const fontPx = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    check('特大で基準フォントが大きくなる', parseFloat(fontPx) >= 20, fontPx);
    await page.click('#set-text-size [data-size="normal"]');
    const hapticOn = await page.getAttribute('#set-haptic', 'aria-checked');
    check('バイブは最初 ON', hapticOn === 'true', hapticOn);
    await page.click('#set-haptic');
    const hapticOff = await page.getAttribute('#set-haptic', 'aria-checked');
    check('バイブを OFF にできる', hapticOff === 'false', hapticOff);
    const savedHaptic = await page.evaluate(() => JSON.parse(localStorage.getItem('flip10.settings.v1')).haptic);
    check('バイブ設定が端末に保存される', savedHaptic === false, savedHaptic);
    await page.click('#set-haptic');
    const hintSw = await page.getAttribute('#set-hint', 'aria-checked');
    check('ヒントは最初 ON', hintSw === 'true', hintSw);
    await page.click('#set-hint');
    check('ヒントを OFF にできる', (await page.getAttribute('#set-hint', 'aria-checked')) === 'false');
    const hintOffClass = await page.$eval('#btn-hint', (node) => node.classList.contains('is-off'));
    check('ヒント OFF でボタンが控えめになる', hintOffClass);
    await page.click('#set-hint');
    await page.evaluate(() => window.__flip10.closeSheet());
    await settle(page);

    step('ゲームオーバー（手数0）');
    await page.evaluate(() => {
      window.__flip10.setBoard(new Array(16).fill(0));
      window.__flip10.setMoves(1);
    });
    await clickTile(page, 0);
    await clickTile(page, 1);
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 8000 });
    check('手数0でリザルトが出る', await page.isVisible('#sheet-result'));
    check('理由は「手数がなくなりました」', (await page.textContent('#result-title')).includes('手数'), await page.textContent('#result-title'));
    const overHaptics = await page.evaluate(() => window.__hapticCalls);
    check('ゲームオーバーで error のバイブ', overHaptics.includes('error'), overHaptics.slice(-4));
    await page.evaluate(() => window.__flip10.closeSheet());

    step('PRO シートと解錠（プレビュー）');
    await openHome(page);
    await page.click('#btn-pro');
    await page.waitForSelector('#sheet-pro:not([hidden])');
    const features = await page.$$eval('#sheet-pro .pro__features li', (nodes) => nodes.length);
    check('PRO の特典が5つ', features === 5, features);
    check('価格が出ている（¥300）', (await page.textContent('#buy-label')).includes('¥300'), await page.textContent('#buy-label'));
    check('開発用スイッチがある（Webプレビュー）', await page.isVisible('#set-dev'));
    await page.evaluate(() => document.querySelector('#toast').classList.remove('is-show'));
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(OUT, 'flip10-b2-pro.png') });
    await page.click('#btn-buy');
    await page.waitForTimeout(300);
    check('Webでは購入せず案内を出す', (await page.textContent('#toast')).includes('テスト用プレビュー'), await page.textContent('#toast'));
    await page.click('#set-dev');
    await page.waitForTimeout(250);
    check('解錠すると鍵が消える', (await page.$$eval('#mode-list .mode.is-locked', (nodes) => nodes.length)) === 0);

    step('PRO の合計（行・列 9〜40）');
    await page.click('#btn-settings');
    await page.waitForSelector('#sheet-settings:not([hidden])');
    await page.click('#set-target [data-axis="row"][data-step="1"]');
    await page.click('#set-target [data-axis="col"][data-step="1"]');
    await page.waitForTimeout(150);
    check('行の合計を11にできる', (await page.textContent('#set-row-target')) === '11', await page.textContent('#set-row-target'));
    check('列の合計を11にできる', (await page.textContent('#set-col-target')) === '11', await page.textContent('#set-col-target'));
    check('ルール表示が行11 / 列11', (await page.textContent('#rules-target')).includes('11'), await page.textContent('#rules-target'));
    const savedTargets = await page.evaluate(() => JSON.parse(localStorage.getItem('flip10.settings.v1')));
    check('合計が端末に保存される', savedTargets.rowTarget === 11 && savedTargets.colTarget === 11, savedTargets);
    // スクリーンショット用に 10 / 10 とベスト0に戻す
    await page.click('#set-target [data-axis="row"][data-step="-1"]');
    await page.click('#set-target [data-axis="col"][data-step="-1"]');
    await page.click('#set-reset');
    await page.waitForTimeout(150);
    check('合計を10に戻せる', (await page.textContent('#set-row-target')) === '10' && (await page.textContent('#set-col-target')) === '10');
    check('ベストを消せる', (await page.textContent('#home-best')) === '0', await page.textContent('#home-best'));
    await page.evaluate(() => window.__flip10.closeSheet());

    step('十字フリップ（PRO 特別モード）');
    await openHome(page);
    await page.click('#mode-list [data-mode="cross"]');
    await page.waitForSelector('#screen-play.is-active');
    check('十字フリップは4×4', (await page.$$eval('#board .tile', (n) => n.length)) === 16);
    check('大きな凡例が出る', await page.isVisible('#play-legend'));
    const legendTiles = await page.$$eval('#play-legend .legend__tile', (nodes) => nodes.map((node) => ({ text: node.textContent, width: node.getBoundingClientRect().width })));
    check('凡例は 0↔5 / 1↔4 / 2↔3', legendTiles.map((entry) => entry.text).join('') === '051423', legendTiles);
    check('凡例のタイルが大きい（40px以上）', legendTiles.every((entry) => entry.width >= 40), legendTiles);
    // 反転しても消えない盤面（どの行・列も6。十字フリップで1か所だけ変わる）
    await page.evaluate(() => window.__flip10.setBoard([
      0, 1, 2, 3,
      1, 2, 3, 0,
      2, 3, 0, 1,
      3, 0, 1, 2,
    ]));
    const crossBefore = await tiles(page);
    await clickTile(page, 5);
    try {
      await page.waitForFunction(() => document.querySelector('#board .tile[data-i="5"]').dataset.v !== '1', null, { timeout: 5000 });
    } catch {
      /* 下のチェックで拾う */
    }
    await settle(page);
    const crossAfter = await tiles(page);
    const flippedAt = crossAfter.map((tile, i) => (tile.back !== crossBefore[i].back ? i : -1)).filter((i) => i >= 0);
    const crossState = await page.evaluate(() => ({
      mode: window.__flip10.game && window.__flip10.game.modeId,
      mechanic: window.__flip10.game && window.__flip10.game.mechanic,
      status: window.__flip10.game && window.__flip10.game.status,
      busy: window.__flip10.state.busy,
      play: Boolean(document.querySelector('#screen-play.is-active')),
    }));
    check('＋の字の5マスだけが反転する', JSON.stringify(flippedAt) === JSON.stringify([1, 4, 5, 6, 9]), { flippedAt, crossState, crossBefore, crossAfter });
    check('裏は 5−表', crossAfter.filter((tile) => tile.back).every((tile) => tile.value === 5 - crossBefore[crossAfter.indexOf(tile)].value), crossAfter.filter((tile) => tile.back));
    check('十字フリップも1手で手数が減る', (await page.textContent('#hud-moves')) === '6', await page.textContent('#hud-moves'));
    await page.screenshot({ path: resolve(OUT, 'flip10-b2-play.png') });

    step('5×5 とタイムアタック');
    await openHome(page);
    await page.click('#mode-list [data-mode="wide"]');
    await page.waitForSelector('#screen-play.is-active');
    check('5×5 は25マス', (await page.$$eval('#board .tile', (n) => n.length)) === 25);
    const wideSums = await sums(page);
    check('5×5 の行の合計が5つ', wideSums.rows.length === 5, wideSums);
    await openHome(page);
    await page.click('#mode-list [data-mode="time"] [data-time="120"]');
    await page.waitForSelector('#screen-play.is-active');
    check('タイムアタックは残り時間が出る', await page.isVisible('#hud-time-wrap'));
    check('120秒で始まる', (await page.textContent('#hud-time')) === '2:00', await page.textContent('#hud-time'));
    check('タイムアタックは手数表示なし', await page.isHidden('#hud-moves-wrap'));
    // 残り1.5秒にして入れ替え → アニメ中にタイムアップしてもリザルトが残る
    await page.evaluate(() => {
      window.__flip10.state.game = { ...window.__flip10.state.game, timeLeft: 1500 };
    });
    await clickTile(page, 0);
    await clickTile(page, 1);
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 9000 });
    check('タイムアップでリザルトが出る', await page.isVisible('#sheet-result'));
    check('理由は「タイムアップ！」', (await page.textContent('#result-title')).includes('タイムアップ'), await page.textContent('#result-title'));
    check('終了後は status=over のまま', (await page.evaluate(() => window.__flip10.game.status)) === 'over');
    await page.evaluate(() => window.__flip10.closeSheet());

    step('あそびかた');
    await openHome(page);
    await page.click('#btn-howto');
    await page.waitForSelector('#sheet-howto:not([hidden])');
    const steps = await page.$$eval('#sheet-howto .howto__step', (nodes) => nodes.length);
    check('あそびかたは5ステップ', steps === 5, steps);
    for (const kind of ['swap', 'sums', 'line', 'moves', 'cross']) {
      check(`${kind} の図がある`, await page.isVisible(`#sheet-howto .diag--${kind}`));
    }
    await page.evaluate(() => document.querySelector('#toast').classList.remove('is-show'));
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(OUT, 'flip10-b2-howto.png') });
    await page.evaluate(() => window.__flip10.closeSheet());

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

    step('PLAY 画面のスクリーンショット（クラシック）');
    await openHome(page);
    await page.click('#btn-play');
    await page.waitForSelector('#screen-play.is-active');
    check('プレイ中に合計（行/列）が出る', await page.isVisible('#targetbar'));
    check('合計の表示が行10 / 列10', (await page.textContent('#target-text')).includes('10'), await page.textContent('#target-text'));
    await page.evaluate(() => window.__flip10.setBoard([
      3, 2, 6, 0,
      1, 5, 2, 3,
      4, 1, 3, 4,
      3, 3, 1, 5,
    ]));
    await clickTile(page, 0);
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(OUT, 'flip10-b2-play.png') });

    step('375px（iPhone SE 幅）でも収まる');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(250);
    const overflow375 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('375px で横にはみ出さない（プレイ）', overflow375 <= 0, overflow375);
    const boardBox = await page.$eval('#board-wrap', (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    });
    check('盤面と合計が 375px に収まる', boardBox.left >= 0 && boardBox.right <= 375 && boardBox.width > 300, boardBox);
    check('下のボタンが見えている', await page.isVisible('#btn-home'));
    await openHome(page);
    const overflowHome375 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('375px で横にはみ出さない（ホーム）', overflowHome375 <= 0, overflowHome375);

    step('エラーの確認');
    check('404 が無い', badResponses.length === 0, badResponses.slice(0, 6));
    check('コンソールエラーがゼロ', consoleErrors.length === 0, consoleErrors.slice(0, 6));

    const ng = checks.filter((entry) => !entry.ok).length;
    console.log(`\nFLIP 10 Build 2 — ${checks.length} checks, ${checks.length - ng} passed`);
    console.log('screenshots:');
    for (const name of ['flip10-b2-home.png', 'flip10-b2-play.png', 'flip10-b2-pro.png', 'flip10-b2-howto.png']) {
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

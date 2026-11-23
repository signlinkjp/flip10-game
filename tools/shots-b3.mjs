/**
 * 実ブラウザ（Chromium）での操作テスト＋スクリーンショット（Build 3）
 *   npm run shots
 *
 * 確かめること:
 *   オープニング（LINEZAP ロゴ＋黄金ライン）が出て、1.9秒で消える・タップで即スキップ
 *   タイトルと表示名が LINEZAP
 *   ホーム: 5つのモード・左上ロゴとミニ盤面が重ならない・縦にはみ出さない（375 / 393 / 特大）
 *   十字フリップの説明がカードの中に入っている
 *   合計バッジが「今の合計/目標」・ヒントOFFで「？/目標」（分母は残る）
 *   ドラッグで2マス入れ替え（ハイライト付き）・タップ2回も併用できる
 *   6×6（PRO）: 36マス・1マス44px以上・合計 12〜42 が反映される
 *   設定: 合計ステッパーが1つだけ・BGM が最初から ON・Build 3 表示
 *   コンソールエラーと404がゼロ
 *
 * 出力: /workspace/downloads/linezap-b3-*.png
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
  await page.waitForTimeout(140);
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

    /* ---------------------------------------------------------------- */
    /* 1. 初回起動（保存なし）: オープニング・既定値                      */
    /* ---------------------------------------------------------------- */
    step('オープニング');
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

    await page.goto(`${server.url}/?test=1`, { waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible', timeout: 10000 });
    const shownAt = Date.now();
    const openingLogo = await page.textContent('.opening__logo');
    check('オープニングに LINEZAP ロゴが出る', openingLogo.replace(/\s/g, '') === 'LINEZAP', openingLogo);
    check('オープニングに黄金ラインの演出がある', (await page.$$('.opening__zap')).length === 1);
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 6000 });
    const openingMs = Date.now() - shownAt;
    check('オープニングは 1.5〜2.5秒で自動的に消える', openingMs >= 1400 && openingMs <= 2500, openingMs);
    check('起動直後はホームが出ている', await page.isVisible('#screen-home'));

    step('タイトル・ブランド・既定の設定');
    await page.waitForSelector('#mode-list .mode', { timeout: 10000 });
    await page.waitForFunction(() => Boolean(window.__linezap));
    check('タイトルが LINEZAP', (await page.title()) === 'LINEZAP', await page.title());
    check('左上のブランドが LINEZAP', (await page.textContent('.brand__name')).trim() === 'LINEZAP');
    check('メタのビルドが Build 3', (await page.getAttribute('meta[name="app-build"]', 'content')) === 'Build 3');
    // 検証は日本語表示で行う（初回は端末の言語になるため）
    await page.click('#btn-lang-home');
    await page.waitForSelector('#sheet-language:not([hidden])');
    await page.click('#lang-grid [data-locale="ja"]');
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.waitForTimeout(200);
    check('日本語に切り替わる', (await page.textContent('.brand__sub')).includes('SWAP'), await page.textContent('.brand__sub'));

    step('オープニングのスクリーンショット（日本語）');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(OUT, 'linezap-b3-opening.png') });
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 6000 });
    await page.waitForFunction(() => Boolean(window.__linezap));
    const modeCount = await page.$$eval('#mode-list .mode', (nodes) => nodes.length);
    check('5モードが並ぶ（6×6 が増えた）', modeCount === 5, modeCount);
    const modeIds = await page.$$eval('#mode-list .mode', (nodes) => nodes.map((node) => node.dataset.mode));
    check('モードの並びが クラシック→5×5→6×6→十字フリップ→タイムアタック', modeIds.join(',') === 'classic,wide,wide6,cross,time', modeIds);
    const locked = await page.$$eval('#mode-list .mode.is-locked', (nodes) => nodes.length);
    check('PRO の4モードが最初は鍵つき', locked === 4, locked);
    const crossPairs = await page.$$eval('#mode-list .mode--cross .mode__pairs b', (nodes) => nodes.map((node) => node.textContent));
    check('十字フリップの表裏（0↔5 1↔4 2↔3）がカードの中にある', crossPairs.join(' ') === '0↔5 1↔4 2↔3', crossPairs);
    check('ホーム中央の十字フリップ説明は外した', (await page.$$('#legend-home')).length === 0);
    const bgmDefault = await page.getAttribute('#set-bgm', 'aria-checked');
    check('Build 3 は BGM が最初から ON', bgmDefault === 'true', bgmDefault);
    const savedBgm = await page.evaluate(() => JSON.parse(localStorage.getItem('flip10.settings.v1') || '{}'));
    check('BGM の既定 ON が端末に保存される', savedBgm.bgm === true && savedBgm.bgmDefault === 3, savedBgm);

    step('ホームのレイアウト（393px）');
    let layout = await homeLayout(page);
    check('左上ロゴとミニ盤面が重ならない (393px)', layout.brand.bottom <= layout.demo.top + 0.5, { brand: layout.brand, demo: layout.demo });
    check('ホームが縦にはみ出さない (393px)', layout.homeOverflow <= 1, layout.homeOverflow);
    check('ホームが横にはみ出さない (393px)', layout.pageOverflowX <= 0, layout.pageOverflowX);
    check('モード名が折り返さない (393px)', layout.modeNames.every((item) => item.lines === 1), layout.modeNames);
    check('モードの説明が2行以内 (393px)', layout.descLines.every((lines) => lines <= 2), layout.descLines);
    await page.screenshot({ path: resolve(OUT, 'linezap-b3-home.png') });

    step('オープニングはタップで即スキップできる');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#opening', { state: 'visible' });
    const skipStart = Date.now();
    await page.mouse.click(200, 400);
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 3000 });
    check('タップで 1秒以内に閉じる', Date.now() - skipStart < 1100, Date.now() - skipStart);
    await page.waitForFunction(() => Boolean(window.__linezap));

    /* ---------------------------------------------------------------- */
    /* 2. クラシック: バッジ・ドラッグ・タップ                             */
    /* ---------------------------------------------------------------- */
    step('クラシック（4×4）と合計バッジ');
    await page.click('#btn-play');
    await page.waitForSelector('#screen-play.is-active');
    const count = await page.$$eval('#board .tile', (nodes) => nodes.length);
    check('4×4 の16マス', count === 16, count);
    const sums = await sumTexts(page);
    check('右のバッジが「今の合計/10」（4つ）', sums.rows.length === 4 && sums.rows.every((text) => /^\d+\/10$/.test(text)), sums.rows);
    check('下のバッジが「今の合計/10」（4つ）', sums.cols.length === 4 && sums.cols.every((text) => /^\d+\/10$/.test(text)), sums.cols);
    const targetText = await page.textContent('#target-text');
    check('目標の表示は 10', targetText.trim() === '10', targetText);

    step('ドラッグで2マス入れ替え');
    // 消えない盤面で「入れ替え」と「手数 −1」だけを見る
    await page.evaluate(() => {
      // 消えないが「5↔4 で 10 になる手」は残っている盤面（数字を混ぜ直させない）
      window.__linezap.setBoard([
        1, 2, 3, 5,
        0, 4, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);
      window.__linezap.setMoves(5);
    });
    const before = await tiles(page);
    const mid = await dragTile(page, 0, 5);
    check('ドラッグ中に元のマスがハイライトされる', mid.source === 1, mid);
    check('ドラッグ中に指の下のマスがハイライトされる', mid.target === 1, mid);
    await settle(page);
    const after = await tiles(page);
    check('ドラッグで2つの数字が入れ替わる', after[0].value === before[5].value && after[5].value === before[0].value, { before: before.slice(0, 6), after: after.slice(0, 6) });
    check('ドラッグでは選択状態が残らない', after.every((tile) => tile.picked === false));
    const movesAfterDrag = await page.textContent('#hud-moves');
    check('ドラッグの入れ替えで手数が1減る', movesAfterDrag === '4', movesAfterDrag);

    step('タップ2回でも入れ替えられる（併用）');
    await page.evaluate(() => {
      window.__linezap.setBoard([
        2, 3, 4, 0,
        1, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);
      window.__linezap.setMoves(5);
    });
    const beforeTap = await tiles(page);
    await clickTile(page, 1);
    await page.waitForTimeout(120);
    check('タップで1マス目が選ばれる', (await tiles(page))[1].picked === true);
    await clickTile(page, 2);
    await settle(page);
    const afterTap = await tiles(page);
    check('タップ2回で入れ替わる', afterTap[1].value === beforeTap[2].value && afterTap[2].value === beforeTap[1].value, { before: beforeTap.slice(0, 4), after: afterTap.slice(0, 4) });
    check('タップの入れ替えでも手数が1減る', (await page.textContent('#hud-moves')) === '4', await page.textContent('#hud-moves'));

    step('ライン消去（合計10）と手数の回復');
    await page.evaluate(() =>
      window.__linezap.setBoard([
        3, 2, 4, 0,
        1, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]),
    );
    const scoreBefore = await page.evaluate(() => window.__linezap.game.score);
    await dragTile(page, 3, 4);
    await settle(page, 400);
    const scoreAfter = await page.evaluate(() => window.__linezap.game.score);
    check('ドラッグで合計10の行が消えて得点が入る', scoreAfter - scoreBefore >= 100, { scoreBefore, scoreAfter });
    const rowsAfter = await sumTexts(page);
    check('消えたあともバッジは「今/10」の形', rowsAfter.rows.every((text) => /^\d+\/10$/.test(text)), rowsAfter.rows);

    step('ヒントOFFで「？/10」');
    await page.evaluate(() => window.__linezap.setHint(false));
    await page.waitForTimeout(200);
    const hidden = await sumTexts(page);
    check('ヒントOFFで分子が「？」になる（右）', hidden.rows.every((text) => /^？\/10$/.test(text)), hidden.rows);
    check('ヒントOFFで分子が「？」になる（下）', hidden.cols.every((text) => /^？\/10$/.test(text)), hidden.cols);
    check('ヒントOFFでも目標（分母）は残る', hidden.rows.every((text) => text.endsWith('/10')), hidden.rows);
    // スクリーンショット用に、自然な盤面でもう一度始める（ヒントは OFF のまま）
    await page.evaluate(() => window.__linezap.startGame('classic'));
    await settle(page, 350);
    await page.screenshot({ path: resolve(OUT, 'linezap-b3-hint-off.png') });
    const hapticCalls = await page.evaluate(() => window.__hapticCalls);
    check('ドラッグでもバイブが鳴る', hapticCalls.includes('light') && hapticCalls.includes('medium'), hapticCalls);
    await page.evaluate(() => window.__linezap.setHint(true));

    /* ---------------------------------------------------------------- */
    /* 3. 6×6（PRO）と合計設定                                            */
    /* ---------------------------------------------------------------- */
    step('6×6（PRO）');
    await page.evaluate(() => {
      window.__linezap.setEntitled(true);
      window.__linezap.startGame('wide6');
    });
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 300);
    const tiles6 = await page.$$eval('#board .tile', (nodes) => nodes.length);
    check('6×6 の36マス', tiles6 === 36, tiles6);
    const tileSize = await page.evaluate(() => {
      const r = document.querySelector('#board .tile').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    check('393px で1マス44px以上', tileSize.w >= 44 && tileSize.h >= 44, tileSize);
    const sums6 = await sumTexts(page);
    check('6×6 のバッジは「今/20」（6つ）', sums6.rows.length === 6 && sums6.rows.every((text) => /^\d+\/20$/.test(text)), sums6.rows);
    check('6×6 の下バッジも6つ', sums6.cols.length === 6 && sums6.cols.every((text) => /^\d+\/20$/.test(text)), sums6.cols);
    const tileFits = await page.evaluate(() => {
      const board = document.querySelector('#board').getBoundingClientRect();
      const wrap = document.querySelector('#board-wrap').getBoundingClientRect();
      const sums = [...document.querySelectorAll('#sums-cols .sum')].map((node) => node.getBoundingClientRect());
      return {
        boardRight: board.right,
        wrapRight: wrap.right,
        sumsOverflow: [...document.querySelectorAll('#sums-rows .sum, #sums-cols .sum')].some((node) => node.scrollWidth > node.clientWidth + 1),
        lastCol: sums[sums.length - 1].right,
        viewport: window.innerWidth,
      };
    });
    check('6×6 が横にはみ出さない（バッジの文字も切れない）', tileFits.wrapRight <= tileFits.viewport && !tileFits.sumsOverflow, tileFits);
    await page.screenshot({ path: resolve(OUT, 'linezap-b3-play6.png') });

    step('合計設定 12〜42 が 5×5 / 6×6 に効く');
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.waitForSelector('#sheet-settings:not([hidden])');
    const steppers = await page.$$eval('#set-target .stepper', (nodes) => nodes.length);
    check('合計のステッパーは1つだけ', steppers === 1, steppers);
    const startTarget = await page.textContent('#set-target-value');
    check('設定の合計は既定 20', startTarget.trim() === '20', startTarget);
    for (let i = 0; i < 30; i += 1) await page.click('#set-target [data-step="1"]');
    check('上限は 42', (await page.textContent('#set-target-value')).trim() === '42', await page.textContent('#set-target-value'));
    for (let i = 0; i < 40; i += 1) await page.click('#set-target [data-step="-1"]');
    check('下限は 12', (await page.textContent('#set-target-value')).trim() === '12', await page.textContent('#set-target-value'));
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.evaluate(() => window.__linezap.startGame('wide6'));
    await settle(page, 250);
    check('6×6 の目標が 12 になる', (await page.textContent('#target-text')).trim() === '12', await page.textContent('#target-text'));
    await page.evaluate(() => window.__linezap.startGame('wide'));
    await settle(page, 250);
    check('5×5 の目標も 12', (await page.textContent('#target-text')).trim() === '12', await page.textContent('#target-text'));
    const tiles5 = await page.$$eval('#board .tile', (nodes) => nodes.length);
    check('5×5 は25マス', tiles5 === 25, tiles5);
    await page.evaluate(() => window.__linezap.startGame('classic'));
    await settle(page, 250);
    check('4×4 は設定に関係なく 10 固定', (await page.textContent('#target-text')).trim() === '10', await page.textContent('#target-text'));

    step('設定画面のスクリーンショット');
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.waitForSelector('#sheet-settings:not([hidden])');
    // 既定の 20 に戻してから撮る（トーストが消えるまで待つ）
    for (let i = 0; i < 8; i += 1) await page.click('#set-target [data-step="1"]');
    await page.waitForTimeout(2400);
    const version = await page.textContent('#settings-version');
    check('設定に Build 3 が出る', version.includes('Build 3'), version);
    check('4×4 の注記がある', (await page.textContent('#set-target')).includes('4×4'), await page.textContent('#set-target'));
    await page.screenshot({ path: resolve(OUT, 'linezap-b3-settings.png') });
    await page.evaluate(() => window.__linezap.closeSheet());

    step('十字フリップはタップで反転（ドラッグでは反転しない）');
    await page.evaluate(() => window.__linezap.startGame('cross'));
    await settle(page, 300);
    const beforeFlip = await tiles(page);
    const dragFlip = await dragTile(page, 0, 3);
    await page.waitForTimeout(300);
    const afterDrag = await tiles(page);
    check('十字フリップはドラッグで反転しない', afterDrag.filter((tile) => tile.back).length === beforeFlip.filter((tile) => tile.back).length, { dragFlip, before: beforeFlip.slice(0, 4), after: afterDrag.slice(0, 4) });
    await clickTile(page, 5);
    const flipped = await page.$$eval('#board .tile.is-flipping', (nodes) => nodes.map((node) => Number(node.dataset.i)).sort((a, b) => a - b));
    check('十字フリップはタップで＋の字（5マス）が反転する', flipped.join(',') === '1,4,5,6,9', flipped);
    await settle(page, 400);
    check('反転後もゲームは続く', (await page.evaluate(() => window.__linezap.game.status)) === 'playing');
    const legend = await page.evaluate(() => document.querySelector('#play-legend').hidden);
    check('十字フリップ中は表裏の凡例が出る', legend === false, legend);

    step('ホームへ戻る（BGM OFF を尊重）');
    await openHome(page);
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.waitForSelector('#sheet-settings:not([hidden])');
    await page.click('#set-bgm');
    check('BGM を OFF にできる', (await page.getAttribute('#set-bgm', 'aria-checked')) === 'false');
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__linezap));
    await page.waitForSelector('#opening', { state: 'hidden', timeout: 6000 });
    check('一度 OFF にした BGM は次の起動でも OFF', (await page.getAttribute('#set-bgm', 'aria-checked')) === 'false');

    /* ---------------------------------------------------------------- */
    /* 4. 375px / 特大 のレイアウト                                       */
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
    check(
      '左上ロゴとミニ盤面が重ならない (375px・特大)',
      !layout.demo || layout.demo.height === 0 || layout.brand.bottom <= layout.demo.top + 0.5,
      { brand: layout.brand, demo: layout.demo },
    );
    check('ホームが縦にはみ出さない (375px・特大)', layout.homeOverflow <= 1, layout.homeOverflow);
    check('モード名が折り返さない (375px・特大)', layout.modeNames.every((item) => item.lines === 1), layout.modeNames);
    check('モードの説明が2行以内 (375px・特大)', layout.descLines.every((lines) => lines <= 2), layout.descLines);
    await page.screenshot({ path: resolve(OUT, 'linezap-b3-home-375-xl.png') });

    step('375px・特大の 6×6');
    await page.evaluate(() => {
      window.__linezap.setEntitled(true);
      window.__linezap.startGame('wide6');
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
    await page.screenshot({ path: resolve(OUT, 'linezap-b3-play6-375-xl.png') });

    /* ---------------------------------------------------------------- */
    /* 5. エラー確認                                                      */
    /* ---------------------------------------------------------------- */
    check('コンソールエラーがゼロ', consoleErrors.length === 0, consoleErrors.slice(0, 5));
    check('404 がゼロ', badResponses.length === 0, badResponses.slice(0, 5));

    const ng = checks.filter((item) => !item.ok).length;
    console.log(`\nLINEZAP Build 3 — ${checks.length} checks, ${checks.length - ng} passed`);
    if (ng > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`\n${error.message}`);
    console.log(`\nLINEZAP Build 3 — ${checks.length} checks, ${checks.filter((item) => item.ok).length} passed (stopped on failure)`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main();

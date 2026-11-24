/**
 * LINEZAP — Build 6 の実ブラウザ検証（Playwright / Chromium）
 *   npm run e2e
 *
 * トモアキさんから届いた2件の報告を、実機に近い操作で再現して確かめる。
 *
 *   1. ゲーム中にフリーズする
 *      ・時間切れで終わったあと、そのまま盤面で止まらず結果画面が開く
 *      ・音（audio.over）が失敗しても結果画面は開く
 *      ・終わっているのに結果シートだけ出ていない状態を、見張り番が必ず拾う
 *      ・連打・ドラッグ中断・pointercancel のあともタップが効く
 *      ・busy が戻らなくなっても、見張り番が解放する
 *   2. 残り時間ギリギリでコンボが始まったら時間を止めて復活させる
 *      ・残り0.3秒でコンボ成立 → 演出中に終わらない → タイマー満タンで続行
 *      ・コンボ不発なら、時間切れでちゃんと終わる（終わったら結果画面）
 *      ・タイムアタックはコンボの得点を入れてから終わる
 *
 * 環境変数（この環境の Chromium 用）:
 *   PLAYWRIGHT_LIBS … libnspr4 等の場所
 *   PLAYWRIGHT_PATH … playwright 本体の場所
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

/** あと1手（index 3 の 0 と index 4 の 1 を入れ替える）で1行消える4×4 */
const ONE_MOVE = [3, 2, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
/** どこを入れ替えても消えない4×4（コンボ不発の確認用） */
const NO_CLEAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5];

async function tileCenter(page, index) {
  return page.evaluate((i) => {
    const node = document.querySelector(`#board .tile[data-i="${i}"]`);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, index);
}

/** 指で押したまま（pointerdown → move → up）2マス目まで運ぶ */
async function dragTile(page, from, to) {
  const a = await tileCenter(page, from);
  const b = await tileCenter(page, to);
  if (!a || !b) throw new Error(`マスが見つかりません ${from} → ${to}`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 14, a.y + 14, { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

async function busy(page) {
  return page.evaluate(() => window.__linezap.state.busy);
}

/** busy が下りるまで待つ（下りなければ false） */
async function settle(page, timeout = 6000, extra = 120) {
  try {
    await page.waitForFunction(() => window.__linezap && window.__linezap.state.busy === false, null, { timeout });
  } catch {
    return false;
  }
  await page.waitForTimeout(extra);
  return true;
}

async function startClassic(page, { target = 10 } = {}) {
  await page.evaluate((value) => window.__linezap.startGame('classic', { size: 4, target: value }), target);
  await page.waitForSelector('#screen-play.is-active');
  await settle(page, 3000, 100);
}

async function startTimeAttack(page) {
  await page.evaluate(() => window.__linezap.startGame('time', { size: 4, timeLimit: 60 }));
  await page.waitForSelector('#screen-play.is-active');
  await settle(page, 3000, 100);
}

async function setGame(page, patch) {
  await page.evaluate((next) => {
    window.__linezap.state.game = { ...window.__linezap.state.game, ...next };
  }, patch);
}

async function readGame(page) {
  return page.evaluate(() => {
    const game = window.__linezap.game;
    return {
      status: game.status,
      sheet: window.__linezap.state.sheet,
      score: game.score,
      moves: game.moves,
      turnLeft: game.turnLeft,
      turnLimit: game.turnLimit,
      timeLeft: game.timeLeft,
      clearedLines: game.clearedLines,
    };
  });
}

async function resultOpen(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('#sheet-result');
    return Boolean(sheet && !sheet.hidden);
  });
}

/** 結果シートが「一度でも」開いたかを見張る（演出中に開かないことの確認用） */
async function watchResult(page) {
  await page.evaluate(() => {
    window.__e2eResultSeen = false;
    const sheet = document.querySelector('#sheet-result');
    if (window.__e2eObserver) window.__e2eObserver.disconnect();
    window.__e2eObserver = new MutationObserver(() => {
      if (!sheet.hidden) window.__e2eResultSeen = true;
    });
    window.__e2eObserver.observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  });
}

async function resultSeen(page) {
  return page.evaluate(() => {
    const seen = Boolean(window.__e2eResultSeen) || Boolean(document.querySelector('#sheet-result') && !document.querySelector('#sheet-result').hidden);
    if (window.__e2eObserver) {
      window.__e2eObserver.disconnect();
      window.__e2eObserver = null;
    }
    return seen;
  });
}

async function main() {
  const chromium = await loadChromium();
  const server = await startServer();
  let browser = null;
  const pageErrors = [];
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      env: { ...process.env, LD_LIBRARY_PATH: `${LIBS}:${process.env.LD_LIBRARY_PATH ?? ''}` },
    });

    const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true });
    page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
      window.Capacitor = window.Capacitor || {};
      window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.FlipHaptics = { haptic: () => Promise.resolve({}) };
    });

    await page.goto(`${server.url}/?test=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__linezap), null, { timeout: 10000 });
    await page.evaluate(() => window.__linezap.skipOpening());
    // 文言の確認を日本語で行う
    await page.click('#btn-lang-home');
    await page.waitForSelector('#sheet-language:not([hidden])');
    await page.click('#lang-grid [data-locale="ja"]');
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.waitForTimeout(150);

    /* ---------------------------------------------------------------- */
    /* 1. 報告の再現: 時間切れで終わったあと結果画面が開く              */
    /* ---------------------------------------------------------------- */
    step('時間切れで終わったら結果画面が開く（報告の再現）');
    await page.evaluate(() => window.__linezap.openStart('classic'));
    await page.waitForSelector('#sheet-start:not([hidden])');
    await page.click('#btn-start');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 3000, 100);
    await watchResult(page);
    await page.evaluate(() => window.__linezap.setTurnLeft(250));
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 5000 });
    check('時間切れで結果シートが開く', await resultOpen(page));
    check('状態が「結果表示中」になる', (await page.evaluate(() => window.__linezap.state.sheet)) === 'result');
    const timeResult = await readGame(page);
    check('ゲームは終了している', timeResult.status === 'over', timeResult);
    const title = await page.textContent('#result-title');
    check('結果がタイムアップ', /タイムアップ|時間切れ/.test(title), title);
    const reason = await page.textContent('#result-reason');
    check('理由に制限時間が出る', /制限時間|時間/.test(reason), reason);
    check('結果にスコアが入っている', /^\d+$/.test((await page.textContent('#result-score')).trim()));

    step('「もう1回」で新しいゲームが始まり、時計も動く');
    await page.click('#btn-again');
    await page.waitForSelector('#screen-play.is-active');
    await settle(page, 3000, 250);
    const again = await readGame(page);
    check('もう1回でプレイ中に戻る', again.status === 'playing' && again.sheet === null, again);
    check('制限時間が満タンから始まる', again.turnLeft > again.turnLimit - 1500, again);
    await page.waitForTimeout(400);
    const ticking = await readGame(page);
    check('時計が進んでいる（止まっていない）', ticking.turnLeft < again.turnLeft, { again, ticking });

    step('ホームへ戻れる');
    await page.evaluate(() => window.__linezap.setTurnLeft(200));
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 5000 });
    await page.click('#btn-result-home');
    await page.waitForSelector('#screen-home.is-active');
    check('ホームへ戻れる', await page.isVisible('#screen-home'));

    /* ---------------------------------------------------------------- */
    /* 2. 音が失敗しても結果画面は開く（endRun の finally）             */
    /* ---------------------------------------------------------------- */
    step('audio.over が失敗しても結果画面が開く');
    await startClassic(page);
    await page.evaluate(() => {
      window.__origOver = window.__linezap.audio.over;
      window.__linezap.audio.over = () => {
        throw new Error('e2e: audio over failed');
      };
    });
    await page.evaluate(() => window.__linezap.setTurnLeft(200));
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 5000 });
    check('音が落ちても結果シートが開く', await resultOpen(page));
    await page.evaluate(() => {
      window.__linezap.audio.over = window.__origOver;
    });
    await page.evaluate(() => window.__linezap.closeSheet());

    /* ---------------------------------------------------------------- */
    /* 3. 終わっているのに結果シートが出ていない → 見張り番が拾う        */
    /* ---------------------------------------------------------------- */
    step('結果シートだけが出ていない状態を見張り番が拾う');
    await startClassic(page);
    await page.evaluate(() => {
      // endRun を通さずに「時間切れで終わった」状態だけを作る（報告の止まり方）
      window.__linezap.state.game = {
        ...window.__linezap.state.game,
        status: 'over',
        turnLeft: 0,
        overReason: 'time',
      };
    });
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 3000 });
    check('見張り番が結果シートを開く', await resultOpen(page));
    check('結果の理由も入っている', /時間/.test(await page.textContent('#result-reason')));
    await page.evaluate(() => window.__linezap.closeSheet());
    await page.waitForTimeout(700);
    check('一度閉じた結果を勝手に開き直さない', !(await resultOpen(page)));

    /* ---------------------------------------------------------------- */
    /* 4. 残り0.3秒でコンボ成立 → 演出中に終わらず、時間が復活する      */
    /* ---------------------------------------------------------------- */
    step('残り0.3秒でコンボ → 演出中は終わらず、タイマー満タンで続行');
    await startClassic(page);
    await page.evaluate((values) => {
      window.__linezap.setMoves(4);
      window.__linezap.setBoard(values);
      window.__linezap.setTurnLeft(500);
    }, ONE_MOVE);
    await watchResult(page);
    const beforeCombo = await readGame(page);
    check('残り時間がギリギリ（1秒未満）から始めている', beforeCombo.turnLeft < 1000, beforeCombo);
    await dragTile(page, 3, 4);
    // 演出の間（入れ替え110ms + 消去360ms + 落下220ms）を細かく見る
    const samples = [];
    for (let i = 0; i < 7; i += 1) {
      samples.push(await page.evaluate(() => ({
        busy: window.__linezap.state.busy,
        status: window.__linezap.game.status,
        turnLeft: window.__linezap.game.turnLeft,
        sheet: window.__linezap.state.sheet,
        resultOpen: !document.querySelector('#sheet-result').hidden,
      })));
      await page.waitForTimeout(110);
    }
    const duringBusy = samples.filter((sample) => sample.busy);
    check('演出中（busy）に一度も終わらない', duringBusy.every((sample) => sample.status === 'playing'), samples);
    check('演出中は結果シートが開かない', samples.every((sample) => !sample.resultOpen), samples);
    const busyTurns = [...new Set(duringBusy.map((sample) => sample.turnLeft))];
    check('演出中は時間が止まっている（減らない）', busyTurns.length <= 1, samples);

    await settle(page, 6000, 350);
    const afterCombo = await readGame(page);
    check('コンボで終わらない', afterCombo.status === 'playing', afterCombo);
    check('演出中に結果シートが一度も開かなかった', !(await resultSeen(page)));
    check('得点が入っている', afterCombo.score > beforeCombo.score, { beforeCombo, afterCombo });
    check('制限時間が満タンに戻っている', afterCombo.turnLeft > 8500 && afterCombo.turnLimit === 10000, afterCombo);
    check('手数も減っていない（1ライン +1）', afterCombo.moves === 4, afterCombo);
    const turnText = (await page.textContent('#turn-time')).trim();
    check('タイマーの秒数が戻っている', /^(9|10)\.\d$/.test(turnText), turnText);
    await page.waitForTimeout(500);
    check('続行していられる（0秒になっていない）', (await readGame(page)).status === 'playing');

    /* ---------------------------------------------------------------- */
    /* 5. コンボ不発なら0秒でちゃんと終わる                             */
    /* ---------------------------------------------------------------- */
    step('コンボ不発のギリギリは時間切れで終わる');
    await page.evaluate((values) => {
      window.__linezap.setBoard(values);
      window.__linezap.setTurnLeft(300);
    }, NO_CLEAR);
    await watchResult(page);
    await dragTile(page, 0, 1);
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 5000 });
    const noCombo = await readGame(page);
    check('消えない入れ替えのあと時間切れで終わる', noCombo.status === 'over', noCombo);
    check('結果シートが開く', await resultOpen(page));
    check('結果がタイムアップ', /タイムアップ|時間切れ/.test(await page.textContent('#result-title')));
    await page.evaluate(() => window.__linezap.closeSheet());

    /* ---------------------------------------------------------------- */
    /* 6. タイムアタック: ギリギリのコンボは得点してから終わる           */
    /* ---------------------------------------------------------------- */
    step('タイムアタック 残り0.3秒でコンボ → 得点してから時間切れ');
    await startTimeAttack(page);
    await page.evaluate((values) => {
      window.__linezap.setBoard(values);
      window.__linezap.setTimeLeft(300);
    }, ONE_MOVE);
    const beforeTime = await readGame(page);
    await dragTile(page, 3, 4);
    await settle(page, 6000, 200);
    const afterTime = await readGame(page);
    check('コンボの得点が入っている', afterTime.score > beforeTime.score, { beforeTime, afterTime });
    await page.waitForSelector('#sheet-result:not([hidden])', { timeout: 5000 });
    const timeUp = await readGame(page);
    check('コンボのあと時間切れで終わる', timeUp.status === 'over', timeUp);
    check('コンボの得点は結果に残る', timeUp.score >= afterTime.score, { afterTime, timeUp });
    check('結果シートが開く', await resultOpen(page));
    await page.evaluate(() => window.__linezap.closeSheet());

    /* ---------------------------------------------------------------- */
    /* 7. 連打・ドラッグ中断・pointercancel のあとも操作できる           */
    /* ---------------------------------------------------------------- */
    step('連打しても固まらない');
    await startClassic(page);
    for (let i = 0; i < 8; i += 1) {
      await page.mouse.click(...Object.values(await tileCenter(page, i)));
      await page.waitForTimeout(35);
    }
    check('連打のあと busy が下りる', await settle(page, 6000, 250));
    check('連打のあともプレイ中', (await readGame(page)).status === 'playing');
    await page.evaluate(() => window.__linezap.state.selected = null);
    const tap = await tileCenter(page, 5);
    await page.mouse.click(tap.x, tap.y);
    await page.waitForTimeout(150);
    check('連打のあともタップが効く（1マス目が選べる）', await page.evaluate(() => document.querySelectorAll('#board .tile.is-picked').length === 1));
    await page.mouse.click(tap.x, tap.y);
    await page.waitForTimeout(120);

    step('ドラッグを pointercancel で中断してもタップが効く');
    const a = await tileCenter(page, 6);
    const b = await tileCenter(page, 7);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y + 20, { steps: 3 });
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
    await page.mouse.up();
    await settle(page, 4000, 150);
    check('中断しても busy は下りている', (await busy(page)) === false);
    check('中断してもドラッグ状態が残っていない', await page.evaluate(() => window.__linezap.state.drag === null));
    const c = await tileCenter(page, 9);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(150);
    check('中断のあともタップが効く', await page.evaluate(() => document.querySelectorAll('#board .tile.is-picked').length >= 1));
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(120);

    /* ---------------------------------------------------------------- */
    /* 8. busy が戻らなくなっても、見張り番が解放する                    */
    /* ---------------------------------------------------------------- */
    step('busy の取り残しを見張り番が解放する');
    await startClassic(page);
    await page.evaluate(() => {
      window.__linezap.state.busy = true;
      window.__linezap.state.busySince = performance.now() - 20000;
    });
    await page.waitForTimeout(800);
    check('見張り番が busy を解放する', (await busy(page)) === false);
    const free = await tileCenter(page, 2);
    await page.mouse.click(free.x, free.y);
    await page.waitForTimeout(150);
    check('解放後はタップが効く', await page.evaluate(() => document.querySelectorAll('#board .tile.is-picked').length === 1));
    await page.mouse.click(free.x, free.y);
    await page.waitForTimeout(120);

    /* ---------------------------------------------------------------- */
    /* 9. 設定シートを開いている間は時計が止まる（既存の動きの確認）      */
    /* ---------------------------------------------------------------- */
    step('設定を開いている間は時間が止まる');
    await startClassic(page);
    await page.evaluate(() => window.__linezap.setTurnLeft(6000));
    const beforeSheet = await readGame(page);
    await page.evaluate(() => window.__linezap.openSheet('settings'));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__linezap.closeSheet());
    const afterSheet = await readGame(page);
    check('設定中に時間が減らない', afterSheet.turnLeft > beforeSheet.turnLeft - 200, { beforeSheet, afterSheet });

    /* ---------------------------------------------------------------- */
    /* 10. 画面の後片付け（結果シートが残っていない）                    */
    /* ---------------------------------------------------------------- */
    check('最後に結果シートが残っていない', !(await resultOpen(page)));
    check('未処理の例外が無い', pageErrors.length === 0, pageErrors);
  } finally {
    const failed = checks.filter((item) => !item.ok).length;
    console.log(`\nLINEZAP Build 6 E2E — ${checks.length} checks, ${checks.length - failed} passed`);
    for (const item of checks) if (!item.ok) console.log(`  NG: ${item.name}`);
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

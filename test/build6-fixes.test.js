/**
 * LINEZAP — Build 6 の修正の検品（node --test）
 *
 * トモアキさんから届いた2件の報告に、ここで歯止めをかける。
 *
 *   1. ゲーム中にフリーズする
 *      ・入れ替えの busy は try/finally で必ず下ろす
 *      ・busy のまま固まったら見張り番が解放する
 *      ・時間切れのあと結果シートが開かないまま盤面で止まらない（endRun に try/finally）
 *      ・ドラッグは画面遷移・裏回り・時間切れで必ず捨てる
 *   2. 残り時間ギリギリでコンボが始まったら時間を止めて復活させる
 *      ・入れ替え・コンボ演出中は時計を進めない（core.canTickClock）
 *      ・ラインが消えた手は、演出中に時間切れになっていても優先して続行する
 *      ・コンボ不発のときは時間切れを覆さない
 *
 * 実際の画面の動きは tools/e2e-b6.mjs（Playwright / `npm run e2e`）が確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as core from '../src/core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(resolve(ROOT, relative), 'utf8');

const MAIN = read('src/main.js');
const CORE = read('src/core.js');
const HTML = read('index.html');
const CSS = read('styles.css');

/** あと1手（index 3 の 0 と index 4 の 1 を入れ替える）で1行消える4×4 */
function oneMoveBoard() {
  return [
    3, 2, 4, 0,
    1, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ].map((value) => core.tileWithValue(value));
}

function classicGame(overrides = {}) {
  const started = core.startGame({ mode: 'classic', size: 4, target: 10, rng: core.seededRng(11) });
  return { ...started, board: oneMoveBoard(), ...overrides };
}

/* ------------------------------------------------------------------ */
/* 2. ギリギリのコンボで時間を止めて復活させる                          */
/* ------------------------------------------------------------------ */

test('演出中（busy）・シート・裏回りでは時計を進めない', () => {
  assert.equal(core.canTickClock(), true);
  assert.equal(core.canTickClock({ busy: true }), false, '入れ替え・コンボ演出中は止める');
  assert.equal(core.canTickClock({ sheet: 'settings' }), false);
  assert.equal(core.canTickClock({ sheet: 'howto' }), false);
  assert.equal(core.canTickClock({ sheet: 'result' }), true, '結果表示中は裏で時間を進めてよい');
  assert.equal(core.canTickClock({ hidden: true }), false, 'アプリが裏に回っている間は止める');
});

test('刻みは上限つきで、0や壊れた値では進めない', () => {
  assert.equal(core.clockStep(100), 100);
  assert.equal(core.clockStep(0), 0);
  assert.equal(core.clockStep(-5), 0);
  assert.equal(core.clockStep(Number.NaN), 0);
  assert.equal(core.clockStep(99999), 1000, '復帰時にまとめて0秒にならない');
  assert.equal(core.clockStep(8000, 250), 250);
});

test('残り0.15秒でコンボが成立したら、演出後もタイマー満タンで続行する', () => {
  const game = classicGame({ turnLeft: 150 });
  // 演出中は時計が進まない（この間の delta は捨てる）
  assert.equal(core.canTickClock({ busy: true }), false);

  const result = core.swapTiles(game, 3, 4, core.seededRng(21));
  assert.ok(result.steps.length >= 1, '1行消える手になっていない');
  assert.equal(result.game.status, core.STATUS.playing, 'コンボで終わってはいけない');
  assert.equal(result.game.turnLeft, result.game.turnLimit, 'タイマーが満タンに戻る');
  assert.ok(result.game.score >= 100);

  // 演出が終わってから時計が進んでも、すぐには終わらない
  const ticked = core.advanceTime(result.game, 100);
  assert.equal(ticked.status, core.STATUS.playing);
  assert.equal(ticked.turnLeft, result.game.turnLimit - 100);
});

test('残り0.15秒でコンボ不発なら、時間切れはそのまま（0秒で続行しない）', () => {
  const game = classicGame({ turnLeft: 150 });
  const result = core.swapTiles(game, 0, 1, core.seededRng(22));
  assert.equal(result.steps.length, 0, '消えない入れ替えになっていない');
  assert.equal(result.game.turnLeft, 150, '消していないので時間は戻らない');

  const over = core.mergeMoveResult(
    { ...game, status: core.STATUS.over, turnLeft: 0, overReason: core.OVER_REASON.time },
    result.game,
    { cleared: result.steps.length > 0 },
  );
  assert.equal(over.status, core.STATUS.over, 'コンボ不発なら時間切れのまま');
  assert.equal(over.turnLeft, 0);
});

test('演出中に時間切れになっていても、コンボ成立なら終了を覆して続行する', () => {
  const game = classicGame({ turnLeft: 150 });
  const result = core.swapTiles(game, 3, 4, core.seededRng(23));
  const live = { ...game, status: core.STATUS.over, turnLeft: 0, overReason: core.OVER_REASON.time };

  const merged = core.mergeMoveResult(live, result.game, { cleared: result.steps.length > 0 });
  assert.equal(merged.status, core.STATUS.playing, 'コンボ成立を優先する');
  assert.equal(merged.turnLeft, game.turnLimit, 'タイマーが戻っている');

  // コンボ不発で時間切れなら、得点だけ取り込んで終わる
  const idle = core.swapTiles(game, 0, 1, core.seededRng(24));
  const kept = core.mergeMoveResult(live, idle.game, { cleared: idle.steps.length > 0 });
  assert.equal(kept.status, core.STATUS.over);
  assert.equal(kept.turnLeft, 0);
  assert.equal(kept.overReason, core.OVER_REASON.time);
});

test('タイムアタックはラインを消しても時間は戻らない（既存の仕様どおり）', () => {
  const started = core.startGame({ mode: 'time', size: 4, target: 10, timeLimit: 60, rng: core.seededRng(31) });
  const game = { ...started, board: oneMoveBoard(), timeLeft: 150 };
  const result = core.swapTiles(game, 3, 4, core.seededRng(32));
  assert.ok(result.steps.length >= 1);
  assert.equal(result.game.status, core.STATUS.playing);
  assert.equal(result.game.timeLeft, 150, '全体タイマーは戻さない');
  assert.ok(result.game.score >= 100, 'コンボの得点は入る');

  const over = core.advanceTime(result.game, 150);
  assert.equal(over.status, core.STATUS.over);
  assert.equal(over.overReason, core.OVER_REASON.time);
  assert.ok(over.score >= 100, '時間切れでもコンボの得点は残る');
});

/* ------------------------------------------------------------------ */
/* 1. フリーズしない作りになっているか（呼び出し側の型）                */
/* ------------------------------------------------------------------ */

test('入れ替えの busy は try/finally で必ず下ろす', () => {
  const body = MAIN.slice(MAIN.indexOf('async function doSwap'), MAIN.indexOf('/** 消えるラインを1段ずつ見せる（コンボ） */'));
  assert.ok(body.includes('setBusy(true)'), 'busy を立てていない');
  assert.ok(body.includes('try {'), 'try が無い');
  assert.ok(body.includes('} finally {'), 'finally が無い');
  assert.ok(body.includes('setBusy(false)'), 'finally で busy を下ろしていない');
  assert.ok(body.includes('catch (error)'), '例外を受け止めていない');
  // finally の中（catch のあと）で busy を下ろしている
  assert.ok(body.indexOf('} finally {') < body.indexOf('setBusy(false)'));
});

test('busy が戻らなくても見張り番が解放する', () => {
  assert.ok(MAIN.includes('const BUSY_LIMIT_MS = 6000;'));
  assert.ok(MAIN.includes('function watchdogTick'));
  assert.ok(MAIN.includes('function forceReleaseBusy'));
  assert.ok(MAIN.includes('function startWatchdog'));
  assert.ok(MAIN.includes('startWatchdog();'), '起動時に見張り番を始めていない');
  const tick = MAIN.slice(MAIN.indexOf('function watchdogTick'), MAIN.indexOf('function startWatchdog'));
  assert.ok(tick.includes('forceReleaseBusy'), '固まった busy を解放していない');
  assert.ok(tick.includes('openResultNow'), '結果シートの出し忘れを拾っていない');
});

test('タイマーは core の判定を使って busy 中に止まり、lastTick を進める', () => {
  const timer = MAIN.slice(MAIN.indexOf('function startTimer'), MAIN.indexOf('function stopTimer'));
  assert.ok(timer.includes('core.canTickClock({ busy: state.busy, sheet: state.sheet, hidden })'));
  assert.ok(timer.includes('core.clockStep(delta)'));
  assert.ok(timer.indexOf('state.lastTick = now') < timer.indexOf('core.canTickClock'), '止める前に lastTick を進めていない');
  assert.ok(timer.includes('catch (error)'), '時間の更新で転んでも刻みを止めない');
});

test('時間切れの終了処理は、音やDOMが失敗しても結果シートまで必ず行き着く', () => {
  const end = MAIN.slice(MAIN.indexOf('function endRun'), MAIN.indexOf('/* ------------------------------------------------------------------ */\n/* 止まらないための番人'));
  assert.ok(end.includes('} finally {'), 'finally が無い');
  assert.ok(end.includes('openResult()'), 'finally で結果シートを開いていない');
  assert.ok(end.indexOf('openResult()') > end.indexOf('} finally {'), 'finally の外で開いている');
  assert.ok(end.includes('try {\n      audio.over();'), '音の失敗を受け止めていない');
  assert.ok(end.includes('try {\n      haptics.over();'), 'バイブの失敗を受け止めていない');
  assert.ok(end.includes('state.endRunFor === game'), '二重に走らない作りになっていない');
  assert.ok(!MAIN.includes("setTimeout(() => openSheet('result'), 260)"), '古い（取り消せない）結果表示が残っている');
});

test('結果シートは「終わったゲーム」のときだけ開き、続行中なら閉じる', () => {
  const open = MAIN.slice(MAIN.indexOf('function openResult('), MAIN.indexOf('function openResultNow'));
  assert.ok(open.includes('live !== game'), '待つ間に始まった別のゲームの結果を開いてしまう');
  assert.ok(open.includes('core.STATUS.over'));
  const watchdog = MAIN.slice(MAIN.indexOf('function watchdogTick'), MAIN.indexOf('function startWatchdog'));
  assert.ok(watchdog.includes("state.sheet === 'result'"), '復活したのに結果シートが残る');
  assert.ok(MAIN.includes('function reviveRun'));
  assert.ok(MAIN.includes('core.mergeMoveResult(live, next, { cleared })'), 'コンボ優先の判定を通していない');
});

test('ドラッグは画面遷移・裏回り・時間切れで捨てる（残留させない）', () => {
  assert.ok(MAIN.includes('function cancelDrag'));
  assert.ok(MAIN.includes('cancelDrag();'));
  const visible = MAIN.slice(MAIN.indexOf("document.addEventListener('visibilitychange'"), MAIN.indexOf("window.addEventListener('pagehide'"));
  assert.ok(visible.includes('cancelDrag()'), '裏に回ったらドラッグを捨てていない');
  const end = MAIN.slice(MAIN.indexOf('function endRun'), MAIN.indexOf('function goHome'));
  assert.ok(end.includes('cancelDrag()'), '時間切れでドラッグを捨てていない');
  // ドラッグ直後の click は「時刻」で捨てる（次のタップを消さない）
  assert.ok(MAIN.includes('state.suppressClickUntil'));
  assert.ok(MAIN.includes('performance.now() < state.suppressClickUntil'));
  assert.ok(!MAIN.includes('state.suppressClick = true'));
});

test('入れ替えの結果は、どこで転んでも盤面とHUDに戻す', () => {
  const body = MAIN.slice(MAIN.indexOf('async function doSwap'), MAIN.indexOf('/** 消えるラインを1段ずつ見せる（コンボ） */'));
  const finallyPart = body.slice(body.indexOf('} finally {'));
  assert.ok(finallyPart.includes('paintBoard(state.game)'));
  assert.ok(finallyPart.includes('updateHud('));
  assert.ok(finallyPart.includes('afterMove(result)'));
  assert.ok(body.includes("core.swapTiles(live, a, b, Math.random)"));
});

/* ------------------------------------------------------------------ */
/* 盤面の計算が必ず終わる（無限ループ・詰まりの確認）                  */
/* ------------------------------------------------------------------ */

test('どんなに連続で入れ替えても計算は終わり、盤面も壊れない', () => {
  for (const size of [4, 5, 6]) {
    const target = core.baseTargetFor(size);
    let game = core.startGame({ mode: 'classic', size, target, rng: core.seededRng(size * 7) });
    const rng = core.seededRng(size * 13);
    const started = Date.now();
    for (let i = 0; i < 120; i += 1) {
      if (game.status !== core.STATUS.playing) {
        game = core.startGame({ mode: 'classic', size, target, rng });
      }
      const a = Math.floor(rng() * game.board.length);
      let b = Math.floor(rng() * game.board.length);
      if (a === b) b = (b + 1) % game.board.length;
      const result = core.swapTiles(game, a, b, rng);
      game = result.game;
      assert.equal(game.board.length, size * size, `${size}×${size} の盤面が壊れた`);
      for (const tile of game.board) {
        assert.ok(Number.isInteger(tile.digit) && tile.digit >= 0 && tile.digit <= 9, '数字が範囲外');
      }
      // 消え残りが無い（連鎖は全部処理されている）
      assert.equal(core.findClears(game.board, size, game.targets).cells.length, 0, '消せるラインが残っている');
    }
    assert.ok(Date.now() - started < 15000, `${size}×${size} の計算が遅すぎる`);
  }
});

test('手数0・終了後の入れ替えは何もしない（busy の取り残しを作らない）', () => {
  const game = classicGame({ moves: 0 });
  const result = core.swapTiles(game, 3, 4, core.seededRng(41));
  assert.equal(result.swap, null);
  assert.equal(result.game, game);

  const over = { ...classicGame(), status: core.STATUS.over };
  assert.equal(core.swapTiles(over, 0, 1, core.seededRng(42)).swap, null);
  // 同じマス・範囲外も安全
  assert.equal(core.swapTiles(classicGame(), 2, 2).swap, null);
  assert.equal(core.swapTiles(classicGame(), -1, 4).swap, null);
  assert.equal(core.swapTiles(classicGame(), 0, 99).swap, null);
});

/* ------------------------------------------------------------------ */
/* 画面の受け皿                                                        */
/* ------------------------------------------------------------------ */

test('結果シートとタイマーバーがあり、復活の合図を出せる', () => {
  assert.ok(HTML.includes('id="sheet-result"'));
  assert.ok(HTML.includes('id="btn-again"'));
  assert.ok(HTML.includes('id="btn-result-home"'));
  assert.ok(HTML.includes('id="turnbar"'));
  assert.ok(HTML.includes('id="turnbar-fill"'));
  assert.ok(CSS.includes('.turnbar.is-refilled'));
  assert.ok(MAIN.includes('is-refilled'));
  assert.ok(CSS.includes('@keyframes turnbar-refill'));
});

test('Build 7 の目印（ビルド番号と検証用の窓口）', () => {
  assert.equal(core.BUILD, 7);
  for (const hook of ['audio,', 'haptics,', 'setTimeLeft(', 'async swap(a, b)']) {
    assert.ok(MAIN.includes(hook), `検証用の窓口 ${hook} が無い`);
  }
  assert.ok(CORE.includes('export function canTickClock'));
  assert.ok(CORE.includes('export function clockStep'));
  assert.ok(CORE.includes('export function mergeMoveResult'));
});

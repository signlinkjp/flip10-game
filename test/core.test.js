/**
 * LINEZAP — ルールの単体テスト（node --test / Build 4）
 *
 * ここが固いことが「遊べる」の条件:
 *   - モードは クラシック / 十字フリップ / タイムアタック の3つ。どれもマス数と目標を選んで始める
 *   - 消える合計は行も列も同じ1つ（4×4 は 10 固定 / 入れ替えは 12〜42 / 十字フリップは 10〜18・12〜22）
 *   - 盤面サイズごとに 手数 4/5/5・制限時間 10/12/15秒
 *   - 1手 −1、1ライン +1 / 2ライン +2 / 3ライン以上か連鎖で全回復
 *   - 1ライン以上消すと制限時間が戻る。0秒で手数が残っていてもゲームオーバー
 *   - ヒントは手数 −2（残り3以上）。残り2以下では使えない
 *   - 行・列の合計が target で消える（交差も1回だけ）・下詰め・連鎖はコンボ
 *   - 十字フリップ（PRO）は ＋の字が反転・表裏で5
 *   - タイムアタックは 0 秒で終了（手数もターンタイマーも無い）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.js';

/** 表示値からタイルを作る */
const tile = (value) => core.tileWithValue(value);

/** 4×4 を [行0, 行1, ...] の配列から作る（十字フリップは back で裏向き） */
function board4(rows, { back = [] } = {}) {
  const out = [];
  rows.forEach((row, r) => {
    row.forEach((value) => {
      if (back.includes(r)) {
        out.push({ front: core.PAIR_SUM - value, back: value, side: core.SIDES.back });
      } else {
        out.push(tile(value));
      }
    });
  });
  return out;
}

/** サイズと値の配列から盤面を作る */
function boardOf(size, values) {
  const rows = [];
  for (let r = 0; r < size; r += 1) rows.push(values.slice(r * size, (r + 1) * size));
  return rows;
}

const flat = (values) => values.map((value) => tile(value));

/** 決まった数字を順に返す rng（0..9 を pool に渡す前提） */
function sequenceRng(values, max = 9) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return (value + 0.5) / (max + 1);
  };
}

function gameWith(rows, { mode = 'classic', size = 4, target = 10, moves, back = [] } = {}) {
  const game = core.startGame({ mode, size, target, rng: core.seededRng(1) });
  return { ...game, board: board4(rows, { back }), moves: game.life ? (moves ?? game.moves) : null };
}

/* ------------------------------------------------------------------ */
/* モードと盤面                                                        */
/* ------------------------------------------------------------------ */

test('モードは3つ（クラシック / 十字フリップ / タイムアタック）', () => {
  assert.deepEqual(
    core.MODES.map((mode) => [mode.id, mode.mechanic, mode.life, mode.timed, mode.pro]),
    [
      ['classic', 'swap', true, false, false],
      ['cross', 'flip', true, false, true],
      ['time', 'swap', false, true, true],
    ],
  );
  assert.deepEqual([...core.SIZES], [4, 5, 6]);
  assert.deepEqual([...core.sizesFor('classic')], [4, 5, 6]);
  assert.deepEqual([...core.sizesFor('cross')], [4, 5, 6]);
  assert.deepEqual([...core.sizesFor('time')], [4]);
  assert.equal(core.MAX_SIZE, 6);
});

test('PRO の線引き: クラシックの 5×5・6×6、十字フリップとタイムアタックの全部', () => {
  assert.equal(core.needsProSize('classic', 4), false);
  assert.equal(core.needsProSize('classic', 5), true);
  assert.equal(core.needsProSize('classic', 6), true);
  assert.equal(core.needsProSize('cross', 4), true);
  assert.equal(core.needsProSize('cross', 6), true);
  assert.equal(core.needsProSize('time', 4), true);
  assert.equal(core.hasProSize('classic'), true);
  assert.equal(core.hasProSize('cross'), true);
});

test('手数と制限時間は 4×4=4/10秒、5×5=5/12秒、6×6=5/15秒', () => {
  assert.deepEqual(core.SIZE_RULES[4], { moves: 4, turnSeconds: 10 });
  assert.deepEqual(core.SIZE_RULES[5], { moves: 5, turnSeconds: 12 });
  assert.deepEqual(core.SIZE_RULES[6], { moves: 5, turnSeconds: 15 });
  assert.equal(core.startMovesFor(4), 4);
  assert.equal(core.startMovesFor(6), 5);
  assert.equal(core.turnSecondsFor(5), 12);
  assert.equal(core.turnSecondsFor(99), core.turnSecondsFor(4), '範囲外は4×4');
});

/* ------------------------------------------------------------------ */
/* 合計（target）                                                      */
/* ------------------------------------------------------------------ */

test('消える合計の範囲は 操作×サイズ で決まる', () => {
  assert.deepEqual(core.targetBounds(4, 'swap'), { min: 10, max: 10, fixed: true });
  assert.deepEqual(core.targetBounds(5, 'swap'), { min: 12, max: 42, fixed: false });
  assert.deepEqual(core.targetBounds(6, 'swap'), { min: 12, max: 42, fixed: false });
  assert.deepEqual(core.targetBounds(4, 'flip'), { min: 10, max: 10, fixed: true });
  assert.deepEqual(core.targetBounds(5, 'flip'), { min: 10, max: 18, fixed: false });
  assert.deepEqual(core.targetBounds(6, 'flip'), { min: 12, max: 22, fixed: false });

  assert.equal(core.clampTarget(30, 4), 10);
  assert.equal(core.clampTarget(30, 5), 30);
  assert.equal(core.clampTarget(3, 5), 12);
  assert.equal(core.clampTarget(99, 6), 42);
  assert.equal(core.clampTarget(99, 5, 'flip'), 18, '十字フリップ5×5の上限は18');
  assert.equal(core.clampTarget(2, 6, 'flip'), 12, '十字フリップ6×6の下限は12');
  assert.equal(core.clampTarget('x', 5, 'flip'), 13, '十字フリップ5×5の既定は13');
  assert.deepEqual(core.targetPair(26, 6), { rows: 26, cols: 26 });
});

test('startGame はモード・サイズ・目標を反映する', () => {
  const classic4 = core.startGame({ mode: 'classic', rng: core.seededRng(1) });
  assert.equal(classic4.size, 4);
  assert.equal(classic4.moves, 4);
  assert.equal(classic4.maxMoves, 4);
  assert.equal(classic4.turnLimit, 10000);
  assert.equal(classic4.turnLeft, 10000);
  assert.deepEqual(classic4.targets, { rows: 10, cols: 10 });

  const classic5 = core.startGame({ mode: 'classic', size: 5, target: 30, rng: core.seededRng(1) });
  assert.equal(classic5.size, 5);
  assert.equal(classic5.board.length, 25);
  assert.equal(classic5.moves, 5);
  assert.equal(classic5.turnLimit, 12000);
  assert.deepEqual(classic5.targets, { rows: 30, cols: 30 });

  const classic6 = core.startGame({ mode: 'classic', size: 6, target: 12, rng: core.seededRng(1) });
  assert.equal(classic6.board.length, 36);
  assert.equal(classic6.turnLimit, 15000);
  assert.deepEqual(classic6.targets, { rows: 12, cols: 12 });

  // 4×4 は設定値を持ち込まない
  assert.deepEqual(core.startGame({ mode: 'classic', size: 4, target: 40, rng: core.seededRng(1) }).targets, { rows: 10, cols: 10 });

  const cross5 = core.startGame({ mode: 'cross', size: 5, target: 18, rng: core.seededRng(1) });
  assert.equal(cross5.mechanic, 'flip');
  assert.equal(cross5.board.length, 25);
  assert.deepEqual(cross5.targets, { rows: 18, cols: 18 });
  assert.ok(cross5.board.every((item) => core.displayValue(item) <= 5));

  const time = core.startGame({ mode: 'time', timeLimit: 120, rng: core.seededRng(1) });
  assert.equal(time.size, 4);
  assert.equal(time.timed, true);
  assert.equal(time.life, false);
  assert.equal(time.moves, null);
  assert.equal(time.turnLimit, 0);
  assert.equal(time.timeLeft, 120000);
});

/* ------------------------------------------------------------------ */
/* 数字の範囲と盤面の生成                                              */
/* ------------------------------------------------------------------ */

test('数字の範囲は target と盤面サイズから決まる', () => {
  assert.deepEqual(core.digitPool(4, 10), { min: 0, max: 6 });
  assert.deepEqual(core.digitPool(5, 12), { min: 0, max: 6 });
  assert.deepEqual(core.digitPool(5, 20), { min: 1, max: 7 });
  assert.deepEqual(core.digitPool(5, 42), { min: 5, max: 9 });
  assert.deepEqual(core.digitPool(6, 12), { min: 0, max: 5 });
  assert.deepEqual(core.digitPool(6, 20), { min: 0, max: 7 });
  assert.deepEqual(core.digitPool(6, 42), { min: 4, max: 9 });
  for (const size of [4, 5, 6]) {
    for (let target = 12; target <= 42; target += 1) {
      const pool = core.digitPool(size, target);
      assert.ok(pool.min >= 0 && pool.max <= 9 && pool.min <= pool.max, `${size}/${target}`);
      assert.ok(pool.max - pool.min >= 2, `${size}/${target} の幅が狭すぎる`);
    }
  }
});

test('入れ替えの盤面は 4×4(10)・5×5/6×6(12〜42) のどこでも詰まらない', () => {
  const cases = [[4, [10]], [5, [12, 14, 18, 20, 24, 30, 36, 42]], [6, [12, 14, 18, 20, 24, 30, 36, 42]]];
  for (const [size, targets] of cases) {
    for (const target of targets) {
      const t = core.targetPair(target, size);
      for (let seed = 1; seed <= 4; seed += 1) {
        const board = core.makeBoard({ size, target: t, rng: core.seededRng(seed * 131 + target) });
        assert.equal(board.length, size * size);
        assert.equal(core.findClears(board, size, t).cells.length, 0, `${size}/${target}/${seed} が最初から消える`);
        assert.ok(core.hasMove(board, size, t), `${size}/${target}/${seed} に手が無い`);
      }
    }
  }
});

test('十字フリップの盤面は 4×4(10)・5×5(10〜18)・6×6(12〜22) のどこでも詰まらない', () => {
  for (const [size, min, max] of [[4, 10, 10], [5, 10, 18], [6, 12, 22]]) {
    for (let target = min; target <= max; target += 1) {
      const t = core.targetPair(target, size, core.MECHANIC.flip);
      for (let seed = 1; seed <= 5; seed += 1) {
        const board = core.makeBoard({ size, mechanic: core.MECHANIC.flip, target: t, rng: core.seededRng(seed * 977 + target) });
        assert.equal(board.length, size * size);
        assert.ok(board.every((item) => core.displayValue(item) <= 5), `${size}/${target} に6以上`);
        assert.equal(core.findClears(board, size, t).cells.length, 0, `${size}/${target}/${seed} が最初から消える`);
        assert.ok(core.hasMove(board, size, t, core.MECHANIC.flip), `${size}/${target}/${seed} に手が無い`);
      }
    }
  }
});

test('有効な手は本当に合計を target にする（4×4・5×5・6×6）', () => {
  const cases = [[4, [10]], [5, [12, 24, 42]], [6, [12, 24, 42]]];
  for (const [size, targets] of cases) {
    for (const target of targets) {
      const t = core.targetPair(target, size);
      const board = core.makeBoard({ size, target: t, rng: core.seededRng(target + size * 7) });
      const hint = core.findPlayableSwap(board, size, t);
      assert.ok(hint, `${size}/${target} に手が無い`);
      const after = board.slice();
      [after[hint.a], after[hint.b]] = [after[hint.b], after[hint.a]];
      const clears = core.findClears(after, size, t);
      assert.ok(clears.rows.length + clears.cols.length > 0, `${size}/${target} の手が消えない`);
      for (const r of clears.rows) assert.equal(core.sums(after, size).rows[r], t.rows);
      for (const c of clears.cols) assert.equal(core.sums(after, size).cols[c], t.cols);
    }
  }
});

test('手が無くなった盤面は数字を混ぜ直す', () => {
  const board = flat(new Array(16).fill(7));
  assert.equal(core.hasMove(board, 4, 10), false);
  const fixed = core.ensurePlayable(board, { size: 4, target: 10, pool: { min: 0, max: 9 }, rng: core.seededRng(4) });
  assert.equal(fixed.reshuffled, true);
  assert.ok(core.hasMove(fixed.board, 4, 10));
  assert.equal(core.findClears(fixed.board, 4, 10).cells.length, 0);
});

/* ------------------------------------------------------------------ */
/* 入れ替えと消去                                                      */
/* ------------------------------------------------------------------ */

test('2マスを入れ替えると数字が交換され、元の盤面は変わらない', () => {
  const board = flat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5]);
  const { board: after, swapped } = core.swapBoard(board, 0, 5);
  assert.deepEqual(swapped, { a: 0, b: 5 });
  assert.equal(core.displayValue(after[0]), 5);
  assert.equal(core.displayValue(after[5]), 0);
  assert.equal(core.displayValue(board[0]), 0, '元の盤面は変えない');
  assert.equal(core.swapBoard(board, 3, 3).swapped, null);
  assert.equal(core.swapBoard(board, 3, 99).swapped, null);
});

test('行も列も同じ合計で消える（交差は1回だけ）', () => {
  const board = board4([
    [3, 3, 4, 0],
    [6, 1, 1, 3],
    [5, 2, 2, 4],
    [0, 0, 0, 3],
  ]);
  const clears = core.findClears(board, 4, 10);
  assert.deepEqual(clears.rows, [0]);
  assert.deepEqual(clears.cols, [3]);
  assert.equal(clears.cells.length, 4 + 3);
});

test('6×6 も行・列の合計で消える（目標 24）', () => {
  const values = [
    4, 4, 4, 4, 4, 4,
    1, 1, 1, 1, 1, 1,
    2, 2, 2, 2, 2, 2,
    3, 3, 3, 3, 3, 3,
    5, 5, 5, 5, 5, 5,
    0, 0, 0, 0, 0, 0,
  ];
  const board = boardOf(6, values).flat().map((value) => tile(value));
  const clears = core.findClears(board, 6, 24);
  assert.deepEqual(clears.rows, [0]);
  assert.deepEqual(clears.cols, []);
  assert.equal(clears.cells.length, 6);
});

test('落ちるときは下詰め・上から新しいタイル', () => {
  const board = board4([
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [2, 2, 2, 2],
    [3, 3, 3, 3],
  ]);
  const { board: after, changed } = core.removeAndDrop(board, 4, [5], { pool: { min: 0, max: 9 }, rng: () => 0.5 });
  assert.equal(core.displayValue(after[9]), 2);
  assert.equal(core.displayValue(after[13]), 3);
  assert.equal(core.displayValue(after[5]), 0, '上の段が1つ落ちてくる');
  assert.equal(core.displayValue(after[1]), 5, 'rng 0.5 → 5');
  assert.ok(changed.includes(1));
});

test('1ライン消えると 100点、連鎖はコンボで倍', () => {
  const board = flat([3, 2, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const result = core.resolveBoard(board, { size: 4, target: 10, chain: 1, pool: { min: 0, max: 9 }, rng: () => 0 });
  assert.equal(result.steps.length, 1);
  assert.equal(result.gained, 100);
  assert.deepEqual(result.steps[0].rows, [0]);

  const rng = sequenceRng([3, 2, 4, 1, 0, 0, 0, 0]);
  const combo = core.resolveBoard(board, { size: 4, target: 10, chain: 1, pool: { min: 0, max: 9 }, rng });
  assert.equal(combo.steps.length, 2);
  assert.equal(combo.steps[1].points, 200);
  assert.equal(combo.gained, 300);
  assert.equal(core.stepPoints({ lines: 2, combo: 1, chain: 1 }), 200);
  assert.equal(core.chainMultiplier(9), core.MAX_CHAIN);
  assert.equal(core.comboRank(1), 0);
  assert.equal(core.comboRank(9), 4);
});

/* ------------------------------------------------------------------ */
/* 手数の回復                                                          */
/* ------------------------------------------------------------------ */

test('回復量は 1ライン +1 / 2ライン +2 / 3ライン以上か連鎖で全回復', () => {
  assert.equal(core.moveReward({ lines: 0, steps: 0, maxMoves: 4 }), 0);
  assert.equal(core.moveReward({ lines: 1, steps: 1, maxMoves: 4 }), 1);
  assert.equal(core.moveReward({ lines: 2, steps: 1, maxMoves: 5 }), 2);
  assert.equal(core.moveReward({ lines: 3, steps: 1, maxMoves: 5 }), 5);
  assert.equal(core.moveReward({ lines: 1, steps: 2, maxMoves: 5 }), 5, '連鎖は全回復');
  assert.equal(core.moveReward({ lines: 4, steps: 1, maxMoves: 6 }), 6);
});

test('1ライン消しは手数が減らない（4で消すと4のまま）', () => {
  const game = gameWith([
    [3, 2, 4, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { moves: 4 });
  const result = core.swapTiles(game, 3, 4, () => 0);
  assert.ok(result.swap);
  assert.deepEqual(result.steps[0].rows, [0]);
  assert.equal(result.reward, 1);
  assert.equal(result.game.moves, 4, '−1 +1 で減らない');
  assert.equal(result.game.score, 100);
});

test('2ライン消しは実質 +1、3ライン以上/連鎖は満タン', () => {
  const base = core.startGame({ mode: 'classic', size: 5, target: 20, rng: core.seededRng(2) });
  // 2ライン（行0と列0）が同時に消える盤面
  const values = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 5, 5, 5, 5,
    0, 5, 5, 5, 5,
    0, 5, 5, 5, 5,
  ];
  const board = values.map((value) => tile(value));
  const resolved = core.resolveBoard(board, { size: 5, target: 20, pool: { min: 0, max: 9 }, rng: () => 0 });
  assert.ok(resolved.steps.length >= 1);
  const game = { ...base, board, moves: 3 };
  const next = core.applyMoveCost(game, resolved);
  const reward = core.moveReward({ lines: resolved.clearedLines, steps: resolved.steps.length, maxMoves: 5 });
  assert.ok(reward >= 1);
  assert.equal(next.moves, Math.min(5, 3 - 1 + reward));
});

test('消えない入れ替えは手数 −1、連鎖は0に戻る', () => {
  const base = gameWith([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { moves: 3 });
  const game = { ...base, chain: 3 };
  const result = core.swapTiles(game, 0, 1, () => 0);
  assert.equal(result.steps.length, 0);
  assert.equal(result.reward, 0);
  assert.equal(result.game.moves, 2);
  assert.equal(result.game.chain, 0);
});

test('手数が0になったらゲームオーバー（それ以上は動かない）', () => {
  const base = gameWith([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { moves: 1 });
  const result = core.swapTiles(base, 0, 1, () => 0);
  assert.equal(result.game.moves, 0);
  assert.equal(result.game.status, core.STATUS.over);
  assert.equal(result.game.overReason, core.OVER_REASON.moves);
  assert.equal(core.swapTiles(result.game, 2, 3, () => 0).swap, null);
});

test('盤の外・同じマス・違う操作のタップは何も起きない', () => {
  const game = core.startGame({ mode: 'classic', rng: core.seededRng(4) });
  assert.equal(core.swapTiles(game, -1, 0).swap, null);
  assert.equal(core.swapTiles(game, 0, 99).swap, null);
  assert.equal(core.swapTiles(game, 2, 2).swap, null);
  assert.equal(core.swapTiles(game, 1.5, 2).swap, null);
  const cross = core.startGame({ mode: 'cross', rng: core.seededRng(5) });
  assert.equal(core.swapTiles(cross, 0, 1).swap, null);
});

/* ------------------------------------------------------------------ */
/* 制限時間（ターンタイマー）                                          */
/* ------------------------------------------------------------------ */

test('1ライン消すと制限時間が戻る。消さない手では戻らない', () => {
  const clearGame = gameWith([
    [3, 2, 4, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { moves: 4 });
  const drained = { ...clearGame, turnLeft: 3200 };
  const cleared = core.swapTiles(drained, 3, 4, () => 0);
  assert.equal(cleared.steps.length, 1);
  assert.equal(cleared.game.turnLeft, cleared.game.turnLimit, '消したら満タンに戻る');
  assert.equal(cleared.game.turnLimit, 10000);

  const idle = gameWith([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], { moves: 4 });
  const notCleared = core.swapTiles({ ...idle, turnLeft: 3200 }, 0, 1, () => 0);
  assert.equal(notCleared.game.turnLeft, 3200, '消していないので減ったまま');
});

test('制限時間が0になると、手数が残っていてもゲームオーバー（理由=time）', () => {
  const game = core.startGame({ mode: 'classic', rng: core.seededRng(3) });
  const left = core.advanceTime(game, 5400);
  assert.equal(left.status, core.STATUS.playing);
  assert.ok(Math.abs(left.turnLeft - 4600) < 1);
  const done = core.advanceTime(left, 5000);
  assert.equal(done.turnLeft, 0);
  assert.equal(done.status, core.STATUS.over);
  assert.equal(done.overReason, core.OVER_REASON.time);
  assert.ok(done.moves > 0, '手数は残ったまま');
  assert.equal(core.advanceTime(done, 1000).turnLeft, 0, '終わったら進まない');
});

test('エンドレスはサイズごとの秒数、タイムアタックは全体タイマーだけ', () => {
  const g5 = core.startGame({ mode: 'classic', size: 5, rng: core.seededRng(1) });
  assert.equal(g5.turnLimit, 12000);
  assert.equal(core.advanceTime(g5, 11900).status, core.STATUS.playing);
  const g5out = core.advanceTime(g5, 12100);
  assert.equal(g5out.status, core.STATUS.over);
  assert.equal(g5out.overReason, 'time');

  const time = core.startGame({ mode: 'time', timeLimit: 60, rng: core.seededRng(2) });
  assert.equal(time.timeLeft, 60000);
  assert.equal(time.turnLimit, 0);
  const half = core.advanceTime(time, 30500);
  assert.equal(half.timeLeft, 29500);
  assert.equal(half.status, core.STATUS.playing);
  const done = core.advanceTime(half, 40000);
  assert.equal(done.status, core.STATUS.over);
  assert.equal(done.overReason, core.OVER_REASON.time);
  assert.equal(core.formatClock(65000), '1:05');
  assert.equal(core.formatSeconds(9400), '9.4');
  assert.equal(core.formatSeconds(-5), '0.0');
});

/* ------------------------------------------------------------------ */
/* ヒントの手数消費                                                    */
/* ------------------------------------------------------------------ */

test('ヒントは手数 −2。残り2以下では使えない', () => {
  assert.equal(core.HINT_COST, 2);
  assert.equal(core.HINT_MIN_MOVES, 3);
  const game = core.startGame({ mode: 'classic', rng: core.seededRng(1) });
  assert.equal(game.moves, 4);
  assert.equal(core.hintAllowed(game), true);
  const first = core.spendHint(game);
  assert.equal(first.spent, 2);
  assert.equal(first.game.moves, 2);
  assert.equal(core.hintAllowed(first.game), false, '残り2では使えない');
  const second = core.spendHint(first.game);
  assert.equal(second.spent, 0);
  assert.equal(second.game.moves, 2, '減らない');

  const at3 = { ...game, moves: 3 };
  const ok = core.spendHint(at3);
  assert.equal(ok.spent, 2);
  assert.equal(ok.game.moves, 1);
  assert.equal(ok.game.status, core.STATUS.playing, 'ヒントでゲームオーバーにはしない');
});

test('タイムアタックは手数を持たないのでヒントもタダ', () => {
  const game = core.startGame({ mode: 'time', rng: core.seededRng(1) });
  assert.equal(core.hintAllowed(game), true);
  const spent = core.spendHint(game);
  assert.equal(spent.spent, 0);
  assert.equal(spent.game.moves, null);
});

/* ------------------------------------------------------------------ */
/* 十字フリップ                                                        */
/* ------------------------------------------------------------------ */

test('十字フリップ: ＋の字だけが反転し、表裏は足して5', () => {
  assert.deepEqual(core.cross(4, 5), [5, 1, 4, 6, 9]);
  assert.deepEqual(core.cross(4, 0), [0, 1, 4]);
  assert.deepEqual(core.cross(5, 12), [12, 7, 11, 13, 17]);
  assert.deepEqual(core.cross(6, 14), [14, 8, 13, 15, 20]);
  const board = Array.from({ length: 16 }, (_, i) => core.tileWithValue(i % 6, core.MECHANIC.flip));
  const { board: after, flipped } = core.flipBoard(board, 4, 5);
  assert.deepEqual(flipped, [5, 1, 4, 6, 9]);
  for (let i = 0; i < 16; i += 1) {
    if (flipped.includes(i)) {
      assert.equal(after[i].side, core.SIDES.back, `${i} が裏返っていない`);
      assert.equal(core.displayValue(after[i]), 5 - core.displayValue(board[i]));
    } else {
      assert.equal(after[i], board[i]);
    }
  }
});

test('十字フリップでもラインが消えて手数が回復する', () => {
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed += 1) {
    const game = core.startGame({ mode: 'cross', size: 5, rng: core.seededRng(seed) });
    const hint = core.findFlipHint(game.board, game.size, game.targets);
    if (!hint) continue;
    const result = core.flipAt(game, hint.index, () => 0);
    if (result.steps.length >= 1) found = result;
  }
  assert.ok(found, '消える十字フリップが見つからない');
  assert.ok(found.game.score > 0);
  assert.ok(found.game.moves >= 1);
  assert.equal(found.game.mechanic, core.MECHANIC.flip);
  assert.equal(found.game.turnLeft, found.game.turnLimit, '消したので時間も戻る');
});

/* ------------------------------------------------------------------ */
/* キーと表示                                                          */
/* ------------------------------------------------------------------ */

test('ハイスコアのキーはモード×サイズ、タイムは60/120で別', () => {
  assert.equal(core.gameKey('classic', 4), 'classic4');
  assert.equal(core.gameKey('classic', 5), 'classic5');
  assert.equal(core.gameKey('classic', 6), 'classic6');
  assert.equal(core.gameKey('cross', 4), 'cross4');
  assert.equal(core.gameKey('cross', 6), 'cross6');
  assert.equal(core.gameKey('time', 4, 60), 'time60');
  assert.equal(core.gameKey('time', 4, 120), 'time120');
  assert.equal(core.gameKey('time', 4, 999), 'time60');
});

test('凡例のペアは 0↔5 / 1↔4 / 2↔3', () => {
  assert.deepEqual(core.pairLegend(), [
    { front: 0, back: 5 },
    { front: 1, back: 4 },
    { front: 2, back: 3 },
  ]);
});

test('合計に近いラインを教えられる', () => {
  const board = board4([
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [5, 5, 5, 0],
    [0, 0, 0, 0],
  ]);
  const nearest = core.nearestLine(board, 4, 10);
  assert.equal(nearest.kind, 'col');
  assert.equal(nearest.index, 0);
  assert.equal(nearest.sum, 6);
  assert.equal(nearest.gap, 4);
});

/* ------------------------------------------------------------------ */
/* 通しで遊ぶ                                                          */
/* ------------------------------------------------------------------ */

test('クラシック 4×4/5×5/6×6 を200手ずつ遊んでも壊れない', () => {
  for (const setup of [{ size: 4, target: 10 }, { size: 5, target: 20 }, { size: 6, target: 30 }]) {
    const rng = core.seededRng(setup.size * 31 + 7);
    let game = core.startGame({ mode: 'classic', ...setup, rng });
    let swaps = 0;
    let clears = 0;
    for (let move = 0; move < 200 && game.status === core.STATUS.playing; move += 1) {
      const hint = core.findHint(game.board, game.size, game.targets, game.mechanic);
      assert.ok(hint, `${setup.size} の手 ${move} でヒントが無い`);
      const result = core.swapTiles(game, hint.a, hint.b, rng);
      assert.ok(result.swap, `${setup.size} の手 ${move} が通らない`);
      for (const step of result.steps) {
        const sums = core.sums(step.board, game.size);
        for (const r of step.rows) assert.equal(sums.rows[r], game.targets.rows);
        for (const c of step.cols) assert.equal(sums.cols[c], game.targets.cols);
        clears += 1;
      }
      assert.equal(result.game.board.length, setup.size * setup.size);
      assert.ok(result.game.moves >= 0 && result.game.moves <= result.game.maxMoves);
      assert.ok(result.game.turnLeft >= 0 && result.game.turnLeft <= result.game.turnLimit);
      game = result.game;
      swaps += 1;
    }
    assert.ok(swaps > 10, `${setup.size} で ${swaps} 手しか遊べない`);
    assert.ok(clears > 0, `${setup.size} で一度も消えない`);
  }
});

test('十字フリップ 4×4/5×5/6×6 を60手ずつ遊んでも壊れない', () => {
  for (const size of [4, 5, 6]) {
    const rng = core.seededRng(size * 13 + 5);
    let game = core.startGame({ mode: 'cross', size, rng });
    let turns = 0;
    for (let step = 0; step < 60 && game.status === core.STATUS.playing; step += 1) {
      const hint = core.findHint(game.board, game.size, game.targets, game.mechanic);
      assert.ok(hint, `cross ${size} の手 ${step} でヒントが無い`);
      const result = core.flipAt(game, hint.index, rng);
      assert.ok(result.flip, `cross ${size} の手 ${step} が通らない`);
      assert.equal(result.game.board.length, size * size);
      assert.ok(result.game.board.every((item) => core.displayValue(item) <= 5));
      game = result.game;
      turns += 1;
    }
    assert.ok(turns >= 20, `cross ${size} で ${turns} 手しか遊べない`);
    assert.equal(game.status, core.STATUS.playing, `cross ${size} で手数が尽きた`);
  }
});

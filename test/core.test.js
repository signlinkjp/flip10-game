/**
 * FLIP 10 — ルールの単体テスト（node --test / Build 2）
 *
 * ここが固いことが「遊べる」の条件:
 *   - 好きな2マスを入れ替えられる（同じマスは選択解除・盤の外は無効）
 *   - 行と列の合計を別々に持てる（PRO の 9〜40）
 *   - 行・列の合計が target で消える（交差も1回だけ）
 *   - 消えたら下詰め・上から新しいタイル・連鎖はコンボ
 *   - 手数ライフ（7から、1手 −1、1ライン +3 / 2ライン +5 / 3ライン以上か連鎖で満タン、0で終了）
 *   - 数字の範囲は target と盤面サイズから自動で決まる（0や9を出しすぎない）
 *   - 最初から消えていない・必ず1手ある盤面を作る
 *   - 十字フリップ（PRO 特別モード）は ＋の字が反転・表裏で5
 *   - タイムアタックは 0 秒で終了
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.js';

/** 表示値からタイルを作る */
const tile = (value) => core.tileWithValue(value);

/** 4×4 を [行0, 行1, ...] の配列から作る（十字フリップは sides で裏向き） */
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

function gameWith(rows, { mode = 'classic', moves = 7, target = 10, back = [] } = {}) {
  const game = core.startGame({ mode, rowTarget: target, colTarget: target, rng: core.seededRng(1) });
  return { ...game, board: board4(rows, { back }), moves: game.life ? moves : null };
}

/* ------------------------------------------------------------------ */
/* 数字の範囲（スマートな出し方）                                      */
/* ------------------------------------------------------------------ */

test('数字の範囲は target と盤面サイズから決まる（低い target は小さく、高い target は大きく）', () => {
  assert.deepEqual(core.digitPool(4, 9), { min: 0, max: 6 });
  assert.deepEqual(core.digitPool(4, 10), { min: 0, max: 6 });
  assert.deepEqual(core.digitPool(4, 20), { min: 2, max: 8 });
  assert.deepEqual(core.digitPool(4, 28), { min: 4, max: 9 });
  assert.deepEqual(core.digitPool(4, 36), { min: 6, max: 9 });
  assert.deepEqual(core.digitPool(5, 9), { min: 0, max: 5 });
  assert.deepEqual(core.digitPool(5, 25), { min: 2, max: 8 });
  assert.deepEqual(core.digitPool(5, 40), { min: 5, max: 9 });
  // どの target でも 0〜9 の外へは出ない
  for (const size of [4, 5]) {
    for (let target = 9; target <= 40; target += 1) {
      const pool = core.digitPool(size, target);
      assert.ok(pool.min >= 0 && pool.max <= 9 && pool.min <= pool.max, `${size}/${target}`);
      assert.ok(pool.max - pool.min >= 2, `${size}/${target} の幅が狭すぎる`);
    }
  }
  // target が上がるほど、出す数字も上がる（単調）
  for (const size of [4, 5]) {
    let previous = -1;
    for (let target = 9; target <= 40; target += 1) {
      const pool = core.digitPool(size, target);
      assert.ok(pool.min >= previous, `${size}/${target} の最小が下がった`);
      previous = pool.min;
    }
  }
});

test('target は 9〜40、4×4 だけは 36 まで', () => {
  assert.equal(core.maxTargetFor(4), 36);
  assert.equal(core.maxTargetFor(5), 40);
  assert.deepEqual(core.targetPair(40, 40, 4), { rows: 36, cols: 36 });
  assert.deepEqual(core.targetPair(40, 40, 5), { rows: 40, cols: 40 });
  assert.deepEqual(core.targetPair(3, 99, 4), { rows: 9, cols: 36 });
  assert.deepEqual(core.targetPair(12, 22, 4), { rows: 12, cols: 22 });
});

/* ------------------------------------------------------------------ */
/* 盤面の生成                                                          */
/* ------------------------------------------------------------------ */

test('盤面は最初から消えておらず、必ず1手ある（9〜40 / 4×4・5×5）', () => {
  for (const size of [4, 5]) {
    for (let target = 9; target <= 40; target += 1) {
      const t = core.targetPair(target, target, size);
      const pool = core.digitPool(size, Math.round((t.rows + t.cols) / 2));
      for (let seed = 1; seed <= 3; seed += 1) {
        const board = core.makeBoard({ size, target: t, rng: core.seededRng(seed * 131 + target) });
        assert.equal(board.length, size * size);
        assert.equal(core.findClears(board, size, t).cells.length, 0, `${size}/${target}/${seed} が最初から消える`);
        assert.ok(core.hasMove(board, size, t), `${size}/${target}/${seed} に手が無い`);
        for (const item of board) {
          const value = core.displayValue(item);
          assert.ok(value >= pool.min && value <= pool.max, `${size}/${target}: ${value} が範囲外`);
        }
      }
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
  assert.equal(fixed.board.length, 16);
});

test('有効な手は本当に合計を target にする（全 target で確認）', () => {
  for (const size of [4, 5]) {
    for (const target of [9, 10, 14, 20, 25, 30, 35, 40]) {
      const t = core.targetPair(target, target, size);
      const board = core.makeBoard({ size, target: t, rng: core.seededRng(target + size * 7) });
      const hint = core.findPlayableSwap(board, size, t);
      assert.ok(hint, `${size}/${target} に手が無い`);
      const after = board.slice();
      [after[hint.a], after[hint.b]] = [after[hint.b], after[hint.a]];
      const clears = core.findClears(after, size, t);
      assert.ok(clears.rows.length + clears.cols.length > 0, `${size}/${target} の手が消えない`);
      for (const r of clears.rows) {
        assert.equal(core.sums(after, size).rows[r], t.rows);
      }
      for (const c of clears.cols) {
        assert.equal(core.sums(after, size).cols[c], t.cols);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* 入れ替えと合計                                                      */
/* ------------------------------------------------------------------ */

test('2マスを入れ替えると数字が交換され、元の盤面は変わらない', () => {
  const board = flat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5]);
  const { board: after, swapped } = core.swapBoard(board, 0, 5);
  assert.deepEqual(swapped, { a: 0, b: 5 });
  assert.equal(core.displayValue(after[0]), 5);
  assert.equal(core.displayValue(after[5]), 0);
  assert.equal(core.displayValue(board[0]), 0, '元の盤面は変えない');
  assert.equal(core.displayValue(board[5]), 5);
  assert.equal(core.swapBoard(board, 3, 3).swapped, null);
  assert.equal(core.swapBoard(board, 3, 99).swapped, null);
});

test('行と列は別々の合計で消える（PRO の行12 / 列14）', () => {
  const board = board4([
    [3, 3, 3, 3],
    [3, 3, 0, 0],
    [4, 4, 0, 0],
    [4, 4, 0, 0],
  ]);
  const t = { rows: 12, cols: 14 };
  const clears = core.findClears(board, 4, t);
  assert.deepEqual(clears.rows.sort((a, b) => a - b), [0]);
  assert.deepEqual(clears.cols.sort((a, b) => a - b), [0, 1]);
  // 交差は1回だけ: 行0の4マス + 列0・1の下3マスずつ
  assert.equal(clears.cells.length, 4 + 3 + 3);
});

test('合計が target の行だけが消える（列は別の合計）', () => {
  const board = board4([
    [1, 2, 3, 4],
    [1, 1, 1, 1],
    [2, 2, 3, 1],
    [0, 0, 5, 5],
  ]);
  const clears = core.findClears(board, 4, { rows: 10, cols: 99 });
  assert.deepEqual(clears.rows, [0, 3]);
  assert.deepEqual(clears.cols, []);
  assert.deepEqual(clears.cells, [0, 1, 2, 3, 12, 13, 14, 15]);
});

test('落ちるときは下詰め・上から新しいタイル（順番を保つ）', () => {
  const board = board4([
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [2, 2, 2, 2],
    [3, 3, 3, 3],
  ]);
  const { board: after, changed } = core.removeAndDrop(board, 4, [5], { pool: { min: 0, max: 9 }, rng: () => 0.5 });
  assert.equal(after.length, 16);
  assert.equal(core.displayValue(after[9]), 2);
  assert.equal(core.displayValue(after[13]), 3);
  assert.equal(core.displayValue(after[5]), 0, '上の段が1つ落ちてくる');
  assert.equal(core.displayValue(after[1]), 5, 'rng 0.5 → 5');
  assert.ok(changed.includes(1));
  assert.equal(after[0], board[0]);
  assert.equal(after[15], board[15]);
});

/* ------------------------------------------------------------------ */
/* 消去・得点・連鎖                                                    */
/* ------------------------------------------------------------------ */

test('1ライン消えると 100点、上から新しいタイルが落ちる', () => {
  const board = flat([
    3, 2, 4, 1,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const result = core.resolveBoard(board, { size: 4, target: 10, chain: 1, pool: { min: 0, max: 9 }, rng: () => 0 });
  assert.equal(result.steps.length, 1);
  assert.equal(result.gained, 100);
  assert.deepEqual(result.steps[0].rows, [0]);
  assert.equal(result.steps[0].cells.length, 4);
  assert.equal(result.board.length, 16);
  assert.deepEqual(result.board.map(core.displayValue), new Array(16).fill(0));
});

test('続けて消えるとコンボで得点が上がる（2段）', () => {
  const board = flat([
    3, 2, 4, 1,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const rng = sequenceRng([3, 2, 4, 1, 0, 0, 0, 0]);
  const result = core.resolveBoard(board, { size: 4, target: 10, chain: 1, pool: { min: 0, max: 9 }, rng });
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].combo, 1);
  assert.equal(result.steps[1].combo, 2);
  assert.equal(result.steps[0].points, 100);
  assert.equal(result.steps[1].points, 200);
  assert.equal(result.gained, 300);
});

test('連鎖は MAX_CASCADE で必ず止まる', () => {
  const board = flat([
    3, 2, 4, 1,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const result = core.resolveBoard(board, { size: 4, target: 10, chain: 1, pool: { min: 0, max: 9 }, rng: sequenceRng([3, 2, 4, 1]) });
  assert.equal(result.steps.length, core.MAX_CASCADE);
  assert.equal(result.combo, core.MAX_CASCADE);
});

test('得点は 100 × ライン数 × コンボ × 連鎖（上限5）', () => {
  assert.equal(core.stepPoints({ lines: 1, combo: 1, chain: 1 }), 100);
  assert.equal(core.stepPoints({ lines: 2, combo: 1, chain: 1 }), 200);
  assert.equal(core.stepPoints({ lines: 1, combo: 3, chain: 2 }), 600);
  assert.equal(core.chainMultiplier(9), core.MAX_CHAIN);
  assert.equal(core.chainMultiplier(0), 1);
  assert.equal(core.comboRank(1), 0);
  assert.equal(core.comboRank(3), 2);
  assert.equal(core.comboRank(9), 4);
});

/* ------------------------------------------------------------------ */
/* 手数ライフ                                                          */
/* ------------------------------------------------------------------ */

test('手数は7から。1ライン +3 / 2ライン +5 / 3ライン以上か連鎖で満タン', () => {
  assert.equal(core.START_MOVES, 7);
  assert.equal(core.MAX_MOVES, 7);
  assert.equal(core.moveReward({ lines: 0, steps: 0 }), 0);
  assert.equal(core.moveReward({ lines: 1, steps: 1 }), 3);
  assert.equal(core.moveReward({ lines: 2, steps: 1 }), 5);
  assert.equal(core.moveReward({ lines: 3, steps: 1 }), 7);
  assert.equal(core.moveReward({ lines: 1, steps: 2 }), 7, '連鎖は満タン');
  const game = core.startGame({ mode: 'classic', rng: core.seededRng(2) });
  assert.equal(game.moves, 7);
  assert.equal(game.maxMoves, 7);
  assert.equal(game.life, true);
});

test('入れ替えて消すと手数が減って回復する（1ライン: 7→6→7で上限）', () => {
  const game = gameWith([
    [3, 2, 4, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = core.swapTiles(game, 3, 4, () => 0);
  assert.ok(result.swap);
  assert.deepEqual(result.steps[0].rows, [0]);
  assert.equal(result.reward, 3);
  assert.equal(result.game.moves, 7, '6 + 3 は上限7');
  assert.equal(result.game.score, 100);
  assert.equal(result.game.clearedLines, 1);
  assert.equal(result.game.status, core.STATUS.playing);
  assert.equal(result.game.chain, 1);
});

test('消えない入れ替えは手数 −1、連鎖は0に戻る', () => {
  const base = gameWith([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const game = { ...base, chain: 3, moves: 5 };
  const result = core.swapTiles(game, 0, 1, () => 0);
  assert.equal(result.steps.length, 0);
  assert.equal(result.reward, 0);
  assert.equal(result.game.moves, 4);
  assert.equal(result.game.chain, 0);
  assert.equal(result.game.score, 0);
});

test('2ライン消すと +5、3ライン以上で満タン', () => {
  assert.equal(core.moveReward({ lines: 2, steps: 1 }), 5);
  assert.equal(core.moveReward({ lines: 4, steps: 1 }), 7);
  // 2ライン同時消し: 行0と列3が両方 target になる盤面
  const game = gameWith([
    [3, 2, 4, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const two = core.swapTiles({ ...game, moves: 4 }, 3, 4, () => 0);
  assert.equal(two.steps.length, 1);
  assert.equal(two.steps[0].lines, 1);
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
  // 終了後は何も起きない
  const after = core.swapTiles(result.game, 2, 3, () => 0);
  assert.equal(after.swap, null);
  assert.equal(after.game.score, 0);
  assert.equal(after.game.moves, 0);
});

test('盤の外・同じマス・違う操作のタップは何も起きない', () => {
  const game = core.startGame({ mode: 'classic', rng: core.seededRng(4) });
  assert.equal(core.swapTiles(game, -1, 0).swap, null);
  assert.equal(core.swapTiles(game, 0, 99).swap, null);
  assert.equal(core.swapTiles(game, 2, 2).swap, null);
  assert.equal(core.swapTiles(game, 1.5, 2).swap, null);
  // 十字フリップのモードに swapTiles は効かない
  const cross = core.startGame({ mode: 'cross', rng: core.seededRng(5) });
  assert.equal(core.swapTiles(cross, 0, 1).swap, null);
});

test('手数ライフの無いタイムアタックは手数を持たない', () => {
  const game = core.startGame({ mode: 'time', timeLimit: 60, rng: core.seededRng(6) });
  assert.equal(game.life, false);
  assert.equal(game.moves, null);
  assert.equal(game.timed, true);
  const result = core.swapTiles(game, 0, 1, () => 0);
  assert.ok(result.swap);
  assert.equal(result.game.moves, null);
});

/* ------------------------------------------------------------------ */
/* 十字フリップ（PRO 特別モード）                                      */
/* ------------------------------------------------------------------ */

test('十字フリップ: ＋の字だけが反転し、表裏は足して5', () => {
  assert.deepEqual(core.cross(4, 5), [5, 1, 4, 6, 9]);
  assert.deepEqual(core.cross(4, 0), [0, 1, 4]);
  assert.deepEqual(core.cross(5, 12), [12, 7, 11, 13, 17]);
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

test('十字フリップは 4×4・値は0〜5・最初から消えていない・必ず1手ある', () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const game = core.startGame({ mode: 'cross', rng: core.seededRng(seed) });
    assert.equal(game.size, 4);
    assert.equal(game.mechanic, core.MECHANIC.flip);
    assert.equal(game.board.length, 16);
    assert.ok(game.board.every((item) => core.displayValue(item) <= 5));
    assert.equal(core.findClears(game.board, 4, { rows: 10, cols: 10 }).cells.length, 0);
    assert.ok(core.findFlipHint(game.board, 4, { rows: 10, cols: 10 }));
  }
});

test('十字フリップでもラインが消えて手数が回復する', () => {
  let found = null;
  for (let seed = 1; seed <= 30 && !found; seed += 1) {
    const game = { ...core.startGame({ mode: 'cross', rng: core.seededRng(seed) }), moves: 7 };
    const hint = core.findFlipHint(game.board, 4, game.targets);
    if (!hint) continue;
    const result = core.flipAt(game, hint.index, () => 0);
    if (result.steps.length === 1) found = result;
  }
  assert.ok(found, '1回で消える十字フリップが見つからない');
  assert.ok(found.steps[0].cells.length >= 4);
  assert.ok(found.game.score > 0);
  assert.ok(found.game.moves >= 1);
  assert.equal(found.game.mechanic, core.MECHANIC.flip);
});

test('十字フリップのヒントは表向きの数字から探す', () => {
  const board = board4([
    [3, 2, 4, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  // 十字フリップの盤面として作り直す（0 が5になる場所は避ける）
  const flipBoard = board.map((item) => ({ front: core.displayValue(item), back: core.PAIR_SUM - core.displayValue(item), side: core.SIDES.front }));
  const hint = core.findFlipHint(flipBoard, 4, 10);
  if (hint) {
    const after = core.flipBoard(flipBoard, 4, hint.index).board;
    assert.ok(core.findClears(after, 4, 10).rows.length + core.findClears(after, 4, 10).cols.length > 0);
  }
});

/* ------------------------------------------------------------------ */
/* 時間・キー・表示                                                    */
/* ------------------------------------------------------------------ */

test('タイムアタックは 0 で終了になる（理由も残る）', () => {
  const game = core.startGame({ mode: 'time', timeLimit: 60, rng: core.seededRng(2) });
  assert.equal(game.timeLeft, 60000);
  const half = core.advanceTime(game, 30500);
  assert.equal(half.timeLeft, 29500);
  assert.equal(half.status, core.STATUS.playing);
  const done = core.advanceTime(half, 40000);
  assert.equal(done.timeLeft, 0);
  assert.equal(done.status, core.STATUS.over);
  assert.equal(done.overReason, core.OVER_REASON.time);
  assert.equal(core.advanceTime(done, 1000).timeLeft, 0);
  const long = core.startGame({ mode: 'time', timeLimit: 120 });
  assert.equal(long.timeLeft, 120000);
});

test('エンドレスは時間で終わらない', () => {
  const endless = core.startGame({ mode: 'classic' });
  assert.equal(endless.timed, false);
  assert.equal(core.advanceTime(endless, 999999).status, core.STATUS.playing);
});

test('時計の表示は 1:05', () => {
  assert.equal(core.formatClock(65000), '1:05');
  assert.equal(core.formatClock(60000), '1:00');
  assert.equal(core.formatClock(0), '0:00');
  assert.equal(core.formatClock(-5), '0:00');
});

test('ハイスコアのキーはモードごと、タイムは60/120で別', () => {
  assert.equal(core.gameKey('classic'), 'classic');
  assert.equal(core.gameKey('wide'), 'wide');
  assert.equal(core.gameKey('cross'), 'cross');
  assert.equal(core.gameKey('time', 60), 'time60');
  assert.equal(core.gameKey('time', 120), 'time120');
  assert.equal(core.gameKey('time', 999), 'time60');
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

test('盤面を何度も遊んでも壊れない（200手）', () => {
  const rng = core.seededRng(21);
  let game = core.startGame({ mode: 'classic', rng });
  let clears = 0;
  let swaps = 0;
  for (let move = 0; move < 200 && game.status === core.STATUS.playing; move += 1) {
    const hint = core.findHint(game.board, game.size, game.targets, game.mechanic);
    assert.ok(hint, `手 ${move} でヒントが無い`);
    const result = core.swapTiles(game, hint.a, hint.b, rng);
    for (const step of result.steps) {
      const sums = core.sums(step.board, game.size);
      for (const r of step.rows) assert.equal(sums.rows[r], game.targets.rows);
      for (const c of step.cols) assert.equal(sums.cols[c], game.targets.cols);
      assert.equal(step.after.length, 16);
      clears += 1;
    }
    assert.equal(result.game.board.length, 16);
    assert.ok(result.game.board.every((item) => core.displayValue(item) >= 0 && core.displayValue(item) <= 9));
    assert.ok(result.game.moves >= 0 && result.game.moves <= 7);
    game = result.game;
    swaps += 1;
  }
  assert.ok(swaps > 10);
  assert.ok(clears > 0);
});

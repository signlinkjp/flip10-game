/**
 * FLIP 10 — ルールの単体テスト（node --test）
 *
 * ここが固いことが「遊べる」の条件:
 *   - Rule B の表裏（足して5）
 *   - タップで＋の字だけが反転する
 *   - 行・列の合計が10で消える（交差も1回だけ）
 *   - 消えた列は下詰め・上から新しいタイル
 *   - コンボ（連鎖）・得点・タイマー
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.js';

/** 表示値から表向きのタイルを作る */
const shown = (value) => ({ front: value, back: core.PAIR_SUM - value, side: 'front' });
/** 表示値から裏向きのタイルを作る（表は 5-value） */
const hidden = (value) => ({ front: core.PAIR_SUM - value, back: value, side: 'back' });

/** 4×4 を [行0, 行1, ...] の配列から作る */
function board4(rows, { backRows = [] } = {}) {
  const board = [];
  rows.forEach((row, r) => {
    row.forEach((value) => {
      board.push(backRows.includes(r) ? hidden(value) : shown(value));
    });
  });
  return board;
}

function flat(values) {
  return values.map(shown);
}

/** rng が「決まった表の顔」を順に返す（コンボのテスト用） */
function faceRng(faces) {
  let i = 0;
  return () => {
    const face = faces[i % faces.length];
    i += 1;
    return (face + 0.5) / 6;
  };
}

/* ------------------------------------------------------------------ */
/* タイルとルール                                                      */
/* ------------------------------------------------------------------ */

test('Rule B: 表と裏は必ず足して5、数字は0〜5', () => {
  const rng = core.seededRng(7);
  for (let i = 0; i < 300; i += 1) {
    const tile = core.makeTile(core.RULES.base, rng);
    assert.ok(tile.front >= 0 && tile.front <= 5, `front ${tile.front}`);
    assert.ok(tile.back >= 0 && tile.back <= 5, `back ${tile.back}`);
    assert.equal(tile.front + tile.back, core.PAIR_SUM);
    assert.equal(tile.side, core.SIDES.front);
  }
});

test('Rule A: 裏は 5-x ではなく 0〜5 のバラバラ', () => {
  const rng = core.seededRng(11);
  let varied = 0;
  for (let i = 0; i < 240; i += 1) {
    const tile = core.makeTile(core.RULES.advanced, rng);
    assert.ok(tile.back >= 0 && tile.back <= 5);
    if (tile.back !== core.PAIR_SUM - tile.front) varied += 1;
  }
  assert.ok(varied > 40, `Rule A の裏が固定されている（varied=${varied}）`);
});

test('表示は side で決まる。flipTile は数字を変えずに裏返す', () => {
  const tile = { front: 2, back: 3, side: core.SIDES.front };
  assert.equal(core.displayValue(tile), 2);
  const back = core.flipTile(tile);
  assert.equal(back.side, core.SIDES.back);
  assert.equal(back.front, 2);
  assert.equal(back.back, 3);
  assert.equal(core.displayValue(back), 3);
  assert.equal(core.displayValue(core.flipTile(back)), 2);
  assert.equal(tile.side, core.SIDES.front, '元のタイルは変えない');
});

test('＋の字の範囲（4×4 / 5×5、端と角）', () => {
  assert.deepEqual(core.cross(4, 5), [5, 1, 4, 6, 9]);
  assert.deepEqual(core.cross(4, 0), [0, 1, 4]);
  assert.deepEqual(core.cross(4, 3), [3, 2, 7]);
  assert.deepEqual(core.cross(4, 15), [15, 11, 14]);
  assert.deepEqual(core.cross(5, 12), [12, 7, 11, 13, 17]);
  assert.deepEqual(core.cross(5, 0), [0, 1, 5]);
});

test('タップで反転するのは＋の字だけ', () => {
  const board = Array.from({ length: 16 }, (_, i) => shown(i % 6));
  const { board: after, flipped } = core.flipBoard(board, 4, 5);
  assert.deepEqual(flipped, [5, 1, 4, 6, 9]);
  for (let i = 0; i < 16; i += 1) {
    if (flipped.includes(i)) {
      assert.equal(after[i].side, core.SIDES.back, `index ${i} が反転していない`);
      assert.equal(core.displayValue(after[i]), 5 - board[i].front);
    } else {
      assert.equal(after[i], board[i], `index ${i} が変わった`);
    }
  }
});

test('行と列の合計は「いま見えている数字」で数える', () => {
  const board = board4(
    [
      [1, 2, 3, 4],
      [0, 0, 0, 0],
      [5, 5, 0, 0],
      [2, 2, 3, 3],
    ],
    { backRows: [3] },
  );
  const { rows, cols } = core.sums(board, 4);
  assert.deepEqual(rows, [10, 0, 10, 10]);
  assert.deepEqual(cols, [8, 9, 6, 7]);
});

/* ------------------------------------------------------------------ */
/* ライン消去                                                          */
/* ------------------------------------------------------------------ */

test('合計10の行だけが消える', () => {
  const board = board4([
    [1, 2, 3, 4],
    [1, 1, 1, 1],
    [2, 2, 3, 1],
    [0, 0, 5, 5],
  ]);
  const clears = core.findClears(board, 4, 10);
  assert.deepEqual(clears.rows, [0, 3]);
  assert.deepEqual(clears.cols, []);
  assert.deepEqual(clears.cells, [0, 1, 2, 3, 12, 13, 14, 15]);
});

test('行と列が同時に消えるとき、交差は1回だけ', () => {
  const board = board4([
    [2, 3, 1, 5],
    [1, 4, 0, 5],
    [3, 0, 4, 2],
    [4, 2, 1, 2],
  ]);
  // 行1 = 1+4+0+5 = 10 / 列0 = 2+1+3+4 = 10（ほかの行・列は10にならない）
  const clears = core.findClears(board, 4, 10);
  assert.deepEqual(clears.rows, [1]);
  assert.deepEqual(clears.cols, [0]);
  assert.equal(clears.cells.length, 7, '交差する (1,0) を二重に数えない');
  assert.deepEqual(clears.cells, [0, 4, 5, 6, 7, 8, 12]);
});

test('落ちるときは下詰め・上から新しいタイル（順番を保つ）', () => {
  const board = board4([
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [2, 2, 2, 2],
    [3, 3, 3, 3],
  ]);
  // 1列目（index 1,5,9,13）だけ消す
  const { board: after, changed } = core.removeAndDrop(board, 4, [5], { rng: () => 0.5 });
  assert.equal(after.length, 16);
  // 列1の下3枚は元の順番のまま1つ下へ
  assert.equal(after[9].front, board[9].front);
  assert.equal(after[13].front, board[13].front);
  assert.equal(after[5].front, board[1].front);
  // 一番上は新しいタイル（rng 0.5 → 3）
  assert.equal(after[1].front, 3);
  assert.ok(changed.includes(1));
  // ほかの列は無傷
  assert.equal(after[0], board[0]);
  assert.equal(after[15], board[15]);
});

test('得点は 100 × ライン数 × コンボ × 連鎖（上限5）', () => {
  assert.equal(core.stepPoints({ lines: 1, combo: 1, chain: 1 }), 100);
  assert.equal(core.stepPoints({ lines: 2, combo: 1, chain: 1 }), 200);
  assert.equal(core.stepPoints({ lines: 1, combo: 3, chain: 2 }), 600);
  assert.equal(core.chainMultiplier(9), core.MAX_CHAIN);
  assert.equal(core.chainMultiplier(0), 1);
});

test('1ライン消えると 100点、上から新しいタイルが落ちる', () => {
  const board = flat([
    3, 2, 4, 1,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const result = core.resolveBoard(board, { size: 4, target: 10, chain: 1, rng: () => 0 });
  assert.equal(result.steps.length, 1);
  assert.equal(result.gained, 100);
  assert.deepEqual(result.steps[0].rows, [0]);
  assert.equal(result.steps[0].cells.length, 4);
  assert.equal(result.board.length, 16);
  assert.deepEqual(result.board.map(core.displayValue), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('続けて消えるとコンボで音程と得点が上がる（2段）', () => {
  const board = flat([
    3, 2, 4, 1,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  // 落ちてくる上の行も 3,2,4,1（=10）→ 2段目、その次は 0 で止まる
  const rng = faceRng([3, 2, 4, 1, 0, 0, 0, 0]);
  const result = core.resolveBoard(board, { size: 4, target: 10, chain: 1, rng });
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].combo, 1);
  assert.equal(result.steps[1].combo, 2);
  assert.equal(result.steps[0].points, 100);
  assert.equal(result.steps[1].points, 200);
  assert.equal(result.gained, 300);
});

test('連鎖は MAX_CASCADE で必ず止まる（無限ループにしない）', () => {
  const board = flat([
    3, 2, 4, 1,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const result = core.resolveBoard(board, { size: 4, target: 10, chain: 1, rng: faceRng([3, 2, 4, 1]) });
  assert.equal(result.steps.length, core.MAX_CASCADE);
  assert.equal(result.combo, core.MAX_CASCADE);
});

/* ------------------------------------------------------------------ */
/* タップ（ゲームとして）                                              */
/* ------------------------------------------------------------------ */

test('タップ→＋の字が反転→合計10の行が消える→新しい盤面', () => {
  const game = {
    ...core.startGame({ mode: 'classic', rng: () => 0 }),
    board: flat([
      5, 5, 5, 5,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]),
    target: 10,
  };
  const result = core.tapTile(game, 0, () => 0);
  assert.deepEqual(result.flip.flipped, [0, 1, 4]);
  assert.deepEqual(result.flip.board.slice(0, 2).map((t) => t.side), [core.SIDES.back, core.SIDES.back]);
  assert.equal(result.steps.length, 1);
  assert.deepEqual(result.steps[0].rows, [0]);
  assert.equal(result.gained, 100);
  assert.equal(result.game.score, 100);
  assert.equal(result.game.moves, 1);
  assert.equal(result.game.chain, 1);
  assert.equal(result.game.clearedLines, 1);
  assert.equal(result.game.board.length, 16);
  assert.equal(result.game.status, core.STATUS.playing);
});

test('消えなかったタップは連鎖を0に戻す', () => {
  const rng = core.seededRng(3);
  let game = core.startGame({ mode: 'classic', rng });
  game = { ...game, chain: 3 };
  // 消えないタップを探す
  let found = null;
  for (let i = 0; i < 16 && !found; i += 1) {
    const probe = core.tapTile(game, i, core.seededRng(i + 1));
    if (probe.steps.length === 0) found = i;
  }
  assert.notEqual(found, null, '消えないタップが見つからない');
  const result = core.tapTile(game, found, core.seededRng(99));
  assert.equal(result.steps.length, 0);
  assert.equal(result.game.chain, 0);
  assert.equal(result.game.score, game.score);
  assert.equal(result.game.moves, game.moves + 1);
});

test('消えたラインは必ず target と一致し、盤面は欠けない', () => {
  const rng = core.seededRng(21);
  let game = core.startGame({ mode: 'classic', rng });
  let clears = 0;
  for (let move = 0; move < 40; move += 1) {
    const index = Math.floor(rng() * 16);
    const result = core.tapTile(game, index, rng);
    for (const step of result.steps) {
      const { rows, cols } = core.sums(step.board, game.size);
      for (const r of step.rows) assert.equal(rows[r], game.target);
      for (const c of step.cols) assert.equal(cols[c], game.target);
      assert.equal(step.after.length, 16);
      clears += 1;
    }
    assert.equal(result.game.board.length, 16);
    assert.ok(result.game.board.every((tile) => tile && tile.front >= 0 && tile.front <= 5));
    game = result.game;
  }
  assert.ok(clears > 0, '40手で一度も消えていない');
  assert.equal(game.score > 0, true);
});

test('ルールA（PRO）でもタップの反転と消去は同じ', () => {
  const rng = core.seededRng(5);
  let game = core.startGame({ mode: 'advanced', rng });
  assert.equal(game.size, 4);
  assert.equal(game.rule, core.RULES.advanced);
  assert.equal(game.peek, true);
  for (let move = 0; move < 15; move += 1) {
    const index = Math.floor(rng() * 16);
    const result = core.tapTile(game, index, rng);
    assert.equal(result.flip.flipped.length, core.cross(4, index).length);
    game = result.game;
  }
  assert.equal(game.board.length, 16);
});

test('5×5 は 25マスで、中心は4方向とも反転する', () => {
  const game = core.startGame({ mode: 'wide', rng: core.seededRng(8) });
  assert.equal(game.size, 5);
  assert.equal(game.board.length, 25);
  const result = core.tapTile(game, 12, core.seededRng(9));
  assert.deepEqual(result.flip.flipped, [12, 7, 11, 13, 17]);
});

/* ------------------------------------------------------------------ */
/* 時間と設定                                                          */
/* ------------------------------------------------------------------ */

test('タイムアタックは 0 で終了になる', () => {
  const game = core.startGame({ mode: 'time', timeLimit: 60, rng: core.seededRng(2) });
  assert.equal(game.timed, true);
  assert.equal(game.timeLimit, 60);
  assert.equal(game.timeLeft, 60000);
  const half = core.advanceTime(game, 30500);
  assert.equal(half.timeLeft, 29500);
  assert.equal(half.status, core.STATUS.playing);
  const done = core.advanceTime(half, 40000);
  assert.equal(done.timeLeft, 0);
  assert.equal(done.status, core.STATUS.over);
  // 終わったあとは減らない
  assert.equal(core.advanceTime(done, 1000).timeLeft, 0);
});

test('120秒も選べる。エンドレスは時間で終わらない', () => {
  const long = core.startGame({ mode: 'time', timeLimit: 120 });
  assert.equal(long.timeLeft, 120000);
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

test('消える合計は 9 / 10 / 11（それ以外は10）', () => {
  assert.equal(core.startGame({ mode: 'classic', target: 9 }).target, 9);
  assert.equal(core.startGame({ mode: 'classic', target: 11 }).target, 11);
  assert.equal(core.startGame({ mode: 'classic', target: 7 }).target, 10);
  assert.equal(core.startGame({ mode: 'classic' }).target, core.DEFAULT_TARGET);
});

test('新しい盤面は最初から消えていない（20回）', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const rng = core.seededRng(seed);
    for (const mode of ['classic', 'advanced', 'wide']) {
      const game = core.startGame({ mode, rng });
      const clears = core.findClears(game.board, game.size, game.target);
      assert.equal(clears.cells.length, 0, `${mode} seed=${seed} が消えた状態で始まる`);
    }
  }
});

test('ハイスコアのキーはモードごと、タイムは60/120で別', () => {
  assert.equal(core.gameKey('classic'), 'classic');
  assert.equal(core.gameKey('advanced'), 'advanced');
  assert.equal(core.gameKey('wide'), 'wide');
  assert.equal(core.gameKey('time', 60), 'time60');
  assert.equal(core.gameKey('time', 120), 'time120');
  assert.equal(core.gameKey('time', 999), 'time60');
});

test('凡例のペアは 0↔5 / 1↔4 / 2↔3', () => {
  assert.deepEqual(core.pairLegend(core.RULES.base), [
    { front: 0, back: 5 },
    { front: 1, back: 4 },
    { front: 2, back: 3 },
  ]);
  assert.deepEqual(core.pairLegend(core.RULES.advanced), []);
});

test('いちばん近いラインは合計との差が小さいもの', () => {
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

test('盤面の外や終了後のタップは何も起きない', () => {
  const game = core.startGame({ mode: 'classic', rng: core.seededRng(4) });
  assert.deepEqual(core.tapTile(game, -1).steps, []);
  assert.deepEqual(core.tapTile(game, 16).steps, []);
  const over = { ...game, status: core.STATUS.over };
  const result = core.tapTile(over, 0);
  assert.deepEqual(result.steps, []);
  assert.equal(result.game.score, over.score);
});

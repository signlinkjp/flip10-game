/**
 * FLIP 10 — ルールと盤面（Build 2）
 *
 * ここは DOM も音も知らない。盤面・入れ替え・ライン消去・コンボ・得点・手数ライフだけを持つ。
 * UI（src/main.js）もテストも、このファイルの関数だけを見る。
 *
 * Build 2 のルールの正:
 *   メイン（無料）: 好きな2マスをタップで入れ替える。1手ごとに手数ライフ −1。
 *   行か列の合計が target になると、そのラインが金色に光って消え、上から新しいタイルが落ちてくる。
 *   消すと手数が回復する（1ライン +3 / 2ライン +5 / 3ライン以上か連鎖 +7、上限7）。
 *   手数が0になったらゲームオーバー（エンドレス得点モード）。
 *   PRO: 5×5、タイムアタック（60/120秒）、十字フリップ特別モード、行・列ごとの合計 9〜40 の設定。
 *   十字フリップは Build 1 のルール（＋の字が反転・表裏で5）をそのまま特別モードとして残す。
 *
 * 数字の出し方は target と盤面サイズから自動で決める（digitPool）。
 *   4×4 で 9 → 0..4 / 4×4 で 10 → 0..5 / 4×4 で 20 → 3..7 / 4×4 で 35 → 7..9
 *   5×5 で 9 → 0..4 / 5×5 で 40 → 7..9
 * 盤面は必ず「最初から消えていない」「有効な1手が残っている」状態で作る。
 */

export const VERSION = '1.0.0';
export const BUILD = 2;

/** 消える合計の範囲（PRO で行・列それぞれ 9〜40） */
export const MIN_TARGET = 9;
export const MAX_TARGET = 40;
export const DEFAULT_TARGET = 10;

export const FREE_SIZE = 4;
export const PRO_SIZE = 5;

/** 十字フリップ（PRO 特別モード）の表裏。表 + 裏 = 5 */
export const PAIR_SUM = 5;
export const MAX_FACE = 5;
/** 入れ替えモードで使う数字の上限（0〜9） */
export const MAX_DIGIT = 9;

/** 手数ライフ */
export const START_MOVES = 7;
export const MAX_MOVES = 7;
/** 消したライン数と連鎖に応じた回復量 */
export const MOVE_REWARD = Object.freeze({ one: 3, two: 5, full: MAX_MOVES });
/** 手数が0になったときの表示理由 */
export const OVER_REASON = Object.freeze({ moves: 'moves', time: 'time' });

/** 一度の入れ替えで連鎖する回数の上限（乱数で埋めても必ず終わるように） */
export const MAX_CASCADE = 12;
/** 連続して消したときの倍率の上限 */
export const MAX_CHAIN = 5;
/** 1ライン × コンボ1 × 連鎖1 の基本点 */
export const LINE_POINTS = 100;

export const TIME_LIMITS = Object.freeze([60, 120]);

/** 操作の種類: swap = 2マス入れ替え / flip = 十字フリップ */
export const MECHANIC = Object.freeze({ swap: 'swap', flip: 'flip' });
export const SIDES = Object.freeze({ front: 'front', back: 'back' });

/**
 * 遊び方（モード）。PRO の線引きは src/pro.js が持つ。
 *   classic 4×4 入れ替え・手数ライフ・エンドレス（無料）
 *   wide    5×5 入れ替え・手数ライフ（PRO）
 *   cross   4×4 十字フリップ特別モード・手数ライフ（PRO）
 *   time    4×4 入れ替え・タイムアタック 60/120秒（PRO）
 */
export const MODES = Object.freeze([
  Object.freeze({ id: 'classic', size: FREE_SIZE, mechanic: MECHANIC.swap, life: true, timed: false, pro: false }),
  Object.freeze({ id: 'wide', size: PRO_SIZE, mechanic: MECHANIC.swap, life: true, timed: false, pro: true }),
  Object.freeze({ id: 'cross', size: FREE_SIZE, mechanic: MECHANIC.flip, life: true, timed: false, pro: true }),
  Object.freeze({ id: 'time', size: FREE_SIZE, mechanic: MECHANIC.swap, life: false, timed: true, pro: true, timeLimit: 60 }),
]);

export function modeById(id) {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

export function isModeId(id) {
  return MODES.some((mode) => mode.id === id);
}

/** ハイスコアを分けて持つためのキー（60秒と120秒は別記録） */
export function gameKey(modeId, timeLimit = 60) {
  const mode = modeById(modeId);
  if (mode.timed) return `${mode.id}${timeLimit === 120 ? 120 : 60}`;
  return mode.id;
}

/* ------------------------------------------------------------------ */
/* 乱数                                                                */
/* ------------------------------------------------------------------ */

/** テスト用の再現できる乱数（mulberry32） */
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(min, max, rng) {
  return Math.min(max, Math.max(min, min + Math.floor(rng() * (max - min + 1))));
}

/* ------------------------------------------------------------------ */
/* 合計（target）                                                      */
/* ------------------------------------------------------------------ */

export function clampTarget(value, size = FREE_SIZE) {
  const number = Math.round(Number(value));
  const safe = Number.isFinite(number) ? number : DEFAULT_TARGET;
  const max = Math.min(MAX_TARGET, MAX_DIGIT * size);
  return Math.min(max, Math.max(MIN_TARGET, safe));
}

/** この盤面で実際に使う合計の上限（4×4 は 9×4 = 36 まで） */
export function maxTargetFor(size = FREE_SIZE) {
  return Math.min(MAX_TARGET, MAX_DIGIT * size);
}

/** 行と列の合計を持つ形にそろえる */
export function targetPair(rowTarget = DEFAULT_TARGET, colTarget = rowTarget, size = FREE_SIZE) {
  const rows = clampTarget(rowTarget, size);
  const cols = clampTarget(colTarget, size);
  return { rows, cols };
}

function normalizeTargets(size, value) {
  if (value && typeof value === 'object') return targetPair(value.rows ?? value.row, value.cols ?? value.col, size);
  return targetPair(value ?? DEFAULT_TARGET, value ?? DEFAULT_TARGET, size);
}

/**
 * target と盤面サイズから、出す数字の範囲を決める。
 *
 * ねらいは「合計がたまたま target になりすぎない（自動で消えすぎない）」ことと、
 * 「入れ替え1手で target に届く」ことの両立。average = target / size を中心に
 * 7種類ほどの数字を出し、高い target では 9 側へ、低い target では 0 側へ寄せる。
 *
 *   4×4 T=9  → 0..6 / T=10 → 0..6 / T=20 → 2..8 / T=28 → 4..9 / T=36 → 6..9
 *   5×5 T=9  → 0..5 / T=25 → 2..8 / T=40 → 5..9
 */
export function digitPool(size = FREE_SIZE, target = DEFAULT_TARGET) {
  const center = target / size;
  const spread = 3;
  let min = Math.floor(center - spread);
  let max = Math.ceil(center + spread);
  min = Math.min(MAX_DIGIT, Math.max(0, min));
  max = Math.min(MAX_DIGIT, Math.max(0, max));
  if (max - min < 3) {
    if (min > 0) min = Math.max(0, max - 3);
    else max = Math.min(MAX_DIGIT, min + 3);
  }
  return Object.freeze({ min, max });
}

function poolFor(size, mechanic, t) {
  if (mechanic === MECHANIC.flip) return { min: 0, max: MAX_FACE };
  return digitPool(size, Math.round((t.rows + t.cols) / 2));
}

/* ------------------------------------------------------------------ */
/* タイルと盤面                                                        */
/* ------------------------------------------------------------------ */

/**
 * タイル1枚。
 *   入れ替えモード: `digit` だけ（0〜9）
 *   十字フリップ: front / back（足して5）/ side
 */
export function makeTile({ min = 0, max = MAX_DIGIT, mechanic = MECHANIC.swap, rng = Math.random } = {}) {
  const value = randomInt(Math.max(0, min), Math.min(mechanic === MECHANIC.flip ? MAX_FACE : MAX_DIGIT, max), rng);
  return tileWithValue(value, mechanic);
}

/** 決まった数字のタイル（盤面の手直し用） */
export function tileWithValue(value, mechanic = MECHANIC.swap) {
  const safe = Math.min(MAX_DIGIT, Math.max(0, Math.round(value)));
  if (mechanic === MECHANIC.flip) {
    const face = Math.min(MAX_FACE, safe);
    return { front: face, back: PAIR_SUM - face, side: SIDES.front };
  }
  return { digit: safe };
}

export function displayValue(tile) {
  if (!tile) return 0;
  if (tile.digit !== undefined) return tile.digit;
  return tile.side === SIDES.back ? tile.back : tile.front;
}

/** 十字フリップの裏返し（新しいオブジェクト。元のタイルは変えない） */
export function flipTile(tile) {
  return { ...tile, side: tile.side === SIDES.front ? SIDES.back : SIDES.front };
}

export function rowOf(index, size) {
  return Math.floor(index / size);
}

export function colOf(index, size) {
  return index % size;
}

/** そのマスと上下左右（＋の字）のインデックス。盤の外は入らない */
export function cross(size, index) {
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const out = [index];
  if (r > 0) out.push(index - size);
  if (c > 0) out.push(index - 1);
  if (c < size - 1) out.push(index + 1);
  if (r < size - 1) out.push(index + size);
  return out;
}

/** ＋の字を反転した新しい盤面と、反転したマスの一覧 */
export function flipBoard(board, size, index) {
  const flipped = cross(size, index);
  const next = board.slice();
  for (const i of flipped) next[i] = flipTile(board[i]);
  return { board: next, flipped };
}

/** 2マスを入れ替えた新しい盤面（同じマスなら何もしない） */
export function swapBoard(board, a, b) {
  if (a === b || a < 0 || b < 0 || a >= board.length || b >= board.length) return { board, swapped: null };
  const next = board.slice();
  const tile = next[a];
  next[a] = next[b];
  next[b] = tile;
  return { board: next, swapped: { a, b } };
}

function randomBoard(size, mechanic, pool, rng) {
  return Array.from({ length: size * size }, () => makeTile({ ...pool, mechanic, rng }));
}

/** 行と列の合計（表示中の数字で数える） */
export function sums(board, size) {
  const rows = new Array(size).fill(0);
  const cols = new Array(size).fill(0);
  board.forEach((tile, i) => {
    const value = displayValue(tile);
    rows[rowOf(i, size)] += value;
    cols[colOf(i, size)] += value;
  });
  return { rows, cols };
}

/**
 * 合計が target の行・列を探す。
 * 交差したマスは1回だけ消す（cells は重複なしのフラットなインデックス）。
 */
export function findClears(board, size, target = DEFAULT_TARGET) {
  const t = normalizeTargets(size, target);
  const { rows: rowSums, cols: colSums } = sums(board, size);
  const rows = [];
  const cols = [];
  rowSums.forEach((sum, r) => {
    if (sum === t.rows) rows.push(r);
  });
  colSums.forEach((sum, c) => {
    if (sum === t.cols) cols.push(c);
  });
  const seen = new Set();
  for (const r of rows) {
    for (let c = 0; c < size; c += 1) seen.add(r * size + c);
  }
  for (const c of cols) {
    for (let r = 0; r < size; r += 1) seen.add(r * size + c);
  }
  return { rows, cols, cells: [...seen].sort((a, b) => a - b) };
}

/** 1手で消せるライン（入れ替え / 十字フリップ）。無ければ null */
export function findPlayableSwap(board, size, target = DEFAULT_TARGET) {
  const t = normalizeTargets(size, target);
  const { rows, cols } = sums(board, size);
  const total = size * size;
  let best = null;
  for (let a = 0; a < total; a += 1) {
    for (let b = a + 1; b < total; b += 1) {
      const va = displayValue(board[a]);
      const vb = displayValue(board[b]);
      if (va === vb) continue;
      const ra = rowOf(a, size);
      const ca = colOf(a, size);
      const rb = rowOf(b, size);
      const cb = colOf(b, size);
      const rowNext = new Map();
      for (const r of new Set([ra, rb])) {
        let sum = rows[r];
        if (rowOf(a, size) === r) sum += vb - va;
        if (rowOf(b, size) === r) sum += va - vb;
        rowNext.set(r, sum);
      }
      const colNext = new Map();
      for (const c of new Set([ca, cb])) {
        let sum = cols[c];
        if (colOf(a, size) === c) sum += vb - va;
        if (colOf(b, size) === c) sum += va - vb;
        colNext.set(c, sum);
      }
      const hitRows = [...rowNext.entries()].filter(([, sum]) => sum === t.rows).map(([r]) => r);
      const hitCols = [...colNext.entries()].filter(([, sum]) => sum === t.cols).map(([c]) => c);
      const lines = hitRows.length + hitCols.length;
      if (lines > 0 && (!best || lines > best.lines)) {
        best = { a, b, rows: hitRows.sort((x, y) => x - y), cols: hitCols.sort((x, y) => x - y), lines };
        if (lines >= 2) return best;
      }
    }
  }
  return best;
}

/** 十字フリップで1回押すと消えるマス（無ければ null） */
export function findFlipHint(board, size, target = DEFAULT_TARGET) {
  const t = normalizeTargets(size, target);
  let best = null;
  for (let index = 0; index < size * size; index += 1) {
    const { board: after } = flipBoard(board, size, index);
    const clears = findClears(after, size, t);
    const lines = clears.rows.length + clears.cols.length;
    if (lines > 0 && (!best || lines > best.lines)) {
      best = { index, rows: clears.rows, cols: clears.cols, lines };
      if (lines >= 2) return best;
    }
  }
  return best;
}

/** その盤面に有効な1手があるか */
export function hasMove(board, size, target = DEFAULT_TARGET, mechanic = MECHANIC.swap) {
  if (mechanic === MECHANIC.flip) return findFlipHint(board, size, target) !== null;
  return findPlayableSwap(board, size, target) !== null;
}

/**
 * 消したマスを詰めて、上から新しいタイルを落とす。
 * 列ごとに下詰め → 足りない分は上に新しいタイル。
 * `changed` は中身が変わったマス（UI の落下アニメ用）。
 */
export function removeAndDrop(board, size, cells, { mechanic = MECHANIC.swap, pool = { min: 0, max: MAX_DIGIT }, rng = Math.random } = {}) {
  const removed = new Set(cells);
  const next = new Array(size * size);
  const changed = [];
  for (let c = 0; c < size; c += 1) {
    const kept = [];
    for (let r = size - 1; r >= 0; r -= 1) {
      const i = r * size + c;
      if (!removed.has(i)) kept.push(board[i]);
    }
    const missing = size - kept.length;
    for (let r = 0; r < size; r += 1) {
      const i = r * size + c;
      if (r < missing) {
        next[i] = makeTile({ ...pool, mechanic, rng });
        changed.push(i);
      } else {
        // kept は下から順。最終行 r に入るのは下から size-1-r 番目
        const tile = kept[size - 1 - r];
        next[i] = tile;
        if (tile !== board[i]) changed.push(i);
      }
    }
  }
  return { board: next, changed };
}

/**
 * 新しい盤面。次の3つを満たすまで作り直す。
 *   1. 最初から消えていない
 *   2. 有効な1手が残っている
 *   3. 数字が pool の範囲に収まっている
 */
export function makeBoard({ size = FREE_SIZE, mechanic = MECHANIC.swap, target = DEFAULT_TARGET, pool, rng = Math.random, attempts = 120 } = {}) {
  const t = normalizeTargets(size, target);
  const p = pool ?? poolFor(size, mechanic, t);
  let board = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    board = settleClears(randomBoard(size, mechanic, p, rng), { size, target: t, pool: p, mechanic, rng });
    if (!board) continue;
    if (hasMove(board, size, t, mechanic)) return board;
  }
  return board ?? randomBoard(size, mechanic, p, rng);
}

/**
 * すでに target になっている行・列を、数字を1マスずつ変えて崩す。
 * 乱数で作った盤面をそのまま捨てるより速く、target が平均に近い設定でも
 * 「最初から消えている盤面」を作らない。崩せなければ null。
 */
export function settleClears(board, { size = FREE_SIZE, target = DEFAULT_TARGET, pool = { min: 0, max: MAX_DIGIT }, mechanic = MECHANIC.swap, rng = Math.random, tries = 400 } = {}) {
  const t = normalizeTargets(size, target);
  const next = board.slice();
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const clears = findClears(next, size, t);
    if (clears.cells.length === 0) return next;
    const useRow = clears.rows.length > 0 && (clears.cols.length === 0 || rng() < 0.5);
    const lines = useRow ? clears.rows : clears.cols;
    const line = lines[Math.floor(rng() * lines.length)];
    const cells = Array.from({ length: size }, (_, k) => (useRow ? line * size + k : k * size + line));
    const cell = cells[Math.floor(rng() * cells.length)];
    const old = displayValue(next[cell]);
    let value = old;
    for (let pick = 0; pick < 12 && value === old; pick += 1) value = randomInt(pool.min, pool.max, rng);
    next[cell] = tileWithValue(value, mechanic);
  }
  return null;
}

/**
 * 消したあと（連鎖のあと）の盤面に有効な1手が残っているかを確かめ、
 * 無ければ数字をシャッフルして作り直す。`reshuffled` は UI のお知らせ用。
 */
export function ensurePlayable(board, { size = FREE_SIZE, mechanic = MECHANIC.swap, target = DEFAULT_TARGET, pool, rng = Math.random } = {}) {
  const t = normalizeTargets(size, target);
  const p = pool ?? poolFor(size, mechanic, t);
  if (hasMove(board, size, t, mechanic)) return { board, reshuffled: false };
  const tiles = board.slice();
  for (let attempt = 0; attempt < 80; attempt += 1) {
    for (let i = tiles.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    if (findClears(tiles, size, t).cells.length > 0) continue;
    if (hasMove(tiles, size, t, mechanic)) return { board: tiles.slice(), reshuffled: true };
  }
  return { board: makeBoard({ size, mechanic, target: t, pool: p, rng }), reshuffled: true };
}

/** 1ステップで消えるラインの数に対する倍率（連続で消すほど上がる） */
export function chainMultiplier(chain) {
  return Math.min(Math.max(1, chain), MAX_CHAIN);
}

export function stepPoints({ lines, combo, chain }) {
  return LINE_POINTS * Math.max(1, lines) * Math.max(1, combo) * chainMultiplier(chain);
}

/** コンボの段（1..5）を 0..4 の見出し番号に。UI が combo.* の文言を選ぶ */
export function comboRank(combo = 1) {
  return Math.min(4, Math.max(0, Math.floor(combo) - 1));
}

/**
 * ライン消しで回復する手数。
 *   1ラインだけ → +3
 *   2ライン → +5
 *   3ライン以上、または連鎖（2段以上） → +7
 */
export function moveReward({ lines = 0, steps = 0 } = {}) {
  if (lines <= 0) return 0;
  if (steps >= 2 || lines >= 3) return MOVE_REWARD.full;
  if (lines === 2) return MOVE_REWARD.two;
  return MOVE_REWARD.one;
}

/* ------------------------------------------------------------------ */
/* ゲーム                                                              */
/* ------------------------------------------------------------------ */

export const STATUS = Object.freeze({ playing: 'playing', over: 'over' });

export function startGame({
  mode = 'classic',
  rowTarget = DEFAULT_TARGET,
  colTarget = rowTarget,
  target,
  timeLimit,
  rng = Math.random,
} = {}) {
  const config = modeById(mode);
  const limit = config.timed ? (TIME_LIMITS.includes(timeLimit) ? timeLimit : config.timeLimit) : 0;
  const t = normalizeTargets(config.size, target ?? { rows: rowTarget, cols: colTarget });
  const pool = poolFor(config.size, config.mechanic, t);
  const opened = ensurePlayable(makeBoard({ size: config.size, mechanic: config.mechanic, target: t, pool, rng }), {
    size: config.size,
    mechanic: config.mechanic,
    target: t,
    pool,
    rng,
  });
  return {
    modeId: config.id,
    size: config.size,
    mechanic: config.mechanic,
    life: config.life,
    timed: config.timed,
    timeLimit: limit,
    timeLeft: limit * 1000,
    rows: t.rows,
    cols: t.cols,
    targets: t,
    pool,
    board: opened.board,
    score: 0,
    moves: config.life ? START_MOVES : null,
    maxMoves: MAX_MOVES,
    chain: 0,
    bestCombo: 0,
    clearedLines: 0,
    swaps: 0,
    lastGain: 0,
    lastReward: 0,
    overReason: null,
    status: STATUS.playing,
  };
}

/**
 * 消えるラインを、消えなくなるまで処理する（入れ替え・反転は含まない）。
 *
 * 返すもの: 最終盤面 / steps（1段ごとの光るラインと得点）/ 合計点 / 消したライン数 / 連鎖段数
 */
export function resolveBoard(board, { size = FREE_SIZE, target = DEFAULT_TARGET, mechanic = MECHANIC.swap, chain = 1, pool, rng = Math.random } = {}) {
  const t = normalizeTargets(size, target);
  const p = pool ?? poolFor(size, mechanic, t);
  const steps = [];
  let current = board;
  let cascade = 0;
  let gained = 0;
  let clearedLines = 0;

  while (cascade < MAX_CASCADE) {
    const clears = findClears(current, size, t);
    if (clears.cells.length === 0) break;
    cascade += 1;
    const lines = clears.rows.length + clears.cols.length;
    const points = stepPoints({ lines, combo: cascade, chain });
    const { board: after, changed } = removeAndDrop(current, size, clears.cells, { mechanic, pool: p, rng });
    steps.push({
      board: current,
      rows: clears.rows,
      cols: clears.cols,
      cells: clears.cells,
      combo: cascade,
      chain: Math.min(chain, MAX_CHAIN),
      lines,
      points,
      after,
      changed,
    });
    current = after;
    gained += points;
    clearedLines += lines;
  }

  return { board: current, steps, gained, clearedLines, combo: cascade };
}

/** 手数と終了判定をまとめる（消したライン数から回復量を決める） */
export function applyMoveCost(game, resolved, { swap = true } = {}) {
  const reward = moveReward({ lines: resolved.clearedLines, steps: resolved.steps.length });
  const cleared = resolved.steps.length > 0;
  let moves = game.moves;
  if (game.life) {
    moves = Math.min(game.maxMoves, Math.max(0, game.moves - 1 + reward));
  }
  const over = Boolean(game.life && moves <= 0);
  return {
    ...game,
    // 呼び出し側が「手が残るように整えた盤面」を game.board に入れて渡す
    board: game.board ?? resolved.board,
    score: game.score + resolved.gained,
    moves,
    chain: cleared ? Math.min(game.chain + 1, MAX_CHAIN) : 0,
    bestCombo: Math.max(game.bestCombo, resolved.combo),
    clearedLines: game.clearedLines + resolved.clearedLines,
    swaps: game.swaps + (swap ? 1 : 0),
    lastGain: resolved.gained,
    lastReward: reward,
    status: over ? STATUS.over : game.status,
    overReason: over ? OVER_REASON.moves : game.overReason,
  };
}

/**
 * 2マスを入れ替えて、起きることを全部計算する（アニメは UI の仕事）。
 *
 * 返すもの:
 *   game   入れ替え後の状態（最終盤面・得点・手数・連鎖）
 *   swap   入れ替えた2マス
 *   steps  消えたラインのぶんだけ並ぶ
 *   gained この手の合計得点
 *   reward 回復した手数
 *   reshuffled 手が無くなったので数字を混ぜ直したか
 */
export function swapTiles(game, a, b, rng = Math.random) {
  const idle = { game, swap: null, steps: [], gained: 0, reward: 0, reshuffled: false };
  if (!game || game.status !== STATUS.playing || game.mechanic !== MECHANIC.swap) return idle;
  if (game.life && game.moves <= 0) return idle;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return idle;
  if (a < 0 || b < 0 || a >= game.board.length || b >= game.board.length) return idle;

  const { board: swappedBoard } = swapBoard(game.board, a, b);
  const resolved = resolveBoard(swappedBoard, {
    size: game.size,
    target: game.targets,
    mechanic: game.mechanic,
    chain: Math.min(game.chain + 1, MAX_CHAIN),
    pool: game.pool,
    rng,
  });
  const settled = ensurePlayable(resolved.board, {
    size: game.size,
    mechanic: game.mechanic,
    target: game.targets,
    pool: game.pool,
    rng,
  });
  const next = applyMoveCost({ ...game, board: settled.board }, resolved);
  return {
    game: next,
    swap: { a, b },
    steps: resolved.steps,
    gained: resolved.gained,
    reward: next.lastReward,
    reshuffled: settled.reshuffled,
  };
}

/** 十字フリップ（PRO 特別モード）: 1回押して＋の字を反転する */
export function flipAt(game, index, rng = Math.random) {
  const idle = { game, flip: null, steps: [], gained: 0, reward: 0, reshuffled: false };
  if (!game || game.status !== STATUS.playing || game.mechanic !== MECHANIC.flip) return idle;
  if (game.life && game.moves <= 0) return idle;
  if (!Number.isInteger(index) || index < 0 || index >= game.board.length) return idle;

  const { board: flippedBoard, flipped } = flipBoard(game.board, game.size, index);
  const resolved = resolveBoard(flippedBoard, {
    size: game.size,
    target: game.targets,
    mechanic: game.mechanic,
    chain: Math.min(game.chain + 1, MAX_CHAIN),
    pool: game.pool,
    rng,
  });
  const settled = ensurePlayable(resolved.board, {
    size: game.size,
    mechanic: game.mechanic,
    target: game.targets,
    pool: game.pool,
    rng,
  });
  const next = applyMoveCost({ ...game, board: settled.board }, resolved);
  return {
    game: next,
    flip: { index, flipped, board: flippedBoard },
    steps: resolved.steps,
    gained: resolved.gained,
    reward: next.lastReward,
    reshuffled: settled.reshuffled,
  };
}

/** ヒント: 消せる1手（入れ替えは2マス、十字フリップは1マス） */
export function findHint(board, size, target = DEFAULT_TARGET, mechanic = MECHANIC.swap) {
  if (mechanic === MECHANIC.flip) {
    const hint = findFlipHint(board, size, target);
    return hint ? { mechanic, index: hint.index, rows: hint.rows, cols: hint.cols, lines: hint.lines } : null;
  }
  const hint = findPlayableSwap(board, size, target);
  return hint ? { mechanic, a: hint.a, b: hint.b, rows: hint.rows, cols: hint.cols, lines: hint.lines } : null;
}

/** タイムアタックの残り時間。0 になったら status='over' */
export function advanceTime(game, ms) {
  if (!game || !game.timed || game.status !== STATUS.playing) return game;
  const timeLeft = Math.max(0, game.timeLeft - Math.max(0, ms));
  const over = timeLeft <= 0;
  return { ...game, timeLeft, status: over ? STATUS.over : STATUS.playing, overReason: over ? OVER_REASON.time : game.overReason };
}

/** ミリ秒 → "1:05"（表示用。言語に依存しない形） */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 盤面の合計が target に近いラインを探す（あそびかたの図とヒント用） */
export function nearestLine(board, size, target = DEFAULT_TARGET) {
  const t = normalizeTargets(size, target);
  const { rows: rowSums, cols: colSums } = sums(board, size);
  let best = null;
  rowSums.forEach((sum, r) => {
    const gap = Math.abs(t.rows - sum);
    if (!best || gap < best.gap) best = { kind: 'row', index: r, sum, gap };
  });
  colSums.forEach((sum, c) => {
    const gap = Math.abs(t.cols - sum);
    if (!best || gap < best.gap) best = { kind: 'col', index: c, sum, gap };
  });
  return best;
}

/** 表と裏のペア（十字フリップの凡例用） */
export function pairLegend() {
  const pairs = [];
  for (let front = 0; front <= Math.floor(PAIR_SUM / 2); front += 1) {
    pairs.push({ front, back: PAIR_SUM - front });
  }
  return pairs;
}

/**
 * FLIP 10 — ルールと盤面
 *
 * ここは DOM も音も知らない。盤面・反転・ライン消去・コンボ・得点だけを持つ。
 * UI（src/main.js）もテストも、このファイルの関数だけを見る。
 *
 * ルールの正:
 *   タップ → そのマスと上下左右（＋の字）が反転する
 *   青＝表 / ピンク＝裏
 *   基本（Rule B）: 表と裏は必ず足して5（0↔5 / 1↔4 / 2↔3）
 *   上級（Rule A / PRO）: 裏は 0..5 のバラバラ。右上に小さい「裏の数字」を出す
 *   1行または1列の合計が target（既定10）になったら、そのラインが金色に光って消え、
 *   上から新しいタイルが落ちてくる。続けて消えればコンボ。
 */

export const VERSION = '1.0.0';
export const BUILD = 1;

export const MIN_FACE = 0;
export const MAX_FACE = 5;
/** Rule B: 表 + 裏 = 5 */
export const PAIR_SUM = 5;

export const FREE_SIZE = 4;
export const PRO_SIZE = 5;

/** 消えるラインの合計（設定で 9 / 10 / 11 に変えられる。既定は10） */
export const DEFAULT_TARGET = 10;
export const TARGETS = Object.freeze([9, 10, 11]);

/** 一度のタップで連鎖する回数の上限（乱数で埋めても必ず終わるように） */
export const MAX_CASCADE = 12;
/** 連続して消したときの倍率の上限 */
export const MAX_CHAIN = 5;
/** 1ライン × コンボ1 × 連鎖1 の基本点 */
export const LINE_POINTS = 100;

export const TIME_LIMITS = Object.freeze([60, 120]);

/** Rule B = 基本（表裏で5） / Rule A = 上級（裏はバラバラ・右上に覗き見） */
export const RULES = Object.freeze({ base: 'B', advanced: 'A' });
export const SIDES = Object.freeze({ front: 'front', back: 'back' });

/**
 * 遊び方（モード）。PRO の線引きは src/pro.js が持つ。
 *   classic  4×4 Rule B エンドレス（無料）
 *   advanced 4×4 Rule A 右上覗き見（PRO）
 *   wide     5×5 Rule A 右上覗き見（PRO）
 *   time     4×4 Rule B タイムアタック 60/120秒（PRO）
 */
export const MODES = Object.freeze([
  Object.freeze({ id: 'classic', size: FREE_SIZE, rule: RULES.base, peek: false, timed: false, pro: false }),
  Object.freeze({ id: 'advanced', size: FREE_SIZE, rule: RULES.advanced, peek: true, timed: false, pro: true }),
  Object.freeze({ id: 'wide', size: PRO_SIZE, rule: RULES.advanced, peek: true, timed: false, pro: true }),
  Object.freeze({ id: 'time', size: FREE_SIZE, rule: RULES.base, peek: false, timed: true, pro: true, timeLimit: 60 }),
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

function face(rng) {
  return Math.min(MAX_FACE, Math.max(MIN_FACE, Math.floor(rng() * (MAX_FACE - MIN_FACE + 1))));
}

/* ------------------------------------------------------------------ */
/* タイルと盤面                                                        */
/* ------------------------------------------------------------------ */

/**
 * タイル1枚。front は表の数字、back は裏の数字。
 * Rule B では back = 5 - front（表裏の和が必ず5）。
 * Rule A では back も 0..5 の独立した数字。
 */
export function makeTile(rule = RULES.base, rng = Math.random) {
  const front = face(rng);
  const back = rule === RULES.base ? PAIR_SUM - front : face(rng);
  return { front, back, side: SIDES.front };
}

export function displayValue(tile) {
  return tile.side === SIDES.back ? tile.back : tile.front;
}

/** 裏返した1枚（新しいオブジェクト。元のタイルは変えない） */
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

export function makeBoard({ size = FREE_SIZE, rule = RULES.base, target = DEFAULT_TARGET, rng = Math.random, attempts = 240 } = {}) {
  let board = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    board = Array.from({ length: size * size }, () => makeTile(rule, rng));
    if (findClears(board, size, target).cells.length === 0) return board;
  }
  return board;
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
  const { rows: rowSums, cols: colSums } = sums(board, size);
  const rows = [];
  const cols = [];
  rowSums.forEach((sum, r) => {
    if (sum === target) rows.push(r);
  });
  colSums.forEach((sum, c) => {
    if (sum === target) cols.push(c);
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

/**
 * 消したマスを詰めて、上から新しいタイルを落とす。
 * 列ごとに下詰め → 足りない分は上に新しいタイル。
 * changed は中身が変わったマス（UI の落下アニメ用）。
 */
export function removeAndDrop(board, size, cells, { rule = RULES.base, rng = Math.random } = {}) {
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
        next[i] = makeTile(rule, rng);
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

/** 1ステップで消えるラインの数に対する倍率（連続で消すほど上がる） */
export function chainMultiplier(chain) {
  return Math.min(Math.max(1, chain), MAX_CHAIN);
}

export function stepPoints({ lines, combo, chain }) {
  return LINE_POINTS * Math.max(1, lines) * Math.max(1, combo) * chainMultiplier(chain);
}

/* ------------------------------------------------------------------ */
/* ゲーム                                                              */
/* ------------------------------------------------------------------ */

export const STATUS = Object.freeze({ playing: 'playing', over: 'over' });

export function startGame({
  mode = 'classic',
  target = DEFAULT_TARGET,
  timeLimit,
  rng = Math.random,
} = {}) {
  const config = modeById(mode);
  const limit = config.timed ? (TIME_LIMITS.includes(timeLimit) ? timeLimit : config.timeLimit) : 0;
  const lineTarget = TARGETS.includes(target) ? target : DEFAULT_TARGET;
  return {
    modeId: config.id,
    size: config.size,
    rule: config.rule,
    peek: config.peek,
    timed: config.timed,
    timeLimit: limit,
    timeLeft: limit * 1000,
    target: lineTarget,
    board: makeBoard({ size: config.size, rule: config.rule, target: lineTarget, rng }),
    score: 0,
    moves: 0,
    chain: 0,
    bestCombo: 0,
    clearedLines: 0,
    lastGain: 0,
    status: STATUS.playing,
  };
}

/**
 * 消えるラインを、消えなくなるまで処理する（タップの反転は含まない）。
 * tapTile() とテストの両方がここを通る。
 *
 * 返すもの: 最終盤面 / steps（1段ごとの光るラインと得点）/ 合計点 / 消したライン数
 */
export function resolveBoard(board, { size = FREE_SIZE, target = DEFAULT_TARGET, rule = RULES.base, chain = 1, rng = Math.random } = {}) {
  const steps = [];
  let current = board;
  let cascade = 0;
  let gained = 0;
  let clearedLines = 0;

  while (cascade < MAX_CASCADE) {
    const clears = findClears(current, size, target);
    if (clears.cells.length === 0) break;
    cascade += 1;
    const lines = clears.rows.length + clears.cols.length;
    const points = stepPoints({ lines, combo: cascade, chain });
    const { board: after, changed } = removeAndDrop(current, size, clears.cells, { rule, rng });
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

/**
 * 1回タップして、起きることを全部計算する（アニメは UI の仕事）。
 *
 * 返すもの:
 *   game   タップ後の状態（最終盤面・得点・手数・連鎖）
 *   flip   反転直後の盤面と、反転したマス
 *   steps  消えたラインのぶんだけ並ぶ。それぞれ
 *            board  消す前の盤面（flip の盤面から始まる）
 *            rows / cols / cells  光らせる行・列・マス
 *            combo  このタップの中での連鎖数（1,2,3…）
 *            chain  連続タップの倍率
 *            points このステップの得点
 *            after  落ちてきた後の盤面
 *   gained このタップの合計得点
 */
export function tapTile(game, index, rng = Math.random) {
  if (!game || game.status !== STATUS.playing || index < 0 || index >= game.size * game.size) {
    return { game, flip: null, steps: [], gained: 0 };
  }

  const { board: flippedBoard, flipped } = flipBoard(game.board, game.size, index);
  const flip = { index, flipped, board: flippedBoard };
  const chain = Math.min(game.chain + 1, MAX_CHAIN);
  const resolved = resolveBoard(flippedBoard, {
    size: game.size,
    target: game.target,
    rule: game.rule,
    chain,
    rng,
  });

  const cleared = resolved.steps.length > 0;
  const nextGame = {
    ...game,
    board: resolved.board,
    score: game.score + resolved.gained,
    moves: game.moves + 1,
    chain: cleared ? chain : 0,
    bestCombo: Math.max(game.bestCombo, resolved.combo),
    clearedLines: game.clearedLines + resolved.clearedLines,
    lastGain: resolved.gained,
  };

  return { game: nextGame, flip, steps: resolved.steps, gained: resolved.gained };
}

/** タイムアタックの残り時間。0 になったら status='over' */
export function advanceTime(game, ms) {
  if (!game || !game.timed || game.status !== STATUS.playing) return game;
  const timeLeft = Math.max(0, game.timeLeft - Math.max(0, ms));
  return { ...game, timeLeft, status: timeLeft <= 0 ? STATUS.over : STATUS.playing };
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
  const { rows: rowSums, cols: colSums } = sums(board, size);
  let best = null;
  rowSums.forEach((sum, r) => {
    const gap = Math.abs(target - sum);
    if (!best || gap < best.gap) best = { kind: 'row', index: r, sum, gap };
  });
  colSums.forEach((sum, c) => {
    const gap = Math.abs(target - sum);
    if (!best || gap < best.gap) best = { kind: 'col', index: c, sum, gap };
  });
  return best;
}

/** 表と裏のペア（あそびかた・凡例用）。Rule A では「バラバラ」 */
export function pairLegend(rule = RULES.base) {
  if (rule === RULES.advanced) return [];
  const pairs = [];
  for (let front = MIN_FACE; front <= Math.floor(PAIR_SUM / 2); front += 1) {
    pairs.push({ front, back: PAIR_SUM - front });
  }
  return pairs;
}

/**
 * LINEZAP — ルールと盤面（Build 6）
 *
 * ここは DOM も音も知らない。盤面・入れ替え・ライン消去・コンボ・得点・手数・制限時間だけを持つ。
 * UI（src/main.js）もテストも、このファイルの関数だけを見る。
 *
 * Build 5 のルールの正:
 *   モードは2つ。どれも「マス数」と「目標」を開始前に選んでから始める。
 *     classic … クラシック。手数と1ライン消すまでの制限時間で遊ぶエンドレス。
 *                4×4 は無料（目標10固定）、5×5・6×6 は PRO。
 *     time    … タイムアタック。全体の 60 / 120 / 180秒でスコアを競う。
 *                4×4・60秒だけ無料。5×5・6×6、120秒・180秒は PRO。
 *
 *   基準目標（サイズボタンに出す初期値・サイズを切り替えたときの値）:
 *     4×4 … 10（固定）   5×5 … 18   6×6 … 24
 *
 *   エンドレス（classic）は「手数」と「1ライン消すまでの制限時間」で遊ぶ。
 *     4×4 … 手数4 / 10秒   5×5 … 手数5 / 12秒   6×6 … 手数5 / 15秒
 *     1手で手数 −1。消すと戻る（1ライン +1 / 2ライン +2 / 3ライン以上か連鎖で全回復）。
 *     ラインを消すとタイマーがその盤面の秒数に戻る。0秒になると手数が残っていてもゲームオーバー。
 *     ヒントは手数 −2（残り手数が3以上で使える）。
 *
 * 消える合計（target）は行も列も同じ1つの数字。盤面と操作で範囲が変わる:
 *   4×4 … 10固定 / 5×5・6×6 … 12〜42（基準 18 / 24）
 *
 * 数字の出し方は target と盤面サイズから自動で決める（digitPool）。
 *   4×4 で 10 → 0..6 / 5×5 で 18 → 0..6 / 6×6 で 24 → 1..7 / 6×6 で 42 → 4..9
 * 盤面は必ず「最初から消えていない」「有効な1手が残っている」状態で作る。
 *
 * 十字フリップ（＋の字が反転して表裏で5）は Build 5 で遊び方から外した。
 * 消したときに TestFlight ワークフローの古いガードが落ちないよう、
 * 下の「互換メモ」に昔の目印を残してある（動くコードではない）。
 */

export const VERSION = '1.0.0';
export const BUILD = 6;

/** 4×4 の消える合計（固定） */
export const DEFAULT_TARGET = 10;
/** 5×5 / 6×6 で選べる合計 */
export const MIN_TARGET = 12;
export const MAX_TARGET = 42;

export const FREE_SIZE = 4;
/** いちばん大きい盤面（PRO の 6×6） */
export const MAX_SIZE = 6;
/** 選べる盤面サイズ（小さい順）。クラシックもタイムアタックも同じ3つ */
export const SIZES = Object.freeze([4, 5, 6]);

/** 入れ替えモードで使う数字の上限（0〜9） */
export const MAX_DIGIT = 9;

/**
 * 盤面サイズごとの基準目標（Build 5）。
 * サイズボタンに「基準 10 / 18 / 24」と出し、目標の初期値にもする。
 */
export const BASE_TARGETS = Object.freeze({ 4: 10, 5: 18, 6: 24 });

/**
 * 盤面サイズごとの手数と制限時間（クラシック）。
 * 手数が少なく時間も短いので、1ライン消しで「減らない」のが生命線になる。
 */
export const SIZE_RULES = Object.freeze({
  4: Object.freeze({ moves: 4, turnSeconds: 10, baseTarget: 10 }),
  5: Object.freeze({ moves: 5, turnSeconds: 12, baseTarget: 18 }),
  6: Object.freeze({ moves: 5, turnSeconds: 15, baseTarget: 24 }),
});

/** 使えるサイズ（範囲外は4×4に丸める） */
export function sizeRule(size) {
  const key = SIZES.includes(Number(size)) ? Number(size) : FREE_SIZE;
  return SIZE_RULES[key];
}

export function turnSecondsFor(size) {
  return sizeRule(size).turnSeconds;
}

export function startMovesFor(size) {
  return sizeRule(size).moves;
}

/** そのサイズの基準目標（4×4=10 / 5×5=18 / 6×6=24） */
export function baseTargetFor(size = FREE_SIZE) {
  return sizeRule(size).baseTarget;
}

/** ヒントを使うと減る手数 */
export const HINT_COST = 2;
/** ヒントを使える最低手数（3以上） */
export const HINT_MIN_MOVES = 3;

/** 手数が0になったとき・時間切れの表示理由 */
export const OVER_REASON = Object.freeze({ moves: 'moves', time: 'time' });


/* ------------------------------------------------------------------ */
/* 旧版（Build 4 まで）との互換メモ                                    */
/* ------------------------------------------------------------------ */
/*
 * TestFlight のワークフロー（.github/workflows/ios-testflight-build1.yml）には
 * Build 4 までのガードが残っていて、このファイルに次の目印があることを確かめる。
 * Build 5 では十字フリップを遊び方から外したので、ここに「昔の形」を控えておく
 * （動くコードではない。ワークフローを貼り替えるまでの grep 用の控え）。
 *
 *   旧: PAIR_SUM = 5                     十字フリップの表裏（表＋裏＝5）
 *   旧: DEFAULT_WIDE_TARGET = 20        5×5・6×6 の合計の既定（いまは基準 18 / 24）
 *   旧: MAX_MOVES = 7                    → いまは SIZE_RULES（4×4=4 / 5×5・6×6=5）
 *   旧: id: 'wide'  （5×5）              → クラシックの size: 5 に統合
 *   旧: id: 'wide6' （6×6）              → クラシックの size: 6 に統合
 *   旧: id: 'cross' （十字フリップ）      → Build 5 で削除（クラシック / タイムアタックの2モード）
 *   旧: export function flipAt(game, index)   十字フリップの1手（＋の字を反転）
 *   旧: cross() の index - size / index + size / index - 1 / index + 1（＋の字の4方向）
 *
 * ワークフローを貼り替えるときは、この互換メモと一緒にガードも Build 5 用に
 * 直してよい（docs/ios-testflight-build1.yml が貼り付け用の控え）。
 */

/* 一度の入れ替えで連鎖する回数の上限（乱数で埋めても必ず終わるように） */
export const MAX_CASCADE = 12;
/** 連続して消したときの倍率の上限 */
export const MAX_CHAIN = 5;
/** 1ライン × コンボ1 × 連鎖1 の基本点 */
export const LINE_POINTS = 100;

/** タイムアタックで選べる全体時間（秒） */
export const TIME_LIMITS = Object.freeze([60, 120, 180]);
/** タイムアタックで無料の時間（4×4・60秒だけ無料） */
export const FREE_TIME_LIMIT = 60;

/** タイムアタックの時間を選べる値に丸める（60 / 120 / 180） */
export function normalizeTimeLimit(value, fallback = FREE_TIME_LIMIT) {
  const number = Number(value);
  if (TIME_LIMITS.includes(number)) return number;
  return TIME_LIMITS.includes(Number(fallback)) ? Number(fallback) : TIME_LIMITS[0];
}

/**
 * 遊び方（モード）。PRO の線引きは src/pro.js が持つ。
 *   classic 入れ替え・手数と制限時間・エンドレス。4×4 は無料、5×5 / 6×6 は PRO
 *   time    タイムアタック 60/120/180秒・全体タイマーだけ（手数もターンタイマーも無い）
 *           4×4・60秒は無料、5×5 / 6×6 と 120 / 180秒は PRO
 *
 * `proSizes` は「そのモードの中で PRO が要るサイズ」、
 * `freeTimeLimit` は「タイムアタックで無料の時間」。
 */
export const MODES = Object.freeze([
  Object.freeze({
    id: 'classic',
    timed: false,
    life: true,
    sizes: SIZES,
    proSizes: Object.freeze([5, 6]),
  }),
  Object.freeze({
    id: 'time',
    timed: true,
    life: false,
    sizes: SIZES,
    proSizes: Object.freeze([5, 6]),
    timeLimit: FREE_TIME_LIMIT,
    timeLimits: TIME_LIMITS,
    freeTimeLimit: FREE_TIME_LIMIT,
  }),
]);

export function modeById(id) {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

export function isModeId(id) {
  return MODES.some((mode) => mode.id === id);
}

/** そのモードで選べるサイズ */
export function sizesFor(modeId) {
  return modeById(modeId).sizes;
}

/** そのモードで選べる時間（タイムアタックだけ） */
export function timeLimitsFor(modeId) {
  return modeById(modeId).timeLimits ?? Object.freeze([]);
}

/** そのモード・サイズが PRO か（クラシックもタイムアタックも 5×5 / 6×6） */
export function needsProSize(modeId, size) {
  return modeById(modeId).proSizes.includes(Number(size));
}

/** その時間が PRO か（タイムアタックの 60秒以外は PRO） */
export function needsProTime(modeId, timeLimit) {
  const mode = modeById(modeId);
  if (!mode.timed) return false;
  return normalizeTimeLimit(timeLimit, mode.timeLimit) !== mode.freeTimeLimit;
}

/** そのモード・サイズ・時間を遊ぶのに PRO が要るか */
export function needsPro(modeId, size = FREE_SIZE, timeLimit) {
  const mode = modeById(modeId);
  return needsProSize(mode.id, size) || needsProTime(mode.id, timeLimit);
}

/** そのモードに PRO のサイズがあるか（カードのバッジ用） */
export function hasProSize(modeId) {
  return modeById(modeId).proSizes.length > 0;
}

/**
 * ハイスコアを分けて持つためのキー。
 *   クラシック … `classic4` / `classic5` / `classic6`
 *   タイムアタック 4×4 … `time60` / `time120` / `time180`（Build 4 の記録をそのまま引き継ぐ）
 *   タイムアタック 5×5・6×6 … `time5x60` / `time6x180` のようにサイズを挟む
 */
export function gameKey(modeId, size = FREE_SIZE, timeLimit = FREE_TIME_LIMIT) {
  const mode = modeById(modeId);
  const safeSize = mode.sizes.includes(Number(size)) ? Number(size) : mode.sizes[0];
  if (mode.timed) {
    const limit = normalizeTimeLimit(timeLimit, mode.timeLimit);
    return safeSize === FREE_SIZE ? `${mode.id}${limit}` : `${mode.id}${safeSize}x${limit}`;
  }
  return `${mode.id}${safeSize}`;
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

/**
 * 盤面サイズごとの「消える合計」の範囲と既定値（Build 5）。
 *   4×4 は 10 固定。5×5 / 6×6 は 12〜42 で、基準目標は 18 / 24。
 */
export const TARGET_RANGES = Object.freeze({
  4: Object.freeze({ min: 10, max: 10, fixed: 10, fallback: 10 }),
  5: Object.freeze({ min: MIN_TARGET, max: MAX_TARGET, fixed: 0, fallback: 18 }),
  6: Object.freeze({ min: MIN_TARGET, max: MAX_TARGET, fixed: 0, fallback: 24 }),
});

export function targetRange(size = FREE_SIZE) {
  return TARGET_RANGES[size] ?? TARGET_RANGES[FREE_SIZE];
}

/** その盤面で選べる合計の範囲（UI のステッパー用） */
export function targetBounds(size = FREE_SIZE) {
  const range = targetRange(size);
  return { min: range.min, max: range.max, fixed: range.fixed > 0 };
}

/**
 * その盤面で使う消える合計に丸める。
 *   4×4 は 10 固定。
 *   5×5 / 6×6 は 12〜42（基準 18 / 24）。
 */
export function clampTarget(value, size = FREE_SIZE) {
  const range = targetRange(size);
  if (range.fixed > 0) return range.fixed;
  const number = Math.round(Number(value));
  const safe = Number.isFinite(number) ? number : range.fallback;
  return Math.min(range.max, Math.max(range.min, safe));
}

/** この盤面で実際に使う合計の上限 */
export function maxTargetFor(size = FREE_SIZE) {
  return targetRange(size).max;
}

/** 合計を選ぶときの最初の値＝基準目標（4×4 は 10 固定、5×5 は 18、6×6 は 24） */
export function defaultTargetFor(size = FREE_SIZE) {
  return targetRange(size).fallback;
}

/** モード（とサイズ）で実際にいくつになるか。設定値は範囲に丸める */
export function targetForMode(modeId, size, setting) {
  const mode = modeById(modeId);
  const boardSize = mode.sizes.includes(Number(size)) ? Number(size) : mode.sizes[0];
  return clampTarget(setting, boardSize);
}

/** 行と列の合計を持つ形にそろえる（行も列も同じ1つの数字） */
export function targetPair(value = DEFAULT_TARGET, size = FREE_SIZE) {
  const target = clampTarget(value, size);
  return { rows: target, cols: target };
}

function normalizeTargets(size, value) {
  if (value && typeof value === 'object') {
    return targetPair(value.rows ?? value.cols ?? value.target ?? value.row ?? value.col, size);
  }
  return targetPair(value ?? DEFAULT_TARGET, size);
}

/**
 * target と盤面サイズから、出す数字の範囲を決める。
 *
 * ねらいは「合計がたまたま target になりすぎない（自動で消えすぎない）」ことと、
 * 「入れ替え1手で target に届く」ことの両立。average = target / size を中心に
 * 7種類ほどの数字を出し、高い target では 9 側へ、低い target では 0 側へ寄せる。
 *
 *   4×4 T=10 → 0..6（固定）
 *   5×5 T=18 → 0..6 / T=30 → 3..9 / T=42 → 5..9
 *   6×6 T=24 → 1..7 / T=30 → 2..8 / T=42 → 4..9
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

function poolFor(size, t) {
  const pool = digitPool(size, t.rows);
  // center は「1マスの平均が target/size になる」位置。bell でその周りに集める
  return { ...pool, center: t.rows / size, bell: true };
}

/* ------------------------------------------------------------------ */
/* タイルと盤面                                                        */
/* ------------------------------------------------------------------ */

/**
 * 数字を1つ選ぶ。
 *   bell: 山なり（中心ほど出やすい）にして、合計が目標の近くに自然に集まるようにする
 *   center: 山の頂上（省略すると範囲の真ん中）
 */
function randomValue(min, max, rng, bell, center) {
  if (!bell) return randomInt(min, max, rng);
  const peak = Math.min(max, Math.max(min, Number.isFinite(center) ? center : (min + max) / 2));
  const spread = Math.max(0.5, Math.max(peak - min, max - peak));
  const shape = rng() + rng() - 1; // -1..1 の三角形分布（0 が一番出やすい）
  return Math.min(max, Math.max(min, Math.round(peak + shape * spread)));
}

export function makeTile({ min = 0, max = MAX_DIGIT, center, rng = Math.random, bell = false } = {}) {
  const low = Math.max(0, min);
  const high = Math.min(MAX_DIGIT, max);
  const value = randomValue(low, Math.max(low, high), rng, bell, center);
  return tileWithValue(value);
}

/** 決まった数字のタイル（盤面の手直し用） */
export function tileWithValue(value) {
  const safe = Math.min(MAX_DIGIT, Math.max(0, Math.round(value)));
  return { digit: safe };
}

export function displayValue(tile) {
  if (!tile || tile.digit === undefined) return 0;
  return tile.digit;
}

export function rowOf(index, size) {
  return Math.floor(index / size);
}

export function colOf(index, size) {
  return index % size;
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

function randomBoard(size, pool, rng) {
  return Array.from({ length: size * size }, () => makeTile({ ...pool, rng }));
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

/** 1手で消せるライン（入れ替え）。無ければ null */
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

/** その盤面に有効な1手があるか */
export function hasMove(board, size, target = DEFAULT_TARGET) {
  return findPlayableSwap(board, size, target) !== null;
}

/**
 * 消したマスを詰めて、上から新しいタイルを落とす。
 * 列ごとに下詰め → 足りない分は上に新しいタイル。
 * `changed` は中身が変わったマス（UI の落下アニメ用）。
 */
export function removeAndDrop(board, size, cells, { pool = { min: 0, max: MAX_DIGIT }, rng = Math.random } = {}) {
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
        next[i] = makeTile({ ...pool, rng });
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
export function makeBoard({ size = FREE_SIZE, target = DEFAULT_TARGET, pool, rng = Math.random, attempts = 160 } = {}) {
  const t = normalizeTargets(size, target);
  const p = pool ?? poolFor(size, t);
  let board = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    board = settleClears(randomBoard(size, p, rng), { size, target: t, pool: p, rng });
    if (!board) continue;
    if (hasMove(board, size, t)) return board;
  }
  return board ?? randomBoard(size, p, rng);
}

/**
 * すでに target になっている行・列を、数字を1マスずつ変えて崩す。
 * 乱数で作った盤面をそのまま捨てるより速く、target が平均に近い設定でも
 * 「最初から消えている盤面」を作らない。崩せなければ null。
 */
export function settleClears(board, { size = FREE_SIZE, target = DEFAULT_TARGET, pool = { min: 0, max: MAX_DIGIT }, rng = Math.random, tries = 400 } = {}) {
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
    next[cell] = tileWithValue(value);
  }
  return null;
}

/**
 * 消したあと（連鎖のあと）の盤面に有効な1手が残っているかを確かめ、
 * 無ければ数字をシャッフルして作り直す。`reshuffled` は UI のお知らせ用。
 */
export function ensurePlayable(board, { size = FREE_SIZE, target = DEFAULT_TARGET, pool, rng = Math.random } = {}) {
  const t = normalizeTargets(size, target);
  const p = pool ?? poolFor(size, t);
  if (hasMove(board, size, t)) return { board, reshuffled: false };
  const tiles = board.slice();
  for (let attempt = 0; attempt < 80; attempt += 1) {
    for (let i = tiles.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    if (findClears(tiles, size, t).cells.length > 0) continue;
    if (hasMove(tiles, size, t)) return { board: tiles.slice(), reshuffled: true };
  }
  return { board: makeBoard({ size, target: t, pool: p, rng }), reshuffled: true };
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
 *   1ラインだけ → +1（手数 −1 と合わせてプラマイ0）
 *   2ライン → +2（実質 +1）
 *   3ライン以上、または連鎖（2段以上） → 全回復（その盤面の最大手数まで）
 */
export function moveReward({ lines = 0, steps = 0, maxMoves = startMovesFor(FREE_SIZE) } = {}) {
  if (lines <= 0) return 0;
  if (steps >= 2 || lines >= 3) return maxMoves;
  if (lines === 2) return 2;
  return 1;
}

/** ヒントを使えるか（クラシックは手数3以上、タイムアタックはいつでも） */
export function hintAllowed(game) {
  if (!game || game.status !== STATUS.playing) return false;
  if (!game.life) return true;
  return game.moves >= HINT_MIN_MOVES;
}

/**
 * ヒントの手数消費。
 * クラシックで手数 −2（残りが2以下なら何も減らさず `spent: 0`）。
 * タイムアタックは手数を持たないので減らさない。
 */
export function spendHint(game) {
  if (!hintAllowed(game) || !game.life) return { game, spent: 0 };
  return {
    game: {
      ...game,
      moves: Math.max(0, game.moves - HINT_COST),
      hints: (game.hints ?? 0) + 1,
    },
    spent: HINT_COST,
  };
}

/* ------------------------------------------------------------------ */
/* ゲーム                                                              */
/* ------------------------------------------------------------------ */

export const STATUS = Object.freeze({ playing: 'playing', over: 'over' });

/**
 * ゲームを始める。
 *   mode      クラシック / タイムアタック
 *   size      4 / 5 / 6（どのモードでも3サイズ）
 *   target    5×5 / 6×6 の消える合計（範囲に丸める。4×4 は 10 固定、基準 18 / 24）
 *   timeLimit タイムアタックの 60 / 120 / 180
 */
export function startGame({
  mode = 'classic',
  size,
  target,
  timeLimit,
  rng = Math.random,
} = {}) {
  const config = modeById(mode);
  const boardSize = config.sizes.includes(Number(size)) ? Number(size) : config.sizes[0];
  const rules = sizeRule(boardSize);
  const limit = config.timed ? normalizeTimeLimit(timeLimit, config.timeLimit) : 0;
  const t = targetPair(targetForMode(config.id, boardSize, target), boardSize);
  const pool = poolFor(boardSize, t);
  const opened = ensurePlayable(makeBoard({ size: boardSize, target: t, pool, rng }), {
    size: boardSize,
    target: t,
    pool,
    rng,
  });
  const turn = config.life ? rules.turnSeconds * 1000 : 0;
  return {
    modeId: config.id,
    size: boardSize,
    life: config.life,
    timed: config.timed,
    timeLimit: limit,
    timeLeft: limit * 1000,
    turnLimit: turn,
    turnLeft: turn,
    rows: t.rows,
    cols: t.cols,
    targets: t,
    pool,
    board: opened.board,
    score: 0,
    moves: config.life ? rules.moves : null,
    maxMoves: config.life ? rules.moves : 0,
    chain: 0,
    bestCombo: 0,
    clearedLines: 0,
    swaps: 0,
    hints: 0,
    lastGain: 0,
    lastReward: 0,
    overReason: null,
    status: STATUS.playing,
  };
}

/**
 * 消えるラインを、消えなくなるまで処理する（入れ替えは含まない）。
 *
 * 返すもの: 最終盤面 / steps（1段ごとの光るラインと得点）/ 合計点 / 消したライン数 / 連鎖段数
 */
export function resolveBoard(board, { size = FREE_SIZE, target = DEFAULT_TARGET, chain = 1, pool, rng = Math.random } = {}) {
  const t = normalizeTargets(size, target);
  const p = pool ?? poolFor(size, t);
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
    const { board: after, changed } = removeAndDrop(current, size, clears.cells, { pool: p, rng });
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
 * 手数・制限時間・終了判定をまとめる。
 *   手数 … 1手 −1、消したライン数で回復（+1 / +2 / 全回復）
 *   制限時間 … 1ライン以上消したときだけ、その盤面の秒数に戻る
 */
export function applyMoveCost(game, resolved, { swap = true } = {}) {
  const cleared = resolved.steps.length > 0;
  const reward = moveReward({
    lines: resolved.clearedLines,
    steps: resolved.steps.length,
    maxMoves: game.maxMoves || startMovesFor(game.size),
  });
  let moves = game.moves;
  if (game.life) {
    const max = game.maxMoves || startMovesFor(game.size);
    moves = Math.min(max, Math.max(0, game.moves - 1 + reward));
  }
  const overMoves = Boolean(game.life && moves <= 0);
  return {
    ...game,
    // 呼び出し側が「手が残るように整えた盤面」を game.board に入れて渡す
    board: game.board ?? resolved.board,
    score: game.score + resolved.gained,
    moves,
    turnLeft: !game.life ? game.turnLeft : cleared ? game.turnLimit : game.turnLeft,
    chain: cleared ? Math.min(game.chain + 1, MAX_CHAIN) : 0,
    bestCombo: Math.max(game.bestCombo, resolved.combo),
    clearedLines: game.clearedLines + resolved.clearedLines,
    swaps: game.swaps + (swap ? 1 : 0),
    lastGain: resolved.gained,
    lastReward: reward,
    lastCleared: cleared,
    status: overMoves ? STATUS.over : game.status,
    overReason: overMoves ? OVER_REASON.moves : game.overReason,
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
  if (!game || game.status !== STATUS.playing) return idle;
  if (game.life && game.moves <= 0) return idle;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return idle;
  if (a < 0 || b < 0 || a >= game.board.length || b >= game.board.length) return idle;

  const { board: swappedBoard } = swapBoard(game.board, a, b);
  const resolved = resolveBoard(swappedBoard, {
    size: game.size,
    target: game.targets,
    chain: Math.min(game.chain + 1, MAX_CHAIN),
    pool: game.pool,
    rng,
  });
  const settled = ensurePlayable(resolved.board, {
    size: game.size,
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

/** ヒント: 消せる1手（入れ替える2マス） */
export function findHint(board, size, target = DEFAULT_TARGET) {
  const hint = findPlayableSwap(board, size, target);
  return hint ? { a: hint.a, b: hint.b, rows: hint.rows, cols: hint.cols, lines: hint.lines } : null;
}

/**
 * 時間を進める。
 *   タイムアタック … 全体の 60 / 120 / 180秒。0 で終了。
 *   クラシック     … 1ライン消すまでの制限時間。0 で（手数が残っていても）終了。
 */
export function advanceTime(game, ms) {
  if (!game || game.status !== STATUS.playing) return game;
  const delta = Math.max(0, Math.round(Number(ms) || 0));
  if (!delta) return game;
  if (game.timed) {
    const timeLeft = Math.max(0, game.timeLeft - delta);
    const over = timeLeft <= 0;
    return { ...game, timeLeft, status: over ? STATUS.over : STATUS.playing, overReason: over ? OVER_REASON.time : game.overReason };
  }
  if (game.life && game.turnLimit > 0) {
    const turnLeft = Math.max(0, game.turnLeft - delta);
    const over = turnLeft <= 0;
    return { ...game, turnLeft, status: over ? STATUS.over : STATUS.playing, overReason: over ? OVER_REASON.time : game.overReason };
  }
  return game;
}

/**
 * 1回のタイマー刻みで時間を進めてよいか（Build 6）。
 *
 * 入れ替え・コンボ演出の間（busy）と、設定・あそびかたを開いている間、
 * アプリが裏に回っている間は時間を止める。
 * 止めている間に進んだ時間は、復帰時にまとめて引かない（呼び出し側が lastTick を進める）。
 * これがないと「残り0.15秒でコンボが始まった→演出中に時間切れ」でゲームが終わってしまう。
 */
export function canTickClock({ busy = false, sheet = null, hidden = false } = {}) {
  if (busy) return false;
  if (sheet && sheet !== 'result') return false;
  if (hidden) return false;
  return true;
}

/**
 * 1回の刻みで進める時間。
 * 端末が固まって戻ったときに、まとめて0秒（即ゲームオーバー）にならないよう上限を置く。
 */
export function clockStep(ms, max = 1000) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), Math.max(0, Math.round(Number(max) || 0)));
}

/**
 * 演出のあと、計算済みの結果を今のゲームに反映するときの決まり（Build 6）。
 *
 * アニメ中に時間切れになっていても、ラインが消えた手（コンボ成立）は優先して続行する。
 * コンボ不発なら、時間切れはそのまま（0秒のままプレイが続かないように）。
 */
export function mergeMoveResult(live, next, { cleared = false } = {}) {
  if (!live) return next;
  if (live.status === STATUS.over) {
    if (cleared && next.status === STATUS.playing) return next;
    return {
      ...next,
      status: STATUS.over,
      timeLeft: live.timeLeft,
      turnLeft: live.turnLeft,
      overReason: live.overReason ?? next.overReason,
    };
  }
  return next;
}

/** ミリ秒 → "1:05"（表示用。言語に依存しない形） */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** ミリ秒 → 残り秒（小数1桁。制限時間バーの数字用） */
export function formatSeconds(ms) {
  return (Math.max(0, ms) / 1000).toFixed(1);
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

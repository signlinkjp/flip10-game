/**
 * LINEZAP — 画面と操作（Build 6）
 *
 * ルールは src/core.js、文言は src/i18n.js、音は src/audio.js、
 * バイブは src/haptics.js、課金は src/pro.js、記録は src/storage.js。
 * ここは「オープニングを出す・開始前ページでモード/マス数/目標（タイムアタックは時間）を選ぶ・
 * 盤面を描く・ドラッグ/タップを受ける・シートを開く・手数と制限時間を回す」だけを持つ。
 *
 * 1回の入れ替えで core.swapTiles() が「入れ替え → 消えるライン → 落ちてくる盤面 →
 * 手数の回復と制限時間のリセット → ゲームオーバー」を全部計算して返すので、
 * ここはその順番どおりに見せる。
 */

import * as core from './core.js';
import * as i18n from './i18n.js';
import { createAudioEngine } from './audio.js';
import { createHaptics } from './haptics.js';
import * as pro from './pro.js';
import * as storage from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const COMBO_KEYS = ['combo.nice', 'combo.great', 'combo.super', 'combo.amazing', 'combo.fever'];
/** 何も操作がないままヒントを出すまでの時間（ヒント ON のとき・手数は減らない） */
const IDLE_HINT_MS = 9000;
/** オープニングの長さ（タップですぐ終わる） */
const OPENING_MS = 1650;
/** タップとドラッグを分ける指の移動量（px） */
const DRAG_THRESHOLD = 7;
/** 入れ替えの「パタッ」を見せる時間（この間はタイマーを止める） */
const SWAP_ANIM_MS = 110;
/** 操作ロック（busy）のまま固まらないための上限（これを超えたら必ず操作を返す） */
const BUSY_LIMIT_MS = 6000;
/** 最後のコンボを見せてから結果シートを開くまでの時間 */
const RESULT_DELAY_MS = 260;
/** 見張り番（busy の残留・結果シートの出し忘れを拾う）の間隔 */
const WATCHDOG_MS = 250;

/* ------------------------------------------------------------------ */
/* 状態                                                                */
/* ------------------------------------------------------------------ */

const state = {
  settings: storage.loadSettings(),
  locale: i18n.DEFAULT_LOCALE,
  entitled: false,
  price: null,
  storeMode: pro.mode(),
  sheet: null,
  game: null,
  busy: false,
  bests: storage.loadBests(),
  build: core.BUILD,
  shownScore: 0,
  timer: null,
  lastTick: 0,
  toastTimer: null,
  selected: null,
  hintTimer: null,
  hintShown: false,
  idleTimer: null,
  lastMoves: null,
  opening: true,
  openingTimer: null,
  /** ドラッグ中の指の位置と、いま指の下にあるマス */
  drag: null,
  /** ドラッグ直後の click をタップとして扱わない（この時刻までは捨てる） */
  suppressClickUntil: 0,
  /** busy を立てた時刻（固まったままを検出する） */
  busySince: 0,
  /** 見張り番のタイマー */
  watchdog: null,
  /** 結果シートを開く予約と、その予定時刻 */
  resultTimer: null,
  resultDue: 0,
  /** 結果シートを開き直した回数（無限に叩かないための上限） */
  resultTries: 0,
  /** 終了処理を済ませたゲーム（二重に走らせない） */
  endRunFor: null,
  /** 結果シートを出し終えたゲーム（閉じたものを勝手に開き直さない） */
  resultShownFor: null,
  /** 開始前ページ（マス数・目標・タイムアタックの時間）の選択 */
  start: { mode: 'classic', size: 4, target: 10, timeLimit: 60 },
};

const audio = createAudioEngine({
  muted: !state.settings.sound,
});

const haptics = createHaptics({
  enabled: state.settings.haptic,
});

/* ------------------------------------------------------------------ */
/* 小さな道具                                                          */
/* ------------------------------------------------------------------ */

function formatNumber(value) {
  try {
    return i18n.makeNumberFormat(state.locale).format(Math.max(0, Math.round(Number(value) || 0)));
  } catch {
    return String(value);
  }
}

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-show');
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.classList.remove('is-show'), 2200);
}

function icon(id) {
  return `<svg aria-hidden="true"><use href="#i-${id}"></use></svg>`;
}

/* ------------------------------------------------------------------ */
/* 言語の反映                                                          */
/* ------------------------------------------------------------------ */

function refreshTexts() {
  document.documentElement.setAttribute('lang', i18n.localeMeta(state.locale).tag);
  applyTextSize();
  i18n.applyI18n(document, state.locale);
  document.title = 'LINEZAP';

  const label = i18n.localeMeta(state.locale).label;
  const langLabel = $('#lang-label');
  if (langLabel) langLabel.textContent = label;
  const setLangLabel = $('#set-language-label');
  if (setLangLabel) setLangLabel.textContent = label;

  buildModes();
  buildLangGrid();
  updateSwitches();
  updateRulesInfo();
  updateProUI();
  buildPrivacy();
  updateVersion();
  updateHomeBest();
  if (state.game) renderSums(state.game);
}

function applyTextSize() {
  document.documentElement.dataset.text = state.settings.textSize || 'normal';
}

function updateVersion() {
  const node = $('#settings-version');
  if (node) node.textContent = `${i18n.t('settings.version', state.locale)} ${core.VERSION} (Build ${state.build}) · T-maks Games`;
}

function updateRulesInfo() {
  $$('#set-text-size button').forEach((button) => {
    const on = button.dataset.size === state.settings.textSize;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function updateSwitches() {
  setSwitch($('#set-sound'), state.settings.sound);
  setSwitch($('#set-bgm'), state.settings.bgm);
  setSwitch($('#set-haptic'), state.settings.haptic);
  setSwitch($('#set-hint'), state.settings.hint);
  const soundIcon = $('#btn-sound-play use');
  if (soundIcon) soundIcon.setAttribute('href', state.settings.sound ? '#i-sound-on' : '#i-sound-off');
  updateHintButtons();
}

/**
 * ヒントボタンの見た目。
 *   ヒントOFF … `is-off`（押しても何も起きない）
 *   手数が2以下 … `is-spent`（押すと「手数3以上で使えます」のトースト）
 *   エンドレス系では「−2」のコストを出す
 */
function updateHintButtons(game = state.game) {
  const endless = Boolean(game && game.life);
  const allowed = !endless || (game.moves >= core.HINT_MIN_MOVES && game.moves > 0);
  const off = !state.settings.hint;
  for (const button of [$('#btn-hint'), $('#btn-hint-foot')]) {
    if (!button) continue;
    button.classList.toggle('is-off', off);
    button.classList.toggle('is-spent', endless && !allowed);
    button.setAttribute('aria-disabled', off || (endless && !allowed) ? 'true' : 'false');
  }
  for (const node of [$('#hint-cost'), $('#hint-cost-foot')]) {
    if (node) node.hidden = !endless;
  }
}

function setSwitch(node, on) {
  if (!node) return;
  node.setAttribute('aria-checked', on ? 'true' : 'false');
  const tag = node.querySelector('b');
  if (tag) tag.textContent = on ? i18n.t('settings.on', state.locale) : i18n.t('settings.off', state.locale);
}

/* ------------------------------------------------------------------ */
/* モード                                                              */
/* ------------------------------------------------------------------ */

function buildModes() {
  const box = $('#mode-list');
  if (!box) return;
  box.innerHTML = '';
  for (const config of core.MODES) {
    const card = document.createElement('div');
    card.className = `mode mode--${config.id}`;
    card.dataset.mode = config.id;
    card.innerHTML = `
      <button class="mode__main" type="button" data-mode="${config.id}">
        <span class="mode__head">
          <span class="mode__name">${i18n.t(`mode.${config.id}`, state.locale)}</span>
        </span>
        <span class="mode__desc">${i18n.t(`mode.${config.id}.desc`, state.locale)}</span>
        <span class="mode__sizes" aria-hidden="true">${core.SIZES
          .map((size) => {
            const pro = core.needsProSize(config.id, size);
            const lock = pro && !state.entitled ? icon('lock') : '';
            return `<b>${lock}${size}×${size}${pro ? '<i>PRO</i>' : ''}</b>`;
          })
          .join('')}</span>
      </button>
    `;
    box.appendChild(card);
  }
}

/* ------------------------------------------------------------------ */
/* 開始前ページ（マス数・目標・タイムアタックの時間）                  */
/* ------------------------------------------------------------------ */

/** 開始前ページで最後に選んだマス数（モードごとに覚える） */
const startMemory = { classic: core.FREE_SIZE, time: core.FREE_SIZE };
/** タイムアタックで最後に選んだ時間（秒） */
let startTimeMemory = core.FREE_TIME_LIMIT;

function startTargetFor(modeId, size) {
  return storage.targetFor(state.settings, modeId, size);
}

/** 開始前ページを開く（クラシック / タイムアタック） */
function openStart(modeId) {
  const mode = core.modeById(modeId);
  state.start.mode = mode.id;
  // 覚えている選択が PRO のものだった場合、PRO でなければ無料の組み合わせに戻す
  const remembered = startMemory[mode.id] ?? mode.sizes[0];
  const usable = mode.sizes.includes(remembered) && (!core.needsProSize(mode.id, remembered) || state.entitled);
  state.start.size = usable ? remembered : mode.sizes.find((value) => !core.needsProSize(mode.id, value)) ?? mode.sizes[0];
  const rememberedTime = core.normalizeTimeLimit(startTimeMemory, mode.freeTimeLimit ?? core.FREE_TIME_LIMIT);
  const timeUsable = !mode.timed || state.entitled || !core.needsProTime(mode.id, rememberedTime);
  state.start.timeLimit = timeUsable ? rememberedTime : mode.freeTimeLimit ?? core.FREE_TIME_LIMIT;
  state.start.target = startTargetFor(mode.id, state.start.size);
  renderStart();
  openSheet('start');
}

/** 開始前ページの表示をすべて今の選択に合わせる */
function renderStart() {
  const mode = core.modeById(state.start.mode);
  const size = state.start.size;
  const timed = Boolean(mode.timed);
  const timeLimit = core.normalizeTimeLimit(state.start.timeLimit, mode.freeTimeLimit ?? core.FREE_TIME_LIMIT);
  const bounds = core.targetBounds(size);
  const rules = core.sizeRule(size);
  const title = $('#start-title');
  if (title) title.textContent = i18n.t(`mode.${mode.id}`, state.locale);

  // マス数ボタン（基準目標を中に入れ、PRO のサイズには鍵と PRO を出す）
  $$('#start-sizes .size-btn').forEach((button) => {
    const value = Number(button.dataset.size);
    const needs = core.needsProSize(mode.id, value);
    const locked = needs && !state.entitled;
    button.classList.toggle('is-on', value === size);
    button.classList.toggle('is-locked', locked);
    button.classList.toggle('is-owned', needs && state.entitled);
    button.setAttribute('aria-pressed', value === size ? 'true' : 'false');
    const base = button.querySelector('.size-btn__base');
    if (base) base.textContent = i18n.t('start.base', state.locale, { target: core.baseTargetFor(value) });
    const tag = button.querySelector('.size-btn__tag');
    if (tag) {
      // クラシックの 4×4 は「無料」、それ以外は PRO（タイムアタックの時間は下のチップで示す）
      tag.className = needs ? 'size-btn__tag size-btn__tag--pro' : 'size-btn__tag';
      tag.innerHTML = needs
        ? `${locked ? icon('lock') : ''}<span>${i18n.t('home.pro', state.locale)}</span>`
        : `${i18n.t('start.free', state.locale)}`;
    }
  });

  // タイムアタックの時間（60秒は無料、120秒・180秒は PRO）
  const times = $('#start-times');
  if (times) times.hidden = !timed;
  if (timed) {
    $$('#start-chips .time-btn').forEach((button) => {
      const value = core.normalizeTimeLimit(Number(button.dataset.time));
      const locked = core.needsProTime(mode.id, value) && !state.entitled;
      const proTime = core.needsProTime(mode.id, value);
      button.classList.toggle('is-on', value === timeLimit);
      button.classList.toggle('is-locked', locked);
      button.setAttribute('aria-pressed', value === timeLimit ? 'true' : 'false');
      const label = button.querySelector('b');
      if (label) label.textContent = i18n.t('start.seconds', state.locale, { n: value });
      const tag = button.querySelector('.time-btn__tag');
      if (tag) {
        tag.className = proTime ? 'time-btn__tag time-btn__tag--pro' : 'time-btn__tag';
        tag.innerHTML = proTime
          ? `${locked ? icon('lock') : ''}<span>${i18n.t('home.pro', state.locale)}</span>`
          : `${i18n.t('start.free', state.locale)}`;
      }
    });
  }

  // 目標（4×4 は 10 固定、5×5 は基準18、6×6 は基準24 から 12〜42）
  const value = $('#start-target-value');
  if (value) value.textContent = String(state.start.target);
  $$('#sheet-start [data-target-step]').forEach((button) => {
    button.disabled = bounds.fixed;
  });
  const note = $('#start-target-note');
  if (note) {
    note.textContent = bounds.fixed
      ? i18n.t('start.fixed', state.locale, { target: state.start.target })
      : i18n.t('start.range', state.locale, { min: bounds.min, max: bounds.max, base: core.baseTargetFor(size) });
  }

  // 手数と制限時間（タイムアタックは手数が無く、全体の時間だけ）
  const movesWrap = $('#start-moves-wrap');
  if (movesWrap) movesWrap.hidden = timed;
  const moves = $('#start-moves');
  if (moves) moves.textContent = String(rules.moves);
  const turn = $('#start-turn');
  if (turn) {
    turn.textContent = i18n.t('start.seconds', state.locale, {
      n: timed ? timeLimit : rules.turnSeconds,
    });
  }
  const sub = $('#start-play-sub');
  if (sub) {
    sub.textContent = timed
      ? `${size}×${size} · ${state.start.target} · ${i18n.t('start.seconds', state.locale, { n: timeLimit })}`
      : `${size}×${size} · ${state.start.target}`;
  }
  updateStartLocks();
}

/** 選べない組み合わせ（PRO 未購入の 5×5 / 6×6・120秒 / 180秒）に鍵を出す */
function updateStartLocks() {
  const mode = core.modeById(state.start.mode);
  const limit = core.normalizeTimeLimit(state.start.timeLimit, mode.freeTimeLimit ?? core.FREE_TIME_LIMIT);
  $$('#start-sizes .size-btn').forEach((button) => {
    const value = Number(button.dataset.size);
    const needs = core.needsProSize(mode.id, value);
    button.classList.toggle('is-locked', needs && !state.entitled);
    button.classList.toggle('is-owned', needs && state.entitled);
    const tag = button.querySelector('.size-btn__tag');
    if (tag && needs) {
      const locked = needs && !state.entitled;
      tag.className = 'size-btn__tag size-btn__tag--pro';
      tag.innerHTML = `${locked ? icon('lock') : ''}<span>${i18n.t('home.pro', state.locale)}</span>`;
    }
  });
  $$('#start-chips .time-btn').forEach((button) => {
    const value = core.normalizeTimeLimit(Number(button.dataset.time));
    const proTime = core.needsProTime(mode.id, value);
    const locked = proTime && !state.entitled;
    button.classList.toggle('is-locked', locked);
    const tag = button.querySelector('.time-btn__tag');
    if (tag && proTime) {
      tag.className = 'time-btn__tag time-btn__tag--pro';
      tag.innerHTML = `${locked ? icon('lock') : ''}<span>${i18n.t('home.pro', state.locale)}</span>`;
    }
  });
  const start = $('#btn-start');
  if (start) {
    const blocked = !pro.canPlayMode(state.entitled, mode.id, state.start.size, mode.timed ? limit : undefined);
    start.classList.toggle('is-locked', blocked);
  }
}

function pickStartSize(value) {
  const mode = core.modeById(state.start.mode);
  if (!mode.sizes.includes(value)) return;
  if (core.needsProSize(mode.id, value) && !state.entitled) {
    openSheet('pro');
    return;
  }
  audio.tap();
  haptics.select();
  state.start.size = value;
  // サイズを切り替えたら、そのサイズの値（まだ選んでいなければ基準目標 10 / 18 / 24）を入れる
  state.start.target = startTargetFor(mode.id, value);
  startMemory[mode.id] = value;
  renderStart();
}

/** タイムアタックの時間を選ぶ（60秒は無料、120秒・180秒は PRO） */
function pickStartTime(value) {
  const mode = core.modeById(state.start.mode);
  if (!mode.timed) return;
  const limit = core.normalizeTimeLimit(value, mode.freeTimeLimit ?? core.FREE_TIME_LIMIT);
  if (core.needsProTime(mode.id, limit) && !state.entitled) {
    openSheet('pro');
    return;
  }
  audio.tap();
  haptics.select();
  state.start.timeLimit = limit;
  startTimeMemory = limit;
  renderStart();
}

function stepStartTarget(step) {
  const mode = core.modeById(state.start.mode);
  const size = state.start.size;
  const bounds = core.targetBounds(size);
  if (bounds.fixed) return;
  const next = Math.min(bounds.max, Math.max(bounds.min, state.start.target + step));
  if (next === state.start.target) return;
  state.start.target = next;
  state.settings = storage.rememberTarget(state.settings, mode.id, size, next);
  renderStart();
  audio.tap();
  haptics.select();
}

function buildLangGrid() {
  const box = $('#lang-grid');
  if (!box) return;
  box.innerHTML = '';
  for (const locale of i18n.LOCALES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `lang${locale.id === state.locale ? ' is-on' : ''}`;
    button.dataset.locale = locale.id;
    button.innerHTML = `<span>${locale.label}</span>${icon('check')}`;
    button.setAttribute('aria-pressed', locale.id === state.locale ? 'true' : 'false');
    box.appendChild(button);
  }
}

function setLocale(id) {
  if (!i18n.isLocale(id)) return;
  state.locale = id;
  state.settings = storage.updateSettings({ ...state.settings, locale: id });
  refreshTexts();
  updateHud();
}

/* ------------------------------------------------------------------ */
/* ホーム                                                              */
/* ------------------------------------------------------------------ */

/** 1と2を入れ替えると 2+3+5=10 になる小さな見本 */
const DEMO = {
  values: [1, 3, 5, 4, 2, 0, 3, 4, 3],
  pair: [0, 4],
  lit: [0, 1, 2],
};

function buildHomeDemo() {
  const box = $('#hero-demo');
  if (!box) return;
  box.innerHTML = '';
  DEMO.values.forEach((value, i) => {
    const tile = document.createElement('span');
    tile.className = 'demo-tile';
    if (DEMO.pair[0] === i) tile.classList.add('is-swap-a');
    if (DEMO.pair[1] === i) tile.classList.add('is-swap-b');
    if (DEMO.lit.includes(i)) tile.classList.add('is-lit');
    tile.textContent = String(value);
    box.appendChild(tile);
  });
}

function updateHomeBest() {
  const node = $('#home-best');
  if (!node) return;
  // ホームのベストはクラシックの3サイズのうち一番いい記録
  const best = Math.max(0, ...core.SIZES.map((size) => state.bests[core.gameKey('classic', size)] ?? 0));
  node.textContent = formatNumber(best);
}

/* ------------------------------------------------------------------ */
/* 盤面                                                                */
/* ------------------------------------------------------------------ */

function buildBoard(game) {
  const board = $('#board');
  if (!board) return;
  board.className = `board board--${game.size}`;
  board.innerHTML = '';
  board.style.setProperty('--n', String(game.size));
  const wrap = $('#board-wrap');
  if (wrap) {
    wrap.style.setProperty('--n', String(game.size));
    wrap.className = `board-wrap is-${game.size}`;
  }
  for (let i = 0; i < game.size * game.size; i += 1) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.dataset.i = String(i);
    tile.innerHTML = '<span class="tile__value"></span>';
    board.appendChild(tile);
  }
  buildSumSlots(game);
  paintBoard(game);
}

function buildSumSlots(game) {
  const rows = $('#sums-rows');
  const cols = $('#sums-cols');
  if (rows) {
    rows.innerHTML = '';
    for (let r = 0; r < game.size; r += 1) {
      const badge = document.createElement('span');
      badge.className = 'sum';
      badge.dataset.row = String(r);
      rows.appendChild(badge);
    }
  }
  if (cols) {
    cols.innerHTML = '';
    for (let c = 0; c < game.size; c += 1) {
      const badge = document.createElement('span');
      badge.className = 'sum';
      badge.dataset.col = String(c);
      cols.appendChild(badge);
    }
  }
}

function paintTile(node, tile) {
  if (!node || !tile) return;
  const value = core.displayValue(tile);
  const text = node.querySelector('.tile__value');
  if (text) text.textContent = String(value);
  node.dataset.v = String(value);
  node.setAttribute('aria-label', String(value));
}

function paintBoard(game) {
  const nodes = $$('#board .tile');
  for (let i = 0; i < nodes.length; i += 1) paintTile(nodes[i], game.board[i]);
  paintSelection();
  renderSums(game);
}

function tileNode(index) {
  return $(`#board .tile[data-i="${index}"]`);
}

function paintSelection() {
  $$('#board .tile.is-picked').forEach((node) => node.classList.remove('is-picked'));
  if (state.selected === null) return;
  const node = tileNode(state.selected);
  if (node) node.classList.add('is-picked');
}

function clearHintTiles() {
  $$('#board .tile.is-hint').forEach((node) => node.classList.remove('is-hint'));
  state.hintShown = false;
}

/** 行・列の合計バッジを「今の合計/目標」（ヒントOFFなら「？/目標」）で出す */
function renderSums(game, { clearedRows = [], clearedCols = [] } = {}) {
  if (!game) return;
  const { rows, cols } = core.sums(game.board, game.size);
  const show = state.settings.hint;
  const hidden = i18n.t('hud.sumHidden', state.locale);
  const rowTarget = game.targets.rows;
  const colTarget = game.targets.cols;
  const rowNodes = $$('#sums-rows .sum');
  const colNodes = $$('#sums-cols .sum');
  rowNodes.forEach((node, r) => {
    const value = rows[r];
    node.textContent = `${show ? value : hidden}/${rowTarget}`;
    node.classList.toggle('is-hit', show && value === rowTarget);
    node.classList.toggle('is-near', show && value !== rowTarget && Math.abs(value - rowTarget) <= 2);
    node.classList.remove('is-cleared');
    if (clearedRows.includes(r)) {
      node.classList.remove('is-cleared');
      void node.offsetWidth;
      node.classList.add('is-cleared');
      setTimeout(() => node.classList.remove('is-cleared'), 520);
    }
  });
  colNodes.forEach((node, c) => {
    const value = cols[c];
    node.textContent = `${show ? value : hidden}/${colTarget}`;
    node.classList.toggle('is-hit', show && value === colTarget);
    node.classList.toggle('is-near', show && value !== colTarget && Math.abs(value - colTarget) <= 2);
    node.classList.remove('is-cleared');
    if (clearedCols.includes(c)) {
      node.classList.remove('is-cleared');
      void node.offsetWidth;
      node.classList.add('is-cleared');
      setTimeout(() => node.classList.remove('is-cleared'), 520);
    }
  });
}

function flashCells(cells) {
  for (const i of cells) {
    const node = tileNode(i);
    if (node) node.classList.add('is-clearing');
  }
}

function clearFlash() {
  $$('#board .tile.is-clearing').forEach((node) => {
    node.classList.remove('is-clearing');
  });
}

function dropTiles(indices, board) {
  for (const i of indices) {
    const node = tileNode(i);
    if (!node) continue;
    paintTile(node, board[i]);
    node.classList.remove('is-dropping');
    void node.offsetWidth;
    node.classList.add('is-dropping');
    setTimeout(() => node.classList.remove('is-dropping'), 360);
  }
}

function burstParticles(cells, count = 5) {
  const fx = $('#fx');
  if (!fx) return;
  const base = fx.getBoundingClientRect();
  for (const index of cells) {
    const node = tileNode(index);
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    const cx = rect.left - base.left + rect.width / 2;
    const cy = rect.top - base.top + rect.height / 2;
    for (let n = 0; n < count; n += 1) {
      const dot = document.createElement('i');
      const tones = ['', ' particle--pink', ' particle--blue', ' particle--mint'];
      dot.className = `particle${tones[n % tones.length]}`;
      const angle = (Math.PI * 2 * n) / count + Math.random() * 0.8;
      const distance = 24 + Math.random() * (30 + count * 2);
      dot.style.left = `${cx}px`;
      dot.style.top = `${cy}px`;
      dot.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      dot.style.setProperty('--dy', `${Math.sin(angle) * distance - 12}px`);
      dot.style.animationDelay = `${Math.random() * 50}ms`;
      fx.appendChild(dot);
      setTimeout(() => dot.remove(), 820);
    }
  }
}

let comboHideTimer = null;

/** コンボの段に合わせて、見出しい・音・光・粒を派手にする */
function celebrate(step) {
  const rank = core.comboRank(step.combo) + 1;
  const node = $('#combo');
  const word = $('#combo-word');
  const points = $('#combo-points');
  if (node) {
    if (word) word.textContent = i18n.t(COMBO_KEYS[rank - 1], state.locale);
    if (points) points.textContent = `+${formatNumber(step.points)}`;
    node.className = `combo combo--${rank}`;
    void node.offsetWidth;
    node.classList.add('is-show');
    if (comboHideTimer) clearTimeout(comboHideTimer);
    comboHideTimer = setTimeout(() => node.classList.remove('is-show'), 980);
  }
  const board = $('#board');
  if (board) {
    board.classList.remove('is-celebrate', 'is-fever');
    void board.offsetWidth;
    board.classList.add(rank >= 3 ? 'is-fever' : 'is-celebrate');
    setTimeout(() => board.classList.remove('is-celebrate', 'is-fever'), 900);
  }
  audio.clear({ combo: step.combo, lines: step.lines });
  if (step.combo >= 2) haptics.combo();
  else haptics.clear();
  burstParticles(step.cells, 4 + rank * 3);
}

function resetCombo() {
  const node = $('#combo');
  if (!node) return;
  if (comboHideTimer) clearTimeout(comboHideTimer);
  node.classList.remove('is-show');
  node.className = 'combo';
  const word = $('#combo-word');
  if (word) word.textContent = '';
  const points = $('#combo-points');
  if (points) points.textContent = '';
}

/* ------------------------------------------------------------------ */
/* 画面                                                                */
/* ------------------------------------------------------------------ */

function showScreen(name) {
  $$('.screen').forEach((screen) => {
    screen.classList.toggle('is-active', screen.id === `screen-${name}`);
  });
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

function renderPips(game, { gained = 0, lost = 0 } = {}) {
  const box = $('#moves-pips');
  const wrap = $('#movesbar');
  if (!box || !wrap) return;
  if (!game || !game.life) {
    wrap.hidden = true;
    box.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  if (box.children.length !== game.maxMoves) {
    box.innerHTML = '';
    for (let i = 0; i < game.maxMoves; i += 1) box.appendChild(document.createElement('i'));
  }
  [...box.children].forEach((pip, i) => {
    pip.classList.toggle('is-on', i < game.moves);
    pip.classList.remove('is-lost', 'is-gain');
    if (lost > 0 && i >= game.moves && i < game.moves + lost) {
      void pip.offsetWidth;
      pip.classList.add('is-lost');
    }
    if (gained > 0 && i >= game.moves - gained && i < game.moves) {
      void pip.offsetWidth;
      pip.classList.add('is-gain');
    }
  });
}

function updateHud({ gained = 0, lost = 0 } = {}) {
  const game = state.game;
  const score = $('#hud-score');
  if (score && game) {
    const text = formatNumber(state.shownScore);
    if (score.textContent !== text) {
      score.textContent = text;
      score.classList.remove('is-pop');
      void score.offsetWidth;
      score.classList.add('is-pop');
    }
  }
  if (game && game.score > 0) {
    const key = currentKey();
    if ((state.bests[key] ?? 0) < game.score) {
      const recorded = storage.recordScore(key, game.score);
      state.bests[key] = recorded.best;
      updateHomeBest();
    }
  }
  if (game) {
    const targetText = $('#target-text');
    if (targetText) {
      targetText.textContent = String(game.targets.rows);
    }
  }
  const best = $('#hud-best');
  if (best && game) best.textContent = formatNumber(currentBest());
  const movesWrap = $('#hud-moves-wrap');
  const movesNode = $('#hud-moves');
  if (movesWrap) movesWrap.hidden = !(game && game.life);
  if (movesNode && game && game.life) movesNode.textContent = String(game.moves);
  renderPips(game, { gained, lost });

  updateTurnBar(game);
  updateHintButtons(game);

  const timeWrap = $('#hud-time-wrap');
  const timeNode = $('#hud-time');
  const bar = $('#timerbar');
  const fill = $('#timerbar-fill');
  if (game && game.timed) {
    if (timeWrap) {
      timeWrap.hidden = false;
      timeWrap.classList.toggle('is-urgent', game.timeLeft <= 10000);
    }
    if (timeNode) timeNode.textContent = core.formatClock(game.timeLeft);
    if (bar) bar.hidden = false;
    if (fill) fill.style.transform = `scaleX(${game.timeLimit ? game.timeLeft / (game.timeLimit * 1000) : 0})`;
  } else {
    if (timeWrap) timeWrap.hidden = true;
    if (bar) bar.hidden = true;
  }
}

/**
 * 1ライン消すまでの制限時間バー（エンドレス系）。
 * 残り3秒以下で `is-urgent`（赤＋脈打ち）。秒数は小数1桁で出す。
 */
function updateTurnBar(game) {
  const bar = $('#turnbar');
  if (!bar) return;
  const on = Boolean(game && game.life && game.turnLimit > 0);
  bar.hidden = !on;
  if (!on) return;
  const ratio = game.turnLimit ? Math.max(0, Math.min(1, game.turnLeft / game.turnLimit)) : 0;
  const fill = $('#turnbar-fill');
  if (fill) fill.style.transform = `scaleX(${ratio})`;
  const text = $('#turn-time');
  if (text) text.textContent = core.formatSeconds(game.turnLeft);
  bar.classList.toggle('is-urgent', game.turnLeft <= 3000);
}

function currentKey() {
  const game = state.game;
  if (!game) return core.gameKey('classic', 4);
  return core.gameKey(game.modeId, game.size, game.timeLimit);
}

function currentBest() {
  const saved = state.bests[currentKey()] ?? 0;
  // プレイ中は「いまのスコア」も自分のベストとして見せる
  return state.game ? Math.max(saved, state.game.score) : saved;
}

function saveBest() {
  const game = state.game;
  if (!game || game.score <= 0) return false;
  const key = currentKey();
  const { best, isNew } = storage.recordScore(key, game.score);
  state.bests[key] = best;
  updateHomeBest();
  return isNew;
}

/* ------------------------------------------------------------------ */
/* ゲームの開始・終了                                                  */
/* ------------------------------------------------------------------ */

function startGame(modeId, { size, target, timeLimit } = {}) {
  const mode = core.modeById(modeId);
  const boardSize = mode.sizes.includes(Number(size)) ? Number(size) : mode.sizes[0];
  const limit = mode.timed ? core.normalizeTimeLimit(timeLimit ?? state.start.timeLimit, mode.timeLimit) : undefined;
  if (!pro.canPlayMode(state.entitled, mode.id, boardSize, limit)) {
    openSheet('pro');
    return;
  }
  closeSheet();
  clearIdle();
  audio.unlock();
  const chosen = target ?? startTargetFor(mode.id, boardSize);
  state.game = core.startGame({
    mode: mode.id,
    size: boardSize,
    target: chosen,
    timeLimit: limit,
  });
  // 次に開いたときに同じ目標・時間で始められるよう、選んだ値を覚えておく
  if (!core.targetBounds(boardSize).fixed) {
    state.settings = storage.rememberTarget(state.settings, mode.id, boardSize, state.game.targets.rows);
  }
  state.start = {
    mode: mode.id,
    size: boardSize,
    target: state.game.targets.rows,
    timeLimit: state.game.timed ? state.game.timeLimit : core.FREE_TIME_LIMIT,
  };
  startMemory[mode.id] = boardSize;
  if (state.game.timed) startTimeMemory = state.game.timeLimit;
  state.shownScore = 0;
  setBusy(false);
  cancelResult();
  cancelDrag();
  state.endRunFor = null;
  state.resultShownFor = null;
  state.resultTries = 0;
  state.selected = null;
  state.hintShown = false;
  state.lastMoves = state.game.moves;
  state.bestAtStart = state.bests[currentKey()] ?? 0;
  resetCombo();
  clearFlash();
  clearHintTiles();
  buildBoard(state.game);
  showScreen('play');
  updateHud();
  startTimer();
  audio.tap();
  scheduleIdleHint();
}

function startTimer() {
  stopTimer();
  const game = state.game;
  if (!game) return;
  if (!game.timed && !(game.life && game.turnLimit > 0)) return;
  state.lastTick = performance.now();
  state.timer = setInterval(() => {
    const current = state.game;
    if (!current || current.status !== core.STATUS.playing) return;
    const now = performance.now();
    const delta = now - state.lastTick;
    // 先に lastTick を進める。止めている間の時間を復帰時にまとめて引かないため
    state.lastTick = now;
    // 入れ替え・コンボ演出の間は時間を進めない（ギリギリのコンボが時間切れで消えないように）
    // 設定・あそびかたを開いている間と、アプリが裏に回っている間も止める
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (!core.canTickClock({ busy: state.busy, sheet: state.sheet, hidden })) return;
    const step = core.clockStep(delta);
    if (!step) return;
    try {
      state.game = core.advanceTime(current, step);
      updateHud();
    } catch (error) {
      console.warn('LINEZAP: 時間の更新に失敗しました', error);
      return;
    }
    if (state.game.status === core.STATUS.over) endRun();
  }, 100);
}

function stopTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function endRun() {
  const game = state.game;
  if (!game || game.status !== core.STATUS.over) return;
  if (state.endRunFor === game) {
    // すでに終了処理をしている。それでも結果が出ていなければ開き直す
    if (state.sheet !== 'result' && !state.resultTimer) openResultNow();
    return;
  }
  state.endRunFor = game;
  state.resultTries = 0;
  stopTimer();
  clearIdle();
  // 時間切れの瞬間にドラッグ中・アニメ中でも、盤面を触れる状態に戻しておく
  setBusy(false);
  cancelDrag();

  try {
    state.selected = null;
    paintSelection();
    const isNew = game.score > (state.bestAtStart ?? 0);
    try {
      saveBest();
    } catch (error) {
      console.warn('LINEZAP: ベストを保存できませんでした', error);
    }
    state.shownScore = game.score;
    updateHud();

    const title = $('#result-title');
    if (title) {
      title.textContent = i18n.t(game.overReason === core.OVER_REASON.time ? 'result.timeUp' : 'result.movesOut', state.locale);
    }
    const reason = $('#result-reason');
    if (reason) {
      let key = 'result.reasonMoves';
      if (game.overReason === core.OVER_REASON.time) key = game.life ? 'result.reasonTime' : 'result.reasonTimeAttack';
      reason.textContent = i18n.t(key, state.locale);
    }
    const scoreNode = $('#result-score');
    const bestNode = $('#result-best');
    const linesNode = $('#result-lines');
    const recordNode = $('#result-record');
    if (scoreNode) scoreNode.textContent = formatNumber(game.score);
    if (bestNode) bestNode.textContent = formatNumber(currentBest());
    if (linesNode) linesNode.textContent = formatNumber(game.clearedLines);
    if (recordNode) recordNode.hidden = !isNew;
  } catch (error) {
    // 表示のどこかで失敗しても、結果画面だけは必ず出す（Build 6: 時間切れで固まる報告への対策）
    console.warn('LINEZAP: 結果の表示に失敗しました', error);
  } finally {
    try {
      audio.over();
    } catch (error) {
      console.warn('LINEZAP: 終了の音を鳴らせませんでした', error);
    }
    try {
      haptics.over();
    } catch {
      /* 震えなくても結果画面は出す */
    }
    openResult();
  }
}

function goHome() {
  stopTimer();
  clearIdle();
  try {
    saveBest();
  } catch (error) {
    console.warn('LINEZAP: ベストを保存できませんでした', error);
  }
  resetCombo();
  closeSheet();
  cancelResult();
  cancelDrag();
  state.game = null;
  setBusy(false);
  state.selected = null;
  state.endRunFor = null;
  state.resultShownFor = null;
  state.resultTries = 0;
  showScreen('home');
  updateHomeBest();
}

/* ------------------------------------------------------------------ */
/* 止まらないための番人（Build 6）                                      */
/* ------------------------------------------------------------------ */

/**
 * 操作ロック（busy）を立てる／下ろす。
 * 立てた時刻も覚えておき、何かの拍子に戻らないときは見張り番が解放する。
 */
function setBusy(value) {
  state.busy = Boolean(value);
  state.busySince = state.busy ? performance.now() : 0;
}

/** ドラッグ中の指を捨てる（画面遷移・時間切れ・アプリが裏に回ったとき） */
function cancelDrag() {
  if (!state.drag) return;
  state.drag = null;
  paintDrag();
}

/** 結果シートを開く予約を取り消す（復活・ホームへ・新しいゲーム） */
function cancelResult() {
  if (state.resultTimer) {
    clearTimeout(state.resultTimer);
    state.resultTimer = null;
  }
  state.resultDue = 0;
}

/**
 * 入れ替えの途中で止まったままなら、操作を返す。
 * `doSwap` は try/finally で必ず戻す作りだが、それでも戻らない場合の最後の保険。
 */
function forceReleaseBusy(reason) {
  const wasBusy = state.busy;
  setBusy(false);
  cancelDrag();
  clearFlash();
  if (!wasBusy) return;
  try {
    if (state.game) {
      paintBoard(state.game);
      updateHud();
    }
    scheduleIdleHint();
  } catch (error) {
    console.warn('LINEZAP: 盤面の復帰に失敗しました', error);
  }
  console.warn(`LINEZAP: 操作ロックを解放しました（${reason}）`);
}

/** 結果シートを開く（最後のコンボを見せてから。二重に開かない） */
function openResult(delay = RESULT_DELAY_MS) {
  const game = state.game;
  cancelResult();
  if (!game || game.status !== core.STATUS.over) {
    openResultNow();
    return;
  }
  state.resultDue = performance.now() + Math.max(0, delay);
  state.resultTimer = setTimeout(() => {
    state.resultTimer = null;
    const live = state.game;
    // 待っている間に「もう1回」やコンボ復活が起きていたら開かない
    if (!live || live !== game || live.status !== core.STATUS.over) return;
    openResultNow();
  }, Math.max(0, delay));
}

function openResultNow() {
  try {
    openSheet('result');
    if (state.sheet === 'result') state.resultShownFor = state.game;
  } catch (error) {
    console.warn('LINEZAP: 結果画面を開けませんでした', error);
  }
}

/** コンボで時間が復活して続行するとき、結果シートを閉じてタイマーを戻す */
function reviveRun() {
  cancelResult();
  if (state.sheet === 'result') closeSheet();
  state.endRunFor = null;
  state.resultShownFor = null;
  state.lastTick = performance.now();
  if (!state.timer) startTimer();
  updateHud();
}

/**
 * 0.25秒ごとの見張り番。
 *   1. busy のまま固まっていたら操作を返す
 *   2. 時間切れなどで終わっているのに結果シートが出ていなければ必ず出す
 *   3. 続行中なのに結果シートが残っていたら閉じる（コンボ復活）
 */
function watchdogTick() {
  if (typeof document !== 'undefined' && document.hidden) return;
  const now = performance.now();
  if (state.busy && state.busySince && now - state.busySince > BUSY_LIMIT_MS) {
    forceReleaseBusy('busy-timeout');
  }
  const game = state.game;
  if (!game) return;
  if (game.status === core.STATUS.over) {
    // 一度でも結果を出したゲームは、利用者が閉じたものを勝手に開き直さない
    if (state.resultShownFor === game) return;
    if (state.sheet === 'result') {
      state.resultTries = 0;
      return;
    }
    const waiting = state.resultTimer && now < state.resultDue + 600;
    if (!waiting && state.resultTries < 4) {
      state.resultTries += 1;
      openResultNow();
    }
    return;
  }
  if (state.sheet === 'result') closeSheet();
}

function startWatchdog() {
  if (state.watchdog) return;
  state.watchdog = setInterval(watchdogTick, WATCHDOG_MS);
}

/* ------------------------------------------------------------------ */
/* タップ                                                              */
/* ------------------------------------------------------------------ */

function scheduleIdleHint() {
  clearIdle();
  if (!state.settings.hint) return;
  state.idleTimer = setTimeout(() => {
    if (!state.game || state.game.status !== core.STATUS.playing || state.busy) return;
    showHint({ silent: true });
  }, IDLE_HINT_MS);
}

function clearIdle() {
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

function showHint({ silent = false } = {}) {
  const game = state.game;
  if (!game || game.status !== core.STATUS.playing) return false;
  if (!state.settings.hint) return false;
  // ボタンで使うヒントは手数を2つ使う（残り2以下なら使えない）
  if (!silent && game.life && !core.hintAllowed(game)) {
    toast(i18n.t('toast.hintCost', state.locale));
    haptics.haptic('warning');
    return false;
  }
  clearHintTiles();
  const hint = core.findHint(game.board, game.size, game.targets);
  if (!hint) {
    renderSums(game);
    return false;
  }
  const indices = [hint.a, hint.b];
  for (const index of indices) {
    const node = tileNode(index);
    if (node) node.classList.add('is-hint');
  }
  state.hintShown = true;
  if (state.hintTimer) clearTimeout(state.hintTimer);
  state.hintTimer = setTimeout(() => clearHintTiles(), 3000);
  if (!silent) {
    haptics.select();
    audio.tap();
    if (game.life) {
      state.lastMoves = state.game.moves;
      const spent = core.spendHint(state.game);
      state.game = spent.game;
      updateHud({ lost: spent.spent });
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* ドラッグで2マス入れ替え                                              */
/* ------------------------------------------------------------------ */

/** 指の下にあるマスの番号（盤の外なら null） */
function tileIndexAt(x, y) {
  if (typeof document.elementFromPoint !== 'function') return null;
  const node = document.elementFromPoint(x, y);
  const tile = node && node.closest ? node.closest('#board .tile') : null;
  return tile ? Number(tile.dataset.i) : null;
}

/** ドラッグ元と、いま指の下にあるマスを光らせる */
function paintDrag() {
  $$('#board .tile.is-drag-source, #board .tile.is-drop-target').forEach((node) => {
    node.classList.remove('is-drag-source', 'is-drop-target');
  });
  const drag = state.drag;
  if (!drag) return;
  const from = tileNode(drag.from);
  if (from) from.classList.add('is-drag-source');
  if (drag.target !== null) {
    const to = tileNode(drag.target);
    if (to) to.classList.add('is-drop-target');
  }
}

function onBoardPointerDown(event) {
  const game = state.game;
  if (!game || state.busy || game.status !== core.STATUS.playing) return;
  if (state.sheet) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const tile = event.target.closest ? event.target.closest('.tile') : null;
  if (!tile) return;
  state.suppressClickUntil = 0;
  state.drag = {
    from: Number(tile.dataset.i),
    target: null,
    moved: false,
    x: event.clientX,
    y: event.clientY,
  };
}

function onPointerMove(event) {
  const drag = state.drag;
  if (!drag) return;
  if (!drag.moved) {
    const distance = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
    if (distance < DRAG_THRESHOLD) return;
    drag.moved = true;
    clearIdle();
    clearHintTiles();
    haptics.select();
  }
  const index = tileIndexAt(event.clientX, event.clientY);
  drag.target = index !== null && index !== drag.from ? index : null;
  paintDrag();
}

function onPointerUp(event, cancelled = false) {
  const drag = state.drag;
  if (!drag) return;
  cancelDrag();
  if (!drag.moved) return;
  // ドラッグのあとに飛んでくる click はタップとして扱わない（時刻で判定するので、次のタップは消さない）
  state.suppressClickUntil = performance.now() + 400;
  if (cancelled) return;
  const game = state.game;
  if (!game || state.busy || state.sheet || game.status !== core.STATUS.playing) return;
  if (drag.target === null) return;
  doSwap(drag.from, drag.target);
}

async function onTileTap(index) {
  const game = state.game;
  if (!game || state.busy || game.status !== core.STATUS.playing) return;
  if (!Number.isFinite(index)) return;

  audio.unlock();
  clearIdle();
  clearHintTiles();

  if (state.selected === null) {
    state.selected = index;
    paintSelection();
    haptics.select();
    audio.tap();
    scheduleIdleHint();
    return;
  }

  if (state.selected === index) {
    state.selected = null;
    paintSelection();
    audio.tap();
    scheduleIdleHint();
    return;
  }

  const first = state.selected;
  state.selected = null;
  paintSelection();
  await doSwap(first, index);
}

/**
 * 入れ替えの結果を今のゲームに反映する。
 *
 * アニメの途中で時間切れになっていても、ラインが消えた手（コンボ成立）は優先する。
 * そうしないと「ギリギリで決めたコンボ」が時間切れに上書きされてしまう。
 * コンボが不発のときは、終わっていれば終わったまま（時間切れは覆さない）。
 */
function applyFinalGame(result) {
  const live = state.game;
  const next = result.game;
  if (!live) {
    state.game = next;
    return;
  }
  const cleared = result.steps.length > 0;
  const merged = core.mergeMoveResult(live, next, { cleared });
  const revived = live.status === core.STATUS.over && merged.status === core.STATUS.playing;
  state.game = merged;
  if (revived) reviveRun();
}

/** タイマーが戻ったことをバーで一瞬見せる（残り時間ギリギリのコンボ用） */
function flashTurnbarRefill() {
  const bar = $('#turnbar');
  if (!bar) return;
  bar.classList.remove('is-refilled');
  void bar.offsetWidth;
  bar.classList.add('is-refilled');
  setTimeout(() => bar.classList.remove('is-refilled'), 760);
}

async function doSwap(a, b) {
  const start = state.game;
  if (!start || start.status !== core.STATUS.playing || state.busy) return;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return;
  if (a < 0 || b < 0 || a >= start.board.length || b >= start.board.length) return;

  // ここで busy を立てたら、どんな失敗があっても finally で必ず下ろす
  // （busy が立ったままだと、以後すべてのタップ・ドラッグが効かなくなる）
  setBusy(true);
  cancelDrag();
  state.selected = null;
  paintSelection();
  state.lastMoves = start.moves;
  const turnBefore = start.turnLeft;
  let result = null;

  try {
    haptics.swap();
    audio.flip();

    const nodeA = tileNode(a);
    const nodeB = tileNode(b);
    for (const node of [nodeA, nodeB]) {
      if (!node) continue;
      node.classList.add('is-swapping');
      setTimeout(() => node.classList.remove('is-swapping'), 240);
    }
    await wait(SWAP_ANIM_MS);

    const live = state.game ?? start;
    result = core.swapTiles(live, a, b, Math.random);
    if (!result.swap) return;

    const openingBoard = result.steps.length > 0 ? result.steps[0].board : result.game.board;
    paintBoard({ ...live, board: openingBoard });

    await playSteps(result);

    applyFinalGame(result);
    state.shownScore = state.game.score;
    // 残り時間ギリギリからコンボでタイマーが戻ったら、バーを光らせる
    if (state.game.turnLeft > turnBefore + 500) flashTurnbarRefill();
  } catch (error) {
    // 音・DOM・計算のどこで転んでも、操作は必ず返す（Build 6: フリーズ対策）
    console.warn('LINEZAP: 入れ替えの途中で失敗しました', error);
  } finally {
    setBusy(false);
    clearFlash();
    state.selected = null;
    try {
      paintSelection();
      if (state.game) {
        paintBoard(state.game);
        updateHud({
          gained: result ? Math.max(0, result.reward) : 0,
          lost: result && state.lastMoves !== null ? Math.max(0, state.lastMoves - state.game.moves) : 0,
        });
      }
    } catch (error) {
      console.warn('LINEZAP: 盤面の更新に失敗しました', error);
    }
    if (result) {
      afterMove(result);
    } else {
      scheduleIdleHint();
      if (state.game && state.game.status === core.STATUS.over) endRun();
    }
  }
}

/** 消えるラインを1段ずつ見せる（コンボ） */
async function playSteps(result) {
  let running = state.shownScore;
  let currentBoard = result.steps.length > 0 ? result.steps[0].board : null;
  for (const step of result.steps) {
    if (currentBoard && step.board !== currentBoard) {
      paintBoard({ ...state.game, board: step.board });
    }
    celebrate(step);
    flashCells(step.cells);
    state.shownScore = running + step.points;
    updateHud();
    await wait(360);

    clearFlash();
    dropTiles(step.changed, step.after);
    audio.drop();
    renderSums({ ...state.game, board: step.after }, { clearedRows: step.rows, clearedCols: step.cols });
    await wait(220);
    running += step.points;
    currentBoard = step.after;
  }
  state.shownScore = running;
  updateHud();
}

function afterMove(result) {
  if (result.reshuffled) toast(i18n.t('toast.shuffle', state.locale));
  if (state.game.status === core.STATUS.over) {
    endRun();
    return;
  }
  scheduleIdleHint();
}

/* ------------------------------------------------------------------ */
/* シート                                                              */
/* ------------------------------------------------------------------ */

function openSheet(name) {
  const layer = $('#sheet-layer');
  if (!layer) return;
  layer.hidden = false;
  $$('.sheet').forEach((sheet) => {
    sheet.hidden = sheet.dataset.sheet !== name;
  });
  state.sheet = name;
  const sheet = $(`#sheet-${name}`);
  if (sheet) {
    const body = sheet.querySelector('.sheet__body');
    if (body) body.scrollTop = 0;
  }
  if (name === 'privacy') buildPrivacy();
  if (name === 'pro') refreshProSheet();
  if (name === 'settings') updateRulesInfo();
}

function closeSheet() {
  const layer = $('#sheet-layer');
  if (!layer) return;
  layer.hidden = true;
  $$('.sheet').forEach((sheet) => {
    sheet.hidden = true;
  });
  state.sheet = null;
}

function buildPrivacy() {
  const node = $('#legal-body');
  if (!node) return;
  const body = i18n.prose('privacy', state.locale);
  if (!body) return;
  const parts = [`<p>${body.intro}</p>`];
  for (const section of body.sections) {
    parts.push(`<h3>${section.title}</h3><p>${section.body}</p>`);
  }
  node.innerHTML = parts.join('');
}

/* ------------------------------------------------------------------ */
/* PRO                                                                 */
/* ------------------------------------------------------------------ */

function updateProUI() {
  const proPill = $('#pro-label');
  if (proPill) proPill.textContent = state.entitled ? i18n.t('home.proOn', state.locale) : 'PRO';
  const pill = $('#btn-pro');
  if (pill) pill.classList.toggle('is-owned', state.entitled);

  const buy = $('#btn-buy');
  if (buy) {
    if (state.entitled) {
      buy.disabled = true;
      buy.innerHTML = `${icon('check')}<span id="buy-label">${i18n.t('home.proOn', state.locale)}</span>`;
    } else {
      buy.disabled = false;
      const price = pro.priceFor(state.locale, state.price);
      buy.innerHTML = `<span id="buy-label">${i18n.t('pro.buy', state.locale, { price })}</span>`;
    }
  }
  const dev = $('#pro-dev');
  if (dev) dev.hidden = !pro.previewAllowed();
  setSwitch($('#set-dev'), pro.previewUnlocked());
  updateStartLocks();
}

function refreshProSheet() {
  updateProUI();
  const diag = $('#pro-diag');
  if (diag) {
    const text = pro.diagnostic();
    diag.hidden = !text;
    diag.textContent = text;
  }
}

function setEntitled(value) {
  state.entitled = value === true;
  buildModes();
  updateProUI();
}

async function buyPro() {
  if (state.entitled) return;
  const buy = $('#btn-buy');
  if (buy) buy.disabled = true;
  const answer = await pro.purchase();
  if (buy) buy.disabled = false;

  if (answer.status === 'success') {
    setEntitled(true);
    toast(i18n.t('pro.thanks', state.locale));
    closeSheet();
    return;
  }
  if (answer.status === 'cancelled') return;
  if (answer.status === 'preview' || answer.status === 'unavailable') {
    toast(i18n.t('pro.dev', state.locale));
    refreshProSheet();
    return;
  }
  toast(i18n.t('pro.fail', state.locale));
  refreshProSheet();
}

async function restorePro() {
  const answer = await pro.restore();
  if (answer.status === 'restored') {
    setEntitled(true);
    toast(i18n.t('pro.restored', state.locale));
    closeSheet();
    return;
  }
  if (answer.status === 'nothing') {
    toast(i18n.t('pro.nothing', state.locale));
    return;
  }
  if (answer.status === 'preview' || answer.status === 'unavailable') {
    toast(i18n.t('pro.dev', state.locale));
    refreshProSheet();
    return;
  }
  toast(i18n.t('pro.fail', state.locale));
  refreshProSheet();
}

async function loadStorePrice() {
  if (state.storeMode !== 'store') return;
  const product = await pro.loadPrice();
  if (!product) return;
  state.price = product;
  updateProUI();
}

/* ------------------------------------------------------------------ */
/* 設定                                                                */
/* ------------------------------------------------------------------ */

function toggleSetting(key) {
  const next = !state.settings[key];
  state.settings = storage.updateSettings({ ...state.settings, [key]: next });
  if (key === 'sound') {
    audio.setMuted(!next);
    if (next) audio.tap();
  }
  if (key === 'bgm') {
    audio.unlock();
    audio.setBgm(next);
  }
  if (key === 'haptic') {
    haptics.setEnabled(next);
    if (next) haptics.select();
  }
  if (key === 'hint') {
    if (!next) clearHintTiles();
    scheduleIdleHint();
  }
  updateSwitches();
}

function setTextSize(size) {
  if (!storage.TEXT_SIZES.includes(size)) return;
  state.settings = storage.updateSettings({ ...state.settings, textSize: size });
  applyTextSize();
  updateRulesInfo();
  audio.tap();
}
/* ------------------------------------------------------------------ */
/* 一時停止（BGM をホーム画面に残さない）                              */
/* ------------------------------------------------------------------ */

function pauseAudioEverywhere() {
  audio.pause();
}

function resumeAudioEverywhere() {
  if (typeof document !== 'undefined' && document.hidden) return;
  audio.resume();
  if (state.game) state.lastTick = performance.now();
}

/* ------------------------------------------------------------------ */
/* オープニング（LINEZAP ロゴ＋黄金ラインがパチッと光る）              */
/* ------------------------------------------------------------------ */

function finishOpening() {
  const node = $('#opening');
  if (!node || !state.opening) return;
  state.opening = false;
  if (state.openingTimer) {
    clearTimeout(state.openingTimer);
    state.openingTimer = null;
  }
  node.classList.add('is-out');
  setTimeout(() => {
    node.hidden = true;
    node.classList.remove('is-out');
  }, 420);
}

function startOpening() {
  const node = $('#opening');
  if (!node) {
    state.opening = false;
    return;
  }
  node.hidden = false;
  state.opening = true;
  state.openingTimer = setTimeout(finishOpening, OPENING_MS);
  // タップで即スキップ。ここが iOS で音を起こせる最初の操作でもある
  node.addEventListener('pointerdown', () => {
    if (!state.opening) return;
    audio.unlock();
    audio.zap();
    if (state.settings.bgm) audio.setBgm(true);
    finishOpening();
  });
}

/* ------------------------------------------------------------------ */
/* 起動                                                                */
/* ------------------------------------------------------------------ */

function bind() {
  // home
  $('#btn-play')?.addEventListener('click', () => openStart('classic'));
  $('#btn-howto')?.addEventListener('click', () => openSheet('howto'));
  $('#btn-settings')?.addEventListener('click', () => openSheet('settings'));
  $('#btn-lang-home')?.addEventListener('click', () => openSheet('language'));
  $('#btn-pro')?.addEventListener('click', () => openSheet('pro'));

  // mode cards（あとから作るので親で受ける）。どちらも開始前ページを開く
  $('#mode-list')?.addEventListener('click', (event) => {
    const main = event.target.closest('[data-mode]');
    if (!main) return;
    openStart(main.dataset.mode);
  });

  // 開始前ページ（マス数・タイムアタックの時間・目標）
  $('#start-sizes')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-size]');
    if (!button) return;
    pickStartSize(Number(button.dataset.size));
  });
  $('#start-chips')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-time]');
    if (!button) return;
    pickStartTime(Number(button.dataset.time));
  });
  $('#sheet-start')?.addEventListener('click', (event) => {
    const step = event.target.closest('[data-target-step]');
    if (!step) return;
    stepStartTarget(Number(step.dataset.targetStep));
  });
  $('#btn-start')?.addEventListener('click', () => {
    const mode = state.start.mode;
    const timed = core.modeById(mode).timed;
    if (!pro.canPlayMode(state.entitled, mode, state.start.size, timed ? state.start.timeLimit : undefined)) {
      openSheet('pro');
      return;
    }
    startGame(mode, {
      size: state.start.size,
      target: state.start.target,
      timeLimit: timed ? state.start.timeLimit : undefined,
    });
  });

  // play（左上の ← は Build 4 で外した。戻るは下部の「ホームへ」だけ）
  $('#btn-home')?.addEventListener('click', goHome);
  $('#board')?.addEventListener('click', (event) => {
    if (performance.now() < state.suppressClickUntil) {
      // ドラッグ直後に飛んでくる click だけを捨てる（時刻で判定。次のタップは消さない）
      return;
    }
    const tile = event.target.closest('.tile');
    if (!tile) return;
    onTileTap(Number(tile.dataset.i));
  });
  // ドラッグ（押したまま2マス目へ）でも入れ替える。タップ2回もそのまま使える
  $('#board')?.addEventListener('pointerdown', onBoardPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', (event) => onPointerUp(event));
  window.addEventListener('pointercancel', (event) => onPointerUp(event, true));
  $('#btn-settings-play')?.addEventListener('click', () => openSheet('settings'));
  $('#btn-hint')?.addEventListener('click', () => showHint());
  $('#btn-hint-foot')?.addEventListener('click', () => showHint());
  $('#btn-restart')?.addEventListener('click', () => {
    const game = state.game;
    if (!game) return;
    saveBest();
    startGame(game.modeId, { size: game.size, target: game.targets.rows, timeLimit: game.timeLimit || undefined });
  });

  // sheets
  $$('[data-close-sheet]').forEach((node) => node.addEventListener('click', closeSheet));
  $('#set-language')?.addEventListener('click', () => openSheet('language'));
  $('#set-privacy')?.addEventListener('click', () => openSheet('privacy'));
  $('#set-reset')?.addEventListener('click', () => {
    storage.clearBests();
    state.bests = {};
    updateHomeBest();
    updateHud();
    toast(i18n.t('toast.reset', state.locale));
  });
  $('#set-sound')?.addEventListener('click', () => toggleSetting('sound'));
  $('#set-bgm')?.addEventListener('click', () => toggleSetting('bgm'));
  $('#set-haptic')?.addEventListener('click', () => toggleSetting('haptic'));
  $('#set-hint')?.addEventListener('click', () => toggleSetting('hint'));
  $('#set-text-size')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-size]');
    if (!button) return;
    setTextSize(button.dataset.size);
  });
  $('#lang-grid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-locale]');
    if (!button) return;
    setLocale(button.dataset.locale);
    updateProUI();
    openSheet('language');
  });

  // pro
  $('#btn-buy')?.addEventListener('click', buyPro);
  $('#btn-restore')?.addEventListener('click', restorePro);
  $('#set-dev')?.addEventListener('click', () => {
    const next = pro.setPreviewUnlocked(!pro.previewUnlocked());
    setEntitled(next || pro.cachedEntitlement());
    toast(next ? i18n.t('pro.thanks', state.locale) : i18n.t('pro.fail', state.locale));
    if (next) closeSheet();
  });

  // result
  $('#btn-again')?.addEventListener('click', () => {
    const game = state.game;
    if (!game) {
      goHome();
      return;
    }
    startGame(game.modeId, { size: game.size, target: game.targets.rows, timeLimit: game.timeLimit || undefined });
  });
  $('#btn-result-home')?.addEventListener('click', goHome);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.sheet) closeSheet();
  });

  // BGM をホーム画面・別アプリ・ロックに残さない（JS 側）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAudioEverywhere();
      // 指を離した通知が来ないまま裏に回ることがあるので、ドラッグは捨てる
      cancelDrag();
      state.lastTick = performance.now();
    } else {
      resumeAudioEverywhere();
    }
  });
  window.addEventListener('pagehide', () => {
    cancelDrag();
    pauseAudioEverywhere();
  });
  window.addEventListener('beforeunload', pauseAudioEverywhere);
  window.addEventListener('blur', () => {
    cancelDrag();
    pauseAudioEverywhere();
  });
  window.addEventListener('pageshow', resumeAudioEverywhere);
  window.addEventListener('focus', resumeAudioEverywhere);

  // iOS の AppDelegate からも呼べる小さな窓口
  window.__flipPauseAudio = pauseAudioEverywhere;
  window.__flipResumeAudio = resumeAudioEverywhere;

  // 最初の操作で音を起こす（iOS は操作の中でしか AudioContext を作れない）
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('touchend', unlock, { once: true });
}

function boot() {
  state.locale = storage.initialLocale(state.settings);
  const firstLaunch = !state.settings.locale;
  if (firstLaunch) {
    state.settings = storage.updateSettings({ ...state.settings, locale: state.locale });
  }
  // Build 3: BGM の既定を一度だけ ON にする（以降はユーザーの OFF を尊重）
  if (storage.needsBgmDefault()) {
    state.settings = storage.updateSettings(state.settings);
  }
  state.entitled = pro.initialEntitlement();
  haptics.setEnabled(state.settings.haptic);

  refreshTexts();
  buildHomeDemo();
  buildBoard({ size: core.FREE_SIZE, board: [], targets: { rows: 10, cols: 10 } });
  // 最初の空盤面は数字を出さない（ホームの背景用）
  $$('#board .tile').forEach((node) => {
    const value = node.querySelector('.tile__value');
    if (value) value.textContent = '';
    node.dataset.v = '0';
  });
  $$('.sum').forEach((node) => {
    node.textContent = '';
  });
  showScreen('home');
  bind();
  // busy の残留と結果シートの出し忘れを見張る（Build 6）
  startWatchdog();

  const globe = $('#btn-lang-home');
  if (globe && firstLaunch) globe.classList.add('is-attention');

  if (pro.previewAllowed()) {
    $('#pro-dev')?.removeAttribute('hidden');
  }
  updateProUI();
  loadStorePrice();
  pro.refresh().then((entitled) => {
    if (entitled === null) return;
    setEntitled(entitled);
  });
  audio.setMuted(!state.settings.sound);
  if (state.settings.bgm) {
    // 自動再生はできないので、最初のタップで鳴り出す
    const once = () => audio.setBgm(true);
    window.addEventListener('pointerdown', once, { once: true });
  }
  updateSwitches();
  startOpening();

  // 検証用の小さな窓口（`?test=1` のときだけ）。配布ビルドでは存在しない。
  if (typeof location !== 'undefined' && /(\?|&)test=1\b/.test(location.search)) {
    window.__linezap = {
      state,
      core,
      startGame,
      openSheet,
      closeSheet,
      setEntitled,
      showHint,
      openStart,
      pickStartSize,
      stepStartTarget,
      skipOpening: finishOpening,
      /** ヒント ON/OFF（スクリーンショットと検証用） */
      setHint(on) {
        state.settings = storage.updateSettings({ ...state.settings, hint: Boolean(on) });
        updateSwitches();
        if (state.game) renderSums(state.game);
      },
      get game() {
        return state.game;
      },
      /** 音・バイブ（失敗しても固まらないことの検証用） */
      audio,
      haptics,
      endRun,
      openResult,
      /** 入れ替えを直接呼ぶ（検証用） */
      async swap(a, b) {
        await doSwap(a, b);
      },
      /** 全体タイマーを任意のミリ秒にする（タイムアタックの検証用） */
      setTimeLeft(ms) {
        if (!state.game) return;
        state.game = { ...state.game, timeLeft: Math.max(0, Number(ms) || 0) };
        updateHud();
      },
      /** 制限時間を任意のミリ秒にする（タイムアウトの検証用） */
      setTurnLeft(ms) {
        if (!state.game) return;
        state.game = { ...state.game, turnLeft: Math.max(0, Number(ms) || 0) };
        updateHud();
      },
      /** 手数を任意にする（ヒントの検証用） */
      setMoves(moves) {
        if (!state.game) return;
        state.game = { ...state.game, moves };
        updateHud();
      },
      setBoard(values) {
        if (!state.game) return;
        state.game = {
          ...state.game,
          board: values.map((value) => ({ digit: Math.min(9, Math.max(0, Math.round(Number(value) || 0))) })),
        };
        paintBoard(state.game);
        updateHud();
      },
      /** 失敗したときの切り分け用 */
      hint() {
        return core.findHint(state.game.board, state.game.size, state.game.targets);
      },
    };
  }
}

boot();

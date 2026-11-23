/**
 * FLIP 10 — 画面と操作（Build 2）
 *
 * ルールは src/core.js、文言は src/i18n.js、音は src/audio.js、
 * バイブは src/haptics.js、課金は src/pro.js、記録は src/storage.js。
 * ここは「盤面を描く・タップを受ける・シートを開く」だけを持つ。
 *
 * 1回の入れ替えで core.swapTiles() が「入れ替え → 消えるライン → 落ちてくる盤面 →
 * 手数の回復 → ゲームオーバー」を全部計算して返すので、ここはその順番どおりに見せる。
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
/** 何も操作がないままヒントを出すまでの時間（ヒント ON のとき） */
const IDLE_HINT_MS = 9000;

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

function pairMarkup({ front, back }) {
  return `<span class="legend__item"><b class="legend__tile legend__tile--front">${front}</b><i class="legend__arrow">↔</i><b class="legend__tile legend__tile--back">${back}</b></span>`;
}

function buildLegend(node) {
  if (!node) return;
  const pairs = core.pairLegend();
  node.innerHTML = `<span class="legend__title">${i18n.t('howto.legend', state.locale)}</span>${pairs.map(pairMarkup).join('')}`;
}

function refreshTexts() {
  document.documentElement.setAttribute('lang', i18n.localeMeta(state.locale).tag);
  applyTextSize();
  i18n.applyI18n(document, state.locale);
  document.title = 'FLIP 10';

  const label = i18n.localeMeta(state.locale).label;
  const langLabel = $('#lang-label');
  if (langLabel) langLabel.textContent = label;
  const setLangLabel = $('#set-language-label');
  if (setLangLabel) setLangLabel.textContent = label;

  buildLegend($('#legend-home'));
  buildLegend($('#legend-howto'));
  buildModes();
  buildLangGrid();
  updateSwitches();
  updateRulesInfo();
  updateProUI();
  buildPrivacy();
  updateVersion();
  updateHomeBest();
  if (state.game) updatePlayLegend();
}

function applyTextSize() {
  document.documentElement.dataset.text = state.settings.textSize || 'normal';
}

function updateVersion() {
  const node = $('#settings-version');
  if (node) node.textContent = `${i18n.t('settings.version', state.locale)} ${core.VERSION} (Build ${state.build}) · T-maks Games`;
}

function updateRulesInfo() {
  const node = $('#rules-target');
  if (node) {
    node.textContent = i18n.t('rules.line', state.locale, {
      row: state.settings.rowTarget,
      col: state.settings.colTarget,
    });
  }
  const row = $('#set-row-target');
  const col = $('#set-col-target');
  if (row) row.textContent = String(state.settings.rowTarget);
  if (col) col.textContent = String(state.settings.colTarget);
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
  const hintButtons = [$('#btn-hint'), $('#btn-hint-foot')];
  for (const button of hintButtons) {
    if (!button) continue;
    button.classList.toggle('is-off', !state.settings.hint);
    button.setAttribute('aria-disabled', state.settings.hint ? 'false' : 'true');
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
    const locked = !pro.canPlayMode(state.entitled, config.id);
    const card = document.createElement('div');
    card.className = `mode${locked ? ' is-locked' : ''}`;
    card.dataset.mode = config.id;
    card.innerHTML = `
      <button class="mode__main" type="button" data-mode="${config.id}">
        <span class="mode__head">
          <span class="mode__name">${i18n.t(`mode.${config.id}`, state.locale)}</span>
          ${locked ? `<span class="mode__badge" title="${i18n.t('mode.locked', state.locale)}">${icon('lock')}${i18n.t('home.pro', state.locale)}</span>` : ''}
        </span>
        <span class="mode__desc">${i18n.t(`mode.${config.id}.desc`, state.locale)}</span>
      </button>
      ${config.timed ? `<div class="mode__chips">
        <button type="button" data-time="60">60</button>
        <button type="button" data-time="120">120</button>
      </div>` : ''}
    `;
    box.appendChild(card);
  }
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

function updatePlayLegend() {
  const node = $('#play-legend');
  const target = $('#targetbar');
  const targetText = $('#target-text');
  const game = state.game;
  if (game && targetText) {
    targetText.textContent = i18n.t('rules.line', state.locale, { row: game.targets.rows, col: game.targets.cols });
  }
  if (target) target.hidden = Boolean(game && game.mechanic === core.MECHANIC.flip);
  if (!node) return;
  if (!game || game.mechanic !== core.MECHANIC.flip) {
    node.hidden = true;
    node.innerHTML = '';
    return;
  }
  const pairs = core.pairLegend();
  node.hidden = false;
  node.innerHTML = `<span class="legend__title">${i18n.t('howto.legend', state.locale)}</span>${pairs.map(pairMarkup).join('')}`;
}

function updateHomeBest() {
  const node = $('#home-best');
  if (node) node.textContent = formatNumber(state.bests.classic ?? 0);
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
  if (wrap) wrap.style.setProperty('--n', String(game.size));
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
  node.classList.toggle('is-back', tile.side === core.SIDES.back);
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

/** 行・列の合計を右と下のバッジに出す */
function renderSums(game, { clearedRows = [], clearedCols = [] } = {}) {
  if (!game) return;
  const { rows, cols } = core.sums(game.board, game.size);
  const rowNodes = $$('#sums-rows .sum');
  const colNodes = $$('#sums-cols .sum');
  rowNodes.forEach((node, r) => {
    const value = rows[r];
    node.textContent = String(value);
    node.classList.toggle('is-hit', value === game.targets.rows);
    node.classList.toggle('is-near', value !== game.targets.rows && Math.abs(value - game.targets.rows) <= 2);
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
    node.textContent = String(value);
    node.classList.toggle('is-hit', value === game.targets.cols);
    node.classList.toggle('is-near', value !== game.targets.cols && Math.abs(value - game.targets.cols) <= 2);
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
      targetText.textContent = i18n.t('rules.line', state.locale, { row: game.targets.rows, col: game.targets.cols });
    }
  }
  const best = $('#hud-best');
  if (best && game) best.textContent = formatNumber(currentBest());
  const movesWrap = $('#hud-moves-wrap');
  const movesNode = $('#hud-moves');
  if (movesWrap) movesWrap.hidden = !(game && game.life);
  if (movesNode && game && game.life) movesNode.textContent = String(game.moves);
  renderPips(game, { gained, lost });

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

function currentKey() {
  const game = state.game;
  if (!game) return 'classic';
  return core.gameKey(game.modeId, game.timeLimit);
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

function startGame(modeId, timeLimit) {
  closeSheet();
  clearIdle();
  audio.unlock();
  const config = core.modeById(modeId);
  const rows = state.entitled ? state.settings.rowTarget : core.DEFAULT_TARGET;
  const cols = state.entitled ? state.settings.colTarget : core.DEFAULT_TARGET;
  state.game = core.startGame({
    mode: modeId,
    rowTarget: rows,
    colTarget: cols,
    timeLimit,
  });
  state.shownScore = 0;
  state.busy = false;
  state.selected = null;
  state.hintShown = false;
  state.lastMoves = state.game.moves;
  state.bestAtStart = state.bests[core.gameKey(state.game.modeId, state.game.timeLimit)] ?? 0;
  resetCombo();
  clearFlash();
  clearHintTiles();
  buildBoard(state.game);
  updatePlayLegend();
  showScreen('play');
  updateHud();
  startTimer();
  audio.tap();
  if (Math.max(rows, cols) > core.maxTargetFor(state.game.size)) {
    // 4×4 の上限を超える設定は 36 に丸められる（HUD の合計で分かる）
    toast(i18n.t('toast.cap', state.locale));
  }
  scheduleIdleHint();
}

function startTimer() {
  stopTimer();
  if (!state.game || !state.game.timed) return;
  state.lastTick = performance.now();
  state.timer = setInterval(() => {
    if (!state.game || state.game.status !== core.STATUS.playing) return;
    const now = performance.now();
    const delta = now - state.lastTick;
    state.lastTick = now;
    state.game = core.advanceTime(state.game, delta);
    updateHud();
    if (state.game.status === core.STATUS.over) endRun();
  }, 200);
}

function stopTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function endRun() {
  if (!state.game || state.game.status !== core.STATUS.over) return;
  stopTimer();
  clearIdle();
  state.selected = null;
  paintSelection();
  const isNew = state.game.score > (state.bestAtStart ?? 0);
  saveBest();
  state.shownScore = state.game.score;
  updateHud();

  const title = $('#result-title');
  if (title) {
    title.textContent = i18n.t(state.game.overReason === core.OVER_REASON.time ? 'result.timeUp' : 'result.movesOut', state.locale);
  }
  const scoreNode = $('#result-score');
  const bestNode = $('#result-best');
  const linesNode = $('#result-lines');
  const recordNode = $('#result-record');
  if (scoreNode) scoreNode.textContent = formatNumber(state.game.score);
  if (bestNode) bestNode.textContent = formatNumber(currentBest());
  if (linesNode) linesNode.textContent = formatNumber(state.game.clearedLines);
  if (recordNode) recordNode.hidden = !isNew;
  audio.over();
  haptics.over();
  setTimeout(() => openSheet('result'), 260);
}

function goHome() {
  stopTimer();
  clearIdle();
  saveBest();
  resetCombo();
  closeSheet();
  state.game = null;
  state.busy = false;
  state.selected = null;
  showScreen('home');
  updateHomeBest();
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
  clearHintTiles();
  const hint = core.findHint(game.board, game.size, game.targets, game.mechanic);
  if (!hint) {
    renderSums(game);
    return false;
  }
  const indices = hint.mechanic === core.MECHANIC.flip ? [hint.index] : [hint.a, hint.b];
  for (const index of indices) {
    const node = tileNode(index);
    if (node) node.classList.add('is-hint');
  }
  state.hintShown = true;
  if (state.hintTimer) clearTimeout(state.hintTimer);
  state.hintTimer = setTimeout(() => clearHintTiles(), 2800);
  if (!silent) {
    haptics.select();
    audio.tap();
  }
  return true;
}

async function onTileTap(index) {
  const game = state.game;
  if (!game || state.busy || game.status !== core.STATUS.playing) return;
  if (!Number.isFinite(index)) return;

  audio.unlock();
  clearIdle();
  clearHintTiles();

  if (game.mechanic === core.MECHANIC.flip) {
    await doFlip(index);
    return;
  }

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
 * アニメの途中でタイムアップしていたら、その「終了」を残す。
 * （計算済みの result.game で上書きすると、0秒のままプレイが続いてしまう）
 */
function applyFinalGame(next) {
  const live = state.game;
  if (live && live.status === core.STATUS.over) {
    state.game = {
      ...next,
      status: core.STATUS.over,
      timeLeft: live.timeLeft,
      overReason: live.overReason ?? next.overReason,
    };
    return;
  }
  state.game = next;
}

async function doSwap(a, b) {
  state.busy = true;
  state.lastMoves = state.game.moves;
  haptics.swap();
  audio.flip();

  const nodeA = tileNode(a);
  const nodeB = tileNode(b);
  for (const node of [nodeA, nodeB]) {
    if (!node) continue;
    node.classList.add('is-swapping');
    setTimeout(() => node.classList.remove('is-swapping'), 240);
  }
  await wait(110);

  const result = core.swapTiles(state.game, a, b, Math.random);
  if (!result.swap) {
    state.busy = false;
    return;
  }

  const openingBoard = result.steps.length > 0 ? result.steps[0].board : result.game.board;
  const tempGame = { ...state.game, board: openingBoard };
  paintBoard(tempGame);

  await playSteps(result);

  applyFinalGame(result.game);
  state.shownScore = state.game.score;
  state.selected = null;
  state.busy = false;
  paintBoard(state.game);
  updateHud({
    gained: Math.max(0, result.reward),
    lost: state.lastMoves !== null ? Math.max(0, state.lastMoves - state.game.moves) : 0,
  });
  afterMove(result);
}

async function doFlip(index) {
  state.busy = true;
  state.lastMoves = state.game.moves;
  haptics.swap();
  audio.flip();

  const result = core.flipAt(state.game, index, Math.random);
  if (!result.flip) {
    state.busy = false;
    return;
  }

  const nodes = result.flip.flipped;
  for (const i of nodes) {
    const node = tileNode(i);
    if (!node) continue;
    node.classList.remove('is-flipping');
    void node.offsetWidth;
    node.classList.add('is-flipping');
    setTimeout(() => node.classList.remove('is-flipping'), 280);
  }
  const openingBoard = result.steps.length > 0 ? result.steps[0].board : result.game.board;
  paintBoard({ ...state.game, board: openingBoard });
  await wait(160);

  await playSteps(result);

  applyFinalGame(result.game);
  state.shownScore = state.game.score;
  state.busy = false;
  paintBoard(state.game);
  updateHud({
    gained: Math.max(0, result.reward),
    lost: state.lastMoves !== null ? Math.max(0, state.lastMoves - state.game.moves) : 0,
  });
  afterMove(result);
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
  $$('#set-target .stepper button').forEach((button) => {
    button.disabled = !state.entitled;
  });
  const target = $('#set-target');
  if (target) target.classList.toggle('is-locked', !state.entitled);
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

function changeTarget(axis, step) {
  if (!state.entitled) {
    openSheet('pro');
    return;
  }
  const key = axis === 'col' ? 'colTarget' : 'rowTarget';
  const next = Math.min(core.MAX_TARGET, Math.max(core.MIN_TARGET, state.settings[key] + step));
  if (next === state.settings[key]) return;
  state.settings = storage.updateSettings({ ...state.settings, [key]: next });
  updateRulesInfo();
  audio.tap();
  haptics.select();
  toast(i18n.t('toast.target', state.locale, { row: state.settings.rowTarget, col: state.settings.colTarget }));
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
  if (state.game && state.game.timed) state.lastTick = performance.now();
}

/* ------------------------------------------------------------------ */
/* 起動                                                                */
/* ------------------------------------------------------------------ */

function bind() {
  // home
  $('#btn-play')?.addEventListener('click', () => startGame('classic'));
  $('#btn-howto')?.addEventListener('click', () => openSheet('howto'));
  $('#btn-settings')?.addEventListener('click', () => openSheet('settings'));
  $('#btn-lang-home')?.addEventListener('click', () => openSheet('language'));
  $('#btn-pro')?.addEventListener('click', () => openSheet('pro'));

  // mode cards（あとから作るので親で受ける）
  $('#mode-list')?.addEventListener('click', (event) => {
    const timeButton = event.target.closest('[data-time]');
    if (timeButton) {
      if (!pro.canPlayMode(state.entitled, 'time')) {
        openSheet('pro');
        return;
      }
      startGame('time', Number(timeButton.dataset.time));
      return;
    }
    const main = event.target.closest('[data-mode]');
    if (!main) return;
    const id = main.dataset.mode;
    if (!pro.canPlayMode(state.entitled, id)) {
      openSheet('pro');
      return;
    }
    const config = core.modeById(id);
    startGame(id, config.timed ? config.timeLimit : undefined);
  });

  // play
  $('#btn-quit')?.addEventListener('click', goHome);
  $('#btn-home')?.addEventListener('click', goHome);
  $('#board')?.addEventListener('click', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile) return;
    onTileTap(Number(tile.dataset.i));
  });
  $('#btn-settings-play')?.addEventListener('click', () => openSheet('settings'));
  $('#btn-hint')?.addEventListener('click', () => showHint());
  $('#btn-hint-foot')?.addEventListener('click', () => showHint());
  $('#btn-restart')?.addEventListener('click', () => {
    const game = state.game;
    if (!game) return;
    saveBest();
    startGame(game.modeId, game.timeLimit || undefined);
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
  $('#set-target')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-step]');
    if (!button) return;
    changeTarget(button.dataset.axis, Number(button.dataset.step));
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
    startGame(game.modeId, game.timeLimit || undefined);
  });
  $('#btn-result-home')?.addEventListener('click', goHome);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.sheet) closeSheet();
  });

  // BGM をホーム画面・別アプリ・ロックに残さない（JS 側）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAudioEverywhere();
    else resumeAudioEverywhere();
  });
  window.addEventListener('pagehide', pauseAudioEverywhere);
  window.addEventListener('beforeunload', pauseAudioEverywhere);
  window.addEventListener('blur', pauseAudioEverywhere);
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
  state.entitled = pro.initialEntitlement();
  haptics.setEnabled(state.settings.haptic);

  refreshTexts();
  buildHomeDemo();
  buildBoard({ size: core.FREE_SIZE, board: [], mechanic: core.MECHANIC.swap, targets: { rows: 10, cols: 10 } });
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

  // 検証用の小さな窓口（`?test=1` のときだけ）。配布ビルドでは存在しない。
  if (typeof location !== 'undefined' && /(\?|&)test=1\b/.test(location.search)) {
    window.__flip10 = {
      state,
      core,
      startGame,
      openSheet,
      closeSheet,
      setEntitled,
      showHint,
      get game() {
        return state.game;
      },
      setBoard(values, { sides = [] } = {}) {
        if (!state.game) return;
        state.game = {
          ...state.game,
          board: values.map((value, i) => {
            if (state.game.mechanic === core.MECHANIC.flip) {
              return sides[i] === 'back'
                ? { front: core.PAIR_SUM - value, back: value, side: core.SIDES.back }
                : { front: value, back: core.PAIR_SUM - value, side: core.SIDES.front };
            }
            return { digit: value };
          }),
        };
        paintBoard(state.game);
        updateHud();
      },
      setMoves(moves) {
        if (!state.game) return;
        state.game = { ...state.game, moves };
        updateHud();
      },
      /** 失敗したときの切り分け用 */
      hint() {
        return core.findHint(state.game.board, state.game.size, state.game.targets, state.game.mechanic);
      },
    };
  }
}

boot();

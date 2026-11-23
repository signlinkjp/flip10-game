/**
 * FLIP 10 — 画面と操作
 *
 * ルールは src/core.js、文言は src/i18n.js、音は src/audio.js、課金は src/pro.js。
 * ここは「盤面を描く・タップを受ける・シートを開く」だけを持つ。
 *
 * 1回のタップで core.tapTile() が「反転 → 消えるライン → 落ちてくる盤面」を
 * 全部計算して返すので、ここはその順番どおりに見せる。
 */

import * as core from './core.js';
import * as i18n from './i18n.js';
import { createAudioEngine } from './audio.js';
import * as pro from './pro.js';
import * as storage from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  shownScore: 0,
  timer: null,
  lastTick: 0,
  toastTimer: null,
  removed: false,
};

const audio = createAudioEngine({
  muted: !state.settings.sound,
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
  const pairs = core.pairLegend(core.RULES.base);
  node.innerHTML = `<span class="legend__title">${i18n.t('howto.legend', state.locale)}</span>${pairs.map(pairMarkup).join('')}`;
}

function refreshTexts() {
  document.documentElement.setAttribute('lang', i18n.localeMeta(state.locale).tag);
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
}

function updateVersion() {
  const node = $('#settings-version');
  if (node) node.textContent = `${i18n.t('settings.version', state.locale)} ${core.VERSION} (Build ${core.BUILD}) · T-maks Games`;
}

function updateRulesInfo() {
  const node = $('#rules-target');
  if (node) node.textContent = i18n.t('rules.target', state.locale, { target: state.settings.target });
  $$('#set-target button').forEach((button) => {
    const on = Number(button.dataset.target) === state.settings.target;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function updateSwitches() {
  setSwitch($('#set-sound'), state.settings.sound);
  setSwitch($('#set-bgm'), state.settings.bgm);
  const soundIcon = $('#btn-sound-play use');
  if (soundIcon) soundIcon.setAttribute('href', state.settings.sound ? '#i-sound-on' : '#i-sound-off');
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

const DEMO_ROWS = [
  [3, 4, 3],
  [2, 5, 1],
  [4, 0, 3],
];

function buildHomeDemo() {
  const box = $('#hero-demo');
  if (!box) return;
  box.innerHTML = '';
  DEMO_ROWS.flat().forEach((value, i) => {
    const tile = document.createElement('span');
    tile.className = 'demo-tile';
    if (i === 4 || i === 6) tile.classList.add('is-back');
    if (i < 3) tile.classList.add('is-lit');
    tile.textContent = String(i === 4 || i === 6 ? core.PAIR_SUM - value : value);
    box.appendChild(tile);
  });
}

function updatePlayLegend() {
  const node = $('#play-legend');
  if (!node) return;
  const game = state.game;
  if (!game) {
    node.innerHTML = '';
    return;
  }
  if (game.rule === core.RULES.base) {
    const pairs = core.pairLegend(core.RULES.base);
    node.innerHTML = `<span class="legend__title">${i18n.t('howto.legend', state.locale)}</span>${pairs.map(pairMarkup).join('')}`;
  } else {
    node.innerHTML = `<span class="legend__title">RULE A</span><span class="playlegend__note">${i18n.t('rules.advanced', state.locale)}</span>`;
  }
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
  board.className = `board board--${game.size}${game.peek ? ' board--peek' : ''}`;
  board.innerHTML = '';
  for (let i = 0; i < game.size * game.size; i += 1) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.dataset.i = String(i);
    tile.innerHTML = '<span class="tile__value"></span><span class="tile__peek"></span>';
    board.appendChild(tile);
  }
  paintBoard(game);
}

function paintTile(node, tile) {
  if (!node || !tile) return;
  const value = core.displayValue(tile);
  const text = node.querySelector('.tile__value');
  if (text) text.textContent = String(value);
  const peek = node.querySelector('.tile__peek');
  if (peek) peek.textContent = String(tile.back);
  node.classList.toggle('is-back', tile.side === core.SIDES.back);
  node.setAttribute('aria-label', String(value));
}

function paintBoard(game) {
  const nodes = $$('#board .tile');
  for (let i = 0; i < nodes.length; i += 1) paintTile(nodes[i], game.board[i]);
}

function tileNode(index) {
  return $(`#board .tile[data-i="${index}"]`);
}

function markFlipping(indices, board) {
  for (const i of indices) {
    const node = tileNode(i);
    if (!node) continue;
    node.classList.add('is-flipping');
    setTimeout(() => {
      paintTile(node, board[i]);
      node.classList.remove('is-flipping');
    }, 150);
  }
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
    node.style.opacity = '';
  });
}

function dropTiles(indices, board) {
  for (const i of indices) {
    const node = tileNode(i);
    if (!node) continue;
    paintTile(node, board[i]);
    node.classList.add('is-dropping');
    setTimeout(() => node.classList.remove('is-dropping'), 340);
  }
}

function burstParticles(cells) {
  const fx = $('#fx');
  const board = $('#board');
  if (!fx || !board) return;
  const base = fx.getBoundingClientRect();
  for (const index of cells) {
    const node = tileNode(index);
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    const cx = rect.left - base.left + rect.width / 2;
    const cy = rect.top - base.top + rect.height / 2;
    for (let n = 0; n < 5; n += 1) {
      const dot = document.createElement('i');
      dot.className = `particle${n % 2 ? ' particle--pink' : ''}`;
      const angle = (Math.PI * 2 * n) / 5 + Math.random() * 0.7;
      const distance = 26 + Math.random() * 34;
      dot.style.left = `${cx}px`;
      dot.style.top = `${cy}px`;
      dot.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      dot.style.setProperty('--dy', `${Math.sin(angle) * distance - 10}px`);
      dot.style.animationDelay = `${Math.random() * 60}ms`;
      fx.appendChild(dot);
      setTimeout(() => dot.remove(), 760);
    }
  }
}

function showCombo(step) {
  const node = $('#combo');
  if (!node) return;
  const multiplier = step.combo * step.chain;
  const label = multiplier > 1 ? `${i18n.t('hud.combo', state.locale).toUpperCase()} ×${multiplier} ` : '';
  node.textContent = `${label}+${formatNumber(step.points)}`;
  node.classList.remove('is-show');
  void node.offsetWidth;
  node.classList.add('is-show');
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

function updateHud() {
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
  const best = $('#hud-best');
  if (best && game) best.textContent = formatNumber(currentBest());
  const target = $('#hud-target');
  if (target && game) target.textContent = String(game.target);

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
  audio.unlock();
  state.game = core.startGame({
    mode: modeId,
    target: state.settings.target,
    timeLimit,
  });
  state.shownScore = 0;
  state.busy = false;
  buildBoard(state.game);
  updatePlayLegend();
  showScreen('play');
  updateHud();
  startTimer();
  audio.tap();
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
  const isNew = saveBest();
  state.shownScore = state.game.score;
  updateHud();

  const scoreNode = $('#result-score');
  const bestNode = $('#result-best');
  const linesNode = $('#result-lines');
  const recordNode = $('#result-record');
  if (scoreNode) scoreNode.textContent = formatNumber(state.game.score);
  if (bestNode) bestNode.textContent = formatNumber(currentBest());
  if (linesNode) linesNode.textContent = formatNumber(state.game.clearedLines);
  if (recordNode) recordNode.hidden = !isNew;
  audio.over();
  openSheet('result');
}

function goHome() {
  stopTimer();
  saveBest();
  closeSheet();
  state.game = null;
  state.busy = false;
  showScreen('home');
  updateHomeBest();
}

/* ------------------------------------------------------------------ */
/* タップ                                                              */
/* ------------------------------------------------------------------ */

async function onTileTap(event) {
  const node = event.currentTarget;
  const index = Number(node.dataset.i);
  const game = state.game;
  if (!game || state.busy || game.status !== core.STATUS.playing || !Number.isFinite(index)) return;

  state.busy = true;
  audio.unlock();
  audio.flip();

  const before = game.score;
  const result = core.tapTile(game, index, Math.random);
  if (!result.flip) {
    state.busy = false;
    return;
  }

  markFlipping(result.flip.flipped, result.flip.board);
  await wait(320);

  let running = before;
  for (const step of result.steps) {
    audio.clear({ combo: step.combo, lines: step.lines });
    flashCells(step.cells);
    burstParticles(step.cells);
    showCombo(step);
    running += step.points;
    state.shownScore = running;
    updateHud();
    await wait(430);

    clearFlash();
    dropTiles(step.changed, step.after);
    audio.drop();
    await wait(300);
  }

  // アニメの途中でタイムアップしていたら、その「終了」を残す
  if (state.game && state.game.status === core.STATUS.over) {
    state.game = { ...result.game, status: core.STATUS.over, timeLeft: state.game.timeLeft };
  } else {
    state.game = result.game;
  }
  state.shownScore = state.game.score;
  paintBoard(state.game);
  updateHud();
  state.busy = false;
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
  updateSwitches();
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
  $('#board')?.addEventListener('click', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile) return;
    onTileTap({ currentTarget: tile });
  });
  $('#btn-home')?.addEventListener('click', goHome);
  $('#btn-restart')?.addEventListener('click', () => {
    const game = state.game;
    if (!game) return;
    saveBest();
    startGame(game.modeId, game.timeLimit || undefined);
  });
  $('#btn-sound-play')?.addEventListener('click', () => toggleSetting('sound'));

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
  $('#set-target')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-target]');
    if (!button) return;
    const target = Number(button.dataset.target);
    if (!core.TARGETS.includes(target)) return;
    state.settings = storage.updateSettings({ ...state.settings, target });
    updateRulesInfo();
    audio.tap();
    toast(i18n.t('toast.target', state.locale, { target }));
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

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) audio.revive();
  });

  // 最初の操作で音を起こす（iOS は操作の中でしか AudioContext を作れない）
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('touchend', unlock, { once: true });
}

function boot() {
  state.locale = storage.initialLocale(state.settings);
  const firstLaunch = !state.settings.locale;
  state.entitled = pro.initialEntitlement();

  refreshTexts();
  buildHomeDemo();
  buildBoard({ size: core.FREE_SIZE, board: [], peek: false });
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
      get game() {
        return state.game;
      },
      setBoard(values, { sides = [] } = {}) {
        if (!state.game) return;
        state.game = {
          ...state.game,
          board: values.map((value, i) => ({
            front: sides[i] === 'back' ? core.PAIR_SUM - value : value,
            back: sides[i] === 'back' ? value : core.PAIR_SUM - value,
            side: sides[i] === 'back' ? core.SIDES.back : core.SIDES.front,
          })),
        };
        buildBoard(state.game);
        updateHud();
      },
    };
  }
}

boot();

/**
 * FLIP 10 — 端末の中だけの記録（設定とベストスコア）
 *
 * サーバーは無い。localStorage は iOS の WKWebView でもそのまま使え、
 * アプリを消せば一緒に消える。読めない環境（プライベートモード等）でも
 * 落ちないように、その場限りの Map に切り替える。
 */

import { DEFAULT_TARGET, MIN_TARGET, MAX_TARGET, maxTargetFor, FREE_SIZE } from './core.js';
import { DEFAULT_LOCALE, detectLocale, isLocale } from './i18n.js';

export const SETTINGS_KEY = 'flip10.settings.v1';
export const BEST_KEY = 'flip10.best.v1';

/** 文字サイズの3段階 */
export const TEXT_SIZES = Object.freeze(['normal', 'large', 'xl']);

export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  bgm: false,
  hint: true,
  /** iOS のバイブ（ふるえ）。既定 ON */
  haptic: true,
  textSize: 'normal',
  locale: null,
  rowTarget: DEFAULT_TARGET,
  colTarget: DEFAULT_TARGET,
});

function memoryStore() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/** localStorage があれば使い、駄目ならその場限りの入れ物 */
export function createStore(backend) {
  let box = backend;
  if (box === undefined) {
    try {
      box = typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    } catch {
      box = null;
    }
  }
  return box ?? memoryStore();
}

function readJson(store, key, fallback) {
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(store, key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 合計は 9〜40（4×4 の上限は 36）に丸める */
export function normalizeTarget(value, fallback = DEFAULT_TARGET) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, number));
}

/** 設定を正規化（壊れた値・古い値でも遊べる形にする） */
export function normalizeSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const legacy = Number(source.target);
  const fallback = Number.isFinite(legacy) ? normalizeTarget(legacy) : DEFAULT_TARGET;
  return {
    sound: typeof source.sound === 'boolean' ? source.sound : DEFAULT_SETTINGS.sound,
    bgm: typeof source.bgm === 'boolean' ? source.bgm : DEFAULT_SETTINGS.bgm,
    hint: typeof source.hint === 'boolean' ? source.hint : DEFAULT_SETTINGS.hint,
    haptic: typeof source.haptic === 'boolean' ? source.haptic : DEFAULT_SETTINGS.haptic,
    textSize: TEXT_SIZES.includes(source.textSize) ? source.textSize : DEFAULT_SETTINGS.textSize,
    locale: isLocale(source.locale) ? source.locale : null,
    rowTarget: normalizeTarget(source.rowTarget, fallback),
    colTarget: normalizeTarget(source.colTarget, fallback),
  };
}

export function loadSettings(store = createStore()) {
  return normalizeSettings(readJson(store, SETTINGS_KEY, {}));
}

export function saveSettings(settings, store = createStore()) {
  const clean = normalizeSettings(settings);
  writeJson(store, SETTINGS_KEY, clean);
  return clean;
}

export function updateSettings(patch, store = createStore()) {
  return saveSettings({ ...loadSettings(store), ...(patch || {}) }, store);
}

/** その盤面サイズで実際に使う合計（4×4 は最大36） */
export function targetsFor(settings, size = FREE_SIZE) {
  const max = maxTargetFor(size);
  return {
    rows: Math.min(max, normalizeTarget(settings.rowTarget)),
    cols: Math.min(max, normalizeTarget(settings.colTarget)),
  };
}

/**
 * 最初に出す言語。
 * 保存された言語 → 端末の言語 → 12言語に無ければ英語。
 */
export function initialLocale(settings = loadSettings(), navigatorLike = typeof navigator !== 'undefined' ? navigator : null) {
  if (settings && isLocale(settings.locale)) return settings.locale;
  const tag = navigatorLike && (navigatorLike.language || navigatorLike.languages?.[0]);
  if (!tag) return DEFAULT_LOCALE;
  return detectLocale(tag);
}

export function loadBests(store = createStore()) {
  const raw = readJson(store, BEST_KEY, {});
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const score = Number(value);
    if (Number.isFinite(score) && score >= 0) out[key] = Math.floor(score);
  }
  return out;
}

export function bestFor(key, store = createStore()) {
  return loadBests(store)[key] ?? 0;
}

/**
 * ベストを更新する。更新したときだけ true を返す（NEW RECORD の表示用）。
 */
export function recordScore(key, score, store = createStore()) {
  const bests = loadBests(store);
  const value = Math.max(0, Math.floor(Number(score) || 0));
  const previous = bests[key] ?? 0;
  if (value <= previous) return { best: previous, isNew: false };
  bests[key] = value;
  writeJson(store, BEST_KEY, bests);
  return { best: value, isNew: true };
}

export function clearBests(store = createStore()) {
  try {
    store.setItem(BEST_KEY, JSON.stringify({}));
    return true;
  } catch {
    return false;
  }
}

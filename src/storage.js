/**
 * LINEZAP — 端末の中だけの記録（設定とベストスコア）
 *
 * サーバーは無い。localStorage は iOS の WKWebView でもそのまま使え、
 * アプリを消せば一緒に消える。読めない環境（プライベートモード等）でも
 * 落ちないように、その場限りの Map に切り替える。
 *
 * Build 3 から:
 *   消える合計は「行も列も1つの数字」（`target`）。4×4 は 10 固定、5×5 / 6×6 は 12〜42。
 *   BGM は最初から ON（`bgmDefault` が 3 になった最初の1回だけ ON にし、
 *   ユーザーが OFF にしたらそれ以降は尊重する）。
 *
 * Build 4 から:
 *   消える合計は開始前ページでモード×マス数ごとに選ぶ（`targets`）。
 *   設定画面のステッパーは無くし、最後に選んだ値を覚えておくだけにした。
 *   古い `target` / `rowTarget` は 5×5・6×6 のクラシックに引き継ぐ。
 */

import { DEFAULT_TARGET, clampTarget, FREE_SIZE, MECHANIC, defaultTargetFor } from './core.js';
import { DEFAULT_LOCALE, detectLocale, isLocale } from './i18n.js';

// キー名は FLIP 10 時代のまま（改名でユーザーのベストと設定を失わないため）
export const SETTINGS_KEY = 'flip10.settings.v1';
export const BEST_KEY = 'flip10.best.v1';

/** BGM の既定を ON にした設定の版（Build 3） */
export const BGM_DEFAULT_VERSION = 3;

/** 文字サイズの3段階 */
export const TEXT_SIZES = Object.freeze(['normal', 'large', 'xl']);

/** モード×マス数ごとの、最後に選んだ消える合計（Build 4） */
export const DEFAULT_TARGETS = Object.freeze({
  classic5: 20,
  classic6: 20,
  cross5: 13,
  cross6: 16,
});

/** そのモード・マス数の合計を覚えるキー */
export function targetKey(modeId, size) {
  return `${modeId}${size}`;
}

function mechanicOfKey(key) {
  return key.startsWith('cross') ? MECHANIC.flip : MECHANIC.swap;
}

export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  /** Build 3 から最初から ON */
  bgm: true,
  bgmDefault: BGM_DEFAULT_VERSION,
  hint: true,
  /** iOS のバイブ（ふるえ）。既定 ON */
  haptic: true,
  textSize: 'normal',
  locale: null,
  /** モード×マス数ごとの消える合計（4×4 は 10 固定なので持たない） */
  targets: DEFAULT_TARGETS,
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

/** 合計はその盤面の範囲に丸める（4×4 は 10 固定） */
export function normalizeTarget(value, size = FREE_SIZE, mechanic = MECHANIC.swap) {
  return clampTarget(value, size, mechanic);
}

/** 保存された targets を、今の範囲に丸めて作る */
function normalizeTargets(raw, legacy) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_TARGETS };
  for (const key of Object.keys(DEFAULT_TARGETS)) {
    const size = Number(key.slice(-1));
    out[key] = clampTarget(source[key], size, mechanicOfKey(key));
  }
  // 古い1つの合計（Build 3 まで）は 5×5・6×6 のクラシックに引き継ぐ
  if (legacy !== undefined && source.classic5 === undefined) {
    out.classic5 = clampTarget(legacy, 5, MECHANIC.swap);
    out.classic6 = clampTarget(legacy, 6, MECHANIC.swap);
  }
  return out;
}

/** 設定を正規化（壊れた値・古い値でも遊べる形にする） */
export function normalizeSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const legacy = source.target ?? source.rowTarget ?? source.colTarget;
  const bgmFromV3 = Number(source.bgmDefault) >= BGM_DEFAULT_VERSION;
  return {
    sound: typeof source.sound === 'boolean' ? source.sound : DEFAULT_SETTINGS.sound,
    // Build 3 で一度だけ ON にし、それ以降はユーザーの選択を尊重する
    bgm: bgmFromV3 && typeof source.bgm === 'boolean' ? source.bgm : true,
    bgmDefault: BGM_DEFAULT_VERSION,
    hint: typeof source.hint === 'boolean' ? source.hint : DEFAULT_SETTINGS.hint,
    haptic: typeof source.haptic === 'boolean' ? source.haptic : DEFAULT_SETTINGS.haptic,
    textSize: TEXT_SIZES.includes(source.textSize) ? source.textSize : DEFAULT_SETTINGS.textSize,
    locale: isLocale(source.locale) ? source.locale : null,
    targets: normalizeTargets(source.targets, legacy),
  };
}

/** 端末に保存された設定が Build 3 の BGM 既定をまだ通っていないか */
export function needsBgmDefault(store = createStore()) {
  const raw = readJson(store, SETTINGS_KEY, {});
  return !(Number(raw.bgmDefault) >= BGM_DEFAULT_VERSION);
}

export function loadSettings(store = createStore()) {
  return normalizeSettings(readJson(store, SETTINGS_KEY, {}));
}

export function saveSettings(settings, store = createStore()) {
  // 書き込みはユーザーの選択なので、BGM の既定版を一緒に付けて尊重する
  const clean = normalizeSettings({ ...(settings && typeof settings === 'object' ? settings : {}), bgmDefault: BGM_DEFAULT_VERSION });
  writeJson(store, SETTINGS_KEY, clean);
  return clean;
}

export function updateSettings(patch, store = createStore()) {
  return saveSettings({ ...loadSettings(store), ...(patch || {}) }, store);
}

/** そのモード・マス数で使う合計（設定の値を範囲に丸める。4×4 は 10） */
export function targetFor(settings, modeId, size = FREE_SIZE) {
  const mechanic = modeId === 'cross' ? MECHANIC.flip : MECHANIC.swap;
  const saved = settings && settings.targets ? settings.targets[targetKey(modeId, size)] : undefined;
  return clampTarget(saved ?? defaultTargetFor(size, mechanic), size, mechanic);
}

/** その盤面サイズで実際に使う合計（4×4 は 10 固定、5×5 / 6×6 は設定値） */
export function targetsFor(settings, size = FREE_SIZE) {
  if (size <= FREE_SIZE) return { rows: DEFAULT_TARGET, cols: DEFAULT_TARGET };
  const target = clampTarget(settings && settings.targets ? settings.targets[targetKey('classic', size)] : undefined, size);
  return { rows: target, cols: target };
}

/** 合計を1つ覚える（開始前ページのステッパー用） */
export function rememberTarget(settings, modeId, size, value, store = createStore()) {
  const mechanic = modeId === 'cross' ? MECHANIC.flip : MECHANIC.swap;
  const next = clampTarget(value, size, mechanic);
  const targets = { ...(settings && settings.targets ? settings.targets : DEFAULT_TARGETS), [targetKey(modeId, size)]: next };
  return updateSettings({ ...(settings || {}), targets }, store);
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

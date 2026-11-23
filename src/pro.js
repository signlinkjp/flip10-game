/**
 * LINEZAP — PRO（買い切り）の解錠
 *
 * 商品は非消耗型1つ `jp.signlink.Flip10.pro`。StoreKit 2 の答えだけが正で、
 * サーバーとは話さない。最後に分かった答えを端末に覚えておき、圏外でも PRO を保つ。
 *
 * このファイルが置かれうる3つの状態:
 *   store       ネイティブのプラグインがある — 本物の価格・本物の購入
 *   unavailable プラグインの無いネイティブビルド — PRO は閉じたまま
 *   preview     Web プレビュー — 開発確認用のスイッチで開ける（課金なし）
 */

import { MODES, modeById } from './core.js';
import { LOCALES } from './i18n.js';

export const PRODUCT_ID = 'jp.signlink.Flip10.pro';
export const PLUGIN_NAME = 'StoreKit';
// キー名は FLIP 10 時代のまま（購入の記憶を失わないため）
export const STORE_KEY = 'flip10.pro.v1';
/** 開発確認用スイッチ（preview のときだけ意味を持つ。端末の localStorage に残る） */
export const PREVIEW_KEY = 'flip10.pro.preview.v1';

/** PRO で開くモードと、無料で遊べるモード（UI もテストもこの2つだけを見る） */
export const FREE_MODES = Object.freeze(MODES.filter((mode) => !mode.pro).map((mode) => mode.id));
export const PRO_MODES = Object.freeze(MODES.map((mode) => mode.id));

export function needsPro(modeId) {
  return modeById(modeId).pro === true;
}

export function canPlayMode(entitled, modeId) {
  return !needsPro(modeId) || entitled === true;
}

/** その解錠状態で選べるモード */
export function modesFor(entitled) {
  return MODES.filter((mode) => canPlayMode(entitled, mode.id)).map((mode) => mode.id);
}

/** StoreKit の displayPrice が来る前の表示（日本は ¥300 固定のプレースホルダ） */
export const FALLBACK_PRICES = Object.freeze({
  ja: '¥300',
  en: '$1.99',
  ko: '₩2,900',
  'zh-Hans': '¥15',
  'zh-Hant': 'NT$60',
  es: '1,99 €',
  fr: '1,99 €',
  de: '1,99 €',
  pt: '1,99 €',
  it: '1,99 €',
  hi: '₹169',
  id: 'Rp32.000',
});

export function fallbackPrice(locale) {
  return FALLBACK_PRICES[locale] || FALLBACK_PRICES.en;
}

const MAX_REASON = 92;
let lastDiagnostic = '';

export function diagnostic() {
  return lastDiagnostic;
}

function noteDiagnostic(text) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!value) return '';
  const reason = /^SK:/.test(value) ? value : `SK: ${value}`;
  lastDiagnostic = `[${reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON - 1)}…` : reason}]`;
  return lastDiagnostic;
}

function clearDiagnostic() {
  lastDiagnostic = '';
}

function capacitor() {
  if (typeof window === 'undefined') return null;
  return window.Capacitor || null;
}

function store() {
  const cap = capacitor();
  const plugins = cap && cap.Plugins;
  const plugin = plugins && plugins[PLUGIN_NAME];
  if (!plugin || typeof plugin.purchase !== 'function') return null;
  return plugin;
}

function nativePlatform() {
  const cap = capacitor();
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return Boolean(cap.isNativePlatform());
  return typeof cap.platform === 'string' && cap.platform !== 'web';
}

export function mode() {
  if (store()) return 'store';
  if (nativePlatform()) {
    noteDiagnostic('SK: no plugin');
    return 'unavailable';
  }
  return 'preview';
}

/** Web プレビューでは開発用スイッチを使える（本番の購入導線とは別物） */
export function previewAllowed() {
  return mode() === 'preview';
}

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function cachedEntitlement() {
  const box = storage();
  if (!box) return false;
  try {
    const raw = box.getItem(STORE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    return Boolean(saved && saved.entitled === true && saved.productId === PRODUCT_ID);
  } catch {
    return false;
  }
}

export function remember(entitled) {
  const box = storage();
  if (!box) return;
  try {
    box.setItem(STORE_KEY, JSON.stringify({ entitled: Boolean(entitled), productId: PRODUCT_ID, savedAt: Date.now() }));
  } catch {
    /* プライベートモードでもこの起動中は使える */
  }
}

/** 開発確認用スイッチの状態（preview 以外では常に false） */
export function previewUnlocked() {
  if (!previewAllowed()) return false;
  const box = storage();
  if (!box) return false;
  try {
    return box.getItem(PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPreviewUnlocked(on) {
  if (!previewAllowed()) return previewUnlocked();
  const box = storage();
  if (!box) return false;
  try {
    if (on) box.setItem(PREVIEW_KEY, '1');
    else box.removeItem(PREVIEW_KEY);
  } catch {
    /* 何もしない */
  }
  return previewUnlocked();
}

/** ストアの返事が来る前にアプリが仮定する値 */
export function initialEntitlement() {
  return cachedEntitlement() || previewUnlocked();
}

export async function loadPrice() {
  const plugin = store();
  if (!plugin) return null;
  try {
    const answer = await plugin.getProducts({ ids: [PRODUCT_ID] });
    const product = answer && Array.isArray(answer.products) ? answer.products[0] : null;
    if (!product) {
      noteDiagnostic((answer && answer.diag) || 'SK: empty');
      return null;
    }
    clearDiagnostic();
    return {
      id: product.id,
      price: product.displayPrice || '',
      name: product.displayName || '',
      description: product.description || '',
    };
  } catch (error) {
    noteDiagnostic((error && (error.message || error.code)) || 'SK: getProducts failed');
    return null;
  }
}

/** Apple ID が持っているかを聞く。null = 答えなし（持っていた値を保つ） */
export async function refresh() {
  const plugin = store();
  if (!plugin) {
    if (nativePlatform()) noteDiagnostic('SK: no plugin');
    return null;
  }
  try {
    const answer = await plugin.entitlement({ id: PRODUCT_ID });
    const entitled = Boolean(answer && answer.entitled);
    remember(entitled);
    return entitled;
  } catch (error) {
    noteDiagnostic((error && (error.message || error.code)) || 'SK: entitlement failed');
    return null;
  }
}

export async function purchase() {
  const plugin = store();
  if (!plugin) {
    noteDiagnostic('SK: no plugin');
    return { status: mode() === 'preview' ? 'preview' : 'unavailable' };
  }
  try {
    const answer = await plugin.purchase({ id: PRODUCT_ID });
    if (answer && answer.entitled === true) {
      clearDiagnostic();
      remember(true);
      return { status: 'success', transactionId: answer.transactionId || null };
    }
    const status = (answer && answer.status) || 'failed';
    if (status === 'cancelled') {
      clearDiagnostic();
      return { status };
    }
    if (answer && answer.diag) noteDiagnostic(answer.diag);
    else if (status === 'failed') noteDiagnostic('SK: purchase not finished');
    return { status };
  } catch (error) {
    const message = (error && (error.message || error.code)) || 'SK: purchase failed';
    noteDiagnostic(message);
    return { status: 'failed', error: String(message) };
  }
}

export async function restore() {
  const plugin = store();
  if (!plugin) {
    noteDiagnostic('SK: no plugin');
    return { status: mode() === 'preview' ? 'preview' : 'unavailable' };
  }
  try {
    const answer = await plugin.restore({ id: PRODUCT_ID });
    const entitled = Boolean(answer && answer.entitled);
    remember(entitled);
    if (answer && answer.diag && !entitled) noteDiagnostic(answer.diag);
    return { status: entitled ? 'restored' : 'nothing' };
  } catch (error) {
    noteDiagnostic((error && (error.message || error.code)) || 'SK: restore failed');
    return { status: 'failed' };
  }
}

/** 言語ごとの価格表示（StoreKit 価格が無いときだけ） */
export function priceFor(locale, storeProduct) {
  if (storeProduct && storeProduct.price) return storeProduct.price;
  const id = LOCALES.some((entry) => entry.id === locale) ? locale : 'en';
  return fallbackPrice(id);
}

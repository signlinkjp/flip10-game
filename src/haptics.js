/**
 * FLIP 10 — バイブ（iOS の Haptics）
 *
 * iPhone の Taptic Engine を鳴らす。Capacitor のプラグインは増やさず、
 * AppDelegate.swift の `FlipHapticsPlugin`（jsName `FlipHaptics`）を呼ぶ。
 * Web プレビューやテストでは navigator.vibrate があればそれを使い、
 * 無ければ静かに何もしない（ゲームは止めない）。
 *
 * 気持ちよさの割り当て（設定で ON/OFF、既定 ON）:
 *   タイル選択  … light
 *   入れ替え / 反転 … medium
 *   ライン消去  … success（2段階の「トン・パン」）
 *   コンボ2以上 … heavy + success
 *   ゲームオーバー … error
 */

export const HAPTIC_PLUGIN = 'FlipHaptics';
export const HAPTIC_KINDS = Object.freeze(['light', 'medium', 'heavy', 'success', 'warning', 'error']);

export function createHaptics({
  capacitorLike = typeof globalThis !== 'undefined' ? globalThis.Capacitor : null,
  navigatorLike = typeof globalThis !== 'undefined' ? globalThis.navigator : null,
  enabled = true,
} = {}) {
  let on = Boolean(enabled);

  function plugin() {
    const plugins = capacitorLike && capacitorLike.Plugins;
    const found = plugins && plugins[HAPTIC_PLUGIN];
    if (!found || typeof found.haptic !== 'function') return null;
    return found;
  }

  function buzz(kind) {
    if (!on) return false;
    const native = plugin();
    if (native) {
      try {
        const answer = native.haptic({ kind });
        if (answer && typeof answer.catch === 'function') answer.catch(() => {});
        return true;
      } catch {
        /* 震えなくてもゲームは続く */
      }
    }
    if (navigatorLike && typeof navigatorLike.vibrate === 'function') {
      try {
        if (kind === 'error') navigatorLike.vibrate([40, 60, 40]);
        else if (kind === 'success') navigatorLike.vibrate(30);
        else if (kind === 'heavy') navigatorLike.vibrate(45);
        else navigatorLike.vibrate(15);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  return {
    /** 設定の ON/OFF */
    setEnabled(value) {
      on = Boolean(value);
    },
    get enabled() {
      return on;
    },
    get available() {
      return Boolean(plugin()) || Boolean(navigatorLike && typeof navigatorLike.vibrate === 'function');
    },
    haptic(kind = 'light') {
      const safe = HAPTIC_KINDS.includes(kind) ? kind : 'light';
      return buzz(safe);
    },
    select() {
      return buzz('light');
    },
    swap() {
      return buzz('medium');
    },
    clear() {
      return buzz('success');
    },
    /** コンボ2以上: 重い一発＋成功音の2連 */
    combo() {
      buzz('heavy');
      return buzz('success');
    },
    over() {
      return buzz('error');
    },
  };
}

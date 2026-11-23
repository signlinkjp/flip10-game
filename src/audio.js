/**
 * FLIP 10 — 効果音とBGM（Web Audio のシンセだけ。音声ファイルは持たない）
 *
 * 音はすべてその場で合成する:
 *   タップ      … 短い「コッ」
 *   反転        … カードがめくれる「パタッ」（ノイズ＋低いトーン）
 *   ライン消去  … 金色のチャイム。コンボが続くほど音程が上がる
 *   着地        … 新しいタイルが落ちてくる「トン」
 *   BGM         … 静かなアンビエント（既定OFF）
 *
 * iOS でマナースイッチ（消音）が入っていても鳴るように、3つを組み合わせる:
 *   1. `navigator.audioSession.type = 'playback'`（iOS 16.4+ / Safari 17）
 *   2. 無音の <audio> を操作の中で一度鳴らす（古い iOS の WebProcess 用）
 *   3. AppDelegate.swift の FlipAudio プラグインで AVAudioSession を起こし直す
 * AudioContext は「操作の中」で作り、同じスタックで resume する（iOS の定石）。
 */

const SCALE = {
  C4: 261.63, E4: 329.63, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
  B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093.0,
};

/** コンボごとの上昇（1コンボ目から半音ずつ上がる感じ） */
const COMBO_STEPS = [SCALE.C5, SCALE.D5, SCALE.E5, SCALE.G5, SCALE.A5, SCALE.C6, SCALE.D6, SCALE.E6, SCALE.G6, SCALE.C7];
const COMBO_STEPS_5 = [SCALE.E5, SCALE.G5, SCALE.B5, SCALE.D6, SCALE.E6, SCALE.G6];
const COMBO_STEPS_3 = [SCALE.G5, SCALE.B5, SCALE.D6, SCALE.G6];

/** 50ms の無音 WAV（8kHz / 8bit / モノラル）。鳴らすと WebProcess の Audio Session が playback になる */
export const SILENT_WAV =
  'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

export const AUDIO_SESSION_TYPE = 'playback';
export const QUIET_SESSION_TYPE = 'ambient';
export const NATIVE_PLUGIN = 'FlipAudio';

/** BGM のコード進行（4秒ずつ。静かなマイナー→メジャー） */
const BGM_CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [261.63, 329.63, 392.0], // C
];

export function createAudioEngine({
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  mediaElementClass = typeof globalThis.Audio === 'function' ? globalThis.Audio : null,
  navigatorLike = typeof globalThis !== 'undefined' ? globalThis.navigator : null,
  capacitorLike = typeof globalThis !== 'undefined' ? globalThis.Capacitor : null,
  volume = 0.9,
  muted = false,
} = {}) {
  let ctx = null;
  let master = null;
  let gate = null;
  let musicGain = null;
  let noiseBuffer = null;
  let primed = false;
  let silence = null;
  let isMuted = Boolean(muted);
  let sessionType = null;
  let bgmWanted = false;
  let bgmTimer = null;
  let bgmStep = 0;
  let bgmNextAt = 0;

  const baseGain = 0.22 * volume;

  function nativeAudioPlugin() {
    const plugins = capacitorLike && capacitorLike.Plugins;
    const plugin = plugins && plugins[NATIVE_PLUGIN];
    if (!plugin || typeof plugin.activate !== 'function') return null;
    return plugin;
  }

  function activateNative() {
    const plugin = nativeAudioPlugin();
    if (!plugin) return;
    try {
      const answer = plugin.activate();
      if (answer && typeof answer.catch === 'function') answer.catch(() => {});
    } catch {
      /* 音が出なくてもゲームは続く */
    }
  }

  function applySession(type) {
    if (!navigatorLike) return;
    try {
      if (navigatorLike.audioSession) {
        navigatorLike.audioSession.type = type;
        sessionType = type;
      }
    } catch {
      /* Safari 17 未満など */
    }
  }

  /** 操作の中で一度だけ鳴らす無音。WebProcess の Audio Session を playback に変える */
  function primeSilence() {
    if (!mediaElementClass || silence) return;
    try {
      const element = new mediaElementClass();
      element.src = SILENT_WAV;
      element.loop = false;
      element.volume = 0.0001;
      element.setAttribute?.('playsinline', '');
      const played = element.play();
      if (played && typeof played.catch === 'function') played.catch(() => {});
      silence = element;
    } catch {
      /* 鳴らせなくても続行 */
    }
  }

  function ensureContext() {
    if (ctx) return ctx;
    if (!AudioContextClass) return null;
    try {
      ctx = new AudioContextClass();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = baseGain;
    gate = ctx.createGain();
    gate.gain.value = isMuted ? 0 : 1;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(gate);
    master.connect(gate);
    gate.connect(ctx.destination);
    return ctx;
  }

  function noise() {
    if (!noiseBuffer && ctx) {
      const length = Math.floor(ctx.sampleRate * 0.3);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function env(node, start, peak, attack, decay) {
    const gain = node.gain;
    gain.cancelScheduledValues(start);
    gain.setValueAtTime(0.0001, start);
    gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  }

  function tone(freq, { type = 'sine', start = 0, attack = 0.006, decay = 0.2, peak = 0.5, filter = 0, detune = 0 } = {}) {
    if (!ctx) return;
    const at = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    let last = osc;
    if (filter) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = filter;
      last.connect(lowpass);
      last = lowpass;
    }
    last.connect(amp);
    amp.connect(master);
    env(amp, at, peak, attack, decay);
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
  }

  function click({ start = 0, peak = 0.5, freq = 2400, decay = 0.03 } = {}) {
    if (!ctx) return;
    const at = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 0.9;
    const amp = ctx.createGain();
    src.connect(bp);
    bp.connect(amp);
    amp.connect(master);
    env(amp, at, peak, 0.002, decay);
    src.start(at);
    src.stop(at + decay + 0.05);
  }

  /* ---------------- 効果音 ---------------- */

  function tap() {
    if (!ctx) return;
    click({ peak: 0.22, freq: 1800, decay: 0.02 });
    tone(880, { type: 'triangle', attack: 0.004, decay: 0.05, peak: 0.09 });
  }

  function flip() {
    if (!ctx) return;
    // カードがめくれる: 高いノイズ → 短い「パタッ」
    click({ peak: 0.34, freq: 3200, decay: 0.035 });
    tone(420, { type: 'triangle', start: 0.02, attack: 0.005, decay: 0.09, peak: 0.16 });
    tone(210, { type: 'sine', start: 0.02, attack: 0.005, decay: 0.12, peak: 0.1 });
  }

  /** 消えたラインのチャイム。combo が上がるほど音程も上がる */
  function clear({ combo = 1, lines = 1 } = {}) {
    if (!ctx) return;
    const steps = lines >= 5 ? COMBO_STEPS_5 : lines >= 3 ? COMBO_STEPS_3 : COMBO_STEPS;
    const index = Math.min(steps.length - 1, Math.max(0, combo - 1));
    const root = steps[index];
    // 金色: 明るいサイン＋オクターブ上を少し遅れて
    tone(root, { type: 'sine', attack: 0.004, decay: 0.5, peak: 0.42 });
    tone(root * 1.5, { type: 'sine', start: 0.045, attack: 0.004, decay: 0.42, peak: 0.2 });
    tone(root * 2, { type: 'triangle', start: 0.09, attack: 0.004, decay: 0.32, peak: 0.12 });
    click({ peak: 0.12, freq: 6400, decay: 0.09 });
  }

  function drop() {
    if (!ctx) return;
    click({ peak: 0.12, freq: 900, decay: 0.05 });
    tone(150, { type: 'sine', attack: 0.008, decay: 0.12, peak: 0.12 });
  }

  function record() {
    if (!ctx) return;
    [SCALE.C5, SCALE.E5, SCALE.G5, SCALE.C6].forEach((freq, i) => tone(freq, { type: 'sine', start: i * 0.07, decay: 0.28, peak: 0.25 }));
  }

  function over() {
    if (!ctx) return;
    [SCALE.G4, SCALE.E4, SCALE.C4].forEach((freq, i) => tone(freq, { type: 'triangle', start: i * 0.12, decay: 0.42, peak: 0.18 }));
  }

  /* ---------------- BGM ---------------- */

  function scheduleBgmBar(when) {
    if (!ctx) return;
    const chord = BGM_CHORDS[bgmStep % BGM_CHORDS.length];
    bgmStep += 1;
    const bar = 4;
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 900;
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = i * 4 - 4;
      osc.connect(lowpass);
      lowpass.connect(amp);
      amp.connect(musicGain);
      const attack = 1.6 + i * 0.2;
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.05 / (i + 1), when + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + bar);
      osc.start(when);
      osc.stop(when + bar + 0.1);
    });
    bgmNextAt = when + bar;
  }

  function pumpBgm() {
    if (!ctx || !bgmWanted) return;
    while (bgmNextAt < ctx.currentTime + 1.2) scheduleBgmBar(bgmNextAt);
    bgmTimer = setTimeout(pumpBgm, 800);
  }

  function startBgm() {
    if (!ctx) return;
    bgmWanted = true;
    if (musicGain) {
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(1, now + 1.2);
    }
    if (bgmNextAt < ctx.currentTime) bgmNextAt = ctx.currentTime + 0.2;
    if (!bgmTimer) pumpBgm();
  }

  function stopBgm() {
    bgmWanted = false;
    if (bgmTimer) {
      clearTimeout(bgmTimer);
      bgmTimer = null;
    }
    if (ctx && musicGain) {
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0, now + 0.5);
    }
  }

  /* ---------------- 外から見えるもの ---------------- */

  return {
    /** 最初のタップで呼ぶ。何度呼んでも安全 */
    unlock() {
      applySession(AUDIO_SESSION_TYPE);
      activateNative();
      const context = ensureContext();
      if (!context) return false;
      if (context.state === 'suspended') {
        const resumed = context.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
      if (!primed) {
        primeSilence();
        primed = true;
      }
      if (bgmWanted && !bgmTimer) pumpBgm();
      return true;
    },
    tap,
    flip,
    clear,
    drop,
    record,
    over,
    /** 設定の効果音 ON/OFF（BGM は別） */
    setMuted(value) {
      isMuted = Boolean(value);
      applySession(isMuted ? QUIET_SESSION_TYPE : AUDIO_SESSION_TYPE);
      if (master) master.gain.value = isMuted ? 0 : baseGain;
      if (gate && ctx) {
        const now = ctx.currentTime;
        gate.gain.cancelScheduledValues(now);
        gate.gain.setValueAtTime(gate.gain.value, now);
        gate.gain.linearRampToValueAtTime(isMuted ? 0 : 1, now + 0.05);
      }
    },
    setBgm(on) {
      if (on) startBgm();
      else stopBgm();
    },
    /** アプリが戻ってきたとき（電話・Siri のあと）に起こし直す */
    revive() {
      applySession(AUDIO_SESSION_TYPE);
      activateNative();
      if (ctx && ctx.state === 'suspended') {
        const resumed = ctx.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
      if (bgmWanted) {
        bgmNextAt = ctx ? Math.max(bgmNextAt, ctx.currentTime + 0.1) : bgmNextAt;
        if (!bgmTimer) pumpBgm();
      }
    },
    get unlocked() {
      return Boolean(ctx);
    },
    get state() {
      return ctx ? ctx.state : 'none';
    },
    get sessionType() {
      return sessionType;
    },
    get mute() {
      return isMuted;
    },
    get bgm() {
      return bgmWanted;
    },
  };
}

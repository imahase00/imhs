// パズトレ: BGM・効果音（Web Audio で合成。音源ファイル不要・オフライン可）
// 最初のユーザー操作で開始。画面が隠れたら一時停止し、復帰時に再開（多重再生しない）。

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

const SONGS = {
  title: {
    root: 62, bpm: 96, drums: false,
    chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    melody: [7, null, 12, null, 11, 12, 14, null, 12, null, 7, null, 9, null, null, null,
             9, null, 12, null, 14, 16, 14, null, 12, 11, 9, null, 7, null, null, null],
  },
  dungeon: {
    root: 57, bpm: 112, drums: true,
    chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],
    melody: [12, null, 10, 12, 15, null, 12, null, 10, null, 7, null, 8, 10, null, null,
             12, null, 15, 17, 15, null, 12, null, 14, null, 11, null, 7, null, null, null],
  },
  boss: {
    root: 52, bpm: 138, drums: true,
    chords: [[0, 3, 7], [1, 5, 8], [-2, 2, 5], [-1, 3, 6]],
    melody: [12, 15, 12, 15, 17, null, 15, null, 13, 15, 13, null, 12, null, 10, null,
             12, 15, 17, 20, 18, null, 17, null, 15, 13, 12, null, 11, null, 12, null],
  },
  ending: {
    root: 65, bpm: 88, drums: false,
    chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]],
    melody: [12, null, 16, null, 19, null, 17, 16, 14, null, 12, null, 14, null, null, null,
             16, null, 19, null, 21, null, 19, 17, 16, null, 14, 16, 12, null, null, null],
  },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.song = 'title';
    this.tempo = 1;
    this.settings = { bgm: { volume: 0.5, muted: false }, sfx: { volume: 0.7, muted: false } };
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.hidden = false;
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.pause());
    window.addEventListener('pageshow', () => this.onVisibility());
  }

  apply(settings) {
    this.settings = settings;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bgmGain.gain.setTargetAtTime(settings.bgm.muted ? 0 : settings.bgm.volume * 0.55, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(settings.sfx.muted ? 0 : settings.sfx.volume, t, 0.02);
  }

  /** ユーザー操作のイベント内で呼ぶ */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.bgmFilter = this.ctx.createBiquadFilter();
      this.bgmFilter.type = 'lowpass';
      this.bgmFilter.frequency.value = 3200;
      this.bgmFilter.connect(this.bgmGain);
      this.apply(this.settings);
    }
    if (this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume().catch(() => {});
    if (!this.started) {
      this.started = true;
      this.startLoop();
    }
  }

  setSong(id) {
    if (!SONGS[id] || id === this.song) return;
    this.song = id;
    this.step = 0;
    this.tempo = 1;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.12;
  }
  setTempo(k) { this.tempo = k; }

  startLoop() {
    if (this.timer || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 80);
  }
  stopLoop() { clearInterval(this.timer); this.timer = null; }
  pause() {
    this.stopLoop();
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }
  onVisibility() {
    this.hidden = document.visibilityState === 'hidden';
    if (this.hidden) { this.pause(); return; }
    if (!this.ctx || !this.started) return;
    this.ctx.resume().then(() => { if (!this.timer) this.startLoop(); }).catch(() => {});
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const song = SONGS[this.song];
    const eighth = 60 / (song.bpm * this.tempo) / 2;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.3) {
      this.playStep(song, this.step, this.nextTime, eighth);
      this.step = (this.step + 1) % song.melody.length;
      this.nextTime += eighth;
    }
  }

  playStep(song, step, t, eighth) {
    const bar = Math.floor(step / 8) % song.chords.length;
    const chord = song.chords[bar];
    const d = this.bgmFilter;
    if (step % 8 === 0) {
      for (const n of chord) this.tone(NOTE(song.root - 12 + n), t, eighth * 7.6, 'triangle', 0.035, d, 0.2);
    }
    // ベース（はずむ8分）
    if (song.drums || step % 2 === 0) this.tone(NOTE(song.root - 24 + chord[step % 4 === 3 ? 2 : 0]), t, eighth * 0.9, 'triangle', 0.09, d, 0.005);
    const m = song.melody[step];
    if (m != null) {
      // 笛のような旋律（矩形波を丸めて）
      this.tone(NOTE(song.root + m), t, eighth * 1.8, 'square', 0.022, d, 0.01);
      this.tone(NOTE(song.root + m) * 2.003, t, eighth * 1.2, 'sine', 0.018, d, 0.01);
    }
    if (song.drums) {
      if (step % 4 === 0) this.kick(t);
      if (step % 8 === 4) this.noise(t, 0.12, 0.12, 1800, d, 'bandpass');     // 締め太鼓
      if (step % 2 === 1) this.noise(t, 0.04, 0.05, 7000, d, 'highpass');     // 鉦
      if (step % 16 === 14) this.noise(t, 0.08, 0.09, 1500, d, 'bandpass');
    }
  }

  tone(freq, t, dur, type, vol, dest, attack = 0.01, slide = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  kick(t) {
    this.tone(130, t, 0.18, 'sine', 0.2, this.bgmFilter, 0.002, 0.3);
  }
  noise(t, dur, vol, freq, dest, type = 'bandpass') {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(dest);
    src.start(t);
  }

  sfx(kind, arg = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.last ??= {};
    const gap = { move: 0.035, hit: 0.05 }[kind] ?? 0;
    if (gap && now - (this.last[kind] ?? 0) < gap) return;
    this.last[kind] = now;
    const t = now + 0.01;
    const d = this.sfxGain;
    switch (kind) {
      case 'pick': this.tone(NOTE(76), t, 0.08, 'sine', 0.07, d, 0.003); break;
      case 'move': this.tone(NOTE(88 + (arg % 3) * 2), t, 0.04, 'triangle', 0.035, d, 0.002); break;
      case 'drop': this.tone(NOTE(72), t, 0.08, 'sine', 0.06, d, 0.003, 0.7); break;
      case 'combo': {  // コンボが増えるほど高い音
        const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
        const n = 72 + scale[Math.min(scale.length - 1, arg - 1)];
        this.tone(NOTE(n), t, 0.22, 'triangle', 0.1, d, 0.003);
        this.tone(NOTE(n + 12), t, 0.16, 'sine', 0.05, d, 0.003);
        this.tone(NOTE(n + 19), t + 0.02, 0.12, 'sine', 0.025, d, 0.003);
        break;
      }
      case 'hit': this.noise(t, 0.12, 0.25, 900, d, 'bandpass'); this.tone(NOTE(48), t, 0.12, 'square', 0.04, d, 0.002, 0.6); break;
      case 'weak': this.noise(t, 0.16, 0.32, 1400, d, 'bandpass'); this.tone(NOTE(60), t, 0.16, 'square', 0.05, d, 0.002, 0.5); break;
      case 'break':
        this.noise(t, 0.6, 0.45, 300, d, 'lowpass');
        this.noise(t + 0.05, 0.4, 0.2, 2200, d, 'bandpass');
        [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), t + 0.2 + i * 0.07, 0.3, 'triangle', 0.07, d, 0.004));
        break;
      case 'phase': this.noise(t, 0.5, 0.35, 220, d, 'lowpass'); this.tone(NOTE(43), t, 0.6, 'sawtooth', 0.06, d, 0.02, 0.8); break;
      case 'trap':
        this.noise(t, 0.35, 0.4, 400, d, 'lowpass');
        this.tone(NOTE(45), t, 0.3, 'sawtooth', 0.07, d, 0.003, 0.6);
        break;
      case 'count': this.tone(NOTE(81), t, 0.06, 'square', 0.03, d, 0.002); break;
      case 'heal': [79, 84, 88].forEach((n, i) => this.tone(NOTE(n), t + i * 0.06, 0.3, 'sine', 0.06, d, 0.004)); break;
      case 'skill': [67, 74, 79, 86].forEach((n, i) => this.tone(NOTE(n), t + i * 0.05, 0.25, 'triangle', 0.07, d, 0.003)); this.noise(t, 0.3, 0.12, 5000, d, 'highpass'); break;
      case 'treasure':
      case 'clear':
        [72, 76, 79, 84, 79, 84, 88, 91].forEach((n, i) => this.tone(NOTE(n), t + i * 0.09, 0.5, 'triangle', 0.09, d, 0.004));
        break;
      case 'fail': [67, 63, 60, 55, 51].forEach((n, i) => this.tone(NOTE(n), t + i * 0.16, 0.5, 'triangle', 0.08, d, 0.004)); break;
      case 'buy': [84, 88, 91, 96].forEach((n, i) => this.tone(NOTE(n), t + i * 0.05, 0.2, 'sine', 0.07, d, 0.003)); break;
      case 'select': this.tone(NOTE(84), t, 0.07, 'sine', 0.06, d, 0.004); break;
      case 'page': this.tone(NOTE(79), t, 0.08, 'sine', 0.05, d, 0.004); break;
      default:
    }
  }
}

export const audio = new AudioEngine();

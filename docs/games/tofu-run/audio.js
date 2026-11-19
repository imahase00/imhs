// にげろ！とうふ: BGM・効果音（Web Audio で合成。音源ファイル不要・オフライン可）
// 最初のユーザー操作で開始。画面が隠れたら一時停止し、復帰時に再開（多重再生しない）。

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

// 走る曲は太鼓つき。速さは走りの速さに合わせて少し上がる
const SONGS = {
  title: {
    root: 62, bpm: 104, drums: false,
    chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]],
    melody: [12, null, 14, 16, null, 14, 12, null, 9, null, 12, null, 14, null, null, null,
             16, null, 19, 16, null, 14, 12, null, 14, null, 16, 14, 12, null, null, null],
  },
  run: {
    root: 64, bpm: 150, drums: true,
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]],
    melody: [12, 15, 17, null, 19, 17, 15, null, 12, null, 10, 12, 15, null, 12, null,
             19, null, 22, 19, 17, null, 15, 17, 19, null, 17, 15, 12, null, 15, null],
  },
  over: {
    root: 60, bpm: 84, drums: false,
    chords: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -1, 2]],
    melody: [12, null, 10, null, 8, null, 7, null, null, null, 5, null, 7, null, null, null,
             8, null, 7, null, 5, null, 3, null, 2, null, null, null, 0, null, null, null],
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
    this.tone(150, t, 0.16, 'sine', 0.22, this.bgmFilter, 0.002, 0.3);
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
    const gap = { negi: 0.03, lane: 0.05 }[kind] ?? 0;
    if (gap && now - (this.last[kind] ?? 0) < gap) return;
    this.last[kind] = now;
    const t = now + 0.01;
    const d = this.sfxGain;
    switch (kind) {
      case 'jump':   // ぷるん
        this.tone(330, t, 0.22, 'sine', 0.16, d, 0.005, 2.2);
        this.tone(660, t + 0.02, 0.12, 'triangle', 0.05, d, 0.005, 1.6);
        break;
      case 'land':
        this.tone(220, t, 0.12, 'sine', 0.1, d, 0.003, 0.6);
        break;
      case 'slide':  // ぺしゃっ
        this.noise(t, 0.14, 0.18, 900, d, 'lowpass');
        this.tone(300, t, 0.18, 'sine', 0.12, d, 0.004, 0.45);
        break;
      case 'lane':
        this.noise(t, 0.09, 0.08, 2400 + arg * 400, d, 'bandpass');
        break;
      case 'negi': {  // 続けてとると音が上がる
        const n = 84 + [0, 2, 4, 7, 9, 12, 14, 16][Math.min(7, arg)];
        this.tone(NOTE(n), t, 0.12, 'sine', 0.08, d, 0.003);
        this.tone(NOTE(n + 12), t, 0.08, 'sine', 0.03, d, 0.003);
        break;
      }
      case 'ice':
        [88, 95, 100].forEach((n, i) => this.tone(NOTE(n), t + i * 0.05, 0.4, 'sine', 0.07, d, 0.003));
        break;
      case 'katsuo':
        [76, 79, 83, 88, 91].forEach((n, i) => this.tone(NOTE(n), t + i * 0.045, 0.2, 'triangle', 0.06, d, 0.003));
        break;
      case 'shield':
        this.noise(t, 0.3, 0.3, 4200, d, 'highpass');
        this.tone(NOTE(96), t, 0.4, 'sine', 0.06, d, 0.002, 0.7);
        break;
      case 'crash':  // ぐしゃっ
        this.noise(t, 0.45, 0.5, 500, d, 'lowpass');
        this.noise(t + 0.02, 0.25, 0.25, 2200, d, 'bandpass');
        this.tone(260, t, 0.5, 'sawtooth', 0.06, d, 0.004, 0.25);
        [67, 63, 60, 55].forEach((n, i) => this.tone(NOTE(n), t + 0.35 + i * 0.13, 0.3, 'triangle', 0.07, d, 0.004));
        break;
      case 'zone':
        [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), t + i * 0.08, 0.35, 'triangle', 0.08, d, 0.004));
        break;
      case 'best':
      case 'mission':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n), t + i * 0.1, 0.45, 'triangle', 0.09, d, 0.004));
        break;
      case 'start':
        this.tone(NOTE(72), t, 0.1, 'square', 0.04, d, 0.003);
        this.tone(NOTE(84), t + 0.1, 0.25, 'square', 0.05, d, 0.003);
        break;
      case 'select':
        this.tone(NOTE(84), t, 0.07, 'sine', 0.06, d, 0.004);
        break;
      case 'page':
        this.tone(NOTE(79), t, 0.08, 'sine', 0.05, d, 0.004);
        break;
      default:
    }
  }
}

export const audio = new AudioEngine();

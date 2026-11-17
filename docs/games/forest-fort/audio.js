// 森のとりで: オリジナルBGM・効果音（Web Audio で合成。音源ファイル不要・オフライン可）
// 最初のユーザー操作で開始。画面が隠れたら一時停止し、復帰時に再開（多重再生しない）。

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDIノート→Hz

// 場面ごとの曲: 昼（休憩）・夜（ウェーブ）・ボス・夜明け
const SONGS = {
  day: {
    root: 64, bpm: 92, // E
    chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    melody: [12, null, 11, 9, 7, null, 9, null, 11, 12, 14, null, 12, null, null, null,
             9, null, 7, 9, 11, null, 7, null, 4, null, 7, 9, 7, null, null, null],
  },
  night: {
    root: 57, bpm: 132, // A minor
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]],
    melody: [12, 12, 15, null, 14, 12, 10, null, 12, null, 7, null, 10, 12, null, null,
             15, 15, 17, null, 15, 14, 12, null, 14, null, 10, 12, 7, null, null, null],
  },
  boss: {
    root: 50, bpm: 148, // D minor
    chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]],
    melody: [12, 15, 12, 15, 13, null, 12, null, 10, 12, 13, null, 15, null, 17, null,
             12, 15, 12, 15, 18, null, 17, null, 15, 13, 12, null, 10, null, 12, null],
  },
  dawn: {
    root: 65, bpm: 84, // F
    chords: [[0, 4, 7], [-7, -3, 0], [-5, -1, 2], [0, 4, 7]],
    melody: [12, null, 16, null, 19, null, 17, 16, 14, null, 12, null, 14, null, null, null,
             16, null, 19, null, 21, null, 19, 17, 16, null, 14, 16, 12, null, null, null],
  },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.song = 'day';
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
    const b = settings.bgm.muted ? 0 : settings.bgm.volume * 0.55;
    const s = settings.sfx.muted ? 0 : settings.sfx.volume;
    this.bgmGain.gain.setTargetAtTime(b, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(s, t, 0.02);
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
      // BGM用のやわらかいローパス
      this.bgmFilter = this.ctx.createBiquadFilter();
      this.bgmFilter.type = 'lowpass';
      this.bgmFilter.frequency.value = 2600;
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
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.3;
  }

  startLoop() {
    if (this.timer || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  stopLoop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  pause() {
    this.stopLoop();
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  onVisibility() {
    this.hidden = document.visibilityState === 'hidden';
    if (this.hidden) { this.pause(); return; }
    if (!this.ctx || !this.started) return;
    this.ctx.resume().then(() => {
      if (!this.timer) this.startLoop();
    }).catch(() => {});
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const song = SONGS[this.song];
    const eighth = 60 / song.bpm / 2;
    // 長時間停止後に追いつこうとして一気に鳴らさない
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.35) {
      this.playStep(song, this.step, this.nextTime, eighth);
      this.step = (this.step + 1) % song.melody.length;
      this.nextTime += eighth;
    }
  }

  playStep(song, step, t, eighth) {
    const bar = Math.floor(step / 8) % song.chords.length;
    const chord = song.chords[bar];
    if (step % 8 === 0) {
      // パッド（小節頭で和音）
      for (const n of chord) this.tone(NOTE(song.root - 12 + n), t, eighth * 7.6, 'triangle', 0.045, this.bgmFilter, 0.25);
      this.tone(NOTE(song.root - 24 + chord[0]), t, eighth * 7.5, 'sine', 0.08, this.bgmFilter, 0.05);
    }
    if (step % 2 === 1) {
      // 静かなアルペジオ
      const n = chord[(step >> 1) % chord.length];
      this.tone(NOTE(song.root + n), t, eighth * 1.6, 'sine', 0.025, this.bgmFilter, 0.01);
    }
    const m = song.melody[step];
    if (m != null) {
      // オルゴール風の旋律
      this.bell(NOTE(song.root + m), t, eighth * 3, 0.05, this.bgmFilter);
    }
  }

  tone(freq, t, dur, type, vol, dest, attack = 0.01) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  bell(freq, t, dur, vol, dest) {
    this.tone(freq, t, dur, 'sine', vol, dest, 0.005);
    this.tone(freq * 2, t, dur * 0.5, 'sine', vol * 0.35, dest, 0.005);
    this.tone(freq * 3.01, t, dur * 0.25, 'sine', vol * 0.12, dest, 0.003);
  }

  noise(t, dur, vol, freq, dest) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(dest);
    src.start(t);
  }

  sfx(kind) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // 同じ音が一度に重なりすぎないように間引く
    this.last ??= {};
    const gap = { shoot: 0.06, hit: 0.05, coin: 0.04, pay: 0.07, wall: 0.15 }[kind] ?? 0;
    if (gap && now - (this.last[kind] ?? 0) < gap) return;
    this.last[kind] = now;
    const t = now + 0.01;
    const d = this.sfxGain;
    switch (kind) {
      case 'shoot':
        this.noise(t, 0.06, 0.12, 2600, d);
        this.tone(NOTE(84), t, 0.05, 'triangle', 0.04, d, 0.003);
        break;
      case 'gun':
        this.noise(t, 0.09, 0.22, 900, d);
        break;
      case 'swing':
        this.noise(t, 0.1, 0.18, 1400, d);
        break;
      case 'hit':
        this.tone(NOTE(48), t, 0.06, 'square', 0.05, d, 0.002);
        break;
      case 'kill':
        this.tone(NOTE(72), t, 0.08, 'sine', 0.07, d, 0.003);
        this.tone(NOTE(79), t + 0.05, 0.1, 'sine', 0.06, d, 0.003);
        break;
      case 'coin':
        this.bell(NOTE(96), t, 0.15, 0.06, d);
        break;
      case 'pay':
        this.tone(NOTE(88), t, 0.05, 'sine', 0.05, d, 0.003);
        break;
      case 'build':
        this.noise(t, 0.25, 0.25, 500, d);
        [72, 76, 79, 84].forEach((n, i) => this.bell(NOTE(n), t + 0.08 + i * 0.07, 0.4, 0.12, d));
        break;
      case 'hurt':
        this.tone(NOTE(45), t, 0.15, 'sawtooth', 0.06, d, 0.003);
        break;
      case 'down':
        [64, 60, 55, 52].forEach((n, i) => this.tone(NOTE(n), t + i * 0.1, 0.2, 'triangle', 0.1, d, 0.004));
        break;
      case 'wall':
        this.noise(t, 0.12, 0.15, 300, d);
        break;
      case 'horn':
        this.tone(NOTE(50), t, 0.9, 'sawtooth', 0.05, d, 0.08);
        this.tone(NOTE(57), t + 0.05, 0.9, 'sawtooth', 0.04, d, 0.08);
        break;
      case 'tell':
        this.tone(NOTE(76), t, 0.12, 'square', 0.05, d, 0.003);
        this.tone(NOTE(76), t + 0.18, 0.12, 'square', 0.05, d, 0.003);
        break;
      case 'stomp':
        this.noise(t, 0.4, 0.4, 160, d);
        this.tone(NOTE(33), t, 0.4, 'sine', 0.2, d, 0.003);
        break;
      case 'win':
      case 'fanfare':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.bell(NOTE(n), t + i * 0.11, 0.6, 0.12, d));
        break;
      case 'lose':
        [67, 63, 60, 55].forEach((n, i) => this.bell(NOTE(n), t + i * 0.18, 0.7, 0.1, d));
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

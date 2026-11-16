// マージの旅: オリジナルBGM・効果音（Web Audio で合成。音源ファイル不要・オフライン可）
// 最初のユーザー操作で開始。画面が隠れたら一時停止し、復帰時に再開（多重再生しない）。

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDIノート→Hz

// 島ごとの曲設定: 調（ルート音）・テンポ・コード進行（ルートからの半音）・旋律
const SONGS = {
  komorebi: {
    root: 65, bpm: 84, // F
    chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],          // F Dm Bb C
    melody: [12, null, 14, 16, 19, null, 16, 14, 12, null, 9, null, 7, 9, 12, null,
             14, null, 16, 14, 12, null, 9, 7, 9, null, 12, null, 14, null, null, null],
  },
  shiokaze: {
    root: 67, bpm: 92, // G
    chords: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
    melody: [7, 12, null, 14, 16, null, 14, 12, 9, null, 12, null, 14, null, 7, null,
             9, 12, null, 16, 19, null, 16, 14, 12, null, 9, 12, 14, null, null, null],
  },
  hoshiakari: {
    root: 63, bpm: 72, // Eb
    chords: [[0, 4, 7], [-3, 0, 4], [-8, -5, -1], [-5, -1, 2]],
    melody: [19, null, null, 16, 14, null, 12, null, 14, null, 16, null, 12, null, null, null,
             19, null, 21, 19, 16, null, 14, null, 12, null, 14, 16, 12, null, null, null],
  },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.song = 'komorebi';
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

  sfx(kind) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    const d = this.sfxGain;
    switch (kind) {
      case 'generate': {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(520, t);
        o.frequency.exponentialRampToValueAtTime(980, t + 0.09);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(d);
        o.start(t); o.stop(t + 0.2);
        break;
      }
      case 'merge':
        this.bell(NOTE(81), t, 0.35, 0.16, d);
        this.bell(NOTE(88), t + 0.07, 0.5, 0.14, d);
        this.bell(NOTE(93), t + 0.14, 0.6, 0.08, d);
        break;
      case 'deliver':
        [76, 79, 84, 88].forEach((n, i) => this.bell(NOTE(n), t + i * 0.075, 0.45, 0.13, d));
        this.tone(NOTE(52), t, 0.4, 'triangle', 0.08, d);
        break;
      case 'fanfare':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.bell(NOTE(n), t + i * 0.11, 0.6, 0.12, d));
        break;
      case 'select':
        this.tone(NOTE(84), t, 0.07, 'sine', 0.06, d, 0.004);
        break;
      case 'deny':
        this.tone(NOTE(55), t, 0.16, 'triangle', 0.12, d, 0.005);
        this.tone(NOTE(52), t + 0.08, 0.18, 'triangle', 0.1, d, 0.005);
        break;
      case 'remove':
        this.tone(NOTE(64), t, 0.12, 'sine', 0.1, d, 0.004);
        this.tone(NOTE(57), t + 0.06, 0.16, 'sine', 0.08, d, 0.004);
        break;
      case 'page':
        this.tone(NOTE(79), t, 0.08, 'sine', 0.05, d, 0.004);
        break;
      default:
    }
  }
}

export const audio = new AudioEngine();

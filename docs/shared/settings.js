// IMHS 共通: 端末内の設定（テーマ・ゲーム別の音量）
// localStorage が使えない環境（プライベートモード等）でも既定値で動く。

const KEY = 'imhs:settings:v1';
export const THEMES = ['light', 'dark', 'ehon'];
export const THEME_LABELS = { light: 'ライト', dark: 'ダーク', ehon: '絵本' };

const DEFAULTS = { theme: 'light', games: {} };
const DEFAULT_AUDIO = { bgm: { volume: 0.5, muted: false }, sfx: { volume: 0.7, muted: false } };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const v = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...v, games: { ...(v.games || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}

export function getTheme() {
  const t = read().theme;
  return THEMES.includes(t) ? t : 'light';
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  const s = read();
  s.theme = theme;
  write(s);
  applyTheme(theme);
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = { light: '#f4f6f4', dark: '#16212e', ehon: '#f5ecd8' }[theme];
}

function clampVol(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
}

export function getAudioSettings(gameId) {
  const g = read().games[gameId]?.audio || {};
  return {
    bgm: { volume: clampVol(g.bgm?.volume, DEFAULT_AUDIO.bgm.volume), muted: !!g.bgm?.muted },
    sfx: { volume: clampVol(g.sfx?.volume, DEFAULT_AUDIO.sfx.volume), muted: !!g.sfx?.muted },
  };
}

export function setAudioSettings(gameId, audio) {
  const s = read();
  s.games[gameId] = { ...(s.games[gameId] || {}), audio };
  write(s);
}

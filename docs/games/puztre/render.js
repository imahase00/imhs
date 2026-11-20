// パズトレ: 盤面の描画（球・枠はコードで描く）
import { COLS, ROWS } from './data.js';

const TAU = Math.PI * 2;
function lin(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
function rad(g, x0, y0, r0, x1, y1, r1, stops) { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---- 球（宝石） ----
export const ORB_COLORS = [
  { base: '#e8442e', light: '#ffb08a', dark: '#7a1006', glow: 'rgba(255,120,60,' },
  { base: '#2f80e4', light: '#a8dcff', dark: '#0c2f7a', glow: 'rgba(90,170,255,' },
  { base: '#36a844', light: '#b8f59a', dark: '#0f4a18', glow: 'rgba(110,230,110,' },
  { base: '#f2be16', light: '#fff6b0', dark: '#9a6a04', glow: 'rgba(255,220,80,' },
  { base: '#8c48cc', light: '#dcb4ff', dark: '#30105c', glow: 'rgba(190,120,255,' },
  { base: '#f0609e', light: '#ffd0e6', dark: '#9a124e', glow: 'rgba(255,130,190,' },
];
function symbol(g, k, r) {
  // 球の中の印（色が似て見えても形で分かる）
  g.beginPath();
  switch (k) {
    case 0: // 炎
      g.moveTo(0, r * 0.5);
      g.bezierCurveTo(-r * 0.42, r * 0.45, -r * 0.48, r * 0.02, -r * 0.2, -r * 0.2);
      g.bezierCurveTo(-r * 0.18, -r * 0.02, -r * 0.08, r * 0.02, -r * 0.04, -r * 0.05);
      g.bezierCurveTo(-r * 0.12, -r * 0.3, 0, -r * 0.5, r * 0.08, -r * 0.55);
      g.bezierCurveTo(r * 0.05, -r * 0.3, r * 0.45, -r * 0.15, r * 0.38, r * 0.2);
      g.bezierCurveTo(r * 0.34, r * 0.42, r * 0.18, r * 0.5, 0, r * 0.5);
      break;
    case 1: // しずく
      g.moveTo(0, -r * 0.55);
      g.bezierCurveTo(r * 0.12, -r * 0.3, r * 0.4, -r * 0.05, r * 0.4, r * 0.18);
      g.arc(0, r * 0.18, r * 0.4, 0, Math.PI);
      g.bezierCurveTo(-r * 0.4, -r * 0.05, -r * 0.12, -r * 0.3, 0, -r * 0.55);
      break;
    case 2: // 葉っぱ
      g.moveTo(-r * 0.42, r * 0.42);
      g.bezierCurveTo(-r * 0.5, -r * 0.2, r * 0.05, -r * 0.55, r * 0.48, -r * 0.48);
      g.bezierCurveTo(r * 0.5, -r * 0.02, r * 0.15, r * 0.48, -r * 0.42, r * 0.42);
      break;
    case 3: // 星
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 ? r * 0.24 : r * 0.55;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.03);
      }
      break;
    case 4: // 三日月
      g.arc(0, 0, r * 0.48, Math.PI * 0.3, Math.PI * 1.7, false);
      g.arc(r * 0.2, -r * 0.08, r * 0.38, Math.PI * 1.55, Math.PI * 0.45, true);
      break;
    case 5: // ハート
      g.moveTo(0, r * 0.48);
      g.bezierCurveTo(-r * 0.6, r * 0.05, -r * 0.5, -r * 0.5, 0, -r * 0.2);
      g.bezierCurveTo(r * 0.5, -r * 0.5, r * 0.6, r * 0.05, 0, r * 0.48);
      break;
    default:
  }
  g.closePath();
}
const orbCache = new Map();
/** 色 k の球を一辺 px の正方形キャンバスに描いて返す */
export function orbSprite(k, px) {
  const key = `${k}|${px}`;
  let c = orbCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const col = ORB_COLORS[k];
  const r = px * 0.44;
  g.translate(px / 2, px / 2);
  // 落ち影
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(0, r * 0.9, r * 0.8, r * 0.18, 0, 0, TAU); g.fill();
  // 球
  g.beginPath(); g.arc(0, 0, r, 0, TAU);
  g.fillStyle = rad(g, -r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05, [[0, col.light], [0.45, col.base], [1, col.dark]]);
  g.fill();
  // 底の照り返し
  g.beginPath(); g.arc(0, 0, r, 0, TAU);
  g.fillStyle = rad(g, r * 0.2, r * 0.75, 0, r * 0.2, r * 0.75, r * 0.7, [[0, col.glow + '.55)'], [1, col.glow + '0)']]);
  g.fill();
  // 印（彫りこんだように: 下に影、上に明るい色）
  g.save();
  g.translate(0, r * 0.05);
  symbol(g, k, r); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
  g.translate(0, -r * 0.06);
  symbol(g, k, r); g.fillStyle = lin(g, 0, -r * 0.5, 0, r * 0.5, [[0, 'rgba(255,255,255,.98)'], [1, 'rgba(255,255,255,.72)']]); g.fill();
  g.restore();
  // ふち
  g.beginPath(); g.arc(0, 0, r - 0.5, 0, TAU);
  g.lineWidth = Math.max(1, px * 0.02); g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
  // つや
  g.save(); g.translate(-r * 0.35, -r * 0.45); g.rotate(-0.6); g.scale(r * 0.42, r * 0.2);
  g.beginPath(); g.arc(0, 0, 1, 0, TAU);
  g.fillStyle = rad(g, 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,255,255,.95)'], [0.6, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); g.fill();
  g.restore();
  orbCache.set(key, c);
  return c;
}
/** つた・岩（消せない球） */
function stoneSprite(px, dungeon) {
  const key = `stone|${px}|${dungeon}`;
  let c = orbCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const r = px * 0.44;
  g.translate(px / 2, px / 2);
  g.beginPath();
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; const rr = r * (0.85 + hash(i * 3.3) * 0.18); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath();
  g.fillStyle = rad(g, -r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1, [[0, '#c9c2b4'], [0.6, '#8a8276'], [1, '#4a443c']]);
  g.fill();
  g.strokeStyle = 'rgba(40,30,20,.5)'; g.lineWidth = px * 0.02;
  g.beginPath(); g.moveTo(-r * 0.4, -r * 0.1); g.lineTo(-r * 0.05, r * 0.05); g.lineTo(r * 0.2, -r * 0.3); g.moveTo(-r * 0.05, r * 0.05); g.lineTo(r * 0.05, r * 0.45); g.stroke();
  if (dungeon === 'j' || dungeon === 'g') {
    // つたが巻きつく
    g.strokeStyle = '#2f7a2a'; g.lineWidth = px * 0.06; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-r, r * 0.3); g.bezierCurveTo(-r * 0.2, -r * 0.6, r * 0.3, r * 0.6, r, -r * 0.3); g.stroke();
    g.fillStyle = '#5cb84a';
    for (const [x, y] of [[-r * 0.5, -r * 0.05], [r * 0.15, r * 0.15], [r * 0.6, -r * 0.1]]) { g.beginPath(); g.ellipse(x, y, r * 0.16, r * 0.09, 0.6, 0, TAU); g.fill(); }
  }
  orbCache.set(key, c);
  return c;
}

// ---- 枠 ----
export const FRAME_STYLE = {
  wood: { a: '#8a5a30', b: '#5a3418', c: '#c08a52', d: '#3a2010' },
  sand: { a: '#c9a24a', b: '#8a6418', c: '#f2d890', d: '#4a3008' },
  moss: { a: '#6a7a5a', b: '#3e4a34', c: '#9ab07a', d: '#22301a' },
  iron: { a: '#7a8088', b: '#3e444c', c: '#c4ccd4', d: '#1e2228' },
  gem: { a: '#4a3a7a', b: '#2a1e4a', c: '#a894e0', d: '#140c28' },
  gold: { a: '#e0aa30', b: '#9a6a0a', c: '#fff0a0', d: '#5a3a00' },
  ancient: { a: '#a89a80', b: '#6a5e48', c: '#e0d6bc', d: '#3a3224' },
  star: { a: '#28366a', b: '#141c3e', c: '#8aa0e8', d: '#080c22' },
};
export function drawFrame(g, x, y, w, h, ft, id, t = 0) {
  const s = FRAME_STYLE[id] ?? FRAME_STYLE.wood;
  // 外側の枠（立体的に）
  g.save();
  g.beginPath(); g.roundRect(x - ft, y - ft, w + ft * 2, h + ft * 2, ft * 1.2);
  g.roundRect(x, y, w, h, ft * 0.3);
  g.fillStyle = lin(g, x, y - ft, x, y + h + ft, [[0, s.c], [0.08, s.a], [0.5, s.b], [0.92, s.a], [1, s.d]]);
  g.fill('evenodd');
  g.lineWidth = 1.5; g.strokeStyle = s.d;
  g.beginPath(); g.roundRect(x - ft, y - ft, w + ft * 2, h + ft * 2, ft * 1.2); g.stroke();
  g.beginPath(); g.roundRect(x - 1, y - 1, w + 2, h + 2, ft * 0.3); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
  g.beginPath(); g.roundRect(x - ft + 2, y - ft + 2, w + ft * 2 - 4, h + ft * 2 - 4, ft); g.stroke();
  // 枠ごとの飾り
  const corners = [[x - ft / 2, y - ft / 2], [x + w + ft / 2, y - ft / 2], [x - ft / 2, y + h + ft / 2], [x + w + ft / 2, y + h + ft / 2]];
  const dot = (cx, cy, r, fill) => { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = fill; g.fill(); };
  if (id === 'wood') {
    g.strokeStyle = 'rgba(40,20,5,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { const yy = y - ft + ft * 0.3 + i * 1.5; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + w * 0.3, yy + 2, x + w * 0.6, yy - 2, x + w, yy); g.stroke(); }
  } else if (id === 'iron') {
    for (let i = 0; i <= 8; i++) for (const yy of [y - ft / 2, y + h + ft / 2]) { const xx = x + w * i / 8; dot(xx, yy, ft * 0.18, rad(g, xx - 1, yy - 1, 0, xx, yy, ft * 0.2, [[0, '#f0f4f8'], [1, '#4a5058']])); }
    for (let i = 1; i < 6; i++) for (const xx of [x - ft / 2, x + w + ft / 2]) { const yy = y + h * i / 6; dot(xx, yy, ft * 0.18, rad(g, xx - 1, yy - 1, 0, xx, yy, ft * 0.2, [[0, '#f0f4f8'], [1, '#4a5058']])); }
  } else if (id === 'moss') {
    for (let i = 0; i < 26; i++) { const k = hash(i * 7.7); const side = i % 4; const xx = side < 2 ? x + k * w : side === 2 ? x - ft / 2 : x + w + ft / 2; const yy = side === 0 ? y - ft / 2 : side === 1 ? y + h + ft / 2 : y + k * h; dot(xx, yy, ft * (0.25 + hash(i) * 0.3), i % 3 ? '#5f9a3a' : '#86c050'); }
  } else if (id === 'sand') {
    for (const [cx, cy] of corners) {
      g.fillStyle = '#f2d890';
      g.beginPath(); g.moveTo(cx - ft * 0.5, cy - ft * 0.6); g.lineTo(cx + ft * 0.5, cy - ft * 0.6); g.lineTo(cx, cy); g.lineTo(cx + ft * 0.5, cy + ft * 0.6); g.lineTo(cx - ft * 0.5, cy + ft * 0.6); g.lineTo(cx, cy); g.closePath(); g.fill();
      g.strokeStyle = '#6a4a10'; g.stroke();
    }
  } else if (id === 'gem' || id === 'gold') {
    const gems = ['#ff4a4a', '#4aa0ff', '#4ad06a', '#ffd84a', '#b070ff', '#ff7ab8'];
    corners.forEach(([cx, cy], i) => {
      g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4);
      g.fillStyle = rad(g, -ft * 0.15, -ft * 0.15, 0, 0, 0, ft * 0.6, [[0, '#ffffff'], [0.3, gems[i]], [1, '#1a1020']]);
      g.fillRect(-ft * 0.42, -ft * 0.42, ft * 0.84, ft * 0.84);
      g.restore();
    });
    if (id === 'gold') {
      const k = (t * 0.35) % 1.4;
      g.save(); g.beginPath(); g.roundRect(x - ft, y - ft, w + ft * 2, h + ft * 2, ft * 1.2); g.roundRect(x, y, w, h, ft * 0.3); g.clip('evenodd');
      g.fillStyle = lin(g, x - w * 0.3 + k * w * 1.2, y, x + k * w * 1.2, y + h, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,240,.6)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(x - ft, y - ft, w + ft * 2, h + ft * 2);
      g.restore();
    }
  } else if (id === 'ancient') {
    g.strokeStyle = 'rgba(60,50,30,.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) {
      const xx = x + (i + 0.5) * w / 10;
      for (const yy of [y - ft / 2, y + h + ft / 2]) { g.beginPath(); g.moveTo(xx - ft * 0.3, yy - ft * 0.2); g.lineTo(xx + ft * 0.3, yy - ft * 0.2); g.lineTo(xx + ft * 0.3, yy + ft * 0.2); g.lineTo(xx - ft * 0.1, yy + ft * 0.2); g.lineTo(xx - ft * 0.1, yy); g.stroke(); }
    }
  } else if (id === 'star') {
    for (let i = 0; i < 30; i++) {
      const k = hash(i * 5.1); const side = i % 4;
      const xx = side < 2 ? x + k * w : side === 2 ? x - ft / 2 : x + w + ft / 2;
      const yy = side === 0 ? y - ft / 2 : side === 1 ? y + h + ft / 2 : y + k * h;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + i);
      dot(xx, yy, ft * (0.08 + tw * 0.1), `rgba(255,250,210,${0.5 + tw * 0.5})`);
    }
  }
  g.restore();
}

// ---- 盤面 ----
/**
 * layout: { x, y, cs }（盤面の左上と1マスの大きさ）
 * vis: Map(id → { x, y, s, a })  見た目の位置（マス単位）・大きさ・透明度
 * held: { id, px, py } つかんでいる球（指の位置）
 */
export function drawBoard(g, layout, board, vis, held, opts) {
  const { x, y, cs } = layout;
  const w = cs * COLS;
  const h = cs * ROWS;
  // マスの地
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, cs * 0.08); g.clip();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      g.fillStyle = (r + c) % 2 ? 'rgba(30,22,16,.86)' : 'rgba(48,36,26,.86)';
      g.fillRect(x + c * cs, y + r * cs, cs, cs);
    }
  }
  if (opts.dim) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y, w, h); }
  // 球
  const px = Math.round(cs * opts.dpr);
  const drawCell = (cell, vx, vy, s = 1, a = 1, lift = false) => {
    const cx = x + (vx + 0.5) * cs;
    const cy = y + (vy + 0.5) * cs;
    const size = cs * s * (lift ? 1.15 : 1);
    g.globalAlpha = a;
    if (cell.stone > 0) g.drawImage(stoneSprite(px, opts.dungeon), cx - size / 2, cy - size / 2, size, size);
    else if (cell.dark > 0 && !lift) {
      g.fillStyle = rad(g, cx - size * 0.15, cy - size * 0.15, 1, cx, cy, size * 0.45, [[0, '#5a5a6a'], [1, '#14141c']]);
      g.beginPath(); g.arc(cx, cy, size * 0.44, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `900 ${Math.round(size * 0.42)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', cx, cy + size * 0.02);
    } else g.drawImage(orbSprite(cell.c, px), cx - size / 2, cy - size / 2, size, size);
    if (cell.ice > 0) {
      g.fillStyle = 'rgba(190,235,255,.45)';
      g.beginPath(); g.roundRect(cx - size * 0.47, cy - size * 0.47, size * 0.94, size * 0.94, size * 0.12); g.fill();
      g.strokeStyle = 'rgba(240,252,255,.9)'; g.lineWidth = Math.max(1, cs * 0.03); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1, cs * 0.025);
      g.beginPath(); g.moveTo(cx - size * 0.3, cy - size * 0.1); g.lineTo(cx - size * 0.1, cy - size * 0.3); g.moveTo(cx + size * 0.1, cy + size * 0.32); g.lineTo(cx + size * 0.32, cy + size * 0.1); g.stroke();
    }
    g.globalAlpha = 1;
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (!cell || (held && cell.id === held.id) || opts.hidden?.has(cell.id)) continue;
      const v = vis.get(cell.id);
      drawCell(cell, v ? v.x : c, v ? v.y : r, v?.s ?? 1, v?.a ?? 1);
    }
  }
  // 消えていく球
  for (const gh of opts.ghosts ?? []) {
    drawCell(gh.cell, gh.x, gh.y, gh.s, gh.a);
    if (gh.flash > 0) {
      const cx = x + (gh.x + 0.5) * cs; const cy = y + (gh.y + 0.5) * cs;
      g.fillStyle = rad(g, cx, cy, 0, cx, cy, cs * 0.8, [[0, ORB_COLORS[gh.cell.c].glow + (0.7 * gh.flash) + ')'], [1, ORB_COLORS[gh.cell.c].glow + '0)']]);
      g.fillRect(cx - cs, cy - cs, cs * 2, cs * 2);
    }
  }
  g.restore();
  // つかんでいる球（指の少し上に、大きめに）
  if (held) {
    const cell = board.flat().find((b) => b && b.id === held.id);
    if (cell) {
      const vx = (held.px - x) / cs - 0.5;
      const vy = (held.py - y) / cs - 0.5;
      g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = cs * 0.3; g.shadowOffsetY = cs * 0.12;
      drawCell(cell, vx, vy, 1, 0.95, true);
      g.restore();
      // 元の場所の目印
      const [hr, hc] = held.at;
      g.strokeStyle = 'rgba(255,240,200,.7)'; g.lineWidth = 2;
      g.beginPath(); g.arc(x + (hc + 0.5) * cs, y + (hr + 0.5) * cs, cs * 0.4, 0, TAU); g.stroke();
    }
  }
}

/** 枠の見本（ショップ用） */
export function frameThumb(canvas, id) {
  const g = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height;
  g.clearRect(0, 0, W, H);
  const ft = W * 0.07;
  const cs = (W - ft * 2 - 8) / 3;
  const bx = ft + 4; const by = ft + 4;
  const board = [[0, 3, 1], [2, 5, 4]].map((row) => row.map((c) => ({ c, id: -1, stone: 0, ice: 0, dark: 0 })));
  g.save();
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { g.fillStyle = (r + c) % 2 ? '#1e1610' : '#30241a'; g.fillRect(bx + c * cs, by + r * cs, cs, cs); }
  const px = Math.round(cs * 2);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) g.drawImage(orbSprite(board[r][c].c, px), bx + c * cs, by + r * cs, cs, cs);
  g.restore();
  drawFrame(g, bx, by, cs * 3, cs * 2, ft, id, 0.6);
  void H;
}

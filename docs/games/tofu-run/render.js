// にげろ！とうふ: 描画（画像ファイルなし。すべて Canvas の図形とグラデーションで描く）
import { LANE_W, ROAD_HALF, TOFU, LAP, zoneAt, OBSTACLES } from './data.js';
import { tofuHeight } from './sim.js';

const TAU = Math.PI * 2;
const S = 220;                 // 部品の解像度（1m あたりのピクセル）
const CAM_BACK = 3.7;          // カメラはとうふの何m後ろか
const CAM_H = 2.0;             // カメラの高さ
const FAR = 80;                // 描く距離
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mix = (a, b, t) => a + (b - a) * t;

// ---- 小さな描画道具 ----
function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function rad(g, x0, y0, r0, x1, y1, r1, stops) {
  const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function oval(g, x, y, rx, ry, fill, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}
/** ふんわりした光沢（白い楕円のぼかし） */
function shine(g, x, y, rx, ry, a = 0.7, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(rx, ry);
  g.beginPath();
  g.arc(0, 0, 1, 0, TAU);
  g.fillStyle = rad(g, 0, 0, 0, 0, 0, 1, [[0, `rgba(255,255,255,${a})`], [0.55, `rgba(255,255,255,${a * 0.45})`], [1, 'rgba(255,255,255,0)']]);
  g.fill();
  g.restore();
}
function dots(g, n, x0, y0, x1, y1, r, color, seed) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.arc(mix(x0, x1, hash(seed * 31 + i)), mix(y0, y1, hash(seed * 17 + i * 3.1)), r * (0.6 + hash(i + seed) * 0.8), 0, TAU);
    g.fill();
  }
}
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';
function mtext(g, str, x, y, size, color, { weight = 800, rot = 0, stroke = null } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(1 / S, 1 / S);
  g.font = `${weight} ${Math.round(size * S)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = stroke[1] * S; g.strokeStyle = stroke[0]; g.lineJoin = 'round'; g.strokeText(str, 0, 0); }
  g.fillStyle = color;
  g.fillText(str, 0, 0);
  g.restore();
}
function stick(g, x0, y0, x1, y1, w, c0, c1, hi = 0.5) {
  // 丸い棒（光沢つき）
  g.lineCap = 'round';
  g.lineWidth = w;
  g.strokeStyle = c1;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.lineWidth = w * 0.62;
  g.strokeStyle = c0;
  g.beginPath(); g.moveTo(x0, y0 - w * 0.08); g.lineTo(x1, y1 - w * 0.08); g.stroke();
  g.lineWidth = w * 0.18;
  g.strokeStyle = `rgba(255,255,255,${hi})`;
  g.beginPath(); g.moveTo(x0 + w * 0.3, y0 - w * 0.25); g.lineTo(x1 - w * 0.3, y1 - w * 0.25); g.stroke();
}
function steel(g, x0, x1) {
  return lin(g, x0, 0, x1, 0, [[0, '#5f6a73'], [0.18, '#c9d2d8'], [0.3, '#ffffff'], [0.38, '#dfe5e9'], [0.55, '#8d99a2'], [0.78, '#4f5962'], [0.92, '#aab5bd'], [1, '#6c777f']]);
}

// ---- 部品（障害物・拾うもの・飾り）。原点は足もと中央、上がマイナス ----
const SPR = {
  pot: { w: 1.0, h: 0.72, draw(g) {
    g.beginPath(); g.moveTo(-0.43, -0.3); g.bezierCurveTo(-0.46, -0.04, -0.25, 0, 0, 0); g.bezierCurveTo(0.25, 0, 0.46, -0.04, 0.43, -0.3); g.closePath();
    g.fillStyle = lin(g, -0.45, 0, 0.45, 0, [[0, '#24140c'], [0.28, '#77462a'], [0.42, '#93603a'], [0.7, '#4c2c19'], [1, '#1d100a']]); g.fill();
    dots(g, 46, -0.38, -0.27, 0.38, -0.05, 0.006, 'rgba(255,236,200,.32)', 3);
    for (const s of [-1, 1]) { rr(g, s * 0.47 - 0.055, -0.3, 0.11, 0.075, 0.03); g.fillStyle = lin(g, 0, -0.3, 0, -0.22, [[0, '#8a5634'], [1, '#3c2214']]); g.fill(); }
    oval(g, 0, -0.3, 0.445, 0.05, '#140a05');
    g.beginPath(); g.moveTo(-0.41, -0.31); g.bezierCurveTo(-0.4, -0.64, 0.4, -0.64, 0.41, -0.31); g.closePath();
    g.fillStyle = rad(g, -0.14, -0.55, 0.02, 0, -0.38, 0.5, [[0, '#f3ead6'], [0.45, '#e2d3b4'], [0.8, '#b79c74'], [1, '#7d6446']]); g.fill();
    dots(g, 60, -0.34, -0.55, 0.34, -0.34, 0.005, 'rgba(110,80,50,.35)', 9);
    g.beginPath(); g.moveTo(-0.41, -0.31); g.bezierCurveTo(-0.405, -0.37, 0.405, -0.37, 0.41, -0.31); g.lineWidth = 0.03; g.strokeStyle = '#6d4426'; g.stroke();
    oval(g, 0, -0.565, 0.075, 0.032, '#5b371f'); oval(g, 0, -0.585, 0.06, 0.024, '#9a6a44');
    oval(g, 0.2, -0.47, 0.016, 0.01, '#3a2414');
    shine(g, -0.16, -0.52, 0.13, 0.045, 0.75, -0.25); shine(g, -0.27, -0.16, 0.035, 0.09, 0.4); shine(g, 0.3, -0.42, 0.04, 0.02, 0.4);
  } },
  soy: { w: 0.42, h: 0.8, draw(g) {
    rr(g, -0.16, -0.56, 0.32, 0.56, [0.09, 0.09, 0.07, 0.07]); g.fillStyle = 'rgba(214,232,238,.42)'; g.fill();
    g.lineWidth = 0.012; g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke();
    rr(g, -0.142, -0.4, 0.284, 0.385, [0.03, 0.03, 0.065, 0.065]);
    g.fillStyle = lin(g, -0.14, 0, 0.14, 0, [[0, '#9c3e10'], [0.25, '#5c1a06'], [0.7, '#2b0802'], [1, '#541806']]); g.fill();
    oval(g, 0, -0.4, 0.142, 0.022, '#7c2c0c');
    rr(g, -0.085, -0.63, 0.17, 0.09, 0.02); g.fillStyle = lin(g, -0.085, 0, 0.085, 0, [[0, '#9e1a12'], [0.35, '#e8463a'], [1, '#8a120c']]); g.fill();
    g.beginPath(); g.moveTo(-0.1, -0.62); g.quadraticCurveTo(-0.1, -0.77, 0, -0.78); g.quadraticCurveTo(0.1, -0.77, 0.1, -0.62); g.closePath();
    g.fillStyle = lin(g, -0.1, 0, 0.1, 0, [[0, '#a3170f'], [0.35, '#f0574a'], [1, '#8d120b']]); g.fill();
    g.beginPath(); g.moveTo(0.03, -0.73); g.lineTo(0.17, -0.79); g.lineTo(0.175, -0.765); g.lineTo(0.05, -0.705); g.closePath(); g.fillStyle = '#c92d22'; g.fill();
    shine(g, -0.035, -0.74, 0.03, 0.025, 0.85);
    g.fillStyle = 'rgba(255,255,255,.7)'; rr(g, -0.115, -0.5, 0.028, 0.42, 0.014); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; rr(g, 0.085, -0.46, 0.014, 0.3, 0.007); g.fill();
    shine(g, -0.07, -0.2, 0.05, 0.12, 0.25);
  } },
  knife: { w: 0.62, h: 1.5, draw(g) {
    g.beginPath();
    g.moveTo(-0.24, -1.0); g.lineTo(0.22, -1.0); g.lineTo(0.22, -0.22);
    g.quadraticCurveTo(0.2, -0.02, 0.02, 0); g.quadraticCurveTo(-0.22, -0.08, -0.24, -0.42); g.closePath();
    g.fillStyle = steel(g, -0.24, 0.22); g.fill();
    // 刃先の明るい帯と刃文
    g.save(); g.clip();
    g.beginPath(); g.moveTo(-0.3, -1); g.lineTo(-0.15, -1);
    for (let y = -0.95; y <= 0.05; y += 0.1) g.quadraticCurveTo(-0.11 + (Math.round(y * 10) % 2 ? 0.03 : -0.02), y - 0.05, -0.13 + (y + 1) * 0.12, y);
    g.lineTo(-0.3, 0.1); g.closePath(); g.fillStyle = 'rgba(244,249,252,.75)'; g.fill();
    g.beginPath(); g.moveTo(-0.3, -0.75); g.lineTo(0.3, -0.98); g.lineTo(0.3, -0.86); g.lineTo(-0.3, -0.6); g.closePath(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
    g.restore();
    g.fillStyle = '#4b555d'; rr(g, 0.185, -1.0, 0.035, 0.78, 0.01); g.fill();
    oval(g, 0.06, -0.86, 0.035, 0.022, 'rgba(60,70,80,.45)');
    rr(g, -0.1, -1.08, 0.2, 0.09, 0.02); g.fillStyle = lin(g, -0.1, 0, 0.1, 0, [[0, '#0d0b0a'], [0.4, '#4a4440'], [1, '#0d0b0a']]); g.fill();
    rr(g, -0.085, -1.48, 0.17, 0.41, 0.05); g.fillStyle = lin(g, -0.085, 0, 0.085, 0, [[0, '#8a6232'], [0.35, '#e0bf86'], [0.6, '#c49a5c'], [1, '#7a5428']]); g.fill();
    g.strokeStyle = 'rgba(120,80,40,.35)'; g.lineWidth = 0.006;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-0.05 + i * 0.03, -1.46); g.bezierCurveTo(-0.07 + i * 0.03, -1.3, -0.03 + i * 0.03, -1.2, -0.05 + i * 0.03, -1.1); g.stroke(); }
    shine(g, -0.03, -1.3, 0.025, 0.14, 0.5);
  } },
  saibashi: { w: 1.1, h: 0.34, draw(g) {
    for (const s of [-1, 1]) {
      rr(g, s * 0.4 - 0.07, -0.17, 0.14, 0.17, 0.05); g.fillStyle = lin(g, 0, -0.17, 0, 0, [[0, '#5b7fc0'], [0.5, '#2f4f93'], [1, '#1f3466']]); g.fill();
      shine(g, s * 0.4 - 0.02, -0.14, 0.035, 0.015, 0.7);
    }
    stick(g, -0.52, -0.205, 0.5, -0.235, 0.05, '#e6c98a', '#9c7337', 0.55);
    stick(g, -0.5, -0.255, 0.52, -0.27, 0.05, '#ecd298', '#a27a3c', 0.55);
    for (const [y, c] of [[-0.205, '#d23a2c'], [-0.255, '#2f8f4c']]) { g.fillStyle = c; rr(g, 0.42, y - 0.03, 0.025, 0.06, 0.01); g.fill(); }
    g.strokeStyle = '#d23a2c'; g.lineWidth = 0.008; g.beginPath(); g.moveTo(0.5, -0.21); g.bezierCurveTo(0.6, -0.17, 0.6, -0.27, 0.52, -0.27); g.stroke();
  } },
  otama: { w: 0.66, h: 2.15, draw(g) {
    stick(g, 0, -2.08, 0.03, -0.74, 0.05, '#e6ecef', '#6f7a83', 0.8);
    g.lineWidth = 0.035; g.strokeStyle = '#8b969e'; g.beginPath(); g.arc(0, -2.08, 0.05, Math.PI * 0.2, Math.PI * 1.6); g.stroke();
    g.beginPath(); g.ellipse(0, -0.74, 0.29, 0.29, 0, 0, Math.PI); g.closePath();
    g.fillStyle = steel(g, -0.29, 0.29); g.fill();
    oval(g, 0, -0.74, 0.29, 0.065, lin(g, 0, -0.8, 0, -0.68, [[0, '#4a535a'], [1, '#9aa6ae']]));
    oval(g, 0, -0.735, 0.255, 0.045, lin(g, -0.25, 0, 0.25, 0, [[0, '#3c444a'], [0.5, '#6d7880'], [1, '#2e353a']]));
    shine(g, -0.13, -0.58, 0.05, 0.1, 0.9, 0.3); shine(g, 0.17, -0.55, 0.02, 0.05, 0.5);
  } },
  chawan: { w: 0.82, h: 0.66, draw(g) {
    oval(g, 0, -0.42, 0.37, 0.07, '#f4f6fa');
    // ご飯の山
    g.beginPath(); g.moveTo(-0.34, -0.42); g.bezierCurveTo(-0.3, -0.7, 0.3, -0.7, 0.34, -0.42); g.closePath();
    g.fillStyle = rad(g, -0.08, -0.6, 0.02, 0, -0.45, 0.4, [[0, '#ffffff'], [0.7, '#f1efe8'], [1, '#d8d4c8']]); g.fill();
    for (let i = 0; i < 70; i++) {
      const a = hash(i * 3.7) * Math.PI;
      const r = 0.31 * Math.sqrt(hash(i * 1.9));
      const x = Math.cos(a) * r; const y = -0.43 - Math.sin(a) * r * 0.75;
      oval(g, x, y, 0.022, 0.011, i % 3 ? 'rgba(255,255,255,.95)' : 'rgba(200,196,184,.6)', hash(i) * 3);
    }
    shine(g, -0.1, -0.6, 0.08, 0.03, 0.8);
    g.beginPath(); g.moveTo(-0.37, -0.42); g.bezierCurveTo(-0.36, -0.12, -0.2, -0.05, -0.14, -0.05); g.lineTo(0.14, -0.05); g.bezierCurveTo(0.2, -0.05, 0.36, -0.12, 0.37, -0.42); g.closePath();
    g.fillStyle = lin(g, -0.37, 0, 0.37, 0, [[0, '#b9c0cc'], [0.3, '#ffffff'], [0.6, '#eef1f6'], [1, '#a7afbd']]); g.fill();
    g.save(); g.clip();
    g.strokeStyle = '#27489a'; g.lineWidth = 0.014;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let x = -0.4; x <= 0.4; x += 0.08) { const y = -0.3 + k * 0.1; g.moveTo(x, y); g.quadraticCurveTo(x + 0.04, y - 0.05, x + 0.08, y); }
      g.stroke();
    }
    dots(g, 10, -0.3, -0.12, 0.3, -0.1, 0.01, '#27489a', 5);
    g.restore();
    rr(g, -0.14, -0.06, 0.28, 0.06, 0.015); g.fillStyle = '#c9ced8'; g.fill();
    shine(g, -0.22, -0.28, 0.04, 0.09, 0.8, 0.2);
  } },
  kyusu: { w: 1.0, h: 0.72, draw(g) {
    stick(g, -0.22, -0.32, -0.48, -0.4, 0.075, '#b8572a', '#6e2a10', 0.35);
    g.beginPath(); g.moveTo(0.2, -0.3); g.bezierCurveTo(0.32, -0.32, 0.36, -0.42, 0.43, -0.5); g.lineTo(0.46, -0.48); g.bezierCurveTo(0.42, -0.38, 0.36, -0.22, 0.22, -0.2); g.closePath();
    g.fillStyle = lin(g, 0.2, -0.5, 0.46, -0.2, [[0, '#c4683a'], [1, '#7c3112']]); g.fill();
    oval(g, 0, -0.29, 0.29, 0.27, rad(g, -0.1, -0.4, 0.02, 0, -0.29, 0.32, [[0, '#e48b56'], [0.5, '#b8572a'], [1, '#6a250d']]));
    oval(g, 0, -0.53, 0.17, 0.045, '#5c200b');
    g.beginPath(); g.ellipse(0, -0.535, 0.15, 0.08, 0, Math.PI, TAU); g.fillStyle = rad(g, -0.04, -0.6, 0.01, 0, -0.55, 0.16, [[0, '#e48b56'], [1, '#8a3414']]); g.fill();
    oval(g, 0, -0.62, 0.035, 0.03, '#a8461c');
    g.strokeStyle = 'rgba(80,25,8,.45)'; g.lineWidth = 0.008;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(0, -0.29, 0.29, 0.06 + i * 0.035, 0, 0.1, Math.PI - 0.1); g.stroke(); }
    shine(g, -0.1, -0.42, 0.08, 0.05, 0.55, -0.4); shine(g, 0.15, -0.15, 0.03, 0.06, 0.25);
  } },
  waribashi: { w: 1.1, h: 0.3, draw(g) {
    rr(g, -0.12, -0.1, 0.24, 0.1, 0.03); g.fillStyle = lin(g, 0, -0.1, 0, 0, [[0, '#f5f0e2'], [1, '#c8c0aa']]); g.fill();
    stick(g, -0.52, -0.15, 0.52, -0.16, 0.045, '#f3e3bd', '#b89a62', 0.6);
    stick(g, -0.52, -0.2, 0.52, -0.205, 0.045, '#f6e8c6', '#bc9e66', 0.6);
    rr(g, -0.5, -0.24, 0.42, 0.13, 0.015); g.fillStyle = lin(g, 0, -0.24, 0, -0.11, [[0, '#fbf6ec'], [1, '#e2d9c6']]); g.fill();
    g.fillStyle = '#c8281e'; rr(g, -0.5, -0.24, 0.09, 0.13, [0.015, 0, 0, 0.015]); g.fill();
    mtext(g, 'おてもと', -0.25, -0.175, 0.07, '#b0201a', { weight: 700 });
  } },
  shamoji: { w: 0.5, h: 2.15, draw(g) {
    stick(g, 0, -2.08, 0, -0.85, 0.07, '#f2e3c2', '#b39462', 0.5);
    g.beginPath(); g.ellipse(0, -0.66, 0.2, 0.24, 0, 0, TAU);
    g.fillStyle = rad(g, -0.06, -0.72, 0.02, 0, -0.66, 0.26, [[0, '#fbf0d6'], [0.7, '#e7d1a4'], [1, '#bf9e66']]); g.fill();
    g.strokeStyle = 'rgba(160,120,70,.3)'; g.lineWidth = 0.006;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 0.05, -0.88); g.quadraticCurveTo(i * 0.06, -0.66, i * 0.05, -0.44); g.stroke(); }
    for (let i = 0; i < 7; i++) oval(g, -0.08 + hash(i * 5.1) * 0.16, -0.5 - hash(i * 2.3) * 0.15, 0.02, 0.011, '#ffffff', hash(i) * 3);
    oval(g, 0, -2.08, 0.045, 0.045, '#6b4a2a'); oval(g, 0, -2.08, 0.02, 0.02, '#f5ead2');
    shine(g, -0.08, -0.74, 0.05, 0.09, 0.55);
  } },
  cat: { w: 1.0, h: 0.95, draw(g) {
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(0.22, -0.06); g.bezierCurveTo(0.55, -0.05, 0.55, -0.35, 0.42, -0.5); g.lineWidth = 0.08; g.strokeStyle = '#2b2622'; g.stroke();
    g.beginPath(); g.moveTo(-0.3, 0); g.bezierCurveTo(-0.34, -0.35, -0.22, -0.55, 0, -0.55); g.bezierCurveTo(0.22, -0.55, 0.34, -0.35, 0.3, 0); g.closePath();
    g.fillStyle = rad(g, -0.05, -0.35, 0.03, 0, -0.25, 0.4, [[0, '#ffffff'], [0.7, '#f1ece4'], [1, '#c9c0b4']]); g.fill();
    g.save(); g.clip();
    oval(g, 0.2, -0.32, 0.17, 0.2, '#e08a3c'); oval(g, -0.24, -0.12, 0.12, 0.16, '#2b2622');
    g.restore();
    for (const s of [-1, 1]) { oval(g, s * 0.1, -0.03, 0.08, 0.045, '#faf6ef'); g.strokeStyle = 'rgba(120,100,90,.4)'; g.lineWidth = 0.006; for (const k of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.1 + k * 0.025, -0.05); g.lineTo(s * 0.1 + k * 0.025, -0.0); g.stroke(); } }
    // 頭
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * 0.22, -0.67); g.lineTo(s * 0.25, -0.92); g.lineTo(s * 0.06, -0.8); g.closePath(); g.fillStyle = s < 0 ? '#2b2622' : '#e08a3c'; g.fill();
      g.beginPath(); g.moveTo(s * 0.2, -0.7); g.lineTo(s * 0.225, -0.86); g.lineTo(s * 0.1, -0.79); g.closePath(); g.fillStyle = '#f2a7a0'; g.fill();
    }
    oval(g, 0, -0.66, 0.27, 0.22, rad(g, -0.06, -0.74, 0.02, 0, -0.66, 0.3, [[0, '#ffffff'], [0.75, '#f3eee6'], [1, '#cfc6ba']]));
    g.save(); g.beginPath(); g.ellipse(0, -0.66, 0.27, 0.22, 0, 0, TAU); g.clip();
    oval(g, -0.2, -0.78, 0.14, 0.12, '#2b2622'); oval(g, 0.22, -0.8, 0.12, 0.11, '#e08a3c');
    g.restore();
    for (const s of [-1, 1]) {
      oval(g, s * 0.1, -0.68, 0.065, 0.06, rad(g, s * 0.1, -0.7, 0.005, s * 0.1, -0.68, 0.07, [[0, '#f8ffb0'], [0.6, '#b8d84a'], [1, '#6f8e1c']]));
      oval(g, s * 0.1, -0.68, 0.016, 0.05, '#141210');
      oval(g, s * 0.1 - 0.02, -0.705, 0.014, 0.012, '#ffffff');
    }
    g.beginPath(); g.moveTo(-0.025, -0.6); g.lineTo(0.025, -0.6); g.lineTo(0, -0.575); g.closePath(); g.fillStyle = '#e8737a'; g.fill();
    g.strokeStyle = '#5a4a44'; g.lineWidth = 0.01;
    g.beginPath(); g.moveTo(0, -0.575); g.quadraticCurveTo(-0.03, -0.54, -0.06, -0.56); g.moveTo(0, -0.575); g.quadraticCurveTo(0.03, -0.54, 0.06, -0.56); g.stroke();
    oval(g, 0.035, -0.535, 0.022, 0.018, '#f07d8c');
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 0.005;
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(s * 0.12, -0.58 + k * 0.015); g.lineTo(s * 0.32, -0.6 + k * 0.04); g.stroke(); }
    shine(g, -0.1, -0.8, 0.07, 0.03, 0.4);
  } },
  planter: { w: 0.85, h: 1.05, draw(g) {
    const leaf = (x, y, a, l, c) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.45, -l * 0.32, l, 0); g.quadraticCurveTo(l * 0.45, l * 0.3, 0, 0);
      g.fillStyle = lin(g, 0, -l * 0.3, 0, l * 0.3, [[0, c[0]], [1, c[1]]]); g.fill();
      g.strokeStyle = 'rgba(230,255,200,.5)'; g.lineWidth = 0.008; g.beginPath(); g.moveTo(0, 0); g.lineTo(l * 0.9, 0); g.stroke();
      g.restore();
    };
    for (let i = 0; i < 9; i++) leaf(0, -0.5, -Math.PI / 2 + (i - 4) * 0.33, 0.28 + hash(i) * 0.14, i % 2 ? ['#7cc152', '#2f7a2c'] : ['#9bd46a', '#3f8a33']);
    for (const [x, y] of [[-0.13, -0.86], [0.12, -0.9], [0.02, -0.97]]) {
      for (let k = 0; k < 5; k++) oval(g, x + Math.cos(k * 1.26) * 0.035, y + Math.sin(k * 1.26) * 0.035, 0.03, 0.03, '#e8434e');
      oval(g, x, y, 0.018, 0.018, '#ffd34e');
    }
    g.beginPath(); g.moveTo(-0.3, -0.5); g.lineTo(0.3, -0.5); g.lineTo(0.22, 0); g.lineTo(-0.22, 0); g.closePath();
    g.fillStyle = lin(g, -0.3, 0, 0.3, 0, [[0, '#8f3f1c'], [0.35, '#e0875a'], [0.6, '#c9693c'], [1, '#7a3214']]); g.fill();
    rr(g, -0.33, -0.56, 0.66, 0.1, 0.02); g.fillStyle = lin(g, -0.33, 0, 0.33, 0, [[0, '#9a4520'], [0.35, '#eb9466'], [1, '#863817']]); g.fill();
    oval(g, 0, -0.56, 0.3, 0.035, '#3b2416');
    shine(g, -0.15, -0.3, 0.04, 0.14, 0.4);
  } },
  hose: { w: 1.15, h: 0.26, draw(g) {
    const path = () => { g.beginPath(); g.moveTo(-0.55, -0.08); g.bezierCurveTo(-0.35, -0.22, -0.2, 0.02, 0, -0.1); g.bezierCurveTo(0.2, -0.22, 0.32, 0.0, 0.5, -0.12); };
    g.lineCap = 'round';
    path(); g.lineWidth = 0.1; g.strokeStyle = '#1d5a22'; g.stroke();
    path(); g.lineWidth = 0.07; g.strokeStyle = '#3fae3c'; g.stroke();
    g.save(); g.translate(0, -0.022); path(); g.lineWidth = 0.018; g.strokeStyle = 'rgba(220,255,200,.75)'; g.stroke(); g.restore();
    rr(g, 0.48, -0.17, 0.1, 0.1, 0.02); g.fillStyle = lin(g, 0, -0.17, 0, -0.07, [[0, '#ffe08a'], [0.5, '#d4a22c'], [1, '#8a6410']]); g.fill();
    oval(g, 0.04, -0.03, 0.06, 0.02, 'rgba(120,190,255,.5)');
  } },
  'laundry:0': { w: 0.8, h: 1.3, draw(g) {
    g.save(); g.beginPath(); g.moveTo(-0.33, -1.2); g.lineTo(0.33, -1.2); g.lineTo(0.34, -0.47); g.quadraticCurveTo(0, -0.42, -0.34, -0.47); g.closePath();
    g.fillStyle = lin(g, -0.34, 0, 0.34, 0, [[0, '#d9dee6'], [0.35, '#ffffff'], [1, '#c5ccd6']]); g.fill(); g.clip();
    for (const y of [-0.62, -0.58, -1.08]) { g.fillStyle = 'rgba(60,110,200,.75)'; g.fillRect(-0.4, y, 0.8, 0.03); }
    g.strokeStyle = 'rgba(150,160,175,.35)'; g.lineWidth = 0.008;
    for (let x = -0.3; x <= 0.3; x += 0.07) { g.beginPath(); g.moveTo(x, -1.2); g.lineTo(x + 0.01, -0.45); g.stroke(); }
    g.restore();
    for (const x of [-0.22, 0.22]) { rr(g, x - 0.02, -1.27, 0.04, 0.12, 0.01); g.fillStyle = '#d7b47a'; g.fill(); }
  } },
  'laundry:1': { w: 0.8, h: 1.3, draw(g) {
    g.beginPath(); g.moveTo(-0.16, -1.2); g.lineTo(-0.36, -1.12); g.lineTo(-0.3, -0.95); g.lineTo(-0.22, -0.98); g.lineTo(-0.22, -0.47); g.lineTo(0.22, -0.47); g.lineTo(0.22, -0.98); g.lineTo(0.3, -0.95); g.lineTo(0.36, -1.12); g.lineTo(0.16, -1.2); g.quadraticCurveTo(0, -1.12, -0.16, -1.2); g.closePath();
    g.fillStyle = lin(g, -0.3, 0, 0.3, 0, [[0, '#d99a14'], [0.4, '#ffd34a'], [1, '#c9870e']]); g.fill();
    mtext(g, '豆', 0, -0.78, 0.17, 'rgba(120,70,0,.75)', { weight: 900 });
    for (const x of [-0.14, 0.14]) { rr(g, x - 0.02, -1.27, 0.04, 0.12, 0.01); g.fillStyle = '#d7b47a'; g.fill(); }
  } },
  box: { w: 0.9, h: 0.8, draw(g) {
    g.beginPath(); g.moveTo(-0.39, -0.58); g.lineTo(0.39, -0.58); g.lineTo(0.33, -0.74); g.lineTo(-0.33, -0.74); g.closePath();
    g.fillStyle = lin(g, 0, -0.74, 0, -0.58, [[0, '#e6c08a'], [1, '#d3a669']]); g.fill();
    g.fillStyle = 'rgba(200,170,110,.9)'; g.beginPath(); g.moveTo(-0.06, -0.58); g.lineTo(0.06, -0.58); g.lineTo(0.05, -0.74); g.lineTo(-0.05, -0.74); g.closePath(); g.fill();
    rr(g, -0.39, -0.58, 0.78, 0.58, 0.012); g.fillStyle = lin(g, -0.39, 0, 0.39, 0, [[0, '#a8783e'], [0.4, '#cf9f62'], [1, '#9a6c34']]); g.fill();
    g.fillStyle = 'rgba(214,186,128,.95)'; g.fillRect(-0.06, -0.58, 0.12, 0.2);
    shine(g, -0.02, -0.66, 0.07, 0.02, 0.5);
    rr(g, -0.3, -0.33, 0.6, 0.2, 0.02); g.lineWidth = 0.012; g.strokeStyle = '#c0281c'; g.stroke();
    mtext(g, 'ワレモノ', 0, -0.23, 0.11, '#c0281c', { weight: 900 });
    mtext(g, 'とうふ在中', 0, -0.44, 0.065, 'rgba(70,40,15,.8)', { weight: 800 });
  } },
  sign: { w: 0.9, h: 1.1, draw(g) {
    for (const s of [-1, 1]) stick(g, s * 0.3, -1.0, s * 0.36, 0, 0.05, '#a87a48', '#5e3e1e', 0.25);
    rr(g, -0.33, -1.02, 0.66, 0.78, 0.03); g.fillStyle = '#7a5428'; g.fill();
    rr(g, -0.29, -0.98, 0.58, 0.7, 0.015); g.fillStyle = lin(g, 0, -0.98, 0, -0.28, [[0, '#2f3b34'], [1, '#1b231e']]); g.fill();
    mtext(g, '本日の', 0, -0.88, 0.075, '#f3f1e6', { weight: 700 });
    mtext(g, 'とうふ', 0, -0.72, 0.14, '#fff6c0', { weight: 900, rot: -0.04 });
    mtext(g, '特売', 0, -0.52, 0.13, '#ff9a8a', { weight: 900, rot: 0.03 });
    mtext(g, '1丁 98円', 0, -0.36, 0.06, '#f3f1e6', { weight: 700 });
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(-0.29, -0.98, 0.58, 0.25);
  } },
  broom: { w: 1.2, h: 0.3, draw(g) {
    stick(g, -0.55, -0.12, 0.25, -0.16, 0.045, '#d8c07a', '#8c7232', 0.5);
    g.strokeStyle = '#a78a46'; g.lineWidth = 0.008;
    for (let i = 0; i < 28; i++) { const a = (i / 27 - 0.5) * 0.9; g.beginPath(); g.moveTo(0.22, -0.16); g.lineTo(0.22 + Math.cos(a) * (0.32 + hash(i) * 0.06), -0.16 + Math.sin(a) * 0.25); g.stroke(); }
    g.strokeStyle = '#6b5222'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(0.25, -0.22); g.lineTo(0.25, -0.1); g.stroke();
  } },
  negi: { w: 0.44, h: 0.44, draw(g) {
    oval(g, 0, -0.22, 0.2, 0.2, rad(g, 0, -0.22, 0.1, 0, -0.22, 0.22, [[0, 'rgba(210,255,140,.5)'], [1, 'rgba(210,255,140,0)']]));
    oval(g, 0, -0.22, 0.15, 0.15, lin(g, -0.15, -0.37, 0.15, -0.07, [[0, '#7fd34e'], [0.5, '#2f9a35'], [1, '#1d6e25']]));
    oval(g, 0, -0.22, 0.115, 0.115, '#dff5b0');
    oval(g, 0, -0.22, 0.09, 0.09, '#a9dc6c');
    oval(g, 0.01, -0.215, 0.06, 0.06, 'rgba(250,255,235,.92)');
    shine(g, -0.06, -0.3, 0.05, 0.025, 0.95, -0.5);
  } },
  ice: { w: 0.55, h: 0.55, draw(g) {
    oval(g, 0, -0.27, 0.27, 0.27, rad(g, 0, -0.27, 0.05, 0, -0.27, 0.28, [[0, 'rgba(170,230,255,.6)'], [1, 'rgba(170,230,255,0)']]));
    g.beginPath(); g.moveTo(-0.16, -0.38); g.lineTo(0.04, -0.46); g.lineTo(0.2, -0.36); g.lineTo(0.2, -0.13); g.lineTo(0.0, -0.06); g.lineTo(-0.16, -0.15); g.closePath();
    g.fillStyle = lin(g, -0.16, -0.46, 0.2, -0.06, [[0, 'rgba(235,250,255,.95)'], [0.5, 'rgba(150,215,245,.85)'], [1, 'rgba(90,170,220,.9)']]); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 0.012; g.stroke();
    g.beginPath(); g.moveTo(-0.16, -0.38); g.lineTo(0.0, -0.3); g.lineTo(0.2, -0.36); g.moveTo(0.0, -0.3); g.lineTo(0.0, -0.06); g.strokeStyle = 'rgba(255,255,255,.7)'; g.stroke();
    shine(g, -0.07, -0.36, 0.05, 0.02, 1, -0.4);
  } },
  katsuo: { w: 0.6, h: 0.5, draw(g) {
    oval(g, 0, -0.25, 0.28, 0.24, rad(g, 0, -0.25, 0.05, 0, -0.25, 0.28, [[0, 'rgba(255,210,180,.6)'], [1, 'rgba(255,210,180,0)']]));
    const flakes = [[-0.1, -0.16, -0.5], [0.09, -0.15, 0.4], [0, -0.24, 0.1], [-0.11, -0.3, -0.9], [0.1, -0.31, 0.9], [0, -0.36, -0.2]];
    for (const [i, [x, y, a]] of flakes.entries()) {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(-0.1, 0.02);
      g.bezierCurveTo(-0.08, -0.08, 0.06, -0.09, 0.1, -0.01);
      g.bezierCurveTo(0.05, -0.04, -0.04, -0.03, -0.06, 0.03);
      g.closePath();
      g.fillStyle = lin(g, -0.1, -0.08, 0.1, 0.03, [[0, i % 2 ? 'rgba(252,226,212,.95)' : 'rgba(246,212,192,.95)'], [0.6, 'rgba(232,170,140,.9)'], [1, 'rgba(190,110,80,.9)']]); g.fill();
      g.strokeStyle = 'rgba(120,50,30,.45)'; g.lineWidth = 0.006; g.stroke();
      g.strokeStyle = 'rgba(255,240,230,.85)'; g.lineWidth = 0.008;
      g.beginPath(); g.moveTo(-0.07, -0.01); g.bezierCurveTo(-0.05, -0.06, 0.04, -0.07, 0.07, -0.03); g.stroke();
      g.restore();
    }
  } },
  // ---- 道ばたの飾り ----
  bottles: { w: 0.8, h: 1.0, draw(g) {
    const bottle = (x, h, body, cap, label) => {
      rr(g, x - 0.07, -h, 0.14, h, [0.04, 0.04, 0.02, 0.02]); g.fillStyle = body; g.fill();
      rr(g, x - 0.035, -h - 0.12, 0.07, 0.13, 0.01); g.fillStyle = body; g.fill();
      rr(g, x - 0.04, -h - 0.17, 0.08, 0.06, 0.012); g.fillStyle = cap; g.fill();
      rr(g, x - 0.065, -h * 0.65, 0.13, h * 0.32, 0.01); g.fillStyle = label; g.fill();
      shine(g, x - 0.035, -h * 0.55, 0.015, h * 0.3, 0.6);
    };
    bottle(-0.2, 0.72, lin(g, -0.27, 0, -0.13, 0, [[0, '#2a0a02'], [0.4, '#6a2208'], [1, '#1a0601']]), '#d8261c', '#f4ead2');
    bottle(0.0, 0.62, lin(g, -0.07, 0, 0.07, 0, [[0, '#b8862a'], [0.4, '#f2c766'], [1, '#9a6c1c']]), '#e9e2c8', '#e43a2c');
    bottle(0.2, 0.55, lin(g, 0.13, 0, 0.27, 0, [[0, '#c6d6c8'], [0.4, '#f6fbf6'], [1, '#a8baa9']]), '#2a6a3a', '#2a6a3a');
  } },
  cooker: { w: 0.8, h: 0.75, draw(g) {
    rr(g, -0.33, -0.52, 0.66, 0.52, 0.12); g.fillStyle = lin(g, -0.33, 0, 0.33, 0, [[0, '#bcc3c8'], [0.35, '#ffffff'], [1, '#9aa3aa']]); g.fill();
    g.beginPath(); g.ellipse(0, -0.52, 0.31, 0.16, 0, Math.PI, TAU); g.fillStyle = lin(g, 0, -0.68, 0, -0.52, [[0, '#ffffff'], [1, '#cfd5da']]); g.fill();
    rr(g, -0.1, -0.68, 0.2, 0.05, 0.02); g.fillStyle = '#7e868c'; g.fill();
    rr(g, -0.14, -0.36, 0.28, 0.13, 0.03); g.fillStyle = '#2a3036'; g.fill();
    oval(g, -0.07, -0.295, 0.018, 0.018, '#ff6a3a'); mtext(g, '保温', 0.04, -0.295, 0.05, '#9ee8ff', { weight: 700 });
    shine(g, -0.18, -0.42, 0.05, 0.12, 0.6);
  } },
  crock: { w: 0.6, h: 1.05, draw(g) {
    stick(g, -0.06, -0.4, -0.16, -0.98, 0.04, '#d8c08a', '#8d7036', 0.5);
    stick(g, 0.04, -0.4, 0.12, -0.92, 0.035, '#e6ecef', '#6f7a83', 0.8);
    oval(g, 0.13, -0.95, 0.07, 0.05, '#aab5bd');
    stick(g, 0.0, -0.4, 0.0, -1.0, 0.03, '#f2e3c2', '#b39462', 0.5);
    rr(g, -0.2, -0.48, 0.4, 0.48, 0.07); g.fillStyle = lin(g, -0.2, 0, 0.2, 0, [[0, '#3e5c74'], [0.4, '#7aa6c4'], [1, '#2c4256']]); g.fill();
    shine(g, -0.09, -0.3, 0.03, 0.12, 0.5);
  } },
  zabuton: { w: 1.2, h: 0.3, draw(g) {
    g.beginPath(); g.moveTo(-0.55, -0.1); g.quadraticCurveTo(0, -0.32, 0.55, -0.1); g.quadraticCurveTo(0.58, 0, 0.5, 0); g.lineTo(-0.5, 0); g.quadraticCurveTo(-0.58, 0, -0.55, -0.1); g.closePath();
    g.fillStyle = lin(g, 0, -0.25, 0, 0, [[0, '#d0514a'], [1, '#7c1f1c']]); g.fill();
    g.strokeStyle = 'rgba(255,220,180,.5)'; g.lineWidth = 0.01; g.stroke();
    oval(g, 0, -0.17, 0.04, 0.02, '#f5d36a');
  } },
  bush: { w: 1.2, h: 0.9, draw(g) {
    const cs = [[-0.3, -0.35, 0.3], [0.25, -0.38, 0.3], [0, -0.55, 0.32], [-0.1, -0.25, 0.3], [0.2, -0.22, 0.28]];
    for (const [x, y, r] of cs) oval(g, x, y, r, r * 0.9, rad(g, x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r, [[0, '#9fd468'], [0.6, '#4f9a3c'], [1, '#2a5f26']]));
    dots(g, 14, -0.45, -0.75, 0.45, -0.2, 0.025, '#f2a0c0', 7);
  } },
  tourou: { w: 0.7, h: 1.35, draw(g) {
    const stone = (x0, x1) => lin(g, x0, 0, x1, 0, [[0, '#7b7a72'], [0.4, '#c2c0b4'], [1, '#6a6962']]);
    rr(g, -0.24, -0.12, 0.48, 0.12, 0.02); g.fillStyle = stone(-0.24, 0.24); g.fill();
    rr(g, -0.07, -0.6, 0.14, 0.5, 0.02); g.fillStyle = stone(-0.07, 0.07); g.fill();
    rr(g, -0.2, -0.95, 0.4, 0.36, 0.02); g.fillStyle = stone(-0.2, 0.2); g.fill();
    rr(g, -0.1, -0.88, 0.2, 0.2, 0.01); g.fillStyle = 'rgba(255,190,90,.9)'; g.fill();
    g.beginPath(); g.moveTo(-0.33, -0.95); g.lineTo(0.33, -0.95); g.lineTo(0.1, -1.18); g.lineTo(-0.1, -1.18); g.closePath(); g.fillStyle = stone(-0.33, 0.33); g.fill();
    oval(g, 0, -1.22, 0.06, 0.06, '#8d8b82');
    dots(g, 12, -0.2, -1.1, 0.2, -0.1, 0.02, 'rgba(90,130,60,.45)', 11);
  } },
  sunflower: { w: 0.7, h: 1.6, draw(g) {
    stick(g, 0, 0, 0.02, -1.25, 0.04, '#5aa83a', '#2f6a22', 0.3);
    for (const s of [-1, 1]) { g.save(); g.translate(0.01, -0.6 - s * 0.15); g.rotate(s * 0.6 - Math.PI / 2 + Math.PI / 2 * s); g.beginPath(); g.ellipse(0.12 * s, 0, 0.14, 0.06, 0, 0, TAU); g.fillStyle = '#4f9a32'; g.fill(); g.restore(); }
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; oval(g, 0.02 + Math.cos(a) * 0.15, -1.3 + Math.sin(a) * 0.15, 0.09, 0.035, k % 2 ? '#ffc21a' : '#ffdb4a', a); }
    oval(g, 0.02, -1.3, 0.1, 0.1, rad(g, 0, -1.33, 0.01, 0.02, -1.3, 0.1, [[0, '#8a5a24'], [1, '#3a2410']]));
  } },
  chochin: { w: 0.6, h: 2.3, draw(g) {
    stick(g, 0, 0, 0, -2.1, 0.06, '#6a4a2a', '#2e1f12', 0.2);
    stick(g, 0, -2.08, 0.24, -2.08, 0.04, '#6a4a2a', '#2e1f12', 0.2);
    oval(g, 0.24, -1.72, 0.3, 0.3, rad(g, 0.24, -1.72, 0.05, 0.24, -1.72, 0.32, [[0, 'rgba(255,180,90,.55)'], [1, 'rgba(255,120,60,0)']]));
    g.beginPath(); g.ellipse(0.24, -1.72, 0.17, 0.25, 0, 0, TAU);
    g.fillStyle = rad(g, 0.2, -1.78, 0.02, 0.24, -1.72, 0.26, [[0, '#ffb07a'], [0.5, '#e8422e'], [1, '#9a1a10']]); g.fill();
    g.strokeStyle = 'rgba(80,10,5,.35)'; g.lineWidth = 0.008;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(0.24, -1.72 + i * 0.06, 0.17 * Math.cos(i * 0.32), 0.012, 0, 0, TAU); g.stroke(); }
    rr(g, 0.15, -1.99, 0.18, 0.05, 0.01); g.fillStyle = '#1b1410'; g.fill();
    rr(g, 0.15, -1.5, 0.18, 0.05, 0.01); g.fill();
    mtext(g, 'おでん', 0.24, -1.72, 0.07, '#1b1410', { weight: 900 });
  } },
  vending: { w: 0.8, h: 1.55, draw(g) {
    oval(g, 0, -0.75, 0.5, 0.8, rad(g, 0, -0.75, 0.1, 0, -0.75, 0.8, [[0, 'rgba(200,235,255,.35)'], [1, 'rgba(200,235,255,0)']]));
    rr(g, -0.33, -1.5, 0.66, 1.5, 0.04); g.fillStyle = lin(g, -0.33, 0, 0.33, 0, [[0, '#b8c2cc'], [0.4, '#eef3f7'], [1, '#98a3ad']]); g.fill();
    rr(g, -0.28, -1.42, 0.56, 0.62, 0.02); g.fillStyle = lin(g, 0, -1.42, 0, -0.8, [[0, '#f4fbff'], [1, '#bfe3f7']]); g.fill();
    const cols = ['#e8433a', '#3a8ae8', '#f2c230', '#3ab36a', '#f08a2a'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { rr(g, -0.24 + c * 0.1, -1.36 + r * 0.2, 0.07, 0.14, 0.015); g.fillStyle = cols[(r * 2 + c) % 5]; g.fill(); shine(g, -0.215 + c * 0.1, -1.31 + r * 0.2, 0.01, 0.04, 0.6); }
    rr(g, -0.24, -0.25, 0.48, 0.12, 0.02); g.fillStyle = '#2a3036'; g.fill();
    rr(g, 0.12, -0.7, 0.12, 0.2, 0.02); g.fillStyle = '#5a646c'; g.fill();
  } },
};
// のれんは文字ちがいで3枚（おでん）
for (const ch of ['お', 'で', 'ん']) {
  SPR[`noren:${ch}`] = { w: 1.0, h: 1.45, draw(g) {
    g.beginPath(); g.moveTo(-0.44, -1.32); g.lineTo(0.44, -1.32); g.lineTo(0.45, -0.46); g.quadraticCurveTo(0.24, -0.43, 0.02, -0.47); g.lineTo(0.02, -0.75); g.lineTo(-0.02, -0.75); g.lineTo(-0.02, -0.47); g.quadraticCurveTo(-0.24, -0.43, -0.45, -0.46); g.closePath();
    g.fillStyle = lin(g, -0.45, 0, 0.45, 0, [[0, '#1b2a55'], [0.4, '#2e4a8a'], [0.6, '#27407a'], [1, '#16224a']]); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 0.01;
    for (let x = -0.4; x <= 0.4; x += 0.06) { g.beginPath(); g.moveTo(x, -1.3); g.lineTo(x, -0.48); g.stroke(); }
    mtext(g, ch, 0, -0.98, 0.34, '#f8f4ea', { weight: 900 });
    stick(g, -0.5, -1.34, 0.5, -1.34, 0.05, '#a87a48', '#5e3e1e', 0.4);
  } };
}

const cache = new Map();
function sprite(id) {
  let s = cache.get(id);
  if (s) return s;
  const def = SPR[id];
  const pad = 0.12;
  const c = document.createElement('canvas');
  c.width = Math.ceil((def.w + pad * 2) * S);
  c.height = Math.ceil((def.h + pad * 2) * S);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height - pad * S);
  g.scale(S, S);
  def.draw(g);
  s = { c, ax: c.width / 2, ay: c.height - pad * S };
  cache.set(id, s);
  return s;
}
function spriteId(o) {
  if (o.kind === 'laundry') return `laundry:${o.ph > Math.PI ? 1 : 0}`;
  if (o.kind === 'noren') return `noren:${['お', 'で', 'ん'][o.lane + 1]}`;
  return o.kind;
}
/** 図鑑などに使う小さな絵 */
export function thumb(canvas, kind, { silhouette = false } = {}) {
  const sp = sprite(kind === 'laundry' ? 'laundry:0' : kind === 'noren' ? 'noren:で' : kind);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  // 吊り下げものは下の空白を切って中身だけ
  const top = OBSTACLES[kind]?.type === 'high' ? sp.ay - 1.5 * S : 0;
  const bottom = OBSTACLES[kind]?.type === 'high' ? sp.ay - 0.38 * S : sp.c.height;
  const sw = sp.c.width;
  const sh = bottom - top;
  const k = Math.min(canvas.width / sw, canvas.height / sh) * 0.92;
  g.save();
  g.drawImage(sp.c, 0, top, sw, sh, (canvas.width - sw * k) / 2, (canvas.height - sh * k) / 2, sw * k, sh * k);
  if (silhouette) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(70,58,48,.92)'; g.fillRect(0, 0, canvas.width, canvas.height); }
  g.restore();
}

// ---- 背景（場面ごとに1枚、遠景として描いておく） ----
const BW = 1400;
const BH = 620;
const BG = {
  kitchen(g) {
    g.fillStyle = lin(g, 0, 0, 0, BH, [[0, '#f6ead2'], [1, '#e9d7b4']]); g.fillRect(0, 0, BW, BH);
    // 窓（朝の空）
    const wx = 470; const wy = 120; const ww = 460; const wh = 330;
    g.fillStyle = '#fbf8f0'; g.fillRect(wx - 22, wy - 22, ww + 44, wh + 44);
    g.fillStyle = lin(g, 0, wy, 0, wy + wh, [[0, '#7cc4f0'], [0.7, '#cfeeff'], [1, '#fff5d8']]); g.fillRect(wx, wy, ww, wh);
    for (const [x, y, r] of [[560, 220, 40], [610, 205, 52], [670, 225, 38], [820, 300, 30], [860, 290, 40]]) oval(g, x, y, r, r * 0.7, 'rgba(255,255,255,.9)');
    oval(g, 760, 190, 60, 60, rad(g, 760, 190, 10, 760, 190, 90, [[0, 'rgba(255,250,220,1)'], [1, 'rgba(255,250,220,0)']]));
    g.fillStyle = '#fbf8f0'; g.fillRect(wx + ww / 2 - 8, wy, 16, wh); g.fillRect(wx, wy + wh / 2 - 8, ww, 16);
    // 光の筋
    g.fillStyle = 'rgba(255,248,215,.25)';
    g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx + ww, wy + wh); g.lineTo(wx + ww + 260, BH); g.lineTo(wx - 120, BH); g.closePath(); g.fill();
    // カーテン
    for (const [x, d] of [[wx - 40, 1], [wx + ww + 40, -1]]) {
      g.beginPath(); g.moveTo(x - 50 * d, wy - 40); g.quadraticCurveTo(x + 30 * d, wy + 120, x + 70 * d, wy + wh + 60); g.lineTo(x - 70 * d, wy + wh + 60); g.closePath();
      g.fillStyle = lin(g, x - 70, 0, x + 70, 0, [[0, '#f2a69c'], [0.5, '#fbd2c8'], [1, '#e98e84']]); g.fill();
    }
    // 吊り戸棚と鍋の影
    g.fillStyle = '#d9b98a'; g.fillRect(0, 40, 360, 180); g.fillRect(1040, 40, 360, 180);
    g.strokeStyle = '#b8935c'; g.lineWidth = 6;
    for (const x of [120, 240, 1160, 1280]) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 220); g.stroke(); }
    for (const x of [60, 180, 300]) { oval(g, x + 40, 300, 34, 34, '#c7cdd1'); oval(g, x + 40, 300, 22, 22, '#9aa3aa'); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, BH - 40, BW, 40);
  },
  table(g) {
    g.fillStyle = lin(g, 0, 0, 0, BH, [[0, '#6b4a2e'], [1, '#8c6844']]); g.fillRect(0, 0, BW, BH);
    // 障子
    for (let i = 0; i < 6; i++) {
      const x = 40 + i * 225;
      g.fillStyle = lin(g, 0, 80, 0, BH, [[0, '#fff3d6'], [1, '#f3dfb4']]); g.fillRect(x, 90, 205, BH - 90);
      g.strokeStyle = '#9b7444'; g.lineWidth = 5;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 51, 90); g.lineTo(x + k * 51, BH); g.stroke(); }
      for (let k = 1; k < 7; k++) { g.beginPath(); g.moveTo(x, 90 + k * 78); g.lineTo(x + 205, 90 + k * 78); g.stroke(); }
      g.strokeStyle = '#5b3d22'; g.lineWidth = 12; g.strokeRect(x, 90, 205, BH - 90);
    }
    g.fillStyle = '#4a3220'; g.fillRect(0, 60, BW, 34);
    // 掛け軸
    g.fillStyle = '#e9dfc4'; g.fillRect(640, 130, 120, 330); g.fillStyle = '#6a8a5a'; g.fillRect(640, 120, 120, 22); g.fillRect(640, 455, 120, 22);
    g.fillStyle = '#2a2420'; g.font = `900 92px ${FONT}`; g.textAlign = 'center'; g.fillText('豆', 700, 330);
    // 和紙の照明
    g.strokeStyle = '#3a2a1c'; g.lineWidth = 4; g.beginPath(); g.moveTo(700, 0); g.lineTo(700, 30); g.stroke();
    oval(g, 700, 50, 110, 60, rad(g, 700, 60, 10, 700, 60, 200, [[0, 'rgba(255,240,200,.6)'], [1, 'rgba(255,240,200,0)']]));
    g.beginPath(); g.ellipse(700, 50, 70, 30, 0, 0, TAU); g.fillStyle = '#fff1cf'; g.fill();
  },
  garden(g) {
    g.fillStyle = lin(g, 0, 0, 0, BH, [[0, '#6b5aa8'], [0.45, '#f08a6a'], [0.8, '#ffc98a'], [1, '#ffe4b0']]); g.fillRect(0, 0, BW, BH);
    oval(g, 900, 470, 90, 90, rad(g, 900, 470, 20, 900, 470, 260, [[0, 'rgba(255,245,200,1)'], [0.3, 'rgba(255,210,140,.7)'], [1, 'rgba(255,180,120,0)']]));
    oval(g, 900, 470, 62, 62, '#fff2c8');
    for (const [x, y, w] of [[220, 200, 220], [520, 150, 160], [1120, 230, 260], [760, 290, 140]]) {
      oval(g, x, y, w, 26, 'rgba(255,190,170,.55)'); oval(g, x + 40, y - 12, w * 0.6, 22, 'rgba(255,220,200,.5)');
    }
    g.fillStyle = '#8a6a9a';
    g.beginPath(); g.moveTo(0, 520); for (let x = 0; x <= BW; x += 100) g.lineTo(x, 470 + Math.sin(x * 0.006) * 40 + Math.sin(x * 0.017) * 14); g.lineTo(BW, BH); g.lineTo(0, BH); g.closePath(); g.fill();
    g.fillStyle = '#5a4a6a';
    for (let i = 0; i < 9; i++) { const x = i * 165 + 20; const w = 120; const y = 520 + (i % 3) * 12; g.fillRect(x, y, w, BH - y); g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x + w / 2, y - 46); g.lineTo(x + w + 14, y); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(255,214,140,.85)';
    for (let i = 0; i < 9; i++) if (i % 2) g.fillRect(i * 165 + 60, 560, 22, 18);
  },
  street(g) {
    g.fillStyle = lin(g, 0, 0, 0, BH, [[0, '#0d1230'], [0.6, '#24305e'], [1, '#4a3f6a']]); g.fillRect(0, 0, BW, BH);
    for (let i = 0; i < 90; i++) oval(g, hash(i) * BW, hash(i * 7.3) * 380, 1.5 + hash(i * 3) * 1.5, 1.5 + hash(i * 3) * 1.5, `rgba(255,255,240,${0.4 + hash(i * 9) * 0.6})`);
    oval(g, 1080, 140, 46, 46, '#fff6d2'); oval(g, 1080, 140, 120, 120, rad(g, 1080, 140, 40, 1080, 140, 140, [[0, 'rgba(255,246,210,.3)'], [1, 'rgba(255,246,210,0)']]));
    oval(g, 1066, 132, 10, 8, 'rgba(220,210,170,.6)'); oval(g, 1094, 152, 7, 6, 'rgba(220,210,170,.6)');
    for (let i = 0; i < 14; i++) {
      const w = 80 + hash(i * 2) * 70; const x = i * 105 - 20; const hgt = 140 + hash(i * 5) * 200;
      g.fillStyle = '#151a36'; g.fillRect(x, BH - hgt, w, hgt);
      for (let r = 0; r < hgt / 34 - 1; r++) for (let c = 0; c < w / 26 - 1; c++) if (hash(i * 100 + r * 10 + c) > 0.55) { g.fillStyle = 'rgba(255,214,140,.8)'; g.fillRect(x + 10 + c * 26, BH - hgt + 14 + r * 34, 12, 16); }
    }
    for (let i = 0; i < 16; i++) oval(g, 80 + i * 85, 520 + Math.sin(i) * 6, 9, 11, '#ff6a4a');
    g.strokeStyle = 'rgba(30,20,20,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 505); g.quadraticCurveTo(700, 540, BW, 505); g.stroke();
  },
};
const bgCache = new Map();
function backdrop(id) {
  let c = bgCache.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = BW;
  c.height = BH;
  BG[id](c.getContext('2d'));
  bgCache.set(id, c);
  return c;
}
const TOPC = { kitchen: '#f6ead2', table: '#4a3220', garden: '#6b5aa8', street: '#0d1230' };
const FOG = { kitchen: '#efe2c6', table: '#8f6c48', garden: '#ffd9a8', street: '#3a3560' };
const NIGHT = { kitchen: 0.42, table: 0.35, garden: 0.25, street: 0 };

// ---- 画面の大きさ ----
export function makeView(W, H) {
  const unit = Math.min(W, H * 0.62);
  const F = unit * 1.5;
  const groundAtTofu = CAM_H * F / CAM_BACK;
  const hor = Math.min(H * 0.4, H * 0.85 - groundAtTofu);
  return { W, H, F, hor, cx: W / 2 };
}

// ---- 効果（とうふのぷるぷる・粒・かけら） ----
export function makeFx() {
  return { sq: 0, sqv: 0, lean: 0, prevX: 0, camX: 0, parts: [], chunks: [], tofu: { x: 0, y: 0, s: 1 }, shake: 0, flash: 0 };
}
export function fxEvent(fx, e, run, skin) {
  const t = fx.tofu;
  switch (e.type) {
    case 'jump': fx.sqv += 5.5; puff(fx, 6, '#ffffff'); break;
    case 'land': fx.sqv -= 7; puff(fx, 8, 'rgba(255,255,255,.9)'); break;
    case 'slide': fx.sqv -= 9; break;
    case 'lane': fx.sqv += 1.5; break;
    case 'pick':
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * TAU;
        fx.parts.push({ x: t.x, y: t.y - t.s * 0.4, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 - 80, life: 0.45, max: 0.45, r: 3 + Math.random() * 3, c: e.kind === 'negi' ? '#b9f06a' : e.kind === 'ice' ? '#bdf0ff' : '#ffc2a0', star: true });
      }
      break;
    case 'shieldBreak':
      fx.flash = 0.25; fx.shake = 0.25;
      for (let i = 0; i < 18; i++) { const a = Math.random() * TAU; fx.parts.push({ x: t.x, y: t.y - t.s * 0.4, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 0.6, max: 0.6, r: 3 + Math.random() * 5, c: '#d9f6ff', shard: true, rot: a }); }
      break;
    case 'crash': {
      fx.shake = 0.45; fx.flash = 0.18;
      const col = SKIN_COLORS[skin] ?? SKIN_COLORS.kinu;
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = 220 + Math.random() * 360;
        fx.chunks.push({ x: t.x + (Math.random() - 0.5) * t.s * 0.5, y: t.y - t.s * 0.35, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: t.s * (0.1 + Math.random() * 0.16), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, col, life: 2.4 });
      }
      for (let i = 0; i < 22; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 3;
        const sp = 200 + Math.random() * 420;
        fx.parts.push({ x: t.x, y: t.y - t.s * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.9, max: 0.9, r: 2 + Math.random() * 4, c: 'rgba(235,245,255,.95)', g: 900 });
      }
      break;
    }
    default:
  }
}
function puff(fx, n, c) {
  const t = fx.tofu;
  for (let i = 0; i < n; i++) fx.parts.push({ x: t.x + (Math.random() - 0.5) * t.s * 0.8, y: t.y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, life: 0.4, max: 0.4, r: 3 + Math.random() * 4, c, soft: true });
}
function stepFx(fx, dt) {
  // ばね: 着地でつぶれ、跳ぶと伸びる
  fx.sqv += (-fx.sq * 260 - fx.sqv * 14) * dt;
  fx.sq += fx.sqv * dt;
  fx.sq = clamp(fx.sq, -0.6, 0.6);
  fx.shake = Math.max(0, fx.shake - dt);
  fx.flash = Math.max(0, fx.flash - dt);
  for (const p of fx.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g ?? 0) * dt; p.vx *= 1 - dt * 2; if (!p.g) p.vy *= 1 - dt * 2; }
  fx.parts = fx.parts.filter((p) => p.life > 0);
  for (const c of fx.chunks) { c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 1500 * dt; c.rot += c.vr * dt; if (c.y > c.floor) { c.y = c.floor; c.vy *= -0.3; c.vx *= 0.6; c.vr *= 0.5; } }
  fx.chunks = fx.chunks.filter((c) => c.life > 0);
}

// ---- とうふ ----
const SKIN_COLORS = {
  kinu: { face: ['#f8f5ea', '#e3ddcb'], top: ['#ffffff', '#f4f1e4'], side: '#e2ddca', leg: '#ece8d8', gloss: 0.95 },
  momen: { face: ['#f5eedb', '#e0d5b6'], top: ['#fffbee', '#f1e8d0'], side: '#d9cfae', leg: '#e6dcc0', gloss: 0.6 },
  yaki: { face: ['#f6e6c4', '#d9b98a'], top: ['#f0d6a4', '#c9965a'], side: '#c79c64', leg: '#d8b583', gloss: 0.55 },
  atsuage: { face: ['#e8a84e', '#b8691e'], top: ['#f1bb64', '#c97b2a'], side: '#a45a18', leg: '#c98234', gloss: 0.75 },
  goma: { face: ['#d1cbc0', '#aaa397'], top: ['#ddd7cc', '#bab3a6'], side: '#9a9387', leg: '#b9b2a6', gloss: 0.75 },
  koya: { face: ['#efe0b8', '#d8c393'], top: ['#f5e8c6', '#dfcb9c'], side: '#c9b17c', leg: '#dcc89a', gloss: 0.2 },
  annin: { face: ['#faf6ec', '#e8e0cc'], top: ['#ffffff', '#f8f2e2'], side: '#e6dcc4', leg: '#efe7d4', gloss: 1 },
  kin: { face: ['#fff1a0', '#c9930e'], top: ['#fff7c4', '#e8b72a'], side: '#a6740c', leg: '#dcaa2a', gloss: 1 },
};
function texture(g, skin, face, w, h, t) {
  // face: 'back' | 'top' | 'front'
  if (skin === 'momen') {
    dots(g, 40, -w / 2, -h, w / 2, 0, w * 0.008, 'rgba(170,150,100,.35)', face.length);
    g.strokeStyle = 'rgba(170,150,100,.07)'; g.lineWidth = w * 0.006;
    for (let x = -w / 2; x < w / 2; x += w * 0.08) { g.beginPath(); g.moveTo(x, -h); g.lineTo(x, 0); g.stroke(); }
  } else if (skin === 'yaki' && face === 'top') {
    g.strokeStyle = 'rgba(70,35,10,.75)'; g.lineWidth = h * 0.12; g.lineCap = 'round';
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * w * 0.2 - w * 0.1, -h * 0.15); g.lineTo(k * w * 0.2 + w * 0.1, -h * 0.85); g.stroke(); }
  } else if (skin === 'yaki') {
    g.fillStyle = lin(g, 0, -h, 0, -h * 0.75, [[0, 'rgba(120,60,15,.55)'], [1, 'rgba(120,60,15,0)']]); g.fillRect(-w / 2, -h, w, h * 0.3);
  } else if (skin === 'atsuage') {
    dots(g, 50, -w / 2, -h, w / 2, 0, w * 0.018, 'rgba(255,220,140,.45)', face.length + 3);
    dots(g, 30, -w / 2, -h, w / 2, 0, w * 0.012, 'rgba(120,50,5,.35)', face.length + 7);
  } else if (skin === 'goma') {
    dots(g, 60, -w / 2, -h, w / 2, 0, w * 0.006, 'rgba(40,30,20,.55)', face.length + 1);
  } else if (skin === 'koya') {
    for (let i = 0; i < 46; i++) oval(g, mix(-w / 2, w / 2, hash(i * 3.3 + face.length)), mix(-h, 0, hash(i * 7.1)), w * 0.02, h * 0.012, 'rgba(150,120,70,.45)');
  } else if (skin === 'kin') {
    const k = (t * 0.6) % 2;
    g.fillStyle = lin(g, -w + k * w * 1.5, -h, -w * 0.4 + k * w * 1.5, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,.65)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(-w / 2, -h, w, h);
  }
}
/**
 * 後ろから見たとうふ（走っている姿）。原点は足もと中央、size は1mあたりのピクセル
 */
function drawTofuBack(g, size, o) {
  const col = SKIN_COLORS[o.skin] ?? SKIN_COLORS.kinu;
  const w = TOFU.w * size;
  const hFull = TOFU.h * size;
  const h = hFull * o.hk;
  const leg = 0.13 * size * (o.slide ? 0.35 : 1);
  const T = w * 0.36;                                 // 上面の見える量（カメラが上にあるので）
  const sk = clamp(-o.rel * 0.22, -0.3, 0.3) * w;      // 横ずれで上面が中央へ寄る
  g.save();
  // 影
  oval(g, 0, 0, w * 0.62 * (1 - o.air * 0.4), w * 0.16 * (1 - o.air * 0.4), `rgba(30,20,10,${0.32 - o.air * 0.15})`);
  g.translate(0, -o.lift);
  // 足
  const ph = o.run;
  g.lineCap = 'round';
  g.strokeStyle = col.leg;
  g.lineWidth = w * 0.11;
  for (const s of [-1, 1]) {
    const sw = o.air ? -0.4 : o.slide ? 0 : Math.sin(ph + (s > 0 ? Math.PI : 0));
    const x0 = s * w * 0.2;
    const lift = o.air ? leg * 0.5 : Math.max(0, sw) * leg * 0.55;
    g.beginPath(); g.moveTo(x0, -leg); g.lineTo(x0 + (o.slide ? s * w * 0.18 : 0), -lift); g.stroke();
    oval(g, x0 + (o.slide ? s * w * 0.18 : 0), -lift, w * 0.085, w * 0.05, col.side);
  }
  g.translate(0, -leg);
  // 体（ぷるぷる: 上下に伸び縮み＋左右に傾く）
  const sx = 1 + o.sq * 0.35;
  const sy = 1 - o.sq * 0.35;
  g.transform(sx, 0, o.lean, sy, 0, 0);
  // 腕（ちいさな突起）
  for (const s of [-1, 1]) {
    const ay = -h * (o.air ? 0.85 : 0.5) + Math.sin(ph * 2 + s) * h * 0.04;
    g.beginPath(); g.moveTo(s * w * 0.48, -h * 0.55); g.quadraticCurveTo(s * w * 0.62, -h * 0.55, s * w * 0.66, ay - (o.air ? h * 0.2 : 0));
    g.lineWidth = w * 0.09; g.strokeStyle = col.leg; g.stroke();
  }
  const r = w * 0.07;
  const nb = 0.86;                     // 奥の辺は遠いぶん短い
  const bl = [-w / 2 * nb + sk, -h - T]; const br = [w / 2 * nb + sk, -h - T];
  // 側面（カメラから見て内側の面が少し見える）
  if (Math.abs(sk) > 1) {
    const sx0 = sk > 0 ? -w / 2 : w / 2;
    const bx = sk > 0 ? bl[0] : br[0];
    g.beginPath(); g.moveTo(sx0, 0); g.lineTo(sx0, -h); g.lineTo(bx, -h - T); g.lineTo(bx, -T * 0.8); g.closePath();
    g.fillStyle = col.side; g.fill();
  }
  // 上面（明るく、つやつや）
  g.beginPath();
  g.moveTo(-w / 2, -h + 1); g.lineTo(w / 2, -h + 1);
  g.lineTo(br[0] + r * 0.2, br[1] + r * 0.6); g.quadraticCurveTo(br[0], br[1], br[0] - r, br[1]);
  g.lineTo(bl[0] + r, bl[1]); g.quadraticCurveTo(bl[0], bl[1], bl[0] - r * 0.2, bl[1] + r * 0.6);
  g.closePath();
  g.fillStyle = lin(g, 0, -h - T, 0, -h, [[0, col.top[1]], [1, col.top[0]]]);
  g.fill();
  g.save(); g.clip(); g.translate(sk / 2, -h); texture(g, o.skin, 'top', w, T, o.t);
  g.fillStyle = lin(g, 0, -T, 0, 0, [[0, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.55)']]); g.fillRect(-w, -T, w * 2, T);
  g.restore();
  // 背面（こちら向きの面は少し陰る）
  rr(g, -w / 2, -h, w, h, [r * 0.35, r * 0.35, r, r]);
  g.fillStyle = lin(g, 0, -h, 0, 0, [[0, col.face[0]], [1, col.face[1]]]);
  g.fill();
  g.save(); g.clip();
  texture(g, o.skin, 'back', w, h, o.t);
  // 角の丸み（上の辺にそって明るい帯）
  g.fillStyle = lin(g, 0, -h, 0, -h + h * 0.09, [[0, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-w / 2, -h, w, h * 0.09);
  g.fillStyle = lin(g, 0, -h * 0.3, 0, 0, [[0, 'rgba(110,95,60,0)'], [1, 'rgba(110,95,60,.25)']]); g.fillRect(-w / 2, -h * 0.3, w, h * 0.3);
  g.fillStyle = lin(g, -w / 2, 0, -w / 2 + w * 0.08, 0, [[0, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-w / 2, -h, w * 0.08, h);
  g.fillStyle = lin(g, w / 2, 0, w / 2 - w * 0.1, 0, [[0, 'rgba(110,95,60,.18)'], [1, 'rgba(110,95,60,0)']]); g.fillRect(w / 2 - w * 0.1, -h, w * 0.1, h);
  g.restore();
  // つや
  const gl = col.gloss;
  shine(g, -w * 0.1 + sk * 0.5, -h - T * 0.5, w * 0.3, T * 0.2, 0.95 * gl, -0.06);
  shine(g, w * 0.24 + sk * 0.5, -h - T * 0.62, w * 0.05, T * 0.08, 0.9 * gl);
  shine(g, -w * 0.32, -h * 0.6, w * 0.05, h * 0.26, 0.5 * gl);
  shine(g, w * 0.33, -h * 0.84, w * 0.04, h * 0.04, 0.7 * gl);
  if (o.skin === 'annin') {
    oval(g, sk * 0.5 + w * 0.08, -h - T * 0.55, w * 0.09, w * 0.065, rad(g, sk * 0.5 + w * 0.06, -h - T * 0.6, 1, sk * 0.5 + w * 0.08, -h - T * 0.55, w * 0.1, [[0, '#ff8a7a'], [1, '#c41a10']]));
    oval(g, sk * 0.5 - w * 0.06, -h - T * 0.6, w * 0.08, w * 0.03, '#4fae4a', -0.4);
  }
  g.lineWidth = Math.max(1, w * 0.012); g.strokeStyle = 'rgba(140,120,80,.28)';
  g.beginPath(); g.moveTo(-w / 2, -h + r); g.lineTo(-w / 2, -r); g.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0); g.lineTo(w / 2 - r, 0); g.quadraticCurveTo(w / 2, 0, w / 2, -r); g.lineTo(w / 2, -h + r); g.stroke();
  // しずく（走っているとき）
  if (!o.slide && !o.air) {
    const k = (o.t * 2.2) % 1;
    oval(g, w * 0.36, -h * (0.7 - k * 0.5), w * 0.025, w * 0.035 * (1 - k * 0.3), `rgba(210,240,255,${0.85 * (1 - k)})`);
  }
  g.restore();
}

/** 正面から見たとうふ（タイトル・結果画面） expr: 'panic' | 'happy' | 'run' | 'dead' */
export function drawTofuFront(g, x, y, size, skin, expr, t) {
  const col = SKIN_COLORS[skin] ?? SKIN_COLORS.kinu;
  const w = size;
  const h = size;
  const T = w * 0.24;
  const breathe = Math.sin(t * 3) * 0.025;
  g.save();
  g.translate(x, y);
  oval(g, 0, 0, w * 0.68, w * 0.14, 'rgba(30,20,10,.28)');
  // 足
  g.lineCap = 'round'; g.strokeStyle = col.leg; g.lineWidth = w * 0.1;
  const leg = w * 0.13;
  for (const s of [-1, 1]) {
    const lf = expr === 'panic' ? Math.max(0, Math.sin(t * 16 + (s > 0 ? Math.PI : 0))) * leg * 0.4 : 0;
    g.beginPath(); g.moveTo(s * w * 0.2, -leg); g.lineTo(s * w * 0.22, -lf); g.stroke();
    oval(g, s * w * 0.23, -lf, w * 0.08, w * 0.045, col.side);
  }
  g.translate(0, -leg);
  g.transform(1 - breathe, 0, 0, 1 + breathe, 0, 0);
  // 腕
  for (const s of [-1, 1]) {
    const up = expr === 'panic' ? Math.sin(t * 14 + s) * h * 0.12 - h * 0.25 : expr === 'happy' ? -h * 0.35 : 0;
    g.beginPath(); g.moveTo(s * w * 0.48, -h * 0.5); g.quadraticCurveTo(s * w * 0.66, -h * 0.5, s * w * 0.68, -h * 0.35 + up);
    g.lineWidth = w * 0.09; g.strokeStyle = col.leg; g.stroke();
  }
  // 上面
  g.beginPath(); g.moveTo(-w / 2, -h + 2); g.lineTo(w / 2, -h + 2); g.lineTo(w / 2 - w * 0.07, -h - T); g.lineTo(-w / 2 + w * 0.07, -h - T); g.closePath();
  g.fillStyle = lin(g, 0, -h - T, 0, -h, [[0, col.top[1]], [1, col.top[0]]]); g.fill();
  g.save(); g.clip(); g.translate(0, -h); texture(g, skin, 'top', w, T, t); g.restore();
  if (skin === 'annin') {
    oval(g, w * 0.08, -h - T * 0.5, w * 0.08, w * 0.06, rad(g, w * 0.06, -h - T * 0.55, 1, w * 0.08, -h - T * 0.5, w * 0.09, [[0, '#ff8a7a'], [1, '#c41a10']]));
    oval(g, -w * 0.06, -h - T * 0.55, w * 0.08, w * 0.028, '#4fae4a', -0.4);
  }
  // 正面
  rr(g, -w / 2, -h, w, h, [w * 0.03, w * 0.03, w * 0.07, w * 0.07]);
  g.fillStyle = lin(g, 0, -h, 0, 0, [[0, col.face[0]], [1, col.face[1]]]); g.fill();
  g.save(); g.clip(); texture(g, skin, 'front', w, h, t);
  g.fillStyle = lin(g, 0, -h, 0, -h + h * 0.08, [[0, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-w / 2, -h, w, h * 0.08);
  g.fillStyle = lin(g, 0, -h * 0.25, 0, 0, [[0, 'rgba(120,110,80,0)'], [1, 'rgba(120,110,80,.2)']]); g.fillRect(-w / 2, -h * 0.25, w, h * 0.25);
  g.restore();
  // かお
  const ink = skin === 'kin' ? '#5a3a00' : '#2b2420';
  const ey = -h * 0.56;
  g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineWidth = w * 0.035;
  for (const s of [-1, 1]) {
    const ex = s * w * 0.18;
    if (expr === 'happy') { g.beginPath(); g.arc(ex, ey + h * 0.02, w * 0.06, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    else if (expr === 'dead') { g.beginPath(); g.moveTo(ex - w * 0.05, ey - w * 0.05); g.lineTo(ex + w * 0.05, ey + w * 0.05); g.moveTo(ex + w * 0.05, ey - w * 0.05); g.lineTo(ex - w * 0.05, ey + w * 0.05); g.stroke(); }
    else {
      const big = expr === 'panic' ? 1.2 : 1;
      oval(g, ex, ey, w * 0.06 * big, w * 0.078 * big, ink);
      oval(g, ex - w * 0.02, ey - w * 0.03, w * 0.022, w * 0.022, '#ffffff');
      oval(g, ex + w * 0.02, ey + w * 0.025, w * 0.01, w * 0.01, '#ffffff');
      if (expr === 'run') { g.beginPath(); g.moveTo(ex - s * w * 0.08, ey - w * 0.12); g.lineTo(ex + s * w * 0.04, ey - w * 0.09); g.stroke(); }
    }
  }
  oval(g, -w * 0.3, -h * 0.42, w * 0.07, w * 0.035, 'rgba(255,140,140,.35)');
  oval(g, w * 0.3, -h * 0.42, w * 0.07, w * 0.035, 'rgba(255,140,140,.35)');
  if (expr === 'panic') { oval(g, 0, -h * 0.36, w * 0.045, w * 0.06, ink); }
  else if (expr === 'happy') { g.beginPath(); g.arc(0, -h * 0.42, w * 0.06, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else if (expr === 'dead') { g.beginPath(); g.moveTo(-w * 0.07, -h * 0.36); for (let i = 0; i < 4; i++) g.quadraticCurveTo(-w * 0.05 + i * w * 0.035, -h * (i % 2 ? 0.33 : 0.39), -w * 0.035 + i * w * 0.035, -h * 0.36); g.stroke(); }
  else { g.beginPath(); g.moveTo(-w * 0.05, -h * 0.38); g.lineTo(w * 0.05, -h * 0.38); g.stroke(); }
  if (expr === 'panic') {
    const k = (t * 1.5) % 1;
    g.beginPath(); g.moveTo(w * 0.42, -h * 0.95 + k * h * 0.2); g.quadraticCurveTo(w * 0.48, -h * 0.85 + k * h * 0.2, w * 0.42, -h * 0.82 + k * h * 0.2); g.quadraticCurveTo(w * 0.36, -h * 0.85 + k * h * 0.2, w * 0.42, -h * 0.95 + k * h * 0.2);
    g.fillStyle = `rgba(140,200,255,${1 - k})`; g.fill();
  }
  // つや
  const gl = col.gloss;
  shine(g, -w * 0.1, -h - T * 0.5, w * 0.32, T * 0.2, 0.9 * gl);
  shine(g, -w * 0.36, -h * 0.7, w * 0.05, h * 0.22, 0.6 * gl);
  shine(g, w * 0.36, -h * 0.85, w * 0.04, h * 0.05, 0.8 * gl);
  g.lineWidth = Math.max(1, w * 0.012); g.strokeStyle = 'rgba(140,120,80,.25)';
  g.beginPath(); g.moveTo(-w / 2, -h + w * 0.05); g.lineTo(-w / 2, -w * 0.07); g.quadraticCurveTo(-w / 2, 0, -w * 0.43, 0); g.lineTo(w * 0.43, 0); g.quadraticCurveTo(w / 2, 0, w / 2, -w * 0.07); g.lineTo(w / 2, -h + w * 0.05); g.stroke();
  g.restore();
}

// ---- 道（場面ごとの塗り方） ----
function q(g, a, b, c, d, fill) {
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
  g.fillStyle = fill; g.fill();
}
function line3(g, P, x0, y0, z0, x1, y1, z1) {
  const a = P(x0, y0, z0); const b = P(x1, y1, z1);
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
}
const PAINT = {
  kitchen(g, P, za, zb, near) {
    const fy = -2.4;
    q(g, P(ROAD_HALF, fy, za), P(16, fy, za), P(16, fy, zb), P(ROAD_HALF, fy, zb), Math.floor(za / 1.2) % 2 ? '#b8875a' : '#ac7c50');
    const board = za < 26;
    q(g, P(-2.4, 0, za), P(ROAD_HALF, 0, za), P(ROAD_HALF, 0, zb), P(-2.4, 0, zb), Math.floor(za / 4) % 2 ? '#c9d0d5' : '#c3cacf');
    q(g, P(-0.62, 0, za), P(-0.38, 0, za), P(-0.38, 0, zb), P(-0.62, 0, zb), 'rgba(255,255,255,.22)');
    q(g, P(0.7, 0, za), P(0.8, 0, za), P(0.8, 0, zb), P(0.7, 0, zb), 'rgba(255,255,255,.16)');
    if (board) {
      const zz = Math.min(zb, 26);
      q(g, P(-1.5, 0.001, za), P(1.5, 0.001, za), P(1.5, 0.001, zz), P(-1.5, 0.001, zz), Math.floor(za * 2) % 2 ? '#ecd2a6' : '#e6caa0');
      if (near) { g.beginPath(); for (const x of [-1.1, -0.5, 0.2, 0.9]) line3(g, P, x, 0.002, za, x + 0.02, 0.002, zz); g.strokeStyle = 'rgba(170,120,70,.25)'; g.lineWidth = 1; g.stroke(); }
    }
    if (Math.floor(za) % 4 === 0) { g.beginPath(); line3(g, P, -2.4, 0, za, ROAD_HALF, 0, za); g.strokeStyle = 'rgba(90,100,108,.35)'; g.lineWidth = 1; g.stroke(); }
    q(g, P(ROAD_HALF - 0.04, 0, za), P(ROAD_HALF + 0.03, -0.06, za), P(ROAD_HALF + 0.03, -0.06, zb), P(ROAD_HALF - 0.04, 0, zb), '#eef3f6');
    // タイルの壁
    q(g, P(-2.4, 0, za), P(-2.4, 1.5, za), P(-2.4, 1.5, zb), P(-2.4, 0, zb), '#f4f2ec');
    q(g, P(-2.4, 1.5, za), P(-2.4, 3.0, za), P(-2.4, 3.0, zb), P(-2.4, 1.5, zb), '#ead9b8');
    q(g, P(-2.4, 1.5, za), P(-2.4, 1.6, za), P(-2.4, 1.6, zb), P(-2.4, 1.5, zb), '#c9b48c');
    if (near) {
      g.beginPath();
      for (let y = 0.3; y < 1.5; y += 0.3) line3(g, P, -2.4, y, za, -2.4, y, zb);
      for (let z = Math.ceil(za / 0.3) * 0.3; z < zb; z += 0.3) line3(g, P, -2.4, 0, z, -2.4, 1.5, z);
      g.strokeStyle = 'rgba(150,180,190,.55)'; g.lineWidth = 1; g.stroke();
    }
  },
  table(g, P, za, zb, near) {
    const fy = -0.9;
    q(g, P(-16, fy, za), P(16, fy, za), P(16, fy, zb), P(-16, fy, zb), Math.floor(za / 1.8) % 2 ? '#c8c37e' : '#bdb671');
    if (za % 1.8 < (zb - za)) { q(g, P(-16, fy, za), P(16, fy, za), P(16, fy, za + 0.12), P(-16, fy, za + 0.12), '#3d5a2c'); }
    q(g, P(-ROAD_HALF, 0, za), P(ROAD_HALF, 0, za), P(ROAD_HALF, 0, zb), P(-ROAD_HALF, 0, zb), '#fbf3e6');
    const red = 'rgba(214,52,44,.5)';
    for (let x = -1.5; x < ROAD_HALF; x += 1.0) q(g, P(x, 0, za), P(x + 0.5, 0, za), P(x + 0.5, 0, zb), P(x, 0, zb), red);
    for (let z = Math.floor(za); z < zb; z += 1) {
      const z0 = Math.max(za, z); const z1 = Math.min(zb, z + 0.5);
      if (z1 > z0) q(g, P(-ROAD_HALF, 0, z0), P(ROAD_HALF, 0, z0), P(ROAD_HALF, 0, z1), P(-ROAD_HALF, 0, z1), red);
    }
    for (const s of [-1, 1]) q(g, P(s * ROAD_HALF, 0, za), P(s * (ROAD_HALF + 0.06), -0.12, za), P(s * (ROAD_HALF + 0.06), -0.12, zb), P(s * ROAD_HALF, 0, zb), '#d9443a');
  },
  garden(g, P, za, zb, near) {
    const gy = -0.55;
    q(g, P(ROAD_HALF, gy, za), P(18, gy, za), P(18, gy, zb), P(ROAD_HALF, gy, zb), Math.floor(za / 2) % 2 ? '#7cb44c' : '#71a845');
    q(g, P(-2.2, 0, za), P(ROAD_HALF, 0, za), P(ROAD_HALF, 0, zb), P(-2.2, 0, zb), '#c28c54');
    for (let x = -2.2; x < ROAD_HALF; x += 0.76) q(g, P(x, 0, za), P(x + 0.38, 0, za), P(x + 0.38, 0, zb), P(x, 0, zb), 'rgba(150,95,45,.28)');
    if (near) { g.beginPath(); for (let x = -2.2 + 0.38; x < ROAD_HALF; x += 0.38) line3(g, P, x, 0, za, x, 0, zb); g.strokeStyle = 'rgba(90,55,25,.4)'; g.lineWidth = 1; g.stroke(); }
    q(g, P(ROAD_HALF - 0.05, 0, za), P(ROAD_HALF, 0, za), P(ROAD_HALF, 0, zb), P(ROAD_HALF - 0.05, 0, zb), '#e8b47a');
    // 障子の壁
    const pil = Math.floor(za / 2.4) !== Math.floor(zb / 2.4);
    q(g, P(-2.2, 0, za), P(-2.2, 0.35, za), P(-2.2, 0.35, zb), P(-2.2, 0, zb), '#8a5f3a');
    q(g, P(-2.2, 0.35, za), P(-2.2, 2.3, za), P(-2.2, 2.3, zb), P(-2.2, 0.35, zb), '#fbf0d6');
    q(g, P(-2.2, 2.3, za), P(-1.6, 2.7, za), P(-1.6, 2.7, zb), P(-2.2, 2.3, zb), '#3a2a1e');
    if (near) {
      g.beginPath();
      for (let y = 0.7; y < 2.3; y += 0.35) line3(g, P, -2.2, y, za, -2.2, y, zb);
      for (let z = Math.ceil(za / 0.6) * 0.6; z < zb; z += 0.6) line3(g, P, -2.2, 0.35, z, -2.2, 2.3, z);
      g.strokeStyle = 'rgba(150,110,60,.6)'; g.lineWidth = 1; g.stroke();
    }
    if (pil) { const z = Math.floor(zb / 2.4) * 2.4; q(g, P(-2.19, 0, z), P(-2.19, 2.4, z), P(-2.19, 2.4, z + 0.14), P(-2.19, 0, z + 0.14), '#5b3a22'); }
  },
  street(g, P, za, zb, near) {
    q(g, P(-3, 0, za), P(3, 0, za), P(3, 0, zb), P(-3, 0, zb), Math.floor(za / 0.8) % 2 ? '#6e6a78' : '#666270');
    if (near) {
      g.beginPath();
      for (let x = -2.4; x < 3; x += 0.8) line3(g, P, x, 0, za, x, 0, zb);
      for (let z = Math.ceil(za / 0.8) * 0.8; z < zb; z += 0.8) line3(g, P, -3, 0, z, 3, 0, z);
      g.strokeStyle = 'rgba(40,36,50,.45)'; g.lineWidth = 1; g.stroke();
    }
    // 店先
    for (const s of [-1, 1]) {
      const shop = Math.floor((za + (s > 0 ? 2.5 : 0)) / 5);
      const pal = ['#5a3a28', '#c9b48e', '#3a3438', '#7a4a30', '#a89878'][Math.floor(hash(shop * 3 + s) * 5)];
      const x = s * 3;
      q(g, P(x, 0, za), P(x, 2.8, za), P(x, 2.8, zb), P(x, 0, zb), pal);
      const lit = hash(shop * 7 + s) > 0.3;
      if (lit) q(g, P(x, 0.4, za), P(x, 1.8, za), P(x, 1.8, zb), P(x, 0.4, zb), 'rgba(255,206,120,.85)');
      q(g, P(x, 2.5, za), P(x - s * 0.5, 2.75, za), P(x - s * 0.5, 2.75, zb), P(x, 2.5, zb), '#2a2224');
      const b = Math.floor((zb + (s > 0 ? 2.5 : 0)) / 5);
      if (b !== shop) { const z = b * 5 - (s > 0 ? 2.5 : 0); q(g, P(x - s * 0.01, 0, z), P(x - s * 0.01, 2.8, z), P(x - s * 0.01, 2.8, z + 0.18), P(x - s * 0.01, 0, z + 0.18), '#1e1a1c'); }
    }
  },
};
// 道ばたの飾り: [場面, 間隔, 位置x, 高さy, 部品]
const PROPS = {
  kitchen: [{ every: 7, x: -2.0, y: 0, ids: ['bottles', 'cooker', 'crock'] }],
  table: [{ every: 9, x: -2.8, y: -0.9, ids: ['zabuton'] }, { every: 11, x: 2.8, y: -0.9, ids: ['zabuton'] }],
  garden: [{ every: 5, x: 2.6, y: -0.55, ids: ['bush', 'tourou', 'sunflower', 'bush'] }, { every: 9, x: 4.2, y: -0.55, ids: ['sunflower', 'bush'] }],
  street: [{ every: 5, x: -2.6, y: 0, ids: ['chochin'] }, { every: 10, x: 2.5, y: 0, ids: ['vending', 'chochin'], flip: true }],
};
const HANG = { otama: 2.08, shamoji: 2.08, laundry: 1.25, noren: 1.34 };

// ---- 走っている画面 ----
export function drawGame(g, view, run, skin, fx, t, dt) {
  stepFx(fx, dt);
  const { W, H, F, cx } = view;
  let hor = view.hor;
  // カメラ
  fx.camX += (run.x * 0.55 - fx.camX) * Math.min(1, dt * 6);
  const vx = (run.x - fx.prevX) / Math.max(dt, 1e-3);
  fx.prevX = run.x;
  fx.lean += (clamp(-vx * 0.02, -0.25, 0.25) - fx.lean) * Math.min(1, dt * 12);
  const camX = fx.camX;
  const camZ = run.d - CAM_BACK;
  const curv = 0.0019 * Math.sin(run.d / 190) * clamp(run.d / 80, 0, 1);
  const roll = (run.x - camX) * -0.025 + fx.lean * 0.04;
  const shake = fx.shake > 0 ? fx.shake * 14 : 0;
  hor += Math.sin(run.t * 11) * (run.dead ? 0 : 1.2);
  const P = (x, y, z) => {
    const zr = Math.max(0.3, z - camZ);
    const s = F / zr;
    return [cx + (x - camX + curv * zr * zr) * s, hor + (CAM_H - y) * s, s];
  };
  const zi = zoneAt(run.d + 30);
  const lap = zoneAt(run.d).lap;

  g.save();
  if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  g.translate(W / 2, H * 0.7); g.rotate(roll); g.translate(-W / 2, -H * 0.7);

  // 背景（次の場面へは遠くから切り替わる）
  const bw = Math.max(Math.min(W, H * 0.62) * 1.6, W * 1.1);
  const bh = bw * BH / BW;
  const bx = cx - bw / 2 - camX * 18 - curv * 9000;
  const ahead = zoneAt(run.d + 70).zone.id;
  g.fillStyle = FOG[ahead];
  g.fillRect(-W, -H, W * 3, H * 3);
  g.fillStyle = TOPC[zi.zone.id];
  g.fillRect(-W, -H, W * 3, hor - bh + H + 6);
  g.drawImage(backdrop(zi.zone.id), bx, hor - bh + 4, bw, bh);
  if (ahead !== zi.zone.id) {
    const nz = zoneAt(run.d + 70).zone;
    const k = clamp((run.d + 70 - (Math.floor((run.d + 70) / LAP) * LAP + nz.from)) / 40, 0, 1);
    g.globalAlpha = k;
    g.drawImage(backdrop(nz.id), bx, hor - bh + 4, bw, bh);
    g.globalAlpha = 1;
  }

  // 道（遠くから手前へ）
  const segs = [];
  let z = Math.ceil(camZ + 0.8);
  segs.push([camZ + 0.75, z]);
  while (z < camZ + FAR) { const zr = z - camZ; const st = zr < 22 ? 1 : 2; segs.push([z, z + st]); z += st; }
  for (let i = segs.length - 1; i >= 0; i--) {
    const [za, zb] = segs[i];
    const zz = zoneAt(za).zone.id;
    PAINT[zz](g, P, za, zb + 0.04, za - camZ < 34);
  }
  // 遠くのかすみ
  const yFog = P(0, 0, camZ + 46)[1];
  g.fillStyle = lin(g, 0, hor - 2, 0, yFog, [[0, FOG[ahead]], [1, hexA(FOG[ahead], 0)]]);
  g.fillRect(-W, hor - 2, W * 3, yFog - hor + 2);

  // 物（遠い順）
  const items = [];
  for (const o of run.obs) { const zr = o.z - camZ; if (zr > 0.9 && zr < FAR) items.push({ zr, o }); }
  for (const p of run.picks) { const zr = p.z - camZ; if (zr > 0.9 && zr < FAR && !p.got) items.push({ zr, p }); }
  for (const zoneId of Object.keys(PROPS)) {
    for (const pr of PROPS[zoneId]) {
      for (let zz = Math.ceil((camZ + 1) / pr.every) * pr.every; zz < camZ + FAR; zz += pr.every) {
        if (zoneAt(zz).zone.id !== zoneId) continue;
        const k = Math.floor(zz / pr.every);
        items.push({ zr: zz - camZ, prop: pr.ids[k % pr.ids.length], x: pr.x, y: pr.y, z: zz, flip: pr.flip });
      }
    }
  }
  const tofuZr = CAM_BACK;
  items.push({ zr: tofuZr, tofu: true });
  items.sort((a, b) => b.zr - a.zr);
  for (const it of items) {
    const fade = clamp((FAR - it.zr) / 22, 0, 1);
    g.globalAlpha = fade;
    if (it.tofu) { g.globalAlpha = 1; drawRunner(g, view, run, skin, fx, P, t, lap); continue; }
    if (it.prop) {
      const [sx, sy, s] = P(it.x, it.y, it.z);
      const sp = sprite(it.prop);
      const k = s / S;
      g.save(); g.translate(sx, sy); if (it.flip) g.scale(-1, 1);
      g.drawImage(sp.c, -sp.ax * k, -sp.ay * k, sp.c.width * k, sp.c.height * k);
      g.restore();
      continue;
    }
    if (it.o) drawObstacle(g, P, it.o, t);
    else drawPickup(g, P, it.p, t, run);
  }
  g.globalAlpha = 1;
  // 夜（2周目から）
  if (lap > 0 && NIGHT[zoneAt(run.d).zone.id]) {
    g.fillStyle = `rgba(14,18,52,${NIGHT[zoneAt(run.d).zone.id]})`;
    g.fillRect(-W, -H, W * 3, H * 3);
    drawRunner(g, view, run, skin, fx, P, t, lap, true);
    drawRunner(g, view, run, skin, fx, P, t, lap);
  }
  // 粒・かけら
  for (const c of fx.chunks) {
    g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.globalAlpha = clamp(c.life, 0, 1);
    rr(g, -c.r, -c.r, c.r * 2, c.r * 2, c.r * 0.25); g.fillStyle = lin(g, 0, -c.r, 0, c.r, [[0, c.col.top[0]], [1, c.col.face[1]]]); g.fill();
    shine(g, -c.r * 0.3, -c.r * 0.5, c.r * 0.5, c.r * 0.2, 0.8 * c.col.gloss);
    g.restore();
  }
  for (const p of fx.parts) {
    g.globalAlpha = clamp(p.life / p.max, 0, 1);
    if (p.star) { g.save(); g.translate(p.x, p.y); g.rotate(p.life * 8); g.fillStyle = p.c; g.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? p.r * 0.4 : p.r * 1.4; g.lineTo(Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r); } g.closePath(); g.fill(); g.restore(); }
    else if (p.shard) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot += 0.2); g.fillStyle = p.c; g.beginPath(); g.moveTo(0, -p.r); g.lineTo(p.r * 0.5, p.r); g.lineTo(-p.r * 0.5, p.r * 0.6); g.closePath(); g.fill(); g.restore(); }
    else oval(g, p.x, p.y, p.r, p.r, p.c);
  }
  g.globalAlpha = 1;
  g.restore();

  // 速さの線
  const sp = (run.v - 13) / 10;
  if (sp > 0 && !run.dead) {
    g.strokeStyle = `rgba(255,255,255,${Math.min(0.22, sp * 0.3)})`;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = hash(i * 13.3 + Math.floor(t * 20)) * TAU;
      const r0 = Math.max(W, H) * (0.42 + hash(i + Math.floor(t * 20)) * 0.1);
      const x0 = cx + Math.cos(a) * r0; const y0 = H * 0.55 + Math.sin(a) * r0 * 0.8;
      g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * 60, y0 + Math.sin(a) * 48);
    }
    g.stroke();
  }
  // ふち暗く
  g.fillStyle = rad(g, cx, H * 0.55, Math.min(W, H) * 0.45, cx, H * 0.55, Math.max(W, H) * 0.85, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(20,10,0,.35)']]);
  g.fillRect(0, 0, W, H);
  if (fx.flash > 0) { g.fillStyle = `rgba(255,255,255,${fx.flash * 2})`; g.fillRect(0, 0, W, H); }
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawObstacle(g, P, o, t) {
  const x = o.lane * LANE_W;
  const [sx, sy, s] = P(x, 0, o.z);
  const sp = sprite(spriteId(o));
  const k = s / S;
  // 地面の影
  const sw = o.type === 'low' ? 0.5 : o.type === 'high' ? 0.36 : 0.4;
  oval(g, sx, sy, sw * s, sw * s * 0.22, 'rgba(30,20,10,.28)');
  g.save();
  if (o.type === 'high') {
    // 吊り下げ: 棒を渡して、ゆらゆら
    const top = HANG[o.kind];
    const a = P(x - 0.5, top, o.z); const b = P(x + 0.5, top, o.z);
    g.lineCap = 'round';
    if (o.kind === 'laundry') {
      g.strokeStyle = '#f2efe6'; g.lineWidth = Math.max(1, s * 0.02);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(sx, a[1] + s * 0.06, b[0], b[1]); g.stroke();
    } else if (o.kind !== 'noren') {
      g.strokeStyle = '#7d8890'; g.lineWidth = Math.max(1.5, s * 0.05);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = Math.max(1, s * 0.015);
      g.beginPath(); g.moveTo(a[0], a[1] - s * 0.012); g.lineTo(b[0], b[1] - s * 0.012); g.stroke();
    }
    const piv = P(x, top, o.z);
    const amp = o.kind === 'noren' ? 0.03 : o.kind === 'laundry' ? 0.06 : 0.13;
    g.translate(piv[0], piv[1]);
    g.rotate(Math.sin(t * 2.4 + o.ph) * amp);
    g.translate(sx - piv[0], sy - piv[1]);
  } else if (o.kind === 'knife') {
    g.translate(sx, sy);
    // ずどん、ずどん
    const c = (t * 1.6 + o.ph) % 1;
    const lift = c < 0.55 ? Math.sin(c / 0.55 * Math.PI / 2) * 0.55 : Math.max(0, 1 - (c - 0.55) / 0.08) * 0.55;
    g.translate(0, -lift * s);
    if (c > 0.63 && c < 0.75) { oval(g, 0, lift * s, 0.45 * s, 0.07 * s, 'rgba(255,255,255,.35)'); }
  } else if (o.kind === 'cat') {
    g.translate(sx, sy);
    g.transform(1, 0, 0, 1 + Math.sin(t * 3 + o.ph) * 0.025, 0, 0);
  } else g.translate(sx, sy);
  g.drawImage(sp.c, -sp.ax * k, -sp.ay * k, sp.c.width * k, sp.c.height * k);
  if (o.kind === 'pot') {
    // 湯気
    for (let i = 0; i < 3; i++) {
      const c = (t * 0.6 + i / 3 + o.ph) % 1;
      oval(g, (Math.sin(c * 6 + i) * 0.08 + 0.18) * s, -(0.55 + c * 0.6) * s, (0.06 + c * 0.1) * s, (0.05 + c * 0.08) * s, `rgba(255,255,255,${0.45 * (1 - c)})`);
    }
  }
  g.restore();
}

function drawPickup(g, P, p, t, run) {
  const x = p.mx ?? p.lane * LANE_W;
  const bob = Math.sin(t * 4 + p.z) * 0.05;
  const [sx, sy, s] = P(x, p.y + bob - 0.2, p.z);
  const sp = sprite(p.kind);
  const k = s / S;
  const g0 = P(x, 0, p.z);
  oval(g, g0[0], g0[1], 0.16 * s, 0.035 * s, 'rgba(30,20,10,.2)');
  g.save();
  g.translate(sx, sy);
  if (p.kind === 'negi') g.scale(Math.max(0.25, Math.abs(Math.cos(t * 3 + p.z * 0.4))), 1);
  else g.rotate(Math.sin(t * 2 + p.z) * 0.2);
  g.drawImage(sp.c, -sp.ax * k, -sp.ay * k, sp.c.width * k, sp.c.height * k);
  g.restore();
}

function drawRunner(g, view, run, skin, fx, P, t, lap, glowOnly = false) {
  const [sx, sy, s] = P(run.dead ? run.dead.x : run.x, 0, run.d);
  fx.tofu.x = sx;
  fx.tofu.y = sy;
  fx.tofu.s = TOFU.w * s;
  for (const c of fx.chunks) c.floor ??= sy + (Math.random() - 0.3) * s * 0.3;
  if (glowOnly) {
    // 夜はとうふが少し光って見える
    oval(g, sx, sy - s * 0.4, s * 0.7, s * 0.6, rad(g, sx, sy - s * 0.4, 1, sx, sy - s * 0.4, s * 0.7, [[0, 'rgba(255,250,230,.18)'], [1, 'rgba(255,250,230,0)']]));
    return;
  }
  if (run.dead) {
    // 崩れたあとの水たまり
    const k = clamp(run.deadT * 3, 0, 1);
    oval(g, sx, sy, s * 0.55 * k, s * 0.13 * k, 'rgba(230,240,248,.55)');
    return;
  }
  if (run.invT > 0 && Math.floor(t * 16) % 2) g.globalAlpha = 0.5;
  g.save();
  g.translate(sx, sy);
  drawTofuBack(g, s, {
    skin, t, rel: run.x - fx.camX, hk: tofuHeight(run) / TOFU.h, lift: run.y * s, air: run.air ? 1 : 0, slide: run.slideT > 0,
    run: run.t * (8 + run.v * 0.5), sq: fx.sq + (run.slideT > 0 ? 0.25 : 0), lean: fx.lean,
  });
  // 氷のまもり・かつおぶし
  const cy = -run.y * s - s * 0.42;
  if (run.shield) {
    oval(g, 0, cy, s * 0.62, s * 0.6, rad(g, -s * 0.2, cy - s * 0.2, s * 0.05, 0, cy, s * 0.62, [[0, 'rgba(220,250,255,.08)'], [0.8, 'rgba(160,225,255,.22)'], [1, 'rgba(200,240,255,.55)']]));
    shine(g, -s * 0.25, cy - s * 0.3, s * 0.12, s * 0.05, 0.8, -0.6);
  }
  if (run.magnetT > 0) {
    const sp = sprite('katsuo');
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + i * TAU / 3;
      const k = s / S * 0.55;
      g.drawImage(sp.c, Math.cos(a) * s * 0.55 - sp.ax * k, cy + Math.sin(a) * s * 0.18 - sp.ay * k + s * 0.1, sp.c.width * k, sp.c.height * k);
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

// ---- タイトル画面（台所のまな板の上で、包丁ににらまれるとうふ） ----
export function drawTitle(g, view, skin, t, { knife = true } = {}) {
  const { W, H } = view;
  const run = { d: 0, x: 0, y: 0, t, v: 0, obs: [], picks: [], dead: null, slideT: 0, air: false, invT: 0, shield: false, magnetT: 0 };
  const fx = makeFx();
  // 背景と台所だけ描いて、とうふは正面向きで大きく
  const v2 = { ...view };
  drawScene(g, v2, run);
  const size = Math.min(W * 0.42, H * 0.24);
  const fy = H * 0.74;
  if (knife) {
    const sp = sprite('knife');
    const c = (t * 0.5) % 1;
    const lift = c < 0.8 ? 0 : Math.sin((c - 0.8) / 0.2 * Math.PI) * 0.04;
    const k = size * 1.15 / S;
    g.save();
    g.translate(W / 2 + size * 0.95, fy - size * 0.95 - lift * size * 4);
    g.rotate(-0.18);
    g.drawImage(sp.c, -sp.ax * k, -sp.ay * k, sp.c.width * k, sp.c.height * k);
    // ぎらり
    const gl = (t * 0.7) % 1;
    if (gl < 0.25) shine(g, -size * 0.05, -size * (0.2 + gl * 3), size * 0.08, size * 0.08, 0.9);
    g.restore();
  }
  drawTofuFront(g, W / 2 - (knife ? size * 0.12 : 0), fy, size, skin, 'panic', t);
  g.fillStyle = rad(g, W / 2, H * 0.55, Math.min(W, H) * 0.45, W / 2, H * 0.55, Math.max(W, H) * 0.85, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(20,10,0,.3)']]);
  g.fillRect(0, 0, W, H);
  void fx;
}
function drawScene(g, view, run) {
  const { W, H, F, cx, hor } = view;
  const camZ = run.d - CAM_BACK;
  const P = (x, y, z) => { const zr = Math.max(0.3, z - camZ); const s = F / zr; return [cx + x * s, hor + (CAM_H - y) * s, s]; };
  const bw = Math.max(Math.min(W, H * 0.62) * 1.6, W * 1.1);
  const bh = bw * BH / BW;
  g.fillStyle = FOG.kitchen;
  g.fillRect(0, 0, W, H);
  g.fillStyle = TOPC.kitchen;
  g.fillRect(0, 0, W, hor - bh + 6);
  g.drawImage(backdrop('kitchen'), cx - bw / 2, hor - bh + 4, bw, bh);
  for (let z = camZ + 60; z > camZ + 0.75; z -= 1) PAINT.kitchen(g, P, z - 1, z + 0.04, z - camZ < 34);
  for (let zz = 7; zz < 60; zz += 7) {
    const [sx, sy, s] = P(-2.0, 0, zz);
    const sp = sprite(['bottles', 'cooker', 'crock'][Math.floor(zz / 7) % 3]);
    const k = s / S;
    g.drawImage(sp.c, sx - sp.ax * k, sy - sp.ay * k, sp.c.width * k, sp.c.height * k);
  }
}

/** ランチャーの表紙（タイトルの構図。上は題名が重なるので窓と壁だけ） */
export function drawCover(g, w, h) {
  const view = makeView(w, h);
  view.hor = h * 0.5;
  drawTitle(g, view, 'kinu', 0.35);
}

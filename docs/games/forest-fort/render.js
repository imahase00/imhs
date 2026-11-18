// 森のとりで: 描画（Canvas 2D）
// 画像は1枚ずつ。歩く・攻撃・やられる動きはここで付ける（はずみ・傾き・反転・白い点滅・影）。
import {
  WORLD, MAP_IMG, CORE_POS, FORT, PADS, PAD_RADIUS, SPRITE, TOWERS, ALLIES, ENEMIES,
} from './data.js';
import { padState, heroStats } from './sim.js';

// ---- 画像の読み込み ----
const IDS = [
  'hero-1', 'hero-2', 'hero-3', 'hero-4', 'hero-1a', 'hero-2a', 'hero-3a', 'hero-4a',
  'rabbit', 'bear', 'squirrel', 'owl', 'rabbit-a', 'bear-a', 'squirrel-a', 'owl-a',
  'mushroom', 'wolf', 'crow', 'monkey', 'golem', 'caterpillar', 'wisp', 'boar',
  'core-1', 'core-2', 'core-3', 'core-4',
  'wall-h-1', 'wall-h-2', 'wall-h-3', 'wall-h-4', 'wall-v-1', 'wall-v-2', 'wall-v-3', 'wall-v-4',
  'tower-1', 'tower-2', 'tower-3', 'campfire', 'coin', 'pad', 'berry', 'arrows',
];
const img = {};
let mapImg = null;

export function loadImages() {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('画像を読み込めません: ' + src));
    im.src = src;
  });
  return Promise.all([
    load(MAP_IMG).then((im) => { mapImg = im; }),
    ...IDS.map((id) => load(SPRITE(id)).then((im) => { img[id] = im; })),
  ]);
}

// 白く光らせた版（被弾の点滅用）を必要になったときに作る
const flashCache = new Map();
function flashOf(id) {
  let c = flashCache.get(id);
  if (c) return c;
  const src = img[id];
  c = document.createElement('canvas');
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  flashCache.set(id, c);
  return c;
}

// ---- カメラ ----
export const VIEW = 900;   // 画面の短い辺に映る広さ（世界の単位）
export function makeCamera(cw, ch) {
  const scale = Math.min(cw, ch) / VIEW;
  return { scale, w: cw / scale, h: ch / scale, x: 0, y: 0 };
}
export function follow(cam, hero) {
  cam.x = Math.max(0, Math.min(WORLD.w - cam.w, hero.x - cam.w / 2));
  cam.y = Math.max(0, Math.min(WORLD.h - cam.h, hero.y - cam.h * 0.55));
  if (cam.w > WORLD.w) cam.x = (WORLD.w - cam.w) / 2;
  if (cam.h > WORLD.h) cam.y = (WORLD.h - cam.h) / 2;
}

// ---- 描画の部品 ----
function shadow(g, x, y, r) {
  g.fillStyle = 'rgba(40,30,15,0.28)';
  g.beginPath();
  g.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2);
  g.fill();
}

/**
 * 1枚絵のキャラクターを、足元(x,y)を基準に描く。
 * walk: 歩いた時間（はずみ・傾き）/ face: 1右 -1左 / attack: 攻撃の残り時間 / hurt: 被弾の残り時間
 */
function drawActor(g, id, x, y, size, { face = 1, walk = 0, moving = 0, attack = 0, hurt = 0, alpha = 1, fly = 0, t = 0 } = {}) {
  const im = img[id];
  if (!im) return;
  const bob = moving ? Math.abs(Math.sin(walk * 11)) * size * 0.06 : Math.sin(t * 2.2) * size * 0.012;
  const tilt = moving ? Math.sin(walk * 11) * 0.07 : 0;
  const lift = fly ? size * 0.35 + Math.sin(t * 6) * size * 0.06 : 0;
  // 攻撃の瞬間は前に縮んで伸びる
  const sq = attack > 0 ? 1 + Math.sin((attack / 0.2) * Math.PI) * 0.08 : 1;
  shadow(g, x, y, size * (fly ? 0.22 : 0.3));
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y - bob - lift);
  g.rotate(tilt);
  g.scale(face * sq, 2 - sq);
  const src = hurt > 0 && Math.floor(hurt * 30) % 2 === 0 ? flashOf(id) : im;
  g.drawImage(src, -size / 2, -size, size, size);
  g.restore();
}

function hpBar(g, x, y, w, ratio, color = '#e0563f') {
  if (ratio >= 0.999) return;
  g.fillStyle = 'rgba(30,20,10,0.55)';
  g.fillRect(x - w / 2 - 2, y - 2, w + 4, 10);
  g.fillStyle = color;
  g.fillRect(x - w / 2, y, w * Math.max(0, ratio), 6);
}

// ---- 1フレームの描画 ----
export function draw(g, cam, w, ui) {
  const { scale } = cam;
  g.save();
  g.setTransform(ui.dpr * scale, 0, 0, ui.dpr * scale, -cam.x * scale * ui.dpr, -cam.y * scale * ui.dpr);
  // 地面（マップ画像1px = 世界2単位）
  if (mapImg) {
    const sx = Math.max(0, cam.x / 2);
    const sy = Math.max(0, cam.y / 2);
    const sw = Math.min(mapImg.naturalWidth - sx, cam.w / 2 + 2);
    const sh = Math.min(mapImg.naturalHeight - sy, cam.h / 2 + 2);
    g.drawImage(mapImg, sx, sy, sw, sh, sx * 2, sy * 2, sw * 2, sh * 2);
  }
  const t = w.t;
  // 台座（地面に置く）
  for (const p of PADS) drawPad(g, w, p, t);
  // ボスの予告
  for (const te of w.tele) drawTele(g, te);
  // 奥行き順に並べて描く
  const items = [];
  const S = w.save;
  // 柵（4辺）
  for (const side of ['n', 's', 'w', 'e']) items.push(...wallPieces(g, w, side));
  // 砦の中心
  const clv = w.core.level;
  items.push({ y: CORE_POS.y + 40, draw: () => {
    shadow(g, CORE_POS.x, CORE_POS.y + 40, 150);
    const size = 300 + clv * 20;
    const src = w.core.hurtT > 0 ? flashOf(`core-${clv}`) : img[`core-${clv}`];
    if (src) g.drawImage(src, CORE_POS.x - size / 2, CORE_POS.y + 50 - size, size, size);
    hpBar(g, CORE_POS.x, CORE_POS.y - size + 30, 160, w.core.hp / w.core.max, '#f0b23a');
  } });
  if (clv >= 2) {
    items.push({ y: CORE_POS.y + 95, draw: () => {
      const fl = 1 + Math.sin(t * 9) * 0.04;
      g.drawImage(img.campfire, CORE_POS.x + 120, CORE_POS.y + 95 - 80 * fl, 90, 80 * fl);
    } });
  }
  // 見張り台
  for (const tw of w.towers) {
    items.push({ y: tw.y + 10, draw: () => {
      const def = TOWERS[tw.level];
      shadow(g, tw.x, tw.y + 10, 55);
      const size = tw.level === 3 ? 150 : 190;
      g.drawImage(img[def.sprite], tw.x - size / 2, tw.y + 16 - size, size, size);
    } });
  }
  // 仲間
  for (const a of w.allies) {
    if (a.deadT > 0) continue;
    items.push({ y: a.y, draw: () => {
      const size = a.type === 'bear' ? 112 : 96;
      drawActor(g, a.attackT > 0 ? `${a.type}-a` : a.type, a.x, a.y, size, {
        face: a.face, walk: a.walkT, moving: a.moving, attack: a.attackT, hurt: a.hurtT, t: t + a.idx,
      });
      hpBar(g, a.x, a.y - size - 8, 50, a.hp / a.maxHp, '#6fbf4a');
    } });
  }
  // 敵
  for (const e of w.enemies) {
    items.push({ y: e.y, draw: () => {
      if (e.elite) {
        g.fillStyle = 'rgba(190,60,255,0.18)';
        g.beginPath(); g.ellipse(e.x, e.y, e.size * 0.45, e.size * 0.18, 0, 0, Math.PI * 2); g.fill();
      }
      drawActor(g, e.type, e.x, e.y, e.size, {
        face: e.face, walk: e.walkT, moving: 1, attack: e.attackT, hurt: e.hurtT, fly: e.flying ? 1 : 0, t: t + e.id,
        alpha: e.trickle ? 0.92 : 1,
      });
      if (e.boss || e.elite) hpBar(g, e.x, e.y - e.size - 6, e.size * 0.7, e.hp / e.max, '#b44be0');
      else hpBar(g, e.x, e.y - e.size - 4, 40, e.hp / e.max);
    } });
  }
  // 主人公
  const h = w.hero;
  if (h.deadT <= 0) {
    items.push({ y: h.y, draw: () => {
      const lv = heroStats(S).weaponLevel;
      drawActor(g, h.attackT > 0 ? `hero-${lv}a` : `hero-${lv}`, h.x, h.y, 118, {
        face: h.face, walk: h.walkT, moving: h.moving, attack: h.attackT, hurt: h.hurtT, t,
      });
    } });
  }
  // コイン
  for (const p of w.pickups) {
    items.push({ y: p.y, draw: () => {
      const s = 34;
      const b = p.fly ? 0 : Math.abs(Math.sin(p.t * 5 + p.x)) * 6;
      if (!p.fly) shadow(g, p.x, p.y, 10);
      g.drawImage(img.coin, p.x - s / 2, p.y - s - b, s, s);
    } });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  // 弾
  for (const s of w.shots) drawShot(g, s);
  // 効果
  for (const f of w.fx) drawFx(g, f);
  // 夜
  if (w.phase === 'wave') drawNight(g, cam, w, ui);
  g.restore();
  if (w.phase === 'wave') drawOffscreen(g, cam, w, ui);
}

// 画面の外にいる敵の方向を、画面の端の矢印と数で示す（8方向にまとめる）
function drawOffscreen(g, cam, w, ui) {
  const cw = cam.w * cam.scale;
  const ch = cam.h * cam.scale;
  const cx = cw / 2;
  const cy = ch / 2;
  const groups = new Map();
  for (const e of w.enemies) {
    if (e.trickle) continue;
    const sx = (e.x - cam.x) * cam.scale;
    const sy = (e.y - cam.y) * cam.scale;
    if (sx > 0 && sx < cw && sy > 0 && sy < ch) continue;
    const ang = Math.atan2(sy - cy, sx - cx);
    const k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    const gr = groups.get(k) ?? { n: 0, boss: false };
    gr.n++;
    gr.boss ||= e.boss || e.elite;
    groups.set(k, gr);
  }
  if (!groups.size) return;
  g.save();
  g.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
  const top = 110;       // 上の操作パネルと重ならないように
  const bottom = 40;
  for (const [k, gr] of groups) {
    const ang = k * Math.PI / 4;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    // 画面の端（余白つき）との交点
    const mx = cw / 2 - 26;
    const myTop = cy - top;
    const myBot = ch - cy - bottom;
    const tx = dx !== 0 ? mx / Math.abs(dx) : Infinity;
    const ty = dy < 0 ? myTop / -dy : dy > 0 ? myBot / dy : Infinity;
    const s = Math.min(tx, ty);
    const x = cx + dx * s;
    const y = cy + dy * s;
    const size = Math.min(30, 16 + gr.n * 1.2);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = gr.boss ? 'rgba(200,60,230,0.92)' : 'rgba(220,70,50,0.9)';
    g.strokeStyle = 'rgba(255,245,220,0.95)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(size, 0);
    g.lineTo(-size * 0.6, -size * 0.7);
    g.lineTo(-size * 0.3, 0);
    g.lineTo(-size * 0.6, size * 0.7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.font = '800 14px "Hiragino Maru Gothic ProN", "BIZ UDPGothic", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lx = x - dx * (size + 14);
    const ly = y - dy * (size + 14);
    g.fillStyle = 'rgba(40,30,15,0.8)';
    g.beginPath(); g.arc(lx, ly, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff6d8';
    g.fillText(String(gr.n), lx, ly + 1);
  }
  g.restore();
}

function wallPieces(g, w, side) {
  const wall = w.walls[side];
  const lv = wall.level;
  const broken = wall.hp <= 0;
  const out = [];
  const horiz = side === 'n' || side === 's';
  const im = img[`wall-${horiz ? 'h' : 'v'}-${lv}`];
  if (!im) return out;
  const ar = im.naturalWidth / im.naturalHeight;
  if (horiz) {
    const y = side === 'n' ? FORT.y1 : FORT.y2;
    const hgt = 70;
    const seg = hgt * ar;
    const n = Math.max(1, Math.round((FORT.x2 - FORT.x1) / seg));
    const segW = (FORT.x2 - FORT.x1) / n;
    for (let k = 0; k < n; k++) {
      const x = FORT.x1 + k * segW;
      out.push({ y: y + 6, draw: () => drawWallImg(g, wall, im, x, y + 8 - hgt, segW, hgt, broken) });
    }
    out.push({ y: y + 7, draw: () => hpBar(g, (FORT.x1 + FORT.x2) / 2, y - 90, 120, wall.hp / wall.max, '#c99a4a') });
  } else {
    const x = side === 'w' ? FORT.x1 : FORT.x2;
    const wid = 34;
    const seg = wid / ar;
    const n = Math.max(1, Math.round((FORT.y2 - FORT.y1) / seg));
    const segH = (FORT.y2 - FORT.y1) / n;
    for (let k = 0; k < n; k++) {
      const y = FORT.y1 + k * segH;
      out.push({ y: y + segH, draw: () => drawWallImg(g, wall, im, x - wid / 2, y - 20, wid, segH + 20, broken) });
    }
    out.push({ y: FORT.y2, draw: () => hpBar(g, x, (FORT.y1 + FORT.y2) / 2, 80, wall.hp / wall.max, '#c99a4a') });
  }
  return out;
}
function drawWallImg(g, wall, im, x, y, wd, ht, broken) {
  g.save();
  if (broken) g.globalAlpha = 0.28;
  else if (wall.hurtT > 0) g.globalAlpha = 0.75;
  g.drawImage(im, x, y, wd, ht);
  g.restore();
}

function drawPad(g, w, p, t) {
  const st = padState(w.save, p);
  if (!st.visible) return;
  const on = w.hero.onPad === p.id;
  const r = PAD_RADIUS;
  g.save();
  g.globalAlpha = st.max ? 0.45 : 1;
  g.drawImage(img.pad, p.x - r, p.y - r * 0.7, r * 2, r * 1.4);
  if (!st.max) {
    // 進み具合の輪
    const ratio = st.paid / st.cost;
    g.lineWidth = 8;
    g.strokeStyle = on ? 'rgba(255,215,90,0.95)' : 'rgba(255,240,190,0.55)';
    g.beginPath();
    g.ellipse(p.x, p.y, r * 0.86, r * 0.56, 0, 0, Math.PI * 2);
    g.stroke();
    if (ratio > 0) {
      g.strokeStyle = '#ffcf3a';
      g.beginPath();
      g.ellipse(p.x, p.y, r * 0.86, r * 0.56, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      g.stroke();
    }
    if (on) {
      g.globalAlpha = 0.25 + Math.sin(t * 6) * 0.1;
      g.fillStyle = '#ffe58a';
      g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.65, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      // 立ち止まってから支払いが始まるまでの輪（白）
      const c = w.hero.padCharge ?? 0;
      if (c > 0 && c < 1) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 10;
        g.beginPath();
        g.ellipse(p.x, p.y, r * 1.02, r * 0.68, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c);
        g.stroke();
      }
    }
  }
  // 何が強くなるかの絵
  const icon = padIcon(p, st.level);
  if (icon && img[icon]) {
    const s = p.kind === 'wall' ? 80 : 74;
    const ar = img[icon].naturalWidth / img[icon].naturalHeight;
    const iw = ar >= 1 ? s : s * ar;
    const ih = ar >= 1 ? s / ar : s;
    g.globalAlpha = st.max ? 0.6 : 0.95;
    g.drawImage(img[icon], p.x - iw / 2, p.y - 10 - ih, iw, ih);
  }
  g.restore();
  // 残りの費用
  if (!st.max) {
    const left = st.cost - st.paid;
    label(g, `${left}`, p.x, p.y + r * 0.55 + 22, true);
  }
}
function padIcon(p, level) {
  const next = Math.min(level + 1, p.cost.length);
  switch (p.kind) {
    case 'core': return `core-${Math.min(4, next)}`;
    case 'weapon': return `hero-${Math.min(4, next)}`;
    case 'wall': return `wall-h-${Math.min(4, next)}`;
    case 'ally': return p.ally;
    case 'tower': return TOWERS[Math.min(3, next)].sprite;
    case 'smith': return 'arrows';
    case 'stat': return p.stat === 'hp' ? 'berry' : p.stat === 'magnet' ? 'coin' : 'hero-1';
    default: return null;
  }
}

function label(g, text, x, y, coin) {
  g.save();
  g.font = '700 30px "Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const tw = g.measureText(text).width + (coin ? 34 : 0);
  g.fillStyle = 'rgba(40,30,15,0.72)';
  const bx = x - tw / 2 - 12;
  roundRect(g, bx, y - 21, tw + 24, 42, 21);
  g.fill();
  if (coin && img.coin) g.drawImage(img.coin, bx + 10, y - 15, 30, 30);
  g.fillStyle = '#fff6d8';
  g.fillText(text, x + (coin ? 17 : 0), y + 1);
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawTele(g, te) {
  const k = Math.min(1, te.t / te.life);
  g.save();
  g.globalAlpha = te.t > te.life ? Math.max(0, 1 - (te.t - te.life) / 0.3) * 0.5 : 0.25 + k * 0.35;
  g.fillStyle = '#e8402a';
  g.strokeStyle = '#ffdddd';
  g.lineWidth = 4;
  if (te.kind === 'circle') {
    g.beginPath(); g.ellipse(te.x, te.y, te.r, te.r * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.8;
    g.beginPath(); g.ellipse(te.x, te.y, te.r * k, te.r * 0.62 * k, 0, 0, Math.PI * 2); g.stroke();
  } else {
    g.translate(te.x, te.y);
    g.rotate(Math.atan2(te.dy, te.dx));
    g.fillRect(0, -te.width / 2, te.len, te.width);
    g.globalAlpha = 0.8;
    g.strokeRect(0, -te.width / 2, te.len * k, te.width);
  }
  g.restore();
}

function drawShot(g, s) {
  const a = Math.atan2(s.vy, s.vx);
  g.save();
  g.translate(s.x, s.y);
  g.rotate(a);
  switch (s.kind) {
    case 'arrow':
    case 'bolt':
      g.strokeStyle = s.kind === 'bolt' ? '#5a3a1a' : '#7a5230';
      g.lineWidth = s.kind === 'bolt' ? 6 : 4;
      g.beginPath(); g.moveTo(-28, 0); g.lineTo(10, 0); g.stroke();
      g.fillStyle = '#d8d8d8';
      g.beginPath(); g.moveTo(16, 0); g.lineTo(6, -6); g.lineTo(6, 6); g.fill();
      g.fillStyle = '#f2efe6';
      g.fillRect(-30, -5, 8, 10);
      break;
    case 'bullet':
      g.fillStyle = '#f6d36a';
      g.beginPath(); g.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.ellipse(-16, 0, 14, 5, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'stone':
      g.fillStyle = '#8b8378';
      g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
      break;
    case 'shell':
      g.fillStyle = '#3b352c';
      g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
      break;
    case 'acorn':
      g.fillStyle = '#8a5a2b';
      g.beginPath(); g.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5b3b1b';
      g.fillRect(-10, -8, 8, 16);
      break;
    default:
  }
  g.restore();
}

function drawFx(g, f) {
  const k = f.t / f.life;
  g.save();
  switch (f.kind) {
    case 'poof':
      g.globalAlpha = 1 - k;
      g.fillStyle = '#efe6ff';
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const r = f.size * 0.25 * (0.4 + k);
        g.beginPath(); g.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6, f.size * 0.12 * (1 - k * 0.5), 0, Math.PI * 2); g.fill();
      }
      break;
    case 'swing':
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#fff6d0';
      g.lineWidth = 8;
      g.beginPath(); g.arc(f.x - f.face * 30, f.y, 60, f.face > 0 ? -1.2 : Math.PI - 0.4, f.face > 0 ? 0.4 : Math.PI + 1.2); g.stroke();
      break;
    case 'boom':
      g.globalAlpha = (1 - k) * 0.7;
      g.fillStyle = '#ffc860';
      g.beginPath(); g.ellipse(f.x, f.y, f.r * (0.5 + k * 0.5), f.r * 0.6 * (0.5 + k * 0.5), 0, 0, Math.PI * 2); g.fill();
      break;
    case 'shock':
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#ffe0b0';
      g.lineWidth = 10;
      g.beginPath(); g.ellipse(f.x, f.y, f.r * (0.6 + k * 0.5), f.r * 0.62 * (0.6 + k * 0.5), 0, 0, Math.PI * 2); g.stroke();
      break;
    case 'heal':
      g.globalAlpha = 1 - k;
      g.fillStyle = '#7ee08a';
      g.font = '700 34px sans-serif';
      g.textAlign = 'center';
      g.fillText('+', f.x, f.y - k * 40);
      break;
    case 'build':
      g.globalAlpha = 1 - k;
      g.fillStyle = '#d9c08a';
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        const r = 40 + k * 90;
        g.beginPath(); g.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.5, 16 * (1 - k), 0, Math.PI * 2); g.fill();
      }
      break;
    default:
  }
  g.restore();
}

// 夜: 画面全体を暗くし、たき火・主人公・見張り台のまわりだけ明るく
let nightCanvas = null;
function drawNight(g, cam, w, ui) {
  const cw = Math.ceil(cam.w * cam.scale);
  const ch = Math.ceil(cam.h * cam.scale);
  if (!nightCanvas) nightCanvas = document.createElement('canvas');
  if (nightCanvas.width !== cw || nightCanvas.height !== ch) { nightCanvas.width = cw; nightCanvas.height = ch; }
  const n = nightCanvas.getContext('2d');
  n.globalCompositeOperation = 'source-over';
  n.clearRect(0, 0, cw, ch);
  n.fillStyle = 'rgba(18,24,60,0.5)';
  n.fillRect(0, 0, cw, ch);
  n.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r) => {
    const sx = (x - cam.x) * cam.scale;
    const sy = (y - cam.y) * cam.scale;
    const sr = r * cam.scale;
    const gr = n.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr);
    gr.addColorStop(0, 'rgba(0,0,0,0.9)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = gr;
    n.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  };
  hole(CORE_POS.x, CORE_POS.y, 420 + Math.sin(w.t * 8) * 10);
  if (w.hero.deadT <= 0) hole(w.hero.x, w.hero.y - 40, 260);
  for (const tw of w.towers) hole(tw.x, tw.y - 60, 220);
  g.save();
  g.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
  g.drawImage(nightCanvas, 0, 0, cw, ch);
  g.restore();
}

export { ALLIES, ENEMIES };

// 漂流発明記: 描画（Canvas 2D）
// 地面は5マス四方の塊ごとに一度だけ描いてためておき、毎フレームはそれを貼るだけにする（iPhone でも軽く）。
import {
  CELL, GRID, WORLD, MAP, GROUND_OF, GATES, NODES, NODE_KINDS, LANDMARKS, SPRITE, GROUND, ITEM_IDS, RECIPES, POWER,
  BELT, BOTS, BROKEN_BOTS, OUTPUT_CAP, SHIP,
} from './data.js';
import {
  machineOf, buildingById, isPowered, stocked, reachable, gateCenter, questTarget, shipFrameBuilt, charAt, nodeById,
} from './sim.js';

// ---- 画像 ----
const SPRITES = [
  'hero', 'hero-walk', 'hero-carry', 'hero-pick', 'hero-axe', 'hero-fix', 'hero-plan', 'hero-joy',
  'bot-broken', 'bot-carry', 'bot-miner', 'bot-drone', 'keeper', 'crab', 'gull', 'lizard',
  ...ITEM_IDS,
  'n-tree', 'n-rock', 'n-copper', 'n-iron', 'n-coal', 'n-cotton', 'n-crate', 'n-log',
  'm-bench', 'm-store', 'm-handdrill', 'm-boiler', 'm-drill', 'm-saw', 'm-furnace', 'm-lift',
  'm-roller', 'm-assembler', 'm-loom', 'm-bigdrill', 'm-bigassembler', 'm-warehouse', 'm-station', 'm-console',
  'wreck', 'lab', 'bridge-broken', 'bridge', 'reactor-off', 'reactor-on', 'dock', 'ship-frame',
];
const GROUNDS = ['grass', 'sand', 'dirt', 'rock', 'tiles', 'sea'];
const img = {};
const ground = {};
export function loadImages(extra = []) {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('画像を読み込めません: ' + src));
    im.src = src;
  });
  return Promise.all([
    ...SPRITES.map((id) => load(SPRITE(id)).then((im) => { img[id] = im; })),
    ...GROUNDS.map((id) => load(GROUND(id)).then((im) => { ground[id] = im; })),
    ...extra.map((src) => load(src)),
  ]);
}
export const spriteImg = (id) => img[id];

// ---- カメラ ----
export const VIEW = 1000;   // 画面の短い辺に映る広さ
export function makeCamera(cw, ch) {
  const scale = Math.min(cw, ch) / VIEW;
  return { scale, w: cw / scale, h: ch / scale, x: 0, y: 0, cw, ch };
}
export function follow(cam, hero, snap = false) {
  const tx = Math.max(0, Math.min(WORLD.w - cam.w, hero.x - cam.w / 2));
  const ty = Math.max(0, Math.min(WORLD.h - cam.h, hero.y - cam.h * 0.52));
  if (snap) { cam.x = tx; cam.y = ty; return; }
  cam.x += (tx - cam.x) * 0.2;
  cam.y += (ty - cam.y) * 0.2;
}
export const toWorld = (cam, sx, sy) => ({ x: cam.x + sx / cam.scale, y: cam.y + sy / cam.scale });

// ---- 地面（塊ごとに作り置き）----
const CHUNK = CELL * 5;
const CHUNK_PX = 560;    // 1塊の画素数（1000単位を560px）
const chunkCache = new Map();
let chunkKey = '';
const ORDER = ['sand', 'grass', 'rock', 'tiles', 'dirt'];
export function resetGround() { chunkCache.clear(); }
function makeChunk(ci, cj) {
  const c = document.createElement('canvas');
  c.width = CHUNK_PX;
  c.height = CHUNK_PX;
  const g = c.getContext('2d');
  const s = CHUNK_PX / CHUNK;
  const x0 = ci * CHUNK;
  const y0 = cj * CHUNK;
  g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
  const pat = (id) => {
    const p = g.createPattern(ground[id], 'repeat');
    try { p.setTransform(new DOMMatrix().scale(420 / 256)); } catch { /* 古い環境ではそのまま */ }
    return p;
  };
  g.fillStyle = pat('sea');
  g.fillRect(x0, y0, CHUNK, CHUNK);
  const cx1 = Math.floor(x0 / CELL) - 1;
  const cy1 = Math.floor(y0 / CELL) - 1;
  for (const type of ORDER) {
    const isType = (cx, cy) => { const ch = charAt(cx, cy); return GROUND_OF[ch] === type && ch !== 'C' && ch !== 'L' && ch !== 'b'; };
    if (type === 'dirt') {
      // 道: となりの道のマスと太い線でつなぐ
      g.strokeStyle = pat('dirt');
      g.lineWidth = CELL * 0.62;
      g.lineCap = 'round';
      g.beginPath();
      for (let cy = cy1; cy <= cy1 + 6; cy++) {
        for (let cx = cx1; cx <= cx1 + 6; cx++) {
          if (!isType(cx, cy)) continue;
          const px = cx * CELL + CELL / 2;
          const py = cy * CELL + CELL / 2;
          let any = false;
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            if (isType(cx + dx, cy + dy)) { g.moveTo(px, py); g.lineTo(px + dx * CELL, py + dy * CELL); any = true; }
          }
          if (!any) { g.moveTo(px, py); g.lineTo(px + 0.1, py); }
          // 広場（まわりも道ばかりのマス）は四角く塗る
          let around = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isType(cx + dx, cy + dy)) around++;
          if (around >= 5) { g.moveTo(px - CELL * 0.62, py - CELL * 0.62); g.lineTo(px + CELL * 0.62, py - CELL * 0.62); g.lineTo(px + CELL * 0.62, py + CELL * 0.62); g.lineTo(px - CELL * 0.62, py + CELL * 0.62); g.closePath(); }
        }
      }
      g.fillStyle = pat('dirt');
      g.fill();
      g.stroke();
      continue;
    }
    g.beginPath();
    for (let cy = cy1; cy <= cy1 + 6; cy++) {
      for (let cx = cx1; cx <= cx1 + 6; cx++) {
        if (!isType(cx, cy)) continue;
        const px = cx * CELL + CELL / 2;
        const py = cy * CELL + CELL / 2;
        const r = CELL * 0.74;
        g.moveTo(px + r, py);
        g.arc(px, py, r, 0, Math.PI * 2);
      }
    }
    if (type === 'sand') {
      // 波打ち際の白い泡（先に太く描いて、上から砂で塗ると外周だけ残る）
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 26;
      g.stroke();
    }
    g.fillStyle = pat(type);
    g.fill();
  }
  // 崖
  for (let cy = cy1; cy <= cy1 + 6; cy++) {
    for (let cx = cx1; cx <= cx1 + 6; cx++) {
      const ch = charAt(cx, cy);
      if (ch !== 'C' && ch !== 'L') continue;
      const px = cx * CELL;
      const py = cy * CELL;
      g.fillStyle = pat('rock');
      g.fillRect(px - 2, py - 30, CELL + 4, CELL + 30);
      const gr = g.createLinearGradient(0, py, 0, py + CELL);
      gr.addColorStop(0, 'rgba(30,25,20,0.05)');
      gr.addColorStop(1, 'rgba(30,25,20,0.55)');
      g.fillStyle = gr;
      g.fillRect(px - 2, py, CELL + 4, CELL);
    }
  }
  return c;
}
function drawGround(g, cam) {
  const ci1 = Math.max(0, Math.floor(cam.x / CHUNK));
  const cj1 = Math.max(0, Math.floor(cam.y / CHUNK));
  const ci2 = Math.min(GRID / 5 - 1, Math.floor((cam.x + cam.w) / CHUNK));
  const cj2 = Math.min(GRID / 5 - 1, Math.floor((cam.y + cam.h) / CHUNK));
  const used = [];
  for (let j = cj1; j <= cj2; j++) {
    for (let i = ci1; i <= ci2; i++) {
      const k = `${i},${j}`;
      let c = chunkCache.get(k);
      if (!c) { c = makeChunk(i, j); chunkCache.set(k, c); }
      used.push(k);
      g.drawImage(c, i * CHUNK, j * CHUNK, CHUNK + 1, CHUNK + 1);
    }
  }
  // 遠くの塊は捨てる（メモリを使いすぎない）
  const key = used.join('|');
  if (key !== chunkKey) {
    chunkKey = key;
    if (chunkCache.size > 20) for (const k of [...chunkCache.keys()]) if (!used.includes(k)) chunkCache.delete(k);
  }
}

// ---- 部品 ----
function shadow(g, x, y, r) {
  g.fillStyle = 'rgba(30,25,15,0.28)';
  g.beginPath();
  g.ellipse(x, y, r, r * 0.36, 0, 0, Math.PI * 2);
  g.fill();
}
function sprite(g, id, x, y, size, { face = 1, bob = 0, rot = 0, alpha = 1, sx = 1, sy = 1 } = {}) {
  const im = img[id];
  if (!im) return;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y - bob);
  if (rot) g.rotate(rot);
  g.scale(face * sx, sy);
  g.drawImage(im, -size / 2, -size, size, size);
  g.restore();
}
function itemIcon(g, item, x, y, s = 40) {
  const im = img[item];
  if (im) g.drawImage(im, x - s / 2, y - s / 2, s, s);
}
function badge(g, x, y, text, bg = 'rgba(40,28,15,0.85)') {
  g.font = '800 26px "Hiragino Maru Gothic ProN", "BIZ UDPGothic", sans-serif';
  const w = Math.max(34, g.measureText(text).width + 18);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x - w / 2, y - 17, w, 34, 17);
  g.fill();
  g.fillStyle = '#fff3d6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 1);
}
const total = (o) => (o ? Object.values(o).reduce((a, b) => a + b, 0) : 0);

// ---- 決まった木（深い森のマス）----
const FOREST_TREES = [];
for (let cy = 0; cy < GRID; cy++) {
  for (let cx = 0; cx < GRID; cx++) {
    if (MAP[cy][cx] !== 'F') continue;
    for (let k = 0; k < 2; k++) {
      const hsh = Math.sin(cx * 12.9898 + cy * 78.233 + k * 37.7) * 43758.5453;
      const f = hsh - Math.floor(hsh);
      FOREST_TREES.push({ x: cx * CELL + 40 + k * 110 + f * 30, y: cy * CELL + 70 + f * 90 + k * 30, s: 220 + f * 60 });
    }
  }
}

// ---- 描画の本体 ----
export function draw(g, cam, w, ui) {
  const s = w.save;
  const t = w.t;
  g.save();
  g.setTransform(cam.scale * ui.dpr, 0, 0, cam.scale * ui.dpr, -cam.x * cam.scale * ui.dpr, -cam.y * cam.scale * ui.dpr);
  drawGround(g, cam);
  const inView = (x, y, m = 300) => x > cam.x - m && x < cam.x + cam.w + m && y > cam.y - m && y < cam.y + cam.h + m;

  // 蒸気の届く範囲（ボイラーが燃えている間、うっすら）
  if (!s.reactorOn) {
    for (const b of s.buildings) {
      if (b.type !== 'boiler' || !(b.burn > 0 || ui.build)) continue;
      if (!inView(b.x, b.y, POWER.radius)) continue;
      g.save();
      g.globalAlpha = b.burn > 0 ? 0.5 : 0.25;
      g.strokeStyle = '#fff4c8';
      g.lineWidth = 6;
      g.setLineDash([26, 22]);
      g.lineDashOffset = -t * 30;
      g.beginPath();
      g.ellipse(b.x, b.y, POWER.radius, POWER.radius * 0.92, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = b.burn > 0 ? 0.07 : 0.03;
      g.fillStyle = '#fff4c8';
      g.fill();
      g.restore();
    }
  }

  // ベルト
  for (const l of s.links) {
    const a = buildingById(w, l.from);
    const b = buildingById(w, l.to);
    if (!a || !b) continue;
    if (!inView((a.x + b.x) / 2, (a.y + b.y) / 2, Math.hypot(a.x - b.x, a.y - b.y) / 2 + 200)) continue;
    drawBelt(g, a, b, l, t, ui.selLink === l.id);
  }
  for (const it of w.beltItems) {
    const l = s.links.find((x) => x.id === it.link);
    const a = l && buildingById(w, l.from);
    const b = l && buildingById(w, l.to);
    if (!a || !b) continue;
    const k = it.d / it.len;
    itemIcon(g, it.item, a.x + (b.x - a.x) * k, a.y - 10 + (b.y - a.y) * k, 44);
  }

  // 並べて描く物を集める（下にあるものほど手前）
  const list = [];
  for (const n of NODES) if (inView(n.x, n.y)) list.push({ y: n.y, f: () => drawNode(g, n) });
  for (const tr of FOREST_TREES) if (inView(tr.x, tr.y)) list.push({ y: tr.y, f: () => sprite(g, 'n-tree', tr.x, tr.y, tr.s) });
  for (const [k, l] of Object.entries(LANDMARKS)) {
    if (!inView(l.x, l.y, 500)) continue;
    if (k === 'dock') list.push({ y: l.y - 200, f: () => drawDock(g, w, l, t) });
    else if (k === 'reactor') list.push({ y: l.y, f: () => { shadow(g, l.x, l.y, l.radius); sprite(g, s.reactorOn ? l.spriteOn : l.sprite, l.x, l.y + 40, l.size); if (s.reactorOn) steam(g, l.x - 40, l.y - l.size + 80, t, 1.4); } });
    else if (k === 'wreck') list.push({ y: l.y, f: () => { shadow(g, l.x, l.y, l.radius * 1.3); sprite(g, l.sprite, l.x, l.y + 60, l.size); } });
    else list.push({ y: l.y, f: () => { shadow(g, l.x, l.y, l.radius); sprite(g, l.sprite, l.x, l.y + 50, l.size); } });
  }
  for (const gt of GATES) {
    const c = gateCenter(gt);
    if (!inView(c.x, c.y)) continue;
    const open = !!s.gates[gt.id];
    if (gt.id === 'log' && !open) list.push({ y: c.y + 40, f: () => sprite(g, 'n-log', c.x, c.y + 70, 230) });
    if (gt.id.startsWith('bridge')) list.push({ y: c.y - 60, f: () => sprite(g, open ? 'bridge' : 'bridge-broken', c.x, c.y + 90, 300) });
    if (gt.id === 'lift' && open) list.push({ y: c.y + 80, f: () => sprite(g, 'm-lift', c.x, c.y + 110, 230) });
  }
  for (const b of s.buildings) if (inView(b.x, b.y)) list.push({ y: b.y + (b.node ? 5 : 0), f: () => drawBuilding(g, w, b, t, ui) });
  for (const bb of BROKEN_BOTS) {
    if (s.fixed.includes(bb.id) || !inView(bb.x, bb.y)) continue;
    list.push({ y: bb.y, f: () => { shadow(g, bb.x, bb.y, 40); sprite(g, 'bot-broken', bb.x, bb.y + 8, 120); sparkle(g, bb.x + 30, bb.y - 90, t); } });
  }
  for (const d of s.drift) if (inView(d.x, d.y)) list.push({ y: d.y, f: () => { shadow(g, d.x, d.y, 45); sprite(g, 'n-crate', d.x, d.y + 6 + Math.sin(t * 2 + d.x) * 4, 110); sparkle(g, d.x + 30, d.y - 90, t); } });
  for (const c of w.critters) if (inView(c.x, c.y)) list.push({ y: c.y, f: () => drawCritter(g, c, t) });
  for (const bot of w.bots) if (inView(bot.x, bot.y)) list.push({ y: bot.y, f: () => drawBot(g, bot, t) });
  list.push({ y: w.hero.y, f: () => drawHero(g, w, t) });
  list.sort((a, b) => a.y - b.y);
  for (const o of list) o.f();

  // 浮かぶ効果
  for (const f of w.fx) {
    if (f.kind === 'pop') {
      const k = f.t / f.life;
      g.globalAlpha = 1 - k;
      itemIcon(g, f.item, f.x, f.y - k * 60, 52);
      g.globalAlpha = 1;
    }
  }

  // 霧（まだ行けない陸地）
  drawFog(g, cam, w, t);

  // 置く場所の目安
  if (ui.ghost) drawGhost(g, w, ui.ghost, t);
  if (ui.linkFrom) {
    const a = buildingById(w, ui.linkFrom);
    if (a) {
      g.save();
      g.strokeStyle = 'rgba(255,240,200,0.9)';
      g.lineWidth = 8;
      g.setLineDash([20, 14]);
      g.lineDashOffset = -t * 60;
      g.beginPath();
      g.arc(a.x, a.y - 40, 90, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }
  if (ui.sel) {
    const b = buildingById(w, ui.sel);
    if (b) {
      g.save();
      g.strokeStyle = 'rgba(255,230,140,0.95)';
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(b.x, b.y, machineOf(b.type).radius + 30, (machineOf(b.type).radius + 30) * 0.45, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }
  g.restore();
  drawQuestArrow(g, cam, w, ui, t);
}

function drawBelt(g, a, b, l, t, sel) {
  const lv = BELT.levels[l.lv];
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = sel ? 'rgba(255,230,140,0.9)' : 'rgba(40,28,18,0.55)';
  g.lineWidth = 44;
  g.beginPath(); g.moveTo(a.x, a.y - 10); g.lineTo(b.x, b.y - 10); g.stroke();
  g.strokeStyle = l.lv ? '#7d8790' : '#8a6038';
  g.lineWidth = 32;
  g.stroke();
  g.strokeStyle = l.lv ? '#c8d0d6' : '#c99a5e';
  g.lineWidth = 26;
  g.setLineDash([8, 18]);
  g.lineDashOffset = -t * lv.speed;
  g.stroke();
  // 向きの矢印
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 - 10;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  g.setLineDash([]);
  g.translate(mx, my);
  g.rotate(ang);
  g.fillStyle = 'rgba(255,245,215,0.9)';
  g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -12); g.lineTo(-10, 12); g.closePath(); g.fill();
  g.restore();
}

function drawNode(g, n) {
  const k = NODE_KINDS[n.kind];
  shadow(g, n.x, n.y, k.radius * 1.1);
  sprite(g, k.sprite, n.x, n.y + k.size * 0.08, k.size);
}

function steam(g, x, y, t, scale = 1) {
  for (let i = 0; i < 3; i++) {
    const k = ((t * 0.7 + i / 3) % 1);
    g.globalAlpha = 0.55 * (1 - k);
    g.fillStyle = '#f4f1ea';
    g.beginPath();
    g.arc(x + Math.sin(t * 2 + i) * 10 * scale, y - k * 90 * scale, (12 + k * 26) * scale, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}
function sparkle(g, x, y, t) {
  const k = (Math.sin(t * 4) + 1) / 2;
  g.save();
  g.globalAlpha = 0.5 + k * 0.5;
  g.fillStyle = '#fff2a8';
  g.translate(x, y);
  g.rotate(t);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 6 : 18 + k * 6;
    g.lineTo(Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r);
  }
  g.closePath();
  g.fill();
  g.restore();
}

function drawBuilding(g, w, b, t, ui) {
  const m = machineOf(b.type);
  const powered = isPowered(w, b);
  const work = b.working;
  const shake = work ? Math.sin(t * 40 + b.x) * 1.5 : 0;
  if (!b.node) shadow(g, b.x, b.y, m.radius * 1.15);
  const size = m.size * (1 + (b.lv - 1) * 0.08);
  sprite(g, m.sprite, b.x + shake, b.y + size * 0.06, size, { alpha: ui.moving === b.id ? 0.4 : 1 });
  // 段階の星
  if (b.lv > 1) badge(g, b.x + size * 0.38, b.y - size * 0.15, '★'.repeat(b.lv - 1), 'rgba(140,90,20,0.9)');
  if (work && (m.power || b.type === 'furnace' || b.type === 'boiler')) steam(g, b.x + 10, b.y - size * 0.85, t + b.x, 0.8);
  if (b.type === 'boiler' && b.burn > 0 && !w.save.reactorOn) steam(g, b.x + 6, b.y - size * 0.9, t + 0.3, 1);
  // 状態の小さなしるし
  let mark = null;
  if (m.power && !powered) mark = { text: '蒸気なし', bg: 'rgba(120,60,40,0.9)' };
  else if (m.role === 'power' && !w.save.reactorOn && b.fuel <= 0 && b.burn <= 0) mark = { icon: 'coal', blink: true };
  else if (m.role === 'process' && !b.busy) {
    const r = RECIPES[b.recipe];
    const lack = Object.entries(r.in).find(([k, n]) => (b.inp[k] ?? 0) < n);
    if (r.out && total(b.out) >= OUTPUT_CAP) mark = { text: 'いっぱい', bg: 'rgba(60,70,90,0.9)' };
    else if (stocked(w, b)) mark = { text: '十分ある', bg: 'rgba(50,100,70,0.9)' };
    else if (lack) mark = { icon: lack[0], blink: true };
  } else if (m.role === 'extract' && total(b.out) >= OUTPUT_CAP) mark = { text: 'いっぱい', bg: 'rgba(60,70,90,0.9)' };
  const my = b.y - size * 0.95;
  if (mark?.icon) {
    if (!mark.blink || Math.sin(t * 5) > -0.3) {
      g.fillStyle = 'rgba(255,250,235,0.92)';
      g.beginPath(); g.arc(b.x, my, 30, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(200,80,50,0.9)'; g.lineWidth = 4; g.stroke();
      itemIcon(g, mark.icon, b.x, my, 42);
    }
  } else if (mark) badge(g, b.x, my, mark.text, mark.bg);
  // できた物
  const out = total(b.out);
  if (out > 0) {
    const first = Object.keys(b.out)[0];
    itemIcon(g, first, b.x - 30, b.y + 26, 40);
    badge(g, b.x + 18, b.y + 26, `${out}`);
  }
  // 進み具合
  if (work && (m.role === 'extract' || m.role === 'process')) {
    g.fillStyle = 'rgba(40,28,15,0.6)';
    g.fillRect(b.x - 50, b.y + 52, 100, 10);
    g.fillStyle = '#ffd36b';
    g.fillRect(b.x - 50, b.y + 52, 100 * Math.min(1, b.prog), 10);
  }
  if (m.role === 'power' && !w.save.reactorOn) {
    g.fillStyle = 'rgba(40,28,15,0.6)';
    g.fillRect(b.x - 50, b.y + 52, 100, 10);
    g.fillStyle = '#ff9b52';
    g.fillRect(b.x - 50, b.y + 52, 100 * Math.min(1, (b.fuel + (b.burn > 0 ? b.burn / POWER.burn : 0)) / POWER.fuelCap), 10);
  }
}

function drawDock(g, w, l, t) {
  const s = w.save;
  sprite(g, 'dock', l.x, l.y + 160, l.size);
  if (s.cleared) {
    // 完成した船（横向きの絵）を少し浮かせて描く
    const sh = shipImg;
    if (sh) {
      const wdt = 560;
      const hgt = wdt * sh.height / sh.width;
      shadow(g, l.x, l.y + 40, 200);
      g.drawImage(sh, l.x - wdt / 2, l.y - 260 + Math.sin(t * 1.2) * 8, wdt, hgt);
    }
  } else if (shipFrameBuilt(s)) {
    sprite(g, 'ship-frame', l.x, l.y + 70, 440);
  }
  const parts = Object.values(s.ship).reduce((a, b) => a + b, 0);
  const all = Object.values(SHIP).reduce((a, b) => a + b, 0);
  if (!s.cleared && parts > 0) badge(g, l.x, l.y + 120, `部品 ${parts}/${all}`);
}
let shipImg = null;
export function setShipImage(im) { shipImg = im; }

function drawHero(g, w, t) {
  const h = w.hero;
  shadow(g, h.x, h.y, 34);
  const pose = h.pose;
  const id = { walk: 'hero-walk', carry: 'hero-carry', axe: 'hero-axe', pick: 'hero-pick', fix: 'hero-fix', joy: 'hero-joy', plan: 'hero-plan' }[pose] ?? 'hero';
  const bob = h.moving ? Math.abs(Math.sin(h.walk * 10)) * 8 : Math.sin(t * 2) * 1.5;
  let rot = h.moving ? Math.sin(h.walk * 10) * 0.05 : 0;
  let sy = 1;
  if (pose === 'axe' || pose === 'pick') {
    const k = (w.hero.gatherT * 4) % 1;
    rot = (k < 0.5 ? -k : k - 1) * 0.25;
    sy = 1 - Math.abs(Math.sin(k * Math.PI)) * 0.04;
  }
  sprite(g, id, h.x, h.y + 10, 150, { face: h.face, bob, rot: rot * h.face, sy });
  if (w.hero.full) badge(g, h.x, h.y - 175, '袋がいっぱい', 'rgba(150,60,40,0.92)');
}
function drawBot(g, bot, t) {
  const def = BOTS[bot.type];
  const moving = !!bot.job;
  const bob = def.fly ? 40 + Math.sin(t * 3 + bot.x) * 8 : moving ? Math.abs(Math.sin(bot.walk * 9)) * 6 : 0;
  shadow(g, bot.x, bot.y, def.fly ? 26 : 34);
  sprite(g, def.sprite, bot.x, bot.y + 6, def.size, { face: bot.face, bob, rot: moving && !def.fly ? Math.sin(bot.walk * 9) * 0.05 : 0 });
  if (bot.job?.carrying) itemIcon(g, bot.job.item, bot.x, bot.y - def.size - bob - 6, 40);
}
function drawCritter(g, c, t) {
  const fly = c.kind === 'gull';
  const moving = Math.hypot(c.tx - c.x, c.ty - c.y) > 4;
  const size = { crab: 70, gull: 80, lizard: 80 }[c.kind];
  shadow(g, c.x, c.y, size * 0.3);
  sprite(g, c.kind, c.x, c.y + 4, size, { face: c.kind === 'crab' ? 1 : c.face, bob: moving ? Math.abs(Math.sin(c.walk * 12)) * 4 + (fly ? 6 : 0) : 0 });
  void t;
}

function drawFog(g, cam, w, t) {
  const cx1 = Math.max(0, Math.floor(cam.x / CELL) - 1);
  const cy1 = Math.max(0, Math.floor(cam.y / CELL) - 1);
  const cx2 = Math.min(GRID - 1, Math.floor((cam.x + cam.w) / CELL) + 1);
  const cy2 = Math.min(GRID - 1, Math.floor((cam.y + cam.h) / CELL) + 1);
  for (let cy = cy1; cy <= cy2; cy++) {
    for (let cx = cx1; cx <= cx2; cx++) {
      const ch = MAP[cy][cx];
      if (ch === '~' || ch === 'F' || ch === 'C' || ch === 'L') continue;
      if (w.reach[cy * GRID + cx]) continue;
      const x = cx * CELL + CELL / 2 + Math.sin(t * 0.3 + cy) * 30;
      const y = cy * CELL + CELL / 2 + Math.cos(t * 0.25 + cx) * 20;
      const gr = g.createRadialGradient(x, y, 20, x, y, CELL * 1.05);
      gr.addColorStop(0, 'rgba(236,240,240,0.92)');
      gr.addColorStop(1, 'rgba(236,240,240,0)');
      g.fillStyle = gr;
      g.fillRect(x - CELL * 1.1, y - CELL * 1.1, CELL * 2.2, CELL * 2.2);
    }
  }
}

function drawGhost(g, w, gh, t) {
  const m = machineOf(gh.type);
  g.save();
  g.globalAlpha = 0.55 + Math.sin(t * 6) * 0.15;
  sprite(g, m.sprite, gh.x, gh.y + m.size * 0.06, m.size);
  g.globalAlpha = 1;
  g.strokeStyle = gh.ok ? 'rgba(120,230,140,0.95)' : 'rgba(240,90,70,0.95)';
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(gh.x, gh.y, m.radius + 24, (m.radius + 24) * 0.45, 0, 0, Math.PI * 2);
  g.stroke();
  if (m.power && !w.save.reactorOn) {
    // 蒸気が届くか
    const inRange = w.save.buildings.some((b) => b.type === 'boiler' && Math.hypot(b.x - gh.x, b.y - gh.y) <= POWER.radius);
    if (!inRange) badge(g, gh.x, gh.y + 50, '蒸気が届きません', 'rgba(120,60,40,0.9)');
  }
  g.restore();
}

// 目標の場所が画面の外なら、端に矢印
function drawQuestArrow(g, cam, w, ui, t) {
  const tg = questTarget(w);
  if (!tg || !ui.showArrow) return;
  const sx = (tg.x - cam.x) * cam.scale;
  const sy = (tg.y - cam.y) * cam.scale;
  const cw = cam.w * cam.scale;
  const ch = cam.h * cam.scale;
  g.save();
  g.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
  if (sx > 30 && sx < cw - 30 && sy > 130 && sy < ch - 160) {
    // 画面の中: 目標の上で上下する矢印
    const y = sy - 120 * cam.scale - Math.abs(Math.sin(t * 3)) * 12;
    g.fillStyle = '#ffcf4a';
    g.strokeStyle = '#5a3a12';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(sx, y + 18); g.lineTo(sx - 16, y - 6); g.lineTo(sx + 16, y - 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    return;
  }
  const cx = cw / 2;
  const cy = ch / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const mx = cw / 2 - 34;
  const myTop = cy - 140;
  const myBot = ch - cy - 170;
  const tx = dx !== 0 ? mx / Math.abs(dx) : Infinity;
  const ty = dy < 0 ? myTop / -dy : dy > 0 ? myBot / dy : Infinity;
  const k = Math.min(tx, ty);
  const x = cx + dx * k;
  const y = cy + dy * k;
  g.translate(x, y);
  g.rotate(ang);
  const p = 1 + Math.sin(t * 5) * 0.08;
  g.scale(p, p);
  g.fillStyle = '#ffcf4a';
  g.strokeStyle = '#5a3a12';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(22, 0); g.lineTo(-12, -16); g.lineTo(-4, 0); g.lineTo(-12, 16); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// ---- ミニマップ ----
const MINI_COLORS = { '~': '#3f8fa3', '.': '#e7cf8f', g: '#79b04a', d: '#b07a45', r: '#9a9389', t: '#8e9a86', C: '#6f675e', F: '#3f7a35', b: '#3f8fa3', L: '#6f675e', l: '#b07a45' };
export function drawMinimap(c, w) {
  const g = c.getContext('2d');
  const s = c.width / GRID;
  g.clearRect(0, 0, c.width, c.height);
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const ch = MAP[cy][cx];
      g.fillStyle = MINI_COLORS[ch];
      g.fillRect(cx * s, cy * s, s + 0.5, s + 0.5);
      if (ch !== '~' && ch !== 'F' && !w.reach[cy * GRID + cx]) {
        g.fillStyle = 'rgba(240,244,244,0.82)';
        g.fillRect(cx * s, cy * s, s + 0.5, s + 0.5);
      }
    }
  }
  const k = c.width / WORLD.w;
  for (const b of w.save.buildings) {
    g.fillStyle = machineOf(b.type).role === 'store' ? '#ffd36b' : '#5b3a1e';
    g.fillRect(b.x * k - 3, b.y * k - 3, 6, 6);
  }
  for (const l of w.save.links) {
    const a = buildingById(w, l.from);
    const b = buildingById(w, l.to);
    if (!a || !b) continue;
    g.strokeStyle = '#5b3a1e';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(a.x * k, a.y * k); g.lineTo(b.x * k, b.y * k); g.stroke();
  }
  const tg = questTarget(w);
  if (tg) {
    g.fillStyle = '#ffcf4a';
    g.strokeStyle = '#5a3a12';
    g.beginPath(); g.arc(tg.x * k, tg.y * k, 7, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.fillStyle = '#e8462e';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath(); g.arc(w.hero.x * k, w.hero.y * k, 6, 0, Math.PI * 2); g.fill(); g.stroke();
}

export { reachable, nodeById };

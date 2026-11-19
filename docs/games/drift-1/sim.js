// 漂流発明記: ゲームの計算（描画・画面とは独立。テストと自動プレイからも使う）
import {
  SCHEMA, CELL, GRID, WORLD, MAP, WALKABLE, GATES, ITEM_IDS, NODES, NODE_KINDS, LANDMARKS, START, HERO, TOOLS, BENCH,
  MACHINES, BUILD_GAP, EXTRACT_REACH, RECIPES, LEVEL_SPEED, LEVEL_COST_MULT, INPUT_CAP, OUTPUT_CAP, STOCK_LIMIT, POWER, BELT, BOTS,
  BROKEN_BOTS, SHIP, REACTOR_COST, BOILER_REPAIR, DRIFT, QUESTS, DIALOGUES,
} from './data.js';

// 採掘ロボを置いたときの建物（画像はロボ）
const MINERBOT = { name: '採掘ロボ', sprite: 'bot-miner', role: 'extract', on: Object.keys(NODE_KINDS), size: 130, radius: 35, time: BOTS.miner.time, cost: {} };
export const machineOf = (type) => (type === 'minerbot' ? MINERBOT : MACHINES[type]);

// ---- 乱数（セーブに状態を持つ）----
function rand(s) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- セーブ ----
export function newSave(seed = (Date.now() >>> 0)) {
  return {
    v: SCHEMA,
    hero: { x: START.x, y: START.y },
    bag: {},
    pool: {},
    tool: 0, bagLv: 0, boots: 0,
    era: 1,
    quest: 0,
    gates: {},
    boilerFixed: false,
    reactorOn: false,
    buildings: [
      { id: 'k1', type: 'bench', x: 2620, y: 4800, lv: 1 },
      { id: 'k2', type: 'store', x: 2930, y: 4860, lv: 1 },
    ],
    links: [],
    nextId: 3,
    fixed: [],
    drones: 0,
    ship: { engine: 0, frame: 0, envelope: 0, propeller: 0 },
    drift: [],
    driftT: 30,
    seen: [],
    pending: ['opening'],
    cleared: false,
    rng: seed >>> 0,
    stats: { playMs: 0, gathered: 0, made: 0, built: 0 },
  };
}

// ---- 地図 ----
export const cellAt = (x, y) => [Math.floor(x / CELL), Math.floor(y / CELL)];
export const charAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID ? '~' : MAP[cy][cx]);
const GATE_AT = new Map(GATES.map((g) => [g.cell.join(','), g]));
export const gateAt = (cx, cy) => GATE_AT.get(`${cx},${cy}`) ?? null;
export function cellWalkable(save, cx, cy) {
  const c = charAt(cx, cy);
  if (WALKABLE.has(c)) return true;
  const g = gateAt(cx, cy);
  return !!(g && save.gates[g.id]);
}
export function walkable(save, x, y) {
  if (x < 0 || y < 0 || x >= WORLD.w || y >= WORLD.h) return false;
  const [cx, cy] = cellAt(x, y);
  return cellWalkable(save, cx, cy);
}
/** 歩いて行けるマス（スタートからつながっている所） */
export function computeReach(save) {
  const r = new Uint8Array(GRID * GRID);
  const [sx, sy] = cellAt(START.x, START.y);
  const q = [[sx, sy]];
  r[sy * GRID + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || r[ny * GRID + nx]) continue;
      if (!cellWalkable(save, nx, ny)) continue;
      r[ny * GRID + nx] = 1;
      q.push([nx, ny]);
    }
  }
  return r;
}
export function reachable(w, x, y) {
  const [cx, cy] = cellAt(x, y);
  return cx >= 0 && cy >= 0 && cx < GRID && cy < GRID && w.reach[cy * GRID + cx] === 1;
}
export const gateCenter = (g) => ({ x: g.cell[0] * CELL + CELL / 2, y: g.cell[1] * CELL + CELL / 2 });

// ---- 世界（セーブ＋その場だけの状態）----
export function createWorld(save) {
  const w = {
    save,
    hero: { x: save.hero.x, y: save.hero.y, vx: 0, vy: 0, face: 1, walk: 0, moving: false, still: 0, gatherT: 0, node: null, pose: 'idle', exT: 0 },
    bots: [],
    beltItems: [],
    beltT: {},
    events: [],
    reach: null,
    powered: new Set(),
    t: 0,
    critters: [],
    fx: [],
  };
  w.reach = computeReach(save);
  syncBots(w);
  spawnCritters(w);
  return w;
}

export function syncSave(w) {
  w.save.hero.x = Math.round(w.hero.x);
  w.save.hero.y = Math.round(w.hero.y);
  return w.save;
}

export function saveSummary(s) {
  const q = QUESTS[Math.min(s.quest, QUESTS.length - 1)];
  const parts = Object.values(s.ship).reduce((a, b) => a + b, 0);
  const total = Object.values(SHIP).reduce((a, b) => a + b, 0);
  const label = s.cleared ? '島を出た・工場はつづく' : s.quest >= QUESTS.length - 1 ? `飛行船 ${parts}/${total}` : `${['', '手作業', '蒸気', '工場', '大工場'][s.era]}の時代`;
  return { label, era: s.era, quest: q.id, cleared: s.cleared };
}

// ---- 持ち物（袋＋倉庫）----
export const bagCap = (s) => HERO.bag[s.bagLv];
export const bagCount = (s) => Object.values(s.bag).reduce((a, b) => a + b, 0);
export const have = (s, item) => (s.bag[item] ?? 0) + (s.pool[item] ?? 0);
export function canPay(s, cost) {
  return Object.entries(cost).every(([k, n]) => have(s, k) >= n);
}
export function missing(s, cost) {
  return Object.entries(cost).filter(([k, n]) => have(s, k) < n).map(([k, n]) => [k, n - have(s, k)]);
}
function pay(s, cost) {
  for (const [k, n] of Object.entries(cost)) {
    let left = n;
    const fromPool = Math.min(left, s.pool[k] ?? 0);   // 倉庫から先に使う（袋の中身は運ぶ途中の物が多いので）
    s.pool[k] = (s.pool[k] ?? 0) - fromPool;
    left -= fromPool;
    s.bag[k] = (s.bag[k] ?? 0) - left;
    if (!s.pool[k]) delete s.pool[k];
    if (!s.bag[k]) delete s.bag[k];
  }
}
const add = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; if (o[k] <= 0) delete o[k]; };
const total = (o) => (o ? Object.values(o).reduce((a, b) => a + b, 0) : 0);
export function scaleCost(cost, mult) {
  const o = {};
  for (const [k, n] of Object.entries(cost)) o[k] = Math.ceil(n * mult);
  return o;
}

// ---- 建物 ----
export const buildingById = (w, id) => w.save.buildings.find((b) => b.id === id) ?? null;
export function upgradeCost(b) {
  const m = machineOf(b.type);
  if (b.lv >= 3 || !m || b.type === 'bench' || b.type === 'minerbot' || m.role === 'store' || m.role === 'station') return null;
  return scaleCost(m.cost, LEVEL_COST_MULT[b.lv]);
}
export function nodeTaken(w, nodeId, except = null) {
  return w.save.buildings.some((b) => b.node === nodeId && b.id !== except);
}
export const nodeById = (id) => NODES.find((n) => n.id === id) ?? null;
export function solids(w) {
  const out = [];
  for (const b of w.save.buildings) {
    const m = machineOf(b.type);
    if (b.node) continue;   // 資源の上の採掘機は、資源と同じ当たり
    out.push({ x: b.x, y: b.y, r: m.radius });
  }
  for (const n of NODES) out.push({ x: n.x, y: n.y, r: NODE_KINDS[n.kind].radius * 0.75 });
  for (const [k, l] of Object.entries(LANDMARKS)) if (l.solid !== false && k !== 'dock') out.push({ x: l.x, y: l.y, r: l.radius });
  return out;
}

export function minersFree(w) {
  const s = w.save;
  const total = BROKEN_BOTS.filter((b) => b.type === 'miner' && s.fixed.includes(b.id)).length;
  return total - s.buildings.filter((b) => b.type === 'minerbot').length;
}
export function unlockedMachines(s) {
  return Object.entries(MACHINES).filter(([, m]) => m.era <= s.era).map(([k]) => k);
}

/**
 * 置けるかどうか。置ける場合は実際の位置（資源の上へ寄せる）を返す
 * @returns {{ok:true,x,y,node}|{ok:false,why:string}}
 */
export function checkPlace(w, type, x, y) {
  const s = w.save;
  const m = machineOf(type);
  if (!m) return { ok: false, why: 'この機械はありません' };
  if (type === 'minerbot') { if (minersFree(w) <= 0) return { ok: false, why: '空いている採掘ロボがいません' }; } else if (m.era > s.era) return { ok: false, why: 'まだ作り方がわかりません' };
  if (!canPay(s, m.cost)) return { ok: false, why: '材料が足りません' };
  let node = null;
  if (m.role === 'extract') {
    let best = null;
    for (const n of NODES) {
      if (!m.on.includes(n.kind) || nodeTaken(w, n.id)) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= EXTRACT_REACH && (!best || d < best.d)) best = { n, d };
    }
    if (!best) return { ok: false, why: m.on.length === 1 ? `${NODE_KINDS[m.on[0]].name}のそばに置いてください` : '空いている鉱脈・資源のそばに置いてください' };
    node = best.n;
    x = node.x;
    y = node.y + 30;
  }
  if (!reachable(w, x, y) || !walkable(s, x, y)) return { ok: false, why: 'ここには置けません' };
  for (const b of s.buildings) {
    if (Math.hypot(b.x - x, b.y - y) < (node && b.node ? 90 : BUILD_GAP)) return { ok: false, why: 'ほかの建物に近すぎます' };
  }
  for (const l of Object.values(LANDMARKS)) if (Math.hypot(l.x - x, l.y - y) < l.radius + 90) return { ok: false, why: '大きな建物に近すぎます' };
  if (!node) {
    for (const n of NODES) if (Math.hypot(n.x - x, n.y - y) < NODE_KINDS[n.kind].radius + 70) return { ok: false, why: '資源に近すぎます' };
  }
  for (const g of GATES) {
    const c = gateCenter(g);
    if (Math.hypot(c.x - x, c.y - y) < 170) return { ok: false, why: '道をふさいでしまいます' };
  }
  return { ok: true, x, y, node: node?.id ?? null };
}

export function place(w, type, x, y) {
  const c = checkPlace(w, type, x, y);
  if (!c.ok) return c;
  const s = w.save;
  const m = machineOf(type);
  pay(s, m.cost);
  const b = { id: `k${s.nextId++}`, type, x: Math.round(c.x), y: Math.round(c.y), lv: 1 };
  if (c.node) b.node = c.node;
  if (m.role === 'process') { b.recipe = m.recipes[0]; b.inp = {}; b.out = {}; b.prog = 0; }
  if (m.role === 'extract') { b.out = {}; b.prog = 0; }
  if (m.role === 'power') { b.fuel = 0; b.burn = 0; }
  s.buildings.push(b);
  s.stats.built++;
  w.events.push({ type: 'built', id: b.id, machine: type });
  return { ok: true, building: b };
}

export function upgradeBuilding(w, id) {
  const b = buildingById(w, id);
  const cost = b && upgradeCost(b);
  if (!cost || !canPay(w.save, cost)) return false;
  pay(w.save, cost);
  b.lv++;
  w.events.push({ type: 'upgraded', id, lv: b.lv });
  return true;
}

/** 撤去（材料は全部もどる。ためていた物は倉庫へ） */
export function removeBuilding(w, id) {
  const s = w.save;
  const b = buildingById(w, id);
  if (!b || b.type === 'bench' || (b.type === 'boiler' && b.fixedWreck)) return false;
  if (machineOf(b.type).role === 'store' && s.buildings.filter((x) => machineOf(x.type).role === 'store').length <= 1) return false;
  const m = machineOf(b.type);
  for (const [k, n] of Object.entries(m.cost)) add(s.pool, k, n);
  for (let lv = 1; lv < b.lv; lv++) for (const [k, n] of Object.entries(scaleCost(m.cost, LEVEL_COST_MULT[lv]))) add(s.pool, k, n);
  for (const o of [b.inp, b.out]) if (o) for (const [k, n] of Object.entries(o)) add(s.pool, k, n);
  for (const l of s.links.filter((x) => x.from === id || x.to === id)) removeLink(w, l.id);
  s.buildings = s.buildings.filter((x) => x.id !== id);
  for (const bot of w.bots) if (bot.job && (bot.job.from === id || bot.job.to === id)) dropJob(w, bot);
  w.events.push({ type: 'removed', id });
  return true;
}

export function setRecipe(w, id, recipe) {
  const b = buildingById(w, id);
  if (!b || !machineOf(b.type).recipes?.includes(recipe) || b.recipe === recipe) return false;
  for (const [k, n] of Object.entries(b.inp)) add(w.save.pool, k, n);
  b.inp = {};
  b.prog = 0;
  b.busy = false;
  b.recipe = recipe;
  return true;
}

// ---- ベルト ----
export const linkById = (w, id) => w.save.links.find((l) => l.id === id) ?? null;
export function beltCost(from, to, lv = 0) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  return scaleCost(BELT.levels[lv].cost, Math.max(1, Math.ceil(len / BELT.costPer)));
}
export function checkLink(w, fromId, toId) {
  const s = w.save;
  const a = buildingById(w, fromId);
  const b = buildingById(w, toId);
  if (s.era < 3) return { ok: false, why: 'ベルトの作り方はまだわかりません' };
  if (!a || !b || a === b) return { ok: false, why: 'つなぐ先を選んでください' };
  const ma = machineOf(a.type);
  const mb = machineOf(b.type);
  if (!['extract', 'process', 'store'].includes(ma.role)) return { ok: false, why: `${ma.name}からは送れません` };
  if (!['process', 'store', 'power'].includes(mb.role)) return { ok: false, why: `${mb.name}には送れません` };
  if (ma.role === 'store' && mb.role === 'store') return { ok: false, why: '倉庫どうしはつなげません' };
  if (s.links.some((l) => l.from === fromId && l.to === toId)) return { ok: false, why: 'もうつながっています' };
  if (s.links.filter((l) => l.from === fromId).length >= 3) return { ok: false, why: '1つの機械から出せるベルトは3本までです' };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len > BELT.maxLen) return { ok: false, why: '遠すぎます（ベルトは短めに）' };
  const cost = beltCost(a, b);
  if (!canPay(s, cost)) return { ok: false, why: '材料が足りません', cost };
  return { ok: true, cost };
}
export function addLink(w, fromId, toId) {
  const c = checkLink(w, fromId, toId);
  if (!c.ok) return c;
  pay(w.save, c.cost);
  const l = { id: `L${w.save.nextId++}`, from: fromId, to: toId, lv: 0 };
  w.save.links.push(l);
  w.events.push({ type: 'linked', id: l.id });
  return { ok: true, link: l };
}
export function removeLink(w, id) {
  const s = w.save;
  const l = linkById(w, id);
  if (!l) return false;
  const a = buildingById(w, l.from);
  const b = buildingById(w, l.to);
  if (a && b) {
    for (let lv = 0; lv <= l.lv; lv++) for (const [k, n] of Object.entries(beltCost(a, b, lv))) add(s.pool, k, n);
  }
  for (const it of w.beltItems.filter((x) => x.link === id)) add(s.pool, it.item);
  w.beltItems = w.beltItems.filter((x) => x.link !== id);
  s.links = s.links.filter((x) => x.id !== id);
  return true;
}
export function upgradeLink(w, id) {
  const l = linkById(w, id);
  if (!l || l.lv >= BELT.levels.length - 1) return false;
  const cost = beltCost(buildingById(w, l.from), buildingById(w, l.to), l.lv + 1);
  if (!canPay(w.save, cost)) return false;
  pay(w.save, cost);
  l.lv++;
  return true;
}

// ---- 何を受け取れるか ----
function incoming(w, b, item) {
  let n = 0;
  for (const it of w.beltItems) if (it.to === b.id && it.item === item) n++;
  for (const bot of w.bots) if (bot.job && bot.job.to === b.id && bot.job.item === item) n += bot.job.n;
  return n;
}
/** b が item をあと何個受け取れるか */
export function room(w, b, item) {
  const m = machineOf(b.type);
  if (m.role === 'store') return Infinity;
  if (m.role === 'power') return item === 'coal' ? Math.max(0, POWER.fuelCap - b.fuel - incoming(w, b, 'coal')) : 0;
  if (m.role === 'process') {
    const r = RECIPES[b.recipe];
    const need = r.in[item];
    if (!need) return 0;
    return Math.max(0, need * INPUT_CAP - (b.inp[item] ?? 0) - incoming(w, b, item));
  }
  return 0;
}
function deliver(w, b, item, n) {
  const m = machineOf(b.type);
  if (m.role === 'store') add(w.save.pool, item, n);
  else if (m.role === 'power') b.fuel += n;
  else if (m.role === 'process') add(b.inp, item, n);
  else add(w.save.pool, item, n);
}

// ---- 蒸気 ----
function updatePower(w) {
  const s = w.save;
  w.powered.clear();
  const all = s.reactorOn;
  const sources = all ? [] : s.buildings.filter((b) => b.type === 'boiler' && b.burn > 0);
  for (const b of s.buildings) {
    const m = machineOf(b.type);
    if (!m.power) continue;
    if (all || sources.some((p) => Math.hypot(p.x - b.x, p.y - b.y) <= POWER.radius)) w.powered.add(b.id);
  }
}
export const isPowered = (w, b) => !machineOf(b.type).power || w.powered.has(b.id);

// ---- 1コマ進める ----
export function step(w, input, dt) {
  w.events = [];
  w.t += dt;
  const s = w.save;
  moveHero(w, input, dt);
  heroWork(w, dt);
  updatePower(w);
  for (const b of s.buildings) runMachine(w, b, dt);
  runBelts(w, dt);
  runBots(w, dt);
  runDrift(w, dt);
  runCritters(w, dt);
  checkQuest(w);
  for (const f of w.fx) f.t += dt;
  w.fx = w.fx.filter((f) => f.t < f.life);
  return w.events;
}

// ---- 主人公 ----
export const heroSpeed = (s) => HERO.speed * HERO.speedUp[s.boots];
function moveHero(w, input, dt) {
  const h = w.hero;
  const s = w.save;
  let ix = input.x;
  let iy = input.y;
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }
  const sp = heroSpeed(s);
  h.moving = mag > 0.1;
  if (!h.moving) { h.still += dt; return; }
  h.still = 0;
  h.walk += dt;
  if (Math.abs(ix) > 0.15) h.face = ix > 0 ? 1 : -1;
  const sol = solids(w);
  const tryMove = (nx, ny) => {
    for (const [ox, oy] of [[0, 0], [HERO.radius, 0], [-HERO.radius, 0], [0, HERO.radius * 0.6], [0, -HERO.radius * 0.6]]) {
      if (!walkable(s, nx + ox, ny + oy)) return false;
    }
    return true;
  };
  const nx = h.x + ix * sp * dt;
  if (tryMove(nx, h.y)) h.x = nx;
  const ny = h.y + iy * sp * dt;
  if (tryMove(h.x, ny)) h.y = ny;
  // 建物・資源に重ならないよう押し出す
  for (const o of sol) {
    const dx = h.x - o.x;
    const dy = (h.y - o.y) * 1.4;
    const d = Math.hypot(dx, dy);
    const min = o.r + HERO.radius;
    if (d < min && d > 0.01) {
      const px = o.x + (dx / d) * min;
      const py = o.y + (dy / d) * min / 1.4;
      if (tryMove(px, py)) { h.x = px; h.y = py; }
    }
  }
}

/** 近くの資源（採れるもの） */
export function nearNode(w) {
  const h = w.hero;
  let best = null;
  for (const n of NODES) {
    const k = NODE_KINDS[n.kind];
    const d = Math.hypot(n.x - h.x, (n.y - h.y) * 1.2);
    if (d <= HERO.reach + k.radius && (!best || d < best.d)) best = { n, d };
  }
  return best?.n ?? null;
}
export function nearBuildings(w, extra = 0) {
  const h = w.hero;
  return w.save.buildings.filter((b) => Math.hypot(b.x - h.x, (b.y - h.y) * 1.2) <= HERO.reach + machineOf(b.type).radius + extra);
}

function heroWork(w, dt) {
  const h = w.hero;
  const s = w.save;
  h.pose = h.moving ? (bagCount(s) > bagCap(s) * 0.5 ? 'carry' : 'walk') : 'idle';
  // 建物とのやりとり（歩きながらでもよい）
  h.exT -= dt;
  if (h.exT <= 0) {
    h.exT = 0.2;
    for (const b of nearBuildings(w)) exchange(w, b);
    // 漂流物
    for (const d of [...s.drift]) {
      if (Math.hypot(d.x - h.x, d.y - h.y) < 110) {
        for (const [k, n] of Object.entries(d.loot)) add(s.pool, k, n);
        s.drift = s.drift.filter((x) => x !== d);
        w.events.push({ type: 'drift', loot: d.loot });
      }
    }
  }
  // 立ち止まると採る
  if (h.moving || h.still < 0.15) { h.gatherT = 0; h.node = null; return; }
  const n = nearNode(w);
  if (!n) { h.gatherT = 0; h.node = null; return; }
  if (h.node !== n.id) { h.node = n.id; h.gatherT = 0; }
  h.face = n.x >= h.x ? 1 : -1;
  if (bagCount(s) >= bagCap(s)) { h.pose = 'idle'; h.full = true; return; }
  h.full = false;
  h.pose = NODE_KINDS[n.kind].pose;
  h.gatherT += dt;
  const t = TOOLS[s.tool].time;
  if (h.gatherT >= t) {
    h.gatherT -= t;
    const item = NODE_KINDS[n.kind].item;
    add(s.bag, item);
    s.stats.gathered++;
    w.events.push({ type: 'gather', item, x: n.x, y: n.y - 60 });
    w.fx.push({ kind: 'pop', item, x: n.x, y: n.y - 60, t: 0, life: 0.8 });
  }
}

/** 主人公が建物のそばにいるときのやりとり */
function exchange(w, b) {
  const s = w.save;
  const m = machineOf(b.type);
  let moved = 0;
  // できた物を受け取る
  if (b.out && total(b.out) > 0) {
    for (const [k, n] of Object.entries(b.out)) {
      const take = Math.min(n, bagCap(s) - bagCount(s));
      if (take <= 0) break;
      add(b.out, k, -take);
      add(s.bag, k, take);
      moved += take;
    }
  }
  // 材料を入れる
  if (m.role === 'process' || m.role === 'power') {
    for (const [k, n] of Object.entries({ ...s.bag })) {
      const r = Math.min(n, room(w, b, k));
      if (r > 0) { add(s.bag, k, -r); deliver(w, b, k, r); moved += r; }
    }
  }
  // 倉庫にしまう
  if (m.role === 'store' && bagCount(s) > 0) {
    for (const [k, n] of Object.entries(s.bag)) add(s.pool, k, n);
    moved += bagCount(s);
    s.bag = {};
  }
  if (moved) w.events.push({ type: 'exchange', id: b.id, n: moved });
}

/** 倉庫から袋へ持ち出す */
export function takeFromPool(w, item, n) {
  const s = w.save;
  const k = Math.min(n, s.pool[item] ?? 0, bagCap(s) - bagCount(s));
  if (k <= 0) return 0;
  add(s.pool, item, -k);
  add(s.bag, item, k);
  w.hero.exT = 1.5;   // すぐ倉庫に戻さない
  return k;
}

// ---- 作業台 ----
export function benchState(s, r) {
  if (r.kind === 'tool') return s.tool >= r.level ? 'done' : s.tool === r.level - 1 ? 'open' : 'locked';
  if (r.kind === 'bag') return s.bagLv >= r.level ? 'done' : s.bagLv === r.level - 1 ? 'open' : 'locked';
  if (r.kind === 'boots') return s.boots >= r.level ? 'done' : s.boots === r.level - 1 ? 'open' : 'locked';
  return 'open';
}
export function craft(w, id, times = 1) {
  const s = w.save;
  const r = BENCH.find((x) => x.id === id);
  if (!r || benchState(s, r) !== 'open') return 0;
  let made = 0;
  for (let i = 0; i < times; i++) {
    if (!canPay(s, r.cost)) break;
    pay(s, r.cost);
    if (r.kind === 'item') add(s.pool, r.out, r.n);
    if (r.kind === 'tool') s.tool = r.level;
    if (r.kind === 'bag') s.bagLv = r.level;
    if (r.kind === 'boots') s.boots = r.level;
    made++;
    s.stats.made++;
    if (r.kind !== 'item') break;
  }
  if (made) w.events.push({ type: 'craft', id, n: made });
  return made;
}

// ---- 機械 ----
function runMachine(w, b, dt) {
  const m = machineOf(b.type);
  const sp = LEVEL_SPEED[b.lv - 1] ?? 1;
  if (m.role === 'power') {
    if (w.save.reactorOn) { b.burn = 0; return; }
    if (b.burn <= 0 && b.fuel > 0) { b.fuel--; b.burn = POWER.burn; }
    if (b.burn > 0) b.burn = Math.max(0, b.burn - dt);
    return;
  }
  if (!isPowered(w, b)) { b.working = false; return; }
  if (m.role === 'extract') {
    if (total(b.out) >= OUTPUT_CAP) { b.working = false; return; }
    b.working = true;
    b.prog += dt * sp / m.time;
    if (b.prog >= 1) {
      b.prog -= 1;
      const item = m.out ?? NODE_KINDS[nodeById(b.node).kind].item;
      add(b.out, item);
    }
    return;
  }
  if (m.role === 'process') {
    const r = RECIPES[b.recipe];
    if (!b.busy) {
      if (r.out && total(b.out) >= OUTPUT_CAP) { b.working = false; return; }
      if (stocked(w, b)) { b.working = false; return; }
      if (!Object.entries(r.in).every(([k, n]) => (b.inp[k] ?? 0) >= n)) { b.working = false; return; }
      for (const [k, n] of Object.entries(r.in)) add(b.inp, k, -n);
      b.busy = true;
      b.prog = 0;
    }
    b.working = true;
    b.prog += dt * sp / r.time;
    if (b.prog >= 1) {
      b.busy = false;
      b.prog = 0;
      if (r.bot === 'drone') { w.save.drones++; syncBots(w); w.events.push({ type: 'drone' }); } else add(b.out, r.out, r.n);
      w.save.stats.made++;
      w.events.push({ type: 'made', id: b.id, item: r.out ?? r.bot });
    }
  }
}

/** 倉庫に十分あるので休んでいる加工の機械 */
export function stocked(w, b) {
  const m = machineOf(b.type);
  if (m.role !== 'process') return false;
  const r = RECIPES[b.recipe];
  return !!r.out && (w.save.pool[r.out] ?? 0) >= stockLimit(w.save, r.out);
}
/** 倉庫にためる上限（飛行船の部品は、あと納める数まで） */
export function stockLimit(s, item) {
  return item in SHIP ? Math.max(0, SHIP[item] - s.ship[item]) : STOCK_LIMIT;
}

function runBelts(w, dt) {
  const s = w.save;
  for (const l of s.links) {
    const a = buildingById(w, l.from);
    const b = buildingById(w, l.to);
    if (!a || !b) continue;
    const lv = BELT.levels[l.lv];
    w.beltT[l.id] = (w.beltT[l.id] ?? 0) - dt;
    if (w.beltT[l.id] > 0) continue;
    // 送り出す物を選ぶ（先が受け取れる物だけ）
    const srcStore = machineOf(a.type).role === 'store';
    const src = srcStore ? s.pool : a.out;
    let pick = null;
    for (const [k, n] of Object.entries(src ?? {})) {
      if (n > 0 && room(w, b, k) > 0) { pick = k; break; }
    }
    if (!pick) continue;
    add(src, pick, -1);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    w.beltItems.push({ link: l.id, to: b.id, item: pick, d: 0, len });
    w.beltT[l.id] = lv.every;
  }
  const keep = [];
  for (const it of w.beltItems) {
    const l = linkById(w, it.link);
    const b = l && buildingById(w, it.to);
    if (!b) { add(s.pool, it.item); continue; }
    it.d += BELT.levels[l.lv].speed * dt;
    if (it.d >= it.len) deliver(w, b, it.item, 1); else keep.push(it);
  }
  w.beltItems = keep;
}

// ---- ロボット ----
export function botCounts(s) {
  const carry = BROKEN_BOTS.filter((b) => b.type === 'carry' && s.fixed.includes(b.id)).length;
  return { carry, drone: s.drones, miner: BROKEN_BOTS.filter((b) => b.type === 'miner' && s.fixed.includes(b.id)).length };
}
function syncBots(w) {
  const c = botCounts(w.save);
  const want = [...Array(c.carry).fill('carry'), ...Array(c.drone).fill('drone')];
  const home = w.save.buildings.find((b) => machineOf(b.type).role === 'store') ?? { x: START.x, y: START.y };
  while (w.bots.length < want.length) {
    const type = want[w.bots.length];
    const fromBroken = type === 'carry' ? BROKEN_BOTS.filter((b) => b.type === 'carry' && w.save.fixed.includes(b.id))[w.bots.filter((x) => x.type === 'carry').length] : null;
    w.bots.push({ type, x: fromBroken?.x ?? home.x + 60, y: fromBroken?.y ?? home.y + 60, job: null, face: 1, walk: 0, wait: Math.random() });
  }
}
function dropJob(w, bot) {
  if (bot.job?.carrying) add(w.save.pool, bot.job.item, bot.job.n);
  bot.job = null;
}
function nearestStore(w, x, y) {
  let best = null;
  for (const b of w.save.buildings) {
    if (machineOf(b.type).role !== 'store') continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (!best || d < best.d) best = { b, d };
  }
  return best?.b ?? null;
}
function claimed(w, b, item) {
  let n = 0;
  for (const bot of w.bots) if (bot.job && !bot.job.carrying && bot.job.from === b.id && bot.job.item === item) n += bot.job.n;
  return n;
}
function findJob(w, bot) {
  const s = w.save;
  const cap = BOTS[bot.type].cap;
  const dist = (b) => Math.hypot(b.x - bot.x, b.y - bot.y);
  // 1) 材料が足りない機械・燃料が少ないボイラーへ、倉庫から届ける
  let best = null;
  for (const b of s.buildings) {
    const m = machineOf(b.type);
    if (m.role !== 'process' && m.role !== 'power') continue;
    if (m.role === 'power' && s.reactorOn) continue;
    if (stocked(w, b)) continue;
    const items = m.role === 'power' ? ['coal'] : Object.keys(RECIPES[b.recipe].in);
    for (const item of items) {
      const r = room(w, b, item);
      const inPool = s.pool[item] ?? 0;
      if (r <= 0 || inPool <= 0) continue;
      // 半分以下になったら補充
      const cur = m.role === 'power' ? b.fuel : (b.inp[item] ?? 0);
      const full = m.role === 'power' ? POWER.fuelCap : RECIPES[b.recipe].in[item] * INPUT_CAP;
      if (cur > full / 2) continue;
      const st = nearestStore(w, b.x, b.y);
      if (!st) continue;
      const score = dist(st) + Math.hypot(st.x - b.x, st.y - b.y) - 600;
      if (!best || score < best.score) best = { score, job: { from: st.id, fromPool: true, to: b.id, item, n: Math.min(cap, r, inPool) } };
    }
  }
  // 2) 機械にたまった物を、必要な機械か倉庫へ運ぶ
  for (const b of s.buildings) {
    if (!b.out) continue;
    for (const [item, n] of Object.entries(b.out)) {
      const free = n - claimed(w, b, item);
      if (free <= 0) continue;
      // 少ししかない物は、いっぱいに近いか、近くにいるときだけ
      if (free < Math.min(cap, 3) && dist(b) > 600) continue;
      let to = null;
      for (const c of s.buildings) {
        if (c === b) continue;
        const mc = machineOf(c.type);
        if (mc.role !== 'process' && mc.role !== 'power') continue;
        if (room(w, c, item) <= 0) continue;
        if (!to || Math.hypot(c.x - b.x, c.y - b.y) < Math.hypot(to.x - b.x, to.y - b.y)) to = c;
      }
      if (to && Math.hypot(to.x - b.x, to.y - b.y) > 2500) to = null;
      to ??= nearestStore(w, b.x, b.y);
      if (!to) continue;
      const k = Math.min(cap, free, room(w, to, item));
      if (k <= 0) continue;
      // 機械が使う物を届ける仕事と、いっぱいで止まった機械を空ける仕事を先にする（倉庫へしまうだけの仕事に負けないように）
      const toMachine = machineOf(to.type).role !== 'store';
      const full = total(b.out) >= OUTPUT_CAP;
      const score = dist(b) + Math.hypot(to.x - b.x, to.y - b.y) - free * 40 - (toMachine ? 900 : 0) - (full ? 900 : 0);
      if (!best || score < best.score) best = { score, job: { from: b.id, to: to.id, item, n: k } };
    }
  }
  return best?.job ?? null;
}
// ---- 歩くロボの道さがし（50ごとの細かいマスで幅優先。見通せる所は直線でつなぐ）----
const NAV = 50;
const NAV_N = WORLD.w / NAV;
function navGrid(w) {
  const key = `${w.save.buildings.length}|${Object.keys(w.save.gates).length}`;
  if (w.nav?.key === key) return w.nav.grid;
  const grid = new Uint8Array(NAV_N * NAV_N);
  const sol = solids(w);
  for (let j = 0; j < NAV_N; j++) {
    for (let i = 0; i < NAV_N; i++) {
      const x = i * NAV + NAV / 2;
      const y = j * NAV + NAV / 2;
      let bad = !walkable(w.save, x, y) || !reachable(w, x, y);
      if (!bad) for (const o of sol) if (Math.hypot(x - o.x, (y - o.y) * 1.3) < o.r + 6) { bad = true; break; }
      grid[j * NAV_N + i] = bad ? 1 : 0;
    }
  }
  w.nav = { key, grid };
  return grid;
}
function navFree(grid, x, y) {
  const i = Math.floor(x / NAV);
  const j = Math.floor(y / NAV);
  return i >= 0 && j >= 0 && i < NAV_N && j < NAV_N && grid[j * NAV_N + i] === 0;
}
function lineClear(w, grid, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 8);
  for (let k = 1; k < n; k++) {
    const x = ax + (bx - ax) * k / n;
    const y = ay + (by - ay) * k / n;
    if (!navFree(grid, x, y)) return false;
    // 地面の縁をかすめないよう、少し余白をとる
    for (const [ox, oy] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) if (!walkable(w.save, x + ox, y + oy)) return false;
  }
  return true;
}
/** (sx,sy) から (tx,ty) のそば（建物の手前）までの道。行けなければ null */
export function findPath(w, sx, sy, tx, ty) {
  const grid = navGrid(w);
  const cellOf = (x, y) => Math.max(0, Math.min(NAV_N - 1, Math.floor(y / NAV))) * NAV_N + Math.max(0, Math.min(NAV_N - 1, Math.floor(x / NAV)));
  // 出発点が建物などに重なっていたら、近くの空いたマスから
  let start = cellOf(sx, sy);
  if (grid[start]) {
    let best = -1;
    let bd = Infinity;
    const si = start % NAV_N;
    const sj = (start / NAV_N) | 0;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const i = si + di;
      const j = sj + dj;
      if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N || grid[j * NAV_N + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = j * NAV_N + i; }
    }
    if (best < 0) return null;
    start = best;
  }
  const prev = new Int32Array(NAV_N * NAV_N).fill(-1);
  prev[start] = start;
  const q = [start];
  let goal = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    const ci = c % NAV_N;
    const cj = (c / NAV_N) | 0;
    if (Math.hypot(ci * NAV + NAV / 2 - tx, cj * NAV + NAV / 2 - ty) < 110) { goal = c; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= NAV_N || nj >= NAV_N) continue;
      const n = nj * NAV_N + ni;
      if (prev[n] !== -1 || grid[n]) continue;
      if (di && dj && (grid[cj * NAV_N + ni] || grid[nj * NAV_N + ci])) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (goal < 0) return null;
  const cells = [];
  for (let c = goal; c !== start; c = prev[c]) cells.push({ x: (c % NAV_N) * NAV + NAV / 2, y: ((c / NAV_N) | 0) * NAV + NAV / 2 });
  cells.reverse();
  cells.push({ x: tx, y: ty });
  // 見通せる所は飛ばして、なめらかに
  const out = [];
  let cx = sx;
  let cy = sy;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      if (lineClear(w, grid, cx, cy, cells[m].x, cells[m].y)) { far = m; break; }
    }
    out.push(cells[far]);
    cx = cells[far].x;
    cy = cells[far].y;
    k = far + 1;
  }
  return out;
}

function runBots(w, dt) {
  const s = w.save;
  syncBots(w);
  for (const bot of w.bots) {
    const def = BOTS[bot.type];
    if (!bot.job) {
      bot.wait -= dt;
      if (bot.wait > 0) continue;
      bot.wait = 0.6;
      bot.job = findJob(w, bot);
      if (!bot.job) continue;
    }
    const j = bot.job;
    const target = buildingById(w, j.carrying ? j.to : j.from);
    if (!target) { dropJob(w, bot); continue; }
    const gx = target.x;
    const gy = target.y + 40;
    if (Math.hypot(gx - bot.x, gy - bot.y) > 60) {
      // 空を飛ぶドローンはまっすぐ。歩くロボは、水・崖・建物を避けた道をたどる
      let wx = gx;
      let wy = gy;
      if (!def.fly) {
        const key = `${target.id}|${j.carrying ? 1 : 0}`;
        if (bot.pathKey !== key || !bot.path) {
          bot.pathKey = key;
          bot.path = findPath(w, bot.x, bot.y, gx, gy);
          if (!bot.path) { dropJob(w, bot); bot.wait = 3; continue; }
        }
        while (bot.path.length && Math.hypot(bot.path[0].x - bot.x, bot.path[0].y - bot.y) < 20) bot.path.shift();
        if (bot.path.length) { wx = bot.path[0].x; wy = bot.path[0].y; }
      }
      const dx = wx - bot.x;
      const dy = wy - bot.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = def.speed * dt;
      bot.x += dx / d * Math.min(sp, d);
      bot.y += dy / d * Math.min(sp, d);
      bot.walk += dt;
      if (Math.abs(dx) > 4) bot.face = dx > 0 ? 1 : -1;
      continue;
    }
    bot.path = null;
    if (!j.carrying) {
      const src = j.fromPool ? s.pool : target.out;
      const k = Math.min(j.n, src?.[j.item] ?? 0);
      if (k <= 0) { bot.job = null; continue; }
      add(src, j.item, -k);
      j.n = k;
      j.carrying = true;
    } else {
      const dest = target;
      const r = room(w, dest, j.item) + j.n;   // 自分の分は incoming に数えられている
      const k = Math.min(j.n, r);
      if (k > 0) deliver(w, dest, j.item, k);
      if (j.n - k > 0) add(s.pool, j.item, j.n - k);
      bot.job = null;
      bot.wait = 0.2;
    }
  }
}

// ---- 漂流物・島の生き物 ----
function runDrift(w, dt) {
  const s = w.save;
  s.driftT -= dt;
  if (s.driftT > 0) return;
  s.driftT = DRIFT.every;
  if (s.drift.length >= DRIFT.max) return;
  const a = DRIFT.area;
  const x = Math.round(a.x1 + rand(s) * (a.x2 - a.x1));
  const y = Math.round(a.y1 + rand(s) * (a.y2 - a.y1));
  const loot = { ...DRIFT.loot[Math.floor(rand(s) * DRIFT.loot.length)] };
  s.drift.push({ x, y, loot });
  w.events.push({ type: 'driftArrive' });
}
function spawnCritters(w) {
  const list = [['crab', 1800, 5250], ['crab', 3700, 5300], ['crab', 2600, 5450], ['gull', 1500, 4800], ['gull', 4200, 4900],
    ['lizard', 2800, 2600], ['lizard', 3300, 3900], ['lizard', 1200, 3500], ['gull', 3000, 1100], ['lizard', 5000, 4000]];
  w.critters = list.map(([kind, x, y], i) => ({ kind, x, y, hx: x, hy: y, tx: x, ty: y, wait: i * 0.7, face: 1, walk: 0 }));
}
function runCritters(w, dt) {
  for (const c of w.critters) {
    c.wait -= dt;
    const dx = c.tx - c.x;
    const dy = c.ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const sp = (c.kind === 'gull' ? 70 : 45) * dt;
      c.x += dx / d * Math.min(sp, d);
      c.y += dy / d * Math.min(sp, d);
      c.walk += dt;
      if (Math.abs(dx) > 1) c.face = dx > 0 ? 1 : -1;
    } else if (c.wait <= 0) {
      c.wait = 1.5 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 160;
      const nx = c.hx + Math.cos(a) * r;
      const ny = c.hy + Math.sin(a) * r;
      if (walkable(w.save, nx, ny)) { c.tx = nx; c.ty = ny; }
    }
  }
}

// ---- 島の大きなものとのやりとり ----
/** 主人公のそばにある「できること」（関門・修理・地熱炉・発着場・故障ロボ） */
export function nearAction(w) {
  const s = w.save;
  const h = w.hero;
  const near = (x, y, r) => Math.hypot(x - h.x, (y - h.y) * 1.2) <= r;
  for (const g of GATES) {
    if (s.gates[g.id]) continue;
    const c = gateCenter(g);
    if (near(c.x, c.y, 300)) return { kind: 'gate', gate: g };
  }
  const wr = LANDMARKS.wreck;
  if (!s.boilerFixed && near(wr.x, wr.y, 320)) return { kind: 'boiler' };
  for (const b of BROKEN_BOTS) {
    if (s.fixed.includes(b.id)) continue;
    if (near(b.x, b.y, 170) && reachable(w, b.x, b.y)) return { kind: 'bot', bot: b };
  }
  const re = LANDMARKS.reactor;
  if (!s.reactorOn && s.era >= 3 && near(re.x, re.y, 300)) return { kind: 'reactor' };
  const dk = LANDMARKS.dock;
  if (!s.cleared && reachable(w, dk.x, dk.y) && near(dk.x, dk.y, 340)) return { kind: 'ship' };
  return null;
}

export function gateBlock(s, g) {
  if (g.needEra && s.era < g.needEra) return '地熱炉を動かして、島じゅうに蒸気が届くようにする必要があります';
  if (g.need?.tool && s.tool < g.need.tool) return '石の道具が必要です（作業台で作れます）';
  return null;
}
export function openGate(w, id) {
  const s = w.save;
  const g = GATES.find((x) => x.id === id);
  if (!g || s.gates[id] || gateBlock(s, g) || !canPay(s, g.cost)) return false;
  pay(s, g.cost);
  s.gates[id] = true;
  w.reach = computeReach(s);
  w.events.push({ type: 'gate', id });
  return true;
}
export function repairBoiler(w) {
  const s = w.save;
  if (s.boilerFixed || !canPay(s, BOILER_REPAIR)) return false;
  pay(s, BOILER_REPAIR);
  s.boilerFixed = true;
  s.era = Math.max(s.era, 2);
  const wr = LANDMARKS.wreck;
  s.buildings.push({ id: `k${s.nextId++}`, type: 'boiler', x: wr.x + 230, y: wr.y + 170, lv: 1, fuel: 3, burn: 0, fixedWreck: true });
  w.events.push({ type: 'era', era: 2 });
  return true;
}
export function repairBot(w, id) {
  const s = w.save;
  const b = BROKEN_BOTS.find((x) => x.id === id);
  if (!b || s.fixed.includes(id) || !canPay(s, b.cost)) return false;
  pay(s, b.cost);
  s.fixed.push(id);
  syncBots(w);
  w.events.push({ type: 'botFixed', id, bot: b.type });
  return true;
}
export function startReactor(w) {
  const s = w.save;
  if (s.reactorOn || s.era < 3 || !canPay(s, REACTOR_COST)) return false;
  pay(s, REACTOR_COST);
  s.reactorOn = true;
  s.era = 4;
  w.events.push({ type: 'era', era: 4 });
  return true;
}
export function shipNeeds(s) {
  return Object.fromEntries(Object.entries(SHIP).map(([k, n]) => [k, n - s.ship[k]]).filter(([, n]) => n > 0));
}
export function deliverShip(w) {
  const s = w.save;
  let n = 0;
  for (const [k, need] of Object.entries(shipNeeds(s))) {
    const k2 = Math.min(need, have(s, k));
    if (k2 <= 0) continue;
    pay(s, { [k]: k2 });
    s.ship[k] += k2;
    n += k2;
  }
  if (!n) return 0;
  w.events.push({ type: 'shipPart', n });
  if (s.ship.frame >= SHIP.frame && !s.seen.includes('frameDone')) queueTalk(s, 'frameDone');
  if (!Object.keys(shipNeeds(s)).length) {
    s.cleared = true;
    s.quest = QUESTS.length;
    queueTalk(s, 'ending');
    w.events.push({ type: 'shipDone' });
  }
  return n;
}

export const shipFrameBuilt = (s) => s.ship.frame >= SHIP.frame;

// ---- 目標 ----
export function questTarget(w) {
  const s = w.save;
  const q = QUESTS[s.quest];
  if (!q) return null;
  if (q.kind === 'gate') return gateCenter(GATES.find((g) => g.id === q.gate));
  if (q.at === 'bench') return s.buildings.find((b) => b.type === 'bench');
  if (q.at && LANDMARKS[q.at]) return LANDMARKS[q.at];
  if (q.at) return BROKEN_BOTS.find((b) => b.id === q.at) ?? null;
  return null;
}
export function questDone(w, q) {
  const s = w.save;
  const h = w.hero;
  switch (q.kind) {
    case 'near': { const t = LANDMARKS[q.at]; return Math.hypot(t.x - h.x, t.y - h.y) < Math.max(380, t.radius + 260); }
    case 'have': return Object.entries(q.need).every(([k, n]) => have(s, k) >= n);
    case 'tool': return s.tool >= q.level;
    case 'gate': return !!s.gates[q.gate];
    case 'build': return s.buildings.some((b) => b.type === q.machine);
    case 'boiler': return s.boilerFixed;
    case 'bot': return s.fixed.includes(q.at);
    case 'belt': return s.links.length > 0;
    case 'reactor': return s.reactorOn;
    case 'ship': return s.cleared;
    default: return false;
  }
}
function checkQuest(w) {
  const s = w.save;
  for (let guard = 0; guard < 3; guard++) {
    const q = QUESTS[s.quest];
    if (!q || !questDone(w, q)) return;
    s.quest++;
    if (q.id === 'lab') s.era = Math.max(s.era, 3);
    if (q.talk) queueTalk(s, q.talk);
    w.events.push({ type: 'quest', id: q.id });
  }
}

// ---- 会話 ----
export function queueTalk(s, id) {
  if (s.seen.includes(id) || s.pending.includes(id)) return;
  s.pending.push(id);
}
export function ackTalk(s, id) {
  s.pending = s.pending.filter((x) => x !== id);
  if (!s.seen.includes(id) && DIALOGUES[id]) s.seen.push(id);
}

export { ITEM_IDS };

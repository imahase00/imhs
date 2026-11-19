// 漂流発明記の自動プレイ: クリアまで行けるか（行き止まりがないか）と、かかる時間の目安を測る。
// 使い方: node tools/sim-drift.mjs [回数=3] [--log]
import { writeFileSync } from 'node:fs';
import * as S from '../docs/games/drift-1/sim.js';
import {
  NODES, NODE_KINDS, LANDMARKS, GATES, QUESTS, MACHINES, RECIPES, BENCH, BOILER_REPAIR, REACTOR_COST, BROKEN_BOTS, SHIP, CELL, WORLD,
} from '../docs/games/drift-1/data.js';

const RUNS = Number(process.argv[2] || 3);
const LOG = process.argv.includes('--log');
// --dump=目標ID:ファイル  その目標に着いた時点のセーブを書き出す（画面確認・E2E 用）
const DUMP = process.argv.find((a) => a.startsWith('--dump='))?.slice(7).split(':');
const DT = 0.1;
const LIMIT = 6 * 3600;   // ゲーム内6時間で打ち切り

class Stuck extends Error {}

function run(seed) {
  const s = S.newSave(seed);
  s.pending = [];
  const w = S.createWorld(s);
  let lastQuest = -1;
  const log = (...a) => { if (LOG) console.log(`[${fmt(w.t)}]`, ...a); };
  const tick = (input = { x: 0, y: 0 }) => {
    S.step(w, input, DT);
    if (w.t > LIMIT) throw new Stuck(`時間切れ（目標 ${QUESTS[s.quest]?.id}）`);
    if (s.quest !== lastQuest) {
      lastQuest = s.quest;
      log('目標', QUESTS[s.quest]?.id ?? 'クリア');
      if (DUMP && QUESTS[s.quest]?.id === DUMP[0]) { S.syncSave(w); writeFileSync(DUMP.slice(1).join(':'), JSON.stringify(s)); }
    }
  };
  const wait = (sec) => { const end = w.t + sec; while (w.t < end) tick(); };

  // ---- 歩く（細かいマスで道を探す）----
  const G = 50;
  const N = WORLD.w / G;
  let gridKey = '';
  let blockedGrid = null;
  const grid = () => {
    const key = `${s.buildings.length}|${Object.keys(s.gates).length}`;
    if (key === gridKey) return blockedGrid;
    gridKey = key;
    blockedGrid = new Uint8Array(N * N);
    const sol = S.solids(w);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = i * G + G / 2;
        const y = j * G + G / 2;
        let bad = !S.walkable(s, x, y) || !S.walkable(s, x + 22, y) || !S.walkable(s, x - 22, y);
        if (!bad) for (const o of sol) if (Math.hypot(x - o.x, (y - o.y) * 1.4) < o.r + 24) { bad = true; break; }
        blockedGrid[j * N + i] = bad ? 1 : 0;
      }
    }
    return blockedGrid;
  };
  const path = (tx, ty) => {
    const b = grid();
    const si = Math.floor(w.hero.x / G);
    const sj = Math.floor(w.hero.y / G);
    const prev = new Int32Array(N * N).fill(-1);
    const start = sj * N + si;
    prev[start] = start;
    const q = [start];
    let best = start;
    let bestD = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const ci = c % N;
      const cj = (c / N) | 0;
      const d = Math.hypot(ci * G + G / 2 - tx, cj * G + G / 2 - ty);
      if (d < bestD) { bestD = d; best = c; }
      if (d < G) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        if (prev[n] !== -1 || (b[n] && n !== start)) continue;
        if (di && dj && (b[cj * N + ni] || b[nj * N + ci])) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    const out = [];
    for (let c = best; c !== start; c = prev[c]) out.push({ x: (c % N) * G + G / 2, y: ((c / N) | 0) * G + G / 2 });
    return out.reverse();
  };
  const goTo = (tx, ty, near = 40) => {
    let pts = path(tx, ty);
    pts.push({ x: tx, y: ty });
    let guard = 0;
    let lastPos = { x: w.hero.x, y: w.hero.y, t: w.t };
    while (pts.length) {
      const p = pts[0];
      const dx = p.x - w.hero.x;
      const dy = p.y - w.hero.y;
      const d = Math.hypot(dx, dy);
      const last = pts.length === 1;
      if (d < (last ? near : 30)) { pts.shift(); continue; }
      tick({ x: dx / d, y: dy / d });
      if (++guard > 20000) throw new Stuck('歩けない');
      if (w.t - lastPos.t > 3) {
        if (Math.hypot(w.hero.x - lastPos.x, w.hero.y - lastPos.y) < 20) {
          if (last) return false;   // 目的地の手前で止まった（建物など）
          pts.shift();
        }
        lastPos = { x: w.hero.x, y: w.hero.y, t: w.t };
      }
    }
    tick();
    return true;
  };
  const nearestStore = () => s.buildings.filter((b) => S.machineOf(b.type).role === 'store')
    .sort((a, b) => Math.hypot(a.x - w.hero.x, a.y - w.hero.y) - Math.hypot(b.x - w.hero.x, b.y - w.hero.y))[0];
  const visit = (b) => { goTo(b.x, b.y + S.machineOf(b.type).radius + 60, 60); wait(0.5); };
  const deposit = () => { if (S.bagCount(s) > 0) visit(nearestStore()); };

  // ---- 手で採る ----
  const gatherOne = (item, n) => {
    const kinds = Object.entries(NODE_KINDS).filter(([, k]) => k.item === item).map(([k]) => k);
    const nodes = NODES.filter((x) => kinds.includes(x.kind) && S.reachable(w, x.x, x.y))
      .sort((a, b) => Math.hypot(a.x - w.hero.x, a.y - w.hero.y) - Math.hypot(b.x - w.hero.x, b.y - w.hero.y));
    if (!nodes.length) throw new Stuck(`${item} の資源に行けない`);
    for (const nd of nodes.slice(0, 4)) {
      const r = NODE_KINDS[nd.kind].radius;
      for (const [ox, oy] of [[0, r + 60], [r + 60, 0], [-r - 60, 0], [0, -r - 50]]) {
        goTo(nd.x + ox, nd.y + oy, 30);
        const before = S.have(s, item) + (s.bag[item] ?? 0) * 0;
        const t0 = w.t;
        while (S.have(s, item) < n && S.bagCount(s) < S.bagCap(s) && w.t - t0 < 60) {
          tick();
          if (w.t - t0 > 2.5 && S.have(s, item) === before) break;
        }
        if (S.have(s, item) > before) return;
      }
    }
    throw new Stuck(`${item} を採れない`);
  };

  // ---- 物を手に入れる ----
  const factoryOut = (item) => s.buildings.filter((b) => (b.out?.[item] ?? 0) > 0)
    .sort((a, b) => b.out[item] - a.out[item])[0];
  const machinesFor = (item) => s.buildings.filter((b) => S.machineOf(b.type).role === 'process' && RECIPES[b.recipe].out === item);
  const autoMade = (item) => s.buildings.some((b) => {
    const m = S.machineOf(b.type);
    if (m.role === 'extract') return (m.out ?? NODE_KINDS[S.nodeById(b.node).kind].item) === item && S.isPowered(w, b);
    return m.role === 'process' && RECIPES[b.recipe].out === item && S.isPowered(w, b);
  });
  const acquire = (item, n, depth = 0) => {
    if (depth > 6) throw new Stuck(`入れ子が深すぎる: ${item}`);
    let guard = 0;
    while (S.have(s, item) < n) {
      if (++guard > 400) throw new Stuck(`${item} が集まらない（袋${S.bagCount(s)}/${S.bagCap(s)} 位置${Math.round(w.hero.x)},${Math.round(w.hero.y)} 持ち${JSON.stringify(s.bag)}）`);
      if (guard % 15 === 0) log('  集め中', item, `${S.have(s, item)}/${n}`, 'depth', depth, '袋', JSON.stringify(s.bag), '倉庫', JSON.stringify(s.pool));
      if (S.bagCount(s) >= S.bagCap(s)) { deposit(); continue; }
      const f = factoryOut(item);
      if (f && (f.out[item] >= 3 || !NODE_KINDS_ITEM.has(item))) { visit(f); continue; }
      // 自動で作られているなら、少し待つ（ロボが倉庫へ運ぶ）
      if (autoMade(item) && S.botCounts(s).carry + s.drones > 0 && depth === 0 && waitAuto(item, n)) continue;
      if (NODE_KINDS_ITEM.has(item)) { gatherOne(item, n); continue; }
      if (item === 'plank') {
        const k = Math.min(10, n - S.have(s, 'plank'));
        acquire('wood', 2 * k, depth + 1);
        S.craft(w, 'plank', k);
        continue;
      }
      const r = Object.values(RECIPES).find((x) => x.out === item);
      if (!r) throw new Stuck(`${item} の作り方がない`);
      let mc = machinesFor(item)[0];
      if (!mc) mc = ensureMachineFor(r, depth);
      if (!mc) throw new Stuck(`${item} を作る機械がない`);
      if (!S.isPowered(w, mc)) { fuel(mc); }
      // 材料を袋に入れて機械へ
      const times = Math.max(1, Math.min(3, Math.ceil((n - S.have(s, item)) / r.n)));
      for (const [k, q] of Object.entries(r.in)) {
        const want = q * times - (mc.inp[k] ?? 0);
        if (want > 0) acquire(k, want, depth + 1);
      }
      // 倉庫から必要な分を持ち出して機械へ
      visit(nearestStore());
      for (const [k, q] of Object.entries(r.in)) S.takeFromPool(w, k, Math.max(0, q * times - (mc.inp[k] ?? 0)));
      visit(mc);
      const t0 = w.t;
      while (!(mc.out?.[item] > 0) && w.t - t0 < r.time * times + 20) tick();
      wait(Math.min(20, r.time * (times - 1)));
      visit(mc);
    }
  };
  const NODE_KINDS_ITEM = new Set(Object.values(NODE_KINDS).map((k) => k.item));
  const waitAuto = (item, n) => {
    const before = S.have(s, item);
    const t0 = w.t;
    while (w.t - t0 < 40 && S.have(s, item) < n) tick();
    return S.have(s, item) > before;
  };
  const fuel = (boilerUser) => {
    if (s.reactorOn) return;
    const b = s.buildings.filter((x) => x.type === 'boiler').sort((a, c) => Math.hypot(a.x - boilerUser.x, a.y - boilerUser.y) - Math.hypot(c.x - boilerUser.x, c.y - boilerUser.y))[0];
    if (!b || b.fuel >= 4) return;
    acquire('coal', 6);
    visit(nearestStore());
    S.takeFromPool(w, 'coal', 8);
    visit(b);
  };
  const payFor = (cost) => { for (const [k, n] of Object.entries(cost)) acquire(k, n); };
  // 指定地点の近くに置く（だめなら少しずつずらす）
  const build = (type, x, y) => {
    payFor(S.machineOf(type).cost);
    payFor(S.machineOf(type).cost);   // 途中で使った分を取り戻す
    for (let r = 0; r < 900; r += 60) {
      for (let a = 0; a < 12; a++) {
        const px = x + Math.cos(a * Math.PI / 6) * r;
        const py = y + Math.sin(a * Math.PI / 6) * r;
        const c = S.checkPlace(w, type, px, py);
        if (c.ok) {
          const res = S.place(w, type, px, py);
          log('建てた', type, Math.round(c.x), Math.round(c.y));
          return res.building;
        }
        if (r === 0) break;
      }
    }
    throw new Stuck(`${type} を置ける場所がない (${x},${y})`);
  };
  const ensureMachineFor = (r, depth) => {
    const type = Object.entries(MACHINES).find(([, m]) => m.recipes?.includes(Object.keys(RECIPES).find((k) => RECIPES[k] === r)) && m.era <= s.era)?.[0];
    if (!type) return null;
    const recipeId = Object.keys(RECIPES).find((k) => RECIPES[k] === r);
    const same = s.buildings.find((b) => b.type === type && b.recipe !== recipeId && !machinesFor(RECIPES[b.recipe].out).filter((x) => x !== b).length === false);
    void same;
    const st = nearestStore();
    const b = build(type, st.x + 220, st.y + 60);
    S.setRecipe(w, b.id, recipeId);
    void depth;
    return b;
  };

  // ---- 計画した工場（時代ごとに建てる）----
  const extractorOn = (type, kind, near, maxD = 900) => {
    const nd = NODES.filter((x) => x.kind === kind && S.reachable(w, x.x, x.y) && !S.nodeTaken(w, x.id) && Math.hypot(x.x - near.x, x.y - near.y) < maxD)
      .sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y))[0];
    if (!nd) return null;
    payFor(S.machineOf(type).cost);
    const r = S.place(w, type, nd.x, nd.y);
    if (!r.ok) { log('置けない', type, kind, r.why); return null; }
    log('建てた', type, kind);
    return r.building;
  };
  const processor = (type, recipe, x, y) => {
    const b = build(type, x, y);
    S.setRecipe(w, b.id, recipe);
    return b;
  };
  const visitAt = (x, y) => goTo(x, y, 40);

  // ---- 進める ----
  const steps = {
    wake: () => visitAt(LANDMARKS.wreck.x + 200, LANDMARKS.wreck.y + 150),
    gather: () => { acquire('wood', 6); acquire('stone', 6); },
    tool: () => { payFor(BENCH.find((x) => x.id === 'tool1').cost); S.craft(w, 'tool1'); },
    log: () => { const c = S.gateCenter(GATES[0]); goTo(c.x, c.y + 150, 80); S.openGate(w, 'log'); },
    furnace: () => {
      // 浜辺の倉庫のそばで手で作るより、森に拠点を作る
      build('store', 3000, 3700);
      processor('furnace', 'copper-plate', 3300, 3550);
    },
    copper: () => acquire('copper-plate', 6),
    boiler: () => { payFor(BOILER_REPAIR); goTo(LANDMARKS.wreck.x + 250, LANDMARKS.wreck.y + 250, 100); S.repairBoiler(w); },
    drill: () => {
      // 森の真ん中にボイラーを建て、銅・石炭のドリルと製材機
      const fb = build('boiler', 3250, 3300);
      fuelBoiler(fb);
      extractorOn('drill', 'coal', fb);
      extractorOn('drill', 'copper', fb);
    },
    bot: () => { const b = BROKEN_BOTS[0]; payFor(b.cost); goTo(b.x, b.y + 120, 80); S.repairBot(w, b.id); fixAll(); },
    bridge1: () => { payFor(GATES[1].cost); const c = S.gateCenter(GATES[1]); goTo(c.x + 220, c.y, 80); S.openGate(w, 'bridge1'); },
    iron: () => {
      // 西に鉄の工場
      const wb = build('boiler', 1300, 3150);
      fuelBoiler(wb);
      build('store', 1500, 3200);
      extractorOn('drill', 'iron', wb);
      extractorOn('drill', 'iron', wb);
      extractorOn('drill', 'coal', wb);
      processor('furnace', 'iron-plate', 1200, 2950);
      fixAll();
      acquire('iron-plate', 12);
    },
    bridge2: () => { payFor(GATES[2].cost); const c = S.gateCenter(GATES[2]); goTo(c.x - 220, c.y, 80); S.openGate(w, 'bridge2'); },
    lab: () => visitAt(LANDMARKS.lab.x, LANDMARKS.lab.y + 300),
    belt: () => {
      fixAll();
      const st = s.buildings.find((b) => b.type === 'store' && b.x < 2000);
      const fur = s.buildings.find((b) => b.type === 'furnace' && b.x < 2000);
      for (const d of s.buildings.filter((b) => b.type === 'drill' && b.x < 2000)) { payFor(S.beltCost(d, fur)); S.addLink(w, d.id, fur.id); }
      payFor(S.beltCost(fur, st)); S.addLink(w, fur.id, st.id);
    },
    parts: () => {
      const roll = processor('roller', 'pipe', 1650, 3500);
      const asm = processor('assembler', 'gear', 1400, 3500);
      const st = s.buildings.find((b) => b.type === 'store' && b.x < 2000);
      for (const m of [roll, asm]) { payFor(S.beltCost(m, st)); S.addLink(w, m.id, st.id); }
      processor('furnace', 'copper-plate', 1700, 2800);
      extractorOn('drill', 'copper', { x: 1500, y: 3000 }, 1200);
      fixAll();
      acquire('gear', 24); acquire('pipe', 24);
    },
    reactor: () => { payFor(REACTOR_COST); goTo(LANDMARKS.reactor.x, LANDMARKS.reactor.y + 200, 100); S.startReactor(w); },
    lift: () => { payFor(GATES[3].cost); const c = S.gateCenter(GATES[3]); goTo(c.x, c.y + 220, 80); S.openGate(w, 'lift'); },
    dock: () => visitAt(LANDMARKS.dock.x, LANDMARKS.dock.y + 300),
    ship: () => {
      // 大工場: 大型組立機2台と、綿花・布・鉄の増産
      fixAll();
      const ctr = { x: 3000, y: 3400 };
      build('warehouse', ctr.x - 300, ctr.y + 300);
      const ba1 = processor('bigassembler', 'frame', ctr.x - 300, ctr.y - 100);
      const ba2 = processor('bigassembler', 'envelope', ctr.x + 300, ctr.y - 100);
      for (const n of ['iron', 'iron']) extractorOn('bigdrill', n, { x: 1200, y: 3000 }, 1600);
      processor('furnace', 'iron-plate', 1300, 2600);
      const loom = processor('loom', 'cloth', 4600, 3700);
      for (let i = 0; i < S.minersFree(w); i++) extractorOn('minerbot', 'cotton', loom, 1500);
      build('store', 4400, 3600);
      for (const part of ['frame', 'envelope', 'engine', 'propeller']) {
        const ba = part === 'frame' || part === 'engine' ? ba1 : ba2;
        S.setRecipe(w, ba.id, part);
        while (s.ship[part] + S.have(s, part) < SHIP[part]) acquire(part, S.have(s, part) + 1);
        goTo(LANDMARKS.dock.x, LANDMARKS.dock.y + 300, 120);
        S.deliverShip(w);
      }
    },
  };
  const fuelBoiler = (b) => {
    acquire('coal', 8);
    visit(nearestStore());
    S.takeFromPool(w, 'coal', 10);
    visit(b);
  };
  const fixAll = () => {
    for (const b of BROKEN_BOTS) {
      if (s.fixed.includes(b.id) || !S.reachable(w, b.x, b.y)) continue;
      const missing = S.missing(s, b.cost);
      if (missing.length && s.era < 2) continue;
      payFor(b.cost);
      goTo(b.x, b.y + 120, 100);
      if (S.repairBot(w, b.id)) log('ロボを直した', b.id);
    }
  };

  const t0 = w.t;
  const marks = {};
  try {
    while (!s.cleared) {
      const q = QUESTS[s.quest];
      const before = s.quest;
      steps[q.id]();
      marks[q.id] = w.t - t0;
      let g2 = 0;
      while (s.quest === before && !s.cleared) { tick(); if (++g2 > 600) throw new Stuck(`目標「${q.id}」が終わらない（位置${Math.round(w.hero.x)},${Math.round(w.hero.y)}）`); }
    }
  } catch (e) {
    if (!(e instanceof Stuck)) throw e;
    return { ok: false, t: w.t, why: e.message, quest: QUESTS[s.quest]?.id, marks };
  }
  return { ok: true, t: w.t, marks, built: s.buildings.length, gathered: s.stats.gathered };
}

const fmt = (sec) => { const r = Math.round(sec); return `${Math.floor(r / 60)}分${String(r % 60).padStart(2, '0')}秒`; };
const res = [];
for (let i = 0; i < RUNS; i++) {
  const r = run(1000 + i * 7919);
  res.push(r);
  console.log(`${i + 1}回目: ${r.ok ? 'クリア' : `止まった（${r.why}）`} ${fmt(r.t)}${r.ok ? `・建物${r.built}・手で採った${r.gathered}` : ''}`);
  if (LOG || i === 0) console.log('  ' + Object.entries(r.marks).map(([k, v]) => `${k}:${Math.round(v / 60)}分`).join(' '));
}
const ok = res.filter((r) => r.ok);
if (ok.length) console.log(`平均 ${fmt(ok.reduce((a, r) => a + r.t, 0) / ok.length)}（${ok.length}/${res.length} 回クリア）`);
process.exit(ok.length === res.length ? 0 : 1);

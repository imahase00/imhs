// 漂流発明記の計算のテスト: node --test tests/drift.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../docs/games/drift-1/sim.js';
import { validate, upgrade, describe } from '../docs/games/drift-1/save-schema.js';
import {
  NODES, GATES, LANDMARKS, QUESTS, SHIP, STOCK_LIMIT, POWER, BROKEN_BOTS, BOILER_REPAIR, GRID, MAP, MACHINES,
} from '../docs/games/drift-1/data.js';

const fresh = () => { const s = S.newSave(7); s.pending = []; return { s, w: S.createWorld(s) }; };
const run = (w, sec, input = { x: 0, y: 0 }) => { for (let t = 0; t < sec; t += 0.1) S.step(w, input, 0.1); };
const give = (s, items) => { for (const [k, n] of Object.entries(items)) s.pool[k] = (s.pool[k] ?? 0) + n; };

test('新しいセーブは正しい形で、浜辺から始まる', () => {
  const { s, w } = fresh();
  assert.deepEqual(validate(s), []);
  assert.ok(S.reachable(w, s.hero.x, s.hero.y));
  assert.equal(MAP.length, GRID);
  assert.ok(MAP.every((r) => r.length === GRID));
});

test('関門を開けるまで、先の地域へは行けない（倒木→森）', () => {
  const { s, w } = fresh();
  const forest = { x: 3100, y: 3000 };
  assert.equal(S.reachable(w, forest.x, forest.y), false);
  assert.equal(S.openGate(w, 'log'), false, '石の道具なしではどかせない');
  s.tool = 1;
  assert.equal(S.openGate(w, 'log'), true);
  assert.equal(S.reachable(w, forest.x, forest.y), true);
  assert.equal(S.reachable(w, 1000, 3000), false, '西の岩山は橋を直すまで行けない');
});

test('どの資源・ロボ・大きな建物も、関門をすべて開ければ歩いて行ける', () => {
  const { s, w } = fresh();
  for (const g of GATES) s.gates[g.id] = true;
  w.reach = S.computeReach(s);
  for (const n of NODES) assert.ok(S.reachable(w, n.x, n.y), `資源 ${n.id} (${n.x},${n.y})`);
  for (const b of BROKEN_BOTS) assert.ok(S.reachable(w, b.x, b.y), `ロボ ${b.id}`);
  for (const [k, l] of Object.entries(LANDMARKS)) assert.ok(S.reachable(w, l.x, l.y + l.radius + 60) || S.reachable(w, l.x, l.y), `${k}`);
});

test('木のそばで立ち止まると手で採れ、倉庫のそばを通ると袋の中身がしまわれる', () => {
  const { s, w } = fresh();
  const tree = NODES.find((n) => n.kind === 'tree' && n.y > 4300);
  w.hero.x = tree.x;
  w.hero.y = tree.y + 90;
  run(w, 5);
  assert.ok((s.bag.wood ?? 0) >= 3, `袋 ${JSON.stringify(s.bag)}`);
  const store = s.buildings.find((b) => b.type === 'store');
  w.hero.x = store.x;
  w.hero.y = store.y + 120;
  run(w, 0.5);
  assert.equal(S.bagCount(s), 0);
  assert.ok(s.pool.wood >= 3);
});

test('袋がいっぱいなら、それ以上は採れない', () => {
  const { s, w } = fresh();
  s.bag = { stone: S.bagCap(s) };
  const rock = NODES.find((n) => n.kind === 'rock' && n.y > 4300);
  w.hero.x = rock.x;
  w.hero.y = rock.y + 100;
  run(w, 4);
  assert.equal(S.bagCount(s), S.bagCap(s));
  assert.equal(w.hero.full, true);
});

test('採掘機は資源のそばにしか置けず、建物どうしは離して置く', () => {
  const { s, w } = fresh();
  give(s, { wood: 50, stone: 50 });
  const r1 = S.checkPlace(w, 'handdrill', 2900, 5200);
  assert.equal(r1.ok, false);
  const rock = NODES.find((n) => n.kind === 'rock' && n.y > 4300);
  const r2 = S.place(w, 'handdrill', rock.x + 40, rock.y);
  assert.equal(r2.ok, true);
  assert.equal(r2.building.node, rock.id);
  assert.equal(S.checkPlace(w, 'handdrill', rock.x, rock.y).ok, false, '同じ資源には1台まで');
  const bench = s.buildings.find((b) => b.type === 'bench');
  assert.equal(S.checkPlace(w, 'store', bench.x + 40, bench.y).ok, false);
  assert.equal(S.checkPlace(w, 'boiler', 2800, 5300).ok, false, 'まだ作れない時代の機械');
});

test('炉は材料がそろうと金属の板を作り、蒸気は要らない', () => {
  const { s, w } = fresh();
  give(s, { stone: 20, wood: 10 });
  const f = S.place(w, 'furnace', 3400, 5200).building;
  f.inp = { 'copper-ore': 2, coal: 2 };
  run(w, 8);
  assert.equal(f.out['copper-plate'], 2);
});

test('蒸気ドリルは、石炭の燃えているボイラーの円の中でだけ動く', () => {
  const { s, w } = fresh();
  s.era = 2;
  for (const g of GATES) s.gates[g.id] = true;
  w.reach = S.computeReach(s);
  give(s, { plank: 50, 'copper-plate': 50, stone: 50 });
  const coal = NODES.find((n) => n.kind === 'coal' && n.x < 2000);
  const d = S.place(w, 'drill', coal.x, coal.y).building;
  run(w, 5);
  assert.equal(Object.keys(d.out).length, 0, '蒸気なし');
  const b = S.place(w, 'boiler', coal.x + 300, coal.y - 50).building;
  assert.ok(b, 'ボイラーを置けた');
  b.fuel = 2;
  run(w, 8);
  assert.ok(d.out.coal >= 1, '蒸気が届くと掘る');
  assert.ok(b.fuel < 2);
  b.fuel = 0; b.burn = 0;
  const before = d.out.coal;
  run(w, 8);
  assert.equal(d.out.coal, before, '石炭が切れると止まる');
  assert.ok(POWER.radius > 300);
});

test('倉庫に十分ある物は作るのを休み、飛行船の部品は必要な数だけ作る', () => {
  const { s, w } = fresh();
  give(s, { stone: 20, wood: 10, 'copper-plate': STOCK_LIMIT });
  const f = S.place(w, 'furnace', 3400, 5200).building;
  f.inp = { 'copper-ore': 3, coal: 3 };
  run(w, 8);
  assert.ok(S.stocked(w, f));
  assert.equal(Object.keys(f.out).length, 0);
  assert.equal(S.stockLimit(s, 'frame'), SHIP.frame);
  s.ship.frame = SHIP.frame;
  assert.equal(S.stockLimit(s, 'frame'), 0);
});

test('ベルトは、つないだ先が使う物だけを運ぶ', () => {
  const { s, w } = fresh();
  s.era = 3;
  give(s, { stone: 40, wood: 40, plank: 40 });
  const rock = NODES.find((n) => n.kind === 'rock' && n.y > 4300 && n.x > 3000);
  const d = S.place(w, 'handdrill', rock.x, rock.y).building;
  d.out = { stone: 5 };
  const f = S.place(w, 'furnace', rock.x + 350, rock.y + 100).building;
  assert.equal(S.addLink(w, d.id, f.id).ok, true);
  run(w, 10);
  assert.equal(f.inp.stone, undefined, '炉は石を使わないので運ばない');
  const store = s.buildings.find((b) => b.type === 'store');
  const st = S.place(w, 'store', rock.x - 300, rock.y + 150).building ?? store;
  assert.equal(S.addLink(w, d.id, st.id).ok, true);
  const before = s.pool.stone ?? 0;
  run(w, 25);
  assert.ok((s.pool.stone ?? 0) > before, '倉庫へは何でも運ぶ');
});

test('直した運搬ロボは、機械にたまった物を倉庫へ運ぶ', () => {
  const { s, w } = fresh();
  give(s, { stone: 40, wood: 40, ...BROKEN_BOTS[0].cost });
  s.gates.log = true;
  w.reach = S.computeReach(s);
  assert.equal(S.repairBot(w, 'b1'), true);
  const rock = NODES.find((n) => n.kind === 'rock' && n.y > 4300);
  const d = S.place(w, 'handdrill', rock.x, rock.y).building;
  d.out = { stone: 6 };
  const before = s.pool.stone ?? 0;
  run(w, 90);
  assert.ok((s.pool.stone ?? 0) >= before + 4, `倉庫の石 ${s.pool.stone}`);
});

test('ボイラーの修理で蒸気の時代、研究所で工場の時代、地熱炉で大工場の時代', () => {
  const { s, w } = fresh();
  give(s, BOILER_REPAIR);
  assert.equal(S.repairBoiler(w), true);
  assert.equal(s.era, 2);
  assert.ok(s.buildings.some((b) => b.type === 'boiler' && b.fixedWreck));
  s.quest = QUESTS.findIndex((q) => q.id === 'lab');
  for (const g of GATES) s.gates[g.id] = true;
  w.reach = S.computeReach(s);
  w.hero.x = LANDMARKS.lab.x;
  w.hero.y = LANDMARKS.lab.y + 250;
  run(w, 0.3);
  assert.equal(s.era, 3);
  assert.ok(s.pending.includes('lab'));
  give(s, { gear: 100, pipe: 100, 'iron-plate': 100 });
  assert.equal(S.startReactor(w), true);
  assert.equal(s.era, 4);
  // 大工場の時代は、ボイラーがなくても蒸気の機械が動く
  give(s, { 'iron-plate': 50, gear: 50, pipe: 50 });
  const iron = NODES.find((n) => n.kind === 'iron');
  const bd = S.place(w, 'bigdrill', iron.x, iron.y).building;
  run(w, 3);
  assert.ok(bd.out['iron-ore'] >= 1);
});

test('飛行船の部品をすべて納めるとクリアし、旅立ちの会話が始まる', () => {
  const { s, w } = fresh();
  for (const g of GATES) s.gates[g.id] = true;
  w.reach = S.computeReach(s);
  s.quest = QUESTS.findIndex((q) => q.id === 'ship');
  give(s, { engine: 1 });
  assert.equal(S.deliverShip(w), 1);
  assert.equal(s.cleared, false);
  give(s, Object.fromEntries(Object.entries(SHIP).map(([k, n]) => [k, n])));
  S.deliverShip(w);
  assert.equal(s.cleared, true);
  assert.ok(s.pending.includes('ending'));
  assert.equal(s.pool.engine, 1, '余った部品は倉庫に残る');
  assert.deepEqual(validate(s), []);
});

test('片づけると材料が倉庫に戻り、最後の倉庫と作業台は片づけられない', () => {
  const { s, w } = fresh();
  give(s, { stone: 14, wood: 4 });
  const f = S.place(w, 'furnace', 3400, 5200).building;
  assert.equal(s.pool.stone ?? 0, 0);
  assert.equal(S.removeBuilding(w, f.id), true);
  assert.equal(s.pool.stone, MACHINES.furnace.cost.stone);
  assert.equal(S.removeBuilding(w, s.buildings.find((b) => b.type === 'store').id), false);
  assert.equal(S.removeBuilding(w, s.buildings.find((b) => b.type === 'bench').id), false);
});

test('自動プレイで作った途中のセーブは正しく読め、壊れたセーブは拒否する', () => {
  for (const f of ['tests/fixtures/drift-parts.json', 'tests/fixtures/drift-ship.json']) {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    const r = upgrade(d, 1);
    assert.equal(r.ok, true, `${f}: ${r.error}`);
    const info = describe(r.data, new Date().toISOString());
    assert.ok(info.rows.length >= 4);
    assert.ok(typeof info.label === 'string');
  }
  const bad = S.newSave(1);
  bad.buildings.push({ id: 'k1', type: 'store', x: 10, y: 10, lv: 1 });
  assert.equal(upgrade(bad, 1).ok, false, '番号の重複');
  const bad2 = S.newSave(1);
  bad2.pool = { gold: 3 };
  assert.equal(upgrade(bad2, 1).ok, false, '知らない物');
  assert.equal(upgrade(S.newSave(1), 99).ok, false, '新しすぎる版');
});

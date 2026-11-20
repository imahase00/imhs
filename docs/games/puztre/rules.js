// パズトレ: 盤面とルールの計算（画面に依存しない。テスト・自動プレイからも使う）
import {
  SCHEMA, COLS, ROWS, COLORS, HEART, MOVE_TIME, COMBO_STEP, BIG_GROUP, BIG_MULT, WEAK, RESIST,
  BASE_HP, BASE_POWER, HEAL_PER_ORB, MAX_TOOLS, TOOLS, TOOL_POWER, TOOL_HP, START_TOOLS, FRAMES,
  DUNGEONS, FLOORS, curveHp, curveDmg, trapCount, floorHpMult, TOOL_REWARD, COIN_FLOOR, COIN_CLEAR, TREASURES,
} from './data.js';

// ---- 乱数（mulberry32。状態は数値1つ） ----
export function rand(st) {
  st.rng = (st.rng + 0x6d2b79f5) >>> 0;
  let t = st.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickN = (st, arr, n) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};
const cidx = (name) => COLORS.indexOf(name);

// ---- 枠の効果 ----
export function frameMods(frameId) {
  return {
    time: frameId === 'sand' ? 1.5 : 0,
    heartWeight: frameId === 'moss' ? 2.2 : 1,
    trapMult: frameId === 'iron' ? 0.5 : 1,
    comboStep: COMBO_STEP + (frameId === 'gem' ? 0.1 : 0),
    coinMult: frameId === 'gold' ? 1.3 : 1,
    cdBonus: frameId === 'ancient' ? 1 : 0,
    bigMult: frameId === 'star' ? 2 : BIG_MULT,
  };
}

// ---- 盤面 ----
let nextId = 1;
const cell = (c) => ({ c, id: nextId++, stone: 0, ice: 0, dark: 0 });
function randColor(st, heartWeight = 1) {
  const total = 5 + heartWeight;
  const r = rand(st) * total;
  return r < 5 ? Math.floor(r) : HEART;
}
/** 3つ並びのない盤面をつくる */
export function newBoard(st, heartWeight = 1) {
  const b = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      let col;
      for (let k = 0; k < 20; k++) {
        col = randColor(st, heartWeight);
        const h = c >= 2 && row[c - 1].c === col && row[c - 2].c === col;
        const v = r >= 2 && b[r - 1][c].c === col && b[r - 2][c].c === col;
        if (!h && !v) break;
      }
      row.push(cell(col));
    }
    b.push(row);
  }
  return b;
}
export const cloneBoard = (b) => b.map((row) => row.map((x) => ({ ...x })));
const matchable = (x) => x && x.stone <= 0;

/** そろった組（同じ色でつながった消える球のまとまり）を探す */
export function findGroups(b) {
  const mark = b.map((row) => row.map(() => false));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = b[r][c];
      if (!matchable(x)) continue;
      if (c <= COLS - 3 && [1, 2].every((k) => matchable(b[r][c + k]) && b[r][c + k].c === x.c)) {
        let k = 0; while (c + k < COLS && matchable(b[r][c + k]) && b[r][c + k].c === x.c) mark[r][c + k++] = true;
      }
      if (r <= ROWS - 3 && [1, 2].every((k) => matchable(b[r + k][c]) && b[r + k][c].c === x.c)) {
        let k = 0; while (r + k < ROWS && matchable(b[r + k][c]) && b[r + k][c].c === x.c) mark[r + k++][c] = true;
      }
    }
  }
  const seen = b.map((row) => row.map(() => false));
  const groups = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!mark[r][c] || seen[r][c]) continue;
      const color = b[r][c].c;
      const cells = [];
      const q = [[r, c]];
      seen[r][c] = true;
      while (q.length) {
        const [y, x] = q.pop();
        cells.push([y, x]);
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy; const nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= ROWS || nx >= COLS || seen[ny][nx] || !mark[ny][nx] || b[ny][nx].c !== color) continue;
          seen[ny][nx] = true;
          q.push([ny, nx]);
        }
      }
      groups.push({ color, cells });
    }
  }
  return groups;
}

/** 組を消して球を落とし、空いた所に新しい球を足す。落ちる動きを返す */
export function clearAndFall(b, groups, st, heartWeight = 1) {
  for (const g of groups) for (const [r, c] of g.cells) b[r][c] = null;
  const falls = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (b[r][c]) {
        if (write !== r) { b[write][c] = b[r][c]; b[r][c] = null; falls.push({ id: b[write][c].id, from: r, to: write }); }
        write--;
      }
    }
    for (let r = write, k = 1; r >= 0; r--, k++) {
      b[r][c] = cell(randColor(st, heartWeight));
      falls.push({ id: b[r][c].id, from: -k, to: r });
    }
  }
  return falls;
}

/** 消えて落ちて、また消える…を最後まで。段階ごとの記録を返す */
export function resolveAll(b, st, heartWeight = 1) {
  const steps = [];
  for (let guard = 0; guard < 30; guard++) {
    const groups = findGroups(b);
    if (!groups.length) break;
    const falls = clearAndFall(b, groups, st, heartWeight);
    steps.push({ groups, falls });
  }
  return steps;
}

/** 指でなぞった道すじどおりに、つかんだ球を入れ替えていく */
export function applyPath(b, path) {
  for (let i = 1; i < path.length; i++) {
    const [r0, c0] = path[i - 1];
    const [r1, c1] = path[i];
    const t = b[r0][c0]; b[r0][c0] = b[r1][c1]; b[r1][c1] = t;
  }
}
export const canEnter = (b, r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && b[r][c].ice <= 0;

// ---- 探検隊 ----
export function party(tools, frameId) {
  const power = {};
  for (const col of COLORS) power[col] = BASE_POWER;
  let heal = HEAL_PER_ORB;
  for (const id of tools) {
    const t = TOOLS[id];
    if (t.color === 'heart') heal += 2; else power[t.color] += TOOL_POWER;
  }
  return { maxHp: BASE_HP + TOOL_HP * tools.length, power, heal, mods: frameMods(frameId) };
}

/** 1手の結果（消した球の数・コンボ・大きな組）から、色ごとの力と回復量を出す */
export function attackOf(steps, pt, buffs = {}) {
  const groups = steps.flatMap((s) => s.groups);
  const combos = groups.length;
  const step = pt.mods.comboStep * (buffs.lens > 0 ? 2 : 1);
  const mult = 1 + step * Math.max(0, combos - 1);
  const dmg = {};
  for (const col of COLORS) dmg[col] = 0;
  let heal = 0;
  let big = 0;
  let hearts = 0;
  for (const g of groups) {
    const n = g.cells.length;
    const k = n >= BIG_GROUP ? pt.mods.bigMult : 1;
    if (n >= BIG_GROUP) big++;
    const col = COLORS[g.color];
    if (g.color === HEART) { heal += n * pt.heal * k; hearts += n; } else dmg[col] += n * pt.power[col] * k;
  }
  for (const col of COLORS) dmg[col] = Math.round(dmg[col] * mult);
  return { dmg, heal: Math.round(heal * mult), combos, big, hearts };
}

export function factor(trap, col, buffs = {}) {
  if (col === trap.weak) return buffs.scope > 0 ? 3 : WEAK;
  if (col === trap.resist) return RESIST;
  return 1;
}

// ---- ダンジョンの冒険（1回分） ----
export function newRun(save, d, seed = (Math.random() * 2 ** 32) >>> 0) {
  const tools = save.loadout.slice(0, MAX_TOOLS);
  const pt = party(tools, save.frame);
  const run = {
    d, floor: 0, rng: seed >>> 0 || 1, tools, frame: save.frame,
    hp: pt.maxHp, maxHp: pt.maxHp,
    cds: Object.fromEntries(tools.map((t) => [t, Math.max(1, TOOLS[t].cd - pt.mods.cdBonus)])),
    buffs: { scope: 0, lens: 0, boots: 0, hourglass: 0 },
    coins: 0, turn: 0,
    stats: { maxCombo: 0, turns: 0, skills: 0 },
    boss: { hearts: 0, minHp: 1, skills: 0 },
    traps: [], target: 0, board: null,
  };
  startFloor(run);
  return run;
}
export const runParty = (run) => party(run.tools, run.frame);

export function startFloor(run) {
  const dg = DUNGEONS[run.d];
  const pt = runParty(run);
  run.traps = [];
  if (run.floor < FLOORS) {
    const kinds = pickN(run, dg.traps, trapCount(run.floor));
    for (const k of kinds) {
      const hp = Math.round(curveHp(k.hp) * floorHpMult(run.floor) / 10) * 10;
      run.traps.push({ id: k.id, name: k.name, weak: k.weak, resist: k.resist, hp, max: hp, cd: k.cd, cdMax: k.cd, dmg: Math.round(curveDmg(k.dmg)), act: k.act, hazard: k.hazard });
    }
  } else {
    const ph = dg.boss.phases[0];
    run.traps.push({ id: dg.boss.id, name: dg.boss.name, boss: true, phase: 0, ...phaseFields(ph) });
    run.boss = { hearts: 0, minHp: run.hp / run.maxHp, skills: 0 };
  }
  run.target = 0;
  run.board = newBoard(run, pt.mods.heartWeight);
}
function phaseFields(ph) {
  const hp = Math.round(curveHp(ph.hp) / 10) * 10;
  return { weak: ph.weak, resist: ph.resist, hp, max: hp, cd: ph.cd, cdMax: ph.cd, dmg: Math.round(curveDmg(ph.dmg)), act: ph.act, hazard: ph.hazard ?? null };
}
export const alive = (run) => run.traps.filter((t) => t.hp > 0);
export const moveTime = (run) => (MOVE_TIME + runParty(run).mods.time) * (run.buffs.hourglass > 0 ? 2 : 1);

/** 1手ぶんの攻撃を仕掛けに当てる（狙った仕掛けを壊したら、あまりは次へ） */
export function applyAttack(run, steps) {
  const pt = runParty(run);
  const atk = attackOf(steps, pt, run.buffs);
  const ev = [];
  run.stats.turns++;
  run.turn++;
  run.stats.maxCombo = Math.max(run.stats.maxCombo, atk.combos);
  if (run.floor >= FLOORS) run.boss.hearts += atk.hearts;
  // 回復
  if (atk.heal > 0) {
    const before = run.hp;
    run.hp = Math.min(run.maxHp, run.hp + atk.heal);
    if (run.hp > before) ev.push({ type: 'heal', amount: run.hp - before });
  }
  // 攻撃
  let left = { ...atk.dmg };
  let broken = 0;
  const order = [run.target, ...run.traps.map((_, i) => i).filter((i) => i !== run.target)];
  for (const i of order) {
    const t = run.traps[i];
    if (!t || t.hp <= 0) continue;
    let total = 0;
    const parts = [];
    for (const col of COLORS) {
      if (col === 'heart' || !left[col]) continue;
      const v = Math.round(left[col] * factor(t, col, run.buffs));
      if (v > 0) { total += v; parts.push({ color: col, value: v, f: factor(t, col, run.buffs) }); }
    }
    if (total <= 0) break;
    const dealt = Math.min(total, t.hp);
    t.hp -= dealt;
    ev.push({ type: 'hit', index: i, amount: dealt, parts });
    if (t.hp > 0) { left = {}; break; }
    // 壊した: あまりを次の仕掛けへ
    const ratio = (total - dealt) / total;
    for (const col of Object.keys(left)) left[col] = Math.floor(left[col] * ratio);
    if (t.boss && t.phase + 1 < DUNGEONS[run.d].boss.phases.length) {
      t.phase++;
      Object.assign(t, phaseFields(DUNGEONS[run.d].boss.phases[t.phase]));
      ev.push({ type: 'phase', index: i, phase: t.phase });
      left = {};
      break;
    }
    broken++;
    ev.push({ type: 'break', index: i });
  }
  if (run.traps[run.target]?.hp <= 0) {
    const next = run.traps.findIndex((t) => t.hp > 0);
    if (next >= 0) run.target = next;
  }
  return { atk, ev, broken };
}

/** 仕掛けの番: カウントを進め、0になった罠が作動する。盤面の悪さと強化の残りも進める */
export function trapTurn(run) {
  const pt = runParty(run);
  const ev = [];
  for (const [i, t] of run.traps.entries()) {
    if (t.hp <= 0) continue;
    t.cd--;
    if (t.cd > 0) continue;
    t.cd = t.cdMax;
    const dmg = Math.round(t.dmg * pt.mods.trapMult * (run.buffs.boots > 0 ? 0.5 : 1));
    run.hp = Math.max(0, run.hp - dmg);
    ev.push({ type: 'trap', index: i, amount: dmg, text: t.act });
    if (t.hazard) { applyHazard(run, t.hazard); ev.push({ type: 'hazard', index: i, hazard: t.hazard }); }
  }
  if (run.floor >= FLOORS) run.boss.minHp = Math.min(run.boss.minHp, run.hp / run.maxHp);
  for (const k of Object.keys(run.buffs)) if (run.buffs[k] > 0) run.buffs[k]--;
  for (const id of run.tools) if (run.cds[id] > 0) run.cds[id]--;
  return ev;
}

/** 盤面の悪さを1手ぶん進める（石は3手で元に戻る・凍結と暗闇も時間で消える） */
export function tickBoard(run) {
  const pt = runParty(run);
  for (const row of run.board) {
    for (const x of row) {
      if (x.stone > 0 && --x.stone === 0) x.c = randColor(run, pt.mods.heartWeight);
      if (x.ice > 0) x.ice--;
      if (x.dark > 0) x.dark--;
    }
  }
}

export function applyHazard(run, kind) {
  const cells = run.board.flat();
  const free = cells.filter((x) => x.stone <= 0 && x.ice <= 0);
  if (kind === 'stone') for (const x of pickN(run, free, 4)) x.stone = 3;
  else if (kind === 'ice') for (const x of pickN(run, free, 5)) x.ice = 3;
  else if (kind === 'dark') for (const x of pickN(run, cells, 10)) x.dark = 2;
  else if (kind === 'shuffle') {
    const nb = newBoard(run, runParty(run).mods.heartWeight);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (run.board[r][c].stone <= 0) run.board[r][c].c = nb[r][c].c;
  }
}

// ---- 道具のスキル ----
export const skillReady = (run, id) => run.tools.includes(id) && run.cds[id] <= 0;
export function useSkill(run, id) {
  if (!skillReady(run, id)) return null;
  const pt = runParty(run);
  const b = run.board.flat();
  const target = run.traps[run.target];
  const conv = (from, to) => { for (const x of b) if (x.stone <= 0 && x.c === from) x.c = to; };
  const ev = [];
  switch (id) {
    case 'torch': conv(cidx('leaf'), cidx('fire')); break;
    case 'flask': {
      const h = Math.round(run.maxHp * 0.25);
      run.hp = Math.min(run.maxHp, run.hp + h);
      ev.push({ type: 'heal', amount: h });
      conv(cidx('fire'), cidx('water'));
      break;
    }
    case 'pick':
      for (const x of b) { if (x.stone > 0) { x.stone = 0; x.c = randColor(run, pt.mods.heartWeight); } x.ice = 0; }
      if (target?.hp > 0) { const v = Math.min(target.hp - 1, Math.round(target.max * 0.05)); if (v > 0) { target.hp -= v; ev.push({ type: 'hit', index: run.target, amount: v, parts: [] }); } }
      break;
    case 'lantern': for (const x of b) x.dark = 0; conv(cidx('shadow'), cidx('light')); break;
    case 'hammer':
      if (target?.hp > 0) { const v = Math.min(target.hp - 1, Math.round(target.max * 0.15)); if (v > 0) { target.hp -= v; ev.push({ type: 'hit', index: run.target, amount: v, parts: [] }); } }
      break;
    case 'rope': for (const t of run.traps) if (t.hp > 0) t.cd = Math.min(t.cdMax + 2, t.cd + 2); break;
    case 'mirror': for (const x of pickN(run, b.filter((x) => x.stone <= 0 && x.c !== cidx('light')), 6)) x.c = cidx('light'); break;
    case 'compass': {
      const nb = newBoard(run, pt.mods.heartWeight);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const x = run.board[r][c]; x.c = nb[r][c].c; x.dark = 0; x.stone = 0; }
      break;
    }
    case 'scope': run.buffs.scope = 3; break;
    case 'hourglass': run.buffs.hourglass = 1; break;
    case 'herbs': ev.push({ type: 'heal', amount: run.maxHp - run.hp }); run.hp = run.maxHp; break;
    case 'boots': run.buffs.boots = 3; break;
    case 'keys': conv(cidx('shadow'), HEART); break;
    case 'lens': run.buffs.lens = 2; break;
    case 'gloves': {
      const w = target ? cidx(target.weak) : 0;
      for (const x of pickN(run, b.filter((x) => x.stone <= 0 && x.c !== w), 6)) x.c = w;
      break;
    }
    case 'map': for (const x of run.board[0]) { x.c = HEART; x.stone = 0; } break;
    default:
  }
  run.cds[id] = Math.max(1, TOOLS[id].cd - pt.mods.cdBonus);
  run.stats.skills++;
  if (run.floor >= FLOORS) run.boss.skills++;
  // 変えた結果、すでにそろっている球は次の手で消える（ここでは消さない）
  return ev;
}

// ---- 進行 ----
export const floorCleared = (run) => run.traps.every((t) => t.hp <= 0);
export const isBoss = (run) => run.floor >= FLOORS;

/** フロアを突破したときの処理（お宝・コイン）。見つけたお宝のIDを返す */
export function clearFloor(save, run) {
  const dg = DUNGEONS[run.d];
  const found = [];
  const mods = runParty(run).mods;
  run.coins += Math.round(COIN_FLOOR(run.d) * mods.coinMult);
  const give = (tid) => {
    if (save.treasures.includes(tid)) { run.coins += 20; return; }
    save.treasures.push(tid);
    found.push(tid);
  };
  if (run.floor >= 1 && run.floor < FLOORS) give(TREASURES[dg.id][run.floor - 1].id);
  if (run.floor >= FLOORS) {
    give(TREASURES[dg.id][6].id);
    const h = dg.hidden.id;
    if ((h === 'noheart' && run.boss.hearts === 0) || (h === 'halfhp' && run.boss.minHp >= 0.5) || (h === 'noskill' && run.boss.skills === 0)) give(TREASURES[dg.id][7].id);
  }
  return found;
}
/** 1手の中で達成する隠しお宝（10コンボ・大きな組3つ・2つ同時に突破） */
export function checkHiddenTurn(save, run, atk, broken) {
  const dg = DUNGEONS[run.d];
  const h = dg.hidden.id;
  const ok = (h === 'combo10' && atk.combos >= 10) || (h === 'big3' && atk.big >= 3) || (h === 'double' && broken >= 2);
  const tid = TREASURES[dg.id][7].id;
  if (!ok || save.treasures.includes(tid)) return null;
  save.treasures.push(tid);
  return tid;
}

/** ダンジョンをクリア: コイン・道具・次のダンジョン */
export function finishDungeon(save, run) {
  const dg = DUNGEONS[run.d];
  const first = !save.cleared.includes(dg.id);
  const mods = runParty(run).mods;
  const bonus = Math.round(COIN_CLEAR(run.d, first) * mods.coinMult);
  const coins = run.coins + bonus;
  save.coins += coins;
  const tools = [];
  if (first) {
    save.cleared.push(dg.id);
    for (const t of TOOL_REWARD[run.d]) if (!save.tools.includes(t)) { save.tools.push(t); tools.push(t); }
  }
  save.stats.clears++;
  save.stats.maxCombo = Math.max(save.stats.maxCombo, run.stats.maxCombo);
  save.stats.turns += run.stats.turns;
  save.run = null;
  const ending = run.d === DUNGEONS.length - 1 && !save.ending;
  if (ending) save.ending = true;
  return { coins, bonus, first, tools, ending };
}
/** 体力が尽きて撤退: 拾ったコインの半分は持ち帰る（お宝は見つけた時点で図鑑に入っている） */
export function retreat(save, run) {
  const coins = Math.floor(run.coins / 2);
  save.coins += coins;
  save.stats.retreats++;
  save.stats.maxCombo = Math.max(save.stats.maxCombo, run.stats.maxCombo);
  save.stats.turns += run.stats.turns;
  save.run = null;
  return { coins };
}

// ---- 途中保存（フロアの始めから再開） ----
export function snapshot(run) {
  return { d: run.d, floor: run.floor, hp: run.hp, coins: run.coins, cds: { ...run.cds }, tools: [...run.tools], frame: run.frame, stats: { ...run.stats }, rng: run.rng };
}
export function resume(save) {
  const s = save.run;
  const run = newRun({ ...save, loadout: s.tools, frame: s.frame }, s.d, s.rng);
  run.floor = s.floor;
  run.hp = Math.min(s.hp, run.maxHp);
  run.coins = s.coins;
  run.cds = { ...run.cds, ...s.cds };
  run.stats = { ...run.stats, ...s.stats };
  startFloor(run);
  return run;
}

// ---- セーブ ----
export function newSave() {
  return {
    v: SCHEMA, coins: 0, frames: ['wood'], frame: 'wood',
    tools: [...START_TOOLS], loadout: [...START_TOOLS],
    treasures: [], cleared: [], run: null, ending: false, intro: false,
    stats: { clears: 0, retreats: 0, turns: 0, maxCombo: 0, playMs: 0 },
  };
}
export const unlocked = (save, d) => d === 0 || save.cleared.includes(DUNGEONS[d - 1].id);
export function buyFrame(save, id) {
  const f = FRAMES.find((x) => x.id === id);
  if (!f || save.frames.includes(id) || save.coins < f.price) return false;
  save.coins -= f.price;
  save.frames.push(id);
  save.frame = id;
  return true;
}
export function saveSummary(s) {
  const n = s.cleared.length;
  const label = s.ending ? `黄金郷を踏破・お宝 ${s.treasures.length}/48` : n ? `${DUNGEONS[n].name}へ・お宝 ${s.treasures.length}/48` : 'はじめの冒険へ';
  return { label };
}

// にげろ！とうふ: 走りの計算（画面に依存しない。テスト・自動プレイからも使う）
import {
  SCHEMA, LANE_W, TOFU, JUMP_V, GRAVITY, SLIDE_TIME, LANE_TIME, START_SPEED, speedAt, zoneAt,
  OBSTACLES, OB_SIZE, PICKUPS, SKINS, MISSIONS,
} from './data.js';

// ---- 乱数（mulberry32。状態は数値1つ） ----
function rand(run) {
  run.rng = (run.rng + 0x6d2b79f5) >>> 0;
  let t = run.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (run, arr) => arr[Math.floor(rand(run) * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const KINDS = {};
for (const [id, o] of Object.entries(OBSTACLES)) ((KINDS[o.zone] ??= {})[o.type] ??= []).push(id);

// ---- 1回の走り ----
export function newRun(seed = 1, { tutorial = false } = {}) {
  return {
    seed, rng: (seed >>> 0) || 1, t: 0, d: 0, v: START_SPEED,
    lane: 0, x: 0, y: 0, vy: 0, air: false, fastFall: false, queuedSlide: false, slideT: 0,
    obs: [], picks: [], nextZ: 42, tutorial: tutorial ? 0 : -1,
    negi: 0, jumps: 0, slides: 0, lanes: 0, ice: 0, katsuo: 0, saved: 0,
    shield: false, magnetT: 0, invT: 0,
    noJumpDist: 0, noNegiDist: 0, zoneIdx: 0, lap: 0,
    dead: null, deadT: 0,
  };
}

export const tofuHeight = (run) => (run.slideT > 0 ? TOFU.slideH : TOFU.h);

/** 操作: 'left' | 'right' | 'up' | 'down' */
export function act(run, cmd) {
  const ev = [];
  if (run.dead) return ev;
  if (cmd === 'left' || cmd === 'right') {
    const to = clamp(run.lane + (cmd === 'left' ? -1 : 1), -1, 1);
    if (to !== run.lane) { run.lane = to; run.lanes++; ev.push({ type: 'lane', dir: cmd }); }
  } else if (cmd === 'up') {
    if (!run.air) {
      run.slideT = 0;
      run.air = true;
      run.vy = JUMP_V;
      run.fastFall = false;
      run.queuedSlide = false;
      run.jumps++;
      ev.push({ type: 'jump' });
    }
  } else if (cmd === 'down') {
    if (run.air) {
      // 空中で下: すばやく降りて、着地したらそのままつぶれる
      run.fastFall = true;
      run.vy = Math.min(run.vy, -6);
      run.queuedSlide = true;
    } else startSlide(run, ev);
  }
  return ev;
}
function startSlide(run, ev) {
  if (run.slideT <= 0) { run.slides++; ev.push({ type: 'slide' }); }
  run.slideT = SLIDE_TIME;
}

// ---- 障害物の並べ方（必ずどこかに逃げ道がある） ----
const TUTORIAL = ['b1c', 'l3', 'h3', 'b2'];
function choosePattern(run, z) {
  if (run.tutorial >= 0) {
    if (run.tutorial < TUTORIAL.length) return TUTORIAL[run.tutorial++];
    run.tutorial = -1;
  }
  const diff = clamp(z / 3200, 0, 1);
  const table = [
    ['b1', 3], ['b2', 2.5 + diff], ['l3', 1.6], ['h3', 1.6], ['l1', 1], ['h1', 1],
    ['bl', 1.2 + diff], ['bh', 1.2 + diff],
    ['b2l', z > 500 ? 0.8 + diff * 1.6 : 0], ['b2h', z > 500 ? 0.8 + diff * 1.6 : 0],
    ['mix', z > 900 ? 0.6 + diff * 1.4 : 0],
  ];
  let sum = 0;
  for (const [, w] of table) sum += w;
  let r = rand(run) * sum;
  for (const [id, w] of table) { r -= w; if (r < 0) return id; }
  return 'b1';
}

function spawnPattern(run) {
  const z = run.nextZ;
  const zone = zoneAt(z).zone.id;
  const K = KINDS[zone];
  const ob = (type, lane, dz = 0) => run.obs.push({
    kind: pick(run, K[type]), type, lane, z: z + dz, ph: rand(run) * Math.PI * 2, hit: false,
  });
  const lanesExcept = (f) => [-1, 0, 1].filter((l) => l !== f);
  const tut = run.tutorial >= 0 && run.tutorial < TUTORIAL.length;
  const p = choosePattern(run, z);
  const r = Math.floor(rand(run) * 3) - 1;
  let free = r;      // ねぎを置くレーン
  let extra = 0;     // 次までの間を少し広げる
  switch (p) {
    case 'b1c': ob('block', 0); free = pick(run, [-1, 1]); break;
    case 'b1': ob('block', r); free = pick(run, lanesExcept(r)); break;
    case 'b2': for (const l of lanesExcept(r)) ob('block', l); free = r; extra = 0.12; break;
    case 'l3': for (const l of [-1, 0, 1]) ob('low', l); break;
    case 'h3': for (const l of [-1, 0, 1]) ob('high', l); break;
    case 'l1': ob('low', r); break;
    case 'h1': ob('high', r); break;
    case 'bl': ob('block', r); for (const l of lanesExcept(r)) ob('low', l); free = pick(run, lanesExcept(r)); break;
    case 'bh': ob('block', r); for (const l of lanesExcept(r)) ob('high', l); free = pick(run, lanesExcept(r)); break;
    case 'b2l': for (const l of lanesExcept(r)) ob('block', l); ob('low', r); free = r; extra = 0.15; break;
    case 'b2h': for (const l of lanesExcept(r)) ob('block', l); ob('high', r); free = r; extra = 0.15; break;
    case 'mix': {
      const order = [-1, 0, 1].sort(() => rand(run) - 0.5);
      ob('block', order[0]); ob('low', order[1]); ob('high', order[2]);
      free = order[1];
      break;
    }
    default:
  }
  const diff = clamp(z / 3200, 0, 1);
  const gapT = (tut ? 1.9 : 1.42 - 0.42 * diff) + extra;
  const next = z + Math.max(speedAt(z) * gapT, 10);

  // ねぎ: 跳ぶところは弧を描くように、それ以外は逃げ道のレーンに一列
  if (p === 'l3' || p === 'l1') {
    const lane = p === 'l1' ? r : free;
    for (let i = -3; i <= 3; i++) {
      const tt = (i + 3.5) / 7;   // 0..1
      run.picks.push({ kind: 'negi', lane, z: z + i * 1.0, y: 0.35 + Math.sin(tt * Math.PI) * 0.75, got: false });
    }
  } else if (rand(run) < 0.75) {
    const n = 5 + Math.floor(rand(run) * 4);
    const start = z + 2.5;
    for (let i = 0; i < n; i++) {
      const pz = start + i * 1.6;
      if (pz > next - 3) break;
      run.picks.push({ kind: 'negi', lane: free, z: pz, y: 0.35, got: false });
    }
  }
  // たまに氷・かつおぶし（次の障害物との間に）
  if (z > 160 && run.tutorial < 0) {
    const q = rand(run);
    const kind = q < 0.035 && !run.shield ? 'ice' : q > 0.97 ? 'katsuo' : null;
    if (kind) run.picks.push({ kind, lane: pick(run, [-1, 0, 1]), z: (z + next) / 2, y: 0.45, got: false });
  }
  run.nextZ = next;
}

// ---- 1コマ進める ----
export function step(run, dt) {
  const ev = [];
  if (run.dead) { run.deadT += dt; return ev; }
  run.t += dt;
  run.v = speedAt(run.d);
  run.d += run.v * dt;

  // 左右
  const tx = run.lane * LANE_W;
  const sp = (LANE_W / LANE_TIME) * dt;
  run.x = Math.abs(tx - run.x) <= sp ? tx : run.x + Math.sign(tx - run.x) * sp;

  // 上下
  if (run.air) {
    run.vy -= GRAVITY * dt * (run.fastFall ? 2.4 : 1);
    run.y += run.vy * dt;
    if (run.y <= 0) {
      run.y = 0; run.vy = 0; run.air = false; run.fastFall = false;
      ev.push({ type: 'land' });
      if (run.queuedSlide) { run.queuedSlide = false; startSlide(run, ev); }
    }
  }
  if (run.slideT > 0) run.slideT = Math.max(0, run.slideT - dt);
  if (run.invT > 0) run.invT = Math.max(0, run.invT - dt);
  if (run.magnetT > 0) run.magnetT = Math.max(0, run.magnetT - dt);

  // 先の道をつくる
  while (run.nextZ < run.d + 80) spawnPattern(run);

  // ぶつかり判定
  const h = tofuHeight(run);
  for (const o of run.obs) {
    if (o.hit) continue;
    const sz = OB_SIZE[o.type];
    if (Math.abs(o.z - run.d) > (sz.d + TOFU.d) / 2) continue;
    if (Math.abs(run.x - o.lane * LANE_W) > 0.6) continue;
    const hit = o.type === 'block' || (o.type === 'low' ? run.y < sz.h : run.y + h > sz.bottom);
    if (!hit || run.invT > 0) continue;
    o.hit = true;
    if (run.shield) {
      run.shield = false;
      run.saved++;
      run.invT = 1.1;
      ev.push({ type: 'shieldBreak', kind: o.kind });
    } else {
      run.dead = { kind: o.kind, x: run.x, y: run.y };
      run.deadT = 0;
      ev.push({ type: 'crash', kind: o.kind });
      return ev;
    }
  }

  // 拾う
  for (const p of run.picks) {
    if (p.got) continue;
    const px = p.mx ?? p.lane * LANE_W;
    if (run.magnetT > 0 && p.kind === 'negi' && p.z - run.d < 9 && p.z - run.d > -1) {
      // かつおぶし: 近くのねぎが寄ってくる
      const k = Math.min(1, dt * 9);
      p.mx = px + (run.x - px) * k;
      p.z += (run.d - p.z) * k * 0.5;
      p.y += (run.y + h / 2 - p.y) * k;
    }
    const r = PICKUPS[p.kind].r;
    if (Math.abs(p.z - run.d) > r || Math.abs((p.mx ?? px) - run.x) > r + 0.1) continue;
    if (p.y < run.y - 0.3 || p.y > run.y + h + 0.45) continue;
    p.got = true;
    if (p.kind === 'negi') run.negi++;
    else if (p.kind === 'ice') { run.ice++; run.shield = true; }
    else if (p.kind === 'katsuo') { run.katsuo++; run.magnetT = PICKUPS.katsuo.time; }
    ev.push({ type: 'pick', kind: p.kind });
  }

  run.obs = run.obs.filter((o) => o.z > run.d - 8);
  run.picks = run.picks.filter((p) => !p.got && p.z > run.d - 8);

  if (run.jumps === 0) run.noJumpDist = run.d;
  if (run.negi === 0) run.noNegiDist = run.d;
  const zi = zoneAt(run.d);
  if (zi.index !== run.zoneIdx || zi.lap !== run.lap) {
    run.zoneIdx = zi.index;
    run.lap = zi.lap;
    ev.push({ type: 'zone', zone: zi.zone, lap: zi.lap });
  }
  return ev;
}

/** 走りの結果（記録・お題の判定に使う） */
export function result(run) {
  return {
    dist: Math.floor(run.d), negi: run.negi, jumps: run.jumps, slides: run.slides, lanes: run.lanes,
    ice: run.ice, katsuo: run.katsuo, saved: run.saved, cause: run.dead?.kind ?? null,
    noJumpDist: Math.floor(run.noJumpDist), noNegiDist: Math.floor(run.noNegiDist),
  };
}

// ---- セーブ ----
export function newSave() {
  return {
    v: SCHEMA, best: 0, top: [],
    stats: { runs: 0, dist: 0, negi: 0, jumps: 0, slides: 0, playMs: 0 },
    deaths: {}, missions: [], skin: 'kinu', intro: false,
  };
}
export const unlockedSkins = (s) => SKINS.filter((k) => s.missions.length >= k.need).map((k) => k.id);

/** 走りの結果を記録に反映する。新記録・達成したお題・増えたとうふを返す */
export function applyRun(s, r, at = new Date().toISOString()) {
  const beforeSkins = unlockedSkins(s);
  const st = s.stats;
  st.runs++;
  st.dist += r.dist;
  st.negi += r.negi;
  st.jumps += r.jumps;
  st.slides += r.slides;
  let newDeath = false;
  if (r.cause && OBSTACLES[r.cause]) {
    newDeath = !s.deaths[r.cause];
    s.deaths[r.cause] = (s.deaths[r.cause] ?? 0) + 1;
  }
  const best = r.dist > s.best;
  if (best) s.best = r.dist;
  let rank = 0;
  if (r.dist > 0) {
    s.top.push({ d: r.dist, negi: r.negi, cause: r.cause, at });
    s.top.sort((a, b) => b.d - a.d || (a.at < b.at ? -1 : 1));
    s.top = s.top.slice(0, 5);
    rank = s.top.findIndex((e) => e.at === at && e.d === r.dist) + 1;
  }
  const done = [];
  for (const m of MISSIONS) {
    if (s.missions.includes(m.id)) continue;
    if (m.check(r, s)) { s.missions.push(m.id); done.push(m.id); }
  }
  const unlocked = unlockedSkins(s).filter((k) => !beforeSkins.includes(k));
  return { best, rank, done, unlocked, newDeath };
}

export function saveSummary(s) {
  return { label: s.best > 0 ? `自己ベスト ${s.best}m・お題 ${s.missions.length}/${MISSIONS.length}` : 'まだ走っていない' };
}

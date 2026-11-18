// 森のとりで: ゲームの計算（画面に依存しない。テスト・自動プレイからも使う）
// save … 保存する進行（コイン・強化・ウェーブ番号など）
// world … 実行中の世界（敵・仲間・弾など。保存しない）

import {
  WORLD, CORE_POS, FORT, ENTRANCES, BOUNDS, HERO, WEAPONS, ALLIES, ALLY_REVIVE, SMITH_MULT, TOWERS,
  CORE_HP, WALL_HP, PADS, ALLY_POSTS, PAD_TRIGGER, PAY_DELAY, ALLY_LEASH, ALLY_WATCH, ENEMY_CLOSE, PAY_RATE, PAY_MIN_RATE, STAT_STEP, ENEMIES, MINI, ELITES, BOSS,
  MAX_ENEMIES, WAVES, WAVE_HP_GROWTH, WAVE_REWARD, TRICKLE, ENDLESS,
} from './data.js';

// ---- 乱数 ----
export function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { seed: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}

// ---- 保存データ ----
export function newSave(seed = (Date.now() ^ 0x5eed) >>> 0) {
  const levels = {};
  for (const p of PADS) levels[p.id] = p.start;
  return {
    v: 1,
    wave: 1,
    cleared: false,
    coins: 0,
    levels,
    paid: {},
    hero: { x: CORE_POS.x - 120, y: CORE_POS.y + 160 },
    seen: [],
    pending: ['opening'],
    rng: seed >>> 0,
    stats: { kills: 0, coinsEarned: 0, wavesWon: 0, losses: 0, downs: 0, playMs: 0 },
  };
}

// ---- 強化の情報 ----
export const padById = (id) => PADS.find((p) => p.id === id);
export function padMax(p) { return p.cost.length; }
export function padVisible(save, p) {
  if (!p.need) return true;
  return Object.entries(p.need).every(([id, lv]) => (save.levels[id] ?? 0) >= lv);
}
/** 台座の状態: level 今の段階 / cost 次の費用（null なら最大）/ paid 支払い済み */
export function padState(save, p) {
  const level = save.levels[p.id] ?? p.start;
  const cost = level < padMax(p) ? p.cost[level] : null;
  return { level, cost, paid: save.paid[p.id] ?? 0, visible: padVisible(save, p), max: cost == null };
}
export function heroStats(save) {
  const L = save.levels;
  return {
    maxHp: HERO.baseHp + STAT_STEP.hp * (L.vital ?? 0),
    speed: HERO.speed * (1 + STAT_STEP.speed * (L.boots ?? 0)),
    magnet: HERO.magnet + STAT_STEP.magnet * (L.pouch ?? 0),
    weapon: WEAPONS[(L.weapon ?? 1) - 1],
    weaponLevel: L.weapon ?? 1,
  };
}
export const waveCount = () => WAVES.length;
export const isBossWave = (w) => !!WAVES[w - 1]?.boss;

// ---- 世界の生成 ----
const TOWER_SPOTS = {
  'tower-nw': [FORT.x1, FORT.y1], 'tower-ne': [FORT.x2, FORT.y1],
  'tower-sw': [FORT.x1, FORT.y2], 'tower-se': [FORT.x2, FORT.y2],
};
export const CORE_RADIUS = 95;

export function createWorld(save) {
  const w = {
    save,
    t: 0,
    phase: 'rest',
    hero: null,
    allies: [],
    towers: [],
    walls: {},
    core: { hp: 0, max: 0 },
    enemies: [],
    shots: [],
    pickups: [],
    fx: [],
    tele: [],
    queue: [],
    spawnT: 0,
    trickleT: 2,
    events: [],
    nextId: 1,
    waveKills: 0,
    waveTotal: 0,
  };
  const st = heroStats(save);
  w.hero = {
    x: save.hero.x, y: save.hero.y, hp: st.maxHp, maxHp: st.maxHp, face: 1, cd: 0, attackT: 0,
    deadT: 0, hurtT: 0, moving: 0, walkT: 0, onPad: null,
  };
  rebuild(w);
  restoreBetweenWaves(w);
  return w;
}

function rand(w) {
  const r = rngNext(w.save.rng);
  w.save.rng = r.seed;
  return r.value;
}

/** 強化の段階に合わせて、仲間・見張り台・柵・砦の中心を作り直す（体力は割合を保つ） */
export function rebuild(w) {
  const L = w.save.levels;
  // 柵
  for (const side of ['n', 's', 'w', 'e']) {
    const lv = L[`wall-${side}`] ?? 1;
    const old = w.walls[side];
    const max = WALL_HP[lv];
    w.walls[side] = { level: lv, max, hp: old ? Math.min(max, old.hp + (max - old.max)) : max, hurtT: 0 };
  }
  // 中心
  const clv = L.core ?? 1;
  const cmax = CORE_HP[clv];
  w.core = { level: clv, max: cmax, hp: w.core.max ? Math.min(cmax, w.core.hp + (cmax - w.core.max)) : cmax, hurtT: 0 };
  // 仲間（既存の個体は体力を保つ）
  const keep = new Map(w.allies.map((a) => [`${a.type}-${a.idx}`, a]));
  w.allies = [];
  for (const type of Object.keys(ALLIES)) {
    const n = L[type] ?? 0;
    for (let k = 0; k < n; k++) {
      const [px, py] = ALLY_POSTS[type][k];
      const post = { x: px, y: py };
      const old = keep.get(`${type}-${k}`);
      w.allies.push(old ?? {
        type, idx: k, x: post.x, y: post.y, post, hp: ALLIES[type].hp, maxHp: ALLIES[type].hp,
        cd: 0.3 * k, face: 1, attackT: 0, deadT: 0, hurtT: 0, walkT: 0, moving: 0,
      });
    }
  }
  // 見張り台
  w.towers = Object.entries(TOWER_SPOTS).filter(([id]) => (L[id] ?? 0) > 0).map(([id, [x, y]]) => {
    const old = w.towers.find((t) => t.id === id);
    return { id, x, y, level: L[id], cd: old?.cd ?? 0, attackT: 0 };
  });
  // 主人公の最大体力
  const st = heroStats(w.save);
  if (w.hero) {
    w.hero.hp = Math.min(st.maxHp, w.hero.hp + (st.maxHp - w.hero.maxHp));
    w.hero.maxHp = st.maxHp;
  }
}

/** 休憩時間に入るとき: 柵・中心・仲間・主人公を回復 */
function restoreBetweenWaves(w) {
  for (const s of Object.values(w.walls)) s.hp = s.max;
  w.core.hp = w.core.max;
  for (const a of w.allies) { a.hp = a.maxHp; a.deadT = 0; a.x = a.post.x; a.y = a.post.y; }
  if (w.hero.deadT > 0) reviveHero(w);
  w.hero.hp = w.hero.maxHp;
}

function reviveHero(w) {
  w.hero.deadT = 0;
  w.hero.hp = w.hero.maxHp;
  w.hero.x = CORE_POS.x;
  w.hero.y = CORE_POS.y + 150;
  w.hero.hurtT = 0;
}

// ---- ウェーブ ----
export function waveGroups(n) {
  if (n <= WAVES.length) return WAVES[n - 1];
  // クリア後: 果てしない夜
  const extra = n - WAVES.length;
  const total = ENDLESS.base + ENDLESS.growth * extra;
  const groups = ENDLESS.kinds.map((k) => [k, Math.max(2, Math.round(total / ENDLESS.kinds.length)), '*']);
  if (extra % 5 === 0) groups.push(['boar', 1, 'n']);
  return { groups, interval: Math.max(0.25, 0.45 - extra * 0.01), boss: extra % 5 === 0 };
}

export function startWave(w) {
  if (w.phase !== 'rest') return false;
  const def = waveGroups(w.save.wave);
  const dirs = ['n', 'e', 's', 'w'];
  let rr = 0;
  const list = [];
  for (const [type, count, from] of def.groups) {
    for (let k = 0; k < count; k++) list.push({ type, from: from === '*' ? dirs[(rr++) % 4] : from });
  }
  // ボス・中ボスは少し後に登場させる
  const bosses = list.filter((e) => ENEMIES[e.type]?.boss || ELITES[e.type]);
  const normal = list.filter((e) => !bosses.includes(e));
  // 種類が偏らないよう混ぜる
  for (let i = normal.length - 1; i > 0; i--) {
    const j = Math.floor(rand(w) * (i + 1));
    [normal[i], normal[j]] = [normal[j], normal[i]];
  }
  const at = Math.floor(normal.length * 0.35);
  normal.splice(at, 0, ...bosses);
  w.queue = normal;
  w.spawnInterval = def.interval;
  w.spawnT = 1.2;
  w.phase = 'wave';
  w.waveKills = 0;
  w.waveTotal = list.length;
  // 休憩時間の敵は森へ帰る（ウェーブの数に含めない）
  w.enemies = w.enemies.filter((e) => !e.trickle);
  w.events.push({ type: 'waveStart', wave: w.save.wave, boss: !!def.boss });
  return true;
}

function spawnEnemy(w, type, from, { trickle = false } = {}) {
  if (w.enemies.length >= MAX_ENEMIES) return null;
  const elite = ELITES[type];
  const base = elite ? ENEMIES[elite.base] : type === 'mini' ? { ...ENEMIES.caterpillar, ...MINI } : ENEMIES[type];
  const g = 1 + WAVE_HP_GROWTH * (Math.min(w.save.wave, 999) - 1);
  const hp = Math.round(base.hp * g * (elite ? elite.hpMult : 1) * (trickle ? 0.8 : 1));
  const ent = ENTRANCES[from];
  const jitter = () => (rand(w) - 0.5) * 120;
  const e = {
    id: w.nextId++,
    type: elite ? elite.base : type === 'mini' ? 'caterpillar' : type,
    kind: type,
    elite: !!elite,
    boss: !!base.boss,
    x: ent.x + jitter(), y: ent.y + jitter(),
    hp, max: hp,
    speed: base.speed * (elite?.speedMult ?? 1) * (0.9 + rand(w) * 0.2),
    dmg: base.dmg * (elite?.dmgMult ?? 1) * (1 + 0.04 * (w.save.wave - 1)),
    cd: rand(w) * base.cd, baseCd: base.cd,
    radius: elite?.radius ?? base.radius,
    size: elite?.size ?? base.size,
    coins: Math.max(1, Math.round((elite?.coins ?? base.coins) * (trickle ? TRICKLE.coinMult : 1))),
    flying: !!base.flying, ranged: base.ranged ?? 0, split: base.split ?? 0, blur: base.blur ?? 0,
    wallMult: base.wallMult ?? 1,
    trickle,
    face: -1, hurtT: 0, attackT: 0, walkT: rand(w) * 10, kx: 0, ky: 0,
    bossT: BOSS.every, action: null,
  };
  if (type === 'mini') e.mini = true;
  w.enemies.push(e);
  return e;
}

// ---- 1コマ進める ----
// input: { x, y } 移動の向き（長さ0〜1）
export function step(w, input, dt) {
  dt = Math.min(dt, 0.05);
  w.t += dt;
  w.events.length = 0;
  updateHero(w, input, dt);
  updateSpawns(w, dt);
  updateAllies(w, dt);
  updateTowers(w, dt);
  updateEnemies(w, dt);
  updateShots(w, dt);
  updatePickups(w, dt);
  updatePads(w, input, dt);
  updateFx(w, dt);
  checkWaveEnd(w);
  return w.events;
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inFort = (p, m = 0) => p.x > FORT.x1 - m && p.x < FORT.x2 + m && p.y > FORT.y1 - m && p.y < FORT.y2 + m;

function updateHero(w, input, dt) {
  const h = w.hero;
  const st = heroStats(w.save);
  h.attackT = Math.max(0, h.attackT - dt);
  h.hurtT = Math.max(0, h.hurtT - dt);
  if (h.deadT > 0) {
    h.deadT -= dt;
    if (h.deadT <= 0) { reviveHero(w); w.events.push({ type: 'heroBack' }); }
    return;
  }
  // 移動
  const len = Math.hypot(input.x, input.y);
  const m = len > 1 ? 1 / len : 1;
  const vx = input.x * m * st.speed;
  const vy = input.y * m * st.speed;
  h.moving = len > 0.08 ? 1 : 0;
  if (h.moving) {
    h.x += vx * dt;
    h.y += vy * dt;
    h.walkT += dt;
    if (Math.abs(vx) > 5) h.face = vx > 0 ? 1 : -1;
  }
  h.x = clamp(h.x, BOUNDS.x1, BOUNDS.x2);
  h.y = clamp(h.y, BOUNDS.y1, BOUNDS.y2);
  // 砦の建物には入らない
  const dx = h.x - CORE_POS.x;
  const dy = h.y - (CORE_POS.y - 20);
  const d = Math.hypot(dx, dy);
  if (d < CORE_RADIUS && d > 0) { h.x = CORE_POS.x + dx / d * CORE_RADIUS; h.y = CORE_POS.y - 20 + dy / d * CORE_RADIUS; }
  // 回復
  const nearFire = dist2(h, CORE_POS) < HERO.fireRange ** 2;
  const regen = (nearFire ? HERO.regenFire : 0) + (w.phase === 'rest' ? HERO.regenRest : 0);
  if (regen) h.hp = Math.min(h.maxHp, h.hp + regen * dt);
  // 攻撃
  h.cd -= dt;
  const wp = st.weapon;
  if (h.cd <= 0) {
    const target = nearestEnemy(w, h, wp.range + 20);
    if (target) {
      h.cd = wp.cd;
      h.attackT = 0.16;
      h.face = target.x >= h.x ? 1 : -1;
      if (wp.speed === 0) {
        // 近接: 前方の敵をまとめて叩く
        for (const e of w.enemies) {
          if (e.hp > 0 && dist2(e, h) < (wp.range + e.radius) ** 2) hitEnemy(w, e, wp.dmg, h, 'hero');
        }
        w.fx.push({ kind: 'swing', x: h.x + h.face * 40, y: h.y - 30, t: 0, life: 0.18, face: h.face });
      } else {
        fire(w, h.x + h.face * 24, h.y - 46, target, wp.speed, wp.dmg, 'ally', wp.shot, wp.pierce, wp.splash, 'hero');
      }
      w.events.push({ type: 'shoot', who: 'hero', shot: wp.shot });
    }
  }
}

function nearestEnemy(w, from, range) {
  let best = null;
  let bd = range * range;
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const d = dist2(e, from) - e.radius * e.radius;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function fire(w, x, y, target, speed, dmg, team, kind, pierce = 0, splash = 0, from = '') {
  const tx = target.x;
  const ty = target.y - (target.size ? target.size * 0.35 : 30);
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy) || 1;
  // 速さに応じて、相手の動きを少しだけ先読み
  w.shots.push({
    x, y, vx: dx / d * speed, vy: dy / d * speed, dmg, team, kind, pierce, splash, from,
    life: Math.min(1.6, d / speed + 0.25), hit: [],
  });
}

function hitEnemy(w, e, dmg, src, from) {
  if (e.hp <= 0) return;
  // 霧の精の近くでは、仲間の攻撃が弱まる
  if (from === 'ally' || from === 'tower') {
    for (const o of w.enemies) {
      if (o.blur && o.hp > 0 && dist2(o, e) < o.blur * o.blur) { dmg *= 0.5; break; }
    }
  }
  e.hp -= dmg;
  e.hurtT = 0.12;
  // 小さく押し返す（ボスは押されない）
  if (!e.boss && !e.elite && src) {
    const dx = e.x - src.x;
    const dy = e.y - src.y;
    const d = Math.hypot(dx, dy) || 1;
    e.kx += dx / d * 90;
    e.ky += dy / d * 90;
  }
  w.events.push({ type: 'hit', x: e.x, y: e.y });
  if (e.hp <= 0) killEnemy(w, e);
}

function killEnemy(w, e) {
  w.save.stats.kills++;
  if (!e.trickle) w.waveKills++;
  w.events.push({ type: 'kill', x: e.x, y: e.y, big: e.boss || e.elite });
  w.fx.push({ kind: 'poof', x: e.x, y: e.y - e.size * 0.3, t: 0, life: 0.45, size: e.size });
  // コインを散らす
  const n = Math.min(8, Math.max(1, Math.round(e.coins / 3)));
  let rest = e.coins;
  for (let k = 0; k < n; k++) {
    const v = k === n - 1 ? rest : Math.max(1, Math.floor(e.coins / n));
    rest -= v;
    const a = rand(w) * Math.PI * 2;
    const r = 20 + rand(w) * 40 + (e.boss ? 80 : 0);
    w.pickups.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, value: v, t: 0, fly: false });
  }
  if (e.split && !e.mini) {
    for (let k = 0; k < e.split; k++) {
      const m = spawnEnemy(w, 'mini', 'n', { trickle: e.trickle });
      if (m) { m.x = e.x + (k ? 20 : -20); m.y = e.y; if (!e.trickle) w.waveTotal++; }
    }
  }
}

function updateSpawns(w, dt) {
  if (w.phase === 'wave') {
    w.spawnT -= dt;
    while (w.spawnT <= 0 && w.queue.length) {
      const next = w.queue[0];
      if (!spawnEnemy(w, next.type, next.from)) { w.spawnT = 0.3; break; }
      w.queue.shift();
      if (ENEMIES[next.type]?.boss || ELITES[next.type]) w.events.push({ type: 'bossAppear', kind: next.type });
      w.spawnT += w.spawnInterval;
    }
  } else if (w.phase === 'rest') {
    w.trickleT -= dt;
    if (w.trickleT <= 0) {
      w.trickleT = TRICKLE.every;
      const count = w.enemies.filter((e) => e.trickle).length;
      if (count < TRICKLE.max) {
        const dirs = Object.keys(ENTRANCES);
        const kinds = TRICKLE.kinds(w.save.wave);
        spawnEnemy(w, kinds[Math.floor(rand(w) * kinds.length)], dirs[Math.floor(rand(w) * dirs.length)], { trickle: true });
      }
    }
  }
}

function allyMult(w) { return SMITH_MULT[(w.save.levels.smith ?? 1) - 1]; }

function updateAllies(w, dt) {
  const mult = allyMult(w);
  for (const a of w.allies) {
    const def = ALLIES[a.type];
    a.attackT = Math.max(0, a.attackT - dt);
    a.hurtT = Math.max(0, a.hurtT - dt);
    if (a.deadT > 0) {
      a.deadT -= dt;
      if (a.deadT <= 0) { a.hp = a.maxHp; a.x = a.post.x; a.y = a.post.y; }
      continue;
    }
    a.cd -= dt;
    a.moving = 0;
    if (def.kind !== 'guard') moveSupport(w, a, def, dt);
    if (def.kind === 'heal') {
      if (a.cd <= 0) {
        a.cd = def.cd;
        let healed = false;
        for (const t of [w.hero, ...w.allies]) {
          if (t.deadT > 0 || t.hp >= t.maxHp) continue;
          if (dist2(t, a) < def.range ** 2) { t.hp = Math.min(t.maxHp, t.hp + def.heal * mult); healed = true; w.fx.push({ kind: 'heal', x: t.x, y: t.y - 40, t: 0, life: 0.6 }); }
        }
        if (healed) { a.attackT = 0.3; w.events.push({ type: 'heal' }); }
      }
      continue;
    }
    if (def.kind === 'guard') {
      // 持ち場の近くに来た敵を迎え撃ち、いなければ持ち場へ戻る
      let target = null;
      let bd = def.guard ** 2;
      for (const e of w.enemies) {
        if (e.hp <= 0 || e.flying) continue;
        const d = dist2(e, a.post);
        if (d < bd) { bd = d; target = e; }
      }
      const goal = target ?? a.post;
      const dx = goal.x - a.x;
      const dy = goal.y - a.y;
      const d = Math.hypot(dx, dy);
      const reach = target ? def.range + target.radius : 6;
      if (d > reach) {
        const sp = def.speed * dt;
        a.x += dx / d * Math.min(sp, d - reach);
        a.y += dy / d * Math.min(sp, d - reach);
        a.moving = 1;
        a.walkT += dt;
        if (Math.abs(dx) > 4) a.face = dx > 0 ? 1 : -1;
      }
      if (target && d <= reach + 4 && a.cd <= 0) {
        a.cd = def.cd;
        a.attackT = 0.2;
        a.face = target.x >= a.x ? 1 : -1;
        hitEnemy(w, target, def.dmg * mult, a, 'ally');
        w.events.push({ type: 'shoot', who: 'ally', shot: 'swing' });
      }
      continue;
    }
    // 遠距離
    if (a.cd <= 0) {
      const target = nearestEnemy(w, a, def.range);
      if (target) {
        a.cd = def.cd;
        a.attackT = 0.2;
        a.face = target.x >= a.x ? 1 : -1;
        fire(w, a.x + a.face * 16, a.y - 40, target, def.shot === 'stone' ? 650 : 850, def.dmg * mult, 'ally', def.shot, 0, def.splash, 'ally');
        w.events.push({ type: 'shoot', who: 'ally', shot: def.shot });
      }
    }
  }
}

/** 砦の内側（柵から少し離れた範囲）に収める */
function clampInside(p, m = 60) {
  p.x = clamp(p.x, FORT.x1 + m, FORT.x2 - m);
  p.y = clamp(p.y, FORT.y1 + m, FORT.y2 - m);
}
/**
 * 遠距離の仲間・癒し手の移動: 攻められている柵のほうへ寄り、柵越しに撃つ。
 * 敵がいなければ持ち場へ戻り、休憩中は持ち場のまわりを少し歩く。砦の外へは出ない。
 */
function moveSupport(w, a, def, dt) {
  let goal = null;
  if (def.kind === 'heal') {
    // 傷ついた味方（砦の中）の近くへ
    let worst = null;
    for (const t of [w.hero, ...w.allies]) {
      if (t === a || t.deadT > 0 || t.hp >= t.maxHp * 0.9 || !inFort(t)) continue;
      if (!worst || t.hp / t.maxHp < worst.hp / worst.maxHp) worst = t;
    }
    if (worst) goal = { x: worst.x + (a.idx ? 70 : -70), y: worst.y + 30 };
  } else {
    let near = null;
    let bd = ALLY_WATCH * ALLY_WATCH;
    for (const e of w.enemies) {
      if (e.hp <= 0) continue;
      const d = dist2(e, a.post);
      if (d < bd) { bd = d; near = e; }
    }
    if (near) {
      // 敵の方向の柵の内側へ寄る。射程に入っていれば、その場で撃つ
      if (dist2(near, a) < (def.range * 0.85) ** 2) goal = { x: a.x, y: a.y };
      else {
        goal = { x: near.x, y: near.y };
        clampInside(goal, 70);
      }
    }
  }
  if (!goal) {
    if (w.phase === 'rest') {
      // 休憩中は持ち場のまわりをゆっくり歩く
      a.idleT = (a.idleT ?? 0) - dt;
      if (a.idleT <= 0 || !a.idle) {
        a.idleT = 2.5 + rand(w) * 3;
        a.idle = { x: a.post.x + (rand(w) - 0.5) * 90, y: a.post.y + (rand(w) - 0.5) * 60, slow: true };
      }
      goal = a.idle;
    } else goal = a.post;
  }
  // 持ち場から離れすぎない
  const lx = goal.x - a.post.x;
  const ly = goal.y - a.post.y;
  const ll = Math.hypot(lx, ly);
  if (ll > ALLY_LEASH) goal = { x: a.post.x + lx / ll * ALLY_LEASH, y: a.post.y + ly / ll * ALLY_LEASH };
  const dx = goal.x - a.x;
  const dy = goal.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > 8) {
    const sp = Math.min(d, def.speed * dt * (goal.slow ? 0.4 : 1));
    a.x += dx / d * sp;
    a.y += dy / d * sp;
    clampInside(a, 45);
    a.moving = 1;
    a.walkT += dt;
    if (Math.abs(dx) > 4) a.face = dx > 0 ? 1 : -1;
  }
}

function updateTowers(w, dt) {
  for (const t of w.towers) {
    const def = TOWERS[t.level];
    t.cd -= dt;
    t.attackT = Math.max(0, t.attackT - dt);
    if (t.cd > 0) continue;
    const target = nearestEnemy(w, t, def.range);
    if (!target) continue;
    t.cd = def.cd;
    t.attackT = 0.2;
    fire(w, t.x, t.y - 120, target, def.shot === 'shell' ? 700 : 950, def.dmg, 'ally', def.shot, 0, def.splash, 'tower');
    w.events.push({ type: 'shoot', who: 'tower', shot: def.shot });
  }
}

/** 地上の敵が砦の柵にさえぎられるか（さえぎる辺を返す） */
function blockingSide(e, nx, ny) {
  if (e.flying) return null;
  const was = inFort(e);
  const will = nx > FORT.x1 && nx < FORT.x2 && ny > FORT.y1 && ny < FORT.y2;
  if (was || !will) return null;
  if (e.y <= FORT.y1) return 'n';
  if (e.y >= FORT.y2) return 's';
  if (e.x <= FORT.x1) return 'w';
  return 'e';
}

function updateEnemies(w, dt) {
  const h = w.hero;
  const heroAlive = h.deadT <= 0;
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (e.hp <= 0) continue;
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.attackT = Math.max(0, e.attackT - dt);
    e.cd -= dt;
    // 押し返しの減衰
    e.x += e.kx * dt;
    e.y += e.ky * dt;
    e.kx *= Math.max(0, 1 - 10 * dt);
    e.ky *= Math.max(0, 1 - 10 * dt);
    if (e.boss && updateBoss(w, e, dt)) continue;
    let target = w.core;
    let tpos = { x: CORE_POS.x, y: CORE_POS.y - 20, radius: CORE_RADIUS * 0.8 };
    const heroOut = heroAlive && !inFort(h);
    if (e.trickle) {
      // 休憩中: 柵の外をうろつき、柵の外に出てきた主人公だけを襲う（柵には傷をつけない）
      if (heroOut && dist2(e, h) < 560 * 560) {
        target = h;
        tpos = { x: h.x, y: h.y, radius: HERO.radius };
      } else {
        e.wanderT = (e.wanderT ?? 0) - dt;
        if (e.wanderT <= 0 || !e.wander) {
          e.wanderT = 3 + rand(w) * 4;
          const ang = rand(w) * Math.PI * 2;
          const r = 620 + rand(w) * 260;
          e.wander = { x: clamp(CORE_POS.x + Math.cos(ang) * r, BOUNDS.x1, BOUNDS.x2), y: clamp(CORE_POS.y + Math.sin(ang) * r * 1.2, BOUNDS.y1, BOUNDS.y2), radius: 0 };
        }
        target = null;
        tpos = e.wander;
      }
    } else {
      // ウェーブ中: 中心をめざす。すぐ近くの主人公・仲間には反撃し、サルは射程内の相手に投げる
      const close = e.ranged ? e.ranged : e.radius + ENEMY_CLOSE;
      if (heroAlive && dist2(e, h) < close * close) { target = h; tpos = { x: h.x, y: h.y, radius: HERO.radius }; } else {
        for (const a of w.allies) {
          if (a.deadT > 0) continue;
          if (dist2(e, a) < close * close) { target = a; tpos = { x: a.x, y: a.y, radius: 24 }; break; }
        }
      }
    }
    const dx = tpos.x - e.x;
    const dy = tpos.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = !target ? 10 : e.ranged ? e.ranged : e.radius + tpos.radius + 6;
    if (Math.abs(dx) > 3) e.face = dx > 0 ? 1 : -1;
    if (d > reach) {
      const sp = e.speed * dt;
      const nx = e.x + dx / d * sp;
      const ny = e.y + dy / d * sp;
      const side = blockingSide(e, nx, ny);
      if (side && (e.trickle || w.walls[side].hp > 0)) {
        // 柵にさえぎられる。休憩中は柵の外で引き返し、ウェーブ中は柵を攻撃
        if (e.trickle) { e.wanderT = 0; continue; }
        if (e.cd <= 0) {
          e.cd = e.baseCd;
          e.attackT = 0.2;
          const wall = w.walls[side];
          wall.hp = Math.max(0, wall.hp - e.dmg * e.wallMult);
          wall.hurtT = 0.15;
          w.events.push({ type: 'wallHit', side, broken: wall.hp <= 0 });
        }
        // 柵の外側に沿って少しずれる（一点に固まらないように）
        if (side === 'n' || side === 's') e.x += Math.sign(dx) * sp * 0.25; else e.y += Math.sign(dy) * sp * 0.25;
      } else {
        e.x = nx;
        e.y = ny;
        e.walkT += dt;
      }
    } else if (target && e.cd <= 0) {
      e.cd = e.baseCd;
      e.attackT = 0.2;
      if (e.ranged) {
        fire(w, e.x, e.y - 40, { x: tpos.x, y: tpos.y, size: 60 }, 520, e.dmg, 'enemy', 'acorn');
      } else {
        damage(w, target, e.dmg);
      }
    }
  }
  // 重なりをほぐす
  const list = w.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.hp <= 0 || a.flying !== b.flying) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r = (a.radius + b.radius) * 0.85;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (r - d) / 2;
      const wa = a.boss ? 0.1 : 1;
      const wb = b.boss ? 0.1 : 1;
      a.x -= dx / d * push * wa;
      a.y -= dy / d * push * wa;
      b.x += dx / d * push * wb;
      b.y += dy / d * push * wb;
    }
  }
  for (const e of w.enemies) keepOutside(w, e);
  w.enemies = w.enemies.filter((e) => e.hp > 0);
}

/** 柵の外にいた地上の敵が、押し返しや重なりの処理で柵の内側に入ってしまったら外へ戻す */
function keepOutside(w, e) {
  if (e.flying || e.hp <= 0 || e.px == null) return;
  const was = { x: e.px, y: e.py };
  if (inFort(was) || !inFort(e)) return;
  let side;
  if (was.y <= FORT.y1) side = 'n';
  else if (was.y >= FORT.y2) side = 's';
  else if (was.x <= FORT.x1) side = 'w';
  else side = 'e';
  if (!e.trickle && w.walls[side].hp <= 0) return;   // 壊れた柵からは入れる
  if (side === 'n') e.y = FORT.y1 - 1;
  else if (side === 's') e.y = FORT.y2 + 1;
  else if (side === 'w') e.x = FORT.x1 - 1;
  else e.x = FORT.x2 + 1;
}

function damage(w, target, amount) {
  if (target === w.core) {
    w.core.hp = Math.max(0, w.core.hp - amount);
    w.core.hurtT = 0.15;
    w.events.push({ type: 'coreHit' });
    return;
  }
  if (target.deadT > 0) return;
  target.hp -= amount;
  target.hurtT = 0.2;
  if (target === w.hero) {
    w.events.push({ type: 'hurt' });
    if (target.hp <= 0) {
      target.hp = 0;
      target.deadT = HERO.respawn;
      w.save.stats.downs++;
      w.events.push({ type: 'heroDown' });
      w.fx.push({ kind: 'poof', x: target.x, y: target.y - 40, t: 0, life: 0.6, size: 90 });
    }
  } else if (target.hp <= 0) {
    target.hp = 0;
    target.deadT = ALLY_REVIVE;
    w.fx.push({ kind: 'poof', x: target.x, y: target.y - 30, t: 0, life: 0.5, size: 70 });
    w.events.push({ type: 'allyDown' });
  }
}

/** ボスの大技（予告 → 発動）。行動中は true を返し、通常の移動をしない */
function updateBoss(w, e, dt) {
  const h = w.hero;
  if (e.action) {
    const act = e.action;
    act.t += dt;
    if (act.kind === 'charge') {
      if (act.t < BOSS.charge.tell) return true;
      const sp = BOSS.charge.speed * dt;
      e.x += act.dx * sp;
      e.y += act.dy * sp;
      act.moved += sp;
      e.face = act.dx >= 0 ? 1 : -1;
      // 進路上のものに当たる（1回ずつ）
      const targets = [h, ...w.allies];
      for (const t of targets) {
        if (t.deadT > 0 || act.hit.includes(t)) continue;
        if (dist2(t, e) < (e.radius + 30) ** 2) { act.hit.push(t); damage(w, t, BOSS.charge.dmg); }
      }
      const side = blockingSide(e, e.x + act.dx * 2, e.y + act.dy * 2);
      if (side && w.walls[side].hp > 0) {
        w.walls[side].hp = Math.max(0, w.walls[side].hp - BOSS.charge.dmg * 3);
        w.walls[side].hurtT = 0.2;
        w.events.push({ type: 'wallHit', side, broken: w.walls[side].hp <= 0 });
        act.moved = BOSS.charge.length;
      }
      e.x = clamp(e.x, BOUNDS.x1, BOUNDS.x2);
      e.y = clamp(e.y, BOUNDS.y1, BOUNDS.y2);
      if (act.moved >= BOSS.charge.length) { e.action = null; w.tele = w.tele.filter((t) => t.owner !== e.id); }
      return true;
    }
    if (act.kind === 'stomp') {
      if (act.t < BOSS.stomp.tell) return true;
      for (const t of [h, ...w.allies]) {
        if (t.deadT > 0) continue;
        if (dist2(t, act) < BOSS.stomp.radius ** 2) damage(w, t, BOSS.stomp.dmg);
      }
      w.fx.push({ kind: 'shock', x: act.x, y: act.y, t: 0, life: 0.4, r: BOSS.stomp.radius });
      w.events.push({ type: 'stomp' });
      e.action = null;
      w.tele = w.tele.filter((t) => t.owner !== e.id);
      return true;
    }
  }
  e.bossT -= dt;
  if (e.bossT <= 0 && h.deadT <= 0 && dist2(e, h) < 700 * 700) {
    e.bossT = BOSS.every;
    const dx = h.x - e.x;
    const dy = h.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 260) {
      e.action = { kind: 'charge', t: 0, dx: dx / d, dy: dy / d, moved: 0, hit: [] };
      w.tele.push({ owner: e.id, kind: 'line', x: e.x, y: e.y, dx: dx / d, dy: dy / d, len: BOSS.charge.length, width: BOSS.charge.width, t: 0, life: BOSS.charge.tell });
    } else {
      e.action = { kind: 'stomp', t: 0, x: e.x, y: e.y };
      w.tele.push({ owner: e.id, kind: 'circle', x: e.x, y: e.y, r: BOSS.stomp.radius, t: 0, life: BOSS.stomp.tell });
    }
    w.events.push({ type: 'bossTell' });
    return true;
  }
  return false;
}

function updateShots(w, dt) {
  const h = w.hero;
  for (const s of w.shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.team === 'ally') {
      for (const e of w.enemies) {
        if (e.hp <= 0 || s.hit.includes(e.id)) continue;
        const r = e.radius + 10;
        if ((e.x - s.x) ** 2 + (e.y - e.size * 0.35 - s.y) ** 2 < r * r) {
          if (s.splash) {
            for (const o of w.enemies) if (o.hp > 0 && dist2(o, { x: s.x, y: s.y + o.size * 0.35 }) < s.splash * s.splash) hitEnemy(w, o, s.dmg, s, s.from);
            w.fx.push({ kind: 'boom', x: s.x, y: s.y, t: 0, life: 0.3, r: s.splash });
            s.life = 0;
            break;
          }
          hitEnemy(w, e, s.dmg, s, s.from);
          s.hit.push(e.id);
          if (s.pierce-- <= 0) { s.life = 0; break; }
        }
      }
    } else {
      const targets = [h, ...w.allies];
      for (const t of targets) {
        if (t.deadT > 0) continue;
        if ((t.x - s.x) ** 2 + (t.y - 40 - s.y) ** 2 < 34 * 34) { damage(w, t, s.dmg); s.life = 0; break; }
      }
      if (s.life > 0 && Math.abs(s.x - CORE_POS.x) < 90 && Math.abs(s.y - CORE_POS.y + 60) < 90) { damage(w, w.core, s.dmg); s.life = 0; }
    }
  }
  w.shots = w.shots.filter((s) => s.life > 0);
}

function updatePickups(w, dt) {
  const h = w.hero;
  if (h.deadT > 0) return;
  const mag = heroStats(w.save).magnet;
  for (const p of w.pickups) {
    p.t += dt;
    const d2 = dist2(p, h);
    if (p.fly || d2 < mag * mag) {
      p.fly = true;
      const d = Math.sqrt(d2) || 1;
      const sp = Math.min(d, (500 + p.t * 600) * dt);
      p.x += (h.x - p.x) / d * sp;
      p.y += (h.y - 30 - p.y) / d * sp;
      if (d < 36) { p.got = true; addCoins(w, p.value); }
    }
  }
  w.pickups = w.pickups.filter((p) => !p.got);
}

function addCoins(w, n) {
  w.save.coins += n;
  w.save.stats.coinsEarned += n;
  w.events.push({ type: 'coin', n });
}

/** 台座の上に立ち止まると、コインを少しずつ払って強化する */
function updatePads(w, input, dt) {
  const h = w.hero;
  const was = h.onPad;
  h.onPad = null;
  h.padWait = 0;
  if (h.deadT > 0) { h.padCharge = 0; h.padLock = null; return; }
  // 1段階上げたあとは、いったん台座から出るまで次を払わない
  if (h.padLock) {
    const lp = padById(h.padLock);
    if (dist2(h, lp) > (PAD_TRIGGER + 25) ** 2) h.padLock = null;
  }
  for (const p of PADS) {
    if (dist2(h, p) > PAD_TRIGGER * PAD_TRIGGER) continue;
    const st = padState(w.save, p);
    if (!st.visible || st.max) continue;
    h.onPad = p.id;
    if (was !== p.id || h.moving) h.padCharge = 0;
    if (h.padLock === p.id) { h.padWait = 3; return; }
    if (w.save.coins <= 0) return;
    // ウェーブ中、近くに敵がいる間は払わない（戦っているうちに勝手に使われないように）
    if (w.phase === 'wave' && w.enemies.some((e) => !e.trickle && dist2(e, h) < 300 * 300)) { h.padCharge = 0; h.padWait = 2; return; }
    if (h.moving) return;
    // 立ち止まってから少し待つ（輪が満ちたら支払い開始）
    h.padCharge = Math.min(1, (h.padCharge ?? 0) + dt / PAY_DELAY);
    if (h.padCharge < 1) { h.padWait = 1; return; }
    const rate = Math.max(PAY_MIN_RATE, st.cost / PAY_RATE);
    const pay = Math.min(w.save.coins, Math.ceil(rate * dt), st.cost - st.paid);
    if (pay <= 0) return;
    w.save.coins -= pay;
    w.save.paid[p.id] = st.paid + pay;
    w.events.push({ type: 'pay', pad: p.id });
    if (w.save.paid[p.id] >= st.cost) {
      w.save.levels[p.id] = st.level + 1;
      delete w.save.paid[p.id];
      rebuild(w);
      h.padLock = p.id;
      h.padCharge = 0;
      w.fx.push({ kind: 'build', x: p.x, y: p.y, t: 0, life: 0.6 });
      w.events.push({ type: 'build', pad: p.id, level: st.level + 1 });
    }
    return;
  }
}

function updateFx(w, dt) {
  for (const f of w.fx) f.t += dt;
  w.fx = w.fx.filter((f) => f.t < f.life);
  for (const t of w.tele) t.t += dt;
  w.tele = w.tele.filter((t) => t.t < t.life + 0.6);
  for (const s of Object.values(w.walls)) s.hurtT = Math.max(0, s.hurtT - dt);
  w.core.hurtT = Math.max(0, w.core.hurtT - dt);
}

function checkWaveEnd(w) {
  if (w.phase !== 'wave') return;
  if (w.core.hp <= 0) {
    w.phase = 'rest';
    w.save.stats.losses++;
    w.enemies = [];
    w.shots = [];
    w.tele = [];
    w.queue = [];
    restoreBetweenWaves(w);
    w.events.push({ type: 'waveLost', wave: w.save.wave });
    return;
  }
  if (w.queue.length || w.enemies.some((e) => !e.trickle)) return;
  const n = w.save.wave;
  const reward = WAVE_REWARD(n);
  // 落ちているコインもまとめて回収
  const left = w.pickups.reduce((a, p) => a + p.value, 0);
  w.pickups = [];
  addCoins(w, reward + left);
  w.save.stats.wavesWon++;
  w.save.wave = n + 1;
  w.phase = 'rest';
  w.trickleT = 4;
  restoreBetweenWaves(w);
  let ending = false;
  if (n === WAVES.length && !w.save.cleared) {
    w.save.cleared = true;
    queueTalk(w.save, 'ending');
    ending = true;
  }
  w.events.push({ type: 'waveWon', wave: n, reward, ending });
}

export function queueTalk(save, id) {
  if (save.seen.includes(id) || save.pending.includes(id)) return;
  save.pending.push(id);
}
export function ackTalk(save, id) {
  save.pending = save.pending.filter((x) => x !== id);
  if (!save.seen.includes(id)) save.seen.push(id);
}

/** 現在の主人公の位置を保存データに写す */
export function syncSave(w) {
  w.save.hero = { x: Math.round(w.hero.x), y: Math.round(w.hero.y) };
  return w.save;
}

export const remainingEnemies = (w) => w.queue.length + w.enemies.filter((e) => !e.trickle).length;

export function saveSummary(s) {
  const label = s.cleared ? `夜明けを迎えた・ウェーブ${s.wave}へ` : `ウェーブ${s.wave}/${WAVES.length}の前`;
  return { label, coins: s.coins, wave: s.wave, cleared: s.cleared };
}

export { WORLD };

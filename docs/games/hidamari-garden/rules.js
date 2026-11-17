// ひだまり菜園: ルール（純粋関数）
// すべての操作は state を直接変更せず、新しい state を返す。
// 戻り値: { ok, state, events, msg }  ― ok=false のとき state は元のまま。

import {
  SEASON_DAYS, SEASONS, START_COINS, START_PLOTS, MAX_PLOTS, CROPS, CROP_IDS, START_SEEDS,
  GOODS, GOOD_IDS, ITEM_IDS, isCrop, itemName, itemPrice, DECOR, DECOR_IDS, DECOR_BONUS,
  PLOT_STEPS, SPRINKLER_PRICE, FEATURED_BONUS, FESTIVAL_DECOR, PEOPLE, PEOPLE_IDS, QUESTS,
  QUEST_TOTAL, FESTIVAL_FLAGS,
} from './data.js';

// ---- 乱数（state に保存して再現可能に） ----
export function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { seed: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}
function rand(s) {
  const r = rngNext(s.rng);
  s.rng = r.seed;
  return r.value;
}
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];

// ---- 暦 ----
export const seasonIndex = (day) => Math.floor((day - 1) / SEASON_DAYS) % 4;
export const dayOfSeason = (day) => ((day - 1) % SEASON_DAYS) + 1;
export const yearOf = (day) => Math.floor((day - 1) / (SEASON_DAYS * 4)) + 1;
export const dateLabel = (day) => `${yearOf(day)}年目 ${SEASONS[seasonIndex(day)].name} ${dayOfSeason(day)}日目`;
export const seasonNames = (crop) => CROPS[crop].seasons.map((x) => SEASONS[x].name).join('・');
export const inSeason = (crop, day) => CROPS[crop].seasons.includes(seasonIndex(day));
// 成長: 水をやった晩に、旬なら 2、季節外れなら 1 進む。収穫には days×2 必要。
export const GROW_IN = 2;
export const GROW_OFF = 1;
export const growNeed = (crop) => CROPS[crop].days * GROW_IN;

// ---- 初期状態 ----
export function newGame(seed = (Date.now() ^ 0x5eed) >>> 0) {
  const s = {
    v: 1,
    day: 1,
    coins: START_COINS,
    plots: Array.from({ length: START_PLOTS }, () => emptyPlot()),
    seeds: [...START_SEEDS],
    seed: 'carrot',
    recipes: [],
    inv: {},
    bench: [],
    bigCan: false,
    sprinkler: false,
    decor: [],
    quests: Object.fromEntries(PEOPLE_IDS.map((p) => [p, 0])),
    orders: { enabled: false, slots: [null, null] },
    featured: null,
    flags: [],
    dialogues: [],
    pending: [],
    cleared: false,
    rng: seed >>> 0,
    stats: { harvested: 0, crafted: 0, sold: 0, questsDone: 0, ordersDone: 0, coinsEarned: 0, days: 0, playMs: 0 },
  };
  queueTalk(s, 'opening');
  queueQuestIntros(s);
  return s;
}
const emptyPlot = () => ({ c: null, g: 0, w: false });

// ---- 補助 ----
const clone = (s) => structuredClone(s);
const fail = (state, msg) => ({ ok: false, state, events: [], msg });
const ok = (state, events = [], msg = '') => ({ ok: true, state, events, msg });
export const count = (s, id) => s.inv[id] ?? 0;
function addItem(s, id, n) {
  const v = count(s, id) + n;
  if (v > 0) s.inv[id] = v; else delete s.inv[id];
}
function earn(s, n) {
  s.coins += n;
  s.stats.coinsEarned += n;
}
function queueTalk(s, id) {
  if (s.dialogues.includes(id) || s.pending.includes(id)) return;
  s.pending.push(id);
}
export const hasReq = (s, req) => Object.entries(req).every(([id, n]) => count(s, id) >= n);
const takeReq = (s, req) => { for (const [id, n] of Object.entries(req)) addItem(s, id, -n); };
export const reqText = (req) => Object.entries(req).map(([id, n]) => `${itemName(id)}×${n}`).join('、');

// ---- 畑 ----
/** 畑の見た目の段階 */
export function plotStage(p) {
  if (!p.c) return 'soil';
  const d = growNeed(p.c);
  if (p.g >= d) return 'ripe';
  if (p.g === 0) return 'seed';
  return p.g / d < 0.5 ? 'sprout' : 'young';
}
/** 収穫まであと何晩（今の季節の育ち方で、毎日水をやった場合） */
export function daysLeft(p, day) {
  if (!p.c) return 0;
  const rest = Math.max(0, growNeed(p.c) - p.g);
  return Math.ceil(rest / (day == null || inSeason(p.c, day) ? GROW_IN : GROW_OFF));
}
/** 水やりが必要か（植えてあり、未収穫、未水やり） */
export const needsWater = (p) => !!p.c && plotStage(p) !== 'ripe' && !p.w;

export function selectSeed(s0, crop) {
  if (!s0.seeds.includes(crop)) return fail(s0, 'まだその種は持っていません。');
  const s = clone(s0);
  s.seed = crop;
  return ok(s);
}

export function plant(s0, i, crop = s0.seed) {
  const p = s0.plots[i];
  if (!p) return fail(s0, '');
  if (p.c) return fail(s0, 'そこにはもう植わっています。');
  if (!crop || !s0.seeds.includes(crop)) return fail(s0, '下の種の列から、まく種を選んでください。');
  const c = CROPS[crop];
  if (s0.coins < c.seed) return fail(s0, `${c.name}の種には ${c.seed} コイン必要です。`);
  const s = clone(s0);
  s.coins -= c.seed;
  s.plots[i] = { c: crop, g: 0, w: s.sprinkler };
  const msg = inSeason(crop, s.day) ? '' : `${c.name}は季節外れなので、育ちがゆっくりです（旬は${seasonNames(crop)}）。`;
  return ok(s, [{ type: 'plant', i, crop }], msg);
}

export function water(s0, i) {
  const p = s0.plots[i];
  if (!p || !p.c) return fail(s0, '');
  if (plotStage(p) === 'ripe') return fail(s0, 'もう収穫できます。');
  if (p.w) return fail(s0, '今日はもう水をやりました。');
  const s = clone(s0);
  s.plots[i].w = true;
  return ok(s, [{ type: 'water', i }]);
}

export function waterAll(s0) {
  if (!s0.bigCan) return fail(s0, '大きなじょうろがまだありません。');
  const idx = s0.plots.map((p, i) => (needsWater(p) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return fail(s0, '水やりが必要な畑はありません。');
  const s = clone(s0);
  for (const i of idx) s.plots[i].w = true;
  return ok(s, idx.map((i) => ({ type: 'water', i })));
}

function harvestInto(s, i, events) {
  const p = s.plots[i];
  const c = CROPS[p.c];
  addItem(s, p.c, 1);
  s.stats.harvested++;
  events.push({ type: 'harvest', i, crop: p.c });
  s.plots[i] = c.regrow ? { c: p.c, g: (c.days - c.regrow) * GROW_IN, w: s.sprinkler } : emptyPlot();
}

export function harvest(s0, i) {
  const p = s0.plots[i];
  if (!p || plotStage(p) !== 'ripe') return fail(s0, '');
  const s = clone(s0);
  const events = [];
  harvestInto(s, i, events);
  return ok(s, events);
}

export function harvestAll(s0) {
  const idx = s0.plots.map((p, i) => (plotStage(p) === 'ripe' ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return fail(s0, '収穫できる作物はありません。');
  const s = clone(s0);
  const events = [];
  for (const i of idx) harvestInto(s, i, events);
  return ok(s, events, `${idx.length}つ収穫しました。`);
}

/** 1回のタップ: 空き→種まき / 未水やり→水やり / 実った→収穫 */
export function tapPlot(s, i) {
  const p = s.plots[i];
  if (!p) return fail(s, '');
  if (!p.c) return plant(s, i);
  if (plotStage(p) === 'ripe') return harvest(s, i);
  if (!p.w) return water(s, i);
  return fail(s, `${CROPS[p.c].name}：あと${daysLeft(p, s.day)}晩くらいで収穫できます。`);
}

/** 植わっている作物を抜く（植え替え用） */
export function clearPlot(s0, i) {
  const p = s0.plots[i];
  if (!p || !p.c) return fail(s0, '');
  const s = clone(s0);
  s.plots[i] = emptyPlot();
  return ok(s, [{ type: 'clear', i }]);
}

// ---- 作業台 ----
export function craft(s0, k, recipe) {
  const b = s0.bench[k];
  if (!b) return fail(s0, '');
  if (b.r) return fail(s0, 'この作業台は使用中です。');
  if (!s0.recipes.includes(recipe)) return fail(s0, 'まだ作り方を知りません。');
  const g = GOODS[recipe];
  if (!hasReq(s0, g.in)) return fail(s0, `材料が足りません（${reqText(g.in)}）。`);
  const s = clone(s0);
  takeReq(s, g.in);
  s.bench[k] = { r: recipe, left: g.days };
  return ok(s, [{ type: 'craft', k, recipe }], `${g.name}を仕込みました。${g.days}晩で完成します。`);
}

// ---- 売る ----
export function sellPrice(s, id) {
  const bonus = 1 + DECOR_BONUS * s.decor.length + (s.featured === id ? FEATURED_BONUS : 0);
  return Math.round(itemPrice(id) * bonus);
}
export function sell(s0, id, n = 1) {
  if (!ITEM_IDS.includes(id) || !Number.isInteger(n) || n < 1) return fail(s0, '');
  if (count(s0, id) < n) return fail(s0, '数が足りません。');
  const s = clone(s0);
  const total = sellPrice(s0, id) * n;
  addItem(s, id, -n);
  earn(s, total);
  s.stats.sold += n;
  return ok(s, [{ type: 'sell', id, n, coins: total }], `${itemName(id)}×${n} を ${total} コインで売りました。`);
}

// ---- 依頼 ----
/** その人の今の依頼（現れていなければ null） */
export function activeQuest(s, who) {
  const q = QUESTS[who][s.quests[who]];
  if (!q) return null;
  if (q.after && !questDone(s, q.after)) return null;
  return q;
}
export function questDone(s, qid) {
  for (const who of PEOPLE_IDS) {
    const k = QUESTS[who].findIndex((q) => q.id === qid);
    if (k >= 0) return s.quests[who] > k;
  }
  return false;
}
export const questsDoneCount = (s) => PEOPLE_IDS.reduce((a, p) => a + s.quests[p], 0);

function queueQuestIntros(s) {
  for (const who of PEOPLE_IDS) {
    const q = activeQuest(s, who);
    if (q) queueTalk(s, `${q.id}-intro`);
  }
}

export function deliverQuest(s0, who) {
  const q = activeQuest(s0, who);
  if (!q) return fail(s0, '');
  if (!hasReq(s0, q.req)) return fail(s0, `まだ足りません（${reqText(q.req)}）。`);
  if (q.needDecor && s0.decor.length < q.needDecor) return fail(s0, `庭に飾りを${q.needDecor}つ以上置いてから届けましょう。`);
  const s = clone(s0);
  const events = [{ type: 'deliver', who, coins: q.coins }];
  takeReq(s, q.req);
  earn(s, q.coins);
  s.quests[who]++;
  s.stats.questsDone++;
  const e = q.effects || {};
  for (const c of e.seeds || []) {
    if (!s.seeds.includes(c)) { s.seeds.push(c); events.push({ type: 'unlock', what: 'seed', id: c }); }
  }
  for (const r of e.recipes || []) {
    if (!s.recipes.includes(r)) { s.recipes.push(r); events.push({ type: 'unlock', what: 'recipe', id: r }); }
  }
  for (let k = 0; k < (e.bench || 0); k++) {
    s.bench.push({ r: null, left: 0 });
    events.push({ type: 'unlock', what: 'bench' });
  }
  if (e.bigCan) { s.bigCan = true; events.push({ type: 'unlock', what: 'bigCan' }); }
  if (e.orders && !s.orders.enabled) {
    s.orders.enabled = true;
    fillOrders(s);
    events.push({ type: 'unlock', what: 'orders' });
  }
  if (e.flag && !s.flags.includes(e.flag)) s.flags.push(e.flag);
  queueTalk(s, `${q.id}-thanks`);
  queueQuestIntros(s);
  if (canFestival(s)) queueTalk(s, 'festivalReady');
  return ok(s, events, `${PEOPLE[who].name}に届けました（+${q.coins}コイン）`);
}

// ---- 掲示板の注文 ----
/** 注文に出せる品物: 今の季節に育つ解放済みの作物と、作り方を知っている加工品 */
export function orderPool(s) {
  const si = seasonIndex(s.day);
  const inS = s.seeds.filter((c) => CROPS[c].seasons.includes(si));
  return [...(inS.length ? inS : s.seeds), ...s.recipes];
}
function makeOrder(s) {
  const pool = orderPool(s);
  if (!pool.length) return null;
  const kinds = pool.length >= 2 && rand(s) < 0.35 ? 2 : 1;
  const req = {};
  while (Object.keys(req).length < kinds) {
    const id = pick(s, pool);
    if (req[id]) continue;
    req[id] = isCrop(id) ? 2 + Math.floor(rand(s) * 4) : 1 + Math.floor(rand(s) * 2);
  }
  const value = Object.entries(req).reduce((a, [id, n]) => a + itemPrice(id) * n, 0);
  return { req, coins: Math.round(value * 1.4 + 5) };
}
function fillOrders(s) {
  if (!s.orders.enabled) return;
  s.orders.slots = s.orders.slots.map((o) => o ?? makeOrder(s));
}
export function deliverOrder(s0, k) {
  const o = s0.orders.slots[k];
  if (!o) return fail(s0, '');
  if (!hasReq(s0, o.req)) return fail(s0, `まだ足りません（${reqText(o.req)}）。`);
  const s = clone(s0);
  takeReq(s, o.req);
  const coins = Math.round(o.coins * (1 + DECOR_BONUS * s.decor.length));
  earn(s, coins);
  s.orders.slots[k] = null;
  s.stats.ordersDone++;
  return ok(s, [{ type: 'deliver', order: k, coins }], `注文を届けました（+${coins}コイン）。次の注文は明日の朝に届きます。`);
}
export function replaceOrder(s0, k) {
  if (!s0.orders.slots[k]) return fail(s0, '');
  const s = clone(s0);
  const old = JSON.stringify(s.orders.slots[k].req);
  let o = makeOrder(s);
  for (let t = 0; t < 4 && o && JSON.stringify(o.req) === old; t++) o = makeOrder(s);
  s.orders.slots[k] = o;
  return ok(s, [{ type: 'replace', k }]);
}

// ---- お店 ----
export const nextPlotStep = (s) => PLOT_STEPS.find((p) => p.to > s.plots.length) ?? null;
export function buyPlots(s0) {
  const st = nextPlotStep(s0);
  if (!st) return fail(s0, 'これ以上は広げられません。');
  if (s0.coins < st.price) return fail(s0, `${st.price} コイン必要です。`);
  const s = clone(s0);
  s.coins -= st.price;
  while (s.plots.length < st.to) s.plots.push(emptyPlot());
  return ok(s, [{ type: 'unlock', what: 'plots', n: st.to }], `畑が${st.to}マスに広がりました！`);
}
export function buySprinkler(s0) {
  if (s0.sprinkler) return fail(s0, 'もう設置してあります。');
  if (!s0.bigCan) return fail(s0, 'ソラの依頼を進めると買えるようになります。');
  if (s0.coins < SPRINKLER_PRICE) return fail(s0, `${SPRINKLER_PRICE} コイン必要です。`);
  const s = clone(s0);
  s.coins -= SPRINKLER_PRICE;
  s.sprinkler = true;
  for (const p of s.plots) if (needsWater(p)) p.w = true;
  return ok(s, [{ type: 'unlock', what: 'sprinkler' }], 'スプリンクラーを設置しました。毎朝、畑ぜんぶに水がまかれます。');
}
export function buyDecor(s0, id) {
  const d = DECOR[id];
  if (!d) return fail(s0, '');
  if (s0.decor.includes(id)) return fail(s0, 'もう置いてあります。');
  if (s0.coins < d.price) return fail(s0, `${d.price} コイン必要です。`);
  const s = clone(s0);
  s.coins -= d.price;
  s.decor.push(id);
  const events = [{ type: 'unlock', what: 'decor', id }];
  if (canFestival(s)) queueTalk(s, 'festivalReady');
  return ok(s, events, `${d.name}を庭に置きました。売値が上がります（+${Math.round(DECOR_BONUS * 100)}%）。`);
}

// ---- 一日の終わり ----
export function sleep(s0) {
  const s = clone(s0);
  const events = [];
  const si = seasonIndex(s.day);
  // 育つ: その日に水をやった作物（旬なら早く、季節外れならゆっくり）
  s.plots.forEach((p, i) => {
    if (!p.c || plotStage(p) === 'ripe') return;
    if (p.w) {
      p.g = Math.min(growNeed(p.c), p.g + (CROPS[p.c].seasons.includes(si) ? GROW_IN : GROW_OFF));
      if (plotStage(p) === 'ripe') events.push({ type: 'ripe', i });
    }
    p.w = false;
  });
  // 作業台
  s.bench.forEach((b, k) => {
    if (!b.r) return;
    b.left--;
    if (b.left <= 0) {
      addItem(s, b.r, 1);
      s.stats.crafted++;
      events.push({ type: 'crafted', k, id: b.r });
      s.bench[k] = { r: null, left: 0 };
    }
  });
  s.day++;
  s.stats.days++;
  const nsi = seasonIndex(s.day);
  if (nsi !== si) {
    events.push({ type: 'season', season: nsi });
    if (nsi === 3) queueTalk(s, 'winter');
  }
  // 朝: スプリンクラー
  if (s.sprinkler) for (const p of s.plots) if (needsWater(p)) p.w = true;
  // 朝: 小鳥の贈り物（巣箱）
  if (s.decor.includes('birdhouse')) {
    const inS = s.seeds.filter((c) => CROPS[c].seasons.includes(nsi));
    const crops = inS.length ? inS : s.seeds;
    if (crops.length) {
      const c = pick(s, crops);
      addItem(s, c, 1);
      events.push({ type: 'gift', id: c });
    }
  }
  // 朝: 今日のおすすめと注文
  const pool = [...s.seeds, ...s.recipes];
  s.featured = pool.length ? pick(s, pool) : null;
  fillOrders(s);
  return ok(s, events);
}

// ---- 収穫祭 ----
export function canFestival(s) {
  return FESTIVAL_FLAGS.every((f) => s.flags.includes(f)) && s.decor.length >= FESTIVAL_DECOR;
}
export function festivalStatus(s) {
  return {
    food: s.flags.includes('festival-food'),
    letter: s.flags.includes('festival-letter'),
    flowers: s.flags.includes('festival-flowers'),
    decor: Math.min(s.decor.length, FESTIVAL_DECOR),
    decorNeed: FESTIVAL_DECOR,
  };
}
export function holdFestival(s0) {
  if (s0.cleared) return fail(s0, '');
  if (!canFestival(s0)) return fail(s0, 'まだ準備がそろっていません。');
  const s = clone(s0);
  s.cleared = true;
  queueTalk(s, 'festival');
  return ok(s, [{ type: 'festival' }]);
}

// ---- 会話 ----
export function ackDialogue(s0, id) {
  if (!s0.pending.includes(id)) return fail(s0, '');
  const s = clone(s0);
  s.pending = s.pending.filter((x) => x !== id);
  if (!s.dialogues.includes(id)) s.dialogues.push(id);
  return ok(s);
}

/** 読み込み後の補正（依頼の会話の積み残しなど） */
export function normalize(s0) {
  const s = clone(s0);
  queueQuestIntros(s);
  if (canFestival(s) && !s.cleared) queueTalk(s, 'festivalReady');
  if (!s.seeds.includes(s.seed)) s.seed = s.seeds[0];
  if (s.orders.enabled) fillOrders(s);
  return s;
}

/** 次にすること（画面上部のヒント） */
export function hint(s) {
  if (s.stats.harvested === 0) {
    const planted = s.plots.some((p) => p.c);
    if (!planted) return '空いている畑をタップすると、選んだ種をまけます。';
    if (s.plots.some((p) => needsWater(p))) return '植えた畑をタップして、水をやりましょう。';
    if (!s.plots.some((p) => plotStage(p) === 'ripe')) return '水をやったら「おやすみ」で次の日へ。ひと晩ごとに育ちます。';
    return '実った畑をタップして収穫しましょう。';
  }
  if (s.quests.toyo === 0 && count(s, 'carrot') >= 3) return 'とよさんの依頼に「届ける」を押しましょう。';
  return '';
}

export function saveSummary(s) {
  return {
    label: s.cleared ? `${dateLabel(s.day)}・収穫祭を終えて` : dateLabel(s.day),
    day: s.day,
    coins: s.coins,
    quests: `${questsDoneCount(s)}/${QUEST_TOTAL}`,
    cleared: s.cleared,
  };
}

export { CROP_IDS, GOOD_IDS, DECOR_IDS, MAX_PLOTS };

// マージの旅: ルール（純粋関数）
// すべての操作は state を直接変更せず、新しい state を返す。
// 戻り値: { ok, state, events, msg }  ― ok=false のとき state は元のまま。
// これにより「消費・報酬・依頼完了・解放」は1つの新 state として一括で保存される。

import {
  BOARD_W, BOARD_H, BOARD_SIZE, MAX_LEVEL, STORAGE_STEPS, CHAINS, CHAIN_IDS,
  ISLANDS, islandById, itemKey, itemName, lv1Value, TUTORIAL_QUEST,
} from './data.js';

// ---- 乱数（state に保存して再現可能に） ----
export function rngNext(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { seed: t, value: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}

// ---- 初期状態 ----
export function newGame(seed = (Date.now() ^ 0x5eed) >>> 0) {
  return {
    v: 1,
    coins: 0,
    island: 'komorebi',
    unlockedIslands: ['komorebi'],
    visited: ['komorebi'],
    routes: [],
    gens: ['fruit'],
    board: Array(BOARD_SIZE).fill(null),
    storage: { cap: 0, items: [] },
    quests: Object.fromEntries(ISLANDS.map((i) => [i.id, 0])),
    orders: { enabled: false, slots: [null, null], last: [null, null] },
    discovered: [],
    flags: [],
    dialogues: ['arrive-komorebi'],
    pending: ['arrive-komorebi'],
    lastDeleted: null,
    cleared: false,
    rng: seed >>> 0,
    stats: { generated: 0, merged: 0, questsDone: 0, ordersDone: 0, coinsEarned: 0, playMs: 0 },
  };
}

const clone = (s) => structuredClone(s);
const fail = (state, msg) => ({ ok: false, state, events: [], msg });
const okR = (state, events = [], msg = '') => ({ ok: true, state, events, msg });

// 生成位置: 生産元（盤面の下）に近いマスから
export const SPAWN_ORDER = Array.from({ length: BOARD_SIZE }, (_, i) => i).sort((a, b) => {
  const d = (i) => {
    const x = i % BOARD_W, y = Math.floor(i / BOARD_W);
    return (x - (BOARD_W - 1) / 2) ** 2 * 1.1 + (BOARD_H - 1 - y) ** 2;
  };
  return d(a) - d(b) || a - b;
});

function firstEmptyBoard(s) {
  for (const i of SPAWN_ORDER) if (!s.board[i]) return i;
  return -1;
}
function firstEmptyStorage(s) {
  for (let i = 0; i < s.storage.cap; i++) if (!s.storage.items[i]) return i;
  return -1;
}
export const emptyCount = (s) => s.board.filter((x) => !x).length;

function discover(s, c, l, events) {
  const k = itemKey(c, l);
  if (!s.discovered.includes(k)) {
    s.discovered.push(k);
    events.push({ type: 'discover', c, l });
  }
}

function getAt(s, loc) {
  if (!loc) return undefined;
  if (loc.z === 'b') return loc.i >= 0 && loc.i < BOARD_SIZE ? s.board[loc.i] : undefined;
  if (loc.z === 's') return loc.i >= 0 && loc.i < s.storage.cap ? s.storage.items[loc.i] : undefined;
  return undefined;
}
function setAt(s, loc, v) {
  if (loc.z === 'b') s.board[loc.i] = v;
  else s.storage.items[loc.i] = v;
}
const validLoc = (s, loc) => getAt(s, loc) !== undefined;

export const FULL_MSG = '盤面がいっぱいです。同じ品物を合成するか、収納にしまうか、不要な品を手放して空きを作りましょう。';

// ---- 生成 ----
export function generate(state, chain) {
  if (!state.gens.includes(chain)) return fail(state, 'この生産元はまだ使えません。');
  const i = firstEmptyBoard(state);
  if (i < 0) return fail(state, FULL_MSG);
  const s = clone(state);
  const events = [{ type: 'generate', i, c: chain }];
  s.board[i] = { c: chain, l: 1 };
  discover(s, chain, 1, events);
  s.stats.generated++;
  return okR(s, events);
}

// ---- 移動・合成 ----
// loc = { z: 'b'(盤面) | 's'(収納), i }
export function move(state, src, dst) {
  if (!validLoc(state, src) || !validLoc(state, dst)) return fail(state, '');
  const item = getAt(state, src);
  if (!item) return fail(state, '');
  if (src.z === dst.z && src.i === dst.i) return fail(state, '');
  const target = getAt(state, dst);
  const s = clone(state);
  const events = [];
  if (!target) {
    setAt(s, dst, item);
    setAt(s, src, null);
    events.push({ type: 'move', src, dst });
    return okR(s, events);
  }
  if (dst.z === 's') return fail(state, '収納のそのマスは使用中です。');
  if (target.c === item.c && target.l === item.l) {
    if (item.l >= MAX_LEVEL) return fail(state, `${itemName(item.c, item.l)}はこれ以上合成できません（Lv.${MAX_LEVEL}が上限）。`);
    const nl = item.l + 1;
    setAt(s, dst, { c: item.c, l: nl });
    setAt(s, src, null);
    s.stats.merged++;
    events.push({ type: 'merge', dst, c: item.c, l: nl });
    discover(s, item.c, nl, events);
    return okR(s, events);
  }
  return fail(state, '同じ種類・同じ段階の品物どうしだけ合成できます。');
}

/** 盤面の品物を収納の空きへ */
export function store(state, boardIdx) {
  if (state.storage.cap === 0) return fail(state, '収納は「木陰に小さな売り台を」の依頼で使えるようになります。');
  if (!state.board[boardIdx]) return fail(state, '');
  const j = firstEmptyStorage(state);
  if (j < 0) return fail(state, '収納がいっぱいです。島マップ横の収納から枠を増やせます。');
  return move(state, { z: 'b', i: boardIdx }, { z: 's', i: j });
}

/** 収納の品物を盤面の空きへ */
export function takeOut(state, storageIdx) {
  if (!state.storage.items[storageIdx]) return fail(state, '');
  const i = firstEmptyBoard(state);
  if (i < 0) return fail(state, FULL_MSG);
  return move(state, { z: 's', i: storageIdx }, { z: 'b', i });
}

// ---- 手放す・取り消し ----
export function removeItem(state, loc) {
  const item = getAt(state, loc);
  if (!item) return fail(state, '');
  const s = clone(state);
  setAt(s, loc, null);
  s.lastDeleted = { item: { ...item }, z: loc.z, i: loc.i };
  return okR(s, [{ type: 'remove', loc }], `${itemName(item.c, item.l)}を手放しました。`);
}

export function undoRemove(state) {
  const ld = state.lastDeleted;
  if (!ld) return fail(state, '取り消せる操作はありません。');
  let loc = { z: ld.z, i: ld.i };
  if (!validLoc(state, loc) || getAt(state, loc)) {
    const bi = firstEmptyBoard(state);
    if (bi >= 0) loc = { z: 'b', i: bi };
    else {
      const si = firstEmptyStorage(state);
      if (si >= 0) loc = { z: 's', i: si };
      else return fail(state, '戻す場所がありません。盤面か収納を1マス空けてから「元に戻す」を押してください。');
    }
  }
  const s = clone(state);
  setAt(s, loc, { ...ld.item });
  s.lastDeleted = null;
  return okR(s, [{ type: 'restore', loc }], `${itemName(ld.item.c, ld.item.l)}を元に戻しました。`);
}

// ---- 所持数と消費 ----
export function countItem(s, c, l) {
  let n = 0;
  for (const x of s.board) if (x && x.c === c && x.l === l) n++;
  for (const x of s.storage.items) if (x && x.c === c && x.l === l) n++;
  return n;
}
export const reqStatus = (s, req) => req.map((r) => ({ ...r, have: countItem(s, r.c, r.l) }));
export const canFulfill = (s, req) => req.every((r) => countItem(s, r.c, r.l) >= r.n);

function consume(s, req) {
  for (const r of req) {
    let left = r.n;
    for (let i = 0; i < s.board.length && left > 0; i++) {
      const x = s.board[i];
      if (x && x.c === r.c && x.l === r.l) { s.board[i] = null; left--; }
    }
    for (let i = 0; i < s.storage.items.length && left > 0; i++) {
      const x = s.storage.items[i];
      if (x && x.c === r.c && x.l === r.l) { s.storage.items[i] = null; left--; }
    }
    if (left > 0) throw new Error('consume: 不足');
  }
}

// ---- 固定依頼 ----
export function currentQuest(s, islandId = s.island) {
  const isl = islandById(islandId);
  const idx = s.quests[islandId] ?? 0;
  return isl.quests[idx] ?? null;
}

export function deliverQuest(state, questId) {
  const q = currentQuest(state);
  if (!q || q.id !== questId) return fail(state, 'この依頼はすでに達成済みです。');
  if (!canFulfill(state, q.req)) return fail(state, 'まだ品物が足りません。');
  const s = clone(state);
  const events = [{ type: 'deliver', kind: 'quest', id: q.id, coins: q.coins }];
  consume(s, q.req);
  s.coins += q.coins;
  s.stats.coinsEarned += q.coins;
  s.stats.questsDone++;
  s.quests[s.island]++;
  const ef = q.effects || {};
  if (ef.flag && !s.flags.includes(ef.flag)) s.flags.push(ef.flag);
  if (ef.storage && s.storage.cap === 0) {
    s.storage.cap = STORAGE_STEPS[0].cap;
    s.storage.items = Array(s.storage.cap).fill(null);
    events.push({ type: 'unlock', what: 'storage' });
  }
  if (ef.orders && !s.orders.enabled) {
    s.orders.enabled = true;
    fillOrders(s);
    events.push({ type: 'unlock', what: 'orders' });
  }
  if (ef.gen && !s.gens.includes(ef.gen)) {
    s.gens.push(ef.gen);
    events.push({ type: 'unlock', what: 'gen', c: ef.gen });
  }
  if (ef.route && !s.routes.includes(ef.route)) {
    s.routes.push(ef.route);
    events.push({ type: 'unlock', what: 'route', island: ef.route });
  }
  queueDialogue(s, q.done, events);
  if (ef.ending && !s.cleared) {
    s.cleared = true;
    queueDialogue(s, 'ending', events);
    events.push({ type: 'ending' });
  }
  return okR(s, events, `「${q.title}」を達成！ ${q.coins}コイン`);
}

function queueDialogue(s, id, events) {
  if (!s.dialogues.includes(id)) s.dialogues.push(id);
  if (!s.pending.includes(id)) s.pending.push(id);
  events.push({ type: 'dialogue', id });
}

/** 会話を表示し終えた（スキップ含む） */
export function ackDialogue(state, id) {
  if (!state.pending.includes(id)) return fail(state, '');
  const s = clone(state);
  s.pending = s.pending.filter((x) => x !== id);
  return okR(s);
}

// ---- 通常注文 ----
const SHORT = [[2, 1, 1], [2, 2, 1], [2, 3, 0.8], [3, 1, 1], [3, 2, 0.8]];        // [段階, 数量, 重み]
const LONG = [[3, 2, 1], [3, 3, 0.7], [4, 1, 1.3], [4, 2, 0.9], [5, 1, 0.4]];
export const orderReward = (req) => req.reduce((a, r) => a + r.n * lv1Value(r.l) * 3, 0);
const orderKey = (o) => o ? o.req.map((r) => `${r.c}-${r.l}x${r.n}`).join('+') : null;

export function availableChains(s) {
  return CHAIN_IDS.filter((c) => s.gens.includes(c));
}

function candidates(s, slot) {
  const table = slot === 0 ? SHORT : LONG;
  const out = [];
  for (const c of availableChains(s)) {
    for (const [l, n, w] of table) {
      // 島の主力系統をやや優先
      const home = CHAINS[c].island === s.island ? 1.4 : 1;
      out.push({ req: [{ c, l, n }], w: w * home });
    }
  }
  return out;
}

function pick(s, list) {
  const total = list.reduce((a, x) => a + x.w, 0);
  const r = rngNext(s.rng);
  s.rng = r.seed;
  let t = r.value * total;
  for (const x of list) { t -= x.w; if (t < 0) return x; }
  return list[list.length - 1];
}

function makeOrder(s, slot) {
  const other = s.orders.slots[1 - slot];
  const otherKey = orderKey(other);
  const otherCL = other ? other.req.map((r) => `${r.c}-${r.l}`) : [];
  const last = s.orders.last[slot];
  const all = candidates(s, slot);
  const tiers = [
    all.filter((o) => orderKey(o) !== otherKey && orderKey(o) !== last && !otherCL.includes(`${o.req[0].c}-${o.req[0].l}`)),
    all.filter((o) => orderKey(o) !== otherKey && orderKey(o) !== last),
    all.filter((o) => orderKey(o) !== otherKey),
    all,
  ];
  const list = tiers.find((t) => t.length > 0);
  const chosen = pick(s, list);
  return { req: chosen.req.map((r) => ({ ...r })), coins: orderReward(chosen.req) };
}

function fillOrders(s) {
  for (const slot of [0, 1]) {
    if (!s.orders.slots[slot]) s.orders.slots[slot] = makeOrder(s, slot);
  }
}

/** 読み込み直後の補正（旧版移行で注文が空のときなど）。変更が無ければ同じ state を返す */
export function normalize(state) {
  if (!state.orders.enabled || state.orders.slots.every(Boolean)) return state;
  const s = clone(state);
  fillOrders(s);
  return s;
}

export function replaceOrder(state, slot) {
  if (!state.orders.enabled || !state.orders.slots[slot]) return fail(state, '');
  const s = clone(state);
  s.orders.last[slot] = orderKey(s.orders.slots[slot]);
  s.orders.slots[slot] = null;
  s.orders.slots[slot] = makeOrder(s, slot);
  return okR(s, [{ type: 'order-replace', slot }]);
}

export function deliverOrder(state, slot) {
  const o = state.orders.enabled ? state.orders.slots[slot] : null;
  if (!o) return fail(state, '');
  if (!canFulfill(state, o.req)) return fail(state, 'まだ品物が足りません。');
  const s = clone(state);
  consume(s, o.req);
  s.coins += o.coins;
  s.stats.coinsEarned += o.coins;
  s.stats.ordersDone++;
  s.orders.last[slot] = orderKey(o);
  s.orders.slots[slot] = null;
  s.orders.slots[slot] = makeOrder(s, slot);
  return okR(s, [{ type: 'deliver', kind: 'order', slot, coins: o.coins }], `注文を届けました！ ${o.coins}コイン`);
}

// ---- 収納の拡張 ----
export function nextStorageStep(s) {
  return STORAGE_STEPS.find((st) => st.cap > s.storage.cap && st.cost > 0) ?? null;
}

export function buyStorage(state) {
  if (state.storage.cap === 0) return fail(state, '収納はまだ使えません。');
  const step = nextStorageStep(state);
  if (!step) return fail(state, '収納はこれ以上増やせません。');
  if (state.coins < step.cost) return fail(state, `コインが足りません（${step.cost}コイン必要）。通常注文でコインを集めましょう。`);
  const s = clone(state);
  s.coins -= step.cost;
  while (s.storage.items.length < step.cap) s.storage.items.push(null);
  s.storage.cap = step.cap;
  return okR(s, [{ type: 'unlock', what: 'storage-expand', cap: step.cap }], `収納が${step.cap}枠になりました。`);
}

// ---- 島の移動 ----
export function islandStatus(s, id) {
  const isl = islandById(id);
  if (s.unlockedIslands.includes(id)) return 'open';
  if (s.routes.includes(id)) return s.coins >= isl.unlockCost ? 'buyable' : 'route';
  return 'hidden';
}

/** コインを払って航路を開き、その島へ渡る（1回の操作で一括反映） */
export function unlockIsland(state, id) {
  const isl = islandById(id);
  if (!isl) return fail(state, '');
  if (state.unlockedIslands.includes(id)) return travel(state, id);
  if (!state.routes.includes(id)) return fail(state, 'まだ航路が見つかっていません。');
  if (state.coins < isl.unlockCost) return fail(state, `コインが足りません（${isl.unlockCost}コイン必要）。通常注文でコインを集めましょう。`);
  const s = clone(state);
  s.coins -= isl.unlockCost;
  s.unlockedIslands.push(id);
  const r = travel(s, id);
  r.events.unshift({ type: 'unlock', what: 'island', island: id });
  return r;
}

export function travel(state, id) {
  const isl = islandById(id);
  if (!isl || !state.unlockedIslands.includes(id)) return fail(state, 'この島にはまだ渡れません。');
  if (state.island === id) return fail(state, '');
  const s = clone(state);
  const events = [{ type: 'travel', island: id }];
  s.island = id;
  if (!s.visited.includes(id)) {
    s.visited.push(id);
    if (!s.gens.includes(isl.firstGen)) {
      s.gens.push(isl.firstGen);
      events.push({ type: 'unlock', what: 'gen', c: isl.firstGen });
    }
    queueDialogue(s, `arrive-${id}`, events);
  }
  return okR(s, events, `${isl.name}に着きました。`);
}

// ---- 表示補助 ----
export function islandProgress(s, id) {
  const isl = islandById(id);
  return { done: Math.min(s.quests[id] ?? 0, isl.quests.length), total: isl.quests.length };
}

export function tutorialHint(s) {
  if (s.island !== 'komorebi') return null;
  const q = currentQuest(s);
  if (!q || q.id !== TUTORIAL_QUEST) return null;
  if (countItem(s, 'fruit', 2) >= 1) return { step: 3, target: 'quest', text: '「納品」を押して、りんごのペアを届けましょう。' };
  const n1 = countItem(s, 'fruit', 1);
  if (n1 >= 2) return { step: 2, target: 'board', text: 'りんごを、もう1つのりんごへドラッグ（またはタップ→タップ）して合成しましょう。' };
  return { step: 1, target: 'gen', text: `下の果樹をタップしてりんごを作りましょう（あと${2 - n1}回）。` };
}

export function saveSummary(s) {
  const isl = islandById(s.island);
  return {
    label: s.cleared ? `${isl.name}・灯台に光が灯った` : `${isl.name}・旅の途中`,
    island: s.island,
    islandName: isl.name,
    coins: s.coins,
    cleared: s.cleared,
  };
}

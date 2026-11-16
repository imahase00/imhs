// マージの旅: セーブ形式の検証・旧版移行・バックアップ説明
// ランチャーのバックアップ復元からも動的 import される（games.json の saveModule）。

import {
  GAME_ID, SCHEMA, BOARD_SIZE, MAX_LEVEL, STORAGE_STEPS, CHAIN_IDS, ISLANDS, ISLAND_IDS,
  DIALOGUES, islandById, itemKey,
} from './data.js';

export { GAME_ID, SCHEMA };

const KNOWN_FLAGS = new Set(ISLANDS.flatMap((i) => i.quests.map((q) => q.effects?.flag).filter(Boolean)));
const VALID_CAPS = new Set([0, ...STORAGE_STEPS.map((s) => s.cap)]);
const isInt = (n) => Number.isInteger(n);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

function validItem(x) {
  return isObj(x) && CHAIN_IDS.includes(x.c) && isInt(x.l) && x.l >= 1 && x.l <= MAX_LEVEL
    && Object.keys(x).every((k) => k === 'c' || k === 'l');
}
const validCell = (x) => x === null || validItem(x);
const strArr = (a, allowed) => Array.isArray(a) && a.every((x) => typeof x === 'string' && allowed(x))
  && new Set(a).size === a.length;

function validReq(req) {
  return Array.isArray(req) && req.length >= 1 && req.length <= 3
    && req.every((r) => isObj(r) && CHAIN_IDS.includes(r.c) && isInt(r.l) && r.l >= 1 && r.l <= MAX_LEVEL
      && isInt(r.n) && r.n >= 1 && r.n <= 10);
}

/**
 * 現行版（SCHEMA）のデータを検証する。
 * @returns {string[]} エラー一覧（空なら正常）
 */
export function validate(d) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(msg); };
  if (!isObj(d)) return ['データがオブジェクトではありません'];
  need(d.v === SCHEMA, `データ版が不正です（${d.v}）`);
  need(isInt(d.coins) && d.coins >= 0 && d.coins <= 1e9, '所持金が不正です');
  need(ISLAND_IDS.includes(d.island), '現在の島が不正です');
  need(strArr(d.unlockedIslands, (x) => ISLAND_IDS.includes(x)) && d.unlockedIslands.includes('komorebi'), '解放済みの島が不正です');
  need(strArr(d.visited, (x) => ISLAND_IDS.includes(x)), '訪問記録が不正です');
  need(strArr(d.routes, (x) => ISLAND_IDS.includes(x)), '航路が不正です');
  need(strArr(d.gens, (x) => CHAIN_IDS.includes(x)) && d.gens.includes('fruit'), '生産元が不正です');
  need(Array.isArray(d.board) && d.board.length === BOARD_SIZE && d.board.every(validCell), `盤面が不正です（${BOARD_SIZE}マス必要）`);
  need(isObj(d.storage) && VALID_CAPS.has(d.storage.cap) && Array.isArray(d.storage.items)
    && d.storage.items.length === d.storage.cap && d.storage.items.every(validCell), '収納が不正です');
  need(isObj(d.quests) && ISLAND_IDS.every((id) => isInt(d.quests[id]) && d.quests[id] >= 0
    && d.quests[id] <= islandById(id).quests.length), '依頼の進行が不正です');
  const o = d.orders;
  need(isObj(o) && typeof o.enabled === 'boolean' && Array.isArray(o.slots) && o.slots.length === 2
    && o.slots.every((x) => x === null || (isObj(x) && validReq(x.req) && isInt(x.coins) && x.coins >= 0))
    && Array.isArray(o.last) && o.last.length === 2 && o.last.every((x) => x === null || typeof x === 'string'),
  '通常注文が不正です');
  need(strArr(d.discovered, (x) => CHAIN_IDS.some((c) => x.startsWith(c + '-')) && /^[a-z]+-[1-6]$/.test(x)), '図鑑が不正です');
  need(strArr(d.flags, (x) => KNOWN_FLAGS.has(x)), '演出フラグが不正です');
  need(strArr(d.dialogues, (x) => x in DIALOGUES), '会話履歴が不正です');
  need(strArr(d.pending, (x) => x in DIALOGUES), '未表示の会話が不正です');
  need(d.lastDeleted === null || (isObj(d.lastDeleted) && validItem(d.lastDeleted.item)
    && (d.lastDeleted.z === 'b' || d.lastDeleted.z === 's') && isInt(d.lastDeleted.i) && d.lastDeleted.i >= 0
    && d.lastDeleted.i < BOARD_SIZE), '取り消し情報が不正です');
  need(typeof d.cleared === 'boolean', 'クリア状態が不正です');
  need(isInt(d.rng) && d.rng >= 0 && d.rng <= 0xffffffff, '乱数状態が不正です');
  need(isObj(d.stats) && ['generated', 'merged', 'questsDone', 'ordersDone', 'coinsEarned', 'playMs']
    .every((k) => isInt(d.stats[k]) && d.stats[k] >= 0), '記録が不正です');
  if (e.length) return e;
  // 整合性
  need(d.unlockedIslands.includes(d.island), '現在の島が未解放です');
  need(d.visited.every((x) => d.unlockedIslands.includes(x)), '訪問記録と解放状態が一致しません');
  need(d.unlockedIslands.every((x) => x === 'komorebi' || d.routes.includes(x)), '航路と解放状態が一致しません');
  return e;
}

// ---- 旧版移行 ----
// schema 0: 開発中の試作形式。品物を "fruit:2" の文字列、収納を可変長配列で保持していた。
const MIGRATIONS = {
  0: (old) => {
    const parse = (x) => {
      if (x == null) return null;
      const m = /^([a-z]+):([1-6])$/.exec(String(x));
      return m ? { c: m[1], l: Number(m[2]) } : x;
    };
    const cap = old.storageCap ?? 0;
    const items = (old.storage || []).map(parse).slice(0, cap);
    while (items.length < cap) items.push(null);
    const quests = { ...(old.quests || {}) };
    const stats = { generated: 0, merged: 0, questsDone: 0, ordersDone: 0, coinsEarned: 0, playMs: 0, ...(old.stats || {}) };
    return {
      v: 1,
      coins: old.coins,
      island: old.island,
      unlockedIslands: old.unlockedIslands,
      visited: old.visited ?? old.unlockedIslands,
      routes: old.routes ?? old.unlockedIslands.filter((x) => x !== 'komorebi'),
      gens: old.gens,
      board: (old.board || []).map(parse),
      storage: { cap, items },
      quests,
      orders: old.orders ?? { enabled: cap > 0, slots: [null, null], last: [null, null] },
      discovered: (old.discovered || []).map((k) => String(k).replace(':', '-')),
      flags: old.flags ?? [],
      dialogues: old.dialogues ?? [],
      pending: [],
      lastDeleted: null,
      cleared: !!old.cleared,
      rng: Number.isInteger(old.rng) ? old.rng >>> 0 : 12345,
      stats,
    };
  },
};

/**
 * 任意の版のデータを現行版へ。検証まで行う。
 * @returns {{ok:true, data}|{ok:false, error:string}}
 */
export function upgrade(data, schema) {
  if (!isInt(schema) || schema < 0) return { ok: false, error: 'データ版が読み取れません。' };
  if (schema > SCHEMA) return { ok: false, error: `このデータは新しい版（${schema}）で作られています。アプリを更新してから復元してください。` };
  let d = data;
  try {
    for (let v = schema; v < SCHEMA; v++) {
      const m = MIGRATIONS[v];
      if (!m) return { ok: false, error: `版${v}からの移行には対応していません。` };
      d = m(structuredClone(d));
    }
  } catch {
    return { ok: false, error: '旧版データの移行に失敗しました。' };
  }
  // 注文が空（旧版移行など）なら補充はゲーム起動時に行う
  const errors = validate(d);
  if (errors.length) return { ok: false, error: 'データの内容に問題があります: ' + errors.slice(0, 3).join('、') };
  return { ok: true, data: d };
}

/** バックアップ・JSONファイルの内容を検証し、復元用データを返す */
export function parseBackup(obj) {
  if (!isObj(obj) || obj.format !== 'imhs-backup') return { ok: false, error: 'IMHSのバックアップファイルではありません。' };
  if (obj.gameId !== GAME_ID) return { ok: false, error: `別のゲームのバックアップです（${obj.gameId}）。` };
  const r = upgrade(obj.data, obj.schema);
  if (!r.ok) return r;
  return { ok: true, data: r.data, info: describe(r.data, obj.savedAt || obj.exportedAt) };
}

/** 上書き確認で表示する概要 */
export function describe(d, when) {
  const isl = islandById(d.island);
  let date = '不明';
  const t = when ? new Date(when) : null;
  if (t && !Number.isNaN(t.getTime())) {
    date = t.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const done = ISLAND_IDS.reduce((a, id) => a + d.quests[id], 0);
  return { island: isl.name, coins: d.coins, date, quests: `${done}/15`, cleared: d.cleared };
}

export { itemKey };

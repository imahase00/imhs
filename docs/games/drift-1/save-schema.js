// 漂流発明記: セーブ形式の検証・バックアップ説明
// ランチャーのバックアップ復元からも動的 import される（games.json の saveModule）。
import {
  GAME_ID, SCHEMA, WORLD, ITEMS, MACHINES, RECIPES, GATES, BROKEN_BOTS, SHIP, QUESTS, DIALOGUES, NODES, HERO, TOOLS, ERAS, BELT,
} from './data.js';

export { GAME_ID, SCHEMA };

const isInt = (n) => Number.isInteger(n);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const strArr = (a, ok) => Array.isArray(a) && a.every((x) => typeof x === 'string' && ok(x)) && new Set(a).size === a.length;
const isCount = (n) => isInt(n) && n >= 0 && n <= 1e7;
const items = (o) => isObj(o) && Object.entries(o).every(([k, v]) => k in ITEMS && isCount(v));
const inWorld = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= WORLD.w && y <= WORLD.h;
const TYPES = new Set([...Object.keys(MACHINES), 'minerbot']);

/** @returns {string[]} エラー一覧（空なら正常） */
export function validate(d) {
  const e = [];
  const need = (c, m) => { if (!c) e.push(m); };
  if (!isObj(d)) return ['データがオブジェクトではありません'];
  need(d.v === SCHEMA, `データ版が不正です（${d.v}）`);
  need(isObj(d.hero) && inWorld(d.hero.x, d.hero.y), '主人公の位置が不正です');
  need(items(d.bag), '袋の中身が不正です');
  need(items(d.pool), '倉庫の中身が不正です');
  need(isInt(d.tool) && d.tool >= 0 && d.tool < TOOLS.length, '道具の段階が不正です');
  need(isInt(d.bagLv) && d.bagLv >= 0 && d.bagLv < HERO.bag.length, '袋の段階が不正です');
  need(isInt(d.boots) && d.boots >= 0 && d.boots < HERO.speedUp.length, '靴の段階が不正です');
  need(isInt(d.era) && d.era >= 1 && d.era < ERAS.length, '時代が不正です');
  need(isInt(d.quest) && d.quest >= 0 && d.quest <= QUESTS.length, '目標の番号が不正です');
  need(isObj(d.gates) && Object.entries(d.gates).every(([k, v]) => GATES.some((g) => g.id === k) && v === true), '関門の状態が不正です');
  need(typeof d.boilerFixed === 'boolean' && typeof d.reactorOn === 'boolean' && typeof d.cleared === 'boolean', '進み具合のしるしが不正です');
  need(isInt(d.nextId) && d.nextId >= 1, '番号の状態が不正です');
  const ids = new Set();
  need(Array.isArray(d.buildings) && d.buildings.length <= 500 && d.buildings.every((b) => {
    if (!isObj(b) || typeof b.id !== 'string' || ids.has(b.id) || !TYPES.has(b.type) || !inWorld(b.x, b.y) || !isInt(b.lv) || b.lv < 1 || b.lv > 3) return false;
    ids.add(b.id);
    if (b.node != null && !NODES.some((n) => n.id === b.node)) return false;
    if (b.recipe != null && !(b.recipe in RECIPES)) return false;
    if (b.inp != null && !items(b.inp)) return false;
    if (b.out != null && !items(b.out)) return false;
    return true;
  }), '建物の情報が不正です');
  need(Array.isArray(d.links) && d.links.length <= 500 && d.links.every((l) => isObj(l) && typeof l.id === 'string' && ids.has(l.from) && ids.has(l.to)
    && isInt(l.lv) && l.lv >= 0 && l.lv < BELT.levels.length), 'ベルトの情報が不正です');
  need(strArr(d.fixed, (x) => BROKEN_BOTS.some((b) => b.id === x)), '直したロボの情報が不正です');
  need(isInt(d.drones) && d.drones >= 0 && d.drones <= 200, 'ドローンの数が不正です');
  need(isObj(d.ship) && Object.keys(SHIP).every((k) => isInt(d.ship[k]) && d.ship[k] >= 0 && d.ship[k] <= SHIP[k]), '飛行船の部品の数が不正です');
  need(Array.isArray(d.drift) && d.drift.length <= 10 && d.drift.every((x) => isObj(x) && inWorld(x.x, x.y) && items(x.loot)), '漂流物の情報が不正です');
  need(Number.isFinite(d.driftT), '漂流物の時計が不正です');
  need(strArr(d.seen, (x) => x in DIALOGUES), '会話履歴が不正です');
  need(strArr(d.pending, (x) => x in DIALOGUES), '未表示の会話が不正です');
  need(isInt(d.rng) && d.rng >= 0 && d.rng <= 0xffffffff, '乱数状態が不正です');
  need(isObj(d.stats) && ['playMs', 'gathered', 'made', 'built'].every((k) => isCount(d.stats[k]) || (k === 'playMs' && isInt(d.stats[k]) && d.stats[k] >= 0)), '記録が不正です');
  return e;
}

const MIGRATIONS = {};

export function upgrade(data, schema) {
  if (!isInt(schema) || schema < 1) return { ok: false, error: 'データ版が読み取れません。' };
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
  const errors = validate(d);
  if (errors.length) return { ok: false, error: 'データの内容に問題があります: ' + errors.slice(0, 3).join('、') };
  return { ok: true, data: d };
}

export function parseBackup(obj) {
  if (!isObj(obj) || obj.format !== 'imhs-backup') return { ok: false, error: 'IMHSのバックアップファイルではありません。' };
  if (obj.gameId !== GAME_ID) return { ok: false, error: `別のゲームのバックアップです（${obj.gameId}）。` };
  const r = upgrade(obj.data, obj.schema);
  if (!r.ok) return r;
  return { ok: true, data: r.data, info: describe(r.data, obj.savedAt || obj.exportedAt) };
}

export function describe(d, when) {
  let date = '不明';
  const t = when ? new Date(when) : null;
  if (t && !Number.isNaN(t.getTime())) {
    date = t.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const parts = Object.values(d.ship).reduce((a, b) => a + b, 0);
  const all = Object.values(SHIP).reduce((a, b) => a + b, 0);
  const q = QUESTS[Math.min(d.quest, QUESTS.length - 1)];
  const label = d.cleared ? '島を出た・工場はつづく' : `${ERAS[d.era]}`;
  return {
    date, cleared: d.cleared,
    rows: [['時代', ERAS[d.era]], ['目標', d.cleared ? 'クリア済み' : q.text], ['建物', `${d.buildings.length}`], ['飛行船の部品', `${parts}/${all}`], ['日時', date]],
    label,
  };
}

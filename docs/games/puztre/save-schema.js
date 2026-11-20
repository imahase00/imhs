// パズトレ: セーブ形式の検証・バックアップ説明
// ランチャーのバックアップ復元からも動的 import される（games.json の saveModule）。
import { GAME_ID, SCHEMA, DUNGEONS, FLOORS, TOOLS, FRAMES, TREASURE_IDS, MAX_TOOLS } from './data.js';

export { GAME_ID, SCHEMA };

const isInt = (n) => Number.isInteger(n);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const uniq = (a) => new Set(a).size === a.length;
const list = (a, ok) => Array.isArray(a) && uniq(a) && a.every(ok);

/** @returns {string[]} エラー一覧（空なら正常） */
export function validate(d) {
  const e = [];
  const need = (c, m) => { if (!c) e.push(m); };
  if (!isObj(d)) return ['データがオブジェクトではありません'];
  need(d.v === SCHEMA, `データ版が不正です（${d.v}）`);
  need(isInt(d.coins) && d.coins >= 0 && d.coins <= 1e9, 'コインが不正です');
  need(list(d.frames, (f) => FRAMES.some((x) => x.id === f)) && d.frames.includes('wood'), '持っている枠が不正です');
  need(typeof d.frame === 'string' && Array.isArray(d.frames) && d.frames.includes(d.frame), '着けている枠が不正です');
  need(list(d.tools, (t) => t in TOOLS), '持っている道具が不正です');
  need(list(d.loadout, (t) => Array.isArray(d.tools) && d.tools.includes(t)) && d.loadout.length >= 1 && d.loadout.length <= MAX_TOOLS, '持ち物が不正です');
  need(list(d.treasures, (t) => TREASURE_IDS.includes(t)), 'お宝の記録が不正です');
  need(list(d.cleared, (c) => DUNGEONS.some((x) => x.id === c)), '突破したダンジョンが不正です');
  need(typeof d.ending === 'boolean' && typeof d.intro === 'boolean', '進行の記録が不正です');
  need(isObj(d.stats) && ['clears', 'retreats', 'turns', 'maxCombo', 'playMs'].every((k) => isInt(d.stats[k]) && d.stats[k] >= 0), '記録が不正です');
  if (d.run !== null) {
    const r = d.run;
    need(isObj(r) && isInt(r.d) && r.d >= 0 && r.d < DUNGEONS.length && isInt(r.floor) && r.floor >= 0 && r.floor <= FLOORS
      && Number.isFinite(r.hp) && r.hp > 0 && isInt(r.coins) && r.coins >= 0 && list(r.tools, (t) => t in TOOLS) && r.tools.length <= MAX_TOOLS
      && isObj(r.cds) && isObj(r.stats) && isInt(r.rng) && FRAMES.some((x) => x.id === r.frame), '冒険の途中の記録が不正です');
  }
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
  const n = d.cleared.length;
  const label = d.ending ? `黄金郷を踏破・お宝 ${d.treasures.length}/48` : n ? `${DUNGEONS[n].name}へ・お宝 ${d.treasures.length}/48` : 'はじめの冒険へ';
  return {
    coins: d.coins, date,
    rows: [['突破したダンジョン', `${n}/${DUNGEONS.length}`], ['お宝', `${d.treasures.length}/${TREASURE_IDS.length}`], ['コイン', `${d.coins}`], ['日時', date]],
    label,
  };
}

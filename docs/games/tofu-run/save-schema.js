// にげろ！とうふ: セーブ形式の検証・バックアップ説明
// ランチャーのバックアップ復元からも動的 import される（games.json の saveModule）。
import { GAME_ID, SCHEMA, OBSTACLES, MISSIONS, SKINS } from './data.js';

export { GAME_ID, SCHEMA };

const isInt = (n) => Number.isInteger(n);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const MAX = 1e9;

/** @returns {string[]} エラー一覧（空なら正常） */
export function validate(d) {
  const e = [];
  const need = (c, m) => { if (!c) e.push(m); };
  if (!isObj(d)) return ['データがオブジェクトではありません'];
  need(d.v === SCHEMA, `データ版が不正です（${d.v}）`);
  need(isInt(d.best) && d.best >= 0 && d.best <= MAX, '自己ベストが不正です');
  need(Array.isArray(d.top) && d.top.length <= 5 && d.top.every((t) => isObj(t) && isInt(t.d) && t.d > 0 && t.d <= MAX
    && isInt(t.negi) && t.negi >= 0 && (t.cause === null || t.cause in OBSTACLES) && typeof t.at === 'string'), '歴代記録が不正です');
  need(isObj(d.stats) && ['runs', 'dist', 'negi', 'jumps', 'slides', 'playMs'].every((k) => isInt(d.stats[k]) && d.stats[k] >= 0 && d.stats[k] <= 1e12), '通算記録が不正です');
  need(isObj(d.deaths) && Object.entries(d.deaths).every(([k, v]) => k in OBSTACLES && isInt(v) && v > 0), 'くずれかた図鑑が不正です');
  need(Array.isArray(d.missions) && d.missions.every((m) => MISSIONS.some((x) => x.id === m)) && new Set(d.missions).size === d.missions.length, 'お題の達成状況が不正です');
  need(SKINS.some((k) => k.id === d.skin), 'とうふの種類が不正です');
  need(typeof d.intro === 'boolean', '導入の表示状態が不正です');
  if (e.length) return e;
  need(d.top.every((t) => t.d <= d.best), '歴代記録が自己ベストを超えています');
  const sk = SKINS.find((k) => k.id === d.skin);
  need(d.missions.length >= sk.need, 'まだ選べないとうふが選ばれています');
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
  const dex = Object.keys(d.deaths).length;
  return {
    coins: d.stats.negi, date,
    rows: [['自己ベスト', `${d.best}m`], ['お題', `${d.missions.length}/${MISSIONS.length}`],
      ['くずれかた図鑑', `${dex}/${Object.keys(OBSTACLES).length}`], ['走った回数', `${d.stats.runs}回`], ['日時', date]],
    label: d.best > 0 ? `自己ベスト ${d.best}m・お題 ${d.missions.length}/${MISSIONS.length}` : 'まだ走っていない',
  };
}

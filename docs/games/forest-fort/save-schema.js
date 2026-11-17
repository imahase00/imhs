// 森のとりで: セーブ形式の検証・バックアップ説明
// ランチャーのバックアップ復元からも動的 import される（games.json の saveModule）。
import { GAME_ID, SCHEMA, PADS, WAVES, DIALOGUES, BOUNDS } from './data.js';

export { GAME_ID, SCHEMA };

const isInt = (n) => Number.isInteger(n);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const strArr = (a, ok) => Array.isArray(a) && a.every((x) => typeof x === 'string' && ok(x)) && new Set(a).size === a.length;

/** @returns {string[]} エラー一覧（空なら正常） */
export function validate(d) {
  const e = [];
  const need = (c, m) => { if (!c) e.push(m); };
  if (!isObj(d)) return ['データがオブジェクトではありません'];
  need(d.v === SCHEMA, `データ版が不正です（${d.v}）`);
  need(isInt(d.wave) && d.wave >= 1 && d.wave <= 9999, 'ウェーブ番号が不正です');
  need(typeof d.cleared === 'boolean', 'クリア状態が不正です');
  need(isInt(d.coins) && d.coins >= 0 && d.coins <= 1e9, '所持コインが不正です');
  need(isObj(d.levels) && PADS.every((p) => isInt(d.levels[p.id]) && d.levels[p.id] >= p.start && d.levels[p.id] <= p.cost.length)
    && Object.keys(d.levels).every((k) => PADS.some((p) => p.id === k)), '強化の段階が不正です');
  need(isObj(d.paid) && Object.entries(d.paid).every(([k, v]) => {
    const p = PADS.find((x) => x.id === k);
    return p && isInt(v) && v >= 0 && isObj(d.levels) && d.levels[k] < p.cost.length && v < p.cost[d.levels[k]];
  }), '支払い途中の額が不正です');
  need(isObj(d.hero) && Number.isFinite(d.hero.x) && Number.isFinite(d.hero.y)
    && d.hero.x >= BOUNDS.x1 && d.hero.x <= BOUNDS.x2 && d.hero.y >= BOUNDS.y1 && d.hero.y <= BOUNDS.y2, '主人公の位置が不正です');
  need(strArr(d.seen, (x) => x in DIALOGUES), '会話履歴が不正です');
  need(strArr(d.pending, (x) => x in DIALOGUES), '未表示の会話が不正です');
  need(isInt(d.rng) && d.rng >= 0 && d.rng <= 0xffffffff, '乱数状態が不正です');
  need(isObj(d.stats) && ['kills', 'coinsEarned', 'wavesWon', 'losses', 'downs', 'playMs'].every((k) => isInt(d.stats[k]) && d.stats[k] >= 0), '記録が不正です');
  if (e.length) return e;
  need(!d.cleared || d.wave > WAVES.length, 'クリア状態とウェーブ番号が一致しません');
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
  const waveText = d.cleared ? `${WAVES.length}/${WAVES.length}（夜明け済み・次はウェーブ${d.wave}）` : `${d.wave - 1}/${WAVES.length}`;
  return {
    coins: d.coins, date, cleared: d.cleared,
    rows: [['越えたウェーブ', waveText], ['所持コイン', `${d.coins}コイン`], ['砦の中心', `段階${d.levels.core}`], ['日時', date]],
    label: d.cleared ? `夜明けを迎えた・ウェーブ${d.wave}へ` : `ウェーブ${d.wave}/${WAVES.length}の前`,
  };
}

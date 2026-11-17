// ひだまり菜園: セーブ形式の検証・バックアップ説明
// ランチャーのバックアップ復元からも動的 import される（games.json の saveModule）。

import {
  GAME_ID, SCHEMA, CROPS, CROP_IDS, GOODS, GOOD_IDS, ITEM_IDS, DECOR_IDS, PEOPLE_IDS, QUESTS,
  START_PLOTS, MAX_PLOTS, PLOT_STEPS, DIALOGUES, FESTIVAL_FLAGS, QUEST_TOTAL,
} from './data.js';
import { dateLabel } from './rules.js';

export { GAME_ID, SCHEMA };

const isInt = (n) => Number.isInteger(n);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const strArr = (a, allowed) => Array.isArray(a) && a.every((x) => typeof x === 'string' && allowed(x))
  && new Set(a).size === a.length;
const VALID_PLOTS = new Set([START_PLOTS, ...PLOT_STEPS.map((p) => p.to)]);

function validPlot(p) {
  if (!isObj(p) || Object.keys(p).some((k) => !['c', 'g', 'w'].includes(k))) return false;
  if (typeof p.w !== 'boolean' || !isInt(p.g) || p.g < 0) return false;
  if (p.c === null) return p.g === 0 && p.w === false;
  return CROP_IDS.includes(p.c) && p.g <= CROPS[p.c].days * 2;
}
function validReq(req) {
  const e = isObj(req) ? Object.entries(req) : [];
  return e.length >= 1 && e.length <= 3 && e.every(([id, n]) => ITEM_IDS.includes(id) && isInt(n) && n >= 1 && n <= 20);
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
  need(isInt(d.day) && d.day >= 1 && d.day <= 1e6, '日付が不正です');
  need(isInt(d.coins) && d.coins >= 0 && d.coins <= 1e9, '所持金が不正です');
  need(Array.isArray(d.plots) && VALID_PLOTS.has(d.plots.length) && d.plots.length <= MAX_PLOTS
    && d.plots.every(validPlot), '畑が不正です');
  need(strArr(d.seeds, (x) => CROP_IDS.includes(x)) && d.seeds.includes('carrot'), '種が不正です');
  need(typeof d.seed === 'string' && Array.isArray(d.seeds) && d.seeds.includes(d.seed), '選んでいる種が不正です');
  need(strArr(d.recipes, (x) => GOOD_IDS.includes(x)), '作り方が不正です');
  need(isObj(d.inv) && Object.entries(d.inv).every(([id, n]) => ITEM_IDS.includes(id) && isInt(n) && n >= 1 && n <= 1e6), 'かごの中身が不正です');
  need(Array.isArray(d.bench) && d.bench.length <= 3 && d.bench.every((b) => isObj(b)
    && ((b.r === null && b.left === 0) || (GOOD_IDS.includes(b.r) && isInt(b.left) && b.left >= 1 && b.left <= GOODS[b.r].days))),
  '作業台が不正です');
  need(typeof d.bigCan === 'boolean' && typeof d.sprinkler === 'boolean', '道具が不正です');
  need(strArr(d.decor, (x) => DECOR_IDS.includes(x)), '飾りが不正です');
  need(isObj(d.quests) && PEOPLE_IDS.every((p) => isInt(d.quests[p]) && d.quests[p] >= 0 && d.quests[p] <= QUESTS[p].length), '依頼の進行が不正です');
  need(isObj(d.orders) && typeof d.orders.enabled === 'boolean' && Array.isArray(d.orders.slots) && d.orders.slots.length === 2
    && d.orders.slots.every((o) => o === null || (isObj(o) && validReq(o.req) && isInt(o.coins) && o.coins >= 0)), '注文が不正です');
  need(d.featured === null || ITEM_IDS.includes(d.featured), 'おすすめが不正です');
  need(strArr(d.flags, (x) => FESTIVAL_FLAGS.includes(x)), '進行フラグが不正です');
  need(strArr(d.dialogues, (x) => x in DIALOGUES), '会話履歴が不正です');
  need(strArr(d.pending, (x) => x in DIALOGUES), '未表示の会話が不正です');
  need(typeof d.cleared === 'boolean', 'クリア状態が不正です');
  need(isInt(d.rng) && d.rng >= 0 && d.rng <= 0xffffffff, '乱数状態が不正です');
  need(isObj(d.stats) && ['harvested', 'crafted', 'sold', 'questsDone', 'ordersDone', 'coinsEarned', 'days', 'playMs']
    .every((k) => isInt(d.stats[k]) && d.stats[k] >= 0), '記録が不正です');
  if (e.length) return e;
  // 整合性: 依頼の報酬で得たはずの作業台の数
  const benches = PEOPLE_IDS.reduce((a, p) => a + QUESTS[p].slice(0, d.quests[p]).reduce((b, q) => b + (q.effects?.bench || 0), 0), 0);
  need(d.bench.length === benches, '作業台の数と依頼の進行が一致しません');
  return e;
}

// 旧版移行（現在は schema 1 のみ。将来の版はここに追加する）
const MIGRATIONS = {};

/**
 * 任意の版のデータを現行版へ。検証まで行う。
 * @returns {{ok:true, data}|{ok:false, error:string}}
 */
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
  let date = '不明';
  const t = when ? new Date(when) : null;
  if (t && !Number.isNaN(t.getTime())) {
    date = t.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const done = PEOPLE_IDS.reduce((a, p) => a + d.quests[p], 0);
  return {
    coins: d.coins, date, quests: `${done}/${QUEST_TOTAL}`, cleared: d.cleared,
    rows: [['日付', dateLabel(d.day)], ['所持金', `${d.coins}コイン`], ['依頼', `${done}/${QUEST_TOTAL}${d.cleared ? '（収穫祭を開催済み）' : ''}`], ['日時', date]],
    label: d.cleared ? `${dateLabel(d.day)}・収穫祭を終えて` : dateLabel(d.day),
  };
}

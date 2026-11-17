// ひだまり菜園: 自動プレイで「収穫祭までの日数・操作回数」を試算する（バランス調整用）
// 使い方: node tools/sim-hidamari.mjs [回数]
// 人の遊び方を近似した単純な方針で遊ぶ。操作回数 × 1回あたりの秒数 で時間を「推定」する（実測ではない）。
import * as R from '../docs/games/hidamari-garden/rules.js';
import {
  CROPS, GOODS, DECOR, DECOR_IDS, PEOPLE_IDS, SPRINKLER_PRICE, itemPrice,
} from '../docs/games/hidamari-garden/data.js';

function play(seed) {
  let s = R.newGame(seed);
  const log = [];
  let ops = 0;     // タップ・ボタン操作の回数
  let reads = 0;   // 会話の行数（読む時間）
  const act = (r) => { if (r.ok) { s = r.state; ops++; } return r.ok; };
  const flushTalk = () => {
    for (const id of [...s.pending]) { reads += 1; s = R.ackDialogue(s, id).state; }
  };
  const needs = () => {
    // 依頼・注文で今必要な品物（不足分）
    const want = {};
    const add = (req) => { for (const [id, n] of Object.entries(req)) want[id] = (want[id] || 0) + n; };
    for (const p of PEOPLE_IDS) { const q = R.activeQuest(s, p); if (q) add(q.req); }
    for (const o of s.orders.slots) if (o) add(o.req);
    return want;
  };
  const inputsOf = (want) => {
    const raw = { ...want };
    for (const [id, n] of Object.entries(want)) {
      if (GOODS[id]) for (const [c, m] of Object.entries(GOODS[id].in)) raw[c] = (raw[c] || 0) + m * n;
    }
    return raw;
  };
  while (s.day < 400 && !s.cleared) {
    flushTalk();
    // 収穫
    for (let i = 0; i < s.plots.length; i++) if (R.plotStage(s.plots[i]) === 'ripe') act(R.harvest(s, i));
    // 依頼・注文
    for (const p of PEOPLE_IDS) { const q = R.activeQuest(s, p); if (act(R.deliverQuest(s, p))) log.push(`${q.id}@${s.day}`); }
    for (let k = 0; k < 2; k++) act(R.deliverOrder(s, k));
    // 加工（必要な加工品を優先、なければ利益の出るもの）
    const want = needs();
    s.bench.forEach((b, k) => {
      if (b.r) return;
      const order = [...s.recipes].sort((a, b2) => (want[b2] ? 1 : 0) - (want[a] ? 1 : 0) || GOODS[b2].price - GOODS[a].price);
      for (const r of order) {
        // 依頼に必要な素材を食いつぶさない
        const raw = inputsOf(want);
        const safe = Object.entries(GOODS[r].in).every(([c, n]) => R.count(s, c) - n >= (want[r] ? 0 : (raw[c] || 0)));
        if (safe && act(R.craft(s, k, r))) break;
      }
    });
    // 買い物（畑 > スプリンクラー > 飾り）。種代は残す
    const reserve = 60;
    const st = R.nextPlotStep(s);
    if (st && s.coins - reserve >= st.price) act(R.buyPlots(s));
    if (s.bigCan && !s.sprinkler && s.coins - reserve >= SPRINKLER_PRICE && !R.nextPlotStep(s)) act(R.buySprinkler(s));
    for (const d of DECOR_IDS) if (!s.decor.includes(d) && s.coins - reserve >= DECOR[d].price && (s.plots.length >= 12)) act(R.buyDecor(s, d));
    if (s.decor.length < 3) for (const d of DECOR_IDS) if (!s.decor.includes(d) && s.coins - reserve >= DECOR[d].price && s.quests.yuzu >= 4) act(R.buyDecor(s, d));
    // 余りを売る（依頼・注文で要るぶんは残す）
    const raw = inputsOf(needs());
    for (const [id, n] of Object.entries(s.inv)) {
      const keep = (raw[id] || 0) + (CROPS[id] ? 3 : 0);
      if (n > keep) act(R.sell(s, id, n - keep));
    }
    // 種まき: 依頼・注文に要る作物を優先、なければ1晩あたりの利益が高いもの（季節外れは育ちが半分）
    const rawNeed = inputsOf(needs());
    const speed = (c) => (R.inSeason(c, s.day) ? 1 : 0.5);
    const score = (c) => (rawNeed[c] > R.count(s, c) ? 1000 : 0) + speed(c) * (itemPrice(c) - CROPS[c].seed) / CROPS[c].days;
    // 要る作物の植える場所がなければ、要らない株を抜いて植え替える（人もこうする）
    for (const c of s.seeds) {
      const planted = s.plots.filter((p) => p.c === c).length;
      let deficit = (rawNeed[c] || 0) - R.count(s, c) - planted;
      for (let i = 0; i < s.plots.length && deficit > 0; i++) {
        const p = s.plots[i];
        if (p.c && p.c !== c && !rawNeed[p.c] && R.plotStage(p) !== 'ripe') { act(R.clearPlot(s, i)); deficit--; }
      }
    }
    for (let i = 0; i < s.plots.length; i++) {
      if (s.plots[i].c) continue;
      const cands = [...s.seeds].sort((a, b) => score(b) - score(a));
      for (const c of cands) {
        if (s.seed !== c) act(R.selectSeed(s, c));
        if (act(R.plant(s, i, c))) break;
      }
    }
    // 水やり
    if (s.bigCan) act(R.waterAll(s));
    else for (let i = 0; i < s.plots.length; i++) if (R.needsWater(s.plots[i])) act(R.water(s, i));
    if (R.canFestival(s)) { act(R.holdFestival(s)); flushTalk(); break; }
    if (process.env.TRACE) console.log(s.day, s.coins, s.plots.map((p) => (p.c ? p.c.slice(0, 3) + p.g + (p.w ? 'w' : '') : '-')).join(' '), JSON.stringify(s.inv), JSON.stringify(s.orders.slots.map((o) => o && o.req)));
    act(R.sleep(s));
  }
  if (process.env.DEBUG) console.log(log.join(' '), '| decor', s.decor.length, 'plots', s.plots.length, 'end', s.day);
  return { days: s.day, cleared: s.cleared, ops, reads, quests: R.questsDoneCount(s), coins: s.coins, stats: s.stats, plots: s.plots.length, decor: s.decor.length };
}

const N = Number(process.argv[2] || 20);
const res = Array.from({ length: N }, (_, k) => play(1000 + k));
const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
console.log(`試行 ${N} 回 / 収穫祭まで到達: ${res.filter((r) => r.cleared).length}`);
console.log(`日数 平均 ${avg((r) => r.days).toFixed(0)}（最小 ${Math.min(...res.map((r) => r.days))}・最大 ${Math.max(...res.map((r) => r.days))}）`);
console.log(`操作 平均 ${avg((r) => r.ops).toFixed(0)} 回 / 会話 ${avg((r) => r.reads).toFixed(0)} 場面`);
console.log(`依頼 ${avg((r) => r.quests).toFixed(1)} / 注文 ${avg((r) => r.stats.ordersDone).toFixed(0)} / 収穫 ${avg((r) => r.stats.harvested).toFixed(0)} / 加工 ${avg((r) => r.stats.crafted).toFixed(0)} / 畑 ${avg((r) => r.plots).toFixed(0)} / 飾り ${avg((r) => r.decor).toFixed(1)}`);
const ops = avg((r) => r.ops);
const days = avg((r) => r.days);
// 推定: 1操作 2〜3秒（判断・移動含む）、1日の確認 5〜8秒、会話 1場面 10〜15秒
const lo = (ops * 2 + days * 5 + avg((r) => r.reads) * 10) / 60;
const hi = (ops * 3 + days * 8 + avg((r) => r.reads) * 15) / 60;
console.log(`推定プレイ時間（収穫祭まで）: 約 ${Math.round(lo)}〜${Math.round(hi)} 分（ボットの最短に近い遊び方。人はこれより遠回りしやすい）`);

// ひだまり菜園: ルール・セーブ形式のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../docs/games/hidamari-garden/rules.js';
import * as D from '../docs/games/hidamari-garden/data.js';
import { validate, upgrade, parseBackup } from '../docs/games/hidamari-garden/save-schema.js';

const must = (r) => { assert.ok(r.ok, r.msg); return r.state; };
const withInv = (s, inv) => ({ ...structuredClone(s), inv: { ...s.inv, ...inv } });

test('新規ゲーム: 春1日目・30コイン・6マス・にんじんといちご・正しい形式', () => {
  const s = R.newGame(1);
  assert.equal(s.day, 1);
  assert.equal(s.coins, D.START_COINS);
  assert.equal(s.plots.length, 6);
  assert.deepEqual(s.seeds, ['carrot', 'strawberry']);
  assert.deepEqual(validate(s), []);
  assert.deepEqual(s.pending, ['opening', 't1-intro', 's1-intro']);
  assert.equal(R.activeQuest(s, 'yuzu'), null, 'ゆずははソラの最初の依頼のあとに現れる');
});

test('種まき→水やり→おやすみ: 旬のにんじんは3晩で実り、収穫でかごへ', () => {
  let s = R.newGame(1);
  s = must(R.tapPlot(s, 0));
  assert.equal(s.coins, D.START_COINS - D.CROPS.carrot.seed);
  assert.equal(R.plotStage(s.plots[0]), 'seed');
  for (let n = 0; n < 3; n++) {
    s = must(R.tapPlot(s, 0));            // 水やり
    assert.equal(R.tapPlot(s, 0).ok, false, '同じ日に2回は水やりできない');
    s = must(R.sleep(s));
  }
  assert.equal(R.plotStage(s.plots[0]), 'ripe');
  s = must(R.tapPlot(s, 0));
  assert.equal(R.count(s, 'carrot'), 1);
  assert.equal(s.plots[0].c, null);
  assert.deepEqual(validate(s), []);
});

test('水をやらなかった晩は育たない（枯れない）', () => {
  let s = must(R.plant(R.newGame(1), 0, 'carrot'));
  s = must(R.sleep(s));
  s = must(R.sleep(s));
  assert.equal(s.plots[0].g, 0);
  assert.equal(s.plots[0].c, 'carrot');
});

test('季節外れは育ちが半分: 夏のにんじんは6晩かかる', () => {
  let s = R.newGame(1);
  s.day = 11; // 夏
  assert.equal(R.seasonIndex(s.day), 1);
  s = must(R.plant(s, 0, 'carrot'));
  let nights = 0;
  while (R.plotStage(s.plots[0]) !== 'ripe') {
    s = must(R.water(s, 0));
    s = must(R.sleep(s));
    nights++;
  }
  assert.equal(nights, 6);
});

test('何度も実る作物: いちごは収穫後に若葉へ戻り、2晩でまた実る', () => {
  let s = must(R.plant(R.newGame(1), 0, 'strawberry'));
  for (let n = 0; n < 4; n++) { s = must(R.water(s, 0)); s = must(R.sleep(s)); }
  s = must(R.harvest(s, 0));
  assert.equal(s.plots[0].c, 'strawberry');
  assert.equal(R.plotStage(s.plots[0]), 'young');
  for (let n = 0; n < 2; n++) { s = must(R.water(s, 0)); s = must(R.sleep(s)); }
  assert.equal(R.plotStage(s.plots[0]), 'ripe');
});

test('コインが足りないと種をまけない・状態は変わらない', () => {
  const s = R.newGame(1);
  s.coins = 3;
  const r = R.plant(s, 0, 'carrot');
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
});

test('依頼: とよさん1件目でにんじんケーキの作り方と作業台、作業台で一晩→完成', () => {
  let s = withInv(R.newGame(1), { carrot: 6 });
  s = must(R.deliverQuest(s, 'toyo'));
  assert.equal(s.coins, D.START_COINS + 20);
  assert.ok(s.recipes.includes('carrotcake'));
  assert.equal(s.bench.length, 1);
  assert.ok(s.pending.includes('t1-thanks') && s.pending.includes('t2-intro'));
  s = must(R.craft(s, 0, 'carrotcake'));
  assert.equal(R.count(s, 'carrot'), 0);
  assert.equal(R.craft(s, 0, 'carrotcake').ok, false, '使用中');
  s = must(R.sleep(s));
  assert.equal(R.count(s, 'carrotcake'), 1);
  assert.equal(s.bench[0].r, null);
  assert.deepEqual(validate(s), []);
});

test('ソラ1件目で掲示板の注文が始まり、届けると翌朝に補充される', () => {
  let s = withInv(R.newGame(7), { strawberry: 3 });
  s = must(R.deliverQuest(s, 'sora'));
  assert.ok(s.orders.enabled);
  assert.ok(s.orders.slots.every(Boolean));
  assert.ok(R.activeQuest(s, 'yuzu'), 'ゆずはが現れる');
  const o = s.orders.slots[0];
  s = withInv(s, Object.fromEntries(Object.entries(o.req).map(([id, n]) => [id, n])));
  const coins = s.coins;
  s = must(R.deliverOrder(s, 0));
  assert.equal(s.coins, coins + o.coins);
  assert.equal(s.orders.slots[0], null);
  s = must(R.sleep(s));
  assert.ok(s.orders.slots[0]);
  assert.deepEqual(validate(s), []);
});

test('売る: 飾り1つで+5%、今日のおすすめは+50%', () => {
  let s = withInv(R.newGame(1), { carrot: 4 });
  s.featured = null;
  assert.equal(R.sellPrice(s, 'carrot'), D.CROPS.carrot.price);
  s.decor = ['flowerpot'];
  assert.equal(R.sellPrice(s, 'carrot'), Math.round(D.CROPS.carrot.price * 1.05));
  s.featured = 'carrot';
  assert.equal(R.sellPrice(s, 'carrot'), Math.round(D.CROPS.carrot.price * 1.55));
  const r = must(R.sell(s, 'carrot', 4));
  assert.equal(R.count(r, 'carrot'), 0);
  assert.equal(r.coins, s.coins + R.sellPrice(s, 'carrot') * 4);
  assert.equal(R.sell(r, 'carrot', 1).ok, false);
});

test('お店: 畑の拡張・飾り・スプリンクラー（大きなじょうろの後）', () => {
  let s = R.newGame(1);
  s.coins = 5000;
  s = must(R.buyPlots(s));
  assert.equal(s.plots.length, 9);
  s = must(R.buyDecor(s, 'bench'));
  assert.equal(R.buyDecor(s, 'bench').ok, false);
  assert.equal(R.buySprinkler(s).ok, false, '大きなじょうろがまだ');
  s.bigCan = true;
  s = must(R.plant(s, 0, 'carrot'));
  s = must(R.buySprinkler(s));
  assert.ok(s.plots[0].w, '設置した日から水がまかれる');
  s = must(R.sleep(s));
  assert.ok(s.plots[0].w, '毎朝自動で水やり');
});

test('全18件の依頼は、作れる品物・まける種だけを求める（行き止まりがない）', () => {
  // 依頼を順にこなしたときに解放される種・作り方で、次の依頼の品物がそろえられるか
  let s = R.newGame(3);
  s.coins = 1e6;
  const all = D.QUEST_LIST.length;
  for (let guard = 0; guard < 100 && R.questsDoneCount(s) < all; guard++) {
    let progressed = false;
    for (const who of D.PEOPLE_IDS) {
      const q = R.activeQuest(s, who);
      if (!q) continue;
      for (const id of Object.keys(q.req)) {
        assert.ok(D.isCrop(id) ? s.seeds.includes(id) : s.recipes.includes(id), `${q.id}: ${id} がまだ手に入らない`);
      }
      s = withInv(s, q.req);
      if (q.needDecor) for (const d of D.DECOR_IDS.slice(0, q.needDecor)) if (!s.decor.includes(d)) s = must(R.buyDecor(s, d));
      s = must(R.deliverQuest(s, who));
      progressed = true;
    }
    assert.ok(progressed, '依頼が進まない');
  }
  assert.equal(R.questsDoneCount(s), all);
  assert.equal(s.bench.length, 3);
  assert.ok(s.bigCan);
  assert.deepEqual([...s.seeds].sort(), [...D.CROP_IDS].sort());
  assert.deepEqual([...s.recipes].sort(), [...D.GOOD_IDS].sort());
  assert.deepEqual(validate(s), []);
});

test('収穫祭: 3つの準備と飾り3つでひらける', () => {
  let s = R.newGame(1);
  s.flags = [...D.FESTIVAL_FLAGS];
  s.decor = ['flowerpot', 'fence'];
  assert.equal(R.holdFestival(s).ok, false);
  s.decor.push('bench');
  s = must(R.holdFestival(s));
  assert.ok(s.cleared);
  assert.ok(s.pending.includes('festival'));
  assert.equal(R.holdFestival(s).ok, false, '2回はひらけない');
});

test('自動プレイ（乱数3通り）で収穫祭まで到達できる', async () => {
  // tools/sim-hidamari.mjs と同じ方針を簡略化せずに使う
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, ['tools/sim-hidamari.mjs', '3'], { encoding: 'utf8' });
  assert.match(out, /収穫祭まで到達: 3/);
});

test('セーブ形式: 不正なデータを拒否し、バックアップを検証する', () => {
  const s = R.newGame(1);
  assert.ok(validate({ ...s, coins: -1 }).length);
  assert.ok(validate({ ...s, plots: s.plots.slice(0, 5) }).length);
  assert.ok(validate({ ...s, inv: { stone: 1 } }).length);
  assert.ok(validate({ ...s, bench: [{ r: null, left: 0 }] }).length, '依頼を進めずに作業台は増えない');
  assert.equal(upgrade(s, 2).ok, false);
  const b = parseBackup({ format: 'imhs-backup', gameId: 'hidamari-garden', schema: 1, data: s, savedAt: '2026-11-17T00:00:00Z' });
  assert.ok(b.ok);
  assert.equal(b.info.rows[0][1], '1年目 春 1日目');
  assert.equal(parseBackup({ format: 'imhs-backup', gameId: 'merge-journey', schema: 1, data: s }).ok, false);
});

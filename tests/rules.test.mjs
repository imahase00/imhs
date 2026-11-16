// ルール・セーブ形式の自動テスト（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../docs/games/merge-journey/rules.js';
import * as D from '../docs/games/merge-journey/data.js';
import * as S from '../docs/games/merge-journey/save-schema.js';

const put = (s, i, c, l) => { s.board[i] = { c, l }; return s; };
const fill = (s, item = { c: 'fruit', l: 1 }) => { s.board = s.board.map((_, i) => ({ c: i % 2 ? 'fruit' : 'sweet', l: 1 + (i % 3) })); if (item) s.board[0] = item; return s; };

/** 指定品を盤面へ直接置く（テスト用ヘルパー。製品コードには含まない） */
function give(s, req) {
  for (const r of req) for (let k = 0; k < r.n; k++) {
    const i = s.board.findIndex((x) => !x);
    s.board[i] = { c: r.c, l: r.l };
  }
  return s;
}

test('盤面は7×8=56マス、固定依頼のLv.1換算は220', () => {
  assert.equal(D.BOARD_SIZE, 56);
  const per = D.ISLANDS.map((i) => i.quests.reduce((a, q) => a + q.req.reduce((b, r) => b + r.n * D.lv1Value(r.l), 0), 0));
  assert.deepEqual(per, [48, 68, 104]);
  assert.equal(per.reduce((a, b) => a + b), 220);
  assert.equal(D.ALL_QUESTS.length, 15);
});

test('初期状態: 0コイン・果樹のみ・会話待ち', () => {
  const s = R.newGame(1);
  assert.equal(s.coins, 0);
  assert.deepEqual(s.gens, ['fruit']);
  assert.deepEqual(S.validate(s), []);
});

test('生成: 未解放の生産元は使えない／Lv.1を空きへ1個', () => {
  const s = R.newGame(1);
  assert.equal(R.generate(s, 'sweet').ok, false);
  const r = R.generate(s, 'fruit');
  assert.ok(r.ok);
  assert.equal(r.state.board.filter(Boolean).length, 1);
  assert.equal(s.board.filter(Boolean).length, 0, '元の state は不変');
  assert.ok(r.state.discovered.includes('fruit-1'));
});

test('合成条件: 同系統・同段階のみ、Lv.6上限、異種は不成立で両方保持', () => {
  let s = R.newGame(1);
  put(s, 0, 'fruit', 1); put(s, 1, 'fruit', 1); put(s, 2, 'sweet', 1); put(s, 3, 'fruit', 2);
  put(s, 4, 'fruit', 6); put(s, 5, 'fruit', 6);
  let r = R.move(s, { z: 'b', i: 0 }, { z: 'b', i: 1 });
  assert.ok(r.ok);
  assert.deepEqual(r.state.board[1], { c: 'fruit', l: 2 });
  assert.equal(r.state.board[0], null);
  r = R.move(s, { z: 'b', i: 0 }, { z: 'b', i: 2 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.state.board[0], { c: 'fruit', l: 1 });
  assert.deepEqual(r.state.board[2], { c: 'sweet', l: 1 });
  r = R.move(s, { z: 'b', i: 0 }, { z: 'b', i: 3 });
  assert.equal(r.ok, false, '段階違いは不成立');
  r = R.move(s, { z: 'b', i: 4 }, { z: 'b', i: 5 });
  assert.equal(r.ok, false, 'Lv.6は合成不可');
  r = R.move(s, { z: 'b', i: 0 }, { z: 'b', i: 0 });
  assert.equal(r.ok, false, '同じマス');
  r = R.move(s, { z: 'b', i: 0 }, { z: 'b', i: 99 });
  assert.equal(r.ok, false, '盤面外');
  r = R.move(s, { z: 'b', i: 0 }, { z: 'b', i: 20 });
  assert.ok(r.ok, '空きへ移動');
});

test('満杯時: 生成せず案内し、合成で空けば再び生成できる', () => {
  let s = R.newGame(1);
  s.board = s.board.map(() => ({ c: 'sweet', l: 2 }));
  s.board[0] = { c: 'fruit', l: 1 }; s.board[1] = { c: 'fruit', l: 1 };
  let r = R.generate(s, 'fruit');
  assert.equal(r.ok, false);
  assert.equal(r.msg, R.FULL_MSG);
  r = R.move(s, { z: 'b', i: 0 }, { z: 'b', i: 1 });
  assert.ok(r.ok);
  r = R.generate(r.state, 'fruit');
  assert.ok(r.ok);
  assert.deepEqual(r.state.board[0], { c: 'fruit', l: 1 });
});

test('削除の取り消し: 1回のみ・元の場所／空き・上書きしない', () => {
  let s = put(R.newGame(1), 10, 'fruit', 3);
  let r = R.removeItem(s, { z: 'b', i: 10 });
  assert.ok(r.ok);
  assert.equal(r.state.board[10], null);
  let u = R.undoRemove(r.state);
  assert.ok(u.ok);
  assert.deepEqual(u.state.board[10], { c: 'fruit', l: 3 });
  assert.equal(R.undoRemove(u.state).ok, false, '2回目は不可');
  // 元の場所が埋まっていたら別の空きへ
  const t = put(structuredClone(r.state), 10, 'sweet', 1);
  u = R.undoRemove(t);
  assert.ok(u.ok);
  assert.deepEqual(u.state.board[10], { c: 'sweet', l: 1 }, '既存品を上書きしない');
  assert.equal(R.countItem(u.state, 'fruit', 3), 1);
  // 空きが無ければ失敗し、何も変えない
  const full = structuredClone(r.state);
  full.board = full.board.map(() => ({ c: 'sweet', l: 1 }));
  u = R.undoRemove(full);
  assert.equal(u.ok, false);
  assert.ok(u.state.lastDeleted, '取り消し情報は保持');
});

test('序盤の流れ: 生成2回→合成→納品で10コイン、二重納品不可', () => {
  let s = R.newGame(7);
  s = R.generate(s, 'fruit').state;
  s = R.generate(s, 'fruit').state;
  const idx = s.board.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  assert.equal(R.tutorialHint(s).step, 2);
  s = R.move(s, { z: 'b', i: idx[0] }, { z: 'b', i: idx[1] }).state;
  assert.equal(R.tutorialHint(s).step, 3);
  const r = R.deliverQuest(s, 'k1');
  assert.ok(r.ok);
  assert.equal(r.state.coins, 10);
  assert.equal(R.countItem(r.state, 'fruit', 2), 0);
  const again = R.deliverQuest(r.state, 'k1');
  assert.equal(again.ok, false, '同じ依頼を二重に納品できない');
  assert.equal(again.state.coins, 10);
});

test('依頼2: 売り台・通常注文2枠・収納6枠を解放', () => {
  let s = R.newGame(3);
  s.quests.komorebi = 1;
  give(s, [{ c: 'fruit', l: 3, n: 1 }]);
  const r = R.deliverQuest(s, 'k2');
  assert.ok(r.ok);
  assert.equal(r.state.storage.cap, 6);
  assert.ok(r.state.orders.enabled);
  assert.ok(r.state.orders.slots.every(Boolean));
  assert.ok(r.state.flags.includes('stall'));
});

test('納品は盤面と収納を合算し、成立時だけ消費', () => {
  let s = R.newGame(3);
  s.quests.komorebi = 3; // 広場のお茶会 sweet/3×2, fruit/2×1
  s.gens.push('sweet');
  s.storage = { cap: 6, items: [{ c: 'sweet', l: 3 }, null, null, null, null, null] };
  put(s, 5, 'sweet', 3);
  let r = R.deliverQuest(s, 'k4');
  assert.equal(r.ok, false, 'りんごのペア不足');
  assert.equal(R.countItem(r.state, 'sweet', 3), 2, '不成立時は消費しない');
  put(s, 6, 'fruit', 2);
  r = R.deliverQuest(s, 'k4');
  assert.ok(r.ok);
  assert.equal(R.countItem(r.state, 'sweet', 3), 0);
  assert.equal(r.state.coins, 45);
});

test('通常注文: 報酬式・2枠重複なし・直前の再提示なし・序盤でも停止しない', () => {
  assert.equal(R.orderReward([{ c: 'fruit', l: 3, n: 2 }]), 24);
  let s = R.newGame(11);
  s.quests.komorebi = 1;
  give(s, [{ c: 'fruit', l: 3, n: 1 }]);
  s = R.deliverQuest(s, 'k2').state; // 果樹のみの序盤
  for (let k = 0; k < 300; k++) {
    const slot = k % 2;
    const before = JSON.stringify(s.orders.slots[slot].req);
    const r = R.replaceOrder(s, slot);
    assert.ok(r.ok);
    s = r.state;
    const [a, b] = s.orders.slots;
    assert.notEqual(JSON.stringify(a.req), JSON.stringify(b.req), '2枠に同じ内容');
    assert.notEqual(JSON.stringify(s.orders.slots[slot].req), before, '直前の再提示');
    for (const o of s.orders.slots) {
      for (const r2 of o.req) assert.ok(s.gens.includes(r2.c), '入手可能な系統のみ');
      assert.equal(o.coins, R.orderReward(o.req));
    }
    assert.ok(s.orders.slots[0].req[0].l <= 3 && s.orders.slots[0].req[0].l >= 2, '短い注文はLv.2〜3');
    assert.ok(s.orders.slots[1].req[0].l >= 3, 'もう一枠はLv.3以上');
  }
});

test('収納: 6→9が60、9→12が120、資金不足は拒否', () => {
  let s = R.newGame(1);
  s.storage = { cap: 6, items: Array(6).fill(null) };
  s.coins = 59;
  assert.equal(R.buyStorage(s).ok, false);
  s.coins = 200;
  let r = R.buyStorage(s);
  assert.equal(r.state.storage.cap, 9);
  assert.equal(r.state.coins, 140);
  r = R.buyStorage(r.state);
  assert.equal(r.state.storage.cap, 12);
  assert.equal(r.state.coins, 20);
  assert.equal(R.buyStorage(r.state).ok, false);
  assert.deepEqual(S.validate(r.state), []);
});

test('島の解放: 航路発見後に支払い・二重実行で二重課金しない・第1生産元を解放', () => {
  let s = R.newGame(1);
  s.coins = 500;
  assert.equal(R.unlockIsland(s, 'shiokaze').ok, false, '航路未発見');
  s.routes.push('shiokaze');
  const r = R.unlockIsland(s, 'shiokaze');
  assert.ok(r.ok);
  assert.equal(r.state.coins, 350);
  assert.equal(r.state.island, 'shiokaze');
  assert.ok(r.state.gens.includes('shell'));
  assert.ok(r.state.pending.includes('arrive-shiokaze'));
  const r2 = R.unlockIsland(r.state, 'shiokaze');
  assert.equal(r2.state.coins, 350, '二重実行でも再課金しない');
  // 再訪は無料
  const back = R.travel(r.state, 'komorebi');
  const again = R.travel(back.state, 'shiokaze');
  assert.equal(again.state.coins, 350);
  assert.equal(again.events.filter((e) => e.type === 'dialogue').length, 0);
});

test('未解放の島の品物を先行要求しない', () => {
  for (const isl of D.ISLANDS) {
    const idx = D.ISLAND_IDS.indexOf(isl.id);
    const allowed = new Set();
    for (const j of D.ISLAND_IDS.slice(0, idx + 1)) {
      const x = D.islandById(j);
      allowed.add(x.firstGen);
    }
    // 島内で解放される生産元を順に追加しながら確認
    for (const p of D.ISLANDS.slice(0, idx)) for (const q of p.quests) if (q.effects.gen) allowed.add(q.effects.gen);
    for (const q of isl.quests) {
      for (const r of q.req) assert.ok(allowed.has(r.c), `${q.id} が未解放の ${r.c} を要求`);
      if (q.effects.gen) allowed.add(q.effects.gen);
    }
  }
});

/** ルール関数だけで全15依頼を進める（生成・合成を実際に行う） */
function playThrough(seed = 5) {
  let s = R.newGame(seed);
  s.pending = [];
  let ops = 0;
  const make = (c, l) => {
    // 再帰的に合成して (c,l) を1個作る
    if (l === 1) { const r = R.generate(s, c); assert.ok(r.ok, r.msg); s = r.state; ops++; return; }
    make(c, l - 1); make(c, l - 1);
    const at = [];
    s.board.forEach((x, i) => { if (x && x.c === c && x.l === l - 1) at.push(i); });
    const r = R.move(s, { z: 'b', i: at[at.length - 2] }, { z: 'b', i: at[at.length - 1] });
    assert.ok(r.ok, r.msg); s = r.state; ops++;
  };
  for (const isl of D.ISLANDS) {
    if (isl.id !== 'komorebi') {
      while (s.coins < isl.unlockCost) {
        // 通常注文で資金を回復
        const o = s.orders.slots[0];
        for (const q of o.req) for (let k = R.countItem(s, q.c, q.l); k < q.n; k++) make(q.c, q.l);
        const d = R.deliverOrder(s, 0);
        assert.ok(d.ok, d.msg);
        s = d.state; ops++;
      }
      const r = R.unlockIsland(s, isl.id);
      assert.ok(r.ok, r.msg);
      s = r.state;
      assert.equal(s.island, isl.id);
    }
    for (const q of isl.quests) {
      for (const r of q.req) {
        const have = R.countItem(s, r.c, r.l);
        for (let k = have; k < r.n; k++) make(r.c, r.l);
      }
      const r = R.deliverQuest(s, q.id);
      assert.ok(r.ok, `${q.id}: ${r.msg}`);
      s = r.state; ops++;
      assert.deepEqual(S.validate(s), [], `${q.id} 後の検証`);
    }
  }
  return { s, ops };
}

test('進行テスト: 3島・全15依頼・エンディング・クリア後も遊べる', () => {
  const { s, ops } = playThrough();
  assert.equal(s.cleared, true);
  assert.ok(s.flags.includes('lighthouseLit'));
  assert.deepEqual(s.unlockedIslands, ['komorebi', 'shiokaze', 'hoshiakari']);
  assert.ok(s.dialogues.includes('ending'));
  assert.equal(s.gens.length, 6);
  // クリア後: 注文・合成・島移動・収納
  assert.ok(R.generate(s, 'light').ok);
  assert.ok(R.replaceOrder(s, 0).ok);
  assert.ok(R.travel(s, 'komorebi').ok);
  assert.ok(ops > 300, `操作数 ${ops}`);
});

test('バックアップ: 正常・破損・未知の将来版・別ゲーム・値の不正を判定', () => {
  const { s } = playThrough(9);
  const good = { format: 'imhs-backup', gameId: D.GAME_ID, schema: D.SCHEMA, exportedAt: new Date().toISOString(), data: s };
  const ok = S.parseBackup(structuredClone(good));
  assert.ok(ok.ok);
  assert.equal(ok.info.island, 'ほしあかり島');
  const bad = (mut) => { const b = structuredClone(good); mut(b); return S.parseBackup(b).ok; };
  assert.equal(bad((b) => { b.schema = 99; }), false, '将来版');
  assert.equal(bad((b) => { b.gameId = 'other'; }), false, '別ゲーム');
  assert.equal(bad((b) => { b.format = 'x'; }), false, '形式');
  assert.equal(bad((b) => { b.data.board.pop(); }), false, '配列長');
  assert.equal(bad((b) => { b.data.board[0] = { c: 'fish', l: 1 }; }), false, '系統');
  assert.equal(bad((b) => { b.data.board[0] = { c: 'fruit', l: 7 }; }), false, '段階');
  assert.equal(bad((b) => { b.data.coins = -5; }), false, '所持金');
  assert.equal(bad((b) => { b.data.storage.items.push(null); }), false, '収納の長さ');
  assert.equal(bad((b) => { b.data.island = 'atlantis'; }), false, '島');
  assert.equal(bad((b) => { delete b.data.quests; }), false, '欠落');
  assert.equal(S.parseBackup(null).ok, false);
  assert.equal(S.parseBackup('{broken').ok, false);
});

test('旧版移行: schema 0（試作形式）→ 現行版', () => {
  const old = {
    coins: 42, island: 'komorebi', unlockedIslands: ['komorebi'], gens: ['fruit', 'sweet'],
    board: Array.from({ length: 56 }, (_, i) => (i === 3 ? 'fruit:2' : i === 9 ? 'sweet:4' : null)),
    storageCap: 6, storage: ['fruit:1'],
    quests: { komorebi: 3, shiokaze: 0, hoshiakari: 0 },
    discovered: ['fruit:1', 'fruit:2', 'sweet:4'], flags: ['stall'], dialogues: ['arrive-komorebi'],
  };
  const r = S.parseBackup({ format: 'imhs-backup', gameId: D.GAME_ID, schema: 0, data: old });
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.data.board[3], { c: 'fruit', l: 2 });
  assert.equal(r.data.storage.items.length, 6);
  assert.deepEqual(r.data.storage.items[0], { c: 'fruit', l: 1 });
  assert.deepEqual(S.validate(r.data), []);
});

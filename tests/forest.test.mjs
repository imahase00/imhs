// 森のとりで: ゲームの計算・セーブ形式のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../docs/games/forest-fort/sim.js';
import * as D from '../docs/games/forest-fort/data.js';
import { validate, upgrade, parseBackup } from '../docs/games/forest-fort/save-schema.js';

const STILL = { x: 0, y: 0 };
const run = (w, sec, input = STILL) => {
  const all = [];
  for (let i = 0; i < sec * 30; i++) all.push(...S.step(w, input, 1 / 30));
  return all;
};
function maxed(save) {
  for (const p of D.PADS) save.levels[p.id] = p.cost.length;
  return save;
}

test('新しいセーブ: ウェーブ1・コイン0・木の骨組み・正しい形式', () => {
  const s = S.newSave(1);
  assert.equal(s.wave, 1);
  assert.equal(s.coins, 0);
  assert.equal(s.levels.core, 1);
  assert.equal(s.levels.rabbit, 0);
  assert.deepEqual(validate(s), []);
  const w = S.createWorld(s);
  assert.equal(w.phase, 'rest');
  assert.equal(w.allies.length, 0);
  assert.equal(w.core.hp, D.CORE_HP[1]);
});

test('台座の上で立ち止まるとコインを払い、たまると強化される（歩いている間は払わない）', () => {
  const s = S.newSave(1);
  s.coins = 100;
  const w = S.createWorld(s);
  const pad = S.padById('rabbit');
  w.hero.x = pad.x;
  w.hero.y = pad.y;
  run(w, 0.2, { x: 0.01, y: 0.9 });          // 歩きながら通過
  assert.equal(s.paid.rabbit ?? 0, 0);
  w.hero.x = pad.x;
  w.hero.y = pad.y;
  const ev = run(w, 3);
  assert.ok(ev.some((e) => e.type === 'build' && e.pad === 'rabbit'));
  assert.equal(s.levels.rabbit, 1);
  // 1段階目を買ったあとも立ち続けていれば、次の段階へ払い続ける
  assert.equal(s.coins + (s.paid.rabbit ?? 0), 100 - pad.cost[0]);
  assert.equal(w.allies.length, 1);
  assert.deepEqual(validate(S.syncSave(w)), []);
});

test('条件を満たすまで現れない台座（くまの盾兵は砦の中心が段階2から）', () => {
  const s = S.newSave(1);
  assert.equal(S.padState(s, S.padById('bear')).visible, false);
  s.levels.core = 2;
  assert.equal(S.padState(s, S.padById('bear')).visible, true);
});

test('休憩中の魔物は主人公に向かい、柵や中心を攻めない', () => {
  const s = S.newSave(3);
  const w = S.createWorld(s);
  w.hero.x = 1024;
  w.hero.y = 400;           // 砦の北の外
  run(w, 25);
  assert.ok(s.stats.kills > 0, '主人公が倒している');
  for (const side of ['n', 's', 'w', 'e']) assert.equal(w.walls[side].hp, w.walls[side].max);
  assert.equal(w.core.hp, w.core.max);
});

test('ウェーブ: 全部倒すと報酬・次のウェーブへ・休憩に戻る（強化しきった砦）', () => {
  const s = maxed(S.newSave(5));
  const w = S.createWorld(s);
  assert.ok(S.startWave(w));
  assert.equal(S.startWave(w), false, 'ウェーブ中は二重に始めない');
  let won = null;
  for (let i = 0; i < 120 * 30 && !won; i++) won = S.step(w, STILL, 1 / 30).find((e) => e.type === 'waveWon');
  assert.ok(won, 'ウェーブ1を守りきる');
  assert.equal(won.reward, D.WAVE_REWARD(1));
  assert.equal(s.wave, 2);
  assert.equal(w.phase, 'rest');
  assert.equal(w.pickups.length, 0, '落ちていたコインも回収');
});

test('中心が壊されたら失敗: 強化とコインは残り、同じウェーブからやり直し', () => {
  const s = S.newSave(5);
  s.coins = 123;
  s.levels.vital = 2;   // 戦いに関わらない強化で、残るかを確かめる
  const w = S.createWorld(s);
  S.startWave(w);
  w.hero.x = 1024;
  w.hero.y = 2800;          // 戦わずに離れている
  w.core.hp = 1;
  for (const side of ['n', 's', 'w', 'e']) w.walls[side].hp = 0;
  const ev = run(w, 90, STILL);
  assert.ok(ev.some((e) => e.type === 'waveLost'));
  assert.equal(s.wave, 1);
  assert.equal(s.levels.vital, 2);
  assert.ok(s.coins >= 123);
  assert.equal(w.core.hp, w.core.max, '休憩に戻ると直る');
  assert.equal(s.stats.losses, 1);
});

test('主人公が倒れると数秒後にたき火のそばで起き上がる', () => {
  const s = S.newSave(1);
  const w = S.createWorld(s);
  w.hero.hp = 1;
  w.hero.x = 1024;
  w.hero.y = 600;
  for (let k = 0; k < 6; k++) {
    const e = { ...D.ENEMIES.wolf };
    w.enemies.push({ id: 900 + k, type: 'wolf', kind: 'wolf', x: 1024 + k, y: 600, hp: 999, max: 999, speed: 120, dmg: 50, cd: 0, baseCd: 1, radius: e.radius, size: e.size, coins: 1, flying: false, ranged: 0, split: 0, blur: 0, wallMult: 1, trickle: false, face: 1, hurtT: 0, attackT: 0, walkT: 0, kx: 0, ky: 0, bossT: 9, action: null });
  }
  const ev = run(w, 1);
  assert.ok(ev.some((e) => e.type === 'heroDown'));
  assert.ok(w.hero.deadT > 0);
  w.enemies = [];
  run(w, D.HERO.respawn + 0.5);
  assert.equal(w.hero.deadT <= 0, true);
  assert.equal(w.hero.hp, w.hero.maxHp);
  assert.ok(Math.hypot(w.hero.x - D.CORE_POS.x, w.hero.y - D.CORE_POS.y) < 400);
});

test('ボスの大技は予告（赤い印）が先に出てから当たる', () => {
  const s = S.newSave(2);
  s.wave = 15;
  const w = S.createWorld(s);
  w.phase = 'wave';
  w.hero.x = 1024;
  w.hero.y = 800;
  w.enemies = [];
  w.queue = [{ type: 'boar', from: 'n' }];
  w.spawnT = 0;
  w.spawnInterval = 99;
  const boar = () => w.enemies.find((e) => e.boss);
  run(w, 0.1);
  assert.ok(boar());
  boar().x = 1024;
  boar().y = 500;
  boar().bossT = 0;
  const hp = w.hero.hp;
  S.step(w, STILL, 1 / 30);
  assert.equal(w.tele.length, 1, '予告が出る');
  assert.equal(w.hero.hp, hp, '予告の時点ではまだ当たらない');
});

test('ウェーブ構成: 15ウェーブ・5/10/15がボス・クリア後は果てしない夜', () => {
  assert.equal(D.WAVES.length, 15);
  assert.ok(S.isBossWave(5) && S.isBossWave(10) && S.isBossWave(15));
  const g = S.waveGroups(20);
  assert.ok(g.groups.length >= 3);
  for (const w of D.WAVES) for (const [type] of w.groups) assert.ok(D.ENEMIES[type] || D.ELITES[type], type);
});

test('セーブ形式: 不正なデータを拒否し、バックアップを検証する', () => {
  const s = S.newSave(1);
  assert.ok(validate({ ...s, coins: -1 }).length);
  assert.ok(validate({ ...s, levels: { ...s.levels, core: 9 } }).length);
  assert.ok(validate({ ...s, levels: { ...s.levels, core: 0 } }).length, '初期段階より下は不正');
  assert.ok(validate({ ...s, paid: { rabbit: 999 } }).length);
  assert.ok(validate({ ...s, hero: { x: -50, y: 10 } }).length);
  assert.ok(validate({ ...s, cleared: true }).length, 'クリア前のウェーブ番号でクリア済みは矛盾');
  assert.equal(upgrade(s, 2).ok, false);
  const b = parseBackup({ format: 'imhs-backup', gameId: 'forest-fort', schema: 1, data: s, savedAt: '2026-11-17T00:00:00Z' });
  assert.ok(b.ok);
  assert.equal(b.info.rows[0][1], '0/15');
  assert.equal(parseBackup({ format: 'imhs-backup', gameId: 'hidamari-garden', schema: 1, data: s }).ok, false);
});

// ---- 試遊の指摘を受けた動き ----
const mkEnemy = (w, type, x, y, extra = {}) => {
  const b = D.ENEMIES[type];
  const e = { id: w.nextId++, type, kind: type, x, y, hp: 999, max: 999, speed: b.speed, dmg: b.dmg, cd: 0, baseCd: b.cd, radius: b.radius, size: b.size, coins: 1, flying: !!b.flying, ranged: b.ranged ?? 0, split: 0, blur: 0, wallMult: 1, trickle: false, face: 1, hurtT: 0, attackT: 0, walkT: 0, kx: 0, ky: 0, bossT: 9, action: null, ...extra };
  w.enemies.push(e);
  return e;
};
const inside = (p) => p.x > D.FORT.x1 && p.x < D.FORT.x2 && p.y > D.FORT.y1 && p.y < D.FORT.y2;

test('休憩中: 主人公が柵の中にいれば、魔物は柵の外をうろつくだけ（柵に傷をつけず、中に入らない）', () => {
  const s = S.newSave(4);
  const w = S.createWorld(s);
  w.hero.x = D.CORE_POS.x - 150;
  w.hero.y = D.CORE_POS.y + 200;
  for (let i = 0; i < 40 * 30; i++) {
    S.step(w, STILL, 1 / 30);
    for (const e of w.enemies) assert.ok(!inside(e) || e.flying, `魔物が柵の中にいる (${Math.round(e.x)},${Math.round(e.y)})`);
  }
  assert.ok(w.enemies.length > 0);
  for (const side of ['n', 's', 'w', 'e']) assert.equal(w.walls[side].hp, w.walls[side].max);
  assert.equal(w.hero.hp, w.hero.maxHp);
});

test('ウェーブ中: 押し返されても無事な柵はすり抜けない（壊れた柵からは入れる）', () => {
  const s = S.newSave(4);
  const w = S.createWorld(s);
  w.phase = 'wave';
  const e = mkEnemy(w, 'wolf', D.CORE_POS.x, D.FORT.y1 - 20);
  e.ky = 3000;   // 柵の内側へ強く押す
  S.step(w, STILL, 1 / 30);
  assert.ok(e.y <= D.FORT.y1, `柵の外にとどまる y=${e.y}`);
  w.walls.n.hp = 0;
  e.ky = 3000;
  S.step(w, STILL, 1 / 30);
  assert.ok(e.y > D.FORT.y1, '壊れた柵からは入れる');
});

test('ウェーブ中: 敵は中心をめざし、離れた主人公は追わない（すぐ近くなら反撃）', () => {
  const s = S.newSave(4);
  const w = S.createWorld(s);
  w.phase = 'wave';
  w.hero.x = D.CORE_POS.x + 300;
  w.hero.y = D.FORT.y1 - 250;
  const e = mkEnemy(w, 'mushroom', D.CORE_POS.x, D.FORT.y1 - 400);
  const y0 = e.y;
  run(w, 1);
  assert.ok(e.y > y0 + 30, '中心（南）へ進む');
  assert.ok(Math.abs(e.x - D.CORE_POS.x) < 40, '主人公のほうへ寄り道しない');
  const hp = w.hero.hp;
  w.hero.x = e.x + 40;
  w.hero.y = e.y;
  run(w, 2);
  assert.ok(w.hero.hp < hp, 'すぐ近くの主人公には反撃する');
});

test('台座: 立ち止まって0.8秒は払わない・1段階で止まる・出て乗り直すと次へ', () => {
  const s = S.newSave(1);
  s.coins = 400;
  const w = S.createWorld(s);
  const pad = S.padById('rabbit');
  w.hero.x = pad.x;
  w.hero.y = pad.y;
  run(w, 0.5);
  assert.equal(s.coins, 400, '0.5秒ではまだ払わない');
  run(w, 3);
  assert.equal(s.levels.rabbit, 1);
  assert.equal(s.coins, 400 - pad.cost[0], '1段階で止まる');
  w.hero.x = pad.x + 200;
  run(w, 0.2);
  w.hero.x = pad.x;
  run(w, 3);
  assert.equal(s.levels.rabbit, 2, '乗り直すと次の段階へ');
});

test('台座: ウェーブ中、近くに敵がいる間は払わない', () => {
  const s = S.newSave(1);
  s.coins = 400;
  const w = S.createWorld(s);
  w.phase = 'wave';
  const pad = S.padById('rabbit');
  w.hero.x = pad.x;
  w.hero.y = pad.y;
  mkEnemy(w, 'mushroom', pad.x + 150, pad.y, { speed: 0 });
  run(w, 2);
  assert.equal(s.coins, 400);
});

test('うさぎの弓兵は、攻められている柵のほうへ砦の中を動く（柵の外には出ない）', () => {
  const s = S.newSave(1);
  s.levels.rabbit = 1;
  const w = S.createWorld(s);
  w.phase = 'wave';
  const a = w.allies[0];
  const x0 = a.x;
  mkEnemy(w, 'golem', D.FORT.x2 + 120, a.post.y, { speed: 0, hp: 99999, max: 99999 });
  run(w, 3);
  assert.ok(a.x > x0 + 100, `東へ寄る ${Math.round(x0)}→${Math.round(a.x)}`);
  assert.ok(inside(a), '砦の中にとどまる');
});

test('コインは最初から広い範囲で吸い寄せられる', () => {
  const s = S.newSave(1);
  const w = S.createWorld(s);
  w.pickups.push({ x: w.hero.x + 250, y: w.hero.y, value: 5, t: 0, fly: false });
  run(w, 1.5);
  assert.equal(s.coins, 5);
});

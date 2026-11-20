// パズトレ: 盤面・ルール・進行・セーブの検査
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../docs/games/puztre/rules.js';
import * as D from '../docs/games/puztre/data.js';
import { validate, parseBackup, describe as describeSave, SCHEMA } from '../docs/games/puztre/save-schema.js';
import { campaign } from '../tools/sim-puztre.mjs';

const B = (rows) => rows.map((row) => [...row].map((ch) => ({ c: Number(ch), id: 0, stone: 0, ice: 0, dark: 0 })));

test('はじめの盤面には3つ並びがない', () => {
  const st = { rng: 7 };
  for (let i = 0; i < 50; i++) assert.equal(R.findGroups(R.newBoard(st)).length, 0);
});

test('そろった組: L字は1組、離れた同じ色は別の組、消せない石は数えない', () => {
  const b = B(['000123', '012345', '012340', '423400', '123450']);
  const zero = R.findGroups(b).filter((x) => x.color === 0);
  assert.deepEqual(zero.map((x) => x.cells.length).sort(), [3, 5], 'L字の5個で1組、右の縦3個で別の1組');
  b[0][0].stone = 3;
  assert.equal(R.findGroups(b).filter((x) => x.color === 0).length, 1, '角が石になるとL字はそろわない');
});

test('消えて落ちる: 盤面は埋まったまま、上から新しい球が来る', () => {
  const st = { rng: 3 };
  const b = R.newBoard(st);
  for (let c = 0; c < 3; c++) b[4][c].c = 0;
  for (let c = 3; c < 6; c++) b[4][c].c = 1;
  const steps = R.resolveAll(b, st);
  assert.ok(steps.length >= 1);
  assert.ok(b.flat().every(Boolean));
  assert.equal(R.findGroups(b).length, 0, '最後は止まっている');
  assert.ok(steps[0].falls.some((f) => f.from < 0), '新しい球');
});

test('威力: コンボで倍率、5つ以上で1.5倍、弱点2倍・効きにくい色は弱い', () => {
  const pt = R.party(['torch'], 'wood');
  const g3 = { color: 0, cells: [[0, 0], [0, 1], [0, 2]] };
  const g5 = { color: 1, cells: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] };
  const a1 = R.attackOf([{ groups: [g3] }], pt);
  assert.equal(a1.dmg.fire, 3 * (D.BASE_POWER + D.TOOL_POWER));
  const a2 = R.attackOf([{ groups: [g3, g5] }], pt);
  assert.equal(a2.combos, 2);
  assert.equal(a2.big, 1);
  assert.equal(a2.dmg.water, Math.round(5 * D.BASE_POWER * 1.5 * 1.25));
  const trap = { weak: 'fire', resist: 'water' };
  assert.equal(R.factor(trap, 'fire'), 2);
  assert.ok(R.factor(trap, 'water') < 1);
  assert.equal(R.factor(trap, 'fire', { scope: 2 }), 3);
});

function freshRun(d = 0, tools = D.START_TOOLS, frame = 'wood') {
  const save = R.newSave();
  save.loadout = [...tools];
  save.tools = [...new Set([...save.tools, ...tools])];
  save.frame = frame;
  if (!save.frames.includes(frame)) save.frames.push(frame);
  return { save, run: R.newRun(save, d, 99) };
}

test('攻撃: 狙った仕掛けを壊したあまりは次の仕掛けへ', () => {
  const { run } = freshRun();
  run.floor = 5;
  R.startFloor(run);
  assert.equal(run.traps.length, 3);
  run.traps[0].hp = 10;
  const g = { color: 2, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] };
  const before = run.traps[1].hp;
  const { broken } = R.applyAttack(run, [{ groups: [{ color: 2, cells: g.cells.slice(0, 3) }] }]);
  assert.equal(run.traps[0].hp, 0);
  assert.ok(run.traps[1].hp < before);
  assert.equal(broken, 1);
  assert.ok(run.traps[1].hp > 0);
  assert.equal(run.target, run.traps.findIndex((t) => t.hp > 0));
});

test('大扉は段階ごとに弱点が変わる', () => {
  const { run } = freshRun();
  run.floor = D.FLOORS;
  R.startFloor(run);
  const t = run.traps[0];
  assert.equal(t.boss, true);
  assert.equal(t.weak, 'fire');
  t.hp = 1;
  const { ev } = R.applyAttack(run, [{ groups: [{ color: 0, cells: [[0, 0], [0, 1], [0, 2]] }] }]);
  assert.ok(ev.some((e) => e.type === 'phase'));
  assert.equal(t.phase, 1);
  assert.equal(t.weak, 'light');
  assert.ok(t.hp > 0);
  assert.equal(R.floorCleared(run), false);
});

test('罠: カウントが0で体力が減り、盤面に悪さ（つた）が出て3手で戻る', () => {
  const { run } = freshRun();
  run.traps = [{ id: 'vine-door', name: 'x', weak: 'fire', resist: 'water', hp: 100, max: 100, cd: 1, cdMax: 3, dmg: 20, act: 'a', hazard: 'stone' }];
  const hp = run.hp;
  const ev = R.trapTurn(run);
  assert.ok(ev.some((e) => e.type === 'trap'));
  assert.equal(run.hp, hp - 20);
  assert.equal(run.traps[0].cd, 3);
  assert.equal(run.board.flat().filter((x) => x.stone > 0).length, 4);
  for (let i = 0; i < 3; i++) R.tickBoard(run);
  assert.equal(run.board.flat().filter((x) => x.stone > 0).length, 0);
});

test('枠: 鉄の枠で罠半分、砂時計の枠で時間延長、古代の枠でスキルが早くたまる', () => {
  const { run } = freshRun(0, D.START_TOOLS, 'iron');
  run.traps = [{ id: 'x', name: 'x', weak: 'fire', resist: 'water', hp: 100, max: 100, cd: 1, cdMax: 3, dmg: 20, act: 'a', hazard: null }];
  const hp = run.hp;
  R.trapTurn(run);
  assert.equal(run.hp, hp - 10);
  assert.equal(R.moveTime(freshRun(0, D.START_TOOLS, 'sand').run), D.MOVE_TIME + 1.5);
  assert.equal(freshRun(0, ['torch'], 'ancient').run.cds.torch, D.TOOLS.torch.cd - 1);
});

test('スキル: たいまつで草→炎、薬草袋で全回復、ロープでカウントを戻す、使うとまた溜め直し', () => {
  const { run } = freshRun(0, ['torch', 'herbs', 'rope']);
  for (const id of run.tools) run.cds[id] = 0;
  const leaf = D.COLORS.indexOf('leaf');
  run.board[0][0].c = leaf;
  R.useSkill(run, 'torch');
  assert.ok(run.board.flat().every((x) => x.c !== leaf));
  run.hp = 10;
  R.useSkill(run, 'herbs');
  assert.equal(run.hp, run.maxHp);
  const cd = run.traps[0].cd;
  R.useSkill(run, 'rope');
  assert.equal(run.traps[0].cd, cd + 2);
  assert.equal(run.cds.torch, D.TOOLS.torch.cd);
  assert.equal(R.useSkill(run, 'torch'), null, 'たまるまで使えない');
});

test('進行: フロアのお宝・大扉のお宝と隠しお宝・道具・次のダンジョン・撤退でコイン半分', () => {
  const { save, run } = freshRun(1);
  run.floor = 1;
  assert.deepEqual(R.clearFloor(save, run), ['s1']);
  run.floor = D.FLOORS;
  R.startFloor(run);
  run.boss.hearts = 0;
  assert.deepEqual(R.clearFloor(save, run), ['s7', 's8'], 'ハートを消さずに大扉 → 隠しお宝');
  const res = R.finishDungeon(save, run);
  assert.equal(res.first, true);
  assert.deepEqual(res.tools, ['mirror', 'compass']);
  assert.ok(save.cleared.includes('s'));
  assert.equal(R.unlocked(save, 2), true);
  const r2 = R.newRun(save, 0, 5);
  r2.coins = 101;
  const coins = save.coins;
  assert.equal(R.retreat(save, r2).coins, 50);
  assert.equal(save.coins, coins + 50);
  assert.deepEqual(validate(save), []);
});

test('途中保存: フロアの始めから、体力・コイン・スキルのたまり具合を引き継いで再開', () => {
  const { save, run } = freshRun();
  run.floor = 3; run.hp = 77; run.coins = 40; run.cds.torch = 1;
  save.run = R.snapshot(run);
  assert.deepEqual(validate(save), []);
  const r = R.resume(save);
  assert.equal(r.floor, 3);
  assert.equal(r.hp, 77);
  assert.equal(r.coins, 40);
  assert.equal(r.cds.torch, 1);
  assert.equal(r.traps.length, D.trapCount(3));
});

test('セーブの検証・バックアップ・枠の購入', () => {
  const s = R.newSave();
  assert.deepEqual(validate(s), []);
  assert.equal(R.buyFrame(s, 'sand'), false, 'コインが足りない');
  s.coins = 500;
  assert.equal(R.buyFrame(s, 'sand'), true);
  assert.equal(s.coins, 200);
  assert.equal(s.frame, 'sand');
  assert.deepEqual(validate(s), []);
  assert.ok(validate({ ...s, frame: 'gold' }).length);
  assert.ok(validate({ ...s, loadout: ['hammer'] }).length, '持っていない道具');
  const ok = parseBackup({ format: 'imhs-backup', gameId: D.GAME_ID, schema: SCHEMA, data: s });
  assert.equal(ok.ok, true);
  assert.equal(ok.info.label, 'はじめの冒険へ');
  assert.equal(parseBackup({ format: 'imhs-backup', gameId: 'tofu-run', schema: 1, data: s }).ok, false);
  assert.ok(describeSave(s).rows.length >= 3);
});

test('データ: お宝48・道具16・仕掛けと大扉の絵のIDがそろっている', () => {
  assert.equal(D.TREASURE_IDS.length, 48);
  assert.equal(new Set(D.TREASURE_IDS).size, 48);
  assert.equal(D.TOOL_IDS.length, 16);
  const rewarded = new Set([...D.START_TOOLS, ...D.TOOL_REWARD.flat()]);
  assert.equal(rewarded.size, 16, 'すべての道具がどこかで手に入る');
  for (const dg of D.DUNGEONS) assert.equal(dg.traps.length, 3);
});

test('自動プレイ（初心者寄りの腕前）で全ダンジョンを踏破できる', () => {
  const r = campaign(7919, 80);
  assert.ok(!r.stuck, `${r.stuck}で行き詰まり`);
  assert.ok(r.floors >= 48);
});

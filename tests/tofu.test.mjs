// にげろ！とうふ: 走りの計算・記録・セーブの検査
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../docs/games/tofu-run/sim.js';
import * as D from '../docs/games/tofu-run/data.js';
import { validate, parseBackup, describe as describeSave, SCHEMA } from '../docs/games/tofu-run/save-schema.js';
import { playOnce } from '../tools/sim-tofu.mjs';

test('どの場面にも「よける・跳ぶ・くぐる」の3種類の障害物がある', () => {
  for (const z of D.ZONES) {
    for (const type of ['block', 'low', 'high']) {
      assert.ok(D.OBSTACLE_IDS.some((id) => D.OBSTACLES[id].zone === z.id && D.OBSTACLES[id].type === type), `${z.id}/${type}`);
    }
  }
  for (const id of D.OBSTACLE_IDS) assert.match(D.OBSTACLES[id].death, /。$/);
});

test('並びには必ず逃げ道がある（先読みして正しく動けば 5000m まで崩れない）', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = playOnce(seed, { limit: 5000 });
    assert.equal(r.cause, null, `seed ${seed}: ${r.cause}@${r.dist}`);
    assert.ok(r.dist >= 5000);
  }
});

test('はじめての走りは、よける→跳ぶ→くぐる→2つよけるの順に教える', () => {
  const run = S.newRun(3, { tutorial: true });
  run.d = 30;
  S.step(run, 0.001);
  const groups = [];
  for (const o of run.obs) {
    let g = groups.find((x) => Math.abs(x.z - o.z) < 0.01);
    if (!g) groups.push(g = { z: o.z, items: [] });
    g.items.push(o);
  }
  groups.sort((a, b) => a.z - b.z);
  assert.deepEqual(groups[0].items.map((o) => [o.type, o.lane]), [['block', 0]]);
  assert.deepEqual(groups[1].items.map((o) => o.type), ['low', 'low', 'low']);
  assert.deepEqual(groups[2].items.map((o) => o.type), ['high', 'high', 'high']);
  assert.equal(groups[3].items.filter((o) => o.type === 'block').length, 2);
});

function runInto(type, cmd, { shield = false } = {}) {
  const run = S.newRun(9);
  run.nextZ = 1e9;     // 自動の並びは出さない
  run.obs.push({ kind: type === 'block' ? 'pot' : type === 'low' ? 'saibashi' : 'otama', type, lane: 0, z: 12, ph: 0, hit: false });
  run.shield = shield;
  const evs = [];
  for (let i = 0; i < 400 && run.d < 16; i++) {
    if (cmd && run.obs[0] && run.obs[0].z - run.d < 1.6 && !run._did) { S.act(run, cmd); run._did = true; }
    evs.push(...S.step(run, 1 / 120));
    if (run.dead) break;
  }
  return { run, evs };
}

test('ぶつかり判定: 跳べば低いもの、つぶれれば高いものを越えられる', () => {
  assert.equal(runInto('block').run.dead?.kind, 'pot');
  assert.equal(runInto('block', 'left').run.dead, null);
  assert.equal(runInto('low').run.dead?.kind, 'saibashi');
  assert.equal(runInto('low', 'up').run.dead, null);
  assert.equal(runInto('low', 'down').run.dead?.kind, 'saibashi', 'つぶれても低いものは越えられない');
  assert.equal(runInto('high').run.dead?.kind, 'otama');
  assert.equal(runInto('high', 'down').run.dead, null);
  assert.equal(runInto('high', 'up').run.dead?.kind, 'otama', '跳んでも高いものはくぐれない');
});

test('氷のまもりは1回だけ身代わりになる', () => {
  const { run, evs } = runInto('block', null, { shield: true });
  assert.equal(run.dead, null);
  assert.equal(run.saved, 1);
  assert.equal(run.shield, false);
  assert.ok(evs.some((e) => e.type === 'shieldBreak'));
});

test('ねぎを拾い、かつおぶしで引き寄せる', () => {
  const run = S.newRun(5);
  run.nextZ = 1e9;
  run.picks.push({ kind: 'negi', lane: 0, z: 5, y: 0.35, got: false }, { kind: 'katsuo', lane: 0, z: 8, y: 0.45, got: false });
  for (let i = 0; i < 6; i++) run.picks.push({ kind: 'negi', lane: 1, z: 14 + i * 1.5, y: 0.35, got: false });
  for (let i = 0; i < 400; i++) S.step(run, 1 / 120);
  assert.equal(run.katsuo, 1);
  assert.equal(run.negi, 7, 'となりの列のねぎも寄ってくる');
});

test('記録: 自己ベスト・歴代トップ5・図鑑・お題・とうふの種類', () => {
  const s = S.newSave();
  const r = (dist, cause, extra = {}) => ({ dist, negi: 3, jumps: 0, slides: 0, lanes: 0, ice: 0, katsuo: 0, saved: 0, cause, noJumpDist: dist, noNegiDist: 0, ...extra });
  let out = S.applyRun(s, r(120, 'pot'), '2026-01-01T00:00:00Z');
  assert.equal(out.best, true);
  assert.equal(out.newDeath, true);
  assert.deepEqual(out.done.sort(), ['fall1', 'm100']);
  out = S.applyRun(s, r(80, 'pot'), '2026-01-02T00:00:00Z');
  assert.equal(out.best, false);
  assert.equal(out.newDeath, false);
  assert.equal(out.rank, 2);
  for (let i = 0; i < 6; i++) S.applyRun(s, r(10 + i, 'cat'), `2026-01-0${3 + i}T00:00:00Z`);
  assert.equal(s.top.length, 5);
  assert.deepEqual(s.top.map((e) => e.d), [120, 80, 15, 14, 13]);
  assert.equal(s.deaths.pot, 2);
  assert.equal(s.deaths.cat, 6);
  out = S.applyRun(s, r(320, 'knife', { negi: 12, jumps: 6, noJumpDist: 10 }), '2026-02-01T00:00:00Z');
  assert.ok(out.done.includes('m300'));
  assert.ok(!out.done.includes('nojump300'));
  assert.ok(out.done.includes('negi10') && out.done.includes('jump5'));
  assert.ok(S.unlockedSkins(s).includes('momen'), 'お題3つで木綿');
  assert.deepEqual(validate(s), []);
  assert.match(S.saveSummary(s).label, /自己ベスト 320m・お題 \d+\/30/);
});

test('セーブの検証とバックアップ', () => {
  const s = S.newSave();
  assert.deepEqual(validate(s), []);
  assert.ok(validate({ ...s, skin: 'kin' }).length, 'まだ選べないとうふ');
  assert.ok(validate({ ...s, deaths: { nabe: 1 } }).length);
  assert.ok(validate({ ...s, best: 10, top: [{ d: 20, negi: 0, cause: null, at: 'x' }] }).length);
  const ok = parseBackup({ format: 'imhs-backup', gameId: D.GAME_ID, schema: SCHEMA, data: s });
  assert.equal(ok.ok, true);
  assert.equal(ok.info.label, 'まだ走っていない');
  assert.equal(parseBackup({ format: 'imhs-backup', gameId: 'drift-1', schema: 1, data: s }).ok, false);
  assert.ok(describeSave(s).rows.length >= 4);
});

test('お題は30個・とうふは8種類で、最後は全部達成', () => {
  assert.equal(D.MISSIONS.length, 30);
  assert.equal(new Set(D.MISSIONS.map((m) => m.id)).size, 30);
  assert.equal(D.SKINS.length, 8);
  assert.equal(D.SKINS.at(-1).need, D.MISSIONS.length);
});

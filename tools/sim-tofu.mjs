// にげろ！とうふ: 自動プレイ（障害物の並びに必ず逃げ道があるか・どこまで走れるかの確認）
// 使い方: node tools/sim-tofu.mjs [回数] [反応の遅れ(秒)]
import * as S from '../docs/games/tofu-run/sim.js';
import { OB_SIZE, TOFU, speedAt } from '../docs/games/tofu-run/data.js';

/** 先を見て、次に何をするか決める（react: この秒数より近い障害物にしか反応できない人間らしさ） */
export function botThink(run, { react = 0 } = {}) {
  const ahead = run.obs.filter((o) => o.z - run.d > -((OB_SIZE[o.type].d + TOFU.d) / 2) && !o.hit);
  if (!ahead.length) return null;
  const z0 = Math.min(...ahead.map((o) => o.z));
  const group = ahead.filter((o) => Math.abs(o.z - z0) < 0.01);
  const dist = z0 - run.d;
  if (react && dist > run.v * 1.6) return null;
  const hz = { '-1': null, 0: null, 1: null };
  for (const o of group) hz[o.lane] = o.type;
  const score = (l) => (hz[l] === 'block' ? 99 : hz[l] ? 1 : 0) + Math.abs(l - run.lane) * 0.4;
  const target = [-1, 0, 1].sort((a, b) => score(a) - score(b))[0];
  if (target !== run.lane) return target < run.lane ? 'left' : 'right';
  if (Math.abs(run.x - run.lane) > 0.05) return null;
  const t = hz[run.lane];
  if (t === 'low' && !run.air && dist < run.v * 0.2 + 0.5) return 'up';
  if (t === 'high' && run.slideT < 0.25 && dist < run.v * 0.12 + 0.6) return 'down';
  return null;
}

export function playOnce(seed, { react = 0, limit = 6000, dt = 1 / 60 } = {}) {
  const run = S.newRun(seed, { tutorial: seed === 1 });
  let delay = [];
  while (!run.dead && run.d < limit) {
    const c = botThink(run, { react });
    if (c) {
      if (react) { if (!delay.some((x) => x.c === c)) delay.push({ c, at: run.t + react * 0.4 }); }
      else S.act(run, c);
    }
    for (const x of delay.filter((x) => x.at <= run.t)) S.act(run, x.c);
    delay = delay.filter((x) => x.at > run.t);
    S.step(run, dt);
  }
  return S.result(run);
}

if (process.argv[1]?.endsWith('sim-tofu.mjs')) {
  const n = Number(process.argv[2] ?? 20);
  const react = Number(process.argv[3] ?? 0);
  const out = [];
  for (let i = 1; i <= n; i++) out.push(playOnce(i, { react }));
  const ds = out.map((r) => r.dist).sort((a, b) => a - b);
  console.log(`反応の遅れ ${react}s / ${n}回: 距離 最小${ds[0]} 中央${ds[n >> 1]} 最大${ds[n - 1]}m`);
  console.log('崩れた原因:', out.filter((r) => r.cause).map((r) => `${r.cause}@${r.dist}`).join(' ') || 'なし');
  console.log('ねぎ（中央）:', out.map((r) => r.negi).sort((a, b) => a - b)[n >> 1], ' 速さ@3000m:', speedAt(3000).toFixed(1));
}

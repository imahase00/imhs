// 森のとりで: 自動プレイで「全15ウェーブを越えられるか・どのくらいかかるか」を試算する（バランス調整用）
// 使い方: node tools/sim-forest.mjs [回数] [詳しく表示 0/1]
// 人の遊び方を単純にまねたボット。ゲーム内の経過時間 ≒ 遊ぶ時間（アクションなので）。あくまで目安。
import * as S from '../docs/games/forest-fort/sim.js';
import { PADS, CORE_POS, WAVES } from '../docs/games/forest-fort/data.js';

// 強化の重み（大きいほど優先）。人がやりそうな「守りに効くものから」を近似
const WEIGHT = {
  weapon: 3, rabbit: 3, core: 2.5, 'wall-n': 2, 'wall-s': 1.8, 'wall-w': 1.8, 'wall-e': 1.8, bear: 2.2, squirrel: 2.2,
  owl: 2, smith: 2.2, 'tower-nw': 2, 'tower-ne': 2, 'tower-sw': 2, 'tower-se': 2, vital: 1.6, boots: 0.8, pouch: 0.6,
};
function play(seed, verbose) {
  const save = S.newSave(seed);
  save.pending = [];
  const w = S.createWorld(save);
  const dt = 1 / 30;
  let time = 0;
  let restTime = 0;
  const log = [];
  const toward = (p0) => {
    // 砦の建物をまっすぐ越えられないときは、横を回り込む
    let p = p0;
    const hx = w.hero.x;
    const hy = w.hero.y;
    const cx0 = CORE_POS.x;
    const cy0 = CORE_POS.y - 20;
    const vx = p0.x - hx;
    const vy = p0.y - hy;
    const L = Math.hypot(vx, vy) || 1;
    const s = Math.max(0, Math.min(1, ((cx0 - hx) * vx + (cy0 - hy) * vy) / (L * L)));
    if (Math.hypot(hx + vx * s - cx0, hy + vy * s - cy0) < S.CORE_RADIUS + 25 && L > 60 && s > 0 && s < 1) {
      // 建物の中心から見た接線の向きに進む（目標に近い回り方を選ぶ）
      const rx = hx - cx0;
      const ry = hy - cy0;
      const r = Math.hypot(rx, ry) || 1;
      const sign = rx * vy - ry * vx >= 0 ? 1 : -1;
      const out = r < S.CORE_RADIUS + 40 ? 0.4 : 0;
      return { x: -ry / r * sign + rx / r * out, y: rx / r * sign + ry / r * out };
    }
    const dx = p.x - w.hero.x;
    const dy = p.y - w.hero.y;
    const d = Math.hypot(dx, dy);
    return d < 12 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
  };
  // 買える強化のうち、重み÷費用 がいちばん良いもの。買えなければ、いちばん近い目標
  const nextBuy = () => {
    let best = null;
    for (const p of PADS) {
      const st = S.padState(save, p);
      if (!st.visible || st.max) continue;
      const left = st.cost - st.paid;
      const score = (WEIGHT[p.id] ?? 1) / Math.max(30, left) * (save.coins >= left ? 4 : 1);
      if (!best || score > best.score) best = { p, st, score };
    }
    return best;
  };
  let farmUntil = 0;
  let lostLast = false;
  while (time < 4 * 3600 && save.wave <= WAVES.length) {
    let inp = { x: 0, y: 0 };
    const h = w.hero;
    if (w.phase === 'rest') {
      restTime += dt;
      const want = nextBuy();
      if (want && save.coins >= want.st.cost - want.st.paid) {
        inp = toward(want.p);
      } else if (want && time < farmUntil) {
        // 足りなければ休憩中の魔物を倒して稼ぐ
        const e = w.enemies.find((x) => x.trickle);
        inp = e ? toward(e) : toward({ x: CORE_POS.x, y: CORE_POS.y + 250 });
      } else if (want && farmUntil === 0) {
        // 前のウェーブで負けたら、しばらく休憩中の魔物を倒して稼いでから挑む
        farmUntil = lostLast ? time + 120 : time;
        lostLast = false;
      } else {
        S.startWave(w);
        farmUntil = 0;
      }
    } else {
      // ウェーブ中: 砦の近くで戦う。体力が減ったらたき火へ
      if (h.hp < h.maxHp * 0.35) inp = toward({ x: CORE_POS.x + 140, y: CORE_POS.y + 120 });
      else {
        let best = null;
        let bd = 650 * 650;
        for (const e of w.enemies) {
          const d = (e.x - CORE_POS.x) ** 2 + (e.y - CORE_POS.y) ** 2;
          if (d < bd) { bd = d; best = e; }
        }
        const range = S.heroStats(save).weapon.range * 0.8;
        if (best) {
          const d = Math.hypot(best.x - h.x, best.y - h.y);
          inp = d > range ? toward(best) : { x: 0, y: 0 };
        } else inp = toward({ x: CORE_POS.x, y: CORE_POS.y + 200 });
      }
    }
    const ev = S.step(w, inp, dt);
    time += dt;
    for (const e of ev) {
      if (e.type === 'waveWon' || e.type === 'waveLost') {
        log.push(`${e.type === 'waveWon' ? '○' : '×'}${e.wave}@${Math.round(time / 60)}分`);
        farmUntil = 0;
        lostLast = e.type === 'waveLost';
      }
    }
  }
  if (verbose) console.log(log.join(' '), '| 強化', JSON.stringify(save.levels));
  return { time, cleared: save.cleared, wave: save.wave, losses: save.stats.losses, downs: save.stats.downs, kills: save.stats.kills, rest: restTime };
}

const N = Number(process.argv[2] || 5);
const verbose = process.argv[3] === '1';
const res = Array.from({ length: N }, (_, k) => play(500 + k, verbose));
const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
console.log(`試行 ${N} 回 / 15ウェーブ突破: ${res.filter((r) => r.cleared).length}`);
console.log(`到達ウェーブ 平均 ${avg((r) => r.wave - 1).toFixed(1)} / 負け ${avg((r) => r.losses).toFixed(1)} 回 / たおれた ${avg((r) => r.downs).toFixed(1)} 回 / 倒した魔物 ${avg((r) => r.kills).toFixed(0)}`);
console.log(`経過時間 平均 ${(avg((r) => r.time) / 60).toFixed(0)} 分（うち休憩 ${(avg((r) => r.rest) / 60).toFixed(0)} 分）※ボットの遊び方での目安`);

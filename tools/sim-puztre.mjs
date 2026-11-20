// パズトレ: 自動プレイ（難しさ・遊ぶ時間の見積もり）
// 使い方: node tools/sim-puztre.mjs [回数] [探す道すじの数]
//   探す道すじの数が多いほど上手（既定 120 ≒ ふつうの人。40 ≒ 初心者）
import * as R from '../docs/games/puztre/rules.js';
import { DUNGEONS, FLOORS, COLS, ROWS, COLORS, TOOLS, FRAMES, TREASURE_IDS } from '../docs/games/puztre/data.js';

const SEC_PER_TURN = 14;   // 考える・動かす・消える演出（のんびりめの人）
const SEC_PER_FLOOR = 8;   // フロアの切り替え・お宝の表示

function randomPath(run, st) {
  const b = run.board;
  let r; let c;
  do { r = Math.floor(R.rand(st) * ROWS); c = Math.floor(R.rand(st) * COLS); } while (b[r][c].ice > 0);
  const path = [[r, c]];
  const len = 2 + Math.floor(R.rand(st) * 14);
  for (let i = 0; i < len; i++) {
    const opts = [];
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ny = r + dy; const nx = c + dx;
      const prev = path[path.length - 2];
      if (prev && prev[0] === ny && prev[1] === nx) continue;
      if (R.canEnter(b, ny, nx)) opts.push([ny, nx]);
    }
    if (!opts.length) break;
    [r, c] = opts[Math.floor(R.rand(st) * opts.length)];
    path.push([r, c]);
  }
  return path;
}

export function bestMove(run, tries, st) {
  const pt = R.runParty(run);
  const t = run.traps[run.target];
  let best = null;
  for (let k = 0; k < tries; k++) {
    const path = randomPath(run, st);
    const b = R.cloneBoard(run.board);
    R.applyPath(b, path);
    const steps = R.resolveAll(b, { rng: st.rng + k }, pt.mods.heartWeight);
    const atk = R.attackOf(steps, pt, run.buffs);
    let score = 0;
    for (const col of COLORS) if (col !== 'heart') score += atk.dmg[col] * (t ? R.factor(t, col, run.buffs) : 1);
    const need = 1 - run.hp / run.maxHp;
    score += atk.heal * (need > 0.4 ? 6 : need > 0.15 ? 1.5 : 0.1);
    if (!best || score > best.score) best = { path, score };
  }
  return best.path;
}

function useSkills(run) {
  for (const id of run.tools) {
    if (!R.skillReady(run, id)) continue;
    const low = run.hp / run.maxHp < 0.5;
    if ((id === 'flask' || id === 'herbs') && !low) continue;
    if (id === 'compass' && !run.board.flat().some((x) => x.dark > 0 || x.stone > 0)) continue;
    R.useSkill(run, id);
  }
}

function chooseLoadout(save, d) {
  const want = new Set([...DUNGEONS[d].traps.map((t) => t.weak), ...DUNGEONS[d].boss.phases.map((p) => p.weak)]);
  const score = (id) => (want.has(TOOLS[id].color) ? 3 : 0) + (['hammer', 'herbs', 'flask', 'rope'].includes(id) ? 2 : 0) + (id === 'scope' ? 2 : 0);
  return [...save.tools].sort((a, b) => score(b) - score(a)).slice(0, 4);
}

export function campaign(seed, tries) {
  const save = R.newSave();
  const st = { rng: seed };
  const log = [];
  let turns = 0; let floors = 0; let combos = 0;
  for (let d = 0; d < DUNGEONS.length; d++) {
    let attempts = 0;
    for (;;) {
      attempts++;
      save.loadout = chooseLoadout(save, d);
      for (const f of ['sand', 'iron', 'gem', 'moss', 'star', 'ancient', 'gold']) {
        const fr = FRAMES.find((x) => x.id === f);
        if (!save.frames.includes(f) && save.coins >= fr.price) R.buyFrame(save, f);
      }
      save.frame = ['star', 'iron', 'gem', 'sand', 'moss', 'wood'].find((f) => save.frames.includes(f));
      const run = R.newRun(save, d, (seed * 31 + d * 7 + attempts * 101) >>> 0);
      let dead = false;
      while (!dead) {
        useSkills(run);
        const path = bestMove(run, tries, st);
        R.applyPath(run.board, path);
        const steps = R.resolveAll(run.board, run, R.runParty(run).mods.heartWeight);
        const { atk, broken } = R.applyAttack(run, steps);
        R.checkHiddenTurn(save, run, atk, broken);
        turns++;
        combos += atk.combos;
        if (R.floorCleared(run)) {
          floors++;
          R.clearFloor(save, run);
          if (R.isBoss(run)) break;
          run.floor++;
          R.startFloor(run);
          continue;
        }
        R.trapTurn(run);
        R.tickBoard(run);
        if (run.hp <= 0) dead = true;
        if (run.stats.turns > 400) dead = true;
      }
      if (dead) {
        R.retreat(save, run);
        log.push(`${DUNGEONS[d].short}:撤退(${run.floor + 1}F)`);
        if (attempts >= 12) return { stuck: DUNGEONS[d].name, turns, floors, minutes: 0, log, coins: save.coins, frames: save.frames.length, treasures: save.treasures.length, maxCombo: 0, avg: combos / turns };
        continue;
      }
      R.finishDungeon(save, run);
      log.push(`${DUNGEONS[d].short}:${attempts}回目でクリア`);
      break;
    }
  }
  const minutes = (turns * SEC_PER_TURN + floors * SEC_PER_FLOOR) / 60;
  return { avg: combos / turns, turns, floors, minutes, coins: save.coins, frames: save.frames.length, treasures: save.treasures.length, maxCombo: save.stats.maxCombo, log };
}

if (process.argv[1]?.endsWith('sim-puztre.mjs')) {
  const n = Number(process.argv[2] ?? 3);
  const tries = Number(process.argv[3] ?? 120);
  for (let i = 1; i <= n; i++) {
    const r = campaign(i * 7919 + Number(process.argv[4] ?? 0), tries);
    if (r.stuck) console.log(`#${i} ${r.stuck}で行き詰まり`);
    console.log(`#${i} 平均${r.avg.toFixed(1)}コンボ 手数${r.turns} 突破フロア${r.floors} 推定${Math.round(r.minutes)}分 お宝${r.treasures}/${TREASURE_IDS.length} 枠${r.frames} 最大${r.maxCombo}コンボ 残りコイン${r.coins}`);
    console.log('   ', r.log.join(' / '));
  }
  void FLOORS;
}

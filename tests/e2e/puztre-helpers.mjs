// パズトレの E2E 用: 盤面から3つ並びができる動かし方を探して、指で動かす
import { sleep } from './helpers.mjs';

/** ページ内で、いちばん多くコンボになる道すじを探す（自動プレイと同じ探し方） */
export async function findPath(page, tries = 400) {
  return page.evaluate(async (tries) => {
    const R = await import('./rules.js');
    const st = window.__puztre.run;
    const board = st.board.map((row) => row.map((c) => ({ c, id: 0, stone: 0, ice: 0, dark: 0 })));
    let best = null;
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    for (let k = 0; k < tries; k++) {
      let r = Math.floor(rnd() * 5); let c = Math.floor(rnd() * 6);
      const path = [[r, c]];
      const len = 2 + Math.floor(rnd() * 10);
      for (let i = 0; i < len; i++) {
        const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dy, dx]) => [r + dy, c + dx]).filter(([y, x]) => y >= 0 && x >= 0 && y < 5 && x < 6);
        [r, c] = opts[Math.floor(rnd() * opts.length)];
        path.push([r, c]);
      }
      const b = R.cloneBoard(board);
      R.applyPath(b, path);
      const n = R.findGroups(b).length;
      if (!best || n > best.n) best = { path, n };
    }
    return best;
  }, tries);
}
export async function drag(page, path) {
  const at = (rc) => page.evaluate(([r, c]) => window.__puztre.cellCenter(r, c), rc);
  let p0 = await at(path[0]);
  await page.touchscreen.touchStart(p0.x, p0.y);
  await sleep(30);
  for (const rc of path.slice(1)) {
    const p = await at(rc);
    for (let k = 1; k <= 3; k++) { await page.touchscreen.touchMove(p0.x + (p.x - p0.x) * k / 3, p0.y + (p.y - p0.y) * k / 3); await sleep(12); }
    p0 = p;
  }
  await page.touchscreen.touchEnd();
}
/** 1手指す。結果の手数を返す */
export async function playTurn(page) {
  const before = await page.evaluate(() => window.__puztre.run.turn);
  const best = await findPath(page);
  await drag(page, best.path);
  await page.waitForFunction((t) => window.__puztre.run?.turn > t || window.__puztre.scene !== 'battle', { timeout: 15000 }, before);
  await page.waitForFunction(() => window.__puztre.phase !== 'resolve' || window.__puztre.scene !== 'battle', { timeout: 20000 });
  return best.n;
}

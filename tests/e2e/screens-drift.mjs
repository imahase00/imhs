// 漂流発明記の画面確認（iPhone 16 相当・PC幅）: node tests/e2e/screens-drift.mjs
import { join } from 'node:path';
import { serve, launch, IPHONE16, PC, OUT, sleep } from './helpers.mjs';

const srv = await serve();
const browser = await launch();
const errors = [];
const skipTalk = async (page) => {
  for (let k = 0; k < 10 && !(await page.$eval('#talk', (e) => e.hidden)); k++) { await page.click('#talk-skip'); await sleep(150); }
};
const only = process.argv[2];
try {
  for (const [name, vp] of [['iphone', IPHONE16], ['pc', PC]]) {
    if (only && only !== name) continue;
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${name} console: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(srv.url + 'games/drift-1/index.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__drift, { timeout: 15000 });
    await sleep(500);
    await page.screenshot({ path: join(OUT, `dr-${name}-title.png`) });
    await page.click('#title .btn.gold');
    for (const t of [1500, 4000, 8000, 11000, 15000, 20000]) {
      await sleep(t - (t > 1500 ? [1500, 4000, 8000, 11000, 15000][[4000, 8000, 11000, 15000, 20000].indexOf(t)] : 0));
      await page.screenshot({ path: join(OUT, `dr-${name}-op-${t}.png`) });
    }
    await page.waitForFunction(() => !window.__drift.scene, { timeout: 30000 });
    await sleep(300);
    await page.screenshot({ path: join(OUT, `dr-${name}-talk.png`) });
    await skipTalk(page);
    await sleep(500);
    await page.screenshot({ path: join(OUT, `dr-${name}-start.png`) });
    // 残骸へ歩く
    await page.keyboard.down('a'); await page.keyboard.down('w'); await sleep(900); await page.keyboard.up('a'); await page.keyboard.up('w');
    await sleep(800);
    await page.screenshot({ path: join(OUT, `dr-${name}-wreck.png`) });
    await skipTalk(page);
    console.log(name, JSON.stringify(await page.evaluate(() => ({ q: window.__drift.quest, h: window.__drift.hero }))));
    await ctx.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
console.log(errors.length ? errors.join('\n') : 'エラーなし');

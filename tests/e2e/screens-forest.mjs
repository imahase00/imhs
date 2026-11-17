// 森のとりでの画面確認（iPhone 16 相当・PC幅）: node tests/e2e/screens-forest.mjs
import { join } from 'node:path';
import { serve, launch, IPHONE16, PC, OUT, sleep } from './helpers.mjs';

const srv = await serve();
const browser = await launch();
const errors = [];
const skipTalk = async (page) => {
  for (let k = 0; k < 10 && !(await page.$eval('#talk', (e) => e.hidden)); k++) { await page.click('#talk-skip'); await sleep(120); }
};
try {
  for (const [name, vp] of [['iphone', IPHONE16], ['pc', PC]]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${name} console: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(srv.url + 'games/forest-fort/index.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__forestFort, { timeout: 15000 });
    await sleep(300);
    await page.screenshot({ path: join(OUT, `ff-${name}-talk.png`) });
    await skipTalk(page);
    await skipTalk(page);
    // 少し北へ歩いて魔物と戦う
    await page.keyboard.down('w'); await sleep(900); await page.keyboard.up('w');
    await sleep(4000);
    await page.screenshot({ path: join(OUT, `ff-${name}-rest.png`) });
    console.log(name, JSON.stringify(await page.evaluate(() => ({ s: window.__forestFort.save.coins, k: window.__forestFort.save.stats.kills, h: window.__forestFort.hero, e: window.__forestFort.enemies }))));
    await page.click('#btn-wave');
    await sleep(6000);
    await page.screenshot({ path: join(OUT, `ff-${name}-wave.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
console.log(errors.length ? errors.join('\n') : 'エラーなし');

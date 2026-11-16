// 画面確認用スクリーンショット（iPhone 16 相当・PC幅）: node tests/e2e/screens.mjs
import { join } from 'node:path';
import { serve, launch, IPHONE16, IPHONE16_SAFARI, PC, OUT, sleep } from './helpers.mjs';

const srv = await serve();
const browser = await launch();
const errors = [];
try {
  for (const [name, vp] of [['iphone', IPHONE16], ['iphone-safari', IPHONE16_SAFARI], ['pc', PC]]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(srv.url, { waitUntil: 'networkidle0' });
    await sleep(500);
    await page.screenshot({ path: join(OUT, `${name}-launcher.png`) });
    for (const t of ['dark', 'ehon']) {
      await page.evaluate((th) => { document.documentElement.dataset.theme = th; }, t);
      await page.screenshot({ path: join(OUT, `${name}-launcher-${t}.png`) });
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.click('#btn-settings');
    await sleep(300);
    await page.screenshot({ path: join(OUT, `${name}-launcher-settings.png`) });
    await page.goto(srv.url + 'games/merge-journey/index.html', { waitUntil: 'networkidle0' });
    await sleep(600);
    await page.screenshot({ path: join(OUT, `${name}-game-talk.png`) });
    await page.click('#talk-skip');
    await sleep(300);
    for (let k = 0; k < 2; k++) { await page.click('[data-gen="fruit"]'); await sleep(250); }
    await page.screenshot({ path: join(OUT, `${name}-game.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
console.log(errors.length ? errors.join('\n') : 'エラーなし');

// にげろ！とうふ: 見た目の確認用スクリーンショット（場面ごと・タイトル・図鑑など）
import { join } from 'node:path';
import { serve, launch, IPHONE16, PC, OUT, sleep } from './helpers.mjs';

const { url, close } = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.setViewport(process.argv.includes('--pc') ? PC : IPHONE16);
const tag = process.argv.includes('--pc') ? 'pc' : 'ip';
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text()); });
await page.goto(url + 'games/tofu-run/index.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__tofu?.scene === 'title');
await sleep(600);
await page.screenshot({ path: join(OUT, `tofu-${tag}-title.png`) });

// 場面ごとに、障害物が並んだ道を描く（描画モジュールを直接呼ぶ）
for (const [name, d, skin] of [['kitchen', 30, 'kinu'], ['kitchen2', 300, 'momen'], ['table', 520, 'yaki'], ['garden', 1180, 'atsuage'], ['street', 1960, 'kin'], ['night', 2850, 'annin']]) {
  await page.evaluate(async (d, skin) => {
    const R = await import('./render.js');
    const S = await import('./sim.js');
    let c = document.getElementById('shot');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'shot';
      c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:999';
      document.body.append(c);
    }
    const W = innerWidth; const H = innerHeight; const dpr = Math.min(2, devicePixelRatio);
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    const run = S.newRun(7);
    run.d = d; run.nextZ = d + 9;
    S.step(run, 0.001);
    run.picks.push({ kind: 'ice', lane: 1, z: d + 6, y: 0.45 }, { kind: 'katsuo', lane: -1, z: d + 7, y: 0.45 });
    const fx = R.makeFx();
    run.t = 0.4;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.drawGame(g, R.makeView(W, H), run, skin, fx, 0.4, 0.016);
  }, d, skin);
  await page.screenshot({ path: join(OUT, `tofu-${tag}-${name}.png`) });
}
// 遊びの流れ: はじめる → 導入 → 走る（何もしないと最初の土鍋などで崩れる）→ 結果 → 図鑑・とうふ
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__tofu?.scene === 'title');
await page.tap('#btn-run');
for (let i = 0; i < 3; i++) { await sleep(250); await page.tap('#intro'); }
await sleep(2200);
await page.screenshot({ path: join(OUT, `tofu-${tag}-run.png`) });
await page.waitForSelector('#over:not([hidden])', { timeout: 20000 });
await sleep(700);
await page.screenshot({ path: join(OUT, `tofu-${tag}-over.png`) });
await page.tap('#btn-totitle');
await page.tap('#btn-dex');
await sleep(300);
await page.screenshot({ path: join(OUT, `tofu-${tag}-dex.png`) });
await page.tap('#modal .iconbtn');
await page.tap('#btn-skins');
await sleep(300);
await page.screenshot({ path: join(OUT, `tofu-${tag}-skins.png`) });
await browser.close();
await close();
console.log('saved');

// 公開URLでの確認: node tests/e2e/public.mjs [URL]
// 初回起動 → オフライン準備完了 → 全ファイル取得確認 → 冒頭の合成・納品 → オフラインで再起動・保存再開
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { launch, IPHONE16, OUT, sleep } from './helpers.mjs';

const URL0 = process.argv[2] || 'https://imahase00.github.io/imhs/';
const origin = new URL(URL0).origin;
const browser = await launch();
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport(IPHONE16);
const external = [];
const problems = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) external.push(u); });
page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => problems.push(e.message));
const ok = (m) => console.log('  ✔ ' + m);

try {
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('#offline').classList.contains('ready'), { timeout: 60000 });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  assert.equal(scope, URL0);
  ok(`初回起動・オフライン準備完了（SW scope ${scope}）`);

  const res = await page.evaluate(async () => {
    const m = await (await fetch('asset-manifest.json', { cache: 'no-store' })).json();
    const bad = [];
    for (const f of m.files) { const r = await fetch(f, { cache: 'no-store' }); if (!r.ok) bad.push(`${r.status} ${f}`); }
    const man = await (await fetch('manifest.webmanifest')).json();
    return { n: m.files.length, bad, version: m.version, man };
  });
  assert.deepEqual(res.bad, []);
  assert.equal(res.man.name, 'IMHS');
  ok(`公開パスで全${res.n}ファイル取得OK（404なし）・版 ${res.version}`);
  const manifestUrl = await page.$eval('link[rel=manifest]', (l) => l.href);
  const start = new URL(res.man.start_url, manifestUrl).href;
  const scopeM = new URL(res.man.scope, manifestUrl).href;
  assert.equal(start, URL0);
  assert.equal(scopeM, URL0);
  ok(`ホーム画面名 IMHS・開始URL ${start}・scope ${scopeM}`);

  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('[data-play="merge-journey"]')]);
  await page.waitForFunction(() => window.__mergeJourney?.state);
  for (let k = 0; k < 6 && !(await page.$eval('#talk', (e) => e.hidden)); k++) await page.tap('#talk-skip');
  await page.tap('[data-gen="fruit"]');
  await page.tap('[data-gen="fruit"]');
  let s = await page.evaluate(() => window.__mergeJourney.state);
  const idx = s.board.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  await page.tap(`.cell[data-i="${idx[0]}"]`);
  await page.tap(`.cell[data-i="${idx[1]}"]`);
  await page.tap('.card.quest .btn');
  for (let k = 0; k < 6 && !(await page.$eval('#talk', (e) => e.hidden)); k++) await page.tap('#talk-skip');
  s = await page.evaluate(() => window.__mergeJourney.state);
  assert.equal(s.coins, 10);
  ok('通常の入口から 生成→合成→納品（10コイン）');
  await page.waitForFunction(() => !window.__mergeJourney.saving());

  await page.setOfflineMode(true);
  await page.goto(URL0, { waitUntil: 'load' });
  await page.waitForSelector('[data-play="merge-journey"]');
  assert.equal(await page.$eval('[data-play="merge-journey"]', (a) => a.textContent.trim()), 'つづきから');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.tap('[data-play="merge-journey"]')]);
  await page.waitForFunction(() => window.__mergeJourney?.state);
  s = await page.evaluate(() => window.__mergeJourney.state);
  assert.equal(s.coins, 10);
  await page.tap('[data-gen="fruit"]');
  const imgsOk = await page.evaluate(() => [...document.images].filter((i) => i.getAttribute('src')).every((i) => i.complete && i.naturalWidth > 0));
  assert.ok(imgsOk);
  await page.screenshot({ path: join(OUT, 'public-offline.png') });
  ok('オフラインで再起動 → 「つづきから」→ 保存再開・画像表示・生成');
} catch (e) {
  problems.push('FAIL: ' + e.message);
} finally {
  await browser.close();
}
console.log('外部通信:', external.length ? external : 'なし');
const real = problems.filter((p) => !/ERR_INTERNET_DISCONNECTED/.test(p));
console.log('問題:', real.length ? real : 'なし');
if (real.length || external.length) process.exit(1);

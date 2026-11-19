// 漂流発明記の途中の画面（自動プレイで作ったセーブを入れて確認）: node tests/e2e/screens-drift2.mjs
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { serve, launch, IPHONE16, OUT, sleep } from './helpers.mjs';

const srv = await serve();
const browser = await launch();
const errors = [];
const load = (f) => {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  d.seen = [...new Set([...d.seen, ...d.pending, 'opening'])].filter(Boolean);
  d.pending = [];
  return d;
};
async function inject(page, data) {
  await page.goto(srv.url + 'index.html', { waitUntil: 'networkidle0' });
  await page.evaluate((data) => new Promise((res, rej) => {
    const req = indexedDB.open('imhs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('saves');
    req.onsuccess = () => {
      const tx = req.result.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ gameId: 'drift-1', schema: 1, rev: 1, savedAt: new Date().toISOString(), summary: null, data }, 'drift-1');
      tx.oncomplete = () => { req.result.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
  }), data);
}
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console: ${m.text()}`); });
  await page.setViewport(IPHONE16);
  for (const [name, file] of [['parts', 'tests/fixtures/drift-parts.json'], ['ship', 'tests/fixtures/drift-ship.json']]) {
    await inject(page, load(file));
    await page.goto(srv.url + 'games/drift-1/index.html', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__drift, { timeout: 15000 });
    await sleep(2500);
    await page.screenshot({ path: join(OUT, `dr2-${name}-view.png`) });
    // 画面の真ん中あたりの建物をタップ
    // 画面に映っている建物をタップしてカードを出す
    const pt = await page.evaluate(() => {
      const d = window.__drift;
      const vis = d.save.buildings.map((b) => ({ b, p: d.toScreen(b.x, b.y - 40) }))
        .filter(({ b, p }) => b.type !== 'bench' && p.x > 40 && p.x < innerWidth - 40 && p.y > 200 && p.y < innerHeight - 260);
      return vis[0] ? { ...vis[0].p, type: vis[0].b.type } : null;
    });
    if (pt) {
      await page.mouse.click(pt.x, pt.y);
      await sleep(400);
      await page.screenshot({ path: join(OUT, `dr2-${name}-card-${pt.type}.png`) });
      await page.keyboard.press('Escape');
    }
    await page.click('#btn-build');
    await sleep(400);
    await page.screenshot({ path: join(OUT, `dr2-${name}-build.png`) });
    await page.click('#sheet .mitem');
    await sleep(500);
    await page.screenshot({ path: join(OUT, `dr2-${name}-ghost.png`) });
    await page.click('#modebar .btn.ghost');
    await page.click('#btn-map');
    await sleep(300);
    await page.screenshot({ path: join(OUT, `dr2-${name}-map.png`) });
    await page.click('#modal .iconbtn');
  }
  await page.close();
} finally {
  await browser.close();
  await srv.close();
}
console.log(errors.length ? errors.join('\n') : 'エラーなし');

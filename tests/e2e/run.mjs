// ブラウザでの通し確認: node tests/e2e/run.mjs
// docs/ を一時コピーして GitHub Pages と同じ /imhs/ 配下で配信し、実際の画面を操作する。
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { launch, OUT, ROOT, IPHONE16, PC, sleep } from './helpers.mjs';
import { startServer } from '../../tools/serve.mjs';
import * as R from '../../docs/games/merge-journey/rules.js';
import * as S from '../../docs/games/merge-journey/save-schema.js';
import { GAME_ID, SCHEMA } from '../../docs/games/merge-journey/data.js';

const SITE = join(OUT, 'site');
rmSync(SITE, { recursive: true, force: true });
cpSync(join(ROOT, 'docs'), SITE, { recursive: true });
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = '/imhs/';
const URL0 = `http://127.0.0.1:${PORT}${BASE}`;
let server = await startServer(PORT, SITE, BASE);

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(['OK', name, Date.now() - t]);
    console.log(`  ✔ ${name}`);
  } catch (e) {
    results.push(['NG', name, Date.now() - t, e]);
    console.log(`  ✖ ${name}\n    ${e.stack?.split('\n').slice(0, 3).join('\n    ')}`);
  }
}

function backupFile(name, data) {
  const p = join(OUT, name);
  writeFileSync(p, JSON.stringify({ format: 'imhs-backup', gameId: GAME_ID, schema: SCHEMA, exportedAt: new Date().toISOString(), data }));
  return p;
}

const browser = await launch();
const ctx = await browser.createBrowserContext();
const problems = [];
const external = [];
function watch(page, tag) {
  page.on('pageerror', (e) => problems.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${tag} console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${tag} HTTP ${r.status()} ${r.url()}`); });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(`http://127.0.0.1:${PORT}/`) && !/^(data|blob|chrome-extension):/.test(u)) external.push(u);
  });
}

const gameState = (page) => page.evaluate(() => window.__mergeJourney?.state);
const waitSaved = (page) => page.waitForFunction(() => window.__mergeJourney && !window.__mergeJourney.saving(), { timeout: 5000 });
async function skipTalks(page) {
  for (let k = 0; k < 6; k++) {
    if (await page.$eval('#talk', (el) => el.hidden)) return;
    await page.click('#talk-skip');
    await sleep(150);
  }
}
async function cellCenter(page, i) {
  const b = await (await page.$(`.cell[data-i="${i}"]`)).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const itemsOnBoard = (s) => s.board.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);

let page = await ctx.newPage();
watch(page, 'main');
await page.setViewport(PC);

console.log(`IMHS E2E  ${URL0}`);

await step('ランチャー表示・初回は「遊ぶ」・オフライン準備完了', async () => {
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  const label = await page.$eval('[data-play="merge-journey"]', (a) => a.textContent.trim());
  assert.equal(label, '遊ぶ');
  await page.waitForFunction(() => document.querySelector('#offline').classList.contains('ready'), { timeout: 30000 });
  const swUrl = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  assert.equal(swUrl, URL0, 'SWのscopeが公開パス');
});

await step('テーマ切替（ライト→ダーク→絵本）が即時反映・保存', async () => {
  await page.click('#btn-settings');
  await page.waitForSelector('.backup .btn');
  await page.click('[data-theme-opt="dark"]');
  assert.equal(await page.$eval('html', (e) => e.dataset.theme), 'dark');
  await page.click('[data-theme-opt="ehon"]');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('html', (e) => e.dataset.theme), 'ehon');
  await page.click('#btn-settings');
  await page.waitForSelector('.backup .btn');
  await page.click('[data-theme-opt="light"]');
  await page.click('#btn-close');
});

await step('通常の入口から: 生成2回→ドラッグで合成→納品（PC・マウス）', async () => {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-play="merge-journey"]')]);
  await page.waitForSelector('#talk:not([hidden])');
  await skipTalks(page);
  await page.click('[data-gen="fruit"]');
  await page.click('[data-gen="fruit"]');
  let s = await gameState(page);
  const [a, b] = itemsOnBoard(s);
  assert.ok(a !== undefined && b !== undefined, 'りんごが2個');
  const p1 = await cellCenter(page, a);
  const p2 = await cellCenter(page, b);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 8 });
  await page.mouse.up();
  s = await gameState(page);
  assert.deepEqual(s.board[b], { c: 'fruit', l: 2 }, '移動先に1段上');
  assert.equal(s.board[a], null);
  await page.click('.card.quest .btn');
  await skipTalks(page);
  s = await gameState(page);
  assert.equal(s.coins, 10);
  assert.equal(s.quests.komorebi, 1);
  await page.screenshot({ path: join(OUT, 'e2e-after-first-quest.png') });
});

await step('盤面外へのドロップ・異種への移動は品物を保持', async () => {
  await page.click('[data-gen="fruit"]');
  let s = await gameState(page);
  const idx = itemsOnBoard(s);
  const p = await cellCenter(page, idx[0]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 6 });
  await page.mouse.up();
  const s2 = await gameState(page);
  assert.deepEqual(s2.board, s.board, '盤面外ドロップで変化なし');
});

await step('選択→タップで移動・合成（選択表示に名称・段階・次の進化先）', async () => {
  await page.click('[data-gen="fruit"]');
  let s = await gameState(page);
  const ones = s.board.map((x, i) => (x && x.c === 'fruit' && x.l === 1 ? i : -1)).filter((i) => i >= 0);
  await page.click(`.cell[data-i="${ones[0]}"]`);
  const info = await page.$eval('#info', (e) => e.textContent);
  assert.match(info, /りんご/);
  assert.match(info, /Lv\.1/);
  assert.match(info, /りんごのペア/, '発見済みの次段階は名称表示');
  await page.click(`.cell[data-i="${ones[1]}"]`);
  s = await gameState(page);
  assert.deepEqual(s.board[ones[1]], { c: 'fruit', l: 2 });
});

await step('削除と取り消し（UI）', async () => {
  let s = await gameState(page);
  const i = itemsOnBoard(s)[0];
  await page.click(`.cell[data-i="${i}"]`);
  const btns = await page.$$('#info .btn');
  await btns[btns.length - 1].click(); // 手放す
  s = await gameState(page);
  assert.equal(s.board[i], null);
  await page.click('#info .btn'); // 元に戻す
  s = await gameState(page);
  assert.ok(s.board[i]);
  assert.equal(s.lastDeleted, null);
});

await step('保存して再読み込み → 同じ状態で再開', async () => {
  await waitSaved(page);
  const before = await gameState(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mergeJourney?.state);
  const after = await gameState(page);
  assert.deepEqual(after.board, before.board);
  assert.equal(after.coins, before.coins);
});

await step('二重タブ: 2つ目は操作できず案内を表示', async () => {
  const p2 = await ctx.newPage();
  watch(p2, 'tab2');
  await p2.goto(URL0 + 'games/merge-journey/index.html', { waitUntil: 'networkidle0' });
  const txt = await p2.$eval('#modal-panel', (e) => e.textContent);
  assert.match(txt, /別の画面で遊んでいます/);
  assert.equal(await p2.evaluate(() => window.__mergeJourney), undefined);
  await p2.close();
});

await step('ランチャーへ戻ると「つづきから」と島の状況', async () => {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#btn-back')]);
  const label = await page.$eval('[data-play="merge-journey"]', (a) => a.textContent.trim());
  assert.equal(label, 'つづきから');
  assert.match(await page.$eval('.chip', (e) => e.textContent), /こもれび島・旅の途中/);
});

await step('不正なバックアップは拒否し、現在のデータを保持', async () => {
  const bad = backupFile('bad-backup.json', { ...R.newGame(1), board: [] });
  await page.click('#btn-settings');
  await page.waitForSelector('.backup .btn');
  const input = await page.$('#file');
  await page.evaluate(() => { window.__pick = true; });
  await page.$$eval('.backup .btn', (b) => b[1].click()); // ファイルから復元（input.click は無害）
  await input.uploadFile(bad);
  await page.waitForSelector('#confirm:not([hidden])');
  assert.match(await page.$eval('#confirm', (e) => e.textContent), /復元できません/);
  await page.click('#confirm-actions .btn');
  const brokenJson = join(OUT, 'broken.json');
  writeFileSync(brokenJson, '{"format":"imhs-backup",');
  await page.$$eval('.backup .btn', (b) => b[1].click());
  await input.uploadFile(brokenJson);
  await page.waitForSelector('#confirm:not([hidden])');
  assert.match(await page.$eval('#confirm', (e) => e.textContent), /読み取れません/);
  await page.click('#confirm-actions .btn');
  const future = join(OUT, 'future.json');
  writeFileSync(future, JSON.stringify({ format: 'imhs-backup', gameId: GAME_ID, schema: 99, data: {} }));
  await page.$$eval('.backup .btn', (b) => b[1].click());
  await input.uploadFile(future);
  await page.waitForSelector('#confirm:not([hidden])');
  assert.match(await page.$eval('#confirm', (e) => e.textContent), /新しい版/);
  await page.click('#confirm-actions .btn');
});

// しおかぜ島へ渡れる直前の状態（こもれび島5件達成・200コイン）
const preShio = (() => {
  let s = R.newGame(42);
  s.pending = [];
  s.quests.komorebi = 5;
  s.coins = 200;
  s.gens = ['fruit', 'sweet'];
  s.routes = ['shiokaze'];
  s.flags = ['stall', 'teaSeats', 'welcomeParty'];
  s.storage = { cap: 6, items: Array(6).fill(null) };
  s.orders.enabled = true;
  s.dialogues = ['arrive-komorebi', 'k1', 'k2', 'k3', 'k4', 'k5'];
  s.discovered = ['fruit-1', 'fruit-2', 'fruit-3', 'fruit-4', 'fruit-5', 'sweet-1', 'sweet-2', 'sweet-3', 'sweet-4'];
  s = R.normalize(s);
  assert.deepEqual(S.validate(s), []);
  return s;
})();

await step('バックアップ復元: 内容を表示して上書き確認 → 反映', async () => {
  const file = backupFile('pre-shiokaze.json', preShio);
  await page.$$eval('.backup .btn', (b) => b[1].click());
  await (await page.$('#file')).uploadFile(file);
  await page.waitForSelector('#confirm:not([hidden])');
  const txt = await page.$eval('#confirm', (e) => e.textContent);
  assert.match(txt, /こもれび島/);
  assert.match(txt, /200コイン/);
  assert.match(txt, /5\/15/);
  await page.$$eval('#confirm-actions .btn', (b) => b[1].click());
  await page.waitForFunction(() => /復元しました/.test(document.querySelector('#toast').textContent));
});

await step('バックアップ保存（ダウンロード）にゲームID・スキーマ版・日時', async () => {
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT, eventsEnabled: true }).catch(() => {});
  const json = await page.evaluate(async () => {
    const m = await import('./shared/storage.js');
    return m.makeBackup(await m.loadSave('merge-journey'));
  });
  assert.equal(json.gameId, 'merge-journey');
  assert.equal(json.schema, 1);
  assert.ok(json.exportedAt);
  assert.ok(S.parseBackup(json).ok);
  await page.click('#btn-close');
});

await step('オフライン: サーバー停止後も起動し、未訪問の島へ渡れる', async () => {
  await new Promise((r) => server.close(r));
  server.closeAllConnections?.();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-play="merge-journey"]');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('[data-play="merge-journey"]')]);
  await page.waitForFunction(() => window.__mergeJourney?.state);
  await page.click('#btn-map');
  const btn = await page.$$('.isle .btn.gold');
  assert.equal(btn.length, 1, '航路を開くボタン');
  await btn[0].click();
  await page.waitForSelector('#talk:not([hidden])');
  await skipTalks(page);
  const s = await gameState(page);
  assert.equal(s.island, 'shiokaze');
  assert.equal(s.coins, 50);
  assert.ok(s.gens.includes('shell'));
  await page.waitForFunction(() => {
    const img = document.querySelector('#scene-img');
    return img.complete && img.naturalWidth > 0 && /shiokaze/.test(img.src);
  }, { timeout: 5000 });
  await page.click('[data-gen="shell"]');
  // 全画像がキャッシュから読めること
  const broken = await page.evaluate(async () => {
    const m = await (await fetch('../../asset-manifest.json')).json();
    const bad = [];
    for (const f of m.files) { const r = await fetch('../../' + f).catch(() => null); if (!r || !r.ok) bad.push(f); }
    return bad;
  });
  assert.deepEqual(broken, []);
  await page.screenshot({ path: join(OUT, 'e2e-offline-shiokaze.png') });
});

await step('オフラインで再読み込み → 保存再開（島・生産元を保持）', async () => {
  await waitSaved(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__mergeJourney?.state);
  const s = await gameState(page);
  assert.equal(s.island, 'shiokaze');
  assert.equal(s.board.filter((x) => x && x.c === 'shell').length, 1);
});

// 灯台点灯の直前（ほしあかり4件達成・灯火と花冠を所持）
const preEnd = (() => {
  let s = structuredClone(preShio);
  s.unlockedIslands = ['komorebi', 'shiokaze', 'hoshiakari'];
  s.visited = ['komorebi', 'shiokaze', 'hoshiakari'];
  s.routes = ['shiokaze', 'hoshiakari'];
  s.island = 'hoshiakari';
  s.quests = { komorebi: 5, shiokaze: 5, hoshiakari: 4 };
  s.gens = ['fruit', 'sweet', 'shell', 'gear', 'flower', 'light'];
  s.flags.push('invitation', 'dancer', 'pierStall', 'shipSail', 'flowerGuide', 'flowerPath', 'signposts');
  s.board[50] = { c: 'light', l: 6 };
  s.board[51] = { c: 'flower', l: 6 };
  s.discovered.push('light-6', 'flower-6');
  assert.deepEqual(S.validate(s), []);
  return s;
})();

await step('更新: 新版を準備→「更新する」で切替、セーブは継続', async () => {
  server = await startServer(PORT, SITE, BASE);
  // 新しい版を配置（sw.js の版を変える）
  const swp = join(SITE, 'sw.js');
  writeFileSync(swp, readFileSync(swp, 'utf8').replace(/const VERSION = '[^']*';/, "const VERSION = 'e2e-update';"));
  const before = await gameState(page);
  await waitSaved(page);
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#update:not([hidden])', { timeout: 30000 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#btn-update')]);
  await page.waitForFunction(() => document.querySelector('#offline').classList.contains('ready'), { timeout: 30000 });
  assert.match(await page.$eval('#ver', (e) => e.textContent), /e2e-update/);
  const keys = await page.evaluate(() => caches.keys());
  assert.equal(keys.filter((k) => k.startsWith('imhs@')).length, 1, '旧キャッシュを削除');
  assert.ok(keys[0].includes('/imhs/::e2e-update'));
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-play="merge-journey"]')]);
  await page.waitForFunction(() => window.__mergeJourney?.state);
  const after = await gameState(page);
  assert.deepEqual(after.board, before.board, 'セーブはキャッシュ更新と独立');
});

await step('灯台点灯 → エンディング → クリア後も合成・注文・島移動', async () => {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#btn-back')]);
  await page.click('#btn-settings');
  await page.waitForSelector('.backup .btn');
  await page.$$eval('.backup .btn', (b) => b[1].click());
  await (await page.$('#file')).uploadFile(backupFile('pre-ending.json', preEnd));
  await page.waitForSelector('#confirm:not([hidden])');
  await page.$$eval('#confirm-actions .btn', (b) => b[1].click());
  await page.waitForFunction(() => /復元しました/.test(document.querySelector('#toast').textContent));
  await page.click('#btn-close');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-play="merge-journey"]')]);
  await page.waitForFunction(() => window.__mergeJourney?.state);
  await page.click('.card.quest .btn');
  await page.waitForSelector('#talk:not([hidden])');
  // 会話を最後まで「つぎへ」で読む
  for (let k = 0; k < 20 && !(await page.$eval('#talk', (e) => e.hidden)); k++) { await page.click('#talk-next'); await sleep(80); }
  await page.waitForSelector('#modal:not([hidden])');
  assert.match(await page.$eval('#modal-panel', (e) => e.textContent), /灯台に光が灯りました/);
  await page.screenshot({ path: join(OUT, 'e2e-ending.png') });
  await page.click('#modal-panel .actions .btn');
  let s = await gameState(page);
  assert.equal(s.cleared, true);
  assert.ok(await page.$eval('#scene', (e) => e.classList.contains('lit')));
  await page.click('[data-gen="light"]');
  await page.click('.card.order .swap');
  await page.click('#btn-map');
  await page.$$eval('.isle .btn', (b) => b[0].click());
  s = await gameState(page);
  assert.equal(s.island, 'komorebi');
  await page.click('#btn-settings');
  await page.$$eval('#modal-panel .btn', (b) => b[0].click()); // 会話を読み返す
  assert.match(await page.$eval('#modal-panel', (e) => e.textContent), /エピローグ/);
  await page.click('#modal-panel .iconbtn');
  await waitSaved(page);
});

await step('iPhone 16 幅（タッチ）: 56マスが画面内・タップ操作で合成', async () => {
  const p = await ctx.newPage();
  watch(p, 'iphone');
  await page.close();
  await p.setViewport(IPHONE16);
  await p.goto(URL0 + 'games/merge-journey/index.html', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__mergeJourney?.state);
  const geo = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('.cell')];
    const vw = innerWidth, vh = innerHeight;
    const inView = cells.filter((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh; }).length;
    const nav = document.querySelector('.navbar').getBoundingClientRect();
    return { n: cells.length, inView, size: cells[0].getBoundingClientRect().width, navBottom: nav.bottom, vh, sw: document.documentElement.scrollWidth, vw };
  });
  assert.equal(geo.n, 56);
  assert.equal(geo.inView, 56, '56マスすべて表示');
  assert.ok(geo.size >= 44, `マスの大きさ ${geo.size}px`);
  assert.ok(geo.navBottom <= geo.vh, 'メニューまで画面内');
  assert.ok(geo.sw <= geo.vw, '横スクロールなし');
  await p.tap('[data-gen="light"]');
  await p.tap('[data-gen="light"]');
  const s = await gameState(p);
  const ones = s.board.map((x, i) => (x && x.c === 'light' && x.l === 1 ? i : -1)).filter((i) => i >= 0);
  await p.tap(`.cell[data-i="${ones[0]}"]`);
  await p.tap(`.cell[data-i="${ones[1]}"]`);
  const s2 = await gameState(p);
  assert.ok(s2.board.some((x) => x && x.c === 'light' && x.l === 2));
  await p.screenshot({ path: join(OUT, 'e2e-iphone.png') });
  page = p;
});

// ---------------------------------------------------------------- ひだまり菜園
const hgState = (p) => p.evaluate(() => window.__hidamari?.state);
const hgSaved = (p) => p.waitForFunction(() => window.__hidamari && !window.__hidamari.saving(), { timeout: 5000 });
async function hgSkip(p) {
  for (let k = 0; k < 10; k++) {
    if (await p.$eval('#talk', (el) => el.hidden)) return;
    await p.tap('#talk-skip');
    await sleep(120);
  }
}
async function hgSleep(p) {
  const day = (await hgState(p)).day;
  await p.tap('#btn-sleep');
  await sleep(200);
  if (!(await p.$eval('#modal', (e) => e.hidden))) await p.tap('#modal .actions .btn:last-child');
  await p.waitForFunction((d) => window.__hidamari.state.day === d + 1, {}, day);
  await sleep(800);
  await hgSkip(p);
}

await step('ひだまり菜園: ランチャーに2本目として並び、通常の入口から起動（iPhone 16 幅）', async () => {
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  const titles = await page.$$eval('.cover-title b', (b) => b.map((x) => x.textContent));
  assert.deepEqual(titles, ['マージの旅', 'ひだまり菜園', '森のとりで', '漂流発明記 ― 霧の島 ―']);
  // スマホ幅は横スライド: 縦スクロールなしで1枚ずつ、点で切り替え
  const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, overflow: getComputedStyle(document.querySelector('#games')).overflowX }));
  assert.equal(lay.overflow, 'auto');
  assert.ok(lay.sw <= lay.vw, 'ページ全体は横にはみ出さない');
  await page.tap('#pager button:nth-child(2)');
  await page.waitForFunction(() => document.querySelector('#pager button:nth-child(2)').getAttribute('aria-current') === 'true', { timeout: 3000 });
  // スライドが止まるまで待ち、2本目の「遊ぶ」が画面内に収まることを確認
  await page.waitForFunction(() => {
    const r = document.querySelector('[data-play="hidamari-garden"]').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth;
  }, { timeout: 3000 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('[data-play="hidamari-garden"]')]);
  await page.waitForFunction(() => window.__hidamari?.state);
  assert.equal(await page.$eval('#talk', (e) => e.hidden), false, '最初の会話');
  await hgSkip(page);
  const geo = await page.evaluate(() => {
    const plots = [...document.querySelectorAll('.plot')].map((e) => e.getBoundingClientRect());
    return { n: plots.length, w: plots[0].width, right: Math.max(...plots.map((r) => r.right)), vw: innerWidth, sw: document.documentElement.scrollWidth };
  });
  assert.equal(geo.n, 6);
  assert.ok(geo.w >= 90, `畑の大きさ ${geo.w}px`);
  assert.ok(geo.sw <= geo.vw && geo.right <= geo.vw, '横スクロールなし');
});

await step('ひだまり菜園: 種まき→水やり→おやすみ×3→収穫→とよさんへ届ける→作業小屋が開く', async () => {
  for (let i = 0; i < 3; i++) await page.tap(`.plot[data-i="${i}"]`);
  let s = await hgState(page);
  assert.equal(s.plots.filter((p) => p.c === 'carrot').length, 3);
  for (let d = 0; d < 3; d++) {
    for (let i = 0; i < 3; i++) await page.tap(`.plot[data-i="${i}"]`);
    await hgSleep(page);
  }
  assert.equal(await page.$$eval('.plot.ripe', (e) => e.length), 3);
  await page.tap('#btn-harvest-all');
  s = await hgState(page);
  assert.equal(s.inv.carrot, 3);
  const coins = s.coins;
  await page.tap('.card.quest[data-who="toyo"] .btn');
  await sleep(200);
  s = await hgState(page);
  assert.equal(s.quests.toyo, 1);
  assert.equal(s.coins, coins + 20);
  assert.equal(s.bench.length, 1);
  await hgSkip(page);
  await page.tap('#btn-workshop');
  assert.match(await page.$eval('#modal-panel', (e) => e.textContent), /にんじんケーキ/);
  await page.tap('#modal-panel h2 .iconbtn');
  await hgSaved(page);
  await page.screenshot({ path: join(OUT, 'e2e-hidamari.png') });
});

await step('ひだまり菜園: 再読み込みで同じ日・同じかごから再開、ランチャーは「つづきから」', async () => {
  const before = await hgState(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__hidamari?.state);
  const after = await hgState(page);
  assert.equal(after.day, before.day);
  assert.equal(after.coins, before.coins);
  assert.deepEqual(after.quests, before.quests);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('#btn-back')]);
  assert.equal(await page.$eval('[data-play="hidamari-garden"]', (a) => a.textContent.trim()), 'つづきから');
  assert.equal(await page.$eval('[data-play="merge-journey"]', (a) => a.textContent.trim()), 'つづきから', 'マージの旅のセーブは別に残る');
});

await step('ひだまり菜園: バックアップ復元（日付・依頼数を表示）→ 収穫祭 → エンディング', async () => {
  const HG = await import('../../docs/games/hidamari-garden/rules.js');
  const HD = await import('../../docs/games/hidamari-garden/data.js');
  const HS = await import('../../docs/games/hidamari-garden/save-schema.js');
  let s = HG.newGame(5);
  s.day = 128;
  s.coins = 999;
  s.pending = [];
  s.quests = { toyo: 6, sora: 6, yuzu: 6 };
  s.seeds = [...HD.CROP_IDS];
  s.recipes = [...HD.GOOD_IDS];
  s.bench = [{ r: null, left: 0 }, { r: null, left: 0 }, { r: null, left: 0 }];
  s.bigCan = true;
  s.flags = [...HD.FESTIVAL_FLAGS];
  s.decor = ['flowerpot', 'fence', 'bench'];
  s.orders.enabled = true;
  s.dialogues = HD.QUEST_LIST.flatMap((q) => [`${q.id}-intro`, `${q.id}-thanks`]).concat(['opening', 'festivalReady']);
  s = HG.normalize(s);
  assert.deepEqual(HS.validate(s), []);
  const file = join(OUT, 'hidamari-festival.json');
  writeFileSync(file, JSON.stringify({ format: 'imhs-backup', gameId: 'hidamari-garden', schema: 1, exportedAt: new Date().toISOString(), data: s }));
  await page.tap('#btn-settings');
  await page.waitForSelector('.backup');
  const idx = await page.$$eval('.backup', (rows) => rows.findIndex((r) => /ひだまり菜園/.test(r.textContent)));
  assert.ok(idx >= 0, 'バックアップ欄にひだまり菜園');
  await page.evaluate((k) => document.querySelectorAll('.backup')[k].querySelectorAll('.btn')[1].click(), idx);
  await (await page.$('#file')).uploadFile(file);
  await page.waitForSelector('#confirm:not([hidden])');
  const txt = await page.$eval('#confirm', (e) => e.textContent);
  assert.match(txt, /4年目 春 8日目/);
  assert.match(txt, /18\/18/);
  await page.$$eval('#confirm-actions .btn', (b) => b[1].click());
  await page.waitForFunction(() => /復元しました/.test(document.querySelector('#toast').textContent));
  await page.click('#btn-close');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('[data-play="hidamari-garden"]')]);
  await page.waitForFunction(() => window.__hidamari?.state);
  await page.tap('.card.festival .btn');
  await page.waitForSelector('#talk:not([hidden])');
  for (let k = 0; k < 6 && !(await page.$eval('#talk', (e) => e.hidden)); k++) { await page.tap('#talk-next'); await sleep(100); }
  await page.waitForSelector('#modal:not([hidden])');
  assert.match(await page.$eval('#modal-panel', (e) => e.textContent), /はじめての収穫祭/);
  await page.screenshot({ path: join(OUT, 'e2e-hidamari-ending.png') });
  await page.tap('#modal-panel .actions .btn');
  await hgSaved(page);
  assert.equal((await hgState(page)).cleared, true);
  await hgSleep(page);
  assert.equal((await hgState(page)).day, 129, 'クリア後も続けて遊べる');
});

// ---------------------------------------------------------------- 森のとりで
const ffState = (p) => p.evaluate(() => window.__forestFort && { save: window.__forestFort.save, phase: window.__forestFort.phase, hero: window.__forestFort.hero });
async function ffSkip(p) {
  for (let k = 0; k < 12; k++) {
    if (await p.$eval('#talk', (el) => el.hidden)) return;
    await p.tap('#talk-skip');
    await sleep(120);
  }
}
/** キー操作で目的地まで歩く（砦の建物は回り込む必要がない位置を選ぶ） */
async function ffWalkTo(p, x, y) {
  for (let k = 0; k < 80; k++) {
    const h = (await ffState(p)).hero;
    const dx = x - h.x;
    const dy = y - h.y;
    if (Math.hypot(dx, dy) < 30) return;
    const keys = [];
    if (Math.abs(dx) > 20) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 20) keys.push(dy > 0 ? 's' : 'w');
    for (const k2 of keys) await p.keyboard.down(k2);
    await sleep(Math.min(250, Math.max(40, Math.hypot(dx, dy) / 300 * 1000 * 0.6)));
    for (const k2 of keys) await p.keyboard.up(k2);
  }
  throw new Error('目的地に着けません');
}

await step('森のとりで: バックアップ復元 → ランチャーの3本目から起動（iPhone 16 幅）', async () => {
  const FS = await import('../../docs/games/forest-fort/sim.js');
  const FV = await import('../../docs/games/forest-fort/save-schema.js');
  const s = FS.newSave(9);
  s.coins = 500;
  s.pending = [];
  s.seen = ['opening', 'pads'];
  assert.deepEqual(FV.validate(s), []);
  const file = join(OUT, 'forest-500.json');
  writeFileSync(file, JSON.stringify({ format: 'imhs-backup', gameId: 'forest-fort', schema: 1, exportedAt: new Date().toISOString(), data: s }));
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await page.tap('#btn-settings');
  await page.waitForSelector('.backup .btn');
  const idx = await page.$$eval('.backup', (rows) => rows.findIndex((r) => /森のとりで/.test(r.textContent)));
  await page.evaluate((k) => document.querySelectorAll('.backup')[k].querySelectorAll('.btn')[1].click(), idx);
  await (await page.$('#file')).uploadFile(file);
  await page.waitForSelector('#confirm:not([hidden])');
  assert.match(await page.$eval('#confirm', (e) => e.textContent), /500コイン/);
  await page.$$eval('#confirm-actions .btn', (b) => b[1].click());
  await page.waitForFunction(() => /復元しました/.test(document.querySelector('#toast').textContent));
  await page.click('#btn-close');
  await page.tap('#pager button:nth-child(3)');
  await page.waitForFunction(() => {
    const r = document.querySelector('[data-play="forest-fort"]').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth;
  }, { timeout: 3000 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('[data-play="forest-fort"]')]);
  await page.waitForFunction(() => window.__forestFort, { timeout: 15000 });
  await ffSkip(page);
  const st = await ffState(page);
  assert.equal(st.save.coins, 500);
  assert.equal(st.phase, 'rest');
  const geo = await page.evaluate(() => ({ cw: document.querySelector('#view').getBoundingClientRect().width, vw: innerWidth, sw: document.documentElement.scrollWidth }));
  assert.equal(geo.cw, geo.vw);
  assert.ok(geo.sw <= geo.vw);
});

await step('森のとりで: 台座へ歩いて立ち止まる → うさぎの弓兵が仲間に', async () => {
  const D3 = await import('../../docs/games/forest-fort/data.js');
  const pad = D3.PADS.find((p) => p.id === 'rabbit');
  await ffWalkTo(page, pad.x, pad.y);
  await page.waitForFunction(() => window.__forestFort.save.levels.rabbit >= 1, { timeout: 8000 });
  const st = await ffState(page);
  assert.ok(st.save.coins < 500);
  await page.screenshot({ path: join(OUT, 'e2e-forest.png') });
});

await step('森のとりで: ウェーブ開始 → 途中で再読み込みしても強化は残り、ウェーブの前から再開', async () => {
  await page.tap('#btn-wave');
  await page.waitForFunction(() => window.__forestFort.phase === 'wave', { timeout: 5000 });
  await sleep(3000);
  await page.screenshot({ path: join(OUT, 'e2e-forest-wave.png') });
  await page.waitForFunction(() => !window.__forestFort.saving(), { timeout: 5000 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__forestFort, { timeout: 15000 });
  const st = await ffState(page);
  assert.equal(st.phase, 'rest');
  assert.equal(st.save.wave, 1);
  assert.ok(st.save.levels.rabbit >= 1);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('#btn-back')]);
  assert.equal(await page.$eval('[data-play="forest-fort"]', (a) => a.textContent.trim()), 'つづきから');
  // ゲーム一覧（3本）が出ている
  assert.equal(await page.$$eval('#games .card', (c) => c.length), 4);
  // 戻った直後に「確認中…」のまま止まらない
  await page.waitForFunction(() => !/確認中/.test(document.querySelector('#offline-text').textContent), { timeout: 3000 });
});

// ---- 漂流発明記 ----
const drState = (p) => p.evaluate(() => window.__drift && { save: window.__drift.save, hero: window.__drift.hero, quest: window.__drift.quest, mode: window.__drift.mode });
async function drSkip(p) {
  for (let k = 0; k < 12; k++) {
    if (await p.$eval('#talk', (el) => el.hidden)) return;
    await p.tap('#talk-skip');
    await sleep(150);
  }
}
async function drWalkTo(p, x, y, near = 40) {
  for (let k = 0; k < 120; k++) {
    await drSkip(p);   // 目標を果たすと会話が開いて止まるので閉じる
    const h = (await drState(p)).hero;
    const dx = x - h.x;
    const dy = y - h.y;
    if (Math.hypot(dx, dy) < near) return;
    const keys = [];
    if (Math.abs(dx) > 20) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 20) keys.push(dy > 0 ? 's' : 'w');
    for (const k2 of keys) await p.keyboard.down(k2);
    await sleep(Math.min(300, Math.max(40, Math.hypot(dx, dy) / 300 * 1000 * 0.6)));
    for (const k2 of keys) await p.keyboard.up(k2);
  }
  const h = (await drState(p)).hero;
  throw new Error(`目的地に着けません（いま ${Math.round(h.x)},${Math.round(h.y)} → ${x},${y}）`);
}

await step('漂流発明記: ランチャーの4本目から新しく始める → タイトル → 残骸を調べる → 手で木を採る → 再読み込みで続きから', async () => {
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await page.tap('#pager button:nth-child(4)');
  await page.waitForFunction(() => {
    const r = document.querySelector('[data-play="drift-1"]').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth;
  }, { timeout: 3000 });
  assert.equal(await page.$eval('[data-play="drift-1"]', (a) => a.textContent.trim()), '遊ぶ');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('[data-play="drift-1"]')]);
  await page.waitForFunction(() => window.__drift, { timeout: 15000 });
  await page.waitForSelector('#title:not([hidden])');
  await page.tap('#title .btn.ghost');   // オープニングをとばす
  await drSkip(page);
  const D = await import('../../docs/games/drift-1/data.js');
  await drWalkTo(page, D.LANDMARKS.wreck.x + 250, D.LANDMARKS.wreck.y + 200, 60);
  await page.waitForFunction(() => window.__drift.quest >= 1, { timeout: 5000 });
  await drSkip(page);
  const tree = D.NODES.find((n) => n.kind === 'tree' && n.y > 5200 && n.x < 2500);
  await drWalkTo(page, tree.x, tree.y + 90, 40);
  await page.waitForFunction(() => (window.__drift.save.bag.wood ?? 0) >= 2, { timeout: 8000 });
  await page.screenshot({ path: join(OUT, 'e2e-drift-gather.png') });
  await page.waitForFunction(() => !window.__drift.saving(), { timeout: 8000 });
  await sleep(4500);   // 間引いた保存が書き込まれるまで
  await page.waitForFunction(() => !window.__drift.saving(), { timeout: 8000 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__drift, { timeout: 15000 });
  assert.equal(await page.$eval('#title', (e) => e.hidden), true, '続きからはタイトルを出さない');
  const st = await drState(page);
  assert.ok(st.quest >= 1);
  assert.ok((st.save.bag.wood ?? 0) + (st.save.pool.wood ?? 0) >= 1);
});

await step('漂流発明記: 工場の時代のバックアップを復元 → 倉庫をタップ → 「建てる」から倉庫を置く → ランチャーへ戻ると4本並ぶ', async () => {
  const d = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/drift-parts.json'), 'utf8'));
  d.seen = [...new Set(['opening', ...d.seen, ...d.pending])];
  d.pending = [];
  d.pool.plank = 30;
  const DV = await import('../../docs/games/drift-1/save-schema.js');
  assert.deepEqual(DV.validate(d), []);
  const file = join(OUT, 'drift-parts.json');
  writeFileSync(file, JSON.stringify({ format: 'imhs-backup', gameId: 'drift-1', schema: 1, exportedAt: new Date().toISOString(), data: d }));
  await page.goto(URL0, { waitUntil: 'networkidle0' });
  await page.tap('#btn-settings');
  await page.waitForSelector('.backup .btn');
  const idx = await page.$$eval('.backup', (rows) => rows.findIndex((r) => /漂流発明記/.test(r.textContent)));
  assert.ok(idx >= 0);
  await page.evaluate((k) => document.querySelectorAll('.backup')[k].querySelectorAll('.btn')[1].click(), idx);
  await (await page.$('#file')).uploadFile(file);
  await page.waitForSelector('#confirm:not([hidden])');
  assert.match(await page.$eval('#confirm', (e) => e.textContent), /工場の時代/);
  await page.$$eval('#confirm-actions .btn', (b) => b[1].click());
  await page.waitForFunction(() => /復元しました/.test(document.querySelector('#toast').textContent));
  await page.click('#btn-close');
  await page.tap('#pager button:nth-child(4)');
  await sleep(600);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('[data-play="drift-1"]')]);
  await page.waitForFunction(() => window.__drift, { timeout: 15000 });
  await sleep(500);
  const before = (await drState(page)).save.buildings.length;
  // 画面に映っている倉庫をタップ
  const pt = await page.evaluate(() => {
    const dd = window.__drift;
    const b = dd.save.buildings.filter((x) => x.type === 'store').map((x) => dd.toScreen(x.x, x.y - 40)).find((q) => q.x > 20 && q.x < innerWidth - 20 && q.y > 200 && q.y < innerHeight - 200);
    return b ?? null;
  });
  assert.ok(pt, '倉庫が画面に映っている');
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForSelector('#card:not([hidden])');
  assert.match(await page.$eval('#card', (e) => e.textContent), /倉庫/);
  await page.tap('#card .x');
  await page.tap('#btn-build');
  await page.waitForSelector('#sheet:not([hidden])');
  await page.tap('#sheet .mitem');   // 一覧の最初は倉庫
  await page.waitForSelector('#modebar:not([hidden])');
  // 置ける場所を探して何度かタップ
  let ok = false;
  for (const [fx, fy] of [[0.5, 0.35], [0.3, 0.3], [0.7, 0.3], [0.5, 0.25], [0.3, 0.45], [0.7, 0.45]]) {
    const vp = page.viewport();
    await page.touchscreen.tap(vp.width * fx, vp.height * fy);
    await sleep(200);
    if (!(await page.$eval('#modebar .btn.gold', (b) => b.disabled))) { ok = true; break; }
  }
  assert.ok(ok, '置ける場所が見つかる');
  await page.tap('#modebar .btn.gold');
  await page.waitForFunction((n) => window.__drift.save.buildings.length === n + 1, { timeout: 3000 }, before);
  await page.screenshot({ path: join(OUT, 'e2e-drift-build.png') });
  await page.waitForFunction(() => !window.__drift.saving(), { timeout: 8000 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.tap('#btn-back')]);
  assert.equal(await page.$$eval('#games .card', (c) => c.length), 4);
  assert.equal(await page.$eval('[data-play="drift-1"]', (a) => a.textContent.trim()), 'つづきから');
});

await browser.close();
await new Promise((r) => server.close(r));

console.log('\n外部通信:', external.length ? external : 'なし');
const realProblems = problems.filter((p) => !/ERR_CONNECTION_REFUSED|net::ERR_FAILED|Failed to load resource/.test(p));
console.log('エラー・404:', realProblems.length ? realProblems : 'なし');
const ng = results.filter((r) => r[0] === 'NG');
console.log(`\n結果: ${results.length - ng.length}/${results.length} 成功`);
if (ng.length || external.length || realProblems.length) process.exit(1);

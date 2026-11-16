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
  await page.click('[data-theme-opt="dark"]');
  assert.equal(await page.$eval('html', (e) => e.dataset.theme), 'dark');
  await page.click('[data-theme-opt="ehon"]');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('html', (e) => e.dataset.theme), 'ehon');
  await page.click('#btn-settings');
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
});

await browser.close();
await new Promise((r) => server.close(r));

console.log('\n外部通信:', external.length ? external : 'なし');
const realProblems = problems.filter((p) => !/ERR_CONNECTION_REFUSED|net::ERR_FAILED|Failed to load resource/.test(p));
console.log('エラー・404:', realProblems.length ? realProblems : 'なし');
const ng = results.filter((r) => r[0] === 'NG');
console.log(`\n結果: ${results.length - ng.length}/${results.length} 成功`);
if (ng.length || external.length || realProblems.length) process.exit(1);

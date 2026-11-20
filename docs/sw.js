// IMHS Service Worker
// docs/ 全体を対象に、asset-manifest.json に列挙された全ファイルを事前取得する。
// VERSION は tools/build.mjs が内容ハッシュから自動更新する（手で編集しない）。
const VERSION = '59d616a055fe';

const APP = 'imhs';
const SCOPE = self.registration.scope;              // 例: https://user.github.io/imhs/
const PREFIX = `${APP}@${SCOPE}::`;                  // アプリ+公開パスで識別
const CACHE = PREFIX + VERSION;
const MANIFEST = 'asset-manifest.json';

function abs(path) { return new URL(path, SCOPE).href; }

async function readManifest(fromCache) {
  if (fromCache) {
    const cache = await caches.open(CACHE);
    const res = await cache.match(abs(MANIFEST));
    if (res) return res.json();
  }
  const res = await fetch(abs(MANIFEST), { cache: 'no-store' });
  if (!res.ok) throw new Error('manifest ' + res.status);
  return res.json();
}

async function precache() {
  const manifest = await readManifest(false);
  const cache = await caches.open(CACHE);
  const urls = [MANIFEST, ...manifest.files].map(abs);
  // 既に取得済みのものは飛ばす（再試行時）
  const need = [];
  for (const u of urls) { if (!(await cache.match(u))) need.push(u); }
  // 1件ずつ取得（どれかが失敗したら例外 → install 失敗 → 旧版を継続）
  const BATCH = 6;
  for (let i = 0; i < need.length; i += BATCH) {
    await Promise.all(need.slice(i, i + BATCH).map(async (u) => {
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if (!res.ok) throw new Error(`取得失敗 ${res.status} ${u}`);
      await cache.put(u, res);
    }));
  }
}

async function status() {
  try {
    const cache = await caches.open(CACHE);
    const mres = await cache.match(abs(MANIFEST));
    if (!mres) return { version: VERSION, ready: false, missing: -1, total: 0 };
    const manifest = await mres.json();
    let missing = 0;
    for (const f of manifest.files) { if (!(await cache.match(abs(f)))) missing++; }
    return { version: VERSION, ready: missing === 0, missing, total: manifest.files.length };
  } catch (e) {
    return { version: VERSION, ready: false, missing: -1, total: 0, error: String(e) };
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // 同じアプリ・同じ公開パスの旧版だけを削除（他アプリのキャッシュには触れない）
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  const reply = (v) => event.ports[0]?.postMessage(v);
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (msg.type === 'STATUS') {
    event.waitUntil(status().then(reply));
  } else if (msg.type === 'REPAIR') {
    event.waitUntil(precache().then(status, (e) => ({ version: VERSION, ready: false, error: String(e) })).then(reply));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!req.url.startsWith(SCOPE)) return; // 範囲外・外部は扱わない
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let hit = await cache.match(req, { ignoreSearch: true });
    if (!hit && url.pathname.endsWith('/')) {
      hit = await cache.match(url.origin + url.pathname + 'index.html');
    }
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') {
        const fallback = await cache.match(abs('index.html'));
        if (fallback) return fallback;
      }
      throw e;
    }
  })());
});

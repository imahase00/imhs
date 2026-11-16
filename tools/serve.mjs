// 依存なしの簡易静的サーバー（Python が無い環境・自動テスト用）
// 使い方: node tools/serve.mjs [port] [root] [basePath]
//   basePath を指定すると GitHub Pages と同じ「/imhs/」配下での配信を再現できる。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || 8765);
const root = process.argv[3] || fileURLToPath(new URL('../docs', import.meta.url));
const base = (process.argv[4] || '/').replace(/\/?$/, '/');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export function startServer(p = port, r = root, b = base) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = decodeURIComponent(url.pathname);
      if (!path.startsWith(b)) { res.writeHead(404).end('not found'); return; }
      path = path.slice(b.length - 1);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(r, path));
      if (!file.startsWith(normalize(r))) { res.writeHead(403).end(); return; }
      const st = await stat(file).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404).end('not found'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then(() => {
    console.log(`IMHS を配信中: http://127.0.0.1:${port}${base}`);
    console.log('このウィンドウを閉じるとサーバーが止まります。');
  }).catch((e) => {
    console.error(e.code === 'EADDRINUSE' ? `ポート ${port} は使用中です。` : e.message);
    process.exit(1);
  });
}

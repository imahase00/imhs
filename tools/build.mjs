// docs/ の同梱資産リスト（asset-manifest.json）を生成し、sw.js の VERSION を内容ハッシュで更新する。
// ファイルを追加・変更したら公開前に必ず実行:  node tools/build.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
// SW本体・資産リスト自身・Pages設定ファイルは事前取得の対象外
const EXCLUDE = new Set(['sw.js', 'asset-manifest.json', '.nojekyll']);

export function listFiles(dir = DOCS) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else {
      const rel = relative(DOCS, p).split(sep).join('/');
      if (!EXCLUDE.has(rel) && !name.startsWith('.')) out.push(rel);
    }
  }
  return out.sort();
}

export function computeVersion(files) {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f + '\0');
    h.update(readFileSync(join(DOCS, f)));
  }
  return h.digest('hex').slice(0, 12);
}

export function build() {
  const files = listFiles();
  const version = computeVersion(files);
  const manifest = { app: 'imhs', version, files };
  writeFileSync(join(DOCS, 'asset-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  const swPath = join(DOCS, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  const next = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
  if (next === sw && !sw.includes(`'${version}'`)) throw new Error('sw.js に VERSION 行が見つかりません');
  writeFileSync(swPath, next);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const m = build();
  const bytes = m.files.reduce((a, f) => a + statSync(join(DOCS, f)).size, 0);
  console.log(`asset-manifest.json: ${m.files.length} ファイル / ${(bytes / 1024 / 1024).toFixed(2)} MB / 版 ${m.version}`);
}

// 同梱資産リスト・カタログ・素材パスの検査（ゲームを追加したときの漏れも検出）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, computeVersion } from '../tools/build.mjs';
import * as D from '../docs/games/merge-journey/data.js';

const DOCS = fileURLToPath(new URL('../docs', import.meta.url));
const read = (p) => readFileSync(join(DOCS, p), 'utf8');
const manifest = JSON.parse(read('asset-manifest.json'));

test('asset-manifest.json が docs/ の全ファイルと一致し、版が最新（node tools/build.mjs 実行済み）', () => {
  assert.deepEqual(manifest.files, listFiles());
  assert.equal(manifest.version, computeVersion(manifest.files));
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${manifest.version}';`));
});

test('games.json の全ゲームの起動先・表紙・検証モジュールが同梱資産に含まれる', () => {
  const cat = JSON.parse(read('games.json'));
  const ids = new Set();
  for (const g of cat.games) {
    assert.ok(/^[a-z0-9-]+$/.test(g.id), g.id);
    assert.ok(!ids.has(g.id), '重複ID');
    ids.add(g.id);
    for (const k of ['entry', 'cover', 'saveModule']) {
      assert.ok(!g[k].startsWith('/') && !/^https?:/.test(g[k]), `${k} は相対パス`);
      assert.ok(manifest.files.includes(g[k]), `${g.id}.${k} = ${g[k]} が資産リストにない`);
    }
    // ゲームフォルダ内の全ファイルが含まれる
    const dir = g.entry.split('/').slice(0, -1).join('/') + '/';
    assert.ok(manifest.files.some((f) => f.startsWith(dir)));
  }
});

test('マージの旅: 36品目・6生産元・3背景がすべて存在し、資産リストに含まれる', () => {
  const base = 'games/merge-journey/';
  const paths = [];
  for (const c of D.CHAIN_IDS) {
    for (let l = 1; l <= 6; l++) paths.push(base + D.itemImg(c, l));
    paths.push(base + D.genImg(c));
  }
  for (const i of D.ISLANDS) paths.push(base + i.bg);
  assert.equal(paths.length, 45);
  for (const p of paths) {
    assert.ok(existsSync(join(DOCS, p)), `${p} がない`);
    assert.ok(manifest.files.includes(p), `${p} が資産リストにない`);
  }
});

test('HTML/CSS/JS に外部URL・絶対パス・個人パスを含まない', () => {
  for (const f of manifest.files.filter((x) => /\.(html|css|js|json|webmanifest)$/.test(x))) {
    const t = read(f);
    assert.ok(!/(src|href)=["']https?:\/\//.test(t), `${f}: 外部URL`);
    assert.ok(!/url\(\s*["']?https?:/.test(t), `${f}: 外部CSS URL`);
    assert.ok(!/(src|href)=["']\//.test(t), `${f}: ルート絶対パス`);
    assert.ok(!/[A-Z]:\\+Users\\+/i.test(t), `${f}: 個人パス`);
  }
});

test('マニフェスト: 名前IMHS・相対の開始URLとscope・アイコンが存在', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'IMHS');
  assert.equal(m.short_name, 'IMHS');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  for (const i of m.icons) assert.ok(manifest.files.includes(i.src), i.src);
  assert.ok(existsSync(join(DOCS, '.nojekyll')));
});

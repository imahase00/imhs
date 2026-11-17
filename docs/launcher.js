// IMHS ランチャー
import { getTheme, setTheme, applyTheme, THEMES, THEME_LABELS } from './shared/settings.js';
import {
  loadSave, writeSave, withGameLock, makeBackup, downloadJSON, readFileText,
} from './shared/storage.js';
import { initServiceWorker, repair } from './shared/sw-client.js';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

applyTheme();
let games = [];
let sw = null;

// ---- ゲームカード ----
async function renderGames() {
  const box = $('games');
  const cards = [];
  for (const g of games) {
    let rec = null;
    try { rec = await loadSave(g.id); } catch { /* 保存領域が使えない環境 */ }
    const label = rec?.summary?.label;
    const detail = h('div', { class: 'details', hidden: true }, ...(g.description || []).map((t) => h('p', { text: t })));
    const detailBtn = h('button', {
      class: 'btn ghost', type: 'button', 'aria-expanded': 'false',
      onclick: (e) => {
        detail.hidden = !detail.hidden;
        e.currentTarget.setAttribute('aria-expanded', String(!detail.hidden));
        e.currentTarget.textContent = detail.hidden ? 'ゲーム詳細' : '詳細を閉じる';
      },
    }, 'ゲーム詳細');
    cards.push(h('article', { class: 'card', 'data-game': g.id },
      h('div', { class: 'cover' },
        h('img', { src: g.cover, alt: '', decoding: 'async' }),
        h('div', { class: 'cover-title' }, h('b', { text: g.title }), h('span', { text: g.subtitle })),
        label ? h('span', { class: 'chip', text: label }) : null),
      h('div', { class: 'card-body' },
        h('a', { class: 'btn big', href: g.entry, 'data-play': g.id }, rec ? 'つづきから' : '遊ぶ'),
        detailBtn,
        detail)));
  }
  box.replaceChildren(...cards);
}

// ---- オフライン表示 ----
function setOffline(s) {
  const el = $('offline');
  const text = $('offline-text');
  const detail = $('offline-detail');
  el.classList.remove('ready', 'warn');
  el.querySelector('button')?.remove();
  const retryBtn = () => h('button', { class: 'btn ghost small', type: 'button', onclick: doRepair }, '再試行');
  switch (s.state) {
    case 'ready':
      el.classList.add('ready');
      text.textContent = 'オフライン準備完了';
      detail.textContent = `全${s.total}ファイルをこの端末に保存済みです。通信がなくても遊べます。`;
      break;
    case 'preparing':
    case 'notready':
      text.textContent = 'オフライン用のデータを準備中…';
      detail.textContent = '初回は3島分の画像などを取得しています。通信がある状態でしばらくお待ちください。';
      break;
    case 'incomplete':
      el.classList.add('warn');
      text.textContent = s.missing > 0 ? `オフライン用データが${s.missing}件不足しています` : 'オフライン用データを確認できません';
      el.append(retryBtn());
      detail.textContent = '通信がある状態で「再試行」を押してください。';
      break;
    case 'unsupported':
      el.classList.add('warn');
      text.textContent = 'このブラウザではオフライン保存に対応していません';
      detail.textContent = 'Safari / Chrome / Edge の最新版で開いてください（file:// では動作しません）。';
      break;
    default:
      el.classList.add('warn');
      text.textContent = 'オフライン準備に失敗しました';
      el.append(retryBtn());
      detail.textContent = '通信状態を確認して「再試行」を押してください。';
  }
}

async function doRepair() {
  setOffline({ state: 'preparing' });
  const r = await repair();
  if (r) setOffline(r.ready ? { state: 'ready', ...r } : { state: 'incomplete', ...r });
  else if (sw) await sw.refresh();
  else location.reload();
}

// ---- 設定 ----
function renderThemes() {
  const cur = getTheme();
  $('themes').replaceChildren(...THEMES.map((t) => h('button', {
    class: 'theme-opt', type: 'button', role: 'radio', 'aria-checked': String(t === cur), 'data-theme-opt': t,
    onclick: () => { setTheme(t); renderThemes(); },
  }, h('span', { class: `swatch ${t}` }), h('span', { text: THEME_LABELS[t] }))));
}

async function renderBackups() {
  const kids = [];
  for (const g of games) {
    let rec = null;
    try { rec = await loadSave(g.id); } catch { /* */ }
    kids.push(h('div', { class: 'backup' },
      h('b', { text: g.title }),
      h('small', { text: rec ? `最終保存: ${fmtDate(rec.savedAt)}${rec.summary?.label ? '・' + rec.summary.label : ''}` : 'セーブはまだありません' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', disabled: rec ? null : true, onclick: () => exportBackup(g) }, 'バックアップを保存'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => pickRestore(g) }, 'ファイルから復元'))));
  }
  $('backups').replaceChildren(...kids);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '不明' : d.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

async function exportBackup(g) {
  const rec = await loadSave(g.id);
  if (!rec) { toast('セーブがありません'); return; }
  const obj = makeBackup(rec);
  const name = `imhs-backup-${g.id}-${stamp()}.json`;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && navigator.canShare) {
    try {
      const file = new File([JSON.stringify(obj, null, 1)], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        toast('バックアップを共有しました（「ファイルに保存」がおすすめです）');
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  downloadJSON(obj, name);
  toast('バックアップを保存しました');
}

let restoreTarget = null;
function pickRestore(g) {
  restoreTarget = g;
  $('file').value = '';
  $('file').click();
}

$('file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  const g = restoreTarget;
  if (!file || !g) return;
  let obj;
  try {
    if (file.size > 2_000_000) throw new Error('size');
    obj = JSON.parse(await readFileText(file));
  } catch {
    showConfirm('復元できません', [h('p', { text: 'ファイルを読み取れませんでした。IMHSのバックアップ（.json）を選んでください。' })], null);
    return;
  }
  let mod;
  try { mod = await import(new URL(g.saveModule, location.href).href); } catch {
    toast('検証用のファイルを読み込めませんでした');
    return;
  }
  const r = mod.parseBackup(obj);
  if (!r.ok) {
    showConfirm('復元できません', [h('p', { text: r.error }), h('p', { class: 'note', text: '現在のデータは変更していません。' })], null);
    return;
  }
  const cur = await loadSave(g.id).catch(() => null);
  const body = [
    h('p', { text: `${g.title}のデータを、次のバックアップで上書きします。` }),
    h('dl', { class: 'kv' }, ...r.info.rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
    h('p', { class: 'note', text: cur ? `現在のデータ（${cur.summary?.label ?? ''}・${fmtDate(cur.savedAt)}）は上書きされ、直前版として1つだけ残ります。` : '現在この端末にセーブはありません。' }),
  ];
  showConfirm('バックアップから復元', body, {
    label: '上書きして復元',
    fn: async () => {
      const done = await withGameLock(g.id, async () => {
        const now = await loadSave(g.id);
        await writeSave(g.id, { schema: mod.SCHEMA, data: r.data, summary: summaryOf(r) }, now ? now.rev : null);
        return true;
      }).catch((err) => { console.warn(err); return 'error'; });
      if (done === null) toast('ゲームが別のタブで開かれています。閉じてからもう一度お試しください。');
      else if (done === 'error') toast('復元に失敗しました。データは変更されていません。');
      else { toast('復元しました'); renderGames(); renderBackups(); }
    },
  });
});

function summaryOf(r) {
  return { label: r.info.label, coins: r.info.coins };
}

function showConfirm(title, body, ok) {
  $('confirm-title').textContent = title;
  $('confirm-body').replaceChildren(...body);
  const close = () => { $('confirm').hidden = true; };
  const acts = [h('button', { class: 'btn ghost small', type: 'button', onclick: close }, ok ? 'やめる' : '閉じる')];
  if (ok) acts.push(h('button', { class: 'btn small', type: 'button', onclick: () => { close(); ok.fn(); } }, ok.label));
  $('confirm-actions').replaceChildren(...acts);
  $('confirm').hidden = false;
}

function openSettings() {
  renderThemes();
  renderBackups();
  $('modal').hidden = false;
  $('btn-close').focus();
}
function closeSettings() { $('modal').hidden = true; }
$('btn-settings').addEventListener('click', openSettings);
$('btn-close').addEventListener('click', closeSettings);
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeSettings(); });
$('confirm').addEventListener('click', (e) => { if (e.target.id === 'confirm') $('confirm').hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('confirm').hidden) $('confirm').hidden = true;
  else if (!$('modal').hidden) closeSettings();
});
$('btn-repair').addEventListener('click', doRepair);

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ---- 起動 ----
async function boot() {
  try {
    const res = await fetch('games.json');
    games = (await res.json()).games;
  } catch {
    $('games').textContent = 'ゲーム一覧を読み込めませんでした。';
    return;
  }
  await renderGames();
  // ゲームから戻ったとき（bfcache 復帰を含む）に表示を更新
  window.addEventListener('pageshow', (e) => { if (e.persisted) renderGames(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderGames(); });
  sw = await initServiceWorker('sw.js', {
    onStatus: (s) => { setOffline(s); if (s.version) $('ver').textContent = `版 ${s.version}`; },
    onUpdate: () => { $('update').hidden = false; },
  });
  $('btn-update').addEventListener('click', () => {
    // ゲームは操作ごとに保存済み。ランチャー上なので切替は安全。
    if (!sw?.applyUpdate()) location.reload();
  });
}
boot();

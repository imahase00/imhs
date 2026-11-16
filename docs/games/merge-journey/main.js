// マージの旅: 画面と操作
import {
  GAME_ID, SCHEMA, BOARD_SIZE, MAX_LEVEL, STORAGE_MAX, CHAINS, CHAIN_IDS, ISLANDS, islandById,
  itemName, itemImg, genImg, itemKey, DIALOGUES,
} from './data.js';
import * as R from './rules.js';
import { upgrade, validate } from './save-schema.js';
import { audio } from './audio.js';
import {
  loadSave, loadPrevSave, writeSave, holdGameLock, ConflictError,
} from '../../shared/storage.js';
import { getAudioSettings, setAudioSettings } from '../../shared/settings.js';
import { initServiceWorker } from '../../shared/sw-client.js';

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

// ---- 状態 ----
let state = null;
let rev = null;           // 保存済みレコードの rev（null = 未保存）
let sel = null;           // 選択中 {z:'b'|'s', i}
let storageOpen = false;
let blocked = false;      // 競合・ロック不可などで操作停止
let lastTick = performance.now();
const anim = new Map();   // 盤面インデックス → アニメーションクラス

// ---- 保存（操作確定ごと。直列化して最新だけを書き込む） ----
let saving = false;
let dirty = false;
async function persist() {
  dirty = true;
  if (saving || blocked) return;
  saving = true;
  while (dirty && !blocked) {
    dirty = false;
    const snap = state;
    try {
      rev = await writeSave(GAME_ID, { schema: SCHEMA, data: snap, summary: R.saveSummary(snap) }, rev);
      $('save-banner').hidden = true;
    } catch (e) {
      if (e instanceof ConflictError) {
        blocked = true;
        showConflict();
      } else {
        showSaveError(e);
        dirty = true;
        break; // 次の操作または再試行で再度保存
      }
    }
  }
  saving = false;
}

function showSaveError(e) {
  const b = $('save-banner');
  b.replaceChildren(
    h('span', { text: '保存できませんでした。端末の空き容量やプライベートモードを確認してください。' }),
    h('button', { class: 'btn small', type: 'button', onclick: () => persist() }, '再試行'),
  );
  b.hidden = false;
  console.warn('save failed', e);
}

function showConflict() {
  openModal('データが更新されました', [
    h('p', { text: '別のタブやランチャー（バックアップ復元）でこのゲームのデータが更新されました。上書きを防ぐため、この画面では保存を止めています。' }),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, '再読み込みする')),
  ], { closable: false });
}

// ---- 操作の確定 ----
function tickPlay(s) {
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (dt > 0 && dt < 120000) s.stats.playMs += Math.round(dt);
}

function commit(r) {
  if (blocked) return false;
  if (!r.ok) {
    if (r.msg) { toast(r.msg); audio.sfx('deny'); }
    return false;
  }
  tickPlay(r.state);
  state = r.state;
  handleEvents(r.events);
  if (sel && !getItem(sel)) sel = null;
  render();
  persist();
  if (r.msg) toast(r.msg);
  maybeTalk();
  return true;
}

function handleEvents(events) {
  let sound = null;
  for (const e of events) {
    switch (e.type) {
      case 'generate': anim.set(e.i, 'spawn'); sound ??= 'generate'; break;
      case 'merge': if (e.dst.z === 'b') anim.set(e.dst.i, 'pop'); sound = 'merge'; break;
      case 'restore': if (e.loc.z === 'b') anim.set(e.loc.i, 'spawn'); break;
      case 'remove': sound = 'remove'; break;
      case 'deliver':
        sound = 'deliver';
        $('coins').classList.remove('bump'); void $('coins').offsetWidth; $('coins').classList.add('bump');
        break;
      case 'unlock':
        sound = 'fanfare';
        if (e.what === 'gen') setTimeout(() => toast(`${CHAINS[e.c].gen}が使えるようになりました！`), 1600);
        if (e.what === 'route') setTimeout(() => toast(`新しい航路「${islandById(e.island).name}」を発見！ 島マップを見てみましょう`), 1600);
        break;
      case 'travel': audio.setSong(e.island); break;
      default:
    }
  }
  if (sound) audio.sfx(sound);
}

// ---- 盤面 ----
const boardEl = $('board');
const cells = [];
function buildBoard() {
  for (let i = 0; i < BOARD_SIZE; i++) {
    const c = h('div', { class: 'cell', 'data-z': 'b', 'data-i': i, role: 'gridcell' });
    cells.push(c);
    boardEl.append(c);
  }
}

const getItem = (loc) => (loc.z === 'b' ? state.board[loc.i] : state.storage.items[loc.i]) ?? null;
const sameLoc = (a, b) => a && b && a.z === b.z && a.i === b.i;

function paintSlot(el, item, loc) {
  const want = item ? itemImg(item.c, item.l) : '';
  let img = el.querySelector('img');
  if (item) {
    if (!img) { img = h('img', { alt: '', draggable: 'false', decoding: 'async' }); el.append(img); }
    if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    img.alt = `${itemName(item.c, item.l)} Lv.${item.l}`;
  } else if (img) img.remove();
  el.classList.toggle('lv6', !!item && item.l === MAX_LEVEL);
  el.classList.toggle('sel', sameLoc(sel, loc));
  const selItem = sel && getItem(sel);
  el.classList.toggle('match', !!(selItem && item && !sameLoc(sel, loc) && item.c === selItem.c && item.l === selItem.l && item.l < MAX_LEVEL));
  el.setAttribute('aria-label', item ? `${itemName(item.c, item.l)} Lv.${item.l}` : '空き');
}

function renderBoard() {
  state.board.forEach((item, i) => {
    const el = cells[i];
    paintSlot(el, item, { z: 'b', i });
    el.classList.remove('pop', 'spawn');
    const a = anim.get(i);
    if (a) { void el.offsetWidth; el.classList.add(a); }
  });
  anim.clear();
}

// ---- 風景・依頼・注文 ----
function renderScene() {
  const isl = islandById(state.island);
  const scene = $('scene');
  scene.dataset.island = isl.id;
  const img = $('scene-img');
  if (img.getAttribute('src') !== isl.bg) img.setAttribute('src', isl.bg);
  img.alt = `${isl.name}の${isl.sceneTitle}`;
  scene.classList.toggle('lit', isl.id === 'hoshiakari' && state.flags.includes('lighthouseLit'));
  $('island-name').textContent = isl.name;
  $('coin-num').textContent = state.coins.toLocaleString('ja-JP');
  $('landmarks').replaceChildren(...isl.landmarks.filter((m) => state.flags.includes(m.flag))
    .map((m) => h('span', { class: 'landmark', text: m.label })));
  const p = R.islandProgress(state, isl.id);
  $('progress').replaceChildren(
    h('span', { text: '依頼' }),
    h('span', { class: 'seg' }, ...Array.from({ length: p.total }, (_, k) => h('i', { class: k < p.done ? 'on' : '' }))),
    h('span', { text: `${p.done}/${p.total}` }),
  );
}

function reqIcons(req) {
  return h('div', { class: 'reqs' }, ...R.reqStatus(state, req).map((r) => h('div', {
    class: 'req' + (r.have >= r.n ? ' ok' : ''),
    title: `${itemName(r.c, r.l)} Lv.${r.l} ×${r.n}`,
  }, h('img', { src: itemImg(r.c, r.l), alt: `${itemName(r.c, r.l)} Lv.${r.l}`, class: state.discovered.includes(itemKey(r.c, r.l)) ? '' : 'silhouette' }),
  h('b', { text: `${Math.min(r.have, r.n)}/${r.n}` }))));
}
const reward = (n) => h('span', { class: 'reward' }, h('i', { class: 'coin' }), String(n));
const reqText = (req) => req.map((r) => `${itemName(r.c, r.l)}(Lv.${r.l})×${r.n}`).join('、');

function renderCards() {
  const box = $('cards');
  const kids = [];
  const q = R.currentQuest(state);
  const hint = R.tutorialHint(state);
  if (q) {
    const can = R.canFulfill(state, q.req);
    const btn = h('button', {
      class: 'btn' + (can ? '' : ' wait') + (hint?.target === 'quest' ? ' pulse' : ''), type: 'button',
      'aria-label': `${q.title}に納品（${reqText(q.req)}）`,
      onclick: (ev) => {
        if (!R.canFulfill(state, q.req)) { toast(`必要: ${reqText(q.req)}`); audio.sfx('deny'); return; }
        ev.currentTarget.disabled = true;
        commit(R.deliverQuest(state, q.id));
      },
    }, can ? '納品' : 'あと少し');
    kids.push(h('article', { class: 'card quest' },
      h('div', { class: 'card-title' }, h('span', { class: 'flag', text: '⚑' }), q.title,
        h('small', { class: 'qnum', text: `（${R.islandProgress(state, state.island).done + 1}/5）` })),
      h('div', { class: 'ask', text: `${q.from}「${q.ask}」` }),
      h('div', { class: 'card-row' }, reqIcons(q.req), reward(q.coins)),
      btn));
  } else {
    const next = ISLANDS.find((i) => state.routes.includes(i.id) && !state.unlockedIslands.includes(i.id));
    const msg = state.cleared
      ? (state.island === 'hoshiakari' ? '灯台に光が灯りました。島の暮らしを楽しみましょう。' : 'この島の依頼はすべて達成！ 通常注文や図鑑集めを楽しめます。')
      : next ? `この島の依頼はすべて達成！ 島マップから${next.name}へ（${next.unlockCost}コイン）。`
        : 'この島の依頼はすべて達成！ 島マップから次の島へ。';
    kids.push(h('article', { class: 'card quest done-all' }, h('div', { text: msg })));
  }
  if (state.orders.enabled) {
    state.orders.slots.forEach((o, slot) => {
      if (!o) return;
      const can = R.canFulfill(state, o.req);
      kids.push(h('article', { class: 'card order' },
        h('div', { class: 'card-title', text: slot === 0 ? '小さな注文' : '注文' }),
        h('div', { class: 'card-row' }, reqIcons(o.req), reward(o.coins)),
        h('div', { class: 'card-actions' },
          h('button', {
            class: 'btn' + (can ? '' : ' wait'), type: 'button', 'aria-label': `注文に納品（${reqText(o.req)}）`,
            onclick: (ev) => {
              if (!R.canFulfill(state, o.req)) { toast(`必要: ${reqText(o.req)}`); audio.sfx('deny'); return; }
              ev.currentTarget.disabled = true;
              commit(R.deliverOrder(state, slot));
            },
          }, can ? '納品' : 'あと少し'),
          h('button', {
            class: 'btn ghost swap', type: 'button', title: '別の注文に入れ替え（無料）', 'aria-label': '別の注文に入れ替え（無料）',
            onclick: () => { audio.sfx('page'); commit(R.replaceOrder(state, slot)); },
          }, '↻'))));
    });
  }
  box.classList.toggle('solo', kids.length === 1);
  box.replaceChildren(...kids);
}

// ---- 選択中の品物・生産元 ----
function renderInfo() {
  const box = $('info');
  const item = sel && getItem(sel);
  if (!item) {
    const kids = [h('div', { class: 'info-empty', text: '品物をタップすると、名前と次の進化先が見られます。' })];
    if (state.lastDeleted) {
      const d = state.lastDeleted.item;
      kids.push(h('div', { class: 'info-actions' }, h('button', {
        class: 'btn ghost', type: 'button', onclick: () => commit(R.undoRemove(state)),
      }, `元に戻す（${itemName(d.c, d.l)}）`)));
    }
    box.replaceChildren(...kids);
    return;
  }
  const next = item.l < MAX_LEVEL ? { c: item.c, l: item.l + 1 } : null;
  const known = next && state.discovered.includes(itemKey(next.c, next.l));
  const actions = [];
  if (sel.z === 'b') {
    actions.push(h('button', {
      class: 'btn ghost', type: 'button', disabled: state.storage.cap === 0 ? true : null,
      title: state.storage.cap === 0 ? '収納は2つ目の依頼で使えるようになります' : '',
      onclick: () => { const i = sel.i; sel = null; commit(R.store(state, i)); },
    }, 'しまう'));
  } else {
    actions.push(h('button', { class: 'btn ghost', type: 'button', onclick: () => { const i = sel.i; sel = null; commit(R.takeOut(state, i)); } }, '盤面へ'));
  }
  actions.push(h('button', {
    class: 'btn ghost', type: 'button',
    onclick: () => {
      const loc = sel; sel = null;
      if (commit(R.removeItem(state, loc))) {
        toast(`${itemName(item.c, item.l)}を手放しました`, { label: '元に戻す', fn: () => commit(R.undoRemove(state)) });
      }
    },
  }, '手放す'));
  box.replaceChildren(
    h('div', { class: 'info-main' },
      h('img', { src: itemImg(item.c, item.l), alt: '' }),
      h('div', { class: 'info-name' }, itemName(item.c, item.l), h('small', { text: `Lv.${item.l}` }))),
    h('div', { class: 'info-next' }, next
      ? [h('span', { text: '次:' }), h('img', { src: itemImg(next.c, next.l), alt: '', class: known ? '' : 'silhouette' }),
        h('span', { text: known ? itemName(next.c, next.l) : '？？？' })]
      : h('span', { text: '最高段階です ★' })),
    h('div', { class: 'info-actions' }, actions),
  );
}

function renderGens() {
  const hint = R.tutorialHint(state);
  const kids = CHAIN_IDS.filter((c) => state.gens.includes(c)).map((c) => h('button', {
    class: 'gen' + (hint?.target === 'gen' && c === 'fruit' ? ' pulse' : ''), type: 'button', 'data-gen': c,
    'aria-label': `${CHAINS[c].gen}：タップで${itemName(c, 1)}を生成`,
    onclick: (ev) => {
      audio.unlock();
      const el = ev.currentTarget;
      if (commit(R.generate(state, c))) { el.classList.remove('tap'); void el.offsetWidth; el.classList.add('tap'); }
    },
  }, h('img', { src: genImg(c), alt: '' }), h('span', { text: state.gens.length > 3 ? CHAINS[c].label : CHAINS[c].gen })));
  $('gens').classList.toggle('many', kids.length > 3);
  $('gens').replaceChildren(...kids);
}

function renderNav() {
  const cap = state.storage.cap;
  $('btn-storage').classList.toggle('locked', cap === 0);
  $('storage-count').textContent = cap ? `${state.storage.items.filter(Boolean).length}/${cap}` : '';
  $('codex-count').textContent = `${state.discovered.length}/36`;
  const buyable = ISLANDS.some((i) => R.islandStatus(state, i.id) === 'buyable');
  const badge = $('map-badge');
  badge.textContent = buyable ? '!' : '';
  badge.classList.toggle('badge', buyable);
}

function renderHint() {
  const hint = R.tutorialHint(state);
  const el = $('hint');
  if (!hint || state.pending.length) { el.hidden = true; return; }
  el.textContent = hint.text;
  el.hidden = false;
}

function renderStorage() {
  const sheet = $('storage-sheet');
  sheet.hidden = !storageOpen;
  if (!storageOpen) return;
  const cap = state.storage.cap;
  $('storage-num').textContent = `${state.storage.items.filter(Boolean).length}/${cap}`;
  const step = R.nextStorageStep(state);
  const ex = $('btn-expand');
  if (step) {
    ex.hidden = false;
    ex.className = 'btn small' + (state.coins >= step.cost ? ' gold' : ' wait');
    ex.replaceChildren(`${step.cap}枠に増やす `, h('i', { class: 'coin' }), String(step.cost));
  } else ex.hidden = true;
  const grid = $('storage-grid');
  const slots = [];
  for (let i = 0; i < STORAGE_MAX; i++) {
    if (i < cap) {
      const el = h('div', { class: 'slot', 'data-z': 's', 'data-i': i });
      paintSlot(el, state.storage.items[i], { z: 's', i });
      slots.push(el);
    } else slots.push(h('div', { class: 'slot locked', 'aria-label': '未解放の枠' }));
  }
  grid.replaceChildren(...slots);
}

function render() {
  renderScene();
  renderCards();
  renderBoard();
  renderInfo();
  renderGens();
  renderNav();
  renderStorage();
  renderHint();
  layoutBoard();
}

// ---- 盤面サイズ（画面に収める） ----
const wide = matchMedia('(min-width: 900px) and (min-height: 560px)');
function layoutBoard() {
  const wrap = $('board-wrap');
  const app = $('app');
  const cs = getComputedStyle(app);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const vh = window.innerHeight;
  let availH;
  if (wide.matches) {
    availH = vh - padY - document.querySelector('.topbar').offsetHeight - 16;
  } else {
    const others = ['.topbar', '.scene', '.cards', '.dock', '.navbar']
      .reduce((a, s) => a + (document.querySelector(s)?.offsetHeight || 0), 0);
    availH = vh - padY - others - 8 * 5 - 4;
  }
  const availW = wrap.clientWidth;
  const frame = 18; // padding + border
  const byW = (availW - frame - 6 * 4) / 7;
  const byH = (availH - frame - 7 * 4) / 8;
  const cell = Math.floor(Math.max(38, Math.min(byW, Math.max(byH, 40), 84)));
  document.documentElement.style.setProperty('--cell-size', `${cell}px`);
  wrap.style.height = `${cell * 8 + 7 * 4 + frame}px`;
}
window.addEventListener('resize', () => layoutBoard());
wide.addEventListener?.('change', () => layoutBoard());

// ---- 選択・ドラッグ＆ドロップ ----
let press = null;

function select(loc) {
  sel = loc;
  audio.sfx('select');
  render();
}

function tapAt(loc) {
  const item = getItem(loc);
  if (!sel) {
    if (item) select(loc);
    return;
  }
  if (sameLoc(sel, loc)) { sel = null; render(); return; }
  const cur = getItem(sel);
  if (item && !(item.c === cur.c && item.l === cur.l)) { select(loc); return; }
  if (loc.z === 's' && item) { select(loc); return; }
  const src = sel;
  sel = null;
  if (!commit(R.move(state, src, loc))) { sel = src; render(); }
}

function dropOn(src, x, y) {
  const el = document.elementFromPoint(x, y);
  const target = el?.closest('[data-z], [data-drop]');
  if (!target) { render(); return; } // 盤面外: 元の場所に残す
  if (target.dataset.drop === 'storage') {
    if (src.z === 'b') commit(R.store(state, src.i));
    else render();
    return;
  }
  const dst = { z: target.dataset.z, i: Number(target.dataset.i) };
  if (sameLoc(src, dst)) { sel = src; render(); return; }
  sel = null;
  if (!commit(R.move(state, src, dst))) render();
}

const ghost = $('ghost');
let overEl = null;
function setOver(el) {
  if (overEl === el) return;
  overEl?.classList.remove('over');
  overEl = el;
  overEl?.classList.add('over');
}

function onDown(e) {
  if (blocked || press) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const el = e.target.closest('[data-z]');
  if (!el) return;
  audio.unlock();
  const loc = { z: el.dataset.z, i: Number(el.dataset.i) };
  press = { loc, x: e.clientX, y: e.clientY, id: e.pointerId, el, drag: false, item: getItem(loc) };
  if (press.item) e.preventDefault();
}

function onMove(e) {
  if (!press || e.pointerId !== press.id) return;
  if (!press.drag) {
    if (!press.item || Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) return;
    press.drag = true;
    document.body.classList.add('dragging');
    press.el.classList.add('lift');
    ghost.src = itemImg(press.item.c, press.item.l);
    ghost.hidden = false;
  }
  e.preventDefault();
  const size = ghost.offsetWidth || 50;
  ghost.style.transform = `translate(${e.clientX - size / 2}px, ${e.clientY - size * 0.7}px)`;
  const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-z], [data-drop]');
  setOver(t && !(t.dataset.z === press.loc.z && Number(t.dataset.i) === press.loc.i) ? t : null);
}

function endDrag() {
  ghost.hidden = true;
  document.body.classList.remove('dragging');
  press?.el.classList.remove('lift');
  setOver(null);
}

function onUp(e) {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  endDrag();
  press = null;
  if (p.drag) dropOn(p.loc, e.clientX, e.clientY);
  else tapAt(p.loc);
}

function onCancel(e) {
  if (!press || e.pointerId !== press.id) return;
  endDrag();
  press = null;
  render(); // 品物はそのまま
}

document.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onCancel);
// iOS: 盤面上のスクロール・拡大を抑止
for (const id of ['board', 'storage-grid']) {
  $(id).addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('blur', () => { if (press) { endDrag(); press = null; render(); } });

// ---- トースト ----
let toastTimer = null;
function toast(msg, action) {
  const el = $('toast');
  el.replaceChildren(h('span', { text: msg }));
  if (action) {
    el.append(h('button', { class: 'btn small gold', type: 'button', onclick: () => { el.classList.remove('show'); action.fn(); } }, action.label));
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

// ---- モーダル ----
let modalOnClose = null;
function openModal(title, body, { closable = true, onClose = null } = {}) {
  const panel = $('modal-panel');
  const head = h('h2', {}, h('span', { text: title }));
  if (closable) head.append(h('button', { class: 'iconbtn small', type: 'button', 'aria-label': '閉じる', onclick: closeModal }, '✕'));
  panel.replaceChildren(head, ...body);
  panel.setAttribute('aria-label', title);
  $('modal').hidden = false;
  $('modal').dataset.closable = closable ? '1' : '';
  modalOnClose = onClose;
}
function closeModal() {
  $('modal').hidden = true;
  const f = modalOnClose;
  modalOnClose = null;
  f?.();
}
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && $('modal').dataset.closable) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('modal').hidden && $('modal').dataset.closable) closeModal();
    else if (sel) { sel = null; render(); }
  }
});

function confirmBox(title, text, okLabel, onOk) {
  openModal(title, [
    h('p', { text }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'やめる'),
      h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); onOk(); } }, okLabel)),
  ]);
}

// ---- 図鑑 ----
let codexTab = 'fruit';
function openCodex() {
  audio.sfx('page');
  const draw = () => {
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...CHAIN_IDS.map((c) => {
      const open = state.gens.includes(c) || state.discovered.some((k) => k.startsWith(c + '-'));
      return h('button', {
        class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(c === codexTab),
        onclick: () => { codexTab = c; draw(); },
      }, open ? CHAINS[c].label : '？？？');
    }));
    const c = codexTab;
    const genOpen = state.gens.includes(c);
    const grid = h('div', { class: 'codex-grid' }, ...CHAINS[c].names.map((n, k) => {
      const l = k + 1;
      const known = state.discovered.includes(itemKey(c, l));
      return h('div', { class: 'codex-cell' },
        h('img', { src: itemImg(c, l), alt: known ? n : '未発見', class: known ? '' : 'silhouette' }),
        h('b', { text: known ? n : '？？？' }), h('small', { text: `Lv.${l}` }));
    }));
    const isl = islandById(CHAINS[c].island);
    openModal(`図鑑 ${state.discovered.length}/36`, [
      tabs,
      h('div', { class: 'codex-gen' },
        h('img', { src: genImg(c), alt: '', class: genOpen ? '' : 'silhouette' }),
        h('div', {}, h('div', { text: genOpen ? `生産元：${CHAINS[c].gen}` : '生産元：？？？' }),
          h('div', { class: 'muted', text: state.visited.includes(isl.id) ? isl.name : 'まだ訪れていない島' }))),
      grid,
      h('p', { class: 'muted', text: '一度見つけた品物は、納品したあとも図鑑に残ります。' }),
    ]);
  };
  draw();
}

// ---- 島マップ ----
function openMap() {
  audio.sfx('page');
  const list = h('div', { class: 'map-list' }, ...ISLANDS.map((isl) => {
    const st = R.islandStatus(state, isl.id);
    const p = R.islandProgress(state, isl.id);
    const here = state.island === isl.id;
    let action = null;
    if (st === 'open' && !here) {
      action = h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); commit(R.travel(state, isl.id)); } }, 'この島へ渡る');
    } else if (st === 'buyable' || st === 'route') {
      action = h('button', {
        class: 'btn' + (st === 'buyable' ? ' gold' : ' wait'), type: 'button',
        onclick: (ev) => {
          if (state.coins < isl.unlockCost) { toast(`コインが足りません（${isl.unlockCost}コイン必要）。通常注文で集めましょう。`); audio.sfx('deny'); return; }
          ev.currentTarget.disabled = true;
          closeModal();
          commit(R.unlockIsland(state, isl.id));
        },
      }, h('i', { class: 'coin' }), `${isl.unlockCost}で航路を開く`);
    }
    const sub = st === 'hidden' ? 'まだ航路が見つかっていません'
      : st === 'open' ? `依頼 ${p.done}/${p.total}${state.flags.includes('lighthouseLit') && isl.id === 'hoshiakari' ? '・灯台点灯' : ''}`
        : `航路を発見！ ${isl.unlockCost}コインで渡れます（所持 ${state.coins}）`;
    return h('div', {
      class: 'isle' + (st === 'hidden' ? ' hidden' : ''),
      style: st === 'hidden' ? null : `background-image:url("${isl.bg}")`,
    },
    here ? h('span', { class: 'here', text: '現在地' }) : null,
    h('div', { class: 'isle-body' },
      h('div', {}, h('div', { class: 'isle-name', text: st === 'hidden' ? '？？？' : isl.name }), h('div', { class: 'isle-sub', text: sub })),
      action));
  }));
  openModal('島マップ', [list, h('p', { class: 'muted', text: '解放した島へはいつでも無料で渡れます。盤面・収納・コイン・生産元はそのまま持っていけます。' })]);
}

// ---- 設定 ----
function openSettings() {
  audio.sfx('page');
  const a = getAudioSettings(GAME_ID);
  const save = () => { setAudioSettings(GAME_ID, a); audio.apply(a); };
  const row = (label, key) => h('div', { class: 'row' },
    h('label', { for: `vol-${key}`, text: label }),
    h('input', {
      id: `vol-${key}`, type: 'range', min: '0', max: '100', value: String(Math.round(a[key].volume * 100)),
      oninput: (e) => { a[key].volume = Number(e.target.value) / 100; save(); },
      onchange: () => { audio.unlock(); if (key === 'sfx') audio.sfx('merge'); },
    }),
    h('label', { class: 'check' }, h('input', {
      type: 'checkbox', checked: a[key].muted ? true : null,
      onchange: (e) => { a[key].muted = e.target.checked; save(); },
    }), 'ミュート'));
  openModal('設定', [
    h('h3', { text: '音' }),
    row('BGM', 'bgm'),
    row('効果音', 'sfx'),
    h('p', { class: 'muted', text: '音は最初に画面をさわったときに始まります。設定はこの端末に保存されます。' }),
    h('h3', { text: '会話' }),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: openLog }, 'これまでの会話を読み返す')),
    h('h3', { text: 'データ' }),
    h('p', { class: 'muted', text: '進行は操作のたびに自動で保存されます。バックアップ（JSONファイル）の保存と復元は、ランチャーの⚙設定から行えます。' }),
    h('div', { class: 'actions' },
      h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ戻る'),
      h('button', { class: 'btn ghost', type: 'button', onclick: confirmReset }, 'はじめから遊ぶ')),
  ]);
}

function confirmReset() {
  confirmBox('はじめから遊ぶ', '今の進行を消して、こもれび島の最初から始めます。消したデータは元に戻せません（ランチャーでバックアップを保存しておくと安心です）。', 'はじめから', () => {
    confirmBox('本当によろしいですか？', 'すべての島・図鑑・コインがリセットされます。', '消して始める', () => {
      const r = { ok: true, state: R.newGame(), events: [{ type: 'travel', island: 'komorebi' }], msg: '' };
      sel = null;
      commit(r);
    });
  });
}

function openLog() {
  const items = state.dialogues.filter((id) => DIALOGUES[id]).map((id) => {
    const d = DIALOGUES[id];
    return h('details', { class: 'log-item' }, h('summary', { text: d.title }),
      ...d.lines.map((l) => h('p', {}, l.who ? h('b', { text: l.who }) : null, l.text)));
  });
  openModal('会話の記録', items.length ? items : [h('p', { text: 'まだ会話はありません。' })]);
}

// ---- 会話 ----
let talking = null; // {id, k}
function maybeTalk() {
  if (talking || !state.pending.length || blocked) return;
  const id = state.pending[0];
  const d = DIALOGUES[id];
  if (!d) { commit(R.ackDialogue(state, id)); return; }
  talking = { id, k: 0 };
  $('talk').hidden = false;
  $('hint').hidden = true;
  showLine();
}
function showLine() {
  const d = DIALOGUES[talking.id];
  const line = d.lines[talking.k];
  $('talk-who').textContent = line.who || '　';
  $('talk-title').textContent = `${d.title}　${talking.k + 1}/${d.lines.length}`;
  $('talk-text').textContent = line.text;
  $('talk-next').textContent = talking.k + 1 < d.lines.length ? 'つぎへ ▶' : 'とじる';
}
function nextLine() {
  if (!talking) return;
  audio.unlock();
  const d = DIALOGUES[talking.id];
  if (talking.k + 1 < d.lines.length) { talking.k++; audio.sfx('page'); showLine(); } else endTalk();
}
function endTalk() {
  if (!talking) return;
  const id = talking.id;
  talking = null;
  $('talk').hidden = true;
  commit(R.ackDialogue(state, id));
  if (id === 'ending') showEnding();
}
$('talk-next').addEventListener('click', (e) => { e.stopPropagation(); nextLine(); });
$('talk-skip').addEventListener('click', (e) => { e.stopPropagation(); endTalk(); });
$('talk-log').addEventListener('click', (e) => { e.stopPropagation(); openLog(); });
$('talk').addEventListener('click', (e) => { if (e.target.closest('.talk-box')) nextLine(); });

function showEnding() {
  audio.sfx('fanfare');
  const s = state.stats;
  const mins = Math.round(s.playMs / 60000);
  const isl = islandById('hoshiakari');
  const scene = h('div', { class: 'scene lit', 'data-island': 'hoshiakari' },
    h('div', { class: 'stage' }, h('img', { class: 'scene-img', src: isl.bg, alt: '光の灯った灯台' }),
      h('div', { class: 'lighthouse-glow' }, h('span', { class: 'beam' }))));
  openModal('灯台に光が灯りました', [
    h('div', { class: 'ending' },
      h('div', { class: 'stage-wrap' }, scene),
      h('p', { text: '三つの島をめぐる旅は、ひとまずおしまい。' }),
      h('p', { text: 'これからも合成や注文、図鑑集めを自由に楽しめます。' }),
      h('div', { class: 'stats' },
        h('div', {}, '遊んだ時間', h('b', { text: `約${Math.floor(mins / 60)}時間${mins % 60}分` })),
        h('div', {}, '合成した回数', h('b', { text: `${s.merged}回` })),
        h('div', {}, '届けた注文', h('b', { text: `${s.ordersDone}件` })),
        h('div', {}, '図鑑', h('b', { text: `${state.discovered.length}/36` }))),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, '島の暮らしをつづける'))),
  ]);
}

// ---- ボタン ----
$('btn-settings').addEventListener('click', openSettings);
$('btn-codex').addEventListener('click', openCodex);
$('btn-map').addEventListener('click', openMap);
$('btn-storage').addEventListener('click', () => {
  if (state.storage.cap === 0) { toast('収納は依頼「木陰に小さな売り台を」で使えるようになります。'); return; }
  storageOpen = !storageOpen;
  audio.sfx('page');
  render();
});
$('btn-storage-close').addEventListener('click', () => { storageOpen = false; render(); });
$('btn-expand').addEventListener('click', () => commit(R.buyStorage(state)));
$('btn-back').addEventListener('click', () => { audio.pause(); });
document.addEventListener('visibilitychange', () => {
  lastTick = performance.now();
  if (document.visibilityState === 'hidden' && dirty) persist();
});

// ---- 起動 ----
async function loadInitial() {
  let rec;
  try {
    rec = await loadSave(GAME_ID);
  } catch (e) {
    showFatal('保存領域を開けませんでした', 'ブラウザの設定で保存（Cookie・サイトデータ）が許可されているか確認してください。プライベートブラウズでは保存できない場合があります。');
    return null;
  }
  if (!rec) return { s: R.newGame(), rev: null };
  if (rec.schema > SCHEMA) {
    showFatal('新しい版のデータです', 'このセーブは新しい版のアプリで作られています。データは消さずに残してあります。ページを再読み込みしてアプリを更新してください。');
    return null;
  }
  const u = upgrade(rec.data, rec.schema);
  if (u.ok) return { s: u.data, rev: rec.rev };
  const prev = await loadPrevSave(GAME_ID).catch(() => null);
  if (prev) {
    const p = upgrade(prev.data, prev.schema);
    if (p.ok) {
      setTimeout(() => toast('最新のセーブを読めなかったため、直前の正常なデータで再開しました。'), 800);
      return { s: p.data, rev: rec.rev };
    }
  }
  return new Promise((resolve) => {
    openModal('セーブを読み込めませんでした', [
      h('p', { text: 'データが壊れている可能性があります。ランチャーの⚙設定からバックアップを復元するか、はじめから遊べます（壊れたデータは直前版として1つ残ります）。' }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); resolve({ s: R.newGame(), rev: rec.rev }); } }, 'はじめから遊ぶ')),
    ], { closable: false });
  });
}

function showFatal(title, text) {
  blocked = true;
  $('app').removeAttribute('aria-busy');
  openModal(title, [h('p', { text }), h('div', { class: 'actions' },
    h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
    h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, '再読み込み'))], { closable: false });
}

async function waitLock() {
  if (await holdGameLock(GAME_ID)) return;
  await new Promise((resolve) => {
    const retry = async () => {
      if (await holdGameLock(GAME_ID)) { closeModal(); resolve(); } else toast('まだ別の画面で開かれています。');
    };
    openModal('別の画面で遊んでいます', [
      h('p', { text: 'マージの旅は別のタブ（またはホーム画面版）で開かれています。データの上書きを防ぐため、そちらを閉じてから「もう一度確認」を押してください。' }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn', type: 'button', onclick: retry }, 'もう一度確認')),
    ], { closable: false });
  });
}

async function boot() {
  buildBoard();
  audio.apply(getAudioSettings(GAME_ID));
  await waitLock();
  const init = await loadInitial();
  if (!init) return;
  state = R.normalize(init.s);
  rev = init.rev;
  if (validate(state).length) console.warn('state invalid', validate(state));
  audio.setSong(state.island);
  $('app').removeAttribute('aria-busy');
  render();
  requestAnimationFrame(layoutBoard);
  maybeTalk();
  // 最初の操作で音を開始
  const first = () => audio.unlock();
  window.addEventListener('pointerdown', first, { once: true, capture: true });
  window.addEventListener('keydown', first, { once: true, capture: true });
  // ゲーム画面から直接開いた場合もオフライン準備を進める（更新の切替はランチャーで）
  initServiceWorker('../../sw.js', {
    onUpdate: () => toast('新しい版を準備しました。ランチャーに戻ると更新できます。'),
  }).catch(() => {});
  // テスト用の読み取り専用フック（状態を変更する機能は持たない）
  window.__mergeJourney = { get state() { return structuredClone(state); }, get rev() { return rev; }, saving: () => saving || dirty };
}

boot();

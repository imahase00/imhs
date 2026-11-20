// パズトレ: 画面・操作・進行
import {
  GAME_ID, SCHEMA, COLS, ROWS, COLORS, COLOR_NAME, DUNGEONS, FLOORS, TOOLS, FRAMES, TREASURES, TREASURE_IDS, MAX_TOOLS, ENDING,
} from './data.js';
import * as R from './rules.js';
import { upgrade, validate } from './save-schema.js';
import { drawBoard, drawFrame, orbSprite, frameThumb, ORB_COLORS } from './render.js';
import { audio } from './audio.js';
import { loadSave, loadPrevSave, writeSave, holdGameLock, closeDB, ConflictError } from '../../shared/storage.js';
import { getAudioSettings, setAudioSettings } from '../../shared/settings.js';
import { initServiceWorker } from '../../shared/sw-client.js';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const img = (src, alt = '') => h('img', { src, alt, decoding: 'async', draggable: 'false' });
const tImg = (id) => `img/treasure/${id}.webp`;
const treasureOf = (id) => Object.values(TREASURES).flat().find((t) => t.id === id);

// ---- 状態 ----
let save = null;
let rev = null;
let blocked = false;
let scene = 'boot';
let run = null;
let phase = 'idle';        // idle | drag | resolve | wait
let paused = false;

// ---- 保存 ----
let saving = false;
let dirty = false;
let leaving = false;
let lastJson = '';
async function persist() {
  dirty = true;
  if (saving || blocked || !save || leaving) return;
  saving = true;
  while (dirty && !blocked) {
    dirty = false;
    const snap = structuredClone(save);
    const json = JSON.stringify(snap);
    if (json === lastJson) continue;
    try {
      rev = await writeSave(GAME_ID, { schema: SCHEMA, data: snap, summary: R.saveSummary(snap) }, rev);
      lastJson = json;
      $('save-banner').hidden = true;
    } catch (e) {
      if (e instanceof ConflictError) {
        blocked = true;
        openModal('データが更新されました', [
          h('p', { text: '別のタブやランチャー（バックアップ復元）でこのゲームのデータが更新されました。上書きを防ぐため、この画面では保存を止めています。' }),
          h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: () => location.reload() }, '再読み込みする')),
        ], { closable: false });
      } else {
        const b = $('save-banner');
        b.replaceChildren(h('span', { text: '保存できませんでした。端末の空き容量やプライベートモードを確認してください。' }),
          h('button', { class: 'btn small', type: 'button', onclick: () => persist() }, '再試行'));
        b.hidden = false;
        console.warn('save failed', e);
        dirty = true;
        break;
      }
    }
  }
  saving = false;
}

// ---- 画面の切り替え ----
function show(id) {
  scene = id;
  for (const s of ['title', 'map', 'battle']) $(s).hidden = s !== id;
}

// ---- タイトル ----
function toTitle() {
  show('title');
  audio.setSong('title');
  $('chip-dex').textContent = `${save.treasures.length}/${TREASURE_IDS.length}`;
  $('chip-tools').textContent = `${save.tools.length}/16`;
  $('chip-frames').textContent = FRAMES.find((f) => f.id === save.frame).name;
}
$('btn-start').addEventListener('click', () => {
  audio.unlock();
  audio.sfx('select');
  if (!save.intro) { showIntro(); return; }
  toMap();
});
$('btn-dex').addEventListener('click', () => { audio.unlock(); openDex(); });
$('btn-tools').addEventListener('click', () => { audio.unlock(); openTools(); });
$('btn-frames').addEventListener('click', () => { audio.unlock(); openFrames(); });
$('btn-settings').addEventListener('click', () => { audio.unlock(); openSettings(); });
$('btn-back').addEventListener('click', (e) => { e.preventDefault(); audio.pause(); leaveToLauncher(); });
async function leaveToLauncher() {
  persist();
  const until = performance.now() + 1500;
  while ((saving || dirty) && !blocked && performance.now() < until) await wait(50);
  // 書き込みを締め切り、接続も閉じてから移る（iPhone でランチャーがセーブを読めなくなるのを防ぐ）
  leaving = true;
  await closeDB();
  location.href = '../../index.html';
}

function showIntro() {
  openModal('探検のはじまり', [
    h('p', { text: '世界のどこかに眠る6つのダンジョン。その最奥には、まだ誰も見たことのないお宝があるという。' }),
    h('p', { text: '行く手をふさぐのは、扉や罠などの「仕掛け」。宝石の球をそろえて消し、仕掛けを突破していこう。' }),
    h('h3', { text: 'あそびかた' }),
    h('ul', { class: 'howto' },
      h('li', { text: '球を1つつかんで、指をはなさずに動かすと、通った球と入れ替わります（5秒まで）。' }),
      h('li', { text: '同じ色が縦か横に3つ以上並ぶと消えます。一度にたくさん消すほど「コンボ」で強くなります。' }),
      h('li', { text: '仕掛けには効きやすい色（弱点）があります。ハートの球は体力の回復です。' }),
      h('li', { text: '仕掛けの「あと○」が0になると罠が作動します。その前に突破しよう。' })),
    h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: () => { save.intro = true; persist(); closeModal(); toMap(); } }, '出発する')),
  ], { closable: false });
}

// ---- ダンジョンをえらぶ ----
function toMap() {
  show('map');
  audio.setSong('title');
  $('map-coins').textContent = String(save.coins);
  $('dungeons').replaceChildren(...DUNGEONS.map((dg, d) => {
    const open = R.unlocked(save, d);
    const got = TREASURES[dg.id].filter((t) => save.treasures.includes(t.id)).length;
    const cont = save.run && save.run.d === d;
    const tag = !open ? '🔒 まだ行けない' : cont ? `つづきから ${save.run.floor >= FLOORS ? '大扉' : `${save.run.floor + 1}F`}` : save.cleared.includes(dg.id) ? '踏破' : 'はじめて';
    return h('button', {
      class: `dg ${open ? '' : 'locked'}`, type: 'button', style: `background-image:url(img/bg/${dg.id}.webp)`, 'data-d': String(d),
      onclick: () => { if (!open) { toast('ひとつ前のダンジョンを踏破すると行けます'); return; } audio.sfx('select'); openPrep(d); },
    }, h('div', {}, h('b', { text: dg.name }), h('small', { text: open ? `お宝 ${got}/8　${dg.intro}` : '？？？' })),
    h('span', { class: `tag ${save.cleared.includes(dg.id) && !cont ? 'done' : ''}`, text: tag }));
  }));
}
$('btn-map-back').addEventListener('click', () => { audio.sfx('select'); toTitle(); });

function openPrep(d) {
  const dg = DUNGEONS[d];
  if (save.run && save.run.d === d) {
    openModal(dg.name, [
      h('p', { text: `前回の続き（${save.run.floor >= FLOORS ? '最奥の大扉' : `${save.run.floor + 1}F`}）から再開できます。持ち物はそのままです。` }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { closeModal(); confirmGiveUp(d); } }, 'あきらめて入口へ'),
        h('button', { class: 'btn gold', type: 'button', onclick: () => { closeModal(); enterDungeon(R.resume(save)); } }, 'つづきから')),
    ]);
    return;
  }
  if (save.run && save.run.d !== d) {
    openModal('別のダンジョンを冒険中です', [
      h('p', { text: `${DUNGEONS[save.run.d].name}の冒険が途中です。こちらへ行くと、途中の冒険は撤退あつかい（拾ったコインの半分を持ち帰る）になります。` }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small', type: 'button', onclick: closeModal }, 'やめる'),
        h('button', { class: 'btn gold', type: 'button', onclick: () => { R.retreat(save, R.resume(save)); persist(); closeModal(); openPrep(d); } }, 'こちらへ行く')),
    ]);
    return;
  }
  const sel = new Set(save.loadout);
  const list = h('div', { class: 'toollist' });
  const weakSet = new Set([...dg.traps.map((t) => t.weak), ...dg.boss.phases.map((p) => p.weak)]);
  const draw = () => list.replaceChildren(...save.tools.map((id) => {
    const t = TOOLS[id];
    return h('button', {
      class: 'toolrow', type: 'button', 'aria-pressed': String(sel.has(id)),
      onclick: () => {
        if (sel.has(id)) { if (sel.size > 1) sel.delete(id); } else if (sel.size < MAX_TOOLS) sel.add(id); else { toast(`持ち物は${MAX_TOOLS}つまでです`); return; }
        audio.sfx('select'); draw(); count.textContent = `${sel.size}/${MAX_TOOLS}`;
      },
    }, img(`img/tool/${id}.webp`), h('div', {}, h('b', {}, t.name, `（${t.cd}手）`),
      h('small', {}, h('i', { style: `background:${ORB_COLORS[COLORS.indexOf(t.color)].base}` }), `${COLOR_NAME[t.color]}が強くなる。${t.skill}`)));
  }));
  const count = h('b', { text: `${sel.size}/${MAX_TOOLS}` });
  draw();
  openModal(dg.name, [
    h('p', { text: dg.intro }),
    h('p', { class: 'muted' }, 'よく出る弱点: ', ...[...weakSet].map((c) => h('span', { style: `color:${ORB_COLORS[COLORS.indexOf(c)].dark};font-weight:900` }, `${COLOR_NAME[c]} `))),
    h('h3', {}, '持ち物 ', count),
    list,
    h('p', { class: 'muted', text: `枠: ${FRAMES.find((f) => f.id === save.frame).name}（タイトルの「枠」で変えられます）` }),
    h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: () => {
      save.loadout = save.tools.filter((t) => sel.has(t));
      closeModal();
      const r = R.newRun(save, d);
      save.run = R.snapshot(r);
      persist();
      enterDungeon(r);
    } }, '出発！')),
  ]);
}
function confirmGiveUp(d) {
  openModal('入口へ戻りますか？', [
    h('p', { text: '撤退あつかいになり、拾ったコインの半分を持ち帰ります。見つけたお宝は図鑑に残ります。' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', type: 'button', onclick: closeModal }, 'やめる'),
      h('button', { class: 'btn gold', type: 'button', onclick: () => { R.retreat(save, R.resume(save)); persist(); closeModal(); openPrep(d); } }, '入口へ')),
  ]);
}

// ---- パズル画面 ----
const canvas = $('board');
const g = canvas.getContext('2d');
let layout = { x: 0, y: 0, cs: 60, ft: 10, w: 0, h: 0 };
let dpr = 1;
const vis = new Map();      // id → { x, y, s, a }
let ghosts = [];
const hidden = new Set();
let held = null;
let deadline = 0;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.min(window.innerWidth - 16, 460);
  const ft = Math.round(W * 0.035);
  const cs = (W - ft * 2) / COLS;
  const H = cs * ROWS + ft * 2;
  layout = { x: ft, y: ft, cs, ft, w: W, h: H };
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
window.addEventListener('resize', resize);

function enterDungeon(r) {
  run = r;
  phase = 'idle';
  paused = false;
  show('battle');
  vis.clear(); ghosts = []; hidden.clear(); held = null;
  resize();
  setupFloor(true);
}
function setupFloor(first = false) {
  const dg = DUNGEONS[run.d];
  $('stage-bg').src = `img/bg/${dg.id}.webp`;
  audio.setSong(R.isBoss(run) ? 'boss' : 'dungeon');
  renderTraps();
  renderHud();
  renderTools();
  const label = R.isBoss(run) ? `最奥・${dg.boss.name}` : `${run.floor + 1}F`;
  showMsg(R.isBoss(run) ? `${dg.boss.name}が立ちはだかる！` : `${dg.name}　${label}`, 'good', first ? 1600 : 1200);
  if (save.stats.turns === 0 && run.turn === 0 && run.floor === 0) setTimeout(() => { if (run && run.turn === 0) toast('球をつかんで、指をはなさずに動かそう'); }, 1700);
}
function renderHud() {
  const dg = DUNGEONS[run.d];
  $('floor').textContent = R.isBoss(run) ? `${dg.name}　最奥` : `${dg.name}　${run.floor + 1}F / ${FLOORS}`;
  $('run-coins').textContent = String(run.coins);
  const p = Math.max(0, run.hp / run.maxHp);
  $('hp-fill').style.width = `${p * 100}%`;
  $('hp-fill').classList.toggle('low', p < 0.3);
  $('hp-text').textContent = `体力 ${Math.ceil(run.hp)} / ${run.maxHp}`;
}
function weakIcon(color) {
  const c = h('canvas', { class: 'weak', width: '44', height: '44', title: `弱点: ${COLOR_NAME[color]}` });
  c.getContext('2d').drawImage(orbSprite(COLORS.indexOf(color), 44), 0, 0);
  return c;
}
function renderTraps() {
  const box = $('traps');
  box.dataset.n = String(run.traps.length);
  box.replaceChildren(...run.traps.map((t, i) => h('div', {
    class: `trap ${i === run.target ? 'target' : ''} ${t.hp <= 0 ? 'broken' : ''}`, 'data-i': String(i),
    onclick: () => { if (t.hp > 0 && run.traps.filter((x) => x.hp > 0).length > 1) { run.target = i; audio.sfx('select'); updateTraps(); } },
  }, img(`img/trap/${t.id}.webp`, t.name),
  h('div', { class: 'name', text: t.name }),
  h('div', { class: 'info' }, weakIcon(t.weak), h('div', { class: 'thp' }, h('span', { style: `width:${(t.hp / t.max) * 100}%` })), h('span', { class: 'cd' })))));
  updateTraps();
}
function updateTraps() {
  for (const el of $('traps').children) {
    const i = Number(el.dataset.i);
    const t = run.traps[i];
    el.classList.toggle('target', i === run.target && t.hp > 0);
    el.classList.toggle('broken', t.hp <= 0);
    el.querySelector('.thp span').style.width = `${Math.max(0, t.hp / t.max) * 100}%`;
    const cd = el.querySelector('.cd');
    cd.textContent = `あと${t.cd}`;
    cd.classList.toggle('soon', t.cd <= 1);
    const w = el.querySelector('.weak');
    if (w.title !== `弱点: ${COLOR_NAME[t.weak]}`) w.replaceWith(weakIcon(t.weak));
  }
}
function renderTools() {
  const box = $('tools');
  const slots = [...run.tools, ...Array(MAX_TOOLS - run.tools.length).fill(null)];
  box.replaceChildren(...slots.map((id) => {
    if (!id) return h('div', { class: 'tool empty' });
    const t = TOOLS[id];
    const left = run.cds[id];
    const p = Math.round((1 - left / Math.max(1, t.cd)) * 100);
    return h('button', {
      class: `tool ${left <= 0 ? 'ready' : ''}`, type: 'button', style: `--p:${p}%`, 'aria-label': `${t.name}: ${t.skill}`,
      onclick: () => onSkill(id),
    }, h('span', { class: 'ring' }), img(`img/tool/${id}.webp`), h('b', { text: left <= 0 ? '使える' : `あと${left}` }));
  }));
}
async function onSkill(id) {
  audio.unlock();
  if (phase !== 'idle' || paused) return;
  const t = TOOLS[id];
  if (!R.skillReady(run, id)) { toast(`${t.name}: ${t.skill}（あと${run.cds[id]}手）`); return; }
  phase = 'wait';
  const ev = R.useSkill(run, id);
  audio.sfx('skill');
  showMsg(`${t.name}！`, 'good', 900);
  for (const e of ev) {
    if (e.type === 'heal') { floatNum(null, `+${e.amount}`, 'heal'); audio.sfx('heal'); }
    if (e.type === 'hit') floatNum(e.index, `${e.amount}`, '');
  }
  renderHud(); renderTools(); updateTraps();
  await wait(350);
  phase = 'idle';
}

// ---- 指の操作 ----
function cellAt(clientX, clientY) {
  const rc = canvas.getBoundingClientRect();
  const x = clientX - rc.left - layout.x;
  const y = clientY - rc.top - layout.y;
  return { r: Math.floor(y / layout.cs), c: Math.floor(x / layout.cs), x: clientX - rc.left, y: clientY - rc.top };
}
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (scene !== 'battle' || phase !== 'idle' || paused || held) return;
  const p = cellAt(e.clientX, e.clientY);
  if (p.r < 0 || p.c < 0 || p.r >= ROWS || p.c >= COLS) return;
  const cell = run.board[p.r][p.c];
  if (cell.ice > 0) { toast('凍った球は動かせません'); return; }
  canvas.setPointerCapture?.(e.pointerId);
  held = { id: cell.id, at: [p.r, p.c], px: p.x, py: p.y, path: [[p.r, p.c]], pointer: e.pointerId };
  phase = 'drag';
  deadline = 0;
  audio.sfx('pick');
});
canvas.addEventListener('pointermove', (e) => {
  if (!held || e.pointerId !== held.pointer) return;
  const p = cellAt(e.clientX, e.clientY);
  held.px = Math.max(layout.x, Math.min(layout.x + layout.cs * COLS, p.x));
  held.py = Math.max(layout.y, Math.min(layout.y + layout.cs * ROWS, p.y));
  // 指が速く動いても1マスずつ進める
  for (let guard = 0; guard < 12; guard++) {
    const tr = Math.max(0, Math.min(ROWS - 1, p.r));
    const tc = Math.max(0, Math.min(COLS - 1, p.c));
    const [r0, c0] = held.at;
    if (tr === r0 && tc === c0) break;
    // となりのマスは、その中心に十分近づいたときだけ入れ替える（角をかすめた斜めの誤作動を防ぐ）
    const cx = layout.x + (tc + 0.5) * layout.cs;
    const cy = layout.y + (tr + 0.5) * layout.cs;
    const diag = tr !== r0 && tc !== c0;
    if (Math.abs(tr - r0) <= 1 && Math.abs(tc - c0) <= 1 && Math.hypot(held.px - cx, held.py - cy) > layout.cs * (diag ? 0.42 : 0.6)) break;
    const nr = r0 + Math.sign(tr - r0);
    const nc = c0 + Math.sign(tc - c0);
    if (!R.canEnter(run.board, nr, nc)) break;
    swapHeld(nr, nc);
  }
});
function swapHeld(nr, nc) {
  const [r0, c0] = held.at;
  const other = run.board[nr][nc];
  run.board[nr][nc] = run.board[r0][c0];
  run.board[r0][c0] = other;
  // 入れ替わった球は、すっと元の場所へ動く
  const v = { x: nc, y: nr, s: 1, a: 1 };
  vis.set(other.id, v);
  tween(v, { x: c0, y: r0 }, 70).then(() => { if (vis.get(other.id) === v) vis.delete(other.id); });
  held.at = [nr, nc];
  held.path.push([nr, nc]);
  if (!deadline) deadline = performance.now() + R.moveTime(run) * 1000;
  audio.sfx('move', held.path.length);
}
const release = (e) => {
  if (!held || (e && e.pointerId !== held.pointer)) return;
  const moved = held.path.length > 1;
  held = null;
  deadline = 0;
  if (!moved) { phase = 'idle'; return; }
  audio.sfx('drop');
  turn();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// ---- 1手の流れ ----
async function turn() {
  phase = 'resolve';
  const pt = R.runParty(run);
  const steps = [];
  let combo = 0;
  for (let guard = 0; guard < 30; guard++) {
    const groups = R.findGroups(run.board);
    if (!groups.length) break;
    for (const gr of groups) {
      combo++;
      showCombo(combo);
      audio.sfx('combo', combo);
      const gs = gr.cells.map(([r, c]) => {
        const cell = run.board[r][c];
        hidden.add(cell.id);
        return { cell, x: c, y: r, s: 1, a: 1, flash: 1 };
      });
      ghosts.push(...gs);
      for (const gh of gs) tween(gh, { s: 1.3, a: 0, flash: 0 }, 300);
      await wait(190);
    }
    await wait(140);
    const falls = R.clearAndFall(run.board, groups, run, pt.mods.heartWeight);
    ghosts = []; hidden.clear();
    steps.push({ groups, falls });
    const col = new Map();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) col.set(run.board[r][c].id, c);
    const ps = falls.map((f) => {
      const v = { x: col.get(f.id), y: f.from, s: 1, a: 1 };
      vis.set(f.id, v);
      return tween(v, { y: f.to }, 120 + (f.to - f.from) * 45, easeIn).then(() => vis.delete(f.id));
    });
    await Promise.all(ps);
  }
  setTimeout(() => { $('combo').hidden = true; }, 700);
  // 攻撃
  const { atk, ev, broken } = R.applyAttack(run, steps);
  for (const e of ev) {
    if (e.type === 'heal') { floatNum(null, `+${e.amount}`, 'heal'); audio.sfx('heal'); }
    else if (e.type === 'hit') {
      const weak = e.parts.some((p) => p.f > 1);
      const resist = e.parts.length && e.parts.every((p) => p.f < 1);
      floatNum(e.index, `${e.amount}`, weak ? 'weak' : resist ? 'resist' : '');
      audio.sfx(weak ? 'weak' : 'hit');
      hitTrap(e.index);
      await wait(260);
    } else if (e.type === 'phase') {
      audio.sfx('phase');
      updateTraps();
      showMsg(`大扉の様子が変わった！ 弱点は ${COLOR_NAME[run.traps[e.index].weak]}`, '', 1500);
      await wait(900);
    } else if (e.type === 'break') {
      audio.sfx('break');
      updateTraps();
      await wait(450);
    }
  }
  updateTraps();
  renderHud();
  const hiddenTid = R.checkHiddenTurn(save, run, atk, broken);
  if (hiddenTid) { persist(); await treasurePopup(hiddenTid, true); }
  if (R.floorCleared(run)) { await floorClear(); return; }
  // 仕掛けの番
  await wait(200);
  const tev = R.trapTurn(run);
  R.tickBoard(run);
  for (const e of tev) {
    if (e.type === 'trap') {
      audio.sfx('trap');
      flash();
      $('stage').classList.remove('shake'); void $('stage').offsetWidth; $('stage').classList.add('shake');
      showMsg(`${e.text}　-${e.amount}`, '', 1100);
      renderHud();
      await wait(800);
    }
  }
  updateTraps();
  renderTools();
  renderHud();
  if (run.hp <= 0) { await retreatFlow(); return; }
  phase = 'idle';
}
async function floorClear() {
  phase = 'wait';
  const boss = R.isBoss(run);
  const found = R.clearFloor(save, run);
  renderHud();
  persist();
  audio.sfx('clear');
  showMsg(boss ? '大扉が開いた！' : '突破！', 'good', 1100);
  await wait(1100);
  for (const tid of found) await treasurePopup(tid, tid.endsWith('8'));
  if (boss) {
    const res = R.finishDungeon(save, run);
    persist();
    await dungeonClear(res);
    return;
  }
  run.floor++;
  R.startFloor(run);
  save.run = R.snapshot(run);
  persist();
  vis.clear();
  setupFloor();
  phase = 'idle';
}
function treasurePopup(tid, hiddenOne = false) {
  const t = treasureOf(tid);
  audio.sfx('treasure');
  return new Promise((resolve) => {
    openModal('', [h('div', { class: 'treasure-pop' },
      h('p', { class: 'kicker', text: hiddenOne ? '隠しお宝を発見！' : 'お宝を発見！' }),
      img(tImg(tid), t.name), h('b', { text: t.name }), h('p', { text: t.note }),
      h('p', { class: 'muted', text: `図鑑 ${save.treasures.length}/${TREASURE_IDS.length}` }),
      h('div', { class: 'actions', style: 'justify-content:center' }, h('button', { class: 'btn gold', type: 'button', onclick: closeModal }, 'やったね！')))],
    { closable: false, onClose: resolve });
  });
}
function dungeonClear(res) {
  const dg = DUNGEONS[run.d];
  audio.sfx('clear');
  return new Promise((resolve) => {
    openModal(`${dg.name} 踏破！`, [
      h('p', { text: res.first ? 'ダンジョンの最奥までたどり着いた！' : 'もう一度、最奥までたどり着いた。' }),
      h('div', { class: 'stats' },
        h('div', {}, 'もらったコイン', h('b', { text: `${res.coins}` })),
        h('div', {}, 'お宝', h('b', { text: `${TREASURES[dg.id].filter((t) => save.treasures.includes(t.id)).length}/8` })),
        h('div', {}, '最大コンボ', h('b', { text: `${run.stats.maxCombo}` })),
        h('div', {}, '使った手数', h('b', { text: `${run.stats.turns}` }))),
      res.tools.length ? h('p', { text: `新しい道具: ${res.tools.map((t) => TOOLS[t].name).join('・')}（出発前に持ち物を選べます）` }) : null,
      !TREASURES[dg.id][7] || save.treasures.includes(TREASURES[dg.id][7].id) ? null : h('p', { class: 'muted', text: `隠しお宝のヒント: ${dg.hidden.text}` }),
      h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: closeModal }, res.ending ? 'つづきを見る' : 'ダンジョン選びへ')),
    ], { closable: false, onClose: () => { run = null; if (res.ending) showEnding(); else toMap(); resolve(); } });
  });
}
async function retreatFlow() {
  phase = 'wait';
  audio.sfx('fail');
  audio.setSong('title');
  await wait(600);
  const r0 = run;
  const res = R.retreat(save, run);
  persist();
  openModal('撤退…', [
    h('p', { text: `体力が尽きて、入口まで引き返した。（${r0.floor >= FLOORS ? '最奥の大扉' : `${r0.floor + 1}F`}まで進んだ）` }),
    h('p', { text: `拾ったコインの半分（${res.coins}枚）は持ち帰れた。見つけたお宝は図鑑に残っている。` }),
    h('p', { class: 'muted', text: '弱点の色に強い道具を持っていく・枠を変える・ハートで回復しながら進む、などを試してみよう。' }),
    h('div', { class: 'actions' }, h('button', { class: 'btn gold', type: 'button', onclick: closeModal }, 'ダンジョン選びへ')),
  ], { closable: false, onClose: () => { run = null; toMap(); } });
}
let endK = 0;
function showEnding() {
  audio.setSong('ending');
  endK = 0;
  const p = h('p', { text: ENDING[0] });
  const next = h('button', { class: 'btn gold', type: 'button', onclick: () => {
    endK++;
    if (endK < ENDING.length) { audio.sfx('page'); p.textContent = ENDING[endK]; p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; return; }
    closeModal();
  } }, 'つぎへ');
  openModal('', [h('div', { class: 'ending' }, img('img/ending.webp', '開いた宝物庫'), p, h('div', { class: 'actions', style: 'justify-content:center' }, next))],
    { closable: false, onClose: () => { toast('おめでとう！ 図鑑の残りや枠集めも楽しめます'); toTitle(); } });
}

// ---- 演出 ----
const tweens = [];
const easeOut = (k) => 1 - (1 - k) ** 2;
const easeIn = (k) => k * k;
function tween(obj, to, dur, ease = easeOut) {
  return new Promise((resolve) => {
    const from = {};
    for (const k of Object.keys(to)) from[k] = obj[k];
    tweens.push({ obj, from, to, t0: performance.now(), dur, ease, resolve });
  });
}
function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    const e = tw.ease(k);
    for (const key of Object.keys(tw.to)) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
}
function showCombo(n) {
  const el = $('combo');
  el.textContent = `${n} コンボ`;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
let msgTimer = null;
function showMsg(text, cls = '', ms = 1200) {
  const el = $('msg');
  el.textContent = text;
  el.className = `msg ${cls}`;
  el.hidden = false;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function floatNum(index, text, cls) {
  const host = index == null ? $('stage') : $('traps').children[index];
  if (!host) return;
  const el = h('div', { class: `dmg ${cls}`, text });
  if (index == null) { el.style.top = '60%'; }
  host.append(el);
  setTimeout(() => el.remove(), 1000);
}
function hitTrap(i) {
  const el = $('traps').children[i];
  if (!el) return;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  updateTraps();
}
function flash() {
  const f = $('flash');
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}

// ---- 一時停止 ----
$('btn-pause').addEventListener('click', () => {
  audio.unlock();
  if (phase !== 'idle') return;
  paused = true;
  openModal('ひと休み', [
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => { closeModal(); confirmRetreat(); } }, '撤退する'),
      h('button', { class: 'btn gold', type: 'button', onclick: closeModal }, 'つづける')),
    ...soundRows(),
    h('h3', { text: '持っている道具' }),
    h('ul', { class: 'howto' }, ...run.tools.map((id) => h('li', { text: `${TOOLS[id].name}（${TOOLS[id].cd}手）: ${TOOLS[id].skill}` }))),
    h('p', { class: 'muted', text: 'このフロアのはじめから、いつでも続きを遊べます（ランチャーに戻っても大丈夫）。' }),
  ], { onClose: () => { paused = false; } });
});
function confirmRetreat() {
  paused = true;
  openModal('撤退しますか？', [
    h('p', { text: '入口まで引き返します。拾ったコインの半分を持ち帰ります（お宝は図鑑に残ります）。' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', type: 'button', onclick: closeModal }, 'やめる'),
      h('button', { class: 'btn gold', type: 'button', onclick: () => { modalOnClose = null; closeModal(); paused = false; retreatFlow(); } }, '撤退する')),
  ], { onClose: () => { paused = false; } });
}

// ---- 図鑑・道具・枠・設定 ----
function openDex() {
  audio.sfx('page');
  const cells = [];
  for (const dg of DUNGEONS) {
    const got = TREASURES[dg.id].filter((t) => save.treasures.includes(t.id)).length;
    cells.push(h('h3', { text: `${dg.name}　${got}/8` }));
    for (const t of TREASURES[dg.id]) {
      const has = save.treasures.includes(t.id);
      cells.push(h('button', {
        class: has ? '' : 'no', type: 'button', 'aria-label': has ? t.name : '？？？',
        onclick: () => {
          audio.sfx('select');
          if (has) toast(`${t.name}：${t.note}`);
          else toast(t.id.endsWith('8') ? `隠しお宝のヒント: ${dg.hidden.text}` : t.id.endsWith('7') ? '最奥の大扉の奥にある' : `${Number(t.id.slice(1)) + 1}Fを突破すると見つかる`);
        },
      }, img(tImg(t.id))));
    }
  }
  openModal(`お宝図鑑 ${save.treasures.length}/${TREASURE_IDS.length}`, [h('div', { class: 'dex' }, ...cells)]);
}
function openTools() {
  audio.sfx('page');
  const all = Object.keys(TOOLS);
  openModal(`道具 ${save.tools.length}/16`, [h('div', { class: 'toollist' }, ...all.map((id) => {
    const has = save.tools.includes(id);
    const t = TOOLS[id];
    return h('div', { class: `toolrow ${has ? '' : 'no'}` }, img(`img/tool/${id}.webp`),
      h('div', {}, h('b', { text: has ? `${t.name}（${t.cd}手）` : '？？？' }),
        h('small', {}, has ? h('i', { style: `background:${ORB_COLORS[COLORS.indexOf(t.color)].base}` }) : null, has ? `${COLOR_NAME[t.color]}が強くなる。${t.skill}` : 'どこかのダンジョンを踏破すると手に入る')));
  })), h('p', { class: 'muted', text: '持ち物は、ダンジョンに出発する前に4つまで選べます。' })]);
}
function openFrames() {
  audio.sfx('page');
  const box = h('div', { class: 'frames' });
  const coin = h('b', { text: String(save.coins) });
  const draw = () => box.replaceChildren(...FRAMES.map((f) => {
    const has = save.frames.includes(f.id);
    const c = h('canvas', { width: '260', height: '192' });
    frameThumb(c, f.id);
    const btn = has
      ? h('button', { class: `btn small ${save.frame === f.id ? 'gold' : ''}`, type: 'button', disabled: save.frame === f.id ? true : null, onclick: () => { save.frame = f.id; audio.sfx('select'); persist(); draw(); } }, save.frame === f.id ? '着けている' : '着ける')
      : h('button', { class: 'btn small', type: 'button', disabled: save.coins < f.price ? true : null, onclick: () => { if (R.buyFrame(save, f.id)) { audio.sfx('buy'); persist(); coin.textContent = String(save.coins); toast(`${f.name}を手に入れた！`); draw(); } } }, `${f.price} コインで買う`);
    return h('div', { class: save.frame === f.id ? 'on' : '' }, c, h('b', { text: f.name }), h('small', { text: f.desc }), btn);
  }));
  draw();
  openModal('枠', [h('p', {}, '持っているコイン: ', coin, ' 枚'), box, h('p', { class: 'muted', text: 'コインはフロアの突破とダンジョンの踏破でもらえます。踏破したダンジョンには何度でも行けます。' })],
    { onClose: () => { if (scene === 'title') toTitle(); } });
}
function soundRows() {
  const a = getAudioSettings(GAME_ID);
  const store = () => { setAudioSettings(GAME_ID, a); audio.apply(a); };
  const row = (label, key) => h('div', { class: 'row' },
    h('label', { for: `vol-${key}`, text: label }),
    h('input', {
      id: `vol-${key}`, type: 'range', min: '0', max: '100', value: String(Math.round(a[key].volume * 100)),
      oninput: (e) => { a[key].volume = Number(e.target.value) / 100; store(); },
      onchange: () => { audio.unlock(); if (key === 'sfx') audio.sfx('combo', 3); },
    }),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: a[key].muted ? true : null, onchange: (e) => { a[key].muted = e.target.checked; store(); } }), 'ミュート'));
  return [h('h3', { text: '音' }), row('BGM', 'bgm'), row('効果音', 'sfx')];
}
function openSettings() {
  audio.sfx('page');
  const st = save.stats;
  const mins = Math.round(st.playMs / 60000);
  openModal('設定', [
    ...soundRows(),
    h('h3', { text: 'あそびかた' }),
    h('ul', { class: 'howto' },
      h('li', { text: '球を1つつかんで指をはなさずに動かすと、通った球と入れ替わります。最初に入れ替えてから5秒で手が止まります（枠で延長）。' }),
      h('li', { text: '同じ色が縦か横に3つ以上並ぶと消えます。落ちてきた球でまた並んでも消えます。消えた組の数がコンボです。' }),
      h('li', { text: '5つ以上つなげて消すと、その組は威力1.5倍。弱点の色は2倍、効きにくい色は弱くなります。' }),
      h('li', { text: '仕掛けが2つ以上あるときは、タップで狙う仕掛けを選べます。' }),
      h('li', { text: '道具のスキルは、何手か進むとたまって光ります。タップで使えます。' })),
    h('div', { class: 'stats' },
      h('div', {}, '遊んだ時間', h('b', { text: `${Math.floor(mins / 60)}時間${mins % 60}分` })),
      h('div', {}, '最大コンボ', h('b', { text: `${st.maxCombo}` })),
      h('div', {}, '踏破', h('b', { text: `${st.clears}回` })),
      h('div', {}, '撤退', h('b', { text: `${st.retreats}回` }))),
    h('p', { class: 'muted', text: '進み具合は自動で保存されます。バックアップはランチャーの⚙設定から。' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', type: 'button', onclick: confirmReset }, 'はじめから遊ぶ'),
      save.ending ? h('button', { class: 'btn small', type: 'button', onclick: () => { closeModal(); showEnding(); } }, 'エンディングを見る') : null,
      h('button', { class: 'btn gold', type: 'button', onclick: closeModal }, 'とじる')),
  ]);
}
function confirmReset() {
  openModal('はじめから遊ぶ', [
    h('p', { text: 'お宝・道具・枠・コイン・進み具合をすべて消して、最初からにします。元に戻せません。' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', type: 'button', onclick: closeModal }, 'やめる'),
      h('button', { class: 'btn gold', type: 'button', onclick: () => { save = R.newSave(); persist(); closeModal(); toTitle(); } }, '消して始める')),
  ]);
}

// ---- トースト・モーダル ----
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), Math.min(5000, 1800 + msg.length * 45));
}
let modalOnClose = null;
function openModal(title, body, { closable = true, onClose = null } = {}) {
  const panel = $('modal-panel');
  const kids = [];
  if (title || closable) {
    const head = h('h2', {}, h('span', { text: title }));
    if (closable) head.append(h('button', { class: 'iconbtn', type: 'button', 'aria-label': '閉じる', onclick: closeModal }, '✕'));
    kids.push(head);
  }
  panel.replaceChildren(...kids, ...body);
  $('modal').hidden = false;
  $('modal').dataset.closable = closable ? '1' : '';
  modalOnClose = onClose;
  panel.scrollTop = 0;
}
function closeModal() {
  $('modal').hidden = true;
  const f = modalOnClose;
  modalOnClose = null;
  f?.();
}
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && $('modal').dataset.closable) closeModal(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden && $('modal').dataset.closable) closeModal(); });

// ---- ループ ----
let last = 0;
let playAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  stepTweens(now);
  if (scene !== 'battle' || !run) return;
  if (document.visibilityState === 'visible' && !paused) playAcc += dt * 1000;
  if (playAcc > 5000) { save.stats.playMs += Math.round(playAcc); playAcc = 0; }
  // 動かせる時間
  if (held && deadline) {
    const left = Math.max(0, deadline - now) / (R.moveTime(run) * 1000);
    $('timer-fill').style.transform = `scaleX(${left})`;
    if (left <= 0) release();
  } else $('timer-fill').style.transform = 'scaleX(1)';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, layout.w, layout.h);
  drawFrame(g, layout.x, layout.y, layout.cs * COLS, layout.cs * ROWS, layout.ft, run.frame, now / 1000);
  drawBoard(g, layout, run.board, vis, held, { dpr, ghosts, hidden, dim: phase === 'resolve' && false, dungeon: DUNGEONS[run.d].id });
}

// ---- 起動 ----
async function loadInitial() {
  let rec;
  try {
    rec = await loadSave(GAME_ID);
  } catch {
    showFatal('保存領域を開けませんでした', 'ブラウザの設定で保存（Cookie・サイトデータ）が許可されているか確認してください。プライベートブラウズでは保存できない場合があります。');
    return null;
  }
  if (!rec) return { s: R.newSave(), rev: null };
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
        h('a', { class: 'btn small', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn gold', type: 'button', onclick: () => { closeModal(); resolve({ s: R.newSave(), rev: rec.rev }); } }, 'はじめから遊ぶ')),
    ], { closable: false });
  });
}
function showFatal(title, text) {
  blocked = true;
  openModal(title, [h('p', { text }), h('div', { class: 'actions' },
    h('a', { class: 'btn small', href: '../../index.html' }, 'ランチャーへ'),
    h('button', { class: 'btn gold', type: 'button', onclick: () => location.reload() }, '再読み込み'))], { closable: false });
}
async function waitLock() {
  if (await holdGameLock(GAME_ID)) return;
  await new Promise((resolve) => {
    const retry = async () => { if (await holdGameLock(GAME_ID)) { closeModal(); resolve(); } else toast('まだ別の画面で開かれています。'); };
    openModal('別の画面で遊んでいます', [
      h('p', { text: 'パズトレは別のタブ（またはホーム画面版）で開かれています。データの上書きを防ぐため、そちらを閉じてから「もう一度確認」を押してください。' }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn small', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn gold', type: 'button', onclick: retry }, 'もう一度確認')),
    ], { closable: false });
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (held) release();
    if (save) persist();
  }
});
window.addEventListener('pageshow', (e) => { if (e.persisted) leaving = false; });

async function boot() {
  audio.apply(getAudioSettings(GAME_ID));
  await waitLock();
  const init = await loadInitial();
  if (!init) return;
  save = init.s;
  rev = init.rev;
  if (validate(save).length) console.warn('save invalid', validate(save));
  toTitle();
  requestAnimationFrame(frame);
  initServiceWorker('../../sw.js', {
    onUpdate: () => toast('新しい版を準備しました。ランチャーに戻ると更新できます。'),
  }).catch(() => {});
  // テスト用の読み取り専用フック
  window.__puztre = {
    get save() { return structuredClone(save); },
    get scene() { return scene; },
    get phase() { return phase; },
    get run() { return run && { d: run.d, floor: run.floor, hp: run.hp, turn: run.turn, traps: run.traps.map((t) => ({ id: t.id, hp: t.hp, cd: t.cd })), board: run.board.map((row) => row.map((x) => x.c)) }; },
    cellCenter: (r, c) => { const rc = canvas.getBoundingClientRect(); return { x: rc.left + layout.x + (c + 0.5) * layout.cs, y: rc.top + layout.y + (r + 0.5) * layout.cs }; },
    saving: () => saving || dirty,
  };
}

boot();

// にげろ！とうふ: 画面・操作・記録
import { GAME_ID, SCHEMA, OBSTACLES, OBSTACLE_IDS, MISSIONS, SKINS, INTRO, ZONES } from './data.js';
import * as S from './sim.js';
import { upgrade, validate } from './save-schema.js';
import { makeView, makeFx, fxEvent, drawGame, drawTitle, drawTofuFront, thumb } from './render.js';
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
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

// ---- 状態 ----
let save = null;
let rev = null;
let blocked = false;
let scene = 'boot';         // 'title' | 'run' | 'over' | 'boot'
let paused = false;
let run = null;
let fx = makeFx();
let lastResult = null;
const canvas = $('view');
const g = canvas.getContext('2d');
let view = null;
let dpr = 1;

// ---- 保存（直列化して最新だけ書き込む） ----
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
      rev = await writeSave(GAME_ID, { schema: SCHEMA, data: snap, summary: S.saveSummary(snap) }, rev);
      lastJson = json;
      $('save-banner').hidden = true;
    } catch (e) {
      if (e instanceof ConflictError) {
        blocked = true;
        openModal('データが更新されました', [
          h('p', { text: '別のタブやランチャー（バックアップ復元）でこのゲームのデータが更新されました。上書きを防ぐため、この画面では保存を止めています。' }),
          h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, '再読み込みする')),
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

// ---- 画面の大きさ ----
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  view = makeView(W, H);
}
window.addEventListener('resize', resize);

// ---- 操作（スワイプ・キー） ----
let touch = null;
const SWIPE = 22;
function command(cmd) {
  if (scene !== 'run' || paused || !run || run.dead) return;
  const ev = S.act(run, cmd);
  handle(ev);
}
window.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (scene !== 'run' || e.target.closest('button, a, .panel')) return;
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
});
window.addEventListener('pointermove', (e) => {
  if (!touch || touch.id !== e.pointerId || touch.fired) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < SWIPE) return;
  touch.fired = true;
  command(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
});
const endTouch = (e) => { if (touch && touch.id === e.pointerId) touch = null; };
window.addEventListener('pointerup', endTouch);
window.addEventListener('pointercancel', endTouch);
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  const map = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', ' ': 'up', arrowdown: 'down', s: 'down' };
  if (map[k] && scene === 'run') { e.preventDefault(); audio.unlock(); if (!e.repeat) command(map[k]); }
  if (k === 'escape') { if (!$('modal').hidden && $('modal').dataset.closable) closeModal(); else if (scene === 'run') pauseRun(); }
  if ((k === 'enter' || k === ' ') && scene === 'title' && $('modal').hidden && $('intro').hidden) { e.preventDefault(); startRun(); }
});

// ---- 走る ----
let negiChain = 0;
let negiChainAt = 0;
let bestShown = false;
let hintStep = -1;
function startRun() {
  if (!save || blocked) return;
  audio.unlock();
  if (!save.intro) { showIntro(); return; }
  run = S.newRun((Math.random() * 2 ** 32) >>> 0, { tutorial: save.stats.runs === 0 });
  fx = makeFx();
  scene = 'run';
  paused = false;
  bestShown = save.best === 0;
  hintStep = save.stats.runs < 2 ? 0 : -1;
  $('title').hidden = true;
  $('over').hidden = true;
  $('hud').hidden = false;
  $('hud-banner').hidden = true;
  audio.setSong('run');
  audio.sfx('start');
  renderHud();
}
function endRun() {
  const r = S.result(run);
  const out = S.applyRun(save, r);
  lastResult = { r, out };
  persist();
  scene = 'over';
  setTimeout(() => { if (scene === 'over') showResult(); }, 1100);
}
function handle(events) {
  for (const e of events) {
    fxEvent(fx, e, run, save.skin);
    switch (e.type) {
      case 'jump': audio.sfx('jump'); break;
      case 'land': audio.sfx('land'); break;
      case 'slide': audio.sfx('slide'); break;
      case 'lane': audio.sfx('lane', e.dir === 'left' ? 0 : 1); break;
      case 'pick':
        if (e.kind === 'negi') {
          const now = performance.now();
          negiChain = now - negiChainAt < 600 ? negiChain + 1 : 0;
          negiChainAt = now;
          audio.sfx('negi', negiChain);
          const el = $('hud-negi').parentElement;
          el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        } else if (e.kind === 'ice') { audio.sfx('ice'); toast('氷のまもり！ 1回だけ崩れません'); }
        else { audio.sfx('katsuo'); toast('かつおぶし！ ねぎが寄ってきます'); }
        break;
      case 'shieldBreak': audio.sfx('shield'); toast('氷が割れて、助かった！'); break;
      case 'crash':
        audio.sfx('crash');
        audio.setSong('over');
        $('hud-hint').hidden = true;
        endRun();
        break;
      case 'zone':
        audio.sfx('zone');
        banner(e.lap > 0 && e.zone.id === 'kitchen' ? `${e.lap + 1}周目・夜の台所` : `${e.zone.name}に到着！`);
        break;
      default:
    }
  }
}
let bannerTimer = null;
function banner(text, cls = '') {
  const b = $('hud-banner');
  b.textContent = text;
  b.className = `banner ${cls}`;
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 1700);
}
function renderHud() {
  if (!run) return;
  $('hud-dist').textContent = String(Math.floor(run.d));
  $('hud-negi').textContent = String(run.negi);
  const best = save.best;
  $('hud-best').textContent = best > 0 ? (run.d > best ? '自己ベスト更新中！' : `自己ベスト ${best}m`) : '';
  if (!bestShown && run.d > best) { bestShown = true; banner('自己ベスト更新！', 'best'); audio.sfx('best'); }
  audio.setTempo(1 + Math.min(0.25, (run.v - 8) / 50));
  // はじめの2回は、次の障害物に合わせて操作を案内
  if (hintStep >= 0 && !run.dead) {
    const next = run.obs.filter((o) => o.z > run.d + 0.3).sort((a, b) => a.z - b.z);
    const o = next[0];
    let text = '';
    if (run.d < 30) text = '<b>← →</b> 指を左右にはらって、よける';
    else if (o && o.z - run.d < 22) {
      const lanes = next.filter((x) => Math.abs(x.z - o.z) < 0.1);
      const blocked3 = lanes.length === 3;
      if (o.type === 'low' && blocked3) text = '<b>↑</b> 上にはらって、跳ぶ';
      else if (o.type === 'high' && blocked3) text = '<b>↓</b> 下にはらって、つぶれてくぐる';
      else text = '<b>← →</b> あいているところへ、よける';
    }
    const el = $('hud-hint');
    if (text) { if (el.innerHTML !== text) el.innerHTML = text; el.hidden = false; } else el.hidden = true;
    if (run.d > 260) { hintStep = -1; el.hidden = true; }
  }
}

// ---- 結果 ----
function showResult() {
  const { r, out } = lastResult;
  $('hud').hidden = true;
  const o = OBSTACLES[r.cause];
  $('over-death').textContent = o ? o.death : 'とちゅうでやめた。';
  $('over-dist').textContent = `${r.dist}m`;
  $('over-negi').textContent = `${r.negi}`;
  const badges = [];
  if (out.best) badges.push(h('span', { class: 'badge', text: '自己ベスト更新！' }));
  else if (out.rank) badges.push(h('span', { class: 'badge', text: `歴代 ${out.rank}位` }));
  if (out.newDeath) badges.push(h('span', { class: 'badge dex', text: `図鑑に登録：${o.name}` }));
  $('over-badges').replaceChildren(...badges);
  const done = out.done.map((id) => h('li', { text: `お題達成：${MISSIONS.find((m) => m.id === id).text}` }));
  for (const id of out.unlocked) done.push(h('li', { class: 'skin', text: `新しいとうふ「${SKINS.find((k) => k.id === id).name}」が選べるようになりました` }));
  $('over-done').replaceChildren(...done);
  $('over').hidden = false;
  overT = 0;
  if (out.best || out.done.length) audio.sfx(out.best ? 'best' : 'mission');
  $('btn-again').focus({ preventScroll: true });
}
let overT = 0;
$('btn-again').addEventListener('click', () => { audio.sfx('select'); startRun(); });
$('btn-totitle').addEventListener('click', () => { audio.sfx('select'); toTitle(); });

function toTitle() {
  scene = 'title';
  run = null;
  paused = false;
  $('hud').hidden = true;
  $('over').hidden = true;
  $('title').hidden = false;
  audio.setSong('title');
  renderTitle();
}
function renderTitle() {
  $('title-best').textContent = save.best > 0 ? `自己ベスト ${save.best}m` : '';
  $('chip-missions').textContent = `${save.missions.length}/${MISSIONS.length}`;
  $('chip-dex').textContent = `${Object.keys(save.deaths).length}/${OBSTACLE_IDS.length}`;
  $('chip-skin').textContent = SKINS.find((k) => k.id === save.skin).name;
}

// ---- 一時停止 ----
function pauseRun() {
  if (scene !== 'run' || run?.dead) return;
  paused = true;
  openModal('ひと休み中', [
    h('p', { text: `いま ${Math.floor(run.d)}m・ねぎ ${run.negi}` }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { closeModal(); quitRun(); } }, 'やめてタイトルへ'),
      h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'つづける')),
    ...soundRows(),
  ], { onClose: () => { paused = false; } });
}
function quitRun() {
  // とちゅうでやめた走りも、距離とお題は記録する（崩れた扱いにはしない）
  const r = S.result(run);
  if (r.dist > 0) { S.applyRun(save, r); persist(); }
  toTitle();
}
$('btn-pause').addEventListener('click', () => pauseRun());

// ---- タイトルのメニュー ----
$('btn-run').addEventListener('click', () => startRun());
$('btn-settings').addEventListener('click', () => openSettings());
$('btn-missions').addEventListener('click', () => openMissions());
$('btn-dex').addEventListener('click', () => openDex());
$('btn-skins').addEventListener('click', () => openSkins());
$('btn-records').addEventListener('click', () => openRecords());
$('btn-back').addEventListener('click', (e) => { e.preventDefault(); audio.pause(); leaveToLauncher(); });
async function leaveToLauncher() {
  persist();
  const until = performance.now() + 1500;
  while ((saving || dirty) && !blocked && performance.now() < until) await new Promise((r) => setTimeout(r, 50));
  // 書き込みを締め切り、接続も閉じてから移る（iPhone でランチャーがセーブを読めなくなるのを防ぐ）
  leaving = true;
  await closeDB();
  location.href = '../../index.html';
}

function soundRows() {
  const a = getAudioSettings(GAME_ID);
  const store = () => { setAudioSettings(GAME_ID, a); audio.apply(a); };
  const row = (label, key) => h('div', { class: 'row' },
    h('label', { for: `vol-${key}`, text: label }),
    h('input', {
      id: `vol-${key}`, type: 'range', min: '0', max: '100', value: String(Math.round(a[key].volume * 100)),
      oninput: (e) => { a[key].volume = Number(e.target.value) / 100; store(); },
      onchange: () => { audio.unlock(); if (key === 'sfx') audio.sfx('negi'); },
    }),
    h('label', { class: 'check' }, h('input', {
      type: 'checkbox', checked: a[key].muted ? true : null,
      onchange: (e) => { a[key].muted = e.target.checked; store(); },
    }), 'ミュート'));
  return [h('h3', { text: '音' }), row('BGM', 'bgm'), row('効果音', 'sfx')];
}
function openSettings() {
  audio.sfx('page');
  const mins = Math.round(save.stats.playMs / 60000);
  openModal('設定', [
    ...soundRows(),
    h('h3', { text: 'あそびかた' }),
    h('ul', { class: 'howto' },
      h('li', { text: '画面を指で左右にはらうと、となりの列へよけます。上にはらうと跳び、下にはらうと、ぺしゃっとつぶれて低いものの下をくぐります。' }),
      h('li', { text: 'PC は矢印キー（または WASD・スペース）で遊べます。' }),
      h('li', { text: '台所 → 食卓 → 縁側と庭 → 夜の商店街。先へ行くほど速くなります。2800m で台所に戻り、夜になります。' }),
      h('li', { text: '氷をとると1回だけ崩れません。かつおぶしをとると、しばらくねぎが寄ってきます。' }),
      h('li', { text: 'お題を達成すると、とうふの種類が増えます（見た目だけ）。崩れかたは図鑑に集まります。' })),
    h('div', { class: 'stats' }, h('div', {}, '遊んだ時間', h('b', { text: `${Math.floor(mins / 60)}時間${mins % 60}分` })), h('div', {}, '走った回数', h('b', { text: `${save.stats.runs}回` }))),
    h('h3', { text: 'データ' }),
    h('p', { class: 'muted', text: '記録は自動で保存されます。バックアップはランチャーの⚙設定から。' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: confirmReset }, 'はじめから遊ぶ'),
      h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'とじる')),
  ]);
}
function confirmReset() {
  openModal('はじめから遊ぶ', [
    h('p', { text: '自己ベスト・お題・図鑑・とうふの種類をすべて消して、最初からにします。元に戻せません。' }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'やめる'),
      h('button', { class: 'btn', type: 'button', onclick: () => { save = S.newSave(); save.intro = true; persist(); closeModal(); renderTitle(); } }, '消して始める')),
  ]);
}
function openMissions() {
  audio.sfx('page');
  const n = save.missions.length;
  const next = SKINS.find((k) => k.need > n);
  openModal(`お題 ${n}/${MISSIONS.length}`, [
    next ? h('p', { class: 'progress', text: `あと ${next.need - n}つ達成で「${next.name}」が選べます` }) : h('p', { class: 'progress', text: 'すべてのとうふが選べます。おつかれさまでした！' }),
    h('ul', { class: 'mlist' }, ...MISSIONS.map((m) => {
      const ok = save.missions.includes(m.id);
      return h('li', { class: ok ? 'ok' : '' }, h('i', { text: ok ? '✓' : '' }), m.text);
    })),
    h('p', { class: 'muted', text: '「1回で」のお題は、1回の走りの中で達成します。' }),
  ]);
}
function openDex() {
  audio.sfx('page');
  const n = Object.keys(save.deaths).length;
  const cells = OBSTACLE_IDS.map((id) => {
    const o = OBSTACLES[id];
    const got = save.deaths[id];
    const c = h('canvas', { width: '152', height: '152' });
    thumb(c, id, { silhouette: !got });
    const zone = ZONES.find((z) => z.id === o.zone).name;
    return h('div', { class: got ? '' : 'no' }, c, h('b', { text: got ? o.name : '？？？' }),
      h('p', { text: got ? o.death : `${zone}のどこかで…` }), got ? h('small', { text: `${got}回` }) : null);
  });
  openModal(`くずれかた図鑑 ${n}/${OBSTACLE_IDS.length}`, [h('div', { class: 'dex' }, ...cells)]);
}
function openSkins() {
  audio.sfx('page');
  const n = save.missions.length;
  const list = h('div', { class: 'skins' });
  const draw = () => list.replaceChildren(...SKINS.map((k) => {
    const ok = n >= k.need;
    const c = h('canvas', { width: '168', height: '168' });
    const cg = c.getContext('2d');
    drawTofuFront(cg, 84, 150, 92, k.id, ok ? 'happy' : 'run', 0.3);
    if (!ok) { cg.globalCompositeOperation = 'source-atop'; cg.fillStyle = 'rgba(80,66,54,.97)'; cg.fillRect(0, 0, 168, 168); }
    return h('button', {
      type: 'button', 'aria-pressed': String(save.skin === k.id), disabled: ok ? null : true,
      onclick: () => { save.skin = k.id; audio.sfx('select'); persist(); draw(); renderTitle(); },
    }, c, h('b', { text: ok ? k.name : '？？？' }), h('small', { text: ok ? k.note : `お題 ${k.need}個で` }));
  }));
  draw();
  openModal('とうふをえらぶ', [list, h('p', { class: 'muted', text: '見た目だけが変わります。崩れやすさはみんな同じです。' })]);
}
function openRecords() {
  audio.sfx('page');
  const st = save.stats;
  const fmt = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`; };
  const top = save.top.length ? h('ol', { class: 'top5' }, ...save.top.map((e) => h('li', {},
    h('b', { text: `${e.d}m` }), h('small', { text: `${e.cause ? OBSTACLES[e.cause].name + 'で' : 'やめた'}・ねぎ${e.negi}` }), h('small', { text: fmt(e.at) }))))
    : h('p', { text: 'まだ記録がありません。' });
  const mins = Math.round(st.playMs / 60000);
  openModal('記録', [
    h('h3', { text: '自分の歴代トップ5' }), top,
    h('h3', { text: '通算' }),
    h('div', { class: 'stats' },
      h('div', {}, '走った回数', h('b', { text: `${st.runs}回` })),
      h('div', {}, '走った距離', h('b', { text: `${st.dist.toLocaleString('ja-JP')}m` })),
      h('div', {}, 'とったねぎ', h('b', { text: `${st.negi.toLocaleString('ja-JP')}` })),
      h('div', {}, '跳んだ回数', h('b', { text: `${st.jumps}` })),
      h('div', {}, 'つぶれた回数', h('b', { text: `${st.slides}` })),
      h('div', {}, '遊んだ時間', h('b', { text: `${Math.floor(mins / 60)}時間${mins % 60}分` }))),
    h('p', { class: 'muted', text: '記録はこの端末の中だけに残ります。' }),
  ]);
}

// ---- 導入 ----
let introK = 0;
function showIntro() {
  introK = 0;
  $('intro-text').textContent = INTRO[0];
  $('intro').hidden = false;
}
$('intro').addEventListener('click', () => {
  audio.unlock();
  introK++;
  if (introK < INTRO.length) { audio.sfx('page'); $('intro-text').textContent = INTRO[introK]; const p = $('intro-text'); p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; return; }
  $('intro').hidden = true;
  save.intro = true;
  persist();
  startRun();
});

// ---- トースト・モーダル ----
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), Math.min(4000, 1600 + msg.length * 40));
}
let modalOnClose = null;
function openModal(title, body, { closable = true, onClose = null } = {}) {
  const panel = $('modal-panel');
  const head = h('h2', {}, h('span', { text: title }));
  if (closable) head.append(h('button', { class: 'iconbtn', type: 'button', 'aria-label': '閉じる', onclick: closeModal }, '✕'));
  panel.replaceChildren(head, ...body);
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

// ---- ループ ----
let last = 0;
let playAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!view) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  const t = now / 1000;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (scene === 'run' || scene === 'over') {
    const active = scene === 'run' && !paused && !blocked && document.visibilityState === 'visible';
    if (active) {
      // 細かく刻んで進める（速くなっても当たり判定がすり抜けない）
      const n = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < n && scene === 'run'; i++) handle(S.step(run, dt / n));
      playAcc += dt * 1000;
      renderHud();
    } else if (scene === 'over') {
      S.step(run, dt);
      overT += dt;
      playAcc += dt * 1000;
    }
    if (playAcc > 1000) { save.stats.playMs += Math.round(playAcc); playAcc = 0; }
    drawGame(g, view, run, save.skin, fx, t, active || scene === 'over' ? dt : 0);
    if (scene === 'over' && !$('over').hidden) drawOverTofu(t);
  } else if (scene === 'title') {
    drawTitle(g, view, save.skin, t);
  }
}
function drawOverTofu(t) {
  const c = $('over-tofu');
  const cg = c.getContext('2d');
  cg.clearRect(0, 0, c.width, c.height);
  // くずれたとうふ（少しずつ形が戻ろうとする）
  cg.save();
  cg.scale(2, 2);
  cg.translate(120, 196);
  const k = Math.min(1, overT * 1.5);
  cg.scale(1 + (1 - k) * 0.3 + Math.sin(t * 5) * 0.015, 1 - (1 - k) * 0.4);
  drawTofuFront(cg, 0, 0, 104, save.skin, 'dead', t);
  cg.restore();
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
  if (!rec) return { s: S.newSave(), rev: null };
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
        h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); resolve({ s: S.newSave(), rev: rec.rev }); } }, 'はじめから遊ぶ')),
    ], { closable: false });
  });
}
function showFatal(title, text) {
  blocked = true;
  openModal(title, [h('p', { text }), h('div', { class: 'actions' },
    h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
    h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, '再読み込み'))], { closable: false });
}
async function waitLock() {
  if (await holdGameLock(GAME_ID)) return;
  await new Promise((resolve) => {
    const retry = async () => { if (await holdGameLock(GAME_ID)) { closeModal(); resolve(); } else toast('まだ別の画面で開かれています。'); };
    openModal('別の画面で遊んでいます', [
      h('p', { text: 'にげろ！とうふは別のタブ（またはホーム画面版）で開かれています。データの上書きを防ぐため、そちらを閉じてから「もう一度確認」を押してください。' }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn', type: 'button', onclick: retry }, 'もう一度確認')),
    ], { closable: false });
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (scene === 'run' && !paused && run && !run.dead) pauseRun();
    if (save) persist();
  }
  last = performance.now();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) leaving = false; });

async function boot() {
  resize();
  audio.apply(getAudioSettings(GAME_ID));
  await waitLock();
  const init = await loadInitial();
  if (!init) return;
  save = init.s;
  rev = init.rev;
  if (validate(save).length) console.warn('save invalid', validate(save));
  toTitle();
  last = performance.now();
  requestAnimationFrame(frame);
  initServiceWorker('../../sw.js', {
    onUpdate: () => toast('新しい版を準備しました。ランチャーに戻ると更新できます。'),
  }).catch(() => {});
  // テスト用の読み取り専用フック
  window.__tofu = {
    get save() { return structuredClone(save); },
    get scene() { return scene; },
    get run() { return run && { d: run.d, lane: run.lane, y: run.y, slide: run.slideT > 0, dead: run.dead?.kind ?? null, negi: run.negi, obs: run.obs.map((o) => ({ z: o.z, lane: o.lane, type: o.type })) }; },
    get paused() { return paused; },
    saving: () => saving || dirty,
  };
}

boot();

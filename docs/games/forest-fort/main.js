// 森のとりで: 画面・操作・進行
import {
  GAME_ID, SCHEMA, PADS, WAVES, DIALOGUES, WEAPONS, ALLIES, TOWERS, CORE_NAMES, WALL_NAMES, SMITH_MULT, STAT_STEP,
} from './data.js';
import * as S from './sim.js';
import { upgrade, validate } from './save-schema.js';
import { loadImages, makeCamera, follow, draw } from './render.js';
import { audio } from './audio.js';
import { loadSave, loadPrevSave, writeSave, holdGameLock, ConflictError } from '../../shared/storage.js';
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
let world = null;
let rev = null;
let blocked = false;
let paused = false;
const canvas = $('view');
const g = canvas.getContext('2d');
const ui = { dpr: 1 };
let cam = null;

// ---- 保存（直列化して最新だけ書き込む） ----
let saving = false;
let dirty = false;
let lastSaveAt = 0;
let changed = false;   // まだ保存していない変化（コインなど）
async function persist() {
  dirty = true;
  if (saving || blocked || !world) return;
  saving = true;
  while (dirty && !blocked) {
    dirty = false;
    const snap = structuredClone(S.syncSave(world));
    try {
      rev = await writeSave(GAME_ID, { schema: SCHEMA, data: snap, summary: S.saveSummary(snap) }, rev);
      lastSaveAt = performance.now();
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

// ---- 入力（指を置いた場所が仮想スティックの中心） ----
const input = { x: 0, y: 0 };
const keys = new Set();
let stick = null;   // { id, ox, oy }
const STICK_R = 56;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (stick) return;
  stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
  canvas.setPointerCapture?.(e.pointerId);
  const j = $('joy');
  j.style.left = `${e.clientX}px`;
  j.style.top = `${e.clientY}px`;
  $('knob').style.transform = 'translate(0,0)';
  j.hidden = false;
});
canvas.addEventListener('pointermove', (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox;
  let dy = e.clientY - stick.oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
  $('knob').style.transform = `translate(${dx}px,${dy}px)`;
  const k = d < 8 ? 0 : 1;
  input.x = k * dx / STICK_R;
  input.y = k * dy / STICK_R;
});
const endStick = (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  stick = null;
  input.x = 0;
  input.y = 0;
  $('joy').hidden = true;
};
canvas.addEventListener('pointerup', endStick);
canvas.addEventListener('pointercancel', endStick);
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); audio.unlock(); }
  if (k === 'escape') togglePause();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); input.x = 0; input.y = 0; stick = null; $('joy').hidden = true; });
function currentInput() {
  if (stick) return input;
  const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  return { x, y };
}

// ---- 画面の大きさ ----
function resize() {
  ui.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  canvas.width = Math.round(cw * ui.dpr);
  canvas.height = Math.round(ch * ui.dpr);
  cam = makeCamera(cw, ch);
}
window.addEventListener('resize', resize);

// ---- ループ ----
let last = 0;
let playAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!world) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  const running = !paused && !blocked && !talking && $('modal').hidden && document.visibilityState === 'visible';
  if (running) {
    const events = S.step(world, currentInput(), dt);
    handleEvents(events);
    playAcc += dt * 1000;
    if (playAcc > 1000) { save.stats.playMs += Math.round(playAcc); playAcc = 0; }
    // コインの変化などは、最後の保存から4秒たってからまとめて保存
    if (changed && now - lastSaveAt > 4000) { changed = false; persist(); }
  }
  follow(cam, world.hero);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#2f4a2a';
  g.fillRect(0, 0, canvas.width, canvas.height);
  draw(g, cam, world, ui);
  renderHud();
}

// ---- 出来事 → 音・表示・保存 ----
function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'shoot': audio.sfx(e.shot === 'bullet' || e.shot === 'shell' ? 'gun' : e.shot === 'swing' ? 'swing' : 'shoot'); break;
      case 'hit': audio.sfx('hit'); break;
      case 'kill': audio.sfx('kill'); break;
      case 'coin': audio.sfx('coin'); bump(); changed = true; break;
      case 'pay': audio.sfx('pay'); changed = true; break;
      case 'build':
        audio.sfx('build');
        toast(buildMessage(e.pad, e.level));
        persist();
        if (e.pad === 'core') queueAfterCore(e.level);
        break;
      case 'hurt': audio.sfx('hurt'); break;
      case 'heroDown': audio.sfx('down'); break;
      case 'wallHit': audio.sfx('wall'); if (e.broken) toast('柵が壊されました！ 中心を守りましょう'); break;
      case 'bossTell': audio.sfx('tell'); break;
      case 'stomp': audio.sfx('stomp'); break;
      case 'bossAppear': audio.setSong('boss'); break;
      case 'waveStart':
        audio.sfx('horn');
        audio.setSong(e.boss ? 'boss' : 'night');
        toast(`ウェーブ ${e.wave} — 夜がきます！`);
        break;
      case 'waveWon':
        audio.sfx('win');
        audio.setSong(e.ending ? 'dawn' : 'day');
        toast(`ウェーブ ${e.wave} を守りきりました！（+${e.reward}コイン）`);
        persist();
        maybeTalk();
        break;
      case 'waveLost':
        audio.sfx('lose');
        audio.setSong('day');
        persist();
        openModal(`ウェーブ ${e.wave} は守りきれませんでした`, [
          h('p', { text: '砦の中心が壊されてしまいました。でも大丈夫。強化とコインはそのままです。' }),
          h('p', { class: 'muted', text: 'ヒント: 仲間を増やす・柵を強くする・見張り台を建てると守りやすくなります。休憩中の魔物を倒してコインを集めてから挑むこともできます。' }),
          h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, '休憩にもどる')),
        ]);
        break;
      default:
    }
  }
}
function bump() {
  const c = $('coins');
  c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
}
function queueAfterCore(level) {
  if (level === 2) toast('砦が丸太小屋になりました。くまの盾兵・りすの投石兵・鍛冶場などの台座が現れました！');
  if (level === 3) toast('砦が石造りになりました。ふくろうの癒し手と、新しい見張り台が建てられます！');
}

// ---- 台座の説明 ----
function padDesc(p, level) {
  const next = level + 1;
  switch (p.kind) {
    case 'core': return `${CORE_NAMES[level]} → ${CORE_NAMES[next]}。中心が丈夫になり、新しい台座が現れます。`;
    case 'weapon': return `${WEAPONS[level - 1].name} → ${WEAPONS[next - 1].name}`;
    case 'wall': return `${WALL_NAMES[level]} → ${WALL_NAMES[next]}。壊れても休憩中に直ります。`;
    case 'ally': return `${ALLIES[p.ally].name}を ${level}人 → ${next}人に。持ち場で自動で戦います。`;
    case 'tower': return `${TOWERS[next].name}を建てる（射程が長い）`;
    case 'smith': return `仲間の攻撃（癒しの力も）が ${Math.round(SMITH_MULT[level - 1] * 100)}% → ${Math.round(SMITH_MULT[next - 1] * 100)}%`;
    case 'stat': return p.stat === 'hp' ? `最大体力 +${STAT_STEP.hp}` : p.stat === 'speed' ? `歩く速さ +${Math.round(STAT_STEP.speed * 100)}%` : `コインを引き寄せる範囲が広がる`;
    default: return '';
  }
}
function buildMessage(id, level) {
  const p = S.padById(id);
  switch (p.kind) {
    case 'core': return `砦の中心が「${CORE_NAMES[level]}」になりました！`;
    case 'weapon': return `武器が「${WEAPONS[level - 1].name}」になりました！`;
    case 'wall': return `${p.name}が「${WALL_NAMES[level]}」になりました！`;
    case 'ally': return `${ALLIES[p.ally].name}が仲間に加わりました！（${level}人）`;
    case 'tower': return `${TOWERS[level].name}が建ちました！`;
    default: return `${p.name}が強くなりました！`;
  }
}

// ---- 画面上の表示 ----
let hudCache = '';
function renderHud() {
  const w = world;
  const hp = w.hero;
  const wave = save.wave;
  const total = WAVES.length;
  const rest = w.phase === 'rest';
  const waveText = rest
    ? (save.cleared ? `休憩中・果てしない夜 ${wave}` : `休憩中・次は ${wave}/${total}`)
    : `夜 ${wave}${wave <= total ? `/${total}` : ''}・のこり ${S.remainingEnemies(w)}`;
  const onPad = hp.onPad;
  const key = [waveText, save.coins, Math.ceil(hp.hp), hp.maxHp, rest, onPad, onPad ? save.paid[onPad] ?? 0 : 0, hp.deadT > 0 ? Math.ceil(hp.deadT) : 0, hintText()].join('|');
  if (key === hudCache) return;
  hudCache = key;
  $('wave-pill').textContent = waveText;
  $('wave-pill').classList.toggle('night', !rest);
  $('coin-num').textContent = save.coins.toLocaleString('ja-JP');
  $('hp-fill').style.width = `${Math.max(0, hp.hp / hp.maxHp) * 100}%`;
  $('hp-text').textContent = `${Math.ceil(hp.hp)} / ${hp.maxHp}`;
  const btn = $('btn-wave');
  btn.hidden = !rest;
  const boss = wave <= total && S.isBossWave(wave);
  btn.classList.toggle('boss', boss);
  btn.textContent = boss ? `ボスのウェーブ ${wave} へ ▶` : `次のウェーブ（${wave}）へ ▶`;
  $('down').hidden = hp.deadT <= 0;
  $('down-t').textContent = String(Math.ceil(hp.deadT));
  const card = $('padcard');
  if (onPad) {
    const p = S.padById(onPad);
    const st = S.padState(save, p);
    card.replaceChildren(
      h('span', { class: 'lv', text: `段階 ${st.level} → ${st.level + 1}` }),
      h('b', { text: p.name }),
      h('p', { text: padDesc(p, st.level) }),
      h('p', { text: save.coins > 0 ? `立ち止まるとコインを払います（のこり ${st.cost - st.paid}）` : `コインが足りません（のこり ${st.cost - st.paid}）` }),
    );
    card.hidden = false;
  } else card.hidden = true;
  const ht = hintText();
  $('hint').textContent = ht;
  $('hint').hidden = !ht;
}
function hintText() {
  if (!world || world.phase === 'wave') return '';
  const st = save.stats;
  if (st.kills === 0) return '画面を押したまま指を動かすと歩けます。攻撃は自動です';
  if (st.wavesWon === 0 && world.phase === 'rest') {
    const any = PADS.some((p) => S.padState(save, p).visible && !S.padState(save, p).max && save.levels[p.id] > p.start);
    if (!any && save.coins >= 40) return 'コインがたまったら、光る台座の上で立ち止まりましょう';
    if (any) return '準備ができたら「次のウェーブ」へ。休憩中はいつでも中断できます';
  }
  return '';
}

// ---- ボタン ----
$('btn-wave').addEventListener('click', () => {
  audio.unlock();
  if (!world || world.phase !== 'rest') return;
  const n = save.wave;
  const bossTalk = { 5: 'boss5', 10: 'boss10', 15: 'boss15' }[n];
  if (bossTalk && !save.seen.includes(bossTalk)) S.queueTalk(save, bossTalk);
  persist();
  if (save.pending.length) { pendingWave = true; maybeTalk(); return; }
  S.startWave(world);
});
let pendingWave = false;
$('btn-settings').addEventListener('click', () => togglePause(true));
$('btn-back').addEventListener('click', (e) => {
  if (world?.phase === 'wave') {
    e.preventDefault();
    confirmBox('ランチャーへ戻りますか？', 'ウェーブの途中です。戻ると、このウェーブは最初からやり直しになります（強化とコインはそのまま）。', 'ランチャーへ', () => {
      audio.pause();
      leaveToLauncher();
    });
    return;
  }
  // 保存の書き込みを終えてから移る（書き込み中に画面が切り替わると、iPhone で次の画面の読み込みが止まることがある）
  e.preventDefault();
  audio.pause();
  leaveToLauncher();
});
async function leaveToLauncher() {
  if (world) S.syncSave(world);
  persist();
  const until = performance.now() + 1500;
  while ((saving || dirty) && !blocked && performance.now() < until) await new Promise((r) => setTimeout(r, 50));
  location.href = '../../index.html';
}

// ---- 一時停止・設定 ----
function togglePause(force) {
  if (!$('modal').hidden) { closeModal(); return; }
  if (force === false) return;
  openSettings();
}
function openSettings() {
  audio.sfx('page');
  const a = getAudioSettings(GAME_ID);
  const store = () => { setAudioSettings(GAME_ID, a); audio.apply(a); };
  const row = (label, key) => h('div', { class: 'row' },
    h('label', { for: `vol-${key}`, text: label }),
    h('input', {
      id: `vol-${key}`, type: 'range', min: '0', max: '100', value: String(Math.round(a[key].volume * 100)),
      oninput: (e) => { a[key].volume = Number(e.target.value) / 100; store(); },
      onchange: () => { audio.unlock(); if (key === 'sfx') audio.sfx('coin'); },
    }),
    h('label', { class: 'check' }, h('input', {
      type: 'checkbox', checked: a[key].muted ? true : null,
      onchange: (e) => { a[key].muted = e.target.checked; store(); },
    }), 'ミュート'));
  const st = save.stats;
  const mins = Math.round(st.playMs / 60000);
  openModal('一時停止中', [
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'ゲームにもどる')),
    h('h3', { text: '音' }), row('BGM', 'bgm'), row('効果音', 'sfx'),
    h('h3', { text: '記録' }),
    h('div', { class: 'stats' },
      h('div', {}, '遊んだ時間', h('b', { text: `${Math.floor(mins / 60)}時間${mins % 60}分` })),
      h('div', {}, '倒した魔物', h('b', { text: `${st.kills}` })),
      h('div', {}, '守りきった夜', h('b', { text: `${st.wavesWon}` })),
      h('div', {}, 'たおれた回数', h('b', { text: `${st.downs}` }))),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost small', type: 'button', onclick: openLog }, 'これまでのお話を読み返す')),
    h('h3', { text: 'あそびかた' }),
    h('ul', { class: 'howto' },
      h('li', { text: '画面のどこかを押したまま指を動かすと歩きます（PCは WASD・矢印キー）。攻撃は近くの魔物へ自動で。' }),
      h('li', { text: '魔物が落とすどんぐりコインを拾い、光る台座の上で立ち止まると、砦・仲間・武器が強くなります。' }),
      h('li', { text: '休憩中はいつまでも準備できます。「次のウェーブ」を押すと夜になり、魔物が押し寄せます。' }),
      h('li', { text: 'ボスの赤い印が出たら、その場所から離れましょう。たき火のそばでは体力が回復します。' }),
      h('li', { text: '砦の中心が壊されても、強化とコインは残ります。もう一度挑戦できます。' })),
    h('h3', { text: 'データ' }),
    h('p', { class: 'muted', text: '進行は自動で保存されます（ウェーブの途中で閉じた場合は、そのウェーブの前から再開）。バックアップはランチャーの⚙設定から。' }),
    h('div', { class: 'actions' },
      h('a', { class: 'btn ghost', href: '../../index.html', onclick: (e) => { e.preventDefault(); closeModal(); $('btn-back').click(); } }, 'ランチャーへ'),
      h('button', { class: 'btn ghost', type: 'button', onclick: confirmReset }, 'はじめから遊ぶ')),
  ]);
}
function confirmReset() {
  confirmBox('はじめから遊ぶ', '砦・仲間・コイン・ウェーブの進み具合をすべて消して、最初から始めます。元に戻せません。', '消して始める', () => {
    save = S.newSave();
    world = S.createWorld(save);
    audio.setSong('day');
    persist();
    maybeTalk();
  });
}
function openLog() {
  const items = save.seen.filter((id) => DIALOGUES[id]).map((id) => h('details', { class: 'log-item' },
    h('summary', { text: DIALOGUES[id].title }), ...DIALOGUES[id].lines.map((l) => h('p', { text: l }))));
  openModal('お話の記録', items.length ? items : [h('p', { text: 'まだありません。' })]);
}

// ---- トースト・モーダル ----
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), Math.min(5000, 1800 + msg.length * 40));
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
  input.x = 0; input.y = 0; stick = null; $('joy').hidden = true;
}
function closeModal() {
  $('modal').hidden = true;
  const f = modalOnClose;
  modalOnClose = null;
  f?.();
}
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && $('modal').dataset.closable) closeModal(); });
function confirmBox(title, text, okLabel, onOk) {
  openModal(title, [h('p', { text }), h('div', { class: 'actions' },
    h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'やめる'),
    h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); onOk(); } }, okLabel))]);
}

// ---- お話 ----
let talking = null;
function maybeTalk() {
  if (talking || blocked || !save.pending.length) {
    if (!talking && pendingWave && !save.pending.length) { pendingWave = false; S.startWave(world); }
    return;
  }
  const id = save.pending[0];
  if (!DIALOGUES[id]) { S.ackTalk(save, id); maybeTalk(); return; }
  talking = { id, k: 0 };
  $('talk').hidden = false;
  input.x = 0; input.y = 0; stick = null; $('joy').hidden = true;
  showLine();
}
function showLine() {
  const d = DIALOGUES[talking.id];
  $('talk-title').textContent = d.title;
  $('talk-count').textContent = `${talking.k + 1}/${d.lines.length}`;
  $('talk-text').textContent = d.lines[talking.k];
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
  S.ackTalk(save, id);
  if (id === 'opening') S.queueTalk(save, 'pads');
  persist();
  if (id === 'ending') { showEnding(); return; }
  maybeTalk();
}
$('talk-next').addEventListener('click', (e) => { e.stopPropagation(); nextLine(); });
$('talk-skip').addEventListener('click', (e) => { e.stopPropagation(); endTalk(); });
$('talk').addEventListener('click', (e) => { if (e.target.closest('.talk-box') && !e.target.closest('button')) nextLine(); });

function showEnding() {
  audio.sfx('fanfare');
  const st = save.stats;
  const mins = Math.round(st.playMs / 60000);
  openModal('森に朝が来ました', [
    h('img', { class: 'ending-img', src: 'img/cover.webp', alt: '守り手たちと、旗のはためくとりで' }),
    h('p', { text: '15の夜を守りきり、影の大イノシシを追い払いました。' }),
    h('p', { text: 'これからは「果てしない夜」が続きます。どこまで守れるか、強化を続けて挑んでみましょう。' }),
    h('div', { class: 'stats' },
      h('div', {}, '遊んだ時間', h('b', { text: `約${Math.floor(mins / 60)}時間${mins % 60}分` })),
      h('div', {}, '倒した魔物', h('b', { text: `${st.kills}` })),
      h('div', {}, 'たおれた回数', h('b', { text: `${st.downs}` })),
      h('div', {}, '守れなかった夜', h('b', { text: `${st.losses}` }))),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'とりでの暮らしをつづける')),
  ], { onClose: () => audio.setSong('day') });
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
      h('p', { text: '森のとりでは別のタブ（またはホーム画面版）で開かれています。データの上書きを防ぐため、そちらを閉じてから「もう一度確認」を押してください。' }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn', type: 'button', onclick: retry }, 'もう一度確認')),
    ], { closable: false });
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && world) { S.syncSave(world); persist(); }
  last = performance.now();
});
window.addEventListener('pagehide', () => { if (world) { S.syncSave(world); persist(); } });

async function boot() {
  resize();
  audio.apply(getAudioSettings(GAME_ID));
  await waitLock();
  const init = await loadInitial();
  if (!init) return;
  try {
    await loadImages();
  } catch (e) {
    showFatal('画像を読み込めませんでした', 'ネットワークにつながる場所で一度開くと、次からはオフラインでも遊べます。');
    console.warn(e);
    return;
  }
  save = init.s;
  rev = init.rev;
  if (validate(save).length) console.warn('save invalid', validate(save));
  world = S.createWorld(save);
  audio.setSong(save.cleared ? 'dawn' : 'day');
  $('hud').removeAttribute('aria-busy');
  last = performance.now();
  requestAnimationFrame(frame);
  maybeTalk();
  initServiceWorker('../../sw.js', {
    onUpdate: () => toast('新しい版を準備しました。ランチャーに戻ると更新できます。'),
  }).catch(() => {});
  // テスト用の読み取り専用フック
  window.__forestFort = {
    get save() { return structuredClone(save); },
    get phase() { return world.phase; },
    get hero() { return { x: world.hero.x, y: world.hero.y, hp: world.hero.hp, onPad: world.hero.onPad }; },
    get enemies() { return world.enemies.length; },
    saving: () => saving || dirty,
  };
}

boot();

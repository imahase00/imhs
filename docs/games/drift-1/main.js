// 漂流発明記: 画面・操作・進行
import {
  GAME_ID, SCHEMA, TITLE, SPRITE, ITEMS, MACHINES, BUILD_ORDER, RECIPES, BENCH, QUESTS, DIALOGUES, ERAS, NODE_KINDS, BELT,
  BOILER_REPAIR, REACTOR_COST, SHIP, TOOLS, HERO, LEVEL_SPEED, INPUT_CAP, STOCK_LIMIT, POWER, BOTS,
} from './data.js';
import * as S from './sim.js';
import { upgrade, validate } from './save-schema.js';
import { loadImages, makeCamera, follow, draw, toWorld, drawMinimap, setShipImage, resetGround } from './render.js';
import { play, OPENING, ENDING, sceneImage } from './cutscene.js';
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
const icon = (id, cls) => h('img', { src: SPRITE(id), alt: '', class: cls });
const itemName = (k) => ITEMS[k]?.name ?? k;

// ---- 状態 ----
let save = null;
let world = null;
let rev = null;
let blocked = false;
const canvas = $('view');
const g = canvas.getContext('2d');
const ui = { dpr: 1, ghost: null, linkFrom: null, sel: null, build: false, showArrow: true };
let cam = null;
let mode = null;   // { kind: 'build', type } | { kind: 'link', from }
let inScene = false;

// ---- 保存（直列化して最新だけ書き込む）----
let saving = false;
let dirty = false;
let lastSaveAt = 0;
let changed = false;
let leaving = false;
let lastJson = '';
async function persist() {
  dirty = true;
  if (saving || blocked || !world || leaving) return;
  saving = true;
  while (dirty && !blocked) {
    dirty = false;
    const snap = structuredClone(S.syncSave(world));
    const json = JSON.stringify(snap);
    if (json === lastJson) continue;
    try {
      rev = await writeSave(GAME_ID, { schema: SCHEMA, data: snap, summary: S.saveSummary(snap) }, rev);
      lastSaveAt = performance.now();
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

// ---- 入力（指を置いた場所が仮想スティックの中心。短く触れたら「タップ」）----
const input = { x: 0, y: 0 };
const keys = new Set();
let stick = null;
const STICK_R = 56;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (stick) return;
  stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, t: performance.now(), moved: 0 };
  canvas.setPointerCapture?.(e.pointerId);
  const j = $('joy');
  j.style.left = `${e.clientX}px`;
  j.style.top = `${e.clientY}px`;
  $('knob').style.transform = 'translate(0,0)';
});
canvas.addEventListener('pointermove', (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox;
  let dy = e.clientY - stick.oy;
  const d = Math.hypot(dx, dy);
  stick.moved = Math.max(stick.moved, d);
  if (stick.moved > 10) $('joy').hidden = false;
  if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
  $('knob').style.transform = `translate(${dx}px,${dy}px)`;
  const k = d < 10 ? 0 : 1;
  input.x = k * dx / STICK_R;
  input.y = k * dy / STICK_R;
});
const endStick = (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  const tap = stick.moved < 12 && performance.now() - stick.t < 350;
  stick = null;
  input.x = 0;
  input.y = 0;
  $('joy').hidden = true;
  if (tap && e.type === 'pointerup') onTap(e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', endStick);
canvas.addEventListener('pointercancel', endStick);
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); audio.unlock(); }
  if (k === 'escape') { if (mode) endMode(); else if (ui.sel) select(null); else togglePause(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); input.x = 0; input.y = 0; stick = null; $('joy').hidden = true; });
function currentInput() {
  if (stick) return input;
  const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  return { x, y };
}

// タップした所の建物
function buildingAt(wx, wy) {
  let best = null;
  for (const b of save.buildings) {
    const m = S.machineOf(b.type);
    const half = m.size * 0.42;
    if (wx < b.x - half || wx > b.x + half || wy < b.y - m.size * 0.9 || wy > b.y + 40) continue;
    if (!best || b.y > best.y) best = b;
  }
  return best;
}
function onTap(sx, sy) {
  if (!world || inScene) return;
  const p = toWorld(cam, sx, sy);
  if (mode?.kind === 'build') {
    setGhost(p.x, p.y);
    return;
  }
  if (mode?.kind === 'link') {
    const b = buildingAt(p.x, p.y);
    if (!b) { toast('つなぐ先の機械をタップしてください'); return; }
    const r = S.addLink(world, mode.from, b.id);
    if (!r.ok) { audio.sfx('error'); toast(r.why); return; }
    audio.sfx('belt');
    toast(`ベルトをつなぎました（${costText(S.beltCost(S.buildingById(world, mode.from), b))}）`);
    endMode();
    select(mode?.from ?? r.link.from);
    persist();
    return;
  }
  const b = buildingAt(p.x, p.y);
  select(b?.id ?? null);
  if (b) audio.sfx('select');
}

// ---- 画面の大きさ ----
function resize() {
  ui.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  canvas.width = Math.round(cw * ui.dpr);
  canvas.height = Math.round(ch * ui.dpr);
  const old = cam;
  cam = makeCamera(cw, ch);
  if (old) { cam.x = old.x; cam.y = old.y; }
}
window.addEventListener('resize', resize);

// ---- ループ ----
let last = 0;
let playAcc = 0;
let miniT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!world || inScene) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  const running = !blocked && !talking && $('modal').hidden && $('sheet').hidden && $('title').hidden && document.visibilityState === 'visible';
  if (running) {
    const events = S.step(world, currentInput(), dt);
    handleEvents(events);
    playAcc += dt * 1000;
    if (playAcc > 1000) { save.stats.playMs += Math.round(playAcc); playAcc = 0; }
    if (changed && now - lastSaveAt > 4000) { changed = false; persist(); }
  }
  follow(cam, world.hero);
  ui.build = mode?.kind === 'build';
  ui.linkFrom = mode?.kind === 'link' ? mode.from : null;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#2b5f6b';
  g.fillRect(0, 0, canvas.width, canvas.height);
  draw(g, cam, world, ui);
  miniT -= dt;
  if (miniT <= 0) { miniT = 0.5; drawMinimap($('mini'), world); }
  renderHud();
}

// ---- 出来事 ----
function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'gather':
        audio.sfx(NODE_KINDS[nodeKindOf(e)]?.pose === 'axe' ? 'chop' : 'pick');
        audio.sfx('pop');
        bumpBag();
        changed = true;
        break;
      case 'exchange': audio.sfx('drop'); bumpBag(); changed = true; break;
      case 'drift': audio.sfx('quest'); toast(`漂流物を拾いました（${costText(e.loot)}）→ 倉庫へ`); changed = true; break;
      case 'driftArrive': toast('浜辺に何かが流れ着いたようです'); break;
      case 'built': audio.sfx('build'); toast(`${S.machineOf(e.machine).name}を建てました`); persist(); break;
      case 'upgraded': audio.sfx('build'); toast(`★${e.lv} に強化しました`); persist(); break;
      case 'removed': audio.sfx('drop'); persist(); break;
      case 'craft': audio.sfx('build'); persist(); break;
      case 'made': audio.sfx('made'); changed = true; break;
      case 'drone': toast('運搬ドローンが完成しました！'); persist(); break;
      case 'linked': persist(); break;
      case 'gate': audio.sfx('era'); toast(gateMessage(e.id)); persist(); break;
      case 'botFixed': audio.sfx('quest'); toast(`${BOTS[e.bot].name}が仲間になりました！${e.bot === 'miner' ? '（「建てる」から資源のそばに置けます）' : ''}`); persist(); break;
      case 'era': audio.sfx('era'); audio.sfx('steam'); setSong(); toast(`${ERAS[e.era]}が始まりました！`); persist(); break;
      case 'shipPart': audio.sfx('build'); toast(`飛行船の部品を${e.n}つ納めました`); persist(); break;
      case 'shipDone': audio.sfx('whistle'); persist(); break;
      case 'quest':
        audio.sfx('quest');
        $('quest').classList.remove('done'); void $('quest').offsetWidth; $('quest').classList.add('done');
        if (e.id === 'lab') setSong();
        persist();
        maybeTalk();
        break;
      default:
    }
  }
}
const nodeKindOf = (e) => {
  for (const [k, v] of Object.entries(NODE_KINDS)) if (v.item === e.item) return k;
  return null;
};
function gateMessage(id) {
  return { log: '倒木をどかしました。森へ行けます！', bridge1: '橋を直しました。西の岩山へ渡れます！', bridge2: '橋を直しました。霧の向こうへ渡れます！', lift: '蒸気リフトが動きました。山頂へ登れます！' }[id] ?? '道が開けました';
}
function setSong() {
  if (!save) return;
  audio.setSong(save.era >= 4 ? 'factory' : save.era >= 2 ? 'workshop' : 'island');
}
function bumpBag() {
  const c = $('btn-bag');
  c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
}

// ---- 表示の部品 ----
function costView(cost, mult = 1) {
  return h('span', { class: 'cost' }, ...Object.entries(cost).map(([k, n]) => {
    const need = Math.ceil(n * mult);
    const ok = S.have(save, k) >= need;
    return h('span', { class: `need-i ${ok ? 'ok' : 'no'}`, title: itemName(k) }, icon(k), `${itemName(k)} ${Math.min(S.have(save, k), need)}/${need}`);
  }));
}
const costText = (cost) => Object.entries(cost).map(([k, n]) => `${itemName(k)}×${n}`).join('・');

// ---- 上の表示 ----
let hudKey = '';
let cardKey = '';
function renderHud() {
  const q = QUESTS[save.quest];
  const need = q?.kind === 'have' ? q.need : null;
  const key = [save.era, save.quest, save.cleared, need ? Object.keys(need).map((k) => S.have(save, k)).join(',') : '', S.bagCount(save), S.bagCap(save)].join('|');
  if (key !== hudKey) {
    hudKey = key;
    $('era').textContent = save.cleared ? `${TITLE}・クリア後` : ERAS[save.era];
    $('quest-text').textContent = save.cleared ? '島の工場は、まだまだ育てられます' : q ? `目標: ${q.text}` : '';
    const box = $('quest-need');
    box.replaceChildren(...(need ? Object.entries(need).map(([k, n]) => {
      const v = Math.min(S.have(save, k), n);
      return h('span', { class: `need-i ${v >= n ? 'ok' : ''}` }, icon(k), `${v}/${n}`);
    }) : []));
    const full = S.bagCount(save) >= S.bagCap(save);
    $('bag-num').textContent = `${S.bagCount(save)}/${S.bagCap(save)}`;
    $('btn-bag').classList.toggle('full', full);
  }
  renderCard();
}

// ---- 下のカード ----
function select(id) {
  ui.sel = id;
  cardKey = '';
}
function renderCard() {
  const card = $('card');
  const bar = $('modebar');
  $('bar').hidden = !!mode;
  if (mode) {
    card.hidden = true;
    const k = `mode|${mode.kind}|${mode.type ?? mode.from}|${ui.ghost?.ok}|${ui.ghost?.why}|${S.canPay(save, mode.kind === 'build' ? S.machineOf(mode.type).cost : {})}`;
    if (k !== cardKey) {
      cardKey = k;
      if (mode.kind === 'build') {
        const m = S.machineOf(mode.type);
        bar.replaceChildren(
          icon(m.sprite),
          h('span', { text: ui.ghost ? (ui.ghost.ok ? `ここに${m.name}を置きますか？` : ui.ghost.why) : `${m.name}: 置きたい場所をタップ` }),
          h('button', { class: 'btn small gold', type: 'button', disabled: !ui.ghost?.ok, onclick: confirmPlace }, '置く'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: endMode }, 'やめる'));
        bar.querySelector('img').style.cssText = 'width:36px;height:36px';
      } else {
        bar.replaceChildren(h('span', { text: 'つなぐ先の機械か倉庫をタップ' }),
          h('button', { class: 'btn small ghost', type: 'button', onclick: endMode }, 'やめる'));
      }
    }
    bar.hidden = false;
    return;
  }
  bar.hidden = true;
  const b = ui.sel && S.buildingById(world, ui.sel);
  if (ui.sel && !b) ui.sel = null;
  const act = !b ? S.nearAction(world) : null;
  const benchNear = !b && !act && S.nearBuildings(world, 40).find((x) => x.type === 'bench');
  const k = b ? buildingKey(b) : act ? actionKey(act) : benchNear ? `benchnear|${save.quest}` : '';
  if (k === cardKey) return;
  cardKey = k;
  if (!k) { card.hidden = true; return; }
  card.replaceChildren(...(b ? buildingCard(b) : act ? actionCard(act) : [
    h('div', { class: 'card-head' }, icon('m-bench'), h('b', { text: '作業台' }),
      h('button', { class: 'btn small gold', type: 'button', onclick: () => select(benchNear.id) }, '手作りする')),
  ]).filter(Boolean));
  card.hidden = false;
}
function haveKey() { return [...Object.entries(save.pool), ...Object.entries(save.bag)].map(([k, n]) => k + n).join(',') + `|${save.tool}${save.bagLv}${save.boots}`; }
function buildingKey(b) {
  const links = save.links.filter((l) => l.from === b.id || l.to === b.id).map((l) => l.id + l.lv).join(',');
  return ['b', b.id, b.lv, b.recipe, JSON.stringify(b.inp ?? ''), JSON.stringify(b.out ?? ''), b.fuel, Math.ceil(b.burn ?? 0), S.isPowered(world, b), links, haveKey(), S.minersFree(world)].join('|');
}
function actionKey(a) { return ['a', a.kind, a.gate?.id, a.bot?.id, haveKey(), JSON.stringify(save.ship)].join('|'); }
function head(spriteId, title, closable = true) {
  return h('div', { class: 'card-head' }, icon(spriteId), h('b', { text: title }),
    closable ? h('button', { class: 'x', type: 'button', 'aria-label': '閉じる', onclick: () => select(null) }, '✕') : null);
}

function buildingCard(b) {
  const m = S.machineOf(b.type);
  const out = [head(m.sprite, `${m.name}${b.lv > 1 ? ` ★${b.lv - 1}` : ''}`)];
  if (m.role === 'bench') return [...out, ...benchList()];
  if (m.role === 'store') {
    out.push(h('p', { text: '倉庫の物は、建てるときや作業台で使えます。タップすると5つずつ袋に入れて持ち出せます。' }));
    const ent = Object.entries(save.pool).filter(([, n]) => n > 0);
    out.push(ent.length ? h('div', { class: 'inv' }, ...ent.map(([k, n]) => h('button', {
      type: 'button', onclick: () => { const t = S.takeFromPool(world, k, 5); if (t) { audio.sfx('drop'); bumpBag(); } else toast('袋がいっぱいです'); },
    }, icon(k), h('span', {}, h('span', { class: 'nm', text: itemName(k) }), `${n}`)))) : h('p', { class: 'muted', text: 'まだ何も入っていません。' }));
    out.push(linkRows(b), h('div', { class: 'row' }, beltButton(b), removeButton(b)));
    return out;
  }
  if (m.role === 'station') {
    const others = save.buildings.filter((x) => x.type === 'station' && x.id !== b.id);
    out.push(h('p', { text: others.length ? 'トロッコで、ほかの駅へすぐ行けます。' : 'もう1つ駅を建てると、トロッコで行き来できます。' }));
    out.push(h('div', { class: 'row' }, ...others.map((o, i) => h('button', { class: 'btn small', type: 'button', onclick: () => travel(o) }, `駅${i + 1}へ（${placeName(o)}）`)), removeButton(b)));
    return out;
  }
  if (m.role === 'power') {
    if (save.reactorOn) out.push(h('p', { text: '地熱炉の蒸気が島じゅうに届いているので、ボイラーはもう要りません。' }));
    else {
      out.push(h('p', { text: `石炭を燃やして、まわり（点線の円）の機械に蒸気を送ります。石炭1つで約${POWER.burn}秒。` }));
      out.push(h('p', {}, icon('coal'), ` 石炭 ${b.fuel}/${POWER.fuelCap}${b.burn > 0 ? '（燃えています）' : '（止まっています）'}`));
      out.push(h('p', { class: 'muted', text: '石炭を袋に入れてそばへ行くか、運搬ロボ・ベルトで届けます。' }));
    }
    out.push(h('div', { class: 'row' }, b.fixedWreck ? null : removeButton(b)));
    return out;
  }
  const powered = S.isPowered(world, b);
  if (m.power && !powered) out.push(h('p', { class: 'warn', text: '⚠ 蒸気が届いていません。ボイラーの点線の円の中に置き、石炭を入れてください。' }));
  if (m.role === 'extract') {
    const n = S.nodeById(b.node);
    const item = m.out ?? NODE_KINDS[n.kind].item;
    const sec = (m.time / LEVEL_SPEED[b.lv - 1]).toFixed(1);
    out.push(h('p', {}, `${NODE_KINDS[n.kind].name}から `, icon(item), ` ${itemName(item)}を ${sec}秒に1つ`));
    if (b.type === 'minerbot') out.push(h('p', { class: 'muted', text: '蒸気がなくても働きます。' }));
  }
  if (m.role === 'process') {
    if (m.recipes.length > 1) {
      out.push(h('div', { class: 'chips' }, ...m.recipes.map((r) => {
        const rr = RECIPES[r];
        return h('button', { class: `chip ${b.recipe === r ? 'on' : ''}`, type: 'button', onclick: () => { if (S.setRecipe(world, b.id, r)) { audio.sfx('select'); persist(); } } },
          icon(rr.out ?? 'bot-drone'), rr.name ?? itemName(rr.out));
      })));
    }
    const r = RECIPES[b.recipe];
    const sec = (r.time / LEVEL_SPEED[b.lv - 1]).toFixed(1);
    out.push(h('p', {}, ...Object.entries(r.in).flatMap(([k, n], i) => [i ? ' ＋ ' : '', icon(k), `${itemName(k)}${n}`]), ' → ', icon(r.out ?? 'bot-drone'), ` ${r.name ?? itemName(r.out)}${r.n > 1 ? `×${r.n}` : ''}（${sec}秒）`));
    out.push(h('p', { class: 'muted' }, '入っている材料: ', ...Object.entries(r.in).map(([k, n]) => `${itemName(k)} ${b.inp[k] ?? 0}/${n * INPUT_CAP}　`)));
  }
  if (S.stocked(world, b)) out.push(h('p', { class: 'muted', text: `倉庫に${itemName(RECIPES[b.recipe].out)}が${S.stockLimit(save, RECIPES[b.recipe].out)}個以上あるので、作るのを休んでいます（ほかの機械に材料をゆずるため）。` }));
  if (b.out && Object.keys(b.out).length) out.push(h('p', { class: 'muted' }, 'できた物: ', Object.entries(b.out).map(([k, n]) => `${itemName(k)}×${n}`).join('・'), '（そばを通ると受け取れます）'));
  out.push(linkRows(b));
  const up = S.upgradeCost(b);
  if (up) {
    out.push(h('div', { class: 'row' }, h('span', { class: 'lv', text: `★${b.lv}へ強化（速さ×${LEVEL_SPEED[b.lv]}）` }), costView(up),
      h('button', { class: 'btn small gold', type: 'button', disabled: !S.canPay(save, up), onclick: () => S.upgradeBuilding(world, b.id) }, '強化')));
  }
  out.push(h('div', { class: 'row' }, beltButton(b), removeButton(b)));
  return out;
}
function placeName(b) {
  if (b.x < 2050) return '西の岩山';
  if (b.x > 3950) return '東の研究所';
  if (b.y < 1700) return '山頂';
  if (b.y > 4300) return '浜辺';
  return '森';
}
function linkRows(b) {
  const ls = save.links.filter((l) => l.from === b.id || l.to === b.id);
  if (!ls.length) return null;
  return h('div', {}, ...ls.map((l) => {
    const outgoing = l.from === b.id;
    const other = S.buildingById(world, outgoing ? l.to : l.from);
    const next = BELT.levels[l.lv + 1];
    const upCost = next && S.beltCost(S.buildingById(world, l.from), S.buildingById(world, l.to), l.lv + 1);
    return h('div', { class: 'row' },
      h('span', { text: `${outgoing ? '→' : '←'} ${S.machineOf(other.type).name}（${BELT.levels[l.lv].name}）` }),
      next ? h('button', { class: 'btn small ghost', type: 'button', disabled: !S.canPay(save, upCost), title: costText(upCost), onclick: () => { if (S.upgradeLink(world, l.id)) { audio.sfx('belt'); toast(`${next.name}にしました`); persist(); } } }, `${next.name}に（${costText(upCost)}）`) : null,
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { S.removeLink(world, l.id); audio.sfx('drop'); persist(); } }, '外す'));
  }));
}
function beltButton(b) {
  const m = S.machineOf(b.type);
  if (save.era < 3 || !['extract', 'process', 'store'].includes(m.role)) return null;
  return h('button', { class: 'btn small', type: 'button', onclick: () => startLink(b.id) }, 'ベルトでつなぐ');
}
function removeButton(b) {
  if (b.type === 'bench' || b.fixedWreck) return null;
  return h('button', { class: 'btn small ghost', type: 'button', onclick: () => confirmBox(`${S.machineOf(b.type).name}を片づけますか？`, '使った材料と、中にためていた物は倉庫にもどります。つないだベルトも外れます。', '片づける', () => {
    if (!S.removeBuilding(world, b.id)) toast('最後の倉庫は片づけられません');
    select(null);
  }) }, '片づける');
}
function benchList() {
  const rows = BENCH.filter((r) => S.benchState(save, r) === 'open').map((r) => h('div', { class: 'mitem', style: 'cursor:default' },
    icon(r.kind === 'item' ? r.out : r.kind === 'tool' ? 'hero-pick' : r.kind === 'bag' ? 'hero-carry' : 'hero-walk'),
    h('div', {}, h('b', { text: r.name }), r.desc ? h('small', { text: r.desc }) : null, costView(r.cost)),
    h('div', { style: 'display:grid;gap:4px' },
      h('button', { class: 'btn small gold', type: 'button', disabled: !S.canPay(save, r.cost), onclick: () => doCraft(r) }, '作る'),
      r.kind === 'item' ? h('button', { class: 'btn small ghost', type: 'button', disabled: !S.canPay(save, r.cost), onclick: () => doCraft(r, 10) }, '×10') : null)));
  return [h('p', { class: 'muted', text: `道具: ${TOOLS[save.tool].name}　袋: ${HERO.bag[save.bagLv]}個まで` }), h('div', { class: 'mlist' }, ...rows)];
}
function doCraft(r, n = 1) {
  const made = S.craft(world, r.id, n);
  if (!made) { audio.sfx('error'); toast('材料が足りません'); return; }
  if (r.kind === 'item') toast(`${r.name}を${made}つ作りました（倉庫へ）`);
  else toast(`${r.name}を手に入れました！`);
}

function actionCard(a) {
  switch (a.kind) {
    case 'gate': {
      const gt = a.gate;
      const block = S.gateBlock(save, gt);
      const label = gt.id === 'log' ? 'どかす' : gt.id === 'lift' ? '建てる' : '直す';
      return [head(gt.sprite ?? 'm-lift', gt.name, false), h('p', { text: gt.desc }),
        block ? h('p', { class: 'warn', text: block }) : null,
        h('div', { class: 'row' }, Object.keys(gt.cost).length ? costView(gt.cost) : null,
          h('button', { class: 'btn small gold', type: 'button', disabled: !!block || !S.canPay(save, gt.cost), onclick: () => S.openGate(world, gt.id) }, label))];
    }
    case 'boiler':
      return [head('m-boiler', '残骸のボイラー', false), h('p', { text: '飛行船のボイラー（蒸気釜）は、まだ直せそうだ。動けば、まわりの機械に蒸気を送れる。' }),
        h('div', { class: 'row' }, costView(BOILER_REPAIR), h('button', { class: 'btn small gold', type: 'button', disabled: !S.canPay(save, BOILER_REPAIR), onclick: () => S.repairBoiler(world) }, '直す'))];
    case 'bot':
      return [head('bot-broken', '倒れたロボット', false), h('p', { text: `錆びて止まっている。直せば${BOTS[a.bot.type].name}として手伝ってくれそうだ。` }),
        h('div', { class: 'row' }, costView(a.bot.cost), h('button', { class: 'btn small gold', type: 'button', disabled: !S.canPay(save, a.bot.cost), onclick: () => S.repairBot(world, a.bot.id) }, '直す'))];
    case 'reactor':
      return [head('reactor-off', '止まった地熱炉', false), h('p', { text: '研究所の地下に眠る巨大な炉。歯車と管を取り替えれば、また動きそうだ。' }),
        h('div', { class: 'row' }, costView(REACTOR_COST), h('button', { class: 'btn small gold', type: 'button', disabled: !S.canPay(save, REACTOR_COST), onclick: () => S.startReactor(world) }, '動かす'))];
    case 'ship': {
      const needs = S.shipNeeds(save);
      const any = Object.keys(needs).some((k) => S.have(save, k) > 0);
      return [head('dock', '山頂の発着場', false), h('p', { text: '飛行船の部品を納めて、組み上げよう。部品は大型組立機で作れる。' }),
        h('div', { class: 'cost' }, ...Object.entries(SHIP).map(([k, n]) => h('span', { class: `need-i ${save.ship[k] >= n ? 'ok' : ''}` }, icon(k), `${itemName(k)} ${save.ship[k]}/${n}`))),
        h('div', { class: 'row' }, h('button', { class: 'btn small gold', type: 'button', disabled: !any, onclick: () => S.deliverShip(world) }, '持っている部品を納める'))];
    }
    default: return [];
  }
}

function travel(st) {
  const spots = [[0, 140], [140, 60], [-140, 60], [0, -140]];
  for (const [dx, dy] of spots) {
    if (S.walkable(save, st.x + dx, st.y + dy)) {
      audio.sfx('travel');
      world.hero.x = st.x + dx;
      world.hero.y = st.y + dy;
      follow(cam, world.hero, true);
      select(null);
      persist();
      return;
    }
  }
  toast('駅のまわりに降りる場所がありません');
}

// ---- 建てる ----
$('btn-build').addEventListener('click', () => { audio.unlock(); audio.sfx('page'); openBuildSheet(); });
function openBuildSheet() {
  select(null);
  const types = [...BUILD_ORDER, 'minerbot'];
  const rows = types.map((t) => {
    const m = S.machineOf(t);
    if (t === 'minerbot') {
      const free = S.minersFree(world);
      const total = S.botCounts(save).miner;
      if (!total) return null;
      return h('button', { class: `mitem ${free ? '' : 'lock'}`, type: 'button', onclick: () => { if (free) startBuild(t); else toast('空いている採掘ロボがいません'); } },
        icon(m.sprite), h('div', {}, h('b', { text: `採掘ロボを置く（あと${free}台）` }), h('small', { text: '木・岩・鉱脈・綿花のそばに置くと、蒸気なしで採り続けます' })), h('span', { class: 'go', text: free ? '置く ▶' : '' }));
    }
    const locked = m.era > save.era;
    if (locked && m.era > save.era + 1) return null;
    return h('button', { class: `mitem ${locked ? 'lock' : ''}`, type: 'button', onclick: () => { if (locked) toast(`${ERAS[m.era]}になると作れます`); else startBuild(t); } },
      icon(m.sprite), h('div', {}, h('b', { text: m.name }), h('small', { text: locked ? `${ERAS[m.era]}になると作れます` : m.desc ?? (m.role === 'store' ? '袋の物をしまっておける。運搬ロボの行き先にもなる' : '') }), locked ? null : costView(m.cost)),
      h('span', { class: 'go', text: locked ? '🔒' : '置く ▶' }));
  }).filter(Boolean);
  openSheet('建てる', [h('p', { class: 'muted', text: '材料は袋と倉庫の両方から使います。' }), h('div', { class: 'mlist' }, ...rows)]);
}
function startBuild(type) {
  closeSheet();
  mode = { kind: 'build', type };
  ui.ghost = null;
  cardKey = '';
  // まずは主人公の少し前に置いてみる
  setGhost(world.hero.x + world.hero.face * 170, world.hero.y - 40);
}
function setGhost(x, y) {
  const c = S.checkPlace(world, mode.type, x, y);
  ui.ghost = { type: mode.type, x: c.ok ? c.x : x, y: c.ok ? c.y : y, ok: c.ok, why: c.why };
  cardKey = '';
}
function confirmPlace() {
  if (!ui.ghost?.ok) return;
  const r = S.place(world, mode.type, ui.ghost.x, ui.ghost.y);
  if (!r.ok) { audio.sfx('error'); toast(r.why); setGhost(ui.ghost.x, ui.ghost.y); return; }
  endMode();
  select(r.building.id);
}
function startLink(from) {
  mode = { kind: 'link', from };
  cardKey = '';
  toast('つなぐ先の機械か倉庫をタップしてください');
}
function endMode() {
  mode = null;
  ui.ghost = null;
  cardKey = '';
}

// ---- 持ち物・地図 ----
$('btn-bag').addEventListener('click', () => {
  audio.unlock();
  audio.sfx('page');
  const grid = (o) => {
    const ent = Object.entries(o).filter(([, n]) => n > 0);
    return ent.length ? h('div', { class: 'inv' }, ...ent.map(([k, n]) => h('div', {}, icon(k), h('span', {}, h('span', { class: 'nm', text: itemName(k) }), `${n}`)))) : h('p', { class: 'muted', text: 'からっぽです。' });
  };
  openModal('持ち物', [
    h('h3', { text: `袋（${S.bagCount(save)}/${S.bagCap(save)}）` }), grid(save.bag),
    h('p', { class: 'muted', text: '倉庫のそばを通ると、袋の中身は自動でしまわれます。' }),
    h('h3', { text: '倉庫（島じゅうの倉庫の合計）' }), grid(save.pool),
    h('h3', { text: '道具など' }),
    h('p', { text: `道具: ${TOOLS[save.tool].name}　靴: ${['ふつうの靴', '銅の靴底', '蒸気の靴'][save.boots]}　ロボ: 運搬${S.botCounts(save).carry}・採掘${S.botCounts(save).miner}・ドローン${save.drones}` }),
  ]);
});
$('btn-map').addEventListener('click', () => {
  audio.unlock();
  audio.sfx('page');
  const c = h('canvas', { class: 'bigmap', width: '600', height: '600' });
  drawMinimap(c, world);
  openModal('霧の島', [c, h('p', { class: 'muted', text: '赤い点が自分、黄色い点が目標の場所です。白い所は、まだ霧に包まれています。' })]);
});

// ---- ボタン ----
$('btn-settings').addEventListener('click', () => togglePause(true));
$('btn-back').addEventListener('click', (e) => {
  e.preventDefault();
  audio.pause();
  leaveToLauncher();
});
async function leaveToLauncher() {
  if (world) S.syncSave(world);
  persist();
  const until = performance.now() + 1500;
  while ((saving || dirty) && !blocked && performance.now() < until) await new Promise((r) => setTimeout(r, 50));
  leaving = true;
  await closeDB();
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
      onchange: () => { audio.unlock(); if (key === 'sfx') audio.sfx('pop'); },
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
      h('div', {}, '手で採った数', h('b', { text: `${st.gathered}` })),
      h('div', {}, '作った物', h('b', { text: `${st.made}` })),
      h('div', {}, '建てた機械', h('b', { text: `${st.built}` }))),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost small', type: 'button', onclick: openLog }, 'これまでのお話'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => { closeModal(); runScene(OPENING); } }, 'オープニングを見る'),
      save.cleared ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { closeModal(); runScene(ENDING); } }, 'エンディングを見る') : null),
    h('h3', { text: 'あそびかた' }),
    h('ul', { class: 'howto' },
      h('li', { text: '画面のどこかを押したまま指を動かすと歩きます（PCは WASD・矢印キー）。短くタップすると、機械を選べます。' }),
      h('li', { text: '木や岩のそばで立ち止まると、手で採れます。倉庫のそばを通ると、袋の中身がしまわれます。' }),
      h('li', { text: '「建てる」から機械を選び、置きたい場所をタップします。材料は袋と倉庫の両方から使います。' }),
      h('li', { text: '蒸気で動く機械は、ボイラーの点線の円の中に置き、ボイラーに石炭を入れます。' }),
      h('li', { text: '直した運搬ロボは、機械にたまった物を倉庫へ、倉庫の材料を機械へ、自動で運びます。' }),
      h('li', { text: '工場の時代になると、機械をタップして「ベルトでつなぐ」で、休まず送り続けるベルトが敷けます。' }),
      h('li', { text: '上の目標と、黄色い矢印が次にすることを教えてくれます。' })),
    h('h3', { text: 'データ' }),
    h('p', { class: 'muted', text: '進み具合は自動で保存されます。ゲームを閉じている間は、工場は止まっています。バックアップはランチャーの⚙設定から。' }),
    h('div', { class: 'actions' },
      h('a', { class: 'btn ghost', href: '../../index.html', onclick: (e) => { e.preventDefault(); closeModal(); $('btn-back').click(); } }, 'ランチャーへ'),
      h('button', { class: 'btn ghost', type: 'button', onclick: confirmReset }, 'はじめから遊ぶ')),
  ]);
}
function confirmReset() {
  confirmBox('はじめから遊ぶ', '建てた機械・持ち物・進み具合をすべて消して、最初から始めます。元に戻せません。', '消して始める', () => {
    save = S.newSave();
    world = S.createWorld(save);
    resetGround();
    follow(cam, world.hero, true);
    endMode();
    select(null);
    setSong();
    persist();
    showTitle();
  });
}
function openLog() {
  const items = save.seen.filter((id) => DIALOGUES[id]).map((id) => h('details', { class: 'log-item' },
    h('summary', { text: DIALOGUES[id].title }), ...DIALOGUES[id].lines.map((l) => h('p', { text: l }))));
  openModal('お話の記録', items.length ? items : [h('p', { text: 'まだありません。' })]);
}

// ---- トースト・モーダル・シート ----
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), Math.min(5000, 1800 + msg.length * 40));
}
let modalOnClose = null;
function stopStick() { input.x = 0; input.y = 0; stick = null; $('joy').hidden = true; }
function openModal(title, body, { closable = true, onClose = null } = {}) {
  const panel = $('modal-panel');
  const hd = h('h2', {}, h('span', { text: title }));
  if (closable) hd.append(h('button', { class: 'iconbtn', type: 'button', 'aria-label': '閉じる', onclick: closeModal }, '✕'));
  panel.replaceChildren(hd, ...body.filter(Boolean));
  $('modal').hidden = false;
  $('modal').dataset.closable = closable ? '1' : '';
  modalOnClose = onClose;
  stopStick();
}
function closeModal() {
  $('modal').hidden = true;
  const f = modalOnClose;
  modalOnClose = null;
  f?.();
}
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && $('modal').dataset.closable) closeModal(); });
function openSheet(title, body) {
  $('sheet-panel').replaceChildren(h('h2', {}, h('span', { text: title }), h('button', { class: 'iconbtn', type: 'button', 'aria-label': '閉じる', onclick: closeSheet }, '✕')), ...body);
  $('sheet').hidden = false;
  stopStick();
}
function closeSheet() { $('sheet').hidden = true; }
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
function confirmBox(title, text, okLabel, onOk) {
  openModal(title, [h('p', { text }), h('div', { class: 'actions' },
    h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'やめる'),
    h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); onOk(); } }, okLabel))]);
}

// ---- お話 ----
const TALK_IMG = { lab: 'lab', reactor: 'reactor' };
let talking = null;
function maybeTalk() {
  if (talking || blocked || inScene || !save.pending.length) return;
  const id = save.pending[0];
  if (!DIALOGUES[id]) { S.ackTalk(save, id); maybeTalk(); return; }
  talking = { id, k: 0 };
  const im = $('talk-img');
  if (TALK_IMG[id]) { im.src = `img/scene/${TALK_IMG[id]}.webp`; im.hidden = false; } else { im.hidden = true; im.removeAttribute('src'); }
  $('talk').hidden = false;
  stopStick();
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
  persist();
  if (id === 'ending') { finishGame(); return; }
  maybeTalk();
}
$('talk-next').addEventListener('click', (e) => { e.stopPropagation(); nextLine(); });
$('talk-skip').addEventListener('click', (e) => { e.stopPropagation(); endTalk(); });
$('talk').addEventListener('click', (e) => { if (e.target.closest('.talk-box') && !e.target.closest('button')) nextLine(); });

// ---- タイトル・紙芝居・エンディング ----
function showTitle() {
  const t = $('title');
  t.style.backgroundImage = 'url("img/cover.webp")';
  t.replaceChildren(
    h('h1', {}, h('span', { class: 'series', text: '漂流発明記' }), h('span', { class: 'sub', text: '― 霧の島 ―' })),
    h('button', { class: 'btn big gold', type: 'button', onclick: async () => {
      audio.unlock();
      t.hidden = true;
      await runScene(OPENING);
      maybeTalk();
    } }, 'はじめる'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: () => { audio.unlock(); t.hidden = true; maybeTalk(); } }, 'オープニングをとばす'));
  t.hidden = false;
}
async function runScene(shots) {
  inScene = true;
  stopStick();
  audio.setSong(shots === ENDING ? 'dawn' : 'island');
  try {
    await play($('scene'), shots, { audio });
  } finally {
    inScene = false;
    last = performance.now();
    if (shots !== ENDING) setSong();
  }
}
async function finishGame() {
  await runScene(ENDING);
  const st = save.stats;
  const mins = Math.round(st.playMs / 60000);
  audio.sfx('fanfare');
  openModal('島を出た', [
    h('img', { class: 'ending-img', src: 'img/cover.webp', alt: '発着場に立つ発明家と、空に浮かぶ飛行船' }),
    h('p', { text: '新しい飛行船で、霧の島をあとにしました。' }),
    h('p', { class: 'muted', text: 'これからも島の工場を育て続けられます。山頂には、完成した飛行船が待っています。' }),
    h('div', { class: 'stats' },
      h('div', {}, '遊んだ時間', h('b', { text: `約${Math.floor(mins / 60)}時間${mins % 60}分` })),
      h('div', {}, '建てた機械', h('b', { text: `${st.built}` })),
      h('div', {}, '作った物', h('b', { text: `${st.made}` })),
      h('div', {}, '手で採った数', h('b', { text: `${st.gathered}` }))),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, '島での暮らしをつづける')),
  ], { onClose: () => setSong() });
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
      h('p', { text: '漂流発明記は別のタブ（またはホーム画面版）で開かれています。データの上書きを防ぐため、そちらを閉じてから「もう一度確認」を押してください。' }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn', type: 'button', onclick: retry }, 'もう一度確認')),
    ], { closable: false });
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && world) persist();
  last = performance.now();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) leaving = false; });

async function boot() {
  resize();
  audio.apply(getAudioSettings(GAME_ID));
  await waitLock();
  const init = await loadInitial();
  if (!init) return;
  try {
    await loadImages();
    setShipImage(await sceneImage('ship'));
  } catch (e) {
    showFatal('画像を読み込めませんでした', 'ネットワークにつながる場所で一度開くと、次からはオフラインでも遊べます。');
    console.warn(e);
    return;
  }
  save = init.s;
  rev = init.rev;
  if (validate(save).length) console.warn('save invalid', validate(save));
  world = S.createWorld(save);
  follow(cam, world.hero, true);
  setSong();
  $('hud').removeAttribute('aria-busy');
  last = performance.now();
  requestAnimationFrame(frame);
  if (!save.seen.length && save.pending.includes('opening')) showTitle();
  else maybeTalk();
  initServiceWorker('../../sw.js', {
    onUpdate: () => toast('新しい版を準備しました。ランチャーに戻ると更新できます。'),
  }).catch(() => {});
  // テスト用の読み取り専用フック
  window.__drift = {
    get save() { return structuredClone(save); },
    get hero() { return { x: world.hero.x, y: world.hero.y }; },
    get quest() { return save.quest; },
    get mode() { return mode?.kind ?? null; },
    /** 世界の座標 → 画面の座標（テストでタップする位置を求める） */
    toScreen: (x, y) => ({ x: (x - cam.x) * cam.scale, y: (y - cam.y) * cam.scale }),
    get scene() { return inScene; },
    saving: () => saving || dirty,
  };
}

boot();

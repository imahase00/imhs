// ひだまり菜園: 画面と操作
import {
  GAME_ID, SCHEMA, SEASONS, CROPS, GOODS, DECOR, DECOR_IDS, DECOR_BONUS, PEOPLE, PEOPLE_IDS,
  DIALOGUES, SPRINKLER_PRICE, FEATURED_BONUS, QUEST_TOTAL, ITEM_IDS, itemName, itemImg, plotImg, isCrop,
} from './data.js';
import * as R from './rules.js';
import { upgrade, validate } from './save-schema.js';
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
const coinTag = (n) => h('span', { class: 'price' }, h('i', { class: 'coin' }), String(n));
const itemIcon = (id, n) => h('span', { class: 'req' }, h('img', { src: itemImg(id), alt: '' }), n != null ? h('b', { text: n }) : null);

// ---- 状態 ----
let state = null;
let rev = null;
let blocked = false;
let lastTick = performance.now();
let modalView = null;     // 開いているシートを再描画する関数
const anim = new Map();   // 畑インデックス → アニメーションクラス

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

// ---- 操作の確定 ----
function commit(r, { quiet = false } = {}) {
  if (blocked) return false;
  if (!r.ok) {
    if (r.msg) { toast(r.msg); audio.sfx('deny'); }
    return false;
  }
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (dt > 0 && dt < 120000) r.state.stats.playMs += Math.round(dt);
  state = r.state;
  handleEvents(r.events, quiet);
  render();
  persist();
  if (r.msg) toast(r.msg);
  maybeTalk();
  return true;
}

function handleEvents(events, quiet) {
  let sound = null;
  const unlocks = [];
  for (const e of events) {
    switch (e.type) {
      case 'plant': anim.set(e.i, 'pop'); sound ??= 'plant'; break;
      case 'water': anim.set(e.i, 'splash'); sound ??= 'water'; break;
      case 'harvest': anim.set(e.i, 'pop'); sound = 'harvest'; break;
      case 'craft': sound = 'craft'; break;
      case 'sell': sound = 'sell'; bumpCoins(); break;
      case 'deliver': sound = 'deliver'; bumpCoins(); break;
      case 'unlock': unlocks.push(e); sound = 'fanfare'; break;
      case 'festival': sound = 'fanfare'; break;
      default:
    }
  }
  if (!quiet && sound) audio.sfx(sound);
  const msg = unlocks.map((e) => ({
    seed: () => `新しい種「${CROPS[e.id].name}」が手に入りました！`,
    recipe: () => `作り方「${GOODS[e.id].name}」を覚えました！`,
    bench: () => '作業台が増えました！',
    bigCan: () => '大きなじょうろで「まとめて水やり」ができるようになりました！',
    orders: () => '掲示板に村の人の注文が届くようになりました！',
  }[e.what]?.())).filter(Boolean);
  if (msg.length) setTimeout(() => toast(msg.join(' ')), 1400);
}
function bumpCoins() {
  const c = $('coins');
  c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
}

// ---- 描画 ----
function render() {
  if (!state) return;
  renderScene();
  renderCards();
  renderPlots();
  renderSeeds();
  renderActions();
  renderNav();
  renderHint();
  if (modalView && !$('modal').hidden) modalView();
}

function renderScene() {
  const si = R.seasonIndex(state.day);
  $('scene').dataset.season = SEASONS[si].id;
  $('date').replaceChildren(h('span', { class: 'season-ico', 'aria-hidden': 'true', text: SEASONS[si].icon }), R.dateLabel(state.day));
  $('coin-num').textContent = state.coins.toLocaleString('ja-JP');
  $('decor-row').replaceChildren(...state.decor.map((id) => h('img', { src: `img/decor/${id}.webp`, alt: DECOR[id].name, title: DECOR[id].name })));
  const f = state.featured;
  $('featured').replaceChildren(...(f ? [h('img', { src: itemImg(f), alt: '' }), h('span', {}, '今日のおすすめ ', h('b', { text: itemName(f) }), ` +${Math.round(FEATURED_BONUS * 100)}%`)] : []));
  $('featured').hidden = !f;
}

function reqList(req) {
  return h('div', { class: 'reqs' }, ...Object.entries(req).map(([id, n]) => {
    const have = R.count(state, id);
    return h('span', { class: 'req' + (have >= n ? ' ok' : ''), title: itemName(id) },
      h('img', { src: itemImg(id), alt: itemName(id) }), h('b', { text: `${Math.min(have, n)}/${n}` }));
  }));
}

function renderCards() {
  const cards = [];
  if (!state.cleared && R.canFestival(state)) {
    cards.push(h('article', { class: 'card festival' },
      h('div', { class: 'card-head' }, h('strong', { text: '🎉 収穫祭' })),
      h('p', { class: 'card-text', text: '準備がすべてそろいました！' }),
      h('button', { class: 'btn gold', type: 'button', onclick: () => commit(R.holdFestival(state)) }, '収穫祭をひらく')));
  }
  for (const who of PEOPLE_IDS) {
    const q = R.activeQuest(state, who);
    if (!q) continue;
    const p = PEOPLE[who];
    const can = R.hasReq(state, q.req) && (!q.needDecor || state.decor.length >= q.needDecor);
    cards.push(h('article', { class: 'card quest', 'data-who': who },
      h('div', { class: 'card-head' }, h('img', { class: 'face', src: p.img, alt: '' }),
        h('div', {}, h('strong', { text: p.name }), h('small', { text: `依頼 ${state.quests[who] + 1}/${6}` }))),
      reqList(q.req),
      q.needDecor ? h('div', { class: 'cond' + (state.decor.length >= q.needDecor ? ' ok' : '') }, `飾り ${Math.min(state.decor.length, q.needDecor)}/${q.needDecor}`) : null,
      h('div', { class: 'card-foot' }, coinTag(q.coins),
        h('button', { class: 'btn small' + (can ? '' : ' wait'), type: 'button', onclick: () => commit(R.deliverQuest(state, who)) }, '届ける'))));
  }
  if (state.orders.enabled) {
    state.orders.slots.forEach((o, k) => {
      if (!o) {
        cards.push(h('article', { class: 'card order empty' }, h('div', { class: 'card-head' }, h('strong', { text: '📋 掲示板' })),
          h('p', { class: 'card-text', text: '次の注文は明日の朝に届きます。' })));
        return;
      }
      const can = R.hasReq(state, o.req);
      const coins = Math.round(o.coins * (1 + DECOR_BONUS * state.decor.length));
      cards.push(h('article', { class: 'card order', 'data-order': k },
        h('div', { class: 'card-head' }, h('strong', { text: '📋 村の注文' }),
          h('button', { class: 'iconbtn tiny', type: 'button', 'aria-label': '別の注文にかえる', title: '別の注文にかえる', onclick: () => commit(R.replaceOrder(state, k)) }, '↻')),
        reqList(o.req),
        h('div', { class: 'card-foot' }, coinTag(coins),
          h('button', { class: 'btn small' + (can ? '' : ' wait'), type: 'button', onclick: () => commit(R.deliverOrder(state, k)) }, '届ける'))));
    });
  }
  $('cards').replaceChildren(...cards);
}

function renderPlots() {
  const el = $('plots');
  const n = state.plots.length;
  el.dataset.cols = n > 12 ? 4 : n > 6 ? 3 : 3;
  const kids = state.plots.map((p, i) => {
    const st = R.plotStage(p);
    const key = st === 'ripe' ? p.c : st;
    const cls = ['plot', st];
    if (R.needsWater(p)) cls.push('dry');
    if (p.w) cls.push('wet');
    if (p.c && !R.inSeason(p.c, state.day)) cls.push('offseason');
    const a = anim.get(i);
    if (a) cls.push(a);
    let label = '空き畑';
    let badge = null;
    if (p.c) {
      const name = CROPS[p.c].name;
      if (st === 'ripe') { label = `${name}（収穫できます）`; badge = h('span', { class: 'badge ripe', text: '収穫' }); }
      else {
        const left = R.daysLeft(p, state.day);
        label = `${name}（あと${left}晩${p.w ? '・水やり済み' : '・水やりが必要'}）`;
        badge = p.w ? h('span', { class: 'badge left', text: `あと${left}晩` }) : h('span', { class: 'badge water', text: '💧' });
      }
    }
    return h('button', { class: cls.join(' '), type: 'button', 'data-i': i, 'aria-label': `畑${i + 1}: ${label}` },
      h('img', { src: plotImg(key), alt: '', draggable: 'false' }),
      p.c && st !== 'ripe' ? h('span', { class: 'crop-tag', text: CROPS[p.c].name }) : null,
      badge);
  });
  el.replaceChildren(...kids);
  anim.clear();
}

function renderSeeds() {
  $('seeds').replaceChildren(...state.seeds.map((c) => {
    const cr = CROPS[c];
    const on = state.seed === c;
    const shun = R.inSeason(c, state.day);
    return h('button', {
      class: 'seed' + (on ? ' on' : '') + (shun ? ' shun' : ''), type: 'button', role: 'radio', 'aria-checked': String(on), 'data-seed': c,
      onclick: () => { if (commit(R.selectSeed(state, c), { quiet: true })) audio.sfx('select'); },
      'aria-label': `${cr.name}の種 ${cr.seed}コイン${shun ? '（旬）' : '（季節外れ・ゆっくり育つ）'}`,
    }, h('img', { src: itemImg(c), alt: '' }), h('span', { class: 'seed-name', text: cr.name }),
    h('span', { class: 'seed-meta' }, coinTag(cr.seed), shun ? h('em', { text: '旬' }) : null));
  }));
}

function renderActions() {
  const dry = state.plots.some(R.needsWater);
  const ripe = state.plots.filter((p) => R.plotStage(p) === 'ripe').length;
  $('btn-water-all').hidden = !state.bigCan || state.sprinkler;
  $('btn-water-all').disabled = !dry;
  $('btn-harvest-all').hidden = ripe < 2;
}

function renderNav() {
  const n = Object.values(state.inv).reduce((a, b) => a + b, 0);
  $('basket-count').textContent = n ? String(n) : '';
  const idle = state.bench.filter((b) => !b.r).length;
  $('btn-workshop').classList.toggle('locked', state.bench.length === 0);
  $('workshop-badge').textContent = state.bench.length ? (idle ? `空き${idle}` : '作業中') : '';
  const st = R.nextPlotStep(state);
  const affordable = (st && state.coins >= st.price) || DECOR_IDS.some((d) => !state.decor.includes(d) && state.coins >= DECOR[d].price);
  $('shop-badge').textContent = affordable ? '●' : '';
}

function renderHint() {
  const t = R.hint(state);
  $('hint').textContent = t;
  $('hint').hidden = !t || !!talking;
}

// ---- 畑の操作 ----
$('plots').addEventListener('click', (e) => {
  const b = e.target.closest('.plot');
  if (!b) return;
  audio.unlock();
  const i = Number(b.dataset.i);
  commit(R.tapPlot(state, i));
});
// 長押し（または右クリック）で植え替え
let pressTimer = null;
$('plots').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.plot');
  if (!b) return;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => { pressTimer = 'fired'; askClear(Number(b.dataset.i)); }, 650);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  $('plots').addEventListener(ev, () => { if (pressTimer !== 'fired') clearTimeout(pressTimer); });
}
$('plots').addEventListener('click', (e) => { if (pressTimer === 'fired') { e.stopImmediatePropagation(); pressTimer = null; } }, true);
$('plots').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('.plot');
  if (!b) return;
  e.preventDefault();
  askClear(Number(b.dataset.i));
});
function askClear(i) {
  const p = state.plots[i];
  if (!p?.c) return;
  confirmBox('作物を抜きますか？', `${CROPS[p.c].name}を抜いて、空き畑にします。種代は戻りません。`, '抜く', () => commit(R.clearPlot(state, i)));
}

$('btn-water-all').addEventListener('click', () => commit(R.waterAll(state)));
$('btn-harvest-all').addEventListener('click', () => commit(R.harvestAll(state)));
$('btn-sleep').addEventListener('click', () => {
  audio.unlock();
  const dry = state.plots.filter(R.needsWater).length;
  const go = () => goodNight();
  if (dry && state.stats.days < 3) {
    confirmBox('おやすみしますか？', `水をやっていない畑が${dry}つあります。水をやらなかった作物は、その晩は育ちません。`, 'おやすみ', go);
  } else go();
});

let sleeping = false;
function goodNight() {
  if (sleeping || blocked) return;
  sleeping = true;
  const before = state;
  const r = R.sleep(state);
  audio.sfx('sleep');
  const night = $('night');
  $('night-text').textContent = `${R.dateLabel(before.day + 1)}の朝`;
  night.hidden = false;
  night.classList.remove('go'); void night.offsetWidth; night.classList.add('go');
  setTimeout(() => {
    commit(r, { quiet: true });
    const ev = r.events;
    const ripe = ev.filter((e) => e.type === 'ripe').length;
    const made = ev.filter((e) => e.type === 'crafted').map((e) => GOODS[e.id].name);
    const gift = ev.find((e) => e.type === 'gift');
    const season = ev.find((e) => e.type === 'season');
    const parts = [];
    if (season) parts.push(`${SEASONS[season.season].name}になりました。`);
    if (ripe) parts.push(`${ripe}つの畑が収穫どきです。`);
    if (made.length) parts.push(`${made.join('・')}ができあがりました。`);
    if (gift) parts.push(`小鳥が${CROPS[gift.id].name}を運んできました。`);
    if (parts.length) toast(parts.join(' '));
    if (season) audio.setSong(SEASONS[season.season].id);
  }, 450);
  setTimeout(() => { night.hidden = true; sleeping = false; }, 1100);
}

// ---- かご ----
function openBasket() {
  audio.sfx('page');
  modalView = () => {
    const ids = ITEM_IDS.filter((id) => R.count(state, id) > 0);
    const list = ids.length ? h('div', { class: 'item-list' }, ...ids.map((id) => {
      const n = R.count(state, id);
      const price = R.sellPrice(state, id);
      return h('div', { class: 'item-row' + (state.featured === id ? ' featured' : '') },
        h('img', { src: itemImg(id), alt: '' }),
        h('div', { class: 'item-main' }, h('b', { text: itemName(id) }), h('small', {}, `${n}こ・1こ `, coinTag(price), state.featured === id ? ' おすすめ' : '')),
        h('div', { class: 'item-act' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => commit(R.sell(state, id, 1)) }, '1こ売る'),
          n > 1 ? h('button', { class: 'btn small', type: 'button', onclick: () => confirmSellAll(id) }, 'ぜんぶ') : null));
    })) : h('p', { class: 'muted', text: 'かごは空っぽです。畑で収穫したり、作業小屋で加工品をつくったりしましょう。' });
    fillModal('かご', [
      list,
      h('p', { class: 'muted', text: `売値は飾り1つにつき +${Math.round(DECOR_BONUS * 100)}%（今 +${Math.round(DECOR_BONUS * 100 * state.decor.length)}%）。「今日のおすすめ」はさらに +${Math.round(FEATURED_BONUS * 100)}%。依頼に使う品物は残しておきましょう。` }),
    ]);
  };
  openModal('かご', []);
  modalView();
}
function confirmSellAll(id) {
  const n = R.count(state, id);
  const need = neededCount(id);
  const text = need ? `${itemName(id)}は依頼・注文に${need}こ必要です。${n}こぜんぶ売りますか？` : `${itemName(id)}を${n}こ、${R.sellPrice(state, id) * n}コインで売ります。`;
  const back = modalView;
  confirmBox('ぜんぶ売る', text, '売る', () => { commit(R.sell(state, id, n)); openBasket(); }, back && openBasket);
}
function neededCount(id) {
  let n = 0;
  for (const who of PEOPLE_IDS) n += R.activeQuest(state, who)?.req[id] ?? 0;
  for (const o of state.orders.slots) n += o?.req[id] ?? 0;
  return n;
}

// ---- 作業小屋 ----
function openWorkshop() {
  if (!state.bench.length) { toast('作業小屋は、とよさんの依頼を届けると使えるようになります。'); audio.sfx('deny'); return; }
  audio.sfx('page');
  let pick = state.bench.findIndex((b) => !b.r);
  modalView = () => {
    if (pick >= 0 && state.bench[pick]?.r) pick = state.bench.findIndex((b) => !b.r);
    const benches = h('div', { class: 'benches' }, ...state.bench.map((b, k) => h('button', {
      class: 'bench' + (b.r ? ' busy' : '') + (k === pick ? ' on' : ''), type: 'button', disabled: b.r ? true : null,
      onclick: () => { pick = k; modalView(); },
    }, b.r ? h('img', { src: itemImg(b.r), alt: '' }) : h('span', { class: 'bench-empty', text: '空き' }),
    h('small', { text: b.r ? `${GOODS[b.r].name} あと${b.left}晩` : `作業台${k + 1}` }))));
    const recipes = state.recipes.length ? h('div', { class: 'item-list' }, ...state.recipes.map((r) => {
      const g = GOODS[r];
      const can = R.hasReq(state, g.in);
      return h('div', { class: 'item-row' },
        h('img', { src: itemImg(r), alt: '' }),
        h('div', { class: 'item-main' }, h('b', { text: g.name }),
          h('small', {}, ...Object.entries(g.in).map(([id, n]) => itemIcon(id, `${R.count(state, id)}/${n}`)), ` ・${g.days}晩・売値 `, coinTag(g.price))),
        h('div', { class: 'item-act' }, h('button', {
          class: 'btn small' + (can && pick >= 0 ? '' : ' wait'), type: 'button',
          onclick: () => { if (pick < 0) { toast('空いている作業台がありません。完成まで待ちましょう。'); audio.sfx('deny'); return; } commit(R.craft(state, pick, r)); },
        }, '作る')));
    })) : h('p', { class: 'muted', text: 'まだ作り方を知りません。' });
    fillModal('作業小屋', [benches, recipes,
      h('p', { class: 'muted', text: '材料を作業台に仕込むと、「おやすみ」で夜が明けるごとに仕上がっていきます。完成品はかごに入ります。' })]);
  };
  openModal('作業小屋', []);
  modalView();
}

// ---- お店 ----
function openShop() {
  audio.sfx('page');
  modalView = () => {
    const rows = [];
    const st = R.nextPlotStep(state);
    rows.push(shopRow(plotImg('soil'), st ? `畑を${st.to}マスに広げる` : '畑（いちばん広い）', st ? `今は${state.plots.length}マス。` : `${state.plots.length}マス。これ以上は広げられません。`,
      st ? st.price : null, () => commit(R.buyPlots(state))));
    if (state.bigCan) {
      rows.push(shopRow(null, 'スプリンクラー', state.sprinkler ? '設置済み。毎朝、畑ぜんぶに水がまかれます。' : '毎朝、畑ぜんぶに自動で水をまきます。',
        state.sprinkler ? null : SPRINKLER_PRICE, () => commit(R.buySprinkler(state)), '🚿'));
    }
    for (const id of DECOR_IDS) {
      const d = DECOR[id];
      const own = state.decor.includes(id);
      rows.push(shopRow(`img/decor/${id}.webp`, d.name, own ? `庭に置いてあります。${d.text}` : d.text, own ? null : d.price, () => commit(R.buyDecor(state, id))));
    }
    const fs = R.festivalStatus(state);
    fillModal('お店', [h('div', { class: 'item-list' }, ...rows),
      h('p', { class: 'muted', text: `飾りは1つにつき売値と注文のお礼が +${Math.round(DECOR_BONUS * 100)}%。収穫祭には飾りが${fs.decorNeed}つ以上必要です（今 ${state.decor.length}）。` })]);
  };
  openModal('お店', []);
  modalView();
}
function shopRow(img, name, text, price, buy, emoji) {
  return h('div', { class: 'item-row' },
    img ? h('img', { src: img, alt: '' }) : h('span', { class: 'emoji-ico', 'aria-hidden': 'true', text: emoji || '' }),
    h('div', { class: 'item-main' }, h('b', { text: name }), h('small', { text })),
    h('div', { class: 'item-act' }, price != null
      ? h('button', { class: 'btn small' + (state.coins >= price ? ' gold' : ' wait'), type: 'button', onclick: buy }, h('i', { class: 'coin' }), String(price))
      : h('span', { class: 'done', text: '✓' })));
}

// ---- トースト・モーダル ----
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.replaceChildren(h('span', { text: msg }));
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), Math.min(6000, 2200 + msg.length * 45));
}
let modalOnClose = null;
function openModal(title, body, { closable = true, onClose = null } = {}) {
  fillModal(title, body, closable);
  $('modal').hidden = false;
  $('modal').dataset.closable = closable ? '1' : '';
  modalOnClose = onClose;
}
function fillModal(title, body, closable = $('modal').dataset.closable !== '') {
  const panel = $('modal-panel');
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  const head = h('h2', {}, h('span', { text: title }));
  if (closable) head.append(h('button', { class: 'iconbtn small', type: 'button', 'aria-label': '閉じる', onclick: closeModal }, '✕'));
  const bodyEl = h('div', { class: 'panel-body' }, ...body);
  panel.replaceChildren(head, bodyEl);
  bodyEl.scrollTop = scroll;
  panel.setAttribute('aria-label', title);
}
function closeModal() {
  $('modal').hidden = true;
  modalView = null;
  const f = modalOnClose;
  modalOnClose = null;
  f?.();
}
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && $('modal').dataset.closable) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('modal').hidden && $('modal').dataset.closable) closeModal();
});
function confirmBox(title, text, okLabel, onOk, onCancel) {
  modalView = null;
  openModal(title, [
    h('p', { text }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { closeModal(); onCancel?.(); } }, 'やめる'),
      h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); onOk(); } }, okLabel)),
  ]);
}

// ---- 設定 ----
function openSettings() {
  audio.sfx('page');
  modalView = null;
  const a = getAudioSettings(GAME_ID);
  const save = () => { setAudioSettings(GAME_ID, a); audio.apply(a); };
  const row = (label, key) => h('div', { class: 'row' },
    h('label', { for: `vol-${key}`, text: label }),
    h('input', {
      id: `vol-${key}`, type: 'range', min: '0', max: '100', value: String(Math.round(a[key].volume * 100)),
      oninput: (e) => { a[key].volume = Number(e.target.value) / 100; save(); },
      onchange: () => { audio.unlock(); if (key === 'sfx') audio.sfx('harvest'); },
    }),
    h('label', { class: 'check' }, h('input', {
      type: 'checkbox', checked: a[key].muted ? true : null,
      onchange: (e) => { a[key].muted = e.target.checked; save(); },
    }), 'ミュート'));
  const s = state.stats;
  const mins = Math.round(s.playMs / 60000);
  openModal('設定', [
    h('h3', { text: '音' }), row('BGM', 'bgm'), row('効果音', 'sfx'),
    h('p', { class: 'muted', text: '音は最初に画面をさわったときに始まります。設定はこの端末に保存されます。' }),
    h('h3', { text: '記録' }),
    h('div', { class: 'stats' },
      h('div', {}, '遊んだ時間', h('b', { text: `${Math.floor(mins / 60)}時間${mins % 60}分` })),
      h('div', {}, '収穫', h('b', { text: `${s.harvested}回` })),
      h('div', {}, '加工', h('b', { text: `${s.crafted}回` })),
      h('div', {}, '依頼', h('b', { text: `${R.questsDoneCount(state)}/${QUEST_TOTAL}` }))),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: openLog }, 'これまでの会話を読み返す')),
    h('h3', { text: 'あそびかた' }),
    h('ul', { class: 'howto' },
      h('li', { text: '空き畑をタップ → 選んだ種をまく。植えた畑をタップ → 水やり。実った畑をタップ → 収穫。' }),
      h('li', { text: '畑を長押し（右クリック）すると、作物を抜いて植え替えられます。' }),
      h('li', { text: '「おやすみ」で次の日へ。水をやった作物は、旬ならひと晩で、季節外れならふた晩で1段育ちます。' }),
      h('li', { text: '待ち時間やスタミナはありません。日を進めるのはいつでもあなたの自由です。' })),
    h('h3', { text: 'データ' }),
    h('p', { class: 'muted', text: '進行は操作のたびに自動で保存されます。バックアップ（JSONファイル）の保存と復元は、ランチャーの⚙設定から行えます。' }),
    h('div', { class: 'actions' },
      h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ戻る'),
      h('button', { class: 'btn ghost', type: 'button', onclick: confirmReset }, 'はじめから遊ぶ')),
  ]);
}
function confirmReset() {
  confirmBox('はじめから遊ぶ', '今の進行を消して、1年目の春から始めます。消したデータは元に戻せません（ランチャーでバックアップを保存しておくと安心です）。', 'はじめから', () => {
    confirmBox('本当によろしいですか？', '畑・かご・コイン・依頼の進行がすべてリセットされます。', '消して始める', () => {
      commit({ ok: true, state: R.newGame(), events: [], msg: '' });
      audio.setSong('spring');
    });
  });
}
function openLog() {
  modalView = null;
  const items = state.dialogues.filter((id) => DIALOGUES[id]).map((id) => {
    const d = DIALOGUES[id];
    const who = d.who ? PEOPLE[d.who].name : '';
    return h('details', { class: 'log-item' }, h('summary', { text: who ? `${who}・${d.title}` : d.title }),
      ...d.lines.map((l) => h('p', { text: l })));
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
  if (id === 'festival') {
    $('scene').classList.add('festival');
    audio.setSong('festival');
  }
  showLine();
}
function showLine() {
  const d = DIALOGUES[talking.id];
  const p = d.who ? PEOPLE[d.who] : null;
  $('talk-face').hidden = !p;
  if (p) $('talk-face').src = p.img;
  $('talk-who').textContent = p ? p.name : '';
  $('talk-title').textContent = `${d.title}　${talking.k + 1}/${d.lines.length}`;
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
  commit(R.ackDialogue(state, id));
  if (id === 'festival') showEnding();
}
$('talk-next').addEventListener('click', (e) => { e.stopPropagation(); nextLine(); });
$('talk-skip').addEventListener('click', (e) => { e.stopPropagation(); endTalk(); });
$('talk').addEventListener('click', (e) => { if (e.target.closest('.talk-box') && !e.target.closest('button')) nextLine(); });

function showEnding() {
  audio.sfx('fanfare');
  const s = state.stats;
  const mins = Math.round(s.playMs / 60000);
  openModal('はじめての収穫祭', [
    h('div', { class: 'ending' },
      h('img', { class: 'ending-img', src: 'img/bg/festival.webp', alt: '灯りのともる収穫祭の菜園' }),
      h('p', { text: 'ひだまり菜園の物語は、ひとまずおしまい。' }),
      h('p', { text: 'これからも畑を広げたり、注文にこたえたりして、自由に暮らせます。' }),
      h('div', { class: 'stats' },
        h('div', {}, '遊んだ時間', h('b', { text: `約${Math.floor(mins / 60)}時間${mins % 60}分` })),
        h('div', {}, '過ごした日数', h('b', { text: `${state.day}日` })),
        h('div', {}, '収穫した回数', h('b', { text: `${s.harvested}回` })),
        h('div', {}, '届けた注文', h('b', { text: `${s.ordersDone}件` }))),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal }, '菜園の暮らしをつづける'))),
  ], { onClose: () => { $('scene').classList.remove('festival'); audio.setSong(SEASONS[R.seasonIndex(state.day)].id); } });
}

// ---- ボタン ----
$('btn-settings').addEventListener('click', openSettings);
$('btn-basket').addEventListener('click', openBasket);
$('btn-workshop').addEventListener('click', openWorkshop);
$('btn-shop').addEventListener('click', openShop);
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
  } catch {
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
      h('p', { text: 'ひだまり菜園は別のタブ（またはホーム画面版）で開かれています。データの上書きを防ぐため、そちらを閉じてから「もう一度確認」を押してください。' }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn ghost', href: '../../index.html' }, 'ランチャーへ'),
        h('button', { class: 'btn', type: 'button', onclick: retry }, 'もう一度確認')),
    ], { closable: false });
  });
}

async function boot() {
  audio.apply(getAudioSettings(GAME_ID));
  await waitLock();
  const init = await loadInitial();
  if (!init) return;
  state = R.normalize(init.s);
  rev = init.rev;
  if (validate(state).length) console.warn('state invalid', validate(state));
  audio.setSong(SEASONS[R.seasonIndex(state.day)].id);
  $('app').removeAttribute('aria-busy');
  render();
  maybeTalk();
  const first = () => audio.unlock();
  window.addEventListener('pointerdown', first, { once: true, capture: true });
  window.addEventListener('keydown', first, { once: true, capture: true });
  initServiceWorker('../../sw.js', {
    onUpdate: () => toast('新しい版を準備しました。ランチャーに戻ると更新できます。'),
  }).catch(() => {});
  // テスト用の読み取り専用フック（状態を変更する機能は持たない）
  window.__hidamari = { get state() { return structuredClone(state); }, get rev() { return rev; }, saving: () => saving || dirty };
}

boot();

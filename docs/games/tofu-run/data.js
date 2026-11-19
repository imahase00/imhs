// にげろ！とうふ: ゲームデータ（距離はメートル、時間は秒）
export const GAME_ID = 'tofu-run';
export const SCHEMA = 1;

// ---- 走りの物理 ----
export const LANE_W = 1.0;            // レーンの間隔（中央 0、左 -1、右 +1）
export const ROAD_HALF = 1.6;         // 道の半分の幅
export const TOFU = { w: 0.64, h: 0.64, d: 0.6, slideH: 0.28 };
export const JUMP_V = 7.4;
export const GRAVITY = 25;
export const SLIDE_TIME = 0.62;
export const LANE_TIME = 0.14;        // レーン移動にかかる時間
export const START_SPEED = 8;
export const MAX_SPEED = 21;
/** 進んだ距離 d における速さ */
export const speedAt = (d) => START_SPEED + (MAX_SPEED - START_SPEED) * (1 - Math.exp(-d / 2200));

// ---- 場面（距離で切り替わる。最後まで行くと台所へ戻り、夜になる） ----
export const ZONES = [
  { id: 'kitchen', name: '台所', from: 0 },
  { id: 'table', name: '食卓', from: 450 },
  { id: 'garden', name: '縁側と庭', from: 1100 },
  { id: 'street', name: '夜の商店街', from: 1900 },
];
export const LAP = 2800;
export function zoneAt(d) {
  const lap = Math.floor(Math.max(0, d) / LAP);
  const r = Math.max(0, d) - lap * LAP;
  let k = 0;
  for (let i = 0; i < ZONES.length; i++) if (r >= ZONES[i].from) k = i;
  return { zone: ZONES[k], index: k, lap };
}

// ---- 障害物 ----
// type: block（そのレーンをふさぐ・よけるしかない） low（跳ぶ） high（つぶれてくぐる）
// death: 崩れたときのひとこと（くずれかた図鑑に載る）
export const OBSTACLES = {
  pot:       { zone: 'kitchen', type: 'block', name: '土鍋', death: '土鍋に飛びこんで、湯豆腐になった。' },
  soy:       { zone: 'kitchen', type: 'block', name: '醤油差し', death: '醤油差しに激突。しょうゆが中までしみた。' },
  knife:     { zone: 'kitchen', type: 'block', name: '包丁', death: '包丁に切られて、さいの目になった。' },
  saibashi:  { zone: 'kitchen', type: 'low', name: '菜箸', death: '菜箸につまずいて、角が欠けた。' },
  otama:     { zone: 'kitchen', type: 'high', name: 'お玉', death: 'お玉にすくわれて、味噌汁の具になった。' },
  chawan:    { zone: 'table', type: 'block', name: '茶碗', death: 'ご飯の上にのって、とうふ丼になった。' },
  kyusu:     { zone: 'table', type: 'block', name: '急須', death: '急須にぶつかって、お茶をかぶった。' },
  waribashi: { zone: 'table', type: 'low', name: '割り箸', death: '割り箸につまずいて、まっぷたつ。' },
  shamoji:   { zone: 'table', type: 'high', name: 'しゃもじ', death: 'しゃもじで、ぺしゃんこにされた。' },
  cat:       { zone: 'garden', type: 'block', name: 'ネコ', death: 'ネコに、ぺろりと食べられた。' },
  planter:   { zone: 'garden', type: 'block', name: '植木鉢', death: '植木鉢にぶつかって、土まみれ。' },
  hose:      { zone: 'garden', type: 'low', name: 'ホース', death: 'ホースにつまずいて、水びたし。' },
  laundry:   { zone: 'garden', type: 'high', name: '洗濯物', death: '洗濯物にからまって、干された。' },
  box:       { zone: 'street', type: 'block', name: '段ボール', death: '段ボールに激突。そのまま出荷された。' },
  sign:      { zone: 'street', type: 'block', name: '立て看板', death: '看板にぶつかって「本日の特売品」になった。' },
  broom:     { zone: 'street', type: 'low', name: 'ほうき', death: 'ほうきにつまずいて、掃き出された。' },
  noren:     { zone: 'street', type: 'high', name: 'のれん', death: 'のれんをくぐれず、おでん屋に入店した。' },
};
export const OBSTACLE_IDS = Object.keys(OBSTACLES);
export const OB_SIZE = { block: { d: 0.55 }, low: { d: 0.3, h: 0.32 }, high: { d: 0.3, bottom: 0.42 } };

// ---- 拾えるもの ----
export const PICKUPS = {
  negi:   { name: 'ねぎ', r: 0.5 },
  ice:    { name: '氷', r: 0.55, desc: '1回だけ、ぶつかっても崩れない' },
  katsuo: { name: 'かつおぶし', r: 0.55, desc: 'しばらく、まわりのねぎを引き寄せる', time: 9 },
};

// ---- とうふの種類（見た目だけ。お題の達成数で増える） ----
export const SKINS = [
  { id: 'kinu', name: '絹ごし', need: 0, note: 'なめらか。いちばん崩れやすい。' },
  { id: 'momen', name: '木綿', need: 3, note: 'ざらっと素朴。崩れやすさは同じ。' },
  { id: 'yaki', name: '焼き豆腐', need: 6, note: 'こんがり焼き目。すき焼き帰り。' },
  { id: 'atsuage', name: '厚揚げ', need: 10, note: 'きつね色の衣。中身はとうふ。' },
  { id: 'goma', name: '胡麻豆腐', need: 14, note: 'じつは豆腐ではない。' },
  { id: 'koya', name: '高野豆腐', need: 18, note: 'すかすか。乾いている。' },
  { id: 'annin', name: '杏仁豆腐', need: 22, note: 'もはやデザート。クコの実つき。' },
  { id: 'kin', name: '金の豆腐', need: 30, note: 'お題をすべて達成した証。' },
];

// ---- お題（r: 1回の記録 / s: 通算の記録） ----
export const MISSIONS = [
  { id: 'm100', text: '100m 走る', check: (r) => r.dist >= 100 },
  { id: 'fall1', text: 'とりあえず一度崩れる', check: (r) => !!r.cause },
  { id: 'negi10', text: '1回で ねぎを10個 とる', check: (r) => r.negi >= 10 },
  { id: 'jump5', text: '1回で 5回 跳ぶ', check: (r) => r.jumps >= 5 },
  { id: 'slide5', text: '1回で 5回 つぶれてくぐる', check: (r) => r.slides >= 5 },
  { id: 'm300', text: '300m 走る', check: (r) => r.dist >= 300 },
  { id: 'table', text: '食卓にたどりつく（450m）', check: (r) => r.dist >= 450 },
  { id: 'total1k', text: '通算 1000m 走る', check: (r, s) => s.stats.dist >= 1000 },
  { id: 'negi30', text: '1回で ねぎを30個 とる', check: (r) => r.negi >= 30 },
  { id: 'ice1', text: '氷をとる', check: (r) => r.ice >= 1 },
  { id: 'nojump300', text: '一度も跳ばずに 300m', check: (r) => r.noJumpDist >= 300 },
  { id: 'dex4', text: 'くずれかた図鑑を 4つ 埋める', check: (r, s) => Object.keys(s.deaths).length >= 4 },
  { id: 'm700', text: '700m 走る', check: (r) => r.dist >= 700 },
  { id: 'katsuo1', text: 'かつおぶしをとる', check: (r) => r.katsuo >= 1 },
  { id: 'lanes40', text: '1回で 左右に40回 よける', check: (r) => r.lanes >= 40 },
  { id: 'garden', text: '縁側にたどりつく（1100m）', check: (r) => r.dist >= 1100 },
  { id: 'negi60', text: '1回で ねぎを60個 とる', check: (r) => r.negi >= 60 },
  { id: 'runs20', text: '通算 20回 走る', check: (r, s) => s.stats.runs >= 20 },
  { id: 'saved', text: '氷のおかげで 1回 助かる', check: (r) => r.saved >= 1 },
  { id: 'total10k', text: '通算 10000m 走る', check: (r, s) => s.stats.dist >= 10000 },
  { id: 'm1500', text: '1500m 走る', check: (r) => r.dist >= 1500 },
  { id: 'street', text: '夜の商店街にたどりつく（1900m）', check: (r) => r.dist >= 1900 },
  { id: 'dex10', text: 'くずれかた図鑑を 10 埋める', check: (r, s) => Object.keys(s.deaths).length >= 10 },
  { id: 'negiTotal', text: '通算 ねぎを1000個 とる', check: (r, s) => s.stats.negi >= 1000 },
  { id: 'nonegi500', text: 'ねぎを1個もとらずに 500m', check: (r) => r.noNegiDist >= 500 },
  { id: 'm2500', text: '2500m 走る', check: (r) => r.dist >= 2500 },
  { id: 'lap', text: '台所に戻ってくる（2800m）', check: (r) => r.dist >= LAP },
  { id: 'dexAll', text: 'くずれかた図鑑を すべて 埋める', check: (r, s) => OBSTACLE_IDS.every((k) => s.deaths[k]) },
  { id: 'negi120', text: '1回で ねぎを120個 とる', check: (r) => r.negi >= 120 },
  { id: 'm4000', text: '4000m 走る', check: (r) => r.dist >= 4000 },
];

export const INTRO = [
  '朝の台所。まな板の上に、とうふが一丁。',
  '包丁が、きらりと光った。',
  '――とうふは、走り出した。',
];

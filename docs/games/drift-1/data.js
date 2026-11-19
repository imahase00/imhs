// 漂流発明記 ― 霧の島 ―: 数値・地図・会話（調整はこのファイルで）
export const GAME_ID = 'drift-1';
export const SCHEMA = 1;
export const TITLE = '漂流発明記 ― 霧の島 ―';

export const SPRITE = (id) => `img/sprites/${id}.webp`;
export const GROUND = (id) => `img/ground/${id}.webp`;
export const SCENE = (id) => `img/scene/${id}.webp`;

// ---- 地図（1マス200。30×30マス＝6000×6000）----
export const CELL = 200;
export const GRID = 30;
export const WORLD = { w: CELL * GRID, h: CELL * GRID };
// 地面: ~ 海・川 / . 砂浜 / g 草地 / d 土の道 / r 岩場 / t 石畳 / C 崖 / F 深い森（通れない）
// 関門のマス（b 壊れた橋、L 崖のリフト、l 倒木）は関門を開くと通れる
function buildMap() {
  const m = Array.from({ length: GRID }, () => Array(GRID).fill('~'));
  const fill = (x1, y1, x2, y2, c) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) m[y][x] = c; };
  fill(5, 22, 24, 26, '.'); fill(7, 27, 22, 27, '.'); fill(4, 23, 4, 25, '.'); fill(25, 23, 25, 25, '.');   // 南の浜辺
  fill(11, 9, 18, 20, 'g');                     // 中央の森
  fill(2, 10, 9, 20, 'r'); fill(3, 9, 8, 9, 'r'); // 西の岩山・鉱山
  fill(20, 9, 27, 20, 'g'); fill(21, 11, 26, 18, 't');   // 東の研究所
  fill(11, 2, 18, 7, 'r'); fill(12, 1, 17, 1, 'r'); fill(13, 3, 16, 6, 'd');   // 北の山頂
  fill(10, 8, 19, 8, 'C');                      // 山頂の下の崖
  fill(2, 21, 27, 21, 'F'); fill(10, 9, 10, 20, '~'); fill(19, 9, 19, 20, '~');   // 森の縁と2本の川
  fill(1, 21, 1, 21, '~'); fill(28, 21, 28, 21, '~');
  fill(15, 9, 15, 20, 'd'); fill(11, 15, 18, 15, 'd'); fill(3, 15, 9, 15, 'd'); fill(20, 15, 24, 15, 'd'); fill(15, 21, 15, 22, 'd');
  m[21][15] = 'l'; m[15][10] = 'b'; m[15][19] = 'b'; m[8][15] = 'L';
  return m.map((r) => r.join(''));
}
export const MAP = buildMap();
export const WALKABLE = new Set(['.', 'g', 'd', 'r', 't']);
export const GROUND_OF = { '~': 'sea', '.': 'sand', g: 'grass', d: 'dirt', r: 'rock', t: 'tiles', C: 'rock', F: 'grass', b: 'sea', L: 'rock', l: 'dirt' };

// ---- 関門（開くと先の地域へ行ける）----
export const GATES = [
  { id: 'log', name: '道をふさぐ倒木', cell: [15, 21], need: { tool: 1 }, cost: {}, sprite: 'n-log',
    desc: '石の道具があれば、倒木を切ってどかせます', done: 'log' },
  { id: 'bridge1', name: '西の崩れた橋', cell: [10, 15], cost: { plank: 20, stone: 12 }, sprite: 'bridge-broken', open: 'bridge',
    desc: '板材と石で橋を直すと、西の岩山へ渡れます' },
  { id: 'bridge2', name: '東の崩れた橋', cell: [19, 15], cost: { 'iron-plate': 12, plank: 12 }, sprite: 'bridge-broken', open: 'bridge',
    desc: '鉄板で補強すれば、東の研究所へ渡れます' },
  { id: 'lift', name: '崖の蒸気リフト', cell: [15, 8], cost: { 'iron-plate': 40, pipe: 20, gear: 20 }, sprite: null, open: 'm-lift', needEra: 4,
    desc: '地熱炉の蒸気があれば、リフトで崖の上の山頂へ登れます' },
];

// ---- 物 ----
export const ITEMS = {
  wood: { name: '丸太' }, stone: { name: '石' }, 'copper-ore': { name: '銅鉱石' }, 'iron-ore': { name: '鉄鉱石' },
  coal: { name: '石炭' }, cotton: { name: '綿花' },
  plank: { name: '板材' }, 'copper-plate': { name: '銅板' }, 'iron-plate': { name: '鉄板' }, gear: { name: '歯車' },
  pipe: { name: '管' }, cloth: { name: '布' },
  engine: { name: '蒸気機関' }, frame: { name: '船体の骨組み' }, envelope: { name: '気嚢' }, propeller: { name: 'プロペラ' },
};
export const ITEM_IDS = Object.keys(ITEMS);

// ---- 島の資源（尽きない。採るほど時間がかかるのは道具しだい）----
export const NODE_KINDS = {
  tree: { name: '木', item: 'wood', sprite: 'n-tree', size: 210, radius: 40, pose: 'axe' },
  rock: { name: '岩', item: 'stone', sprite: 'n-rock', size: 150, radius: 55, pose: 'pick' },
  copper: { name: '銅の鉱脈', item: 'copper-ore', sprite: 'n-copper', size: 150, radius: 55, pose: 'pick' },
  iron: { name: '鉄の鉱脈', item: 'iron-ore', sprite: 'n-iron', size: 150, radius: 55, pose: 'pick' },
  coal: { name: '石炭の層', item: 'coal', sprite: 'n-coal', size: 150, radius: 55, pose: 'pick' },
  cotton: { name: '綿花の茂み', item: 'cotton', sprite: 'n-cotton', size: 130, radius: 35, pose: 'pick' },
};

// 固定の配置（乱数で作ると版ごとに変わるので、ここに書いておく）
export const NODES = [
  // 浜辺
  ['tree', 1300, 4650], ['tree', 1650, 4500], ['tree', 4100, 4550], ['tree', 4450, 4700], ['tree', 1900, 5300], ['tree', 3900, 5350],
  ['rock', 1500, 5000], ['rock', 3500, 4600], ['rock', 4300, 5100], ['rock', 2100, 5500],
  // 中央の森
  ['tree', 2400, 1950], ['tree', 2550, 2350], ['tree', 3600, 2000], ['tree', 3500, 2450], ['tree', 2450, 3500], ['tree', 3650, 3450],
  ['tree', 2350, 3950], ['tree', 3700, 3950], ['tree', 2700, 4050], ['tree', 3400, 1850],
  ['rock', 2600, 2750], ['rock', 3550, 2800],
  ['copper', 2450, 2600], ['copper', 3700, 3700], ['copper', 2550, 3250],
  ['coal', 3500, 3250], ['coal', 2350, 2150], ['coal', 3700, 2250],
  ['cotton', 2700, 3700], ['cotton', 3350, 3750], ['cotton', 2650, 2050], ['cotton', 3350, 2150],
  // 西の岩山・鉱山
  ['iron', 800, 2300], ['iron', 1300, 2100], ['iron', 1700, 2500], ['iron', 900, 3700], ['iron', 1500, 3900], ['iron', 650, 3200],
  ['coal', 1100, 2700], ['coal', 1650, 3500], ['coal', 700, 4000],
  ['copper', 1400, 3400], ['copper', 1800, 2200],
  ['rock', 1000, 3300], ['rock', 1750, 4050], ['rock', 1250, 2400],
  // 東の研究所
  ['cotton', 4250, 2000], ['cotton', 5400, 2000], ['cotton', 4200, 3950], ['cotton', 5500, 3900], ['cotton', 4500, 4000], ['cotton', 5250, 1900],
  ['tree', 4150, 2450], ['tree', 5450, 2500], ['tree', 4150, 3550], ['tree', 5500, 3450],
  ['rock', 4300, 1900], ['rock', 5350, 4050],
  // 山頂
  ['rock', 2450, 700], ['rock', 3550, 750], ['iron', 2500, 1300], ['coal', 3500, 1300],
].map(([kind, x, y], i) => ({ id: `n${i}`, kind, x, y }));

// ---- 目印になる大きなもの ----
export const LANDMARKS = {
  wreck: { x: 2300, y: 4950, sprite: 'wreck', size: 420, radius: 120, name: '墜落した飛行船' },
  lab: { x: 4750, y: 2700, sprite: 'lab', size: 520, radius: 170, name: '廃墟の研究所' },
  reactor: { x: 5050, y: 3500, sprite: 'reactor-off', spriteOn: 'reactor-on', size: 360, radius: 110, name: '地熱炉' },
  dock: { x: 3000, y: 800, sprite: 'dock', size: 520, radius: 60, name: '山頂の発着場', solid: false },
};
export const START = { x: 2750, y: 5150 };

// ---- 動く範囲・歩く速さ ----
export const HERO = { speed: 300, radius: 22, reach: 150, bag: [12, 24, 40, 64], speedUp: [1, 1.15, 1.3] };
// 道具の段階: 採るのにかかる秒数
export const TOOLS = [
  { name: '素手', time: 1.6 },
  { name: '石の道具', time: 0.95 },
  { name: '鉄の道具', time: 0.55 },
  { name: '蒸気工具', time: 0.3 },
];

// ---- 作業台で手作り（主人公が近くにいるとき）----
// kind: item=物を作る / tool=道具 / bag=背負い袋 / boots=靴
export const BENCH = [
  { id: 'plank', kind: 'item', out: 'plank', n: 1, cost: { wood: 2 }, name: '板材' },
  { id: 'tool1', kind: 'tool', level: 1, cost: { wood: 5, stone: 5 }, name: '石の道具', desc: '採るのが速くなり、倒木を切れるようになる' },
  { id: 'bag1', kind: 'bag', level: 1, cost: { plank: 4, cotton: 6 }, name: '大きな背負い袋', desc: '持てる数 12 → 24' },
  { id: 'boots1', kind: 'boots', level: 1, cost: { plank: 6, 'copper-plate': 4 }, name: '銅の靴底', desc: '歩く速さ +15%' },
  { id: 'tool2', kind: 'tool', level: 2, cost: { 'iron-plate': 6, plank: 4 }, name: '鉄の道具', desc: '採るのがもっと速くなる' },
  { id: 'bag2', kind: 'bag', level: 2, cost: { cloth: 6, 'iron-plate': 2 }, name: '帆布の背負い袋', desc: '持てる数 24 → 40' },
  { id: 'boots2', kind: 'boots', level: 2, cost: { gear: 6, pipe: 4 }, name: '蒸気の靴', desc: '歩く速さ +30%' },
  { id: 'tool3', kind: 'tool', level: 3, cost: { gear: 8, pipe: 6, 'copper-plate': 6 }, name: '蒸気工具', desc: '採るのがとても速くなる' },
  { id: 'bag3', kind: 'bag', level: 3, cost: { cloth: 12, gear: 6 }, name: '発明家の大袋', desc: '持てる数 40 → 64' },
];

// ---- 機械 ----
// role: extract=資源の上に置いて採る / process=材料を加工 / store=倉庫 / power=蒸気の源 / bench / station
// on: 置ける資源の種類 / power: 蒸気が必要か / era: 作れるようになる時代
export const MACHINES = {
  bench: { name: '作業台', sprite: 'm-bench', role: 'bench', size: 170, radius: 50, era: 9, cost: {} },
  store: { name: '倉庫', sprite: 'm-store', role: 'store', size: 170, radius: 55, era: 1, cost: { plank: 6 } },
  handdrill: { name: '手回し採掘機', sprite: 'm-handdrill', role: 'extract', on: ['rock', 'copper', 'iron', 'coal'], size: 160, radius: 45, era: 1,
    time: 9, cost: { wood: 6, stone: 6 }, desc: '鉱脈の上に置くと、蒸気なしでゆっくり掘る' },
  furnace: { name: '石の炉', sprite: 'm-furnace', role: 'process', size: 170, radius: 55, era: 1, cost: { stone: 14, wood: 4 },
    recipes: ['copper-plate', 'iron-plate'], desc: '鉱石と石炭から金属の板を作る（蒸気は不要）' },
  boiler: { name: '蒸気ボイラー', sprite: 'm-boiler', role: 'power', size: 180, radius: 55, era: 2,
    cost: { 'copper-plate': 6, stone: 10, plank: 4 }, desc: '石炭を燃やし、まわりの機械に蒸気を送る' },
  drill: { name: '蒸気ドリル', sprite: 'm-drill', role: 'extract', on: ['rock', 'copper', 'iron', 'coal'], size: 170, radius: 50, era: 2, power: true,
    time: 3.2, cost: { plank: 6, 'copper-plate': 5 }, desc: '鉱脈の上に置く。蒸気で速く掘る' },
  saw: { name: '製材機', sprite: 'm-saw', role: 'extract', on: ['tree'], out: 'plank', size: 170, radius: 50, era: 2, power: true,
    time: 4, cost: { plank: 4, 'copper-plate': 4, stone: 4 }, desc: '木のそばに置く。木を切って板材にする' },
  roller: { name: '圧延機', sprite: 'm-roller', role: 'process', size: 170, radius: 55, era: 3, power: true,
    cost: { 'iron-plate': 8, 'copper-plate': 4 }, recipes: ['pipe'], desc: '銅板を伸ばして管にする' },
  assembler: { name: '組立機', sprite: 'm-assembler', role: 'process', size: 170, radius: 55, era: 3, power: true,
    cost: { 'iron-plate': 10, 'copper-plate': 6 }, recipes: ['gear'], desc: '鉄板から歯車を作る' },
  loom: { name: '紡織機', sprite: 'm-loom', role: 'process', size: 170, radius: 55, era: 3, power: true,
    cost: { plank: 10, 'iron-plate': 4 }, recipes: ['cloth'], desc: '綿花から布を織る' },
  warehouse: { name: '大きな倉庫', sprite: 'm-warehouse', role: 'store', size: 190, radius: 65, era: 3, cost: { plank: 10, 'iron-plate': 6 } },
  station: { name: 'トロッコの駅', sprite: 'm-station', role: 'station', size: 190, radius: 55, era: 3,
    cost: { plank: 12, 'iron-plate': 8 }, desc: '駅どうしをトロッコで行き来できる' },
  bigdrill: { name: '大型ドリル', sprite: 'm-bigdrill', role: 'extract', on: ['rock', 'copper', 'iron', 'coal'], size: 200, radius: 60, era: 4, power: true,
    time: 1.2, cost: { 'iron-plate': 14, gear: 8, pipe: 6 }, desc: '鉱脈の上に置く。とても速く掘る' },
  bigassembler: { name: '大型組立機', sprite: 'm-bigassembler', role: 'process', size: 210, radius: 65, era: 4, power: true,
    cost: { 'iron-plate': 16, gear: 10, pipe: 8 }, recipes: ['engine', 'frame', 'envelope', 'propeller', 'drone'], desc: '飛行船の部品と運搬ドローンを作る' },
};
export const BUILD_ORDER = ['store', 'handdrill', 'furnace', 'boiler', 'drill', 'saw', 'roller', 'assembler', 'loom', 'warehouse', 'station', 'bigdrill', 'bigassembler'];
export const BUILD_GAP = 150;     // 建物どうしの最低の間隔
export const EXTRACT_REACH = 170; // 採掘機を資源から離して置ける距離

// 加工のレシピ: 材料 → できる物（秒）
export const RECIPES = {
  'copper-plate': { in: { 'copper-ore': 1, coal: 1 }, out: 'copper-plate', n: 1, time: 3.5 },
  'iron-plate': { in: { 'iron-ore': 1, coal: 1 }, out: 'iron-plate', n: 1, time: 4.5 },
  pipe: { in: { 'copper-plate': 1 }, out: 'pipe', n: 1, time: 3 },
  gear: { in: { 'iron-plate': 1 }, out: 'gear', n: 2, time: 3.5 },
  cloth: { in: { cotton: 3 }, out: 'cloth', n: 1, time: 4 },
  engine: { in: { 'iron-plate': 8, gear: 8, pipe: 8 }, out: 'engine', n: 1, time: 24 },
  frame: { in: { plank: 16, 'iron-plate': 8 }, out: 'frame', n: 1, time: 24 },
  envelope: { in: { cloth: 12, 'copper-plate': 4 }, out: 'envelope', n: 1, time: 24 },
  propeller: { in: { plank: 8, gear: 6, 'copper-plate': 4 }, out: 'propeller', n: 1, time: 18 },
  drone: { in: { gear: 6, 'copper-plate': 6, pipe: 4 }, out: null, bot: 'drone', n: 1, time: 20, name: '運搬ドローン' },
};
// 段階による速さ（Lv1〜3）と、強化の費用（作るときの費用に掛ける）
export const LEVEL_SPEED = [1, 1.7, 2.6];
export const LEVEL_COST_MULT = [0, 1.5, 3];
export const INPUT_CAP = 3;       // 材料はレシピ何回分までためるか
export const OUTPUT_CAP = 12;     // 出来た物をためておける数（いっぱいだと止まる）
export const STOCK_LIMIT = 80;    // 倉庫にこれだけあれば、加工の機械は作るのを休む（材料の取り合いを防ぐ）

// ---- 蒸気 ----
export const POWER = { radius: 720, burn: 14, fuelCap: 10 };   // 石炭1つで14秒

// ---- ベルト ----
export const BELT = {
  maxLen: 1800, costPer: 100,        // 長さ100ごとに費用
  levels: [
    { name: '木のベルト', speed: 110, every: 1.6, cost: { plank: 1 } },
    { name: '鉄のベルト', speed: 200, every: 0.8, cost: { 'iron-plate': 1 } },
  ],
};

// ---- ロボット ----
export const BOTS = {
  carry: { name: '運搬ロボ', sprite: 'bot-carry', speed: 150, cap: 4, size: 110 },
  miner: { name: '採掘ロボ', sprite: 'bot-miner', speed: 120, time: 5, size: 120 },
  drone: { name: '運搬ドローン', sprite: 'bot-drone', speed: 330, cap: 8, size: 110, fly: true },
};
// 故障したロボ（直すと仲間になる）
export const BROKEN_BOTS = [
  { id: 'b1', type: 'carry', x: 2850, y: 3500, cost: { plank: 4, 'copper-plate': 2 } },
  { id: 'b2', type: 'miner', x: 1150, y: 3000, cost: { 'iron-plate': 3, 'copper-plate': 2 } },
  { id: 'b3', type: 'carry', x: 1500, y: 2650, cost: { 'iron-plate': 3, plank: 4 } },
  { id: 'b4', type: 'carry', x: 4400, y: 2300, cost: { 'iron-plate': 4, gear: 2 } },
  { id: 'b5', type: 'miner', x: 5150, y: 2350, cost: { 'iron-plate': 4, gear: 2 } },
  { id: 'b6', type: 'carry', x: 4450, y: 3300, cost: { gear: 4, pipe: 2 } },
  { id: 'b7', type: 'miner', x: 5400, y: 3200, cost: { gear: 4, pipe: 2 } },
  { id: 'b8', type: 'miner', x: 2300, y: 2950, cost: { plank: 6, 'copper-plate': 3 } },
];

// ---- 飛行船（山頂の発着場に納める）----
export const SHIP = { engine: 3, frame: 3, envelope: 3, propeller: 3 };
export const REACTOR_COST = { gear: 40, pipe: 40, 'iron-plate': 50 };
export const BOILER_REPAIR = { 'copper-plate': 6, plank: 8, stone: 10 };

// ---- 漂流物（浜辺にときどき流れ着く）----
export const DRIFT = { every: 75, max: 2, area: { x1: 1600, y1: 5450, x2: 4300, y2: 5560 },
  loot: [{ plank: 4 }, { 'copper-plate': 3 }, { 'iron-plate': 2 }, { gear: 2 }, { coal: 4 }, { cloth: 2 }, { pipe: 2 }] };

// ---- 時代 ----
export const ERAS = ['', '手作業の時代', '蒸気の時代', '工場の時代', '大工場の時代'];

// ---- 目標（順番に進む。画面上に1つずつ表示）----
// kind: near=場所に行く / have=持つ（袋＋倉庫）/ tool / build=建てる / gate / boiler / bot / lab / belt / reactor / ship
export const QUESTS = [
  { id: 'wake', kind: 'near', at: 'wreck', text: '墜落した飛行船を調べる', talk: 'wreck' },
  { id: 'gather', kind: 'have', need: { wood: 6, stone: 6 }, text: '木と石を6つずつ集める（近くで立ち止まると採れる）', talk: 'gathered' },
  { id: 'tool', kind: 'tool', level: 1, text: '作業台で「石の道具」を作る', at: 'bench', talk: 'tool' },
  { id: 'log', kind: 'gate', gate: 'log', text: '北の倒木をどかして森へ', talk: 'forest' },
  { id: 'furnace', kind: 'build', machine: 'furnace', text: '石の炉を建てる（下の「建てる」から）', talk: 'furnace' },
  { id: 'copper', kind: 'have', need: { 'copper-plate': 6 }, text: '銅板を6枚作る（炉に銅鉱石と石炭を入れる）' },
  { id: 'boiler', kind: 'boiler', text: '残骸のボイラーを直す', at: 'wreck', talk: 'steam' },
  { id: 'drill', kind: 'build', machine: 'drill', text: '蒸気の届く所に蒸気ドリルを建てる', talk: 'drill' },
  { id: 'bot', kind: 'bot', text: '森で倒れているロボットを直す', at: 'b1', talk: 'bot' },
  { id: 'bridge1', kind: 'gate', gate: 'bridge1', text: '西の橋を直して岩山へ', talk: 'mines' },
  { id: 'iron', kind: 'have', need: { 'iron-plate': 12 }, text: '鉄板を12枚作る' },
  { id: 'bridge2', kind: 'gate', gate: 'bridge2', text: '東の橋を直して、霧の向こうへ' },
  { id: 'lab', kind: 'near', at: 'lab', text: '霧の奥の建物を調べる', talk: 'lab', scene: 'lab' },
  { id: 'belt', kind: 'belt', text: '機械から機械へベルトをつなぐ', talk: 'belt' },
  { id: 'parts', kind: 'have', need: { gear: 40, pipe: 40 }, text: '歯車と管を40ずつ作る' },
  { id: 'reactor', kind: 'reactor', text: '研究所の地下の地熱炉を動かす', at: 'reactor', talk: 'reactor', scene: 'reactor' },
  { id: 'lift', kind: 'gate', gate: 'lift', text: '崖に蒸気リフトを建てて山頂へ' },
  { id: 'dock', kind: 'near', at: 'dock', text: '山頂の発着場へ行く', talk: 'dock' },
  { id: 'ship', kind: 'ship', text: '飛行船の部品をすべて発着場に納める', at: 'dock' },
];

// ---- 会話 ----
export const DIALOGUES = {
  opening: { title: '霧の浜辺', lines: [
    '……ここは、どこだ？',
    '嵐に巻き込まれて……そうだ、飛行船ごと落ちたんだ。',
    '浜辺の向こうに、ぼくの飛行船が見える。まずは、あそこまで行ってみよう。',
  ] },
  wreck: { title: '墜落した飛行船', lines: [
    '気嚢は破れて、プロペラも折れている。これじゃ、もう飛べない。',
    'でも、工具箱と作業台は無事だった。積んでいた木箱も倉庫代わりに使える。',
    '島の木や石を集めて、できることから始めよう。木や岩のそばで立ち止まれば、手で採れるはずだ。',
  ] },
  gathered: { title: '道具を作ろう', lines: [
    '集めた物は、袋に入れて運ぶ。倉庫のそばを通れば、自動でしまっておける。',
    '作業台のそばで、石の道具を作ろう。素手より、ずっと速く採れるはずだ。',
  ] },
  tool: { title: '石の道具', lines: [
    'これなら、浜辺の北をふさいでいる倒木も切れそうだ。',
    '森の奥には、もっといろいろな資源がありそうだ。',
  ] },
  forest: { title: '島の森', lines: [
    '森には、銅の鉱脈と石炭の層がある！',
    '炉を建てて、銅鉱石と石炭を入れれば、銅板が作れる。',
    '銅板があれば……残骸のボイラーを直せるかもしれない。',
  ] },
  furnace: { title: '石の炉', lines: [
    '炉に材料を入れるには、袋に入れて炉のそばへ行けばいい。',
    'できた銅板は、もう一度そばへ行けば受け取れる。',
  ] },
  steam: { title: '蒸気の時代', lines: [
    'ボイラーが動いた！ 石炭を入れれば、まわりに蒸気が届く。',
    '蒸気の届く円の中なら、蒸気ドリルや製材機が動かせる。',
    '手で採るよりずっと速い。少しずつ、島に工場を作っていこう。',
  ] },
  drill: { title: '自動で掘る', lines: [
    'ドリルが勝手に掘ってくれる。ぼくは、できた物を運ぶだけでいい。',
    '……運ぶのも、誰かが手伝ってくれたらいいんだけど。',
    'そういえば、森の中で、丸いロボットが倒れていたような……。',
  ] },
  bot: { title: '運搬ロボ', lines: [
    'ロボットが目を覚ました！ ……ピポ。言葉は分からないけど、手伝ってくれるみたいだ。',
    '運搬ロボは、機械にたまった物を倉庫へ運び、倉庫から機械へ材料を届けてくれる。',
    'このロボット、どこから来たんだろう。島のどこかに、作った人がいるのかな。',
  ] },
  mines: { title: '西の岩山', lines: [
    '鉄の鉱脈だ！ 鉄板があれば、もっと丈夫な物が作れる。',
    '炉で鉄鉱石を溶かそう。炉をタップすれば、作る物を切り替えられる。',
  ] },
  lab: { title: '廃墟の研究所', lines: [
    '霧の奥に、こんな大きな建物が……。研究所だ。',
    '中には設計図が残っていた。ベルト、圧延機、組立機、紡織機……すごい技術だ。',
    '「ようこそ、旅の人」──奥から、大きな番人ロボットが現れた。',
    '「ここの人たちは、ずっと前に飛行船で島を出ていきました。地下の地熱炉が止まってから、島は眠ったままです」',
    '地熱炉……。それを動かせば、島じゅうに蒸気が届くかもしれない。',
  ] },
  belt: { title: 'ベルト', lines: [
    '機械をタップして「ベルトでつなぐ」を選び、つなぎたい先をタップすると、ベルトが敷ける。',
    'ベルトは、つないだ先が使う物だけを、休まず送り続けてくれる。倉庫へつなげば、何でも運べる。',
  ] },
  reactor: { title: '地熱炉の再起動', lines: [
    'レバーを引くと、地の底から低い音が響いた。パイプが光り、蒸気が噴き出す！',
    '「おお……島が、目を覚ましました」番人ロボットがうれしそうに目を光らせた。',
    'これで、島じゅうの機械が石炭なしで動く。大型の機械も作れるようになった。',
    '「山頂には、飛行船の発着場があります。崖にリフトを架ければ登れます」',
  ] },
  dock: { title: '山頂の発着場', lines: [
    'ここなら、飛行船を組み上げられる。',
    '必要なのは、蒸気機関、船体の骨組み、気嚢、プロペラ。それぞれ3つずつだ。',
    '大型組立機で作って、ここへ運ぼう。……もうすぐ、島を出られる。',
  ] },
  frameDone: { title: '骨組み', lines: ['船体の骨組みが組み上がった。あと少しだ！'] },
  ending: { title: '旅立ち', lines: [
    '飛行船が完成した。',
    '「お元気で、旅の人。あなたが目を覚まさせたこの島は、もう眠りません」',
    'ありがとう。……いつか、また来るよ。',
  ] },
};

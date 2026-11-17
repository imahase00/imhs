// 森のとりで: ゲームデータ（世界・強化・仲間・敵・ウェーブ）
// 強さや費用の調整はこのファイルだけで行えるようにしている。
export const GAME_ID = 'forest-fort';
export const SCHEMA = 1;

// ---- 世界（単位: マップ画像1px = 2単位） ----
export const MAP_IMG = 'img/map.webp';
export const WORLD = { w: 2048, h: 3072 };
export const CORE_POS = { x: 1024, y: 1500 };
// 砦の柵（中心を囲む四角形）。各辺は独立した強化と耐久を持つ
export const FORT = { x1: 574, y1: 1050, x2: 1474, y2: 2010 };
// 敵が現れる道の先（マップの端）
export const ENTRANCES = {
  n: { x: 1024, y: 40 },
  s: { x: 1024, y: 3032 },
  w: { x: 40, y: 1390 },
  e: { x: 2008, y: 1430 },
};
// 歩ける範囲（森の木々の内側）
export const BOUNDS = { x1: 150, y1: 170, x2: 1898, y2: 2900 };

export const SPRITE = (id) => `img/sprites/${id}.webp`;

// ---- 主人公 ----
export const HERO = {
  speed: 300,            // 単位/秒
  radius: 26,
  baseHp: 100,
  respawn: 5,            // 倒れてから復活までの秒数
  regenRest: 6,          // 休憩時間の回復（毎秒）
  regenFire: 14,         // たき火のそばの回復（毎秒、ウェーブ中も）
  fireRange: 230,
  magnet: 150,           // コインを引き寄せる範囲
};
// 武器: range 射程 / dmg 威力 / cd 間隔(秒) / speed 弾の速さ（0 は近接）/ pierce 貫通数 / splash 範囲
export const WEAPONS = [
  { name: '木の棒',           range: 95,  dmg: 13, cd: 0.42, speed: 0,    pierce: 0, splash: 0, shot: 'swing' },
  { name: '木の弓',           range: 380, dmg: 14, cd: 0.55, speed: 900,  pierce: 0, splash: 0, shot: 'arrow' },
  { name: 'クロスボウ',       range: 440, dmg: 30, cd: 0.7,  speed: 1100, pierce: 2, splash: 0, shot: 'bolt' },
  { name: '蒸気仕掛けの銃',   range: 470, dmg: 19, cd: 0.2,  speed: 1300, pierce: 0, splash: 0, shot: 'bullet' },
];

// ---- 仲間 ----
// post: 持ち場（砦の内側）。kind: ranged 遠距離 / guard 近接で持ち場を守る / heal 回復
export const ALLIES = {
  rabbit:   { name: 'うさぎの弓兵',     kind: 'ranged', hp: 70,  range: 360, dmg: 9,  cd: 1.0, speed: 0,   shot: 'arrow', splash: 0 },
  bear:     { name: 'くまの盾兵',       kind: 'guard',  hp: 220, range: 70,  dmg: 15, cd: 0.8, speed: 190, shot: 'swing', splash: 0, guard: 230 },
  squirrel: { name: 'りすの投石兵',     kind: 'ranged', hp: 60,  range: 320, dmg: 11, cd: 1.3, speed: 0,   shot: 'stone', splash: 70 },
  owl:      { name: 'ふくろうの癒し手', kind: 'heal',   hp: 60,  range: 300, dmg: 0,  cd: 1.6, speed: 0,   heal: 9 },
};
export const ALLY_REVIVE = 12;     // 倒れた仲間がウェーブ中に起き上がるまでの秒数
export const SMITH_MULT = [1, 1.35, 1.8, 2.4];   // 仲間の武器（鍛冶場）の段階ごとの威力倍率

// ---- 見張り台 ----
export const TOWERS = [
  null,
  { name: '木の見張り台', sprite: 'tower-1', range: 430, dmg: 10, cd: 0.9, shot: 'arrow', splash: 0 },
  { name: '石の見張り台', sprite: 'tower-2', range: 470, dmg: 19, cd: 0.8, shot: 'arrow', splash: 0 },
  { name: '真鍮の大砲台', sprite: 'tower-3', range: 520, dmg: 46, cd: 1.6, shot: 'shell', splash: 90 },
];

// ---- 砦 ----
export const CORE_HP = [0, 600, 1100, 1800, 2800];
export const WALL_HP = [0, 260, 600, 1200, 2200];
export const CORE_NAMES = ['', '木の骨組み', '丸太の小屋', '石造りの家', 'とりでの塔'];
export const WALL_NAMES = ['', '骨組みの柵', '丸太の柵', '石垣', '鉄で補強した城壁'];

// ---- 強化エリア（台座） ----
// cost[k] = レベル k → k+1 に上げる費用。start = 最初のレベル。need = 現れる条件
const P = (id, x, y, kind, name, cost, extra = {}) => ({ id, x, y, kind, name, cost, start: 0, ...extra });
// 砦の中: 中心・武器・鍛冶場・仲間・見張り台 / 砦の外: 柵（各辺の外側）と主人公の強化（南）
export const PADS = [
  P('core', 1024, 1790, 'core', '砦の中心', [null, 200, 600, 1300], { start: 1 }),
  P('weapon', 844, 1790, 'weapon', '主人公の武器', [null, 80, 340, 850], { start: 1 }),
  P('smith', 1204, 1790, 'smith', '仲間の武器（鍛冶場）', [null, 260, 700, 1500], { start: 1, need: { core: 2 } }),
  P('rabbit', 754, 1330, 'ally', 'うさぎの弓兵', [40, 90, 170, 300], { ally: 'rabbit', max: 4 }),
  P('squirrel', 754, 1560, 'ally', 'りすの投石兵', [160, 320, 560], { ally: 'squirrel', max: 3, need: { core: 2 } }),
  P('bear', 1294, 1330, 'ally', 'くまの盾兵', [120, 240, 420], { ally: 'bear', max: 3, need: { core: 2 } }),
  P('owl', 1294, 1560, 'ally', 'ふくろうの癒し手', [300, 700], { ally: 'owl', max: 2, need: { core: 3 } }),
  P('tower-nw', FORT.x1 + 90, FORT.y1 + 110, 'tower', '北西の見張り台', [80, 300, 780], { need: { core: 1 } }),
  P('tower-ne', FORT.x2 - 90, FORT.y1 + 110, 'tower', '北東の見張り台', [80, 300, 780], { need: { core: 2 } }),
  P('tower-sw', FORT.x1 + 90, FORT.y2 - 90, 'tower', '南西の見張り台', [80, 300, 780], { need: { core: 2 } }),
  P('tower-se', FORT.x2 - 90, FORT.y2 - 90, 'tower', '南東の見張り台', [80, 300, 780], { need: { core: 3 } }),
  P('wall-n', 1024, FORT.y1 - 160, 'wall', '北の柵', [null, 60, 260, 650], { start: 1, side: 'n' }),
  P('wall-s', 1024, FORT.y2 + 130, 'wall', '南の柵', [null, 60, 260, 650], { start: 1, side: 's' }),
  P('wall-w', FORT.x1 - 130, 1500, 'wall', '西の柵', [null, 60, 260, 650], { start: 1, side: 'w' }),
  P('wall-e', FORT.x2 + 130, 1500, 'wall', '東の柵', [null, 60, 260, 650], { start: 1, side: 'e' }),
  P('vital', 794, 2290, 'stat', 'たくましさ（体力）', [70, 160, 320, 600, 1000], { stat: 'hp' }),
  P('boots', 1254, 2290, 'stat', '身軽さ（足の速さ）', [90, 260, 600], { stat: 'speed', need: { core: 2 } }),
  P('pouch', 1024, 2400, 'stat', '大きな袋（コインを引き寄せる）', [60, 200, 500], { stat: 'magnet', need: { core: 2 } }),
];
// 仲間の持ち場（台座と重ならない場所。遠距離は柵の近く、盾兵は柵の内側の守りどころ）
export const ALLY_POSTS = {
  rabbit: [[874, 1150], [1174, 1150], [650, 1440], [1398, 1440]],
  bear: [[1024, 1140], [660, 1700], [1388, 1700]],
  squirrel: [[930, 1930], [1118, 1930], [1024, 1960]],
  owl: [[930, 1640], [1118, 1640]],
};
export const PAD_RADIUS = 70;
export const PAY_RATE = 1.4;       // 台座に立ったとき、費用をおよそ何秒で払い終えるか
export const PAY_MIN_RATE = 25;    // 1秒あたりの最低支払い額
export const STAT_STEP = { hp: 30, speed: 0.12, magnet: 90 };

// ---- 敵 ----
// coins: 落とすコイン / flying: 柵を越える / ranged: 遠くから投げる / split: 倒すと分かれる / blur: 近くの敵への仲間の攻撃を弱める
export const ENEMIES = {
  mushroom:    { name: 'いたずらキノコ',   hp: 22,  speed: 62,  dmg: 6,  cd: 1.0, radius: 24, coins: 2, size: 64 },
  wolf:        { name: '黒いオオカミ',     hp: 34,  speed: 140, dmg: 8,  cd: 0.9, radius: 26, coins: 3, size: 74 },
  crow:        { name: '影のカラス',       hp: 20,  speed: 115, dmg: 5,  cd: 1.0, radius: 22, coins: 3, size: 66, flying: true },
  monkey:      { name: 'どんぐり投げのサル', hp: 32, speed: 78,  dmg: 7,  cd: 1.6, radius: 24, coins: 4, size: 70, ranged: 270 },
  golem:       { name: '苔むした岩ゴーレム', hp: 160, speed: 40,  dmg: 22, cd: 1.3, radius: 36, coins: 11, size: 98, wallMult: 2 },
  caterpillar: { name: 'トゲ毛虫',         hp: 44,  speed: 55,  dmg: 7,  cd: 1.0, radius: 26, coins: 3, size: 72, split: 2 },
  wisp:        { name: '夜の霧の精',       hp: 50,  speed: 85,  dmg: 6,  cd: 1.1, radius: 26, coins: 5, size: 72, blur: 150 },
  boar:        { name: '影の大イノシシ',   hp: 2000, speed: 70, dmg: 26, cd: 1.2, radius: 62, coins: 300, size: 190, boss: true },
};
export const MINI = { hp: 12, speed: 80, dmg: 4, radius: 16, coins: 1, size: 44 };   // トゲ毛虫が分かれた姿
// 中ボス: 通常の敵を大きく・強くしたもの
export const ELITES = {
  'big-wolf':  { base: 'wolf',  name: '群れのかしらオオカミ', hpMult: 22, dmgMult: 2.2, size: 140, radius: 46, coins: 80, speedMult: 0.9 },
  'big-golem': { base: 'golem', name: '森の門番ゴーレム',     hpMult: 6, dmgMult: 1.35, size: 170, radius: 56, coins: 160, speedMult: 0.85 },
};
export const BOSS = {
  charge: { tell: 1.0, speed: 620, length: 560, width: 120, dmg: 38 },
  stomp: { tell: 1.2, radius: 190, dmg: 30 },
  every: 4.5,   // 大技の間隔（秒）
};
export const MAX_ENEMIES = 70;   // 同時に出る敵の上限（iPhone で重くならないように）

// ---- ウェーブ ----
// groups: [敵, 数, 出てくる道（'*' は4方向に分散）]。interval = 次の敵が出るまでの秒数
const W = (groups, interval, extra = {}) => ({ groups, interval, ...extra });
export const WAVES = [
  W([['mushroom', 10, 'n']], 1.1),
  W([['mushroom', 12, 'n'], ['mushroom', 6, 's']], 0.9),
  W([['mushroom', 10, '*'], ['wolf', 6, 'w']], 0.85),
  W([['wolf', 10, '*'], ['crow', 6, 'n'], ['mushroom', 10, 's']], 0.75),
  W([['mushroom', 14, '*'], ['wolf', 8, '*'], ['big-wolf', 1, 'n']], 0.7, { boss: true }),
  W([['monkey', 8, 'e'], ['wolf', 10, '*'], ['crow', 8, '*']], 0.7),
  W([['golem', 4, 's'], ['mushroom', 18, '*'], ['monkey', 6, 'w']], 0.65),
  W([['caterpillar', 10, '*'], ['crow', 10, '*'], ['wolf', 10, 'n']], 0.6),
  W([['golem', 6, '*'], ['monkey', 10, '*'], ['wolf', 14, '*']], 0.55),
  W([['big-golem', 1, 's'], ['golem', 2, 'n'], ['caterpillar', 10, '*'], ['crow', 10, '*']], 0.55, { boss: true }),
  W([['wisp', 6, '*'], ['wolf', 16, '*'], ['monkey', 10, '*']], 0.5),
  W([['wisp', 8, '*'], ['golem', 8, '*'], ['crow', 14, '*']], 0.5),
  W([['caterpillar', 14, '*'], ['wisp', 8, '*'], ['monkey', 12, '*'], ['wolf', 16, '*']], 0.45),
  W([['golem', 7, '*'], ['wisp', 7, '*'], ['crow', 14, '*'], ['wolf', 18, '*'], ['monkey', 6, '*']], 0.45),
  W([['boar', 1, 'n'], ['wolf', 16, '*'], ['wisp', 8, '*'], ['golem', 6, '*']], 0.6, { boss: true, final: true }),
];
export const WAVE_HP_GROWTH = 0.065;  // ウェーブごとの敵の体力の伸び
export const WAVE_REWARD = (w) => 40 + 22 * w;
// 休憩時間に森から出てくる弱い敵（稼ぎ用。報酬は控えめ）
export const TRICKLE = {
  every: 1.8, max: 9, coinMult: 0.75,
  // 進んだウェーブに応じて、休憩中にも少し強い魔物が混ざる（そのぶん稼ぎも増える）
  kinds: (wave) => (wave < 4 ? ['mushroom', 'mushroom', 'wolf'] : wave < 8 ? ['mushroom', 'wolf', 'wolf', 'crow'] : ['wolf', 'crow', 'monkey', 'caterpillar', 'golem']),
};
// クリア後の「果てしない夜」: ウェーブ16以降の構成
export const ENDLESS = { kinds: ['wolf', 'golem', 'crow', 'monkey', 'caterpillar', 'wisp'], base: 50, growth: 6 };

// ---- 会話（短め） ----
export const DIALOGUES = {
  opening: { title: 'はじまり', lines: [
    '森のはずれの小さな村。夜になると、森の奥からいたずらな魔物たちがやってきます。',
    'あなたは森の守り人の見習い。まだ木の骨組みしかない砦を、村のみんなと育てていきましょう。',
    '画面のどこかを押したまま指を動かすと歩けます。攻撃は自動。まずは近くの魔物を倒して、どんぐりコインを集めましょう。',
  ] },
  pads: { title: '強化の台座', lines: [
    'コインが集まったら、光る台座の上に立ち止まってみましょう。コインが吸い込まれて、砦や仲間が強くなります。',
    '準備ができたら「次のウェーブへ」。ウェーブの合間は、いつでも中断できます。',
  ] },
  boss5: { title: '群れのかしら', lines: ['北の道から、ひときわ大きな遠吠えが聞こえます。オオカミの群れのかしらです。仲間と一緒に迎え撃ちましょう。'] },
  boss10: { title: '森の門番', lines: ['地面がゆれています。南から、森の門番ゴーレムがやってきます。柵を固めておきましょう。'] },
  boss15: { title: '影の大イノシシ', lines: [
    '森の奥の黒い霧が、ひとつの大きな影になりました。影の大イノシシです。',
    '地面に赤い印が出たら、そこから離れて。ひとりで挑まず、仲間や見張り台の近くで戦いましょう。',
  ] },
  ending: { title: '夜明け', lines: [
    '影の大イノシシが霧になって消えると、森に朝の光が差しこみました。',
    '骨組みだけだった砦は、いまや旗のはためくとりでに。仲間たちが、あなたのまわりに集まってきます。',
    'これからも夜はやってきます。でも、このとりでがあれば、村はきっと大丈夫。',
  ] },
};

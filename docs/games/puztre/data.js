// パズトレ ― パズル＆トレジャー ―: ゲームデータ
export const GAME_ID = 'puztre';
export const SCHEMA = 1;

// ---- 盤面 ----
export const COLS = 6;
export const ROWS = 5;
export const COLORS = ['fire', 'water', 'leaf', 'light', 'shadow', 'heart'];
export const COLOR_NAME = { fire: '炎', water: '水', leaf: '草', light: '光', shadow: '影', heart: 'ハート' };
export const HEART = 5;
export const MOVE_TIME = 5;            // 球を動かせる秒数
export const COMBO_STEP = 0.25;        // 1コンボごとの倍率の上がり方
export const BIG_GROUP = 5;            // この数以上つなげると威力アップ
export const BIG_MULT = 1.5;
export const WEAK = 2;                 // 弱点の色
export const RESIST = 0.4;             // 効きにくい色

// ---- 探検隊 ----
export const BASE_HP = 120;
export const BASE_POWER = 10;          // 色ごとの基本の力（1個あたり）
export const HEAL_PER_ORB = 4;
export const MAX_TOOLS = 4;

// ---- 道具（スキル） cd: 使えるまでの手数 ----
export const TOOLS = {
  torch: { name: 'たいまつ', color: 'fire', skill: '草の球をすべて炎の球に変える', cd: 5 },
  flask: { name: '水筒', color: 'water', skill: '体力を25%回復し、炎の球をすべて水の球に変える', cd: 6 },
  pick: { name: 'つるはし', color: 'leaf', skill: 'つた・岩・凍った球をすべて元に戻し、狙った仕掛けに少しダメージ', cd: 5 },
  lantern: { name: 'ランタン', color: 'light', skill: '暗闇を払い、影の球をすべて光の球に変える', cd: 5 },
  hammer: { name: '金づち', color: 'fire', skill: '狙った仕掛けに、耐久の15%の固定ダメージ', cd: 7 },
  rope: { name: 'ロープ', color: 'heart', skill: 'すべての仕掛けのカウントを2つ戻す', cd: 6 },
  mirror: { name: '手鏡', color: 'light', skill: 'ランダムに6個を光の球に変える', cd: 6 },
  compass: { name: '方位磁針', color: 'water', skill: '盤面をすべて新しい球に入れ替える（暗闇も晴れる）', cd: 3 },
  scope: { name: '望遠鏡', color: 'light', skill: '3手のあいだ、弱点の色の威力が3倍になる', cd: 8 },
  hourglass: { name: '砂時計', color: 'shadow', skill: '次の1手だけ、球を動かせる時間が2倍', cd: 4 },
  herbs: { name: '薬草袋', color: 'heart', skill: '体力をすべて回復する', cd: 10 },
  boots: { name: '探検ブーツ', color: 'leaf', skill: '3手のあいだ、罠のダメージが半分になる', cd: 6 },
  keys: { name: '鍵束', color: 'shadow', skill: '影の球をすべてハートの球に変える', cd: 5 },
  lens: { name: '虫めがね', color: 'water', skill: '2手のあいだ、コンボの倍率が2倍の速さで上がる', cd: 7 },
  gloves: { name: '革の手袋', color: 'fire', skill: 'ランダムに6個を、狙った仕掛けの弱点の色に変える', cd: 7 },
  map: { name: '古い地図', color: 'shadow', skill: 'いちばん上の横1列をハートの球に変える', cd: 6 },
};
export const TOOL_IDS = Object.keys(TOOLS);
export const TOOL_POWER = 5;           // 道具1つで、その色の力が上がる量
export const TOOL_HP = 12;             // 道具1つで体力が上がる量
export const START_TOOLS = ['torch', 'flask', 'pick', 'lantern'];

// ---- 枠（コインで買う。1つだけ着ける） ----
export const FRAMES = [
  { id: 'wood', name: '木の枠', price: 0, desc: 'はじめから持っている、素朴な枠。' },
  { id: 'sand', name: '砂時計の枠', price: 300, desc: '球を動かせる時間 +1.5秒。' },
  { id: 'moss', name: '苔むした枠', price: 400, desc: 'ハートの球が落ちてきやすい。' },
  { id: 'iron', name: '鉄の枠', price: 600, desc: '罠のダメージが半分。' },
  { id: 'gem', name: '宝石の枠', price: 800, desc: '1コンボごとの倍率 +0.1。' },
  { id: 'gold', name: '黄金の枠', price: 800, desc: 'もらえるコイン +30%。' },
  { id: 'ancient', name: '古代の枠', price: 1000, desc: '道具のスキルが1手早くたまる。' },
  { id: 'star', name: '星の枠', price: 1500, desc: '5つ以上つなげて消した組の威力が2倍。' },
];

// ---- ダンジョン ----
// traps: 仕掛け（弱点・効きにくい色・耐久・カウント・罠のダメージ・盤面への悪さ）
// boss: 大扉の段階（段階ごとに弱点が変わる）
// hazard: stone（つた・岩: 消せない）/ ice（凍って動かせない）/ dark（色が見えない）/ shuffle（かき混ぜ）
const T = (id, name, weak, resist, hp, cd, dmg, act, hazard = null) => ({ id, name, weak, resist, hp, cd, dmg, act, hazard });
export const DUNGEONS = [
  {
    id: 'j', name: '密林の遺跡', short: '密林', tint: '#2f6b3a',
    intro: 'つたに飲みこまれた古代の神殿。奥に「エメラルドの心臓」が眠るという。',
    traps: [
      T('vine-door', 'つたの石扉', 'fire', 'water', 260, 3, 14, 'つたが伸びて、球にからみついた！', 'stone'),
      T('snake', '大蛇の石像', 'light', 'shadow', 220, 2, 12, '吹き矢が飛んできた！'),
      T('bridge', '切れた吊り橋', 'leaf', 'fire', 300, 4, 18, '足もとの板が抜けた！'),
    ],
    boss: { id: 'boss-j', name: '神殿の大扉', phases: [
      { weak: 'fire', resist: 'water', hp: 900, cd: 3, dmg: 20, act: '大扉の目が光り、つたが襲いかかる！', hazard: 'stone' },
      { weak: 'light', resist: 'shadow', hp: 900, cd: 2, dmg: 16, act: '石の顔が叫び、天井から石が降る！' },
    ] },
    hidden: { id: 'combo10', text: 'このダンジョンで 1手に10コンボ以上' },
  },
  {
    id: 's', name: '水没神殿', short: '水没', tint: '#1f6e8c',
    intro: '海に沈んだ白い神殿。海神が守る青い宝石があるらしい。',
    traps: [
      T('sluice', 'あふれる水門', 'leaf', 'fire', 420, 3, 20, '水があふれて、盤面がかき混ぜられた！', 'shuffle'),
      T('whirl', '渦巻く泉', 'light', 'water', 380, 3, 18, '渦に足を取られた！'),
      T('grate', '錆びた鉄格子', 'fire', 'leaf', 460, 4, 24, '鉄格子が落ちてきた！'),
    ],
    boss: { id: 'boss-s', name: '海神の大扉', phases: [
      { weak: 'leaf', resist: 'fire', hp: 1300, cd: 3, dmg: 26, act: '大扉から激流がほとばしる！', hazard: 'shuffle' },
      { weak: 'light', resist: 'shadow', hp: 1300, cd: 3, dmg: 24, act: '海神の像の三叉槍が光る！' },
    ] },
    hidden: { id: 'noheart', text: 'ハートの球を一度も消さずに大扉を開ける' },
  },
  {
    id: 'f', name: '炎の鉱山', short: '鉱山', tint: '#9a3a12',
    intro: '溶岩が流れる古い坑道。燃えるように赤い大ルビーが掘り出されずに残っている。',
    traps: [
      T('lava', '溶岩の通路', 'water', 'fire', 620, 3, 28, '溶岩が噴き上がった！', 'stone'),
      T('fire-door', '燃える木の扉', 'water', 'leaf', 560, 3, 26, '火の粉が飛んできた！'),
      T('boulder', '転がる大岩', 'leaf', 'light', 700, 4, 34, '大岩が転がってきた！'),
    ],
    boss: { id: 'boss-f', name: '炎竜の鉄扉', phases: [
      { weak: 'water', resist: 'fire', hp: 1700, cd: 3, dmg: 32, act: '竜の口から炎が吹き出す！', hazard: 'stone' },
      { weak: 'leaf', resist: 'water', hp: 1700, cd: 3, dmg: 30, act: '鉄扉が赤く焼けて、熱風が来る！' },
      { weak: 'water', resist: 'fire', hp: 1500, cd: 2, dmg: 26, act: '竜の目が燃え上がる！', hazard: 'stone' },
    ] },
    hidden: { id: 'big3', text: '1手で、5つ以上つなげた組を3組消す' },
  },
  {
    id: 'i', name: '氷の洞窟', short: '氷', tint: '#3a78b8',
    intro: '青白く光る氷の洞窟。永遠に溶けない氷の中に、大きなダイヤモンドがあるという。',
    traps: [
      T('ice-door', '凍った扉', 'fire', 'water', 820, 3, 34, '冷気で球が凍りついた！', 'ice'),
      T('icicle', 'つららの天井', 'fire', 'shadow', 760, 3, 32, 'つららが落ちてきた！'),
      T('blizzard', '吹雪の裂け目', 'light', 'water', 880, 4, 40, '吹雪が吹きつける！', 'ice'),
    ],
    boss: { id: 'boss-i', name: '氷の巨人の大扉', phases: [
      { weak: 'fire', resist: 'water', hp: 2200, cd: 3, dmg: 38, act: '巨人の像が息を吐き、盤面が凍る！', hazard: 'ice' },
      { weak: 'light', resist: 'shadow', hp: 2200, cd: 3, dmg: 36, act: '氷の大扉がきしみ、つららが降る！' },
      { weak: 'fire', resist: 'leaf', hp: 2000, cd: 2, dmg: 32, act: '巨人の目が青く光る！', hazard: 'ice' },
    ] },
    hidden: { id: 'halfhp', text: '体力が半分を切らずに大扉を開ける' },
  },
  {
    id: 'k', name: '天空の塔', short: '天空', tint: '#4a6ab0',
    intro: '雲の上にそびえる白い塔。てっぺんの大扉の奥に、虹色の宝珠が浮かんでいる。',
    traps: [
      T('wind', '風の回廊', 'leaf', 'light', 1040, 3, 42, '突風で盤面が雲に隠れた！', 'dark'),
      T('mirror-door', '光の鏡の扉', 'shadow', 'light', 980, 3, 40, '鏡がまぶしく光った！', 'dark'),
      T('stairs', '崩れかけの階段', 'leaf', 'water', 1120, 4, 48, '足場が崩れた！'),
    ],
    boss: { id: 'boss-k', name: '星座の天空扉', phases: [
      { weak: 'shadow', resist: 'light', hp: 2700, cd: 3, dmg: 46, act: '星座が光り、盤面が見えなくなる！', hazard: 'dark' },
      { weak: 'leaf', resist: 'fire', hp: 2700, cd: 3, dmg: 44, act: '歯車が回り、突風が来る！', hazard: 'shuffle' },
      { weak: 'shadow', resist: 'light', hp: 2500, cd: 2, dmg: 40, act: '天空扉が星の光を放つ！', hazard: 'dark' },
    ] },
    hidden: { id: 'double', text: '1手で、2つ以上の仕掛けを同時に突破する' },
  },
  {
    id: 'g', name: '黄金郷', short: '黄金郷', tint: '#a8781a',
    intro: '伝説の黄金郷。宝物庫の大扉の奥に、すべての始まりの宝冠が眠る。',
    traps: [
      T('scale', '黄金の天秤', 'shadow', 'light', 1300, 3, 50, '天秤が傾き、球が石に変わった！', 'stone'),
      T('masks', '仮面の壁', 'light', 'shadow', 1240, 3, 48, '仮面の目が光り、盤面が凍る！', 'ice'),
      T('pit', '落とし穴の床', 'leaf', 'fire', 1400, 4, 58, '床が抜けかけた！', 'dark'),
    ],
    boss: { id: 'boss-g', name: '宝物庫の大扉', phases: [
      { weak: 'fire', resist: 'water', hp: 3000, cd: 3, dmg: 52, act: '赤い宝石が燃えるように光る！', hazard: 'stone' },
      { weak: 'water', resist: 'leaf', hp: 3000, cd: 3, dmg: 52, act: '青い宝石から激流が！', hazard: 'shuffle' },
      { weak: 'light', resist: 'shadow', hp: 3000, cd: 3, dmg: 50, act: '黄色い宝石がまぶしく光る！', hazard: 'dark' },
      { weak: 'shadow', resist: 'light', hp: 3200, cd: 2, dmg: 46, act: '大扉の錠前が鳴り響く！', hazard: 'ice' },
    ] },
    hidden: { id: 'noskill', text: '道具のスキルを使わずに大扉を開ける' },
  },
];
// 全体の手ごたえ（人は自動プレイよりコンボがつながるので、自動プレイが後半で少し撤退するくらいに合わせる）
// 後半の数値は表の値をそのまま使わず、伸びをゆるやかにして使う（探検隊の伸びが道具と枠の分だけなので）
export const HP_SCALE = 1.4;
export const DMG_SCALE = 1.25;
export const curveHp = (x) => HP_SCALE * 260 * (x / 260) ** 0.72;
export const curveDmg = (x) => DMG_SCALE * 14 * (x / 14) ** 0.75;
export const FLOORS = 7;               // ふつうのフロア数（そのあとに大扉）
/** フロア f（0始まり）に出る仕掛けの数 */
export const trapCount = (f) => (f < 2 ? 1 : f < 5 ? 2 : 3);
/** ふつうのフロアで仕掛けの耐久にかける倍率 */
export const floorHpMult = (f) => 1 + f * 0.07;
export const TOOL_REWARD = [['hammer', 'rope'], ['mirror', 'compass'], ['scope', 'hourglass'], ['herbs', 'boots'], ['keys', 'lens'], ['gloves', 'map']];
export const COIN_FLOOR = (d) => 12 + d * 6;
export const COIN_CLEAR = (d, first) => (first ? 160 : 60) * (d + 1);

// ---- お宝（図鑑） 各ダンジョン: フロア2〜7で1つずつ・大扉で1つ・隠し1つ ----
const TR = (id, name, note) => ({ id, name, note });
export const TREASURES = {
  j: [TR('j1', '翡翠の首飾り', '深い緑の玉をつないだ首飾り。森の王族が身につけたという。'),
    TR('j2', '黄金のジャガー像', '神殿の守り神。牙をむいているが、どこか愛嬌がある。'),
    TR('j3', '太陽暦の石盤', '日の出と日の入りを刻んだ暦。いまも正確だという。'),
    TR('j4', '羽根飾りの冠', '七色の鳥の羽根で飾った冠。祭りの日だけ使われた。'),
    TR('j5', '翡翠の仮面', '神官の仮面。目のくぼみが、こちらを見ている気がする。'),
    TR('j6', 'つた模様の金の腕輪', 'つたと花を彫りこんだ腕輪。内側に小さな文字がある。'),
    TR('j7', 'エメラルドの心臓', '神殿の大扉の奥で脈打つように光っていた大宝石。'),
    TR('j8', '眠る蝶の琥珀', '大昔の蝶が眠る琥珀。見つけた者に幸運を運ぶという。')],
  s: [TR('s1', '真珠の首飾り', '海の底で育った大粒の真珠。ひとつずつ色がちがう。'),
    TR('s2', '珊瑚の王冠', '赤い珊瑚と貝殻でできた、海の女王の冠。'),
    TR('s3', '青い硝子の香水瓶', '中にはまだ、潮風の香りが残っている。'),
    TR('s4', '人魚の竪琴', '弦をはじくと、遠くで波の音がする。'),
    TR('s5', '貝殻の宝石箱', '開けると真珠がひとつ。持ち主はロマンチストらしい。'),
    TR('s6', '銀の燭台', '神殿の祭壇を照らした燭台。水に沈んでも錆びていない。'),
    TR('s7', '海神のサファイア', '大扉に守られていた深い青。海そのものを閉じこめたよう。'),
    TR('s8', '光る巻き貝のオルゴール', 'ふたを開けると、ほのかに光って子守歌が流れる。')],
  f: [TR('f1', 'ルビーの原石', '坑道の壁から掘り出したばかりの、燃えるような赤。'),
    TR('f2', '火竜の鱗の盾', '火竜の鱗を打ちつけた盾。炎をまったく通さない。'),
    TR('f3', '黒曜石の短剣', '火山のガラスでできた刃。金の柄に赤い宝石。'),
    TR('f4', '炎の紋章の指輪', '鉱山の親方の証。炎の紋章が刻まれている。'),
    TR('f5', '溶岩の宝珠', '固まった溶岩の中で、まだ火が燃えている。'),
    TR('f6', '鉱夫の金のカンテラ', '何百年も坑道を照らしてきた、金色のカンテラ。'),
    TR('f7', '紅蓮の大ルビー', '炎竜の鉄扉の奥にあった、炎そのもののような宝石。'),
    TR('f8', '不死鳥の羽根', '燃えているのに熱くない。灰からよみがえる鳥の羽根。')],
  i: [TR('i1', '氷の結晶の髪飾り', '溶けない氷でできた髪飾り。つけると少し涼しい。'),
    TR('i2', '白銀の鈴', '雪の結晶の模様。鳴らすと吹雪がやむという。'),
    TR('i3', '凍った花の小瓶', '千年前の春の花が、氷の中でまだ咲いている。'),
    TR('i4', '雪狼のブローチ', '遠吠えする雪狼の銀細工。旅の守り。'),
    TR('i5', 'オーロラの石', '見る角度で色が変わる。空の光を閉じこめた石。'),
    TR('i6', '水晶の砂時計', '中の砂は雪の粒。落ちる速さがゆっくりに見える。'),
    TR('i7', '永久氷のダイヤモンド', '巨人の大扉の奥。永遠に溶けない氷が宝石になった。'),
    TR('i8', '氷の中の金の鍵', 'どこの扉の鍵なのか、誰も知らない。')],
  k: [TR('k1', '黄金の風見鶏', '塔のてっぺんにあった風見鶏。いつも宝のある方を向く。'),
    TR('k2', '星図の羅針盤', '針の代わりに星図がまわる、不思議な羅針盤。'),
    TR('k3', '雲の羽根ペン', '雲のように軽い羽根ペン。書いた文字がふわりと浮く。'),
    TR('k4', '天球儀', '空の星の動きを写した金の天球儀。'),
    TR('k5', '月長石の指輪', '月の光をためこむ石。夜になるとほのかに光る。'),
    TR('k6', '翼飾りの冠', '空の王の冠。かぶると少しだけ体が軽くなる。'),
    TR('k7', '虹色の天空の宝珠', '星座の天空扉の奥に浮かんでいた、虹をまとう宝珠。'),
    TR('k8', '流れ星のかけら', '塔に落ちた流れ星。願いがひとつ残っているかもしれない。')],
  g: [TR('g1', '黄金の王の杯', '宝石で飾られた王の杯。乾杯の音は鈴のよう。'),
    TR('g2', '宝石の王笏', '黄金郷の王が持っていた杖。宝石がぎっしり。'),
    TR('g3', '黄金の仮面', '祭りの夜の仮面。誰もがこれをかぶって踊った。'),
    TR('g4', '金貨の壺', 'あふれるほどの金貨。数えるだけで日が暮れる。'),
    TR('g5', '七色の首飾り', '七つの宝石が虹のように並ぶ首飾り。'),
    TR('g6', '黄金の鳥の像', '翼を広げた黄金の鳥。黄金郷の守り神。'),
    TR('g7', '始まりの宝冠', '宝物庫の大扉の奥。すべての冒険の終わりと、始まりの宝。'),
    TR('g8', '古い探検家の地図', 'かつてこの地を目指した探検家の地図。裏に「次はきみの番だ」。')],
};
export const TREASURE_IDS = Object.values(TREASURES).flat().map((t) => t.id);

export const ENDING = [
  '宝物庫の大扉が、ゆっくりと開いていく。',
  'あふれ出す黄金の光。山のような金貨と、数えきれない宝物。',
  'その真ん中に、始まりの宝冠が静かに輝いていた。',
  '――探検隊の宝探しは、ひとまずここでおしまい。',
  'でも図鑑には、まだ空いているページがあるかもしれない。',
];

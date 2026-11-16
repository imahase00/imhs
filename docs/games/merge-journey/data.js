// マージの旅: 固定データ（品目・生産元・島・依頼・会話）
// 品物は {c: 系統ID, l: 段階1〜6} で参照する。名称は表示専用で保存キーにしない。

export const GAME_ID = 'merge-journey';
export const SCHEMA = 1;
export const BOARD_W = 7;
export const BOARD_H = 8;
export const BOARD_SIZE = BOARD_W * BOARD_H; // 56
export const MAX_LEVEL = 6;
export const STORAGE_STEPS = [
  { cap: 6, cost: 0 },   // 依頼「木陰に小さな売り台を」で解放
  { cap: 9, cost: 60 },
  { cap: 12, cost: 120 },
];
export const STORAGE_MAX = 12;

const IMG = 'img/';

export const CHAINS = {
  fruit: {
    island: 'komorebi', label: '果物', gen: '果樹',
    names: ['りんご', 'りんごのペア', 'りんごの小かご', '果物かご', '果物の木箱', '豊穣の盛り合わせ'],
  },
  sweet: {
    island: 'komorebi', label: 'お菓子', gen: 'お菓子かご',
    names: ['クッキー', '重ねクッキー', 'マフィン', '小さなケーキ', 'デコレーションケーキ', 'お祝いケーキ'],
  },
  shell: {
    island: 'shiokaze', label: '貝', gen: '貝の採集かご',
    names: ['小さな貝', '貝のペア', '貝のブレスレット', '貝の首飾り', '貝のリース', '海の宝飾箱'],
  },
  gear: {
    island: 'shiokaze', label: '船具', gen: '船大工の道具箱',
    names: ['麻ひも', 'ロープ', '巻きロープ', '帆布セット', '小さな帆', '航海セット'],
  },
  flower: {
    island: 'hoshiakari', label: '花', gen: '花の育苗箱',
    names: ['一輪の花', '小さな花束', '花束', '花かご', '花のリース', '星の花冠'],
  },
  light: {
    island: 'hoshiakari', label: '灯り', gen: '灯りの工房',
    names: ['ろうそく', '燭台', '小さなランタン', '星形ランタン', '装飾ランタン', '灯台の灯火'],
  },
};
export const CHAIN_IDS = Object.keys(CHAINS);

export const itemKey = (c, l) => `${c}-${l}`;
export const itemName = (c, l) => CHAINS[c]?.names[l - 1] ?? '？';
export const itemImg = (c, l) => `${IMG}items/${c}-${l}.webp`;
export const genImg = (c) => `${IMG}gen/${c}.webp`;
/** Lv.1換算の個数 */
export const lv1Value = (l) => 2 ** (l - 1);

// ---- 島と固定依頼 ----
// req: [{c, l, n}]  effects: 達成時の反映
export const ISLANDS = [
  {
    id: 'komorebi', name: 'こもれび島', bg: `${IMG}bg/komorebi.webp`, firstGen: 'fruit', unlockCost: 0,
    sceneTitle: '果樹園の広場', night: false,
    quests: [
      { id: 'k1', title: 'はじめてのおすそわけ', from: 'ミナ', ask: 'となりのおばあちゃんに、りんごを届けたいの。',
        req: [{ c: 'fruit', l: 2, n: 1 }], coins: 10, effects: {}, done: 'k1' },
      { id: 'k2', title: '木陰に小さな売り台を', from: 'ミナ', ask: '広場の木陰で、果物を売ってみたいな。',
        req: [{ c: 'fruit', l: 3, n: 1 }], coins: 20, effects: { flag: 'stall', orders: true, storage: true }, done: 'k2' },
      { id: 'k3', title: 'お菓子屋さんを迎えよう', from: 'トマ村長', ask: '焼き菓子職人さんが島に来てくれるそうだ。',
        req: [{ c: 'fruit', l: 4, n: 1 }], coins: 35, effects: { gen: 'sweet' }, done: 'k3' },
      { id: 'k4', title: '広場のお茶会', from: 'コルネ', ask: 'みんなでお茶会をしましょう！',
        req: [{ c: 'sweet', l: 3, n: 2 }, { c: 'fruit', l: 2, n: 1 }], coins: 45, effects: { flag: 'teaSeats' }, done: 'k4' },
      { id: 'k5', title: '旅立ちの日の歓迎会', from: 'トマ村長', ask: '港から来た船乗りさんを歓迎しよう。',
        req: [{ c: 'fruit', l: 5, n: 1 }, { c: 'sweet', l: 4, n: 1 }], coins: 80, effects: { flag: 'welcomeParty', route: 'shiokaze' }, done: 'k5' },
    ],
    landmarks: [
      { flag: 'stall', label: '木陰の売り台' },
      { flag: 'teaSeats', label: 'お茶の席' },
      { flag: 'welcomeParty', label: '歓迎会の飾り' },
    ],
  },
  {
    id: 'shiokaze', name: 'しおかぜ島', bg: `${IMG}bg/shiokaze.webp`, firstGen: 'shell', unlockCost: 150,
    sceneTitle: '小さな港', night: false,
    quests: [
      { id: 's1', title: '浜辺の招待状', from: 'ナギ', ask: '港祭りの招待状に、貝を飾りたいんだ。',
        req: [{ c: 'shell', l: 2, n: 2 }], coins: 25, effects: { flag: 'invitation' }, done: 's1' },
      { id: 's2', title: '踊り手への贈り物', from: 'ナギ', ask: '踊り手のリラさん、元気がないみたい。',
        req: [{ c: 'shell', l: 3, n: 2 }], coins: 40, effects: { flag: 'dancer' }, done: 's2' },
      { id: 's3', title: '船大工にお礼を', from: 'リラ', ask: '船大工のゲンさんに、いつものお礼を。',
        req: [{ c: 'shell', l: 4, n: 1 }], coins: 55, effects: { gen: 'gear' }, done: 's3' },
      { id: 's4', title: '桟橋に屋台を出そう', from: 'ゲン', ask: '桟橋に屋台を組もう。お菓子も並べたいな。',
        req: [{ c: 'gear', l: 3, n: 2 }, { c: 'sweet', l: 3, n: 2 }], coins: 70, effects: { flag: 'pierStall' }, done: 's4' },
      { id: 's5', title: '港祭りの出航式', from: 'ゲン', ask: '飾り船の出航式だ。最高の支度をしよう！',
        req: [{ c: 'gear', l: 5, n: 1 }, { c: 'shell', l: 5, n: 1 }], coins: 110, effects: { flag: 'shipSail', route: 'hoshiakari' }, done: 's5' },
    ],
    landmarks: [
      { flag: 'invitation', label: '祭りの招待状' },
      { flag: 'dancer', label: '踊り手の舞台' },
      { flag: 'pierStall', label: '桟橋のお菓子屋台' },
      { flag: 'shipSail', label: '飾り船の出航' },
    ],
  },
  {
    id: 'hoshiakari', name: 'ほしあかり島', bg: `${IMG}bg/hoshiakari.webp`, firstGen: 'flower', unlockCost: 300,
    sceneTitle: '星空の灯台', night: true,
    quests: [
      { id: 'h1', title: '花守へのごあいさつ', from: 'シオン', ask: 'ようこそ。まずは花をひとつ、見せてくれる？',
        req: [{ c: 'flower', l: 2, n: 2 }], coins: 35, effects: { flag: 'flowerGuide' }, done: 'h1' },
      { id: 'h2', title: '丘へ続く花の道', from: 'シオン', ask: '灯台の丘まで、花で道を飾りたいの。',
        req: [{ c: 'flower', l: 3, n: 2 }], coins: 50, effects: { flag: 'flowerPath' }, done: 'h2' },
      { id: 'h3', title: '灯り職人の窓辺', from: 'シオン', ask: '灯り職人のルカの窓辺が、さみしいみたい。',
        req: [{ c: 'flower', l: 4, n: 1 }], coins: 70, effects: { gen: 'light' }, done: 'h3' },
      { id: 'h4', title: '星をたどる道しるべ', from: 'ルカ', ask: '夜道を照らす道しるべを作ろう。貝の飾りも添えて。',
        req: [{ c: 'light', l: 4, n: 2 }, { c: 'shell', l: 3, n: 1 }], coins: 95, effects: { flag: 'signposts' }, done: 'h4' },
      { id: 'h5', title: '灯台に最初の光を', from: 'ルカ', ask: 'いよいよ灯台に火を入れる時だ。',
        req: [{ c: 'light', l: 6, n: 1 }, { c: 'flower', l: 6, n: 1 }], coins: 160, effects: { flag: 'lighthouseLit', ending: true }, done: 'h5' },
    ],
    landmarks: [
      { flag: 'flowerGuide', label: '丘への案内' },
      { flag: 'flowerPath', label: '花の道' },
      { flag: 'signposts', label: '星の道しるべ' },
      { flag: 'lighthouseLit', label: '灯台の光' },
    ],
  },
];
export const ISLAND_IDS = ISLANDS.map((i) => i.id);
export const islandById = (id) => ISLANDS.find((i) => i.id === id);
export const ALL_QUESTS = ISLANDS.flatMap((i) => i.quests.map((q) => ({ ...q, island: i.id })));

// ---- 会話 ----
// 到着・主要依頼の達成・結末。who が空なら地の文。
export const DIALOGUES = {
  'arrive-komorebi': { title: 'こもれび島に到着', lines: [
    { who: '', text: '小さな船が、りんごの香りのする島に着いた。' },
    { who: 'ミナ', text: 'いらっしゃい、旅の人！ ここはこもれび島。果樹園のミナよ。' },
    { who: 'ミナ', text: 'この果樹、軽くさわるだけでりんごが実るの。同じものを重ねると、もっと素敵なものになるんだよ。' },
    { who: 'ミナ', text: 'よかったら、島のみんなのお手伝いをしてくれない？' },
  ] },
  k1: { title: 'はじめてのおすそわけ', lines: [
    { who: 'ミナ', text: 'わあ、つやつやのりんごのペア！ おばあちゃん、きっと喜ぶよ。' },
    { who: 'ミナ', text: 'お礼にコインをどうぞ。この島では、届けものをするとお礼がもらえるの。' },
  ] },
  k2: { title: '木陰に小さな売り台を', lines: [
    { who: 'ミナ', text: '売り台ができた！ 木陰がちょうどいいね。' },
    { who: 'ミナ', text: 'これで島の人から「ちょっとした注文」も受けられるよ。しまっておける収納箱も使ってね。' },
  ] },
  k3: { title: 'お菓子屋さんを迎えよう', lines: [
    { who: 'コルネ', text: 'はじめまして、焼き菓子職人のコルネです。立派な果物かごをありがとう！' },
    { who: 'コルネ', text: 'このお菓子かご、置いていきますね。さわるとクッキーが焼けますよ。' },
  ] },
  k4: { title: '広場のお茶会', lines: [
    { who: '', text: '広場にテーブルが並び、マフィンの甘い香りが広がった。' },
    { who: 'トマ村長', text: 'こんなににぎやかなお茶会は久しぶりだ。旅の人のおかげだよ。' },
    { who: 'コルネ', text: '次は港の船乗りさんたちも呼びたいですね。' },
  ] },
  k5: { title: '旅立ちの日の歓迎会', lines: [
    { who: '船乗り', text: 'こいつはうまい！ 果物もケーキも最高だ。' },
    { who: '船乗り', text: '礼に教えよう。南の海に「しおかぜ島」という港の島がある。もうすぐ港祭りなんだ。' },
    { who: 'ミナ', text: '新しい航路だね！ 島マップから行けるよ。また遊びに来てね。' },
  ] },
  'arrive-shiokaze': { title: 'しおかぜ島に到着', lines: [
    { who: '', text: '潮風と、カモメの声。白い家並みの港に船が着いた。' },
    { who: 'ナギ', text: 'ようこそ、しおかぜ島へ！ 港の案内係、ナギだよ。' },
    { who: 'ナギ', text: 'この採集かごを使って。浜辺のきれいな貝が集まるんだ。' },
  ] },
  s1: { title: '浜辺の招待状', lines: [
    { who: 'ナギ', text: '貝の飾りで、招待状がぐっと祭りらしくなった！' },
    { who: 'ナギ', text: 'さっそく島じゅうに配ってくるね。' },
  ] },
  s2: { title: '踊り手への贈り物', lines: [
    { who: 'リラ', text: 'まあ、かわいいブレスレット……。これを着けて踊れば、きっと波も笑ってくれるわ。' },
    { who: 'リラ', text: '祭りの舞台、わたしも出ることにする！' },
  ] },
  s3: { title: '船大工にお礼を', lines: [
    { who: 'ゲン', text: 'お、首飾りか。照れるじゃねえか……ありがとよ。' },
    { who: 'ゲン', text: '代わりにこの道具箱を貸してやる。ひもや帆布がいくらでも出てくるぞ。' },
  ] },
  s4: { title: '桟橋に屋台を出そう', lines: [
    { who: '', text: '桟橋に屋台が組み上がり、こもれび島のお菓子が並んだ。' },
    { who: 'ナギ', text: 'となりの島のお菓子だって、大人気だよ！' },
  ] },
  s5: { title: '港祭りの出航式', lines: [
    { who: '', text: '帆を張った飾り船が、拍手の中をゆっくり出ていく。' },
    { who: 'ゲン', text: '見事な出航式だった。……そうだ、北の「ほしあかり島」の灯台は、長いこと消えたままなんだ。' },
    { who: 'リラ', text: 'あなたなら、きっともう一度灯せるわ。' },
  ] },
  'arrive-hoshiakari': { title: 'ほしあかり島に到着', lines: [
    { who: '', text: '夕暮れの空に、一番星。花の丘の上に、暗いままの灯台が見える。' },
    { who: 'シオン', text: '旅の方ね。わたしは花守のシオン。この育苗箱で花を育てているの。' },
    { who: 'シオン', text: 'あの灯台にもう一度光を……それがこの島のみんなの願いなの。' },
  ] },
  h1: { title: '花守へのごあいさつ', lines: [
    { who: 'シオン', text: 'かわいい花束。あなたの手は、花に好かれているのね。' },
    { who: 'シオン', text: '丘への道を案内するわ。ついてきて。' },
  ] },
  h2: { title: '丘へ続く花の道', lines: [
    { who: '', text: '石畳の両側に花が並び、丘の上まで道が続いた。' },
    { who: 'シオン', text: '夜になると、花びらが星明かりを映すのよ。' },
  ] },
  h3: { title: '灯り職人の窓辺', lines: [
    { who: 'ルカ', text: '……花かご？ 窓辺が急に明るくなったな。' },
    { who: 'ルカ', text: '灯り職人のルカだ。この工房の箱を使ってくれ。ろうそくから灯台の火まで、なんでも作れる。' },
  ] },
  h4: { title: '星をたどる道しるべ', lines: [
    { who: '', text: '丘の道しるべに、ひとつ、またひとつと灯りがともる。' },
    { who: 'ルカ', text: '貝の飾りが光を受けて、星みたいだ。あとは灯台だけだな。' },
  ] },
  h5: { title: '灯台に最初の光を', lines: [
    { who: '', text: '星の花冠を灯台に掲げ、灯火に火を入れる。' },
    { who: '', text: '――まっすぐな光が、夜の海を渡っていった。' },
    { who: 'ルカ', text: 'ついた……！ この光なら、こもれび島からも、しおかぜ島からも見えるはずだ。' },
    { who: 'シオン', text: 'ありがとう、旅の人。この島に、また朝が来たみたい。' },
  ] },
  ending: { title: 'エピローグ', lines: [
    { who: 'ミナ', text: '（こもれび島）見て！ 北の空に光が見える！' },
    { who: 'ナギ', text: '（しおかぜ島）灯台の光だ。旅の人、やったんだね。' },
    { who: '', text: '三つの島は、ひとすじの光でつながった。' },
    { who: '', text: 'マージの旅 ―― おしまい。でも、島の暮らしはつづきます。' },
  ] },
};

/** 依頼ごとの短い案内（チュートリアル） */
export const TUTORIAL_QUEST = 'k1';

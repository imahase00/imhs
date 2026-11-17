// ひだまり菜園: ゲームデータ（作物・加工・飾り・村の人の依頼・会話）
export const GAME_ID = 'hidamari-garden';
export const SCHEMA = 1;

export const SEASON_DAYS = 10;
export const SEASONS = [
  { id: 'spring', name: '春', icon: '🌸' },
  { id: 'summer', name: '夏', icon: '☀️' },
  { id: 'autumn', name: '秋', icon: '🍁' },
  { id: 'winter', name: '冬', icon: '❄️' },
];
export const START_COINS = 30;
export const START_PLOTS = 6;
export const MAX_PLOTS = 16;

// 作物: seasons = 旬の季節（0春 1夏 2秋 3冬）、days = 旬に毎日水をやった場合の収穫までの晩数（季節外れは2倍）、
// regrow = 収穫後にもう一度実るまでの日数（null なら収穫で畑が空く）
export const CROPS = {
  carrot:     { name: 'にんじん',     seasons: [0, 2], days: 3, regrow: null, seed: 4,  price: 11 },
  strawberry: { name: 'いちご',       seasons: [0, 1], days: 4, regrow: 2,    seed: 12, price: 9 },
  tomato:     { name: 'トマト',       seasons: [1],    days: 4, regrow: 2,    seed: 14, price: 9 },
  sunflower:  { name: 'ひまわり',     seasons: [1],    days: 4, regrow: null, seed: 8,  price: 20 },
  lavender:   { name: 'ラベンダー',   seasons: [0, 1], days: 5, regrow: 3,    seed: 20, price: 12 },
  corn:       { name: 'とうもろこし', seasons: [1, 2], days: 6, regrow: null, seed: 14, price: 36 },
  pumpkin:    { name: 'かぼちゃ',     seasons: [2],    days: 7, regrow: null, seed: 24, price: 66 },
  blueberry:  { name: 'ブルーベリー', seasons: [1, 2], days: 6, regrow: 2,    seed: 30, price: 12 },
};
export const CROP_IDS = Object.keys(CROPS);
export const START_SEEDS = ['carrot', 'strawberry'];

// 加工品: 作業台で days 晩ねかせると完成
export const GOODS = {
  carrotcake: { name: 'にんじんケーキ',     in: { carrot: 3 },                   days: 1, price: 48 },
  jam:        { name: 'いちごジャム',       in: { strawberry: 3 },               days: 1, price: 42 },
  soup:       { name: 'トマトスープ',       in: { tomato: 2, carrot: 1 },        days: 1, price: 46 },
  potpourri:  { name: 'ラベンダーのポプリ', in: { lavender: 3 },                 days: 2, price: 62 },
  bouquet:    { name: 'ひまわりの花束',     in: { sunflower: 2, lavender: 1 },   days: 1, price: 78 },
  cornbread:  { name: 'コーンブレッド',     in: { corn: 2 },                     days: 2, price: 105 },
  pie:        { name: 'かぼちゃパイ',       in: { pumpkin: 2 },                  days: 2, price: 190 },
  tart:       { name: 'ブルーベリータルト', in: { blueberry: 3 },                days: 2, price: 64 },
};
export const GOOD_IDS = Object.keys(GOODS);
export const ITEM_IDS = [...CROP_IDS, ...GOOD_IDS];
export const isCrop = (id) => id in CROPS;
export const itemName = (id) => (CROPS[id] || GOODS[id])?.name ?? id;
export const itemPrice = (id) => (CROPS[id] || GOODS[id]).price;
export const itemImg = (id) => `img/items/${id}.webp`;
export const plotImg = (key) => `img/plot/${key}.webp`;

// 飾り: 置くと庭がにぎやかになり、売値が 1つにつき +5%
export const DECOR = {
  flowerpot: { name: '花の寄せ植え',   price: 120,  text: '素焼きの鉢に、季節の花をたっぷりと。' },
  fence:     { name: '白い木の柵',     price: 240,  text: '小さな花が絡まる、白い柵。' },
  bench:     { name: '木のベンチ',     price: 420,  text: 'ひと休みにちょうどいい、素朴なベンチ。' },
  birdhouse: { name: '鳥の巣箱',       price: 640,  text: '赤い屋根の巣箱。朝、小鳥が種を運んでくれる。' },
  lamp:      { name: '庭のランプ',     price: 900,  text: '夕暮れに、あたたかく灯るランプ。' },
  birdbath:  { name: '小鳥の水盤',     price: 1300, text: '小鳥が水浴びに来る、石の水盤。' },
};
export const DECOR_IDS = Object.keys(DECOR);
export const DECOR_BONUS = 0.05;

// 畑の拡張（お店で購入）
export const PLOT_STEPS = [
  { to: 9,  price: 160 },
  { to: 12, price: 600 },
  { to: 16, price: 1500 },
];
export const SPRINKLER_PRICE = 1100;
export const FEATURED_BONUS = 0.5;  // 今日のおすすめ +50%
export const FESTIVAL_DECOR = 3;    // 収穫祭に必要な飾りの数

// 村の人
export const PEOPLE = {
  toyo: { name: 'とよさん', role: 'パン屋のおばあさん', img: 'img/faces/toyo.webp' },
  sora: { name: 'ソラ',     role: '郵便屋さん',         img: 'img/faces/sora.webp' },
  yuzu: { name: 'ゆずは',   role: '花屋さん',           img: 'img/faces/yuzu.webp' },
};
export const PEOPLE_IDS = Object.keys(PEOPLE);

// 依頼: 人ごとに順番に1件ずつ。after = その人が現れる条件（ほかの人の依頼の完了）
// effects: seeds（種の解放）/ recipes（加工の解放）/ bench（作業台を増やす）/ bigCan（まとめて水やり）/ orders（掲示板）/ flag
export const QUESTS = {
  toyo: [
    { id: 't1', req: { carrot: 3 }, coins: 20, effects: { recipes: ['carrotcake'], bench: 1 },
      intro: ['あら、あなたが新しい菜園の人ね。わたしは村でパンを焼いている、とよよ。', 'にんじんを3本、分けてもらえないかしら。久しぶりに、あれを焼きたくて。'],
      thanks: ['まあ、立派なにんじん！ ありがとう。', '作業小屋に古い作業台があったでしょう？ にんじんケーキの作り方を書いておいたわ。ひと晩ねかせると、おいしくなるのよ。'] },
    { id: 't2', req: { carrotcake: 1 }, coins: 40, effects: { seeds: ['tomato'] },
      intro: ['この前のケーキの作り方、うまくいったかしら。', 'ひとつ、味見させてちょうだいな。'],
      thanks: ['……そうそう、この味。前の菜園の人もね、よく焼いてくれたのよ。', 'お礼に、トマトの種をどうぞ。夏になったらまいてごらんなさい。'] },
    { id: 't3', req: { tomato: 4 }, coins: 60, effects: { recipes: ['soup'] },
      intro: ['夏の日差しで、トマトが赤くなる頃ね。', '4つほど届けてくれたら、とっておきのスープの作り方を教えるわ。'],
      thanks: ['つやつやで、いい香り。', 'トマトににんじんを1本足して、コトコト煮るの。トマトスープの作り方よ。'] },
    { id: 't4', req: { soup: 2 }, coins: 120, effects: { bench: 1 },
      intro: ['この頃、郵便屋のソラが朝ごはんを抜いて走り回っているのよ。', 'トマトスープを2杯、届けてもらえる？ あの子にも飲ませたいの。'],
      thanks: ['ありがとう。これであの子も元気が出るわ。', '小屋の奥に、もう一台作業台がしまってあるはずよ。出してあげてね。'] },
    { id: 't5', req: { pumpkin: 2 }, coins: 160, effects: { recipes: ['pie'] },
      intro: ['秋の収穫祭にはね、昔はかぼちゃパイが並んだものよ。', 'かぼちゃを2つ、育ててくれないかしら。'],
      thanks: ['なんて大きなかぼちゃ！', 'かぼちゃ2つで、パイが1つ焼けるわ。作り方を書いておくわね。'] },
    { id: 't6', req: { pie: 2, cornbread: 2 }, coins: 400, effects: { flag: 'festival-food' },
      intro: ['ねえ、今年は収穫祭を開いてみない？ この菜園で。', 'わたしはパンとパイを並べたいの。かぼちゃパイとコーンブレッドを2つずつ、お願いできる？'],
      thanks: ['これで、料理のテーブルはばっちりよ。', '収穫祭、きっといいお祭りになるわ。'] },
  ],
  sora: [
    { id: 's1', req: { strawberry: 3 }, coins: 20, effects: { orders: true, recipes: ['jam'] },
      intro: ['こんにちは！ 郵便屋のソラです。', '村のみんなが、新しい菜園を楽しみにしてるんですよ。手始めに、いちごを3つください！'],
      thanks: ['あまーい！ みんなに自慢しちゃおう。', '菜園の前に掲示板を立てておきました。村の人からの注文を毎朝届けますね。いちごジャムの作り方のメモも、とよさんから預かってます。'] },
    { id: 's2', req: { jam: 2 }, coins: 50, effects: { bigCan: true },
      intro: ['となり村のおばさんに、ジャムを届ける約束をしちゃって……。', 'いちごジャムを2瓶、お願いできますか？'],
      thanks: ['助かりました！', 'お礼に、うちの倉庫で眠ってた大きなじょうろをどうぞ。畑ぜんぶに、いっぺんに水をやれますよ。'] },
    { id: 's3', req: { sunflower: 3 }, coins: 80, effects: { seeds: ['corn'] },
      intro: ['夏の郵便局を、明るくしたいんです。', 'ひまわりを3本、届けてもらえますか？'],
      thanks: ['わあ、局がぱっと明るくなりました。', 'これ、配達先でもらったとうもろこしの種です。夏から秋に育つそうですよ。'] },
    { id: 's4', req: { corn: 4 }, coins: 120, effects: { recipes: ['cornbread'] },
      intro: ['とよさんが、とうもろこしで何か焼きたいって言ってました。', 'とうもろこしを4本、お願いします！'],
      thanks: ['とよさんに届けておきますね！', '……と思ったら、もうレシピを預かってました。コーンブレッドの作り方です。'] },
    { id: 's5', req: { cornbread: 1, jam: 2 }, coins: 220, effects: { seeds: ['blueberry'], recipes: ['tart'] },
      intro: ['冬のあいだ、山の上の灯台守さんに差し入れを届けるんです。', 'コーンブレッドを1つと、いちごジャムを2瓶、お願いできますか？'],
      thanks: ['これで灯台守さんも、あったかい冬を過ごせます。', '灯台守さんから、ブルーベリーの苗と、タルトの作り方をことづかってきました！ 夏から秋に実るそうです。'] },
    { id: 's6', req: { tart: 3 }, coins: 400, effects: { flag: 'festival-letter' },
      intro: ['収穫祭の招待状を、村じゅうに配ることにしました！', '招待状に「おみやげ付き」って書いちゃったんです。ブルーベリータルトを3つ、お願いします！'],
      thanks: ['これで招待状はばっちりです。', '当日は、村じゅうの人が来ますよ！'] },
  ],
  yuzu: [
    { id: 'y1', after: 's1', req: { strawberry: 2, carrot: 2 }, coins: 30, effects: { seeds: ['sunflower'] },
      intro: ['はじめまして。村で花屋をしている、ゆずはです。', 'ソラくんから聞いて来ました。お店に飾る、いちごとにんじんを2つずつ分けてくださる？'],
      thanks: ['色がきれいで、お店が明るくなりそう。', 'お礼に、ひまわりの種をどうぞ。夏に大きく咲きますよ。'] },
    { id: 'y2', req: { sunflower: 2 }, coins: 50, effects: { seeds: ['lavender'] },
      intro: ['ひまわり、咲きました？', '2本だけ、お店に分けてほしいんです。'],
      thanks: ['お日さまみたい。ありがとう。', '代わりに、ラベンダーの苗をどうぞ。一度植えると、何度も摘めますよ。'] },
    { id: 'y3', req: { lavender: 4 }, coins: 90, effects: { recipes: ['bouquet', 'potpourri'] },
      intro: ['ラベンダーの香り、好きなんです。', '4束ほど、届けていただけますか？'],
      thanks: ['いい香り……。', 'ひまわりとラベンダーで花束を、ラベンダーだけでポプリを作れるんです。作り方をお教えしますね。'] },
    { id: 'y4', req: { bouquet: 2 }, coins: 160, effects: { seeds: ['pumpkin'] },
      intro: ['結婚式の飾りを頼まれたんです。', 'ひまわりの花束を2つ、お願いできますか？'],
      thanks: ['すてきな式になりそうです。', 'これ、秋にまくかぼちゃの種です。とよさんが探していましたよ。'] },
    { id: 'y5', req: { potpourri: 3 }, coins: 240, effects: { bench: 1 }, needDecor: 2,
      intro: ['菜園、ずいぶんにぎやかになりましたね。', 'お店で、ラベンダーのポプリを売ってみたいんです。3つお願いできますか？ それと、飾りが2つ以上ある庭を、一度見せてくださいね。'],
      thanks: ['お庭、とってもすてき。', '父が使っていた作業台をゆずります。これで3台ですね。'] },
    { id: 'y6', req: { bouquet: 3, potpourri: 2 }, coins: 400, effects: { flag: 'festival-flowers' },
      intro: ['収穫祭の会場は、わたしに飾らせてください。', 'ひまわりの花束を3つと、ポプリを2つ。それで会場じゅうを花でいっぱいにします！'],
      thanks: ['これで飾りつけは完璧です。', 'あとは、お祭りの日を待つだけですね。'] },
  ],
};
export const QUEST_LIST = PEOPLE_IDS.flatMap((p) => QUESTS[p].map((q) => ({ ...q, who: p })));
export const QUEST_TOTAL = QUEST_LIST.length;
export const FESTIVAL_FLAGS = ['festival-food', 'festival-letter', 'festival-flowers'];

// 会話（依頼の会話は QUESTS から自動生成）
export const DIALOGUES = {
  opening: { who: null, title: 'はじまり', lines: [
    '丘の上の、小さな菜園。長いあいだ、だれも手入れをしていなかった畑を、あなたが引き継ぐことになりました。',
    '種をまいて、水をやって、「おやすみ」で次の日へ。水をやった作物は、ひと晩ごとに育ちます。旬の季節に植えると、育つのが倍の速さです。',
    'まずは、にんじんの種をまいてみましょう。春のあいだに育つ作物です。',
  ] },
  winter: { who: null, title: '冬', lines: [
    '冬がやってきました。冬は旬の作物がないので、どの作物もゆっくり育ちます。',
    '作業台で加工品をつくったり、かごの品物を売ったりするのにちょうどいい季節です。',
  ] },
  festivalReady: { who: 'toyo', title: '収穫祭の準備', lines: [
    '料理も、招待状も、花の飾りも、ぜんぶそろったわね。',
    'あとは、あなたが「収穫祭をひらく」と決めるだけよ。',
  ] },
  festival: { who: null, title: '収穫祭', lines: [
    '夕暮れの菜園に、旗の飾りと灯りがともりました。',
    'とよさんのパイ、ソラが届けた招待状、ゆずはの花。村じゅうの人が、丘の上に集まってきます。',
    '「この畑が、またこんなににぎやかになるなんてね」とよさんが、目を細めて笑いました。',
    'ひだまり菜園の、はじめての収穫祭。今年の実りに、かんぱい。',
  ] },
};
for (const q of QUEST_LIST) {
  DIALOGUES[`${q.id}-intro`] = { who: q.who, title: '依頼', lines: q.intro };
  DIALOGUES[`${q.id}-thanks`] = { who: q.who, title: 'お礼', lines: q.thanks };
}

export const BGM = ['spring', 'summer', 'autumn', 'winter'];

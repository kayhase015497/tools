/* battle-core.js — 統一版（指揮官／飛行員 × 劇本／自由）的共用資料層
 *
 * 單位：1 = 1 公尺。戰機 14 m；護衛艦 ~85 m；巡洋艦 ~230 m；無畏艦 ~1 km；HSS ~2 km；月球艦 ~1.5 km；
 * 預警機 ~120 m；鐵墓高約 8.4 km，位於 15.5 km 外。
 *
 * 載入順序：battle-core → battle-render → battle-sim → battle-ui → battle-main。
 * 這幾支是「經典 script」，共用同一個全域詞法作用域（頂層 const／let 互相可見），不使用 IIFE，拆檔時不必改識別字。
 */
'use strict';
const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t, smooth = (t) => t * t * (3 - 2 * t);

/* ═════════ 世界與資料表 ═════════ */
const FOV = 70;
const TOMB_POS = new THREE.Vector3(0, 1500, -15500), TOMB_SCALE = 34, TOMB_AURA = 4200, ARENA_R = 15000;   // 戰區以鐵墓為中心
// 命中球（鐵墓模型座標，單位同模型 248 高；乘以 TOMB_SCALE 後為世界尺寸）：[x, y, z, 半徑]
const TOMB_PARTS = [[0, 86, 0, 22], [0, 40, 0, 22], [-34, 86, 0, 14], [34, 86, 0, 14], [-46, 86, 0, 12], [46, 86, 0, 12], [-105, 86, 0, 14], [105, 86, 0, 14], [-47, 10, 0, 10], [47, 10, 0, 10], [0, 14, 0, 30], [0, -45, 0, 24], [0, -100, 0, 12]];

// side: 'a' 聯軍 / 'e' 反物質軍團。sc = 模型縮放（模型已正規化為其 MANIFEST 長度）。艦艇速度刻意放慢（真實感）。
const DEF = {
  fgt:   { side: 'a', name: 'Interceptor',    hp: 150,    spd: 105, sc: 1,   rad: 8,   turn: 1.7, boom: 0.8, cls: 'fgt' },
  frig:  { side: 'a', name: 'Frigate',        hp: 3000,   shield: 500,    spd: 28,  turn: 0.20, sc: 9,  rad: 40,  range: 1500, boom: 4,  cls: 'ship', flak: { cd: 0.5, dmg: 40, w: 1.2, len: 30, bs: 900, col: [0.3, 0.7, 1.0] },  beam: { cd: 4.0, n: 1, dmg: 260,  w: 5,  col: [0.35, 0.7, 1.0] } },
  cruis: { side: 'a', name: 'Cruiser',        hp: 9000,   shield: 1800,   spd: 24,  turn: 0.14, sc: 11, rad: 95,  range: 1900, boom: 6,  cls: 'ship', flak: { cd: 0.45, dmg: 60, w: 1.6, len: 40, bs: 900, col: [0.3, 0.7, 1.0] }, beam: { cd: 3.5, n: 1, dmg: 600,  w: 9,  col: [0.3, 0.65, 1.0] } },
  cap:   { side: 'a', name: 'Dreadnought',    hp: 42000,  shield: 8000,   spd: 21,  turn: 0.09, sc: 20, rad: 340, range: 2600, boom: 12, cls: 'cap',  flak: { cd: 0.4, dmg: 90, w: 2.2, len: 60, bs: 900, col: [0.35, 0.75, 1.0] }, beam: { cd: 3.0, n: 2, dmg: 1500, w: 16, col: [0.25, 0.6, 1.0] } },
  hss:   { side: 'a', name: 'HSS',            hp: 160000, shield: 30000,  spd: 20,  turn: 0.06, sc: 30, rad: 700, range: 3200, boom: 20, cls: 'cap',  flak: { cd: 0.3, dmg: 140, w: 3, len: 80, bs: 900, col: [1.0, 0.9, 0.5] },    beam: { cd: 2.6, n: 3, dmg: 3000, w: 28, col: [1.0, 0.85, 0.45] } },
  ipc:   { side: 'a', name: 'IPC Cruiser',    hp: 10000,  shield: 1800,   spd: 25,  turn: 0.14, sc: 11, rad: 105, range: 2000, boom: 6,  cls: 'ship', flak: { cd: 0.4, dmg: 60, w: 1.6, len: 40, bs: 900, col: [1.0, 0.25, 0.22] }, beam: { cd: 3.2, n: 2, dmg: 700, w: 10, col: [1.0, 0.1, 0.16] } },
  xzd:   { side: 'a', name: 'Xianzhou Dreadnought', hp: 420000, shield: 80000,  spd: 18, turn: 0.04, sc: 34, rad: 1000, range: 3800, boom: 26, cls: 'cap', flak: { cd: 0.1, dmg: 110, w: 2.6, len: 70, bs: 900, col: [0.3, 0.7, 1.0] }, beam: { cd: 2.2, n: 6, dmg: 2600, w: 24, col: [0.2, 0.55, 1.0] }, msl: { cd: 3.6, n: 8, dmg: 900 } },
  moon:  { side: 'a', name: 'Screwllum Moon', hp: 260000, shield: 50000,  spd: 16,  turn: 0.03, sc: 45, rad: 740, range: 3400, cd: 5.0, boom: 24, cls: 'cap', bubble: 1,
           flak: { cd: 0.4, dmg: 90, w: 2.2, len: 60, bs: 900, col: [0.35, 0.75, 1.0] }, beam: { cd: 3.0, n: 2, dmg: 1500, w: 16, col: [0.25, 0.6, 1.0] } },
  awacs: { side: 'a', name: 'Sentinel AWACS', hp: 9000,   shield: 1500,   spd: 40,  turn: 0.2,  sc: 1,  rad: 75,  boom: 6, cls: 'ship', noGun: 1 },
  fly:   { side: 'e', name: 'Legion Fighter', hp: 90,     spd: 112, sc: 1.5, rad: 7,  turn: 1.5, boom: 0.8, cls: 'fgt' },
  whale: { side: 'e', name: 'Legion Carrier', hp: 30000,  shield: 6000,   spd: 20,  turn: 0.08, sc: 14, rad: 170, range: 1700, boom: 9,  cls: 'cap',  flak: { cd: 0.6, dmg: 45, w: 1.8, len: 50, bs: 800, col: [0.62, 0.22, 1.0] },  beam: { cd: 3.2, n: 1, dmg: 700, w: 14, col: [0.65, 0.2, 1.0] } }
};
const SHIP_KINDS = ['frig', 'cruis', 'ipc', 'cap', 'xzd', 'hss', 'moon', 'awacs'];

/* ═════════ 劇本時間軸（5 分鐘）與台詞 ═════════ */
// REVEAL：黑幕落下、戰場可見；FLASH：白閃 → 「第四時刻」；DOOM：巨劍降臨；IMPACT：衝擊波；WHITE：全白；END：收尾字卡
const T = { REVEAL: 12, FLASH: 236, DOOM: 256, IMPACT: 268, WHITE: 286, END: 300 };
const WHO = {
  lyc:    { zh: '來古士', en: 'Lygus', ja: 'ライコス', ko: '리고스',       c: '#ff6a8a' },
  herta:  { zh: '黑塔',   en: 'Herta', ja: 'ヘルタ', ko: '헤르타', c: '#ffd98a' },
  cyrene: { zh: '昔漣',   en: 'Cyrene', ja: 'キュレネ', ko: '키레네', c: '#ffb3d1' },
  dan:    { zh: '丹恆',   en: 'Dan Heng', ja: '丹恒', ko: '단항', c: '#7fd6ff' },
  march:  { zh: '三月七', en: 'March 7th', ja: '三月なのか', ko: '삼월칠일',   c: '#ff9ad5' },
  tb:     { zh: '開拓者', en: 'Trailblazer', ja: '開拓者', ko: '개척자', c: '#ffe08a' },
  awacs:  { zh: '預警機', en: 'Sentinel', ja: '哨戒機', ko: '조기경보기',    c: '#8fe6ff' }
};
// 原本 3.5 分鐘版本的台詞時間：戰鬥段（12→140）以 2.6 倍拉長到 12→236 之間的前 130 秒，其餘事件依新時間軸重排
const CUE_BASE = [
  { t: 1.5,  dur: 9.5, type: 4.2, box: 'center', who: 'lyc', en: 'Bear witness, monarch of myriad machines, my ridiculous creation.', zh: '敬請見證，萬機之王，我荒謬的造物。', ja: '万機の王よ、私の歪な造物を、ご照覧ください。', ko: '만기의 왕이여, 나의 터무니없는 창조물을 똑똑히 지켜보라.', fixed: 1 },
  { t: 12.4, dur: 6.5, type: 2.8, box: 'sub', who: 'lyc', en: 'The instant in your calculations bears the name Destruction.', zh: '你計算中的時刻，名為「毀滅」。', ja: 'あなたの演算にある刹那、その名は「壊滅」。', ko: '당신의 계산 속 그 순간의 이름은 \'파멸\'.', },
  { t: 20.5, dur: 4.6, type: 1.8, box: 'sub', who: 'herta', en: 'Who said you could speak, "senior"?', zh: '誰允許你發言了？前輩。', ja: '勝手に喋らないでくれる？先輩。', ko: '누가 발언권을 줬지? 선배.', },
  { t: 26.5, dur: 7.8, type: 3.4, box: 'sub', who: 'herta', en: 'Watch closely. See how your chaos ends at the hands of your juniors.', zh: '給我看仔細了，你這收拾不完的爛攤子如何被後進了結。', ja: '黙って見てなさい。先輩のやらかしを、後輩が始末してあげるから。', ko: '똑똑히 봐. 당신이 수습 못한 이 난장판을 후배들이 어떻게 마무리 짓는지.', },
  { t: 32.5, dur: 5.6, type: 2.6, box: 'sub', who: 'herta', obj: 1, en: 'Screwllum is helping the station search for the signal of Nous. All forces, protect the station.', zh: '螺絲星正在協助黑塔空間站搜索博識尊的信號，全軍保護好空間站。', ja: 'スクリュームはステーションの、ノウスの信号探索に協力している。全軍、ステーションを守り抜いて。', ko: '스크류검이 박식존의 신호를 찾는 스테이션을 돕고 있어. 전군, 스테이션을 지켜.', },
  { t: 35.5, dur: 5.2, type: 2.2, box: 'sub', who: 'cyrene', en: "Don't get too worked up. Take a deep breath.", zh: '別太激動。深呼吸。', ja: 'リラックスよ。深呼吸して。', ko: '긴장하지 말고, 숨 크게 들이마셔.', },
  { t: 42.5, dur: 5.8, type: 2.4, box: 'sub', who: 'dan', en: "There's not a trace of life in that ominous shell.", zh: '那具不祥的空殼裡，沒有一絲生命的氣息。', ja: 'あの禍々しい殻には、命の気配が微塵もない。', ko: '저 불길한 껍데기에선 생명의 기운이 전혀 느껴지지 않아.', },
  { t: 49.8, dur: 5.4, type: 2.4, box: 'sub', who: 'march', en: "We're not going to lose to a hollow husk, right?", zh: '我們不會輸給一具空殼的，對吧？', ja: '空っぽの殻なんかに負けないでしょ？', ko: '설마 빈 껍데기한테 질 리 없다고, 그치?', },
  { t: 57.0, dur: 7.0, type: 3.2, box: 'sub', who: 'tb', en: "In the name of trailblazing, we'll reject this false answer.", zh: '以開拓之名，我們將否定這個虛假的答案。', ja: '開拓の名のもと、私たちはこの偽りの答えを否定する。', ko: '개척의 이름으로, 우리는 이 거짓된 답을 부정하겠다.', },
  { t: 143.2, dur: 8.6, type: 3.6, box: 'center', who: 'lyc', en: 'The "Fourth Instant" of the cosmos… is the coronation of Irontomb!', zh: '宇宙的「第四時刻」……就是鐵墓的加冕！', ja: '宇宙の「第四の刹那」……それは、鉄墓の戴冠だ！', ko: '우주의 \'네 번째 순간\'… 그것은 아이언툼의 대관식이다!', after: 'FLASH' }
];
const CUES = CUE_BASE.map((c) => c.fixed ? Object.assign({}, c) : c.after ? Object.assign({}, c, { t: T.FLASH + 3.2, dur: 11, type: 4.2 }) : Object.assign({}, c, { t: T.REVEAL + (c.t - 12) * 2.6, dur: c.dur * 1.3, type: c.type * 1.3 }));
// 配音（assets/space-war/voice/<語言>/，由 tools-src/audio/cut_voice.sh 自 UVR5 人聲切出）：依 CUE_BASE 順序對應，null＝尚無配音
const VOICE_NAMES = ['lyc1', 'lyc2', 'herta1', 'herta2', null, 'cyrene', 'dan', 'march', 'tb', null];
const VOICE_DUR = {   // 各語言各句的語音秒數
  en: [8.8, 7.2, 3.5, 6.7, 0, 4.0, 3.1, 3.4, 5.6, 0],
  zh: [7.9, 6.7, 4.4, 7.0, 0, 4.3, 3.5, 3.6, 5.7, 0],
  ja: [7.9, 5.7, 2.8, 5.9, 0, 3.9, 3.6, 3.6, 5.9, 0],
  ko: [8.4, 6.7, 3.2, 5.6, 0, 3.9, 3.6, 3.9, 7.3, 0]
};
CUES.forEach((c) => { c.t0 = c.t; c.dur0 = c.dur; c.type0 = c.type; });
function applyCueLang(l) {   // 語言切換時重算：字幕長度與浮現速度跟著該語言的語音走
  CUES.forEach((c, i) => {
    c.t = c.t0; c.dur = c.dur0; c.type = c.type0; const nm = VOICE_NAMES[i], vd = VOICE_DUR[l][i];
    if (nm && vd) { c.voice = '../assets/space-war/voice/' + l + '/' + nm + '.mp3'; c.vdur = vd; c.dur = Math.max(c.dur0, vd + 1); c.type = Math.min(c.type0, vd * 0.8); } else { c.voice = null; c.vdur = 0; }
  });
  const h1 = CUES[2], h2 = CUES[3]; h2.t = h1.t + h1.vdur + 0.5; h1.dur = h1.vdur + 0.5;   // 黑塔兩句連著講，不留空檔
}
applyCueLang('en');
const TICK_BASE = [
  [14,  '反鐵墓宇宙聯軍已完成集結，各艦隊就位。', 'Anti-Irontomb Cosmic Alliance assembled. All fleets in position.'],
  [18,  '旗艦：黑塔太空站（HSS）已進入指揮位置。', 'Flagship: Herta Space Station (HSS) in command position.'],
  [23,  '外線任務：攔截鐵墓的外溢威脅，掩護居民撤離。', 'External front: contain the overflow, cover the evacuation.'],
  [26,  '鐵墓周圍已劃定禁區，艦艇不得進入其能量場。', 'Exclusion zone marked around the Irontomb. No vessel may enter its energy field.'],
  [31,  '螺絲咕姆行星級艦隊已加入戰線，巨型光束泡充能完畢。', "Screwllum's planetary fleet joins the line. Beam bubbles charged."],
  [38,  '預估外溢範圍：五個鄰近星系。', 'Projected spillover: five neighboring star systems.'],
  [66,  '星穹列車已自內部切入，嘗試瓦解鐵墓核心。', 'The Astral Express is breaching the core from within.'],
  [86,  '反物質軍團持續自鐵墓外圍湧出。', 'Antimatter Legion forces keep pouring from the Irontomb.'],
  [104, '警告：鐵墓能量讀數持續攀升。', 'Warning: Irontomb energy readings climbing.'],
  [118, '聯軍損失正在擴大。', 'Alliance losses are mounting.'],
  [129, '能量讀數超出量表。', 'Readings are off the scale.']
];
const TICKS = TICK_BASE.map((x) => [T.REVEAL + 2 + (x[0] - 14) * 1.8, x[1], x[2]]);

/* ═════════ 介面文字（預設英文，開局前可切中文） ═════════ */
const STR = {
  en: {
    objLabel: 'OBJECTIVE', objText: 'Protect the Herta Space Station',
    title: 'AMPHOREUS FINALE · BATTLE', sub: 'Anti-Irontomb Cosmic Alliance vs the Antimatter Legion. Command the fleet or fly the line yourself.',
    mode: 'MODE', script: 'Story · 5:00', free: 'Free · endless', role: 'ROLE', pilot: 'Pilot', commander: 'Commander', lang: '中文', go: 'ENGAGE', loading: 'LOADING…', resume: 'RESUME', restart: 'RESTART',
    qHigh: 'Graphics: High', qLow: 'Graphics: Low', soundOn: 'Sound: On', soundOff: 'Sound: Off',
    hintScript: 'About five minutes. The battle can be fought, but not won — the Irontomb never falls.', hintFree: 'No time limit. The battle never ends.',
    keysPilot: ['<b>Mouse</b> pitch / yaw', '<b>W / S</b> throttle', '<b>Q / E</b> roll', '<b>A D R F</b> strafe', '<b>Shift</b> afterburner', '<b>X</b> full stop', '<b>LMB / Space</b> lasers', '<b>RMB / Ctrl</b> missile', '<b>T</b> lock · <b>Y</b> next · <b>U</b> AWACS tasking', '<b>C</b> focus fire · <b>G</b> charge (call support)', '<b>V</b> camera · <b>Z</b> assist · <b>I</b> invert', '<b>Tab</b> switch to Commander · <b>M</b> music · <b>P</b> pause'],
    keysCmd: ['<b>Left-drag</b> box select', '<b>Left-click</b> move / click an enemy to focus', '<b>Right-drag</b> rotate', '<b>Wheel</b> zoom', '<b>WASD</b> pan (Shift fast)', '<b>1 / 2 / 3</b> all · fighters · capital ships', '<b>C</b> charge · <b>X</b> hold · <b>T</b> focus Irontomb', '<b>Tab</b> switch to Pilot', '<b>M</b> music · <b>P / Esc</b> pause'],
    legal: 'Unofficial fan work, not affiliated with the game\'s publisher. Dialogue and settings © their respective owners.<br/>Music: "Agony Converging into River" © HOYO-MiX. Desktop with mouse + keyboard recommended.',
    ships: 'Ships', kills: 'Kills', sel: 'Selected', all: 'Select all', charge: 'Charge', hold: 'Hold', tomb: 'Focus Tomb', toPilot: 'Pilot [Tab]', toCmd: 'Commander [Tab]',
    chooseTitle: 'Take the controls', chooseOrig: 'Return to your fighter', chooseHss: 'Launch from the HSS', chooseGone: 'Your fighter was lost',
    resupply: 'MISSILES LOW · RESUPPLY AT', resupplying: 'RESUPPLYING', resupplied: 'MISSILES RESUPPLIED',
    focusFire: 'FOCUS FIRE', chargeCall: 'CHARGE', responding: 'responding', noTarget: 'No target locked (T)', cooling: 'Comms cooling down', noOne: 'No friendly in range',
    awacsOn: 'AWACS ONLINE', awacsOff: 'AWACS OFFLINE · local control', tasking: 'AWACS TASKING',
    youLost: 'PILOT LOST · REDEPLOY IN', leave: 'LEAVING BATTLE AREA · TURN BACK', zone: 'IRONTOMB EXCLUSION ZONE · TURN BACK', integrity: 'INTEGRITY',
    endA: ['The cosmos\' Fourth Instant — the coronation of Irontomb.', 'No victory was ever written into this battle.', 'What is the first cause of life? The ultimate debate with Nous begins.']
  },
  zh: {
    objLabel: '任務目標', objText: '保護黑塔空間站',
    title: '翁法羅斯終章・戰場', sub: '反鐵墓宇宙聯軍對抗反物質軍團。你可以統率艦隊，也可以親自駕機上陣。',
    mode: '模式', script: '劇本・5 分鐘', free: '自由・無限', role: '角色', pilot: '飛行員', commander: '指揮官', lang: 'English', go: '進入戰場', loading: '載入中…', resume: '繼續', restart: '重新開始',
    qHigh: '畫質：高', qLow: '畫質：低', soundOn: '音效：開', soundOff: '音效：關',
    hintScript: '約五分鐘。戰鬥可以打，但無法取勝——鐵墓不會倒下。', hintFree: '沒有時間限制，戰鬥永不結束。',
    keysPilot: ['<b>滑鼠</b> 俯仰／偏航', '<b>W / S</b> 油門', '<b>Q / E</b> 翻滾', '<b>A D R F</b> 平移', '<b>Shift</b> 加力', '<b>X</b> 急停', '<b>左鍵／空白</b> 雷射', '<b>右鍵／Ctrl</b> 飛彈', '<b>T</b> 鎖定　<b>Y</b> 下一個　<b>U</b> 預警機指派', '<b>C</b> 集火　<b>G</b> 衝鋒（呼叫支援）', '<b>V</b> 視角　<b>Z</b> 飛行輔助　<b>I</b> 反轉俯仰', '<b>Tab</b> 切換指揮官　<b>M</b> 音樂　<b>P</b> 暫停'],
    keysCmd: ['<b>左鍵拖曳</b> 框選', '<b>左鍵點擊</b> 移動／點敵艦集火', '<b>右鍵拖曳</b> 旋轉', '<b>滾輪</b> 縮放', '<b>WASD</b> 平移（Shift 加速）', '<b>1 / 2 / 3</b> 全軍・戰機・主力艦', '<b>C</b> 衝鋒　<b>X</b> 固守　<b>T</b> 集火鐵墓', '<b>Tab</b> 切換飛行員', '<b>M</b> 音樂　<b>P / Esc</b> 暫停'],
    legal: '非官方同人作品，與遊戲官方無關。劇中台詞與設定版權歸原權利人所有。<br/>配樂：《Agony Converging into River》© HOYO-MiX。建議使用桌機滑鼠鍵盤。',
    ships: '艦艇', kills: '擊毀', sel: '選取', all: '全選', charge: '衝鋒', hold: '固守', tomb: '集火鐵墓', toPilot: '飛行員 [Tab]', toCmd: '指揮官 [Tab]',
    chooseTitle: '接管操控', chooseOrig: '回到原本的戰機', chooseHss: '從 HSS 重新起飛', chooseGone: '原本的戰機已被擊毀',
    resupply: '飛彈不足・前往補給', resupplying: '補給中', resupplied: '飛彈補給完成',
    focusFire: '集火', chargeCall: '衝鋒', responding: '響應', noTarget: '尚未鎖定目標（T）', cooling: '通訊冷卻中', noOne: '射程內沒有友軍',
    awacsOn: '預警機在線', awacsOff: '預警機離線・各自為戰', tasking: '預警機指派',
    youLost: '飛行員陣亡・重新部署倒數', leave: '正在離開戰區・請折返', zone: '鐵墓禁區・請折返', integrity: '完整度',
    endA: ['宇宙的第四時刻，鐵墓加冕。', '這場戰鬥，從一開始就沒有被寫下勝利。', '生命的第一因是什麼？一場與「博識尊」（Nous）的終極辯論正式開始。']
  }
};
// 日文、韓文：目前只翻譯劇本台詞與角色名；其餘介面文字沿用英文。按鈕上顯示的是「下一個語言」的名字
STR.ja = Object.assign({}, STR.en, { lang: '한국어' }); STR.ko = Object.assign({}, STR.en, { lang: 'English' }); STR.zh.lang = '日本語'; STR.en.lang = '中文';

/* ═════════ 無線電台詞（20 句，雙語）與呼號生成 ═════════ */
const RADIO = {
  lock: [
    ['Tally ho — target locked.', '發現目標，已鎖定。'],
    ['Radar lock, engaging.', '雷達鎖定，開始攻擊。'],
    ["I've got him in my sights.", '他在我的準星裡了。'],
    ['Locked on — fox two!', '鎖定完成，飛彈發射！']
  ],
  pursue: [
    ['On his tail, pushing in.', '咬住他的尾巴了，持續追擊。'],
    ["Chasing — don't let him break away!", '正在追擊，別讓他脫離！'],
    ['Breaking left, following the bandit.', '左轉機動，緊跟敵機。'],
    ['Closing in, almost in range.', '正在逼近，快進入射程了。']
  ],
  hit: [
    ["I'm hit! Systems failing!", '我中彈了！系統失靈！'],
    ['Taking fire — shields down!', '遭到攻擊，護盾已破！'],
    ['Hull breach, I need cover!', '艙體破損，需要掩護！'],
    ["They're all over me — somebody help!", '他們咬上我了，誰來幫忙！']
  ],
  final: [
    ['Going down… tell them we held the line.', '我要墜毀了……告訴他們，我們守住了防線。'],
    ["Can't hold it… it's been an honor.", '撐不住了……能與你們並肩作戰是我的榮幸。'],
    ["Mayday, mayday — I've lost control!", '求救求救，我失去控制了！'],
    ['Engines are gone… so long, everyone.', '引擎沒了……各位，再見。'],
    ['Tell my wingmate… I kept my promise.', '告訴我的僚機……我守住了約定。']
  ],
  kill: [
    ['Splash one!', '擊落一架！'],
    ['Target destroyed, moving on.', '目標摧毀，轉往下一個。'],
    ['Got him! Who\'s next?', '打中了！下一個是誰？']
  ]
};
const CS_FIGHTER = ['Viper', 'Falcon', 'Halo', 'Raven', 'Comet', 'Lancer', 'Ember', 'Nova', 'Vector', 'Saber', 'Phantom', 'Wraith', 'Talon', 'Orion'];
const CS_SHIP = ['Aegis', 'Bastion', 'Longbow', 'Halberd', 'Tempest', 'Resolute', 'Vanguard', 'Stormwall', 'Ironside', 'Meridian'];
let sentinelN = 0;
function makeCallsign(kind) {
  if (kind === 'awacs') return 'Sentinel-' + (++sentinelN);
  if (kind === 'fgt') return pick(CS_FIGHTER) + ' ' + (1 + ((Math.random() * 9) | 0)) + '-' + (1 + ((Math.random() * 6) | 0));
  if (kind === 'hss') return 'HSS Command';
  if (kind === 'moon') return 'Screwllum-' + (1 + ((Math.random() * 3) | 0));
  return pick(CS_SHIP) + '-' + String(1 + ((Math.random() * 98) | 0)).padStart(2, '0');
}

/* ═════════ 全域狀態 ═════════ */
const allies = [], enemies = [], shots = [];
const G = { mode: 'script', role: 'pilot', lang: 'en', started: false, paused: true, t: 0, kills: 0, deaths: 0, wave: 0, ended: false, control: true, doom: 0 };
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), QT = new THREE.Quaternion(), QT2 = new THREE.Quaternion();
const AXX = new THREE.Vector3(1, 0, 0), AXY = new THREE.Vector3(0, 1, 0), AXZ = new THREE.Vector3(0, 0, 1);
const DBG = { aim: false, fired: {}, hits: {}, dmg: {} };

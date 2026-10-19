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
  fgt:   { side: 'a', name: 'Starskiff',       hp: 150,    spd: 105, sc: 1,   rad: 8,   turn: 1.7, boom: 0.8, cls: 'fgt' },
  frig:  { side: 'a', name: 'Frigate',        hp: 3000,   shield: 500,    spd: 28,  turn: 0.20, sc: 9,  rad: 40,  range: 1500, boom: 4,  cls: 'ship', flak: { cd: 0.5, dmg: 40, w: 1.2, len: 30, bs: 900, col: [0.3, 0.7, 1.0] },  beam: { cd: 4.0, n: 1, dmg: 260,  w: 5,  col: [0.35, 0.7, 1.0] } },
  cruis: { side: 'a', name: 'Cruiser',        hp: 24000,  shield: 4500,   spd: 24,  turn: 0.12, sc: 22, rad: 190, range: 2300, boom: 10, cls: 'ship', flak: { cd: 0.35, dmg: 90, w: 2.0, len: 50, bs: 900, col: [0.3, 0.7, 1.0] }, beam: { cd: 3.0, n: 2, dmg: 900,  w: 14, col: [0.3, 0.65, 1.0] }, msl: { cd: 4.5, n: 4, dmg: 700 } },
  hss:   { side: 'a', name: 'HSS',            hp: 160000, shield: 30000,  spd: 20,  turn: 0.06, sc: 30, rad: 700, range: 3200, boom: 20, cls: 'cap',  flak: { cd: 0.3, dmg: 140, w: 3, len: 80, bs: 900, col: [1.0, 0.9, 0.5] },    beam: { cd: 2.6, n: 3, dmg: 3000, w: 28, col: [1.0, 0.85, 0.45] } },
  ipc:   { side: 'a', name: 'IPC Cruiser',    hp: 26000,  shield: 4500,   spd: 25,  turn: 0.12, sc: 22, rad: 210, range: 2400, boom: 10, cls: 'ship', flak: { cd: 0.33, dmg: 100, w: 2.0, len: 50, bs: 900, col: [1.0, 0.25, 0.22] }, beam: { cd: 2.8, n: 2, dmg: 1000, w: 16, col: [1.0, 0.1, 0.16] }, msl: { cd: 4.0, n: 4, dmg: 800 } },
  xzd:   { side: 'a', name: 'Xianzhou Dreadnought', hp: 420000, shield: 80000,  spd: 18, turn: 0.04, sc: 34, rad: 1000, range: 3800, boom: 26, cls: 'cap', flak: { cd: 0.1, dmg: 110, w: 2.6, len: 70, bs: 900, col: [0.3, 0.7, 1.0] }, beam: { cd: 2.2, n: 6, dmg: 2600, w: 24, col: [0.2, 0.55, 1.0] }, msl: { cd: 3.6, n: 8, dmg: 900 } },
  moon:  { side: 'a', name: 'Screwllum Moon', hp: 260000, shield: 50000,  spd: 16,  turn: 0.03, sc: 45, rad: 740, range: 3400, cd: 5.0, boom: 24, cls: 'cap', bubble: 1,
           flak: { cd: 0.4, dmg: 90, w: 2.2, len: 60, bs: 900, col: [0.35, 0.75, 1.0] }, beam: { cd: 3.0, n: 2, dmg: 1500, w: 16, col: [0.25, 0.6, 1.0] } },
  awacs: { side: 'a', name: 'IPC SID', hp: 24000,  shield: 4500,   spd: 30,  turn: 0.14, sc: 22, rad: 210,  boom: 6, cls: 'ship', noGun: 1 },
  ifgt:  { side: 'a', name: 'IPC Fighter',    hp: 150,    spd: 105, sc: 1,   rad: 8,   turn: 1.7, boom: 0.8, cls: 'fgt' },
  fly:   { side: 'e', name: 'Legion Fighter', hp: 90,     spd: 112, sc: 1.5, rad: 7,  turn: 1.5, boom: 0.8, cls: 'fgt' },
  whale: { side: 'e', name: 'Legion Carrier', hp: 30000,  shield: 6000,   spd: 20,  turn: 0.08, sc: 14, rad: 170, range: 1700, boom: 9,  cls: 'cap',  flak: { cd: 0.6, dmg: 45, w: 1.8, len: 50, bs: 800, col: [0.62, 0.22, 1.0] },  beam: { cd: 3.2, n: 1, dmg: 700, w: 14, col: [0.65, 0.2, 1.0] } }
};
// 轉動慣量（Rotational Inertia）係數：越大，轉向的啟動與煞停越遲滯、越有沉重感（戰機不套用）。角加速度 = 最大轉速 ÷ 係數（弧度／秒²）
const INERTIA = { frig: 1.6, cruis: 3.2, ipc: 3.2, whale: 4.5, awacs: 3.2, xzd: 7, hss: 6, moon: 7 };
const isFgtKind = (k) => k === 'fgt' || k === 'ifgt';
const SHIP_KINDS = ['frig', 'cruis', 'ipc', 'xzd', 'hss', 'moon', 'awacs'];

/* ═════════ 劇本時間軸（5 分鐘）與台詞 ═════════ */
// REVEAL：黑幕落下、戰場可見；FLASH：白閃；DOOM：巨劍降臨（約 T.DOOM+4.5 起來古士念出「第四時刻」台詞，語音收在刺下的衝擊瞬間）；IMPACT：衝擊波；WHITE：全白；END：收尾字卡
const T = { REVEAL: 12, FLASH: 236, DOOM: 242, IMPACT: 254, WHITE: 272, END: 280 };
const WHO = {
  lyc:    { zh: '來古士', en: 'Lygus', ja: 'ライコス', ko: '리고스',       c: '#ff6a8a' },
  herta:  { zh: '黑塔',   en: 'Herta', ja: 'ヘルタ', ko: '헤르타', c: '#ffd98a' },
  cyrene: { zh: '昔漣',   en: 'Cyrene', ja: 'キュレネ', ko: '키레네', c: '#ffb3d1' },
  dan:    { zh: '丹恆',   en: 'Dan Heng', ja: '丹恒', ko: '단항', c: '#7fd6ff' },
  march:  { zh: '三月七', en: 'March 7th', ja: '三月なのか', ko: '삼월칠일',   c: '#ff9ad5' },
  tb:     { zh: '開拓者', en: 'Trailblazer', ja: '開拓者', ko: '개척자', c: '#ffe08a' },
  awacs:  { zh: 'IPC 戰略投資部專用艦', en: 'IPC SID', ja: 'IPC 戦略投資部専用艦', ko: 'IPC 전략투자부 전용함',    c: '#8fe6ff' }
};
// 原本 3.5 分鐘版本的台詞時間：戰鬥段（12→140）以 2.6 倍拉長到 12→236 之間的前 130 秒，其餘事件依新時間軸重排
const CUE_BASE = [
  { t: 1.5,  dur: 9.5, type: 4.2, box: 'center', who: 'lyc', en: 'Bear witness, monarch of myriad machines, my ridiculous creation.', zh: '敬請見證，萬機之王，我荒謬的造物。', ja: '万機の王よ、私の歪な造物を、ご照覧ください。', ko: '만기의 왕이여, 나의 터무니없는 창조물을 똑똑히 지켜보라.', fixed: 1 },
  { t: 12.4, dur: 6.5, type: 2.8, box: 'sub', who: 'lyc', en: 'The instant in your calculations bears the name Destruction.', zh: '你計算中的時刻，名為「毀滅」。', ja: 'あなたの演算にある刹那、その名は「壊滅」。', ko: '당신의 계산 속 그 순간의 이름은 \'파멸\'.', },
  { t: 20.5, dur: 4.6, type: 1.8, box: 'sub', who: 'herta', en: 'Who said you could speak, "senior"?', zh: '誰允許你發言了？前輩。', ja: '勝手に喋らないでくれる？先輩。', ko: '누가 발언권을 줬지? 선배.', },
  { t: 26.5, dur: 7.8, type: 3.4, box: 'sub', who: 'herta', en: 'Watch closely. See how your chaos ends at the hands of your juniors.', zh: '給我看仔細了，你這收拾不完的爛攤子如何被後進了結。', ja: '黙って見てなさい。先輩のやらかしを、後輩が始末してあげるから。', ko: '똑똑히 봐. 당신이 수습 못한 이 난장판을 후배들이 어떻게 마무리 짓는지.', },
  { t: 32.5, dur: 5.6, type: 2.6, box: 'sub', who: 'herta', obj: 1, en: 'Screwllum is helping the station search for the signal of Nous. All forces, protect the station.', zh: '螺絲星正在協助黑塔空間站搜索博識尊的信號，全軍保護好空間站。', ja: 'スクリューガムはステーションの、ノウスの信号探索に協力している。全軍、ステーションを守り抜いて。', ko: '스크루룸이 누스의 신호를 찾는 스테이션을 돕고 있어. 전군, 스테이션을 지켜.', },
  { t: 35.5, dur: 5.2, type: 2.2, box: 'sub', who: 'cyrene', en: "Don't get too worked up. Take a deep breath.", zh: '別太激動。深呼吸。', ja: 'リラックスよ。深呼吸して。', ko: '긴장하지 말고, 숨 크게 들이마셔.', },
  { t: 42.5, dur: 5.8, type: 2.4, box: 'sub', who: 'dan', en: "There's not a trace of life in that ominous shell.", zh: '那具不祥的空殼裡，沒有一絲生命的氣息。', ja: 'あの禍々しい殻には、命の気配が微塵もない。', ko: '저 불길한 껍데기에선 생명의 기운이 전혀 느껴지지 않아.', },
  { t: 49.8, dur: 5.4, type: 2.4, box: 'sub', who: 'march', en: "We're not going to lose to a hollow husk, right?", zh: '我們不會輸給一具空殼的，對吧？', ja: '空っぽの殻なんかに負けないでしょ？', ko: '설마 빈 껍데기한테 질 리 없다고, 그치?', },
  { t: 57.0, dur: 7.0, type: 3.2, box: 'sub', who: 'tb', en: "In the name of trailblazing, we'll reject this false answer.", zh: '以開拓之名，我們將否定這個虛假的答案。', ja: '開拓の名のもと、私たちはこの偽りの答えを否定する。', ko: '개척의 이름으로, 우리는 이 거짓된 답을 부정하겠다.', },
  { t: T.DOOM + 4.5, dur: 8.6, type: 7.0, fixed: 1, endBy: T.IMPACT + 0.5, box: 'sub', who: 'lyc', en: 'The "Fourth Instant" of the cosmos… is the coronation of Irontomb!', zh: '銀河的「第四時刻」，視為鐵墓的加冕。', ja: '銀河における「第四の時」……それは、鉄墓の戴冠です！', ko: '은하의 「네 번째 순간」은 아이언툼의 대관식입니다.' },
  { t: T.IMPACT + 1, dur: 21, type: 15, fixed: 1, box: 'center', who: 'lyc', en: 'The conclusion is irrefutable. The right side of the equation — the Erudition — falls silent. In thirteen heartbeats, They will begin recalculating the universe… With Destruction… as the only solution.', zh: '結論無可置疑。等式右側的博識尊，歸於沉寂。十三次心跳過後，他將重啟對寰宇的演算……以毀滅為唯一的解。', ja: '結論は明らかです。等式の右辺——「知恵」——は沈黙しました。十三回の鼓動の後、彼らは再び宇宙の計算を始めます……「壊滅」を唯一の解として。', ko: '결론은 명백합니다. 등호의 우측, 「지식」은 침묵에 빠졌죠. 열세 번의 심장 박동 후, 그분께서는 우주에 대한 재계산을 다시 시작할 겁니다… 「파멸」을 유일한 답으로 삼고.' }
];
const CUES = CUE_BASE.map((c) => c.fixed ? Object.assign({}, c) : c.after ? Object.assign({}, c, { t: T.FLASH + 3.2, dur: 11, type: 4.2 }) : Object.assign({}, c, { t: T.REVEAL + (c.t - 12) * 2.6, dur: c.dur * 1.3, type: c.type * 1.3 }));
// 配音（assets/space-war/voice/<語言>/，由 tools-src/audio/cut_voice.sh 自 UVR5 人聲切出）：依 CUE_BASE 順序對應，null＝尚無配音
const VOICE_NAMES = ['lyc1', 'lyc2', 'herta1', 'herta2', null, 'cyrene', 'dan', 'march', 'tb', 'lyc3', 'lyc4'];
const VOICE_DUR = {   // 各語言各句的語音秒數
  en: [8.8, 7.2, 3.5, 6.7, 0, 4.0, 3.1, 3.4, 5.6, 8.0, 21.0],
  zh: [7.9, 6.7, 4.4, 7.0, 0, 4.3, 3.5, 3.6, 5.7, 10.7, 20.1],
  ja: [7.9, 5.7, 2.8, 5.9, 0, 3.9, 3.6, 3.6, 5.9, 7.0, 22.0],
  ko: [8.4, 6.7, 3.2, 5.6, 0, 3.9, 3.6, 3.9, 7.3, 8.0, 18.9]
};
CUES.forEach((c) => { c.t0 = c.t; c.dur0 = c.dur; c.type0 = c.type; });
let VOICE_SEL = 'follow';   // 配音語言：follow（跟隨介面語言）／en／zh／ja／ko／off（無配音）。字幕永遠跟介面語言
function applyCueLang(l) {   // 語言或配音語言切換時重算：字幕長度與浮現速度跟著「配音語言」的語音走（沒有該語言配音的句子只顯示字幕）
  const vl = VOICE_SEL === 'follow' ? l : VOICE_SEL;
  CUES.forEach((c, i) => {
    c.t = c.t0; c.dur = c.dur0; c.type = c.type0; const nm = VOICE_NAMES[i], vd = vl === 'off' ? 0 : VOICE_DUR[vl][i];
    if (nm && vd) { c.voice = '../assets/space-war/voice/' + vl + '/' + nm + '.mp3'; c.vdur = vd; if (c.endBy) c.t = Math.min(c.t0, c.endBy - vd); c.dur = Math.max(c.dur0, vd + 1); c.type = Math.min(c.type0, vd * 0.8); } else { c.voice = null; c.vdur = 0; }
  });
  const chain = (a, b, gap) => { b.t = a.t + a.vdur + gap; a.dur = a.vdur + gap; };   // 對話連著講：下一句緊接在上一句語音結束後
  chain(CUES[2], CUES[3], 0.5);                                    // 黑塔兩句
  chain(CUES[5], CUES[6], 0.45); chain(CUES[6], CUES[7], 0.4); chain(CUES[7], CUES[8], 0.9);   // 昔漣 → 丹恆 → 三月七 → 開拓者
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
    keysPilot: ['<b>Mouse</b> pitch / yaw', '<b>W / S</b> throttle', '<b>Q / E</b> roll', '<b>A D R F</b> strafe', '<b>Shift</b> afterburner', '<b>X</b> full stop', '<b>LMB / Space</b> lasers', '<b>RMB / Ctrl</b> missile', '<b>T</b> lock · <b>Y</b> next · <b>U</b> IPC SID tasking', '<b>C</b> focus fire · <b>G</b> charge (call support)', '<b>V</b> camera · <b>Z</b> assist · <b>I</b> invert', '<b>Tab</b> switch to Commander · <b>M</b> music · <b>P</b> pause'],
    keysCmd: ['<b>Left-drag</b> box select', '<b>Left-click</b> move / click an enemy to focus', '<b>Right-drag</b> rotate', '<b>Wheel</b> zoom', '<b>WASD</b> pan (Shift fast)', '<b>1 / 2 / 3</b> all · fighters · capital ships', '<b>C</b> charge · <b>X</b> hold · <b>T</b> focus Irontomb', '<b>Tab</b> switch to Pilot', '<b>M</b> music · <b>P / Esc</b> pause'],
    legal: 'Unofficial fan work, not affiliated with the game\'s publisher. Dialogue and settings © their respective owners.<br/>Music: "Agony Converging into River" © HOYO-MiX. Desktop with mouse + keyboard recommended.',
    ships: 'Ships', kills: 'Kills', sel: 'Selected', all: 'Select all', charge: 'Charge', hold: 'Hold', tomb: 'Focus Tomb', toPilot: 'Pilot [Tab]', toCmd: 'Commander [Tab]',
    chooseTitle: 'Take the controls', chooseOrig: 'Return to your fighter', chooseHss: 'Launch from the HSS', chooseGone: 'Your fighter was lost',
    resupply: 'MISSILES LOW · RESUPPLY AT', resupplying: 'RESUPPLYING', resupplied: 'MISSILES RESUPPLIED',
    focusFire: 'FOCUS FIRE', chargeCall: 'CHARGE', responding: 'responding', noTarget: 'No target locked (T)', cooling: 'Comms cooling down', noOne: 'No friendly in range',
    awacsOn: 'IPC SID ONLINE', awacsOff: 'IPC SID OFFLINE · local control', tasking: 'IPC SID TASKING',
    youLost: 'PILOT LOST · REDEPLOY IN', leave: 'LEAVING BATTLE AREA · TURN BACK', zone: 'IRONTOMB EXCLUSION ZONE · TURN BACK', integrity: 'INTEGRITY',
    endA: ['The cosmos\' Fourth Instant — the coronation of Irontomb.', 'No victory was ever written into this battle.', 'What is the first cause of life? The ultimate debate with Nous begins.']
  },
  zh: {
    objLabel: '任務目標', objText: '保護黑塔空間站',
    title: '翁法羅斯終章・戰場', sub: '反鐵墓宇宙聯軍對抗反物質軍團。你可以統率艦隊，也可以親自駕機上陣。',
    mode: '模式', script: '劇本・5 分鐘', free: '自由・無限', role: '角色', pilot: '飛行員', commander: '指揮官', lang: 'English', go: '進入戰場', loading: '載入中…', resume: '繼續', restart: '重新開始',
    qHigh: '畫質：高', qLow: '畫質：低', soundOn: '音效：開', soundOff: '音效：關',
    hintScript: '約五分鐘。戰鬥可以打，但無法取勝——鐵墓不會倒下。', hintFree: '沒有時間限制，戰鬥永不結束。',
    keysPilot: ['<b>滑鼠</b> 俯仰／偏航', '<b>W / S</b> 油門', '<b>Q / E</b> 翻滾', '<b>A D R F</b> 平移', '<b>Shift</b> 加力', '<b>X</b> 急停', '<b>左鍵／空白</b> 雷射', '<b>右鍵／Ctrl</b> 飛彈', '<b>T</b> 鎖定　<b>Y</b> 下一個　<b>U</b> 專用艦指派', '<b>C</b> 集火　<b>G</b> 衝鋒（呼叫支援）', '<b>V</b> 視角　<b>Z</b> 飛行輔助　<b>I</b> 反轉俯仰', '<b>Tab</b> 切換指揮官　<b>M</b> 音樂　<b>P</b> 暫停'],
    keysCmd: ['<b>左鍵拖曳</b> 框選', '<b>左鍵點擊</b> 移動／點敵艦集火', '<b>右鍵拖曳</b> 旋轉', '<b>滾輪</b> 縮放', '<b>WASD</b> 平移（Shift 加速）', '<b>1 / 2 / 3</b> 全軍・戰機・主力艦', '<b>C</b> 衝鋒　<b>X</b> 固守　<b>T</b> 集火鐵墓', '<b>Tab</b> 切換飛行員', '<b>M</b> 音樂　<b>P / Esc</b> 暫停'],
    legal: '非官方同人作品，與遊戲官方無關。劇中台詞與設定版權歸原權利人所有。<br/>配樂：《Agony Converging into River》© HOYO-MiX。建議使用桌機滑鼠鍵盤。',
    ships: '艦艇', kills: '擊毀', sel: '選取', all: '全選', charge: '衝鋒', hold: '固守', tomb: '集火鐵墓', toPilot: '飛行員 [Tab]', toCmd: '指揮官 [Tab]',
    chooseTitle: '接管操控', chooseOrig: '回到原本的戰機', chooseHss: '從 HSS 重新起飛', chooseGone: '原本的戰機已被擊毀',
    resupply: '飛彈不足・前往補給', resupplying: '補給中', resupplied: '飛彈補給完成',
    focusFire: '集火', chargeCall: '衝鋒', responding: '響應', noTarget: '尚未鎖定目標（T）', cooling: '通訊冷卻中', noOne: '射程內沒有友軍',
    awacsOn: 'IPC 戰略投資部專用艦在線', awacsOff: 'IPC 戰略投資部專用艦離線・各自為戰', tasking: '專用艦指派',
    youLost: '飛行員陣亡・重新部署倒數', leave: '正在離開戰區・請折返', zone: '鐵墓禁區・請折返', integrity: '完整度',
    endA: ['宇宙的第四時刻，鐵墓加冕。', '這場戰鬥，從一開始就沒有被寫下勝利。', '生命的第一因是什麼？一場與「博識尊」（Nous）的終極辯論正式開始。']
  }
};
STR.en.langLabel = 'LANGUAGE'; STR.zh.langLabel = '語言';
STR.en.voiceLabel = 'VOICE'; STR.en.voiceFollow = 'Same as UI'; STR.en.voiceOff = 'Off';
STR.zh.voiceLabel = '配音'; STR.zh.voiceFollow = '跟隨介面語言'; STR.zh.voiceOff = '關閉';
STR.ja = {
    objLabel: '目標', objText: 'ヘルタ宇宙ステーションを守れ', langLabel: '言語', voiceLabel: '音声', voiceFollow: '表示言語に合わせる', voiceOff: 'オフ',
    title: 'オンパロス終章・戦場', sub: '反鉄墓宇宙連合軍 対 反物質軍団。艦隊を指揮するもよし、自ら戦闘機で戦線に立つもよし。',
    mode: 'モード', script: 'ストーリー・5分', free: 'フリー・無限', role: '役割', pilot: 'パイロット', commander: '指揮官', go: '出撃', loading: '読み込み中…', resume: '再開', restart: '最初から',
    qHigh: '画質：高', qLow: '画質：低', soundOn: 'サウンド：オン', soundOff: 'サウンド：オフ',
    hintScript: '約5分。戦うことはできるが、勝つことはできない——鉄墓は決して倒れない。', hintFree: '時間制限なし。戦いは終わらない。',
    keysPilot: ['<b>マウス</b> ピッチ／ヨー', '<b>W / S</b> スロットル', '<b>Q / E</b> ロール', '<b>A D R F</b> 平行移動', '<b>Shift</b> アフターバーナー', '<b>X</b> 急停止', '<b>左クリック／Space</b> レーザー', '<b>右クリック／Ctrl</b> ミサイル', '<b>T</b> ロック · <b>Y</b> 次 · <b>U</b> 専用艦の指示', '<b>C</b> 集中砲火 · <b>G</b> 突撃（支援要請）', '<b>V</b> 視点 · <b>Z</b> 飛行補助 · <b>I</b> ピッチ反転', '<b>Tab</b> 指揮官に切替 · <b>M</b> 音楽 · <b>P</b> 一時停止'],
    keysCmd: ['<b>左ドラッグ</b> 範囲選択', '<b>左クリック</b> 移動／敵をクリックで集中砲火', '<b>右ドラッグ</b> 回転', '<b>ホイール</b> ズーム', '<b>WASD</b> 移動（Shiftで高速）', '<b>1 / 2 / 3</b> 全軍・戦闘機・主力艦', '<b>C</b> 突撃 · <b>X</b> 待機 · <b>T</b> 鉄墓を集中砲火', '<b>Tab</b> パイロットに切替', '<b>M</b> 音楽 · <b>P / Esc</b> 一時停止'],
    legal: '非公式のファン作品であり、ゲームの運営元とは無関係です。作中の台詞・設定の著作権は各権利者に帰属します。<br/>BGM：「Agony Converging into River」© HOYO-MiX。マウスとキーボードのデスクトップ環境を推奨します。',
    ships: '艦艇', kills: '撃破', sel: '選択中', all: '全選択', charge: '突撃', hold: '待機', tomb: '鉄墓を集中砲火', toPilot: 'パイロット [Tab]', toCmd: '指揮官 [Tab]',
    chooseTitle: '操縦を引き継ぐ', chooseOrig: '元の戦闘機に戻る', chooseHss: 'HSSから出撃', chooseGone: '元の戦闘機は撃墜された',
    resupply: 'ミサイル残量わずか・補給地点：', resupplying: '補給中', resupplied: 'ミサイル補給完了',
    focusFire: '集中砲火', chargeCall: '突撃', responding: '応答', noTarget: '目標未ロック（T）', cooling: '通信クールダウン中', noOne: '射程内に味方なし',
    awacsOn: 'IPC戦略投資部専用艦オンライン', awacsOff: 'IPC戦略投資部専用艦オフライン・各自で戦闘', tasking: '専用艦の指示',
    youLost: 'パイロット死亡・再出撃まで', leave: '戦域を離脱中・引き返せ', zone: '鉄墓の立入禁止区域・引き返せ', integrity: '完全度',
    endA: ['宇宙の第四の刹那——鉄墓の戴冠。', 'この戦いに、勝利は最初から書かれていなかった。', '生命の第一原因とは何か？「ノウス」との究極の論争が、今始まる。']
  };
STR.ko = {
    objLabel: '목표', objText: '헤르타 우주 정거장을 지켜라', langLabel: '언어', voiceLabel: '음성', voiceFollow: '표시 언어와 동일', voiceOff: '끄기',
    title: '옴파로스 종장 · 전장', sub: '반 아이언툼 우주 연합군 대 반물질 군단. 함대를 지휘하거나 직접 전투기를 몰고 전선에 서십시오.',
    mode: '모드', script: '스토리 · 5분', free: '자유 · 무한', role: '역할', pilot: '파일럿', commander: '지휘관', go: '출격', loading: '불러오는 중…', resume: '계속', restart: '다시 시작',
    qHigh: '화질: 높음', qLow: '화질: 낮음', soundOn: '소리: 켜짐', soundOff: '소리: 꺼짐',
    hintScript: '약 5분. 싸울 수는 있지만 이길 수는 없다——아이언툼은 쓰러지지 않는다.', hintFree: '시간 제한 없음. 전투는 끝나지 않는다.',
    keysPilot: ['<b>마우스</b> 피치 / 요', '<b>W / S</b> 스로틀', '<b>Q / E</b> 롤', '<b>A D R F</b> 평행 이동', '<b>Shift</b> 애프터버너', '<b>X</b> 급정지', '<b>좌클릭 / Space</b> 레이저', '<b>우클릭 / Ctrl</b> 미사일', '<b>T</b> 락온 · <b>Y</b> 다음 · <b>U</b> 전용함 지시', '<b>C</b> 집중 사격 · <b>G</b> 돌격(지원 요청)', '<b>V</b> 시점 · <b>Z</b> 비행 보조 · <b>I</b> 피치 반전', '<b>Tab</b> 지휘관으로 전환 · <b>M</b> 음악 · <b>P</b> 일시정지'],
    keysCmd: ['<b>좌 드래그</b> 범위 선택', '<b>좌클릭</b> 이동 / 적 클릭으로 집중 사격', '<b>우 드래그</b> 회전', '<b>휠</b> 확대/축소', '<b>WASD</b> 이동(Shift 고속)', '<b>1 / 2 / 3</b> 전군 · 전투기 · 주력함', '<b>C</b> 돌격 · <b>X</b> 대기 · <b>T</b> 아이언툼 집중 사격', '<b>Tab</b> 파일럿으로 전환', '<b>M</b> 음악 · <b>P / Esc</b> 일시정지'],
    legal: '비공식 팬 작품이며 게임 운영사와 무관합니다. 극중 대사와 설정의 저작권은 각 권리자에게 있습니다.<br/>음악: 「Agony Converging into River」© HOYO-MiX. 마우스와 키보드를 사용하는 데스크톱을 권장합니다.',
    ships: '함선', kills: '격파', sel: '선택', all: '전체 선택', charge: '돌격', hold: '대기', tomb: '아이언툼 집중 사격', toPilot: '파일럿 [Tab]', toCmd: '지휘관 [Tab]',
    chooseTitle: '조종 인계', chooseOrig: '원래 전투기로 복귀', chooseHss: 'HSS에서 출격', chooseGone: '원래 전투기가 격추되었습니다',
    resupply: '미사일 부족 · 보급 지점:', resupplying: '보급 중', resupplied: '미사일 보급 완료',
    focusFire: '집중 사격', chargeCall: '돌격', responding: '응답', noTarget: '락온된 표적 없음 (T)', cooling: '통신 재사용 대기 중', noOne: '사거리 내 아군 없음',
    awacsOn: 'IPC 전략투자부 전용함 온라인', awacsOff: 'IPC 전략투자부 전용함 오프라인 · 각자 전투', tasking: '전용함 지시',
    youLost: '파일럿 사망 · 재배치까지', leave: '전투 구역 이탈 중 · 돌아가라', zone: '아이언툼 금지 구역 · 돌아가라', integrity: '완전도',
    endA: ['우주의 네 번째 순간——아이언툼의 대관식.', '이 전투에는 처음부터 승리가 쓰여 있지 않았다.', '생명의 제1원인은 무엇인가? 「누스」와의 궁극적인 논쟁이 시작된다.']
  };

/* ═════════ 無線電台詞（20 句，雙語）與呼號生成 ═════════ */

// 日、韓翻譯：以英文原句為鍵（say／無線電／戰況播報共用）；含變數的句子用 SAY_PATTERNS
const STATIC_TR = {
  'Welcome aboard. The fleet is engaging the Antimatter Legion.': ['乗艦を歓迎する。艦隊は反物質軍団と交戦中だ。', '승함을 환영한다. 함대가 반물질 군단과 교전 중이다.'],
  'Cruiser squadron warping in, rallying to the Screwllum fleet and the station': ['巡洋艦隊がワープで到着、スクリューガムの艦隊とステーションに合流する', '순양함 전대가 워프로 도착, 스크루룸 함대 및 정거장에 합류합니다'],
  'Dreadnought warping in behind the line': ['ドレッドノート級が戦列の後方にワープ到着', '드레드노트급이 전열 후방에 워프로 도착'],
  'Alliance reinforcements warping in': ['連合軍の増援がワープで到着', '연합군 증원군이 워프로 도착'],
  'Fighter wing warping in': ['戦闘機隊がワープで到着', '전투기 편대가 워프로 도착'],
  'IPC SID lost — datalink degraded, units on local control': ['IPC戦略投資部専用艦を喪失——データリンク劣化、各部隊は自律戦闘へ', 'IPC 전략투자부 전용함 상실——데이터링크 저하, 각 부대는 자율 전투로 전환'],
  'Pilot lost. Re-deploying from the HSS hangar…': ['パイロット死亡。HSS格納庫から再出撃中…', '파일럿 사망. HSS 격납고에서 재배치 중…'],
  'Missiles resupplied': ['ミサイル補給完了', '미사일 보급 완료'],
  'Irontomb integrity locked at 60% — it cannot be destroyed': ['鉄墓の完全度が60%で固定——破壊不能', '아이언툼 완전도가 60%에서 고정됨——파괴할 수 없음'],
  'Anti-Irontomb Cosmic Alliance assembled. All fleets in position.': ['反鉄墓宇宙連合軍の集結が完了。全艦隊、配置につけ。', '반 아이언툼 우주 연합군 집결 완료. 전 함대 배치 완료.'],
  'Flagship: Herta Space Station (HSS) in command position.': ['旗艦：ヘルタ宇宙ステーション（HSS）が指揮位置に就いた。', '기함: 헤르타 우주 정거장(HSS)이 지휘 위치에 도착했다.'],
  'External front: contain the overflow, cover the evacuation.': ['外縁任務：鉄墓の溢出を食い止め、住民の避難を援護せよ。', '외곽 임무: 범람을 저지하고 주민 대피를 엄호하라.'],
  'Exclusion zone marked around the Irontomb. No vessel may enter its energy field.': ['鉄墓の周囲に立入禁止区域を設定。艦艇はそのエネルギー場に進入してはならない。', '아이언툼 주변에 금지 구역을 설정했다. 어떤 함선도 그 에너지장에 진입해서는 안 된다.'],
  "Screwllum's planetary fleet joins the line. Beam bubbles charged.": ['スクリューガム率いる惑星級艦隊が戦線に加わった。ビームバブルのチャージ完了。', '스크루룸의 행성급 함대가 전선에 합류했다. 빔 버블 충전 완료.'],
  'Projected spillover: five neighboring star systems.': ['予測される溢出範囲：近隣の五つの星系。', '예상 범람 범위: 인접한 다섯 개 성계.'],
  'The Astral Express is breaching the core from within.': ['星穹列車が内部から突入し、鉄墓の核心の瓦解を試みている。', '은하열차가 내부로 진입해 아이언툼의 핵심을 무너뜨리려 시도 중이다.'],
  'Antimatter Legion forces keep pouring from the Irontomb.': ['反物質軍団が鉄墓の外縁から湧き出し続けている。', '반물질 군단이 아이언툼에서 계속 쏟아져 나오고 있다.'],
  'Warning: Irontomb energy readings climbing.': ['警告：鉄墓のエネルギー値が上昇し続けている。', '경고: 아이언툼의 에너지 수치가 계속 상승하고 있다.'],
  'Alliance losses are mounting.': ['連合軍の損失が拡大している。', '연합군의 피해가 확대되고 있다.'],
  'Readings are off the scale.': ['エネルギー値が計測限界を超えた。', '에너지 수치가 측정 한계를 초과했다.'],
  'Tally ho — target locked.': ['ターゲット発見、ロックした。', '표적 발견, 락온 완료.'],
  'Radar lock, engaging.': ['レーダーロック、交戦開始。', '레이더 락온, 교전 개시.'],
  "I've got him in my sights.": ['照準に捉えた。', '조준경에 잡았다.'],
  'Locked on — fox two!': ['ロックオン——フォックスツー！', '락온 완료——폭스 투!'],
  'On his tail, pushing in.': ['後ろに食らいついた、追撃を続ける。', '꼬리를 물었다, 계속 추격한다.'],
  "Chasing — don't let him break away!": ['追跡中——逃がすな！', '추격 중——놓치지 마!'],
  'Breaking left, following the bandit.': ['左旋回、敵機を追う。', '좌선회, 적기를 따라간다.'],
  'Closing in, almost in range.': ['接近中、まもなく射程に入る。', '접근 중, 곧 사거리에 들어간다.'],
  "I'm hit! Systems failing!": ['被弾した！システム異常！', '피격당했다! 시스템 이상!'],
  'Taking fire — shields down!': ['攻撃を受けている——シールド喪失！', '공격받고 있다——보호막 상실!'],
  'Hull breach, I need cover!': ['船体破損、援護を頼む！', '선체 파손, 엄호 요청!'],
  "They're all over me — somebody help!": ['食いつかれた——誰か助けてくれ！', '놈들이 달라붙었다——누가 좀 도와줘!'],
  'Going down… tell them we held the line.': ['墜落する……戦線は守り抜いたと伝えてくれ。', '추락한다…… 우리가 전선을 지켰다고 전해줘.'],
  "Can't hold it… it's been an honor.": ['もう持たない……共に戦えて光栄だった。', '더는 못 버텨…… 함께 싸워서 영광이었다.'],
  "Mayday, mayday — I've lost control!": ['メーデー、メーデー——制御不能！', '메이데이, 메이데이——제어 불능!'],
  'Engines are gone… so long, everyone.': ['エンジン停止……みんな、さらばだ。', '엔진이 죽었다…… 모두 잘 있어.'],
  'Tell my wingmate… I kept my promise.': ['僚機に伝えてくれ……約束は守ったと。', '내 윙맨에게 전해줘…… 약속을 지켰다고.'],
  'Splash one!': ['一機撃墜！', '한 대 격추!'],
  'Target destroyed, moving on.': ['目標撃破、次へ移る。', '표적 격파, 다음으로 이동.'],
  "Got him! Who's next?": ['仕留めた！次は誰だ？', '잡았다! 다음은 누구지?']
};
const SAY_PATTERNS = [
  [/^Performance mode (.+): reducing effects$/, (m) => ['パフォーマンスモード ' + m[1] + '：エフェクトを軽減', '성능 모드 ' + m[1] + ': 효과를 줄입니다']],
  [/^Antimatter Legion wave (\d+) tearing through the void$/, (m) => ['反物質軍団 第' + m[1] + '波が虚空を引き裂いて来襲', '반물질 군단 ' + m[1] + '차 파도가 허공을 찢고 몰려옵니다']],
  [/^(.+) shields down$/, (m) => [m[1] + ' シールド喪失', m[1] + ' 보호막 상실']],
  [/^(.+) destroyed(?: · (.+))?$/, (m) => [m[1] + ' 撃破' + (m[2] ? ' · ' + m[2] : ''), m[1] + ' 격파' + (m[2] ? ' · ' + m[2] : '')]],
  [/^(.+) online — datalink restored, taking over target allocation$/, (m) => [m[1] + ' オンライン——データリンク復旧、目標割り当てを引き継ぐ', m[1] + ' 온라인——데이터링크 복구, 표적 할당을 인계합니다']]
];
function sayTr(en) {   // → { ja, ko }（找不到翻譯就沿用英文）
  let r = STATIC_TR[en];
  if (!r) for (const [re, f] of SAY_PATTERNS) { const m = re.exec(en); if (m) { r = f(m); break; } }
  if (!r) return { ja: en, ko: en };
  return { ja: r[0].replace(/Screwllum/g, 'スクリューガム'), ko: r[1].replace(/Screwllum/g, '스크루룸') };   // 艦名中的 Screwllum 也換成日、韓譯名
}
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
  if (kind === 'awacs') return 'SID-' + (++sentinelN);
  if (kind === 'fgt' || kind === 'ifgt') return pick(CS_FIGHTER) + ' ' + (1 + ((Math.random() * 9) | 0)) + '-' + (1 + ((Math.random() * 6) | 0));
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

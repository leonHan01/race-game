export type StageId = 'pine' | 'valley' | 'canyon' | 'alpine' | 'hangar' | 'dome' | 'depot' | 'ridge-descent' | 'meadow' | 'quarry' | 'skyline'
  | 'bamboo-descent' | 'sunset-descent' | 'maple-descent' | 'canyon-descent' | 'mist-descent';
/** A rounded earth crest, measured along the road in metres. */
export interface JumpCrest { distance: number; height: number; approach: number; landing: number }
export interface IndoorVenue {
  kind: 'hangar' | 'dome' | 'depot'; height: number; margin: number;
  wall: string; structure: string; accent: string; light: string;
}
export interface StageDefinition {
  id: StageId; number: string; name: string; english: string; level: string; description: string;
  roadWidth: number; grip: number; goldSpeed: number; surface: string; surfaceCode: string; weather: string;
  theme: { sky: string; horizon: string; fog: string; road: string; shoulder: string; ground: string; rock: string; trees: string; density: number };
  points: readonly { x: number; y: number; z: number }[];
  venue?: IndoorVenue;
  downhill?: boolean;
  jumps?: readonly JumpCrest[];
}
const points = (values: number[][]) => values.map(([x, y, z]) => ({ x, y, z }));
export const STAGES: readonly StageDefinition[] = [
  {
    id: 'valley', number: '01', name: '绿谷短途', english: 'GREEN VALLEY', level: '入门',
    description: '宽阔的压实砂石路，缓弯与长直道交替。适合练习刹车点，熟悉手动转向。',
    roadWidth: 22, grip: 1.2, goldSpeed: 34, surface: '压实砂石', surfaceCode: 'HARDPACK', weather: '22°C 晴',
    theme: { sky: '#8faeb8', horizon: '#dedcc4', fog: '#c2cbb2', road: '#caba92', shoulder: '#a7a277', ground: '#829267', rock: '#90917d', trees: '#718354', density: 0.55 },
    points: points([[0,22,180],[0,22,0],[35,23,-180],[90,24,-350],[110,25,-530],[45,26,-710],[-45,26,-900],[-90,25,-1090],[-55,24,-1290],[20,23,-1490],[30,22,-1720]]),
  },
  {
    id: 'pine', number: '02', name: '松岭山道', english: 'PINE RIDGE', level: '标准',
    description: '从松林攀上山脊，连续 S 弯与下坡连接。提前收油，控制入弯速度，再争取出弯加速。',
    roadWidth: 18, grip: 1, goldSpeed: 31, surface: '松散砂石', surfaceCode: 'GRAVEL', weather: '16°C 晴',
    theme: { sky: '#6e8f9a', horizon: '#d8ceb0', fog: '#b7b9a7', road: '#d5bc95', shoulder: '#aa9875', ground: '#66715a', rock: '#788278', trees: '#536447', density: 1 },
    points: points([[0,22,180],[0,23,30],[45,30,-155],[160,39,-300],[220,46,-440],[150,52,-560],[-30,64,-630],[-180,68,-760],[-195,60,-920],[-50,49,-1040],[145,43,-1110],[200,42,-1240],[75,55,-1350],[-100,69,-1380],[-205,83,-1500],[-90,91,-1640],[105,86,-1780],[190,72,-1970],[100,57,-2130],[-70,44,-2250],[-110,33,-2450],[0,26,-2650],[30,24,-2820]]),
  },
  {
    id: 'canyon', number: '03', name: '赤岩峡谷', english: 'RED CANYON', level: '进阶',
    description: '红土峡谷中的连续急弯。高速段后接折返，抓地力较低，反打与刹车时机更重要。',
    roadWidth: 16, grip: 0.83, goldSpeed: 26, surface: '浮土碎石', surfaceCode: 'LOOSE DIRT', weather: '31°C 干燥',
    theme: { sky: '#96a6ad', horizon: '#ecd3ae', fog: '#cfb397', road: '#bc875e', shoulder: '#a47556', ground: '#947558', rock: '#aa795e', trees: '#777451', density: 0.12 },
    points: points([[0,22,180],[0,24,-20],[100,31,-210],[240,39,-310],[270,44,-440],[90,48,-485],[-170,51,-540],[-255,53,-675],[-100,54,-740],[160,52,-820],[255,49,-970],[65,45,-1020],[-205,42,-1090],[-260,41,-1240],[-60,44,-1320],[205,49,-1400],[265,54,-1550],[45,52,-1630],[-200,45,-1780],[-160,36,-1960],[30,28,-2150],[30,24,-2380]]),
  },
  {
    id: 'alpine', number: '04', name: '雪岭关隘', english: 'FROST PASS', level: '专家',
    description: '积雪山口，连续弯道切换，制动和抓地力明显降低。轻踩油门，给每次转向留出余量。',
    roadWidth: 14, grip: 0.63, goldSpeed: 21, surface: '压雪冰面', surfaceCode: 'SNOW', weather: '−8°C 多云',
    theme: { sky: '#9aaebc', horizon: '#e4e7e4', fog: '#cbd4d7', road: '#d8dfdc', shoulder: '#bac7cc', ground: '#c5d0cf', rock: '#9baeb6', trees: '#adbeba', density: 0.6 },
    points: points([[0,35,180],[0,36,0],[120,42,-170],[245,50,-265],[225,57,-370],[-20,66,-405],[-245,75,-465],[-255,79,-590],[-30,84,-650],[240,89,-715],[250,93,-845],[15,97,-895],[-230,100,-970],[-250,96,-1105],[-10,90,-1150],[235,85,-1220],[255,79,-1360],[25,74,-1410],[-245,66,-1490],[-230,60,-1630],[25,54,-1710],[220,47,-1840],[95,40,-2020],[-70,36,-2200],[0,33,-2440],[0,32,-2670]]),
  },
  {
    id: 'hangar', number: '05', name: '机库练习场', english: 'HANGAR RUN', level: '入门',
    description: '封闭机库里的宽阔沥青路线，钢梁与暖白顶灯下连接缓弯。适合练习并排超车和手刹入弯。',
    roadWidth: 22, grip: 1.28, goldSpeed: 30, surface: '干燥沥青', surfaceCode: 'ASPHALT', weather: '室内 · 暖白照明',
    theme: { sky: '#4b4d49', horizon: '#62645a', fog: '#646659', road: '#686963', shoulder: '#b2aa84', ground: '#9b9b8e', rock: '#7d837c', trees: '#69705e', density: 0 },
    venue: { kind: 'hangar', height: 24, margin: 27, wall: '#b5b5a2', structure: '#4e625b', accent: '#d2ae4d', light: '#fff1cf' },
    points: points([[0,0,160],[0,0,80],[0,0,-10],[70,0,-95],[95,0,-180],[30,0,-255],[-65,0,-315],[-85,0,-405],[-25,0,-490],[0,0,-575],[0,0,-645]]),
  },
  {
    id: 'dome', number: '06', name: '穹顶拉力馆', english: 'RALLY DOME', level: '进阶',
    description: '带阶梯看台的全封闭赛事馆，压实红土铺出连续折返。大跨度拱形顶棚下争抢出弯位置。',
    roadWidth: 18, grip: 1.02, goldSpeed: 25, surface: '压实红土', surfaceCode: 'CLAY', weather: '室内 · 赛事照明',
    theme: { sky: '#474c4e', horizon: '#676a62', fog: '#706e61', road: '#b8956c', shoulder: '#c6b79b', ground: '#86887c', rock: '#737872', trees: '#69705e', density: 0 },
    venue: { kind: 'dome', height: 22, margin: 34, wall: '#9faaa3', structure: '#465a58', accent: '#b76346', light: '#fff4dc' },
    points: points([[-105,0,160],[-105,0,90],[-100,0,20],[0,0,-30],[135,0,-55],[170,0,-125],[75,0,-180],[-90,0,-195],[-155,0,-260],[-60,0,-330],[105,0,-350],[145,0,-420],[65,0,-480],[0,0,-530],[0,0,-600]]),
  },
  {
    id: 'depot', number: '07', name: '货运仓储馆', english: 'DEPOT SPRINT', level: '专家',
    description: '低顶仓储场馆，混凝土地面与连续紧弯考验刹车和反打。货架、卷帘门与黄黑标线围绕技术路线。',
    roadWidth: 14, grip: 0.82, goldSpeed: 23, surface: '磨光混凝土', surfaceCode: 'CONCRETE', weather: '室内 · 工业照明',
    theme: { sky: '#414743', horizon: '#60665b', fog: '#616858', road: '#85867a', shoulder: '#b9ae7d', ground: '#686e64', rock: '#81877c', trees: '#69705e', density: 0 },
    venue: { kind: 'depot', height: 12, margin: 25, wall: '#a0a491', structure: '#5e695b', accent: '#d2b253', light: '#efefdc' },
    points: points([[0,0,140],[0,0,65],[65,0,5],[110,0,-55],[55,0,-100],[-85,0,-115],[-130,0,-175],[-50,0,-220],[90,0,-240],[125,0,-305],[45,0,-345],[-90,0,-365],[-125,0,-435],[-40,0,-490],[0,0,-555],[0,0,-635]]),
  },
  {
    id: 'meadow', number: '08', name: '丘陵牧场', english: 'MEADOW HILLS', level: '标准',
    description: '起伏草坡间的宽阔砂石路，三处圆顶土坡提供初次飞跃体验。低速贴地通过，加速迎坡自然腾空。',
    roadWidth: 22, grip: 1.16, goldSpeed: 35, surface: '丘陵砂石', surfaceCode: 'ROLLING GRAVEL', weather: '20°C 晴',
    theme: { sky: '#93b3bf', horizon: '#e5dec4', fog: '#bdc6ab', road: '#caba90', shoulder: '#aaa075', ground: '#81935e', rock: '#93917d', trees: '#637d48', density: 0.38 },
    points: points([[0,24,180],[0,24,60],[0,27,-140],[0,32,-340],[65,40,-510],[130,35,-640],[130,28,-830],[130,27,-1040],[60,38,-1210],[-55,49,-1340],[-55,40,-1540],[-55,28,-1740],[0,24,-1920],[0,24,-2110]]),
    jumps: [
      { distance: 300, height: 4.5, approach: 34, landing: 42 },
      { distance: 1070, height: 5, approach: 36, landing: 44 },
      { distance: 1810, height: 5.5, approach: 38, landing: 46 },
    ],
  },
  {
    id: 'quarry', number: '09', name: '砂岩采石场', english: 'QUARRY RUN', level: '进阶',
    description: '赭色采石场里上下穿行，四处土坡连接高低平台与制动弯。起跳前摆正车头，预留落地后的刹车距离。',
    roadWidth: 20, grip: 0.98, goldSpeed: 32, surface: '砂岩碎石', surfaceCode: 'QUARRY GRAVEL', weather: '27°C 干燥',
    theme: { sky: '#9aadb5', horizon: '#e8d4ad', fog: '#c7b699', road: '#c59b6b', shoulder: '#ac855e', ground: '#a58c64', rock: '#ae8a63', trees: '#7d8057', density: 0.1 },
    points: points([[0,26,180],[0,26,50],[0,36,-150],[0,50,-350],[145,65,-470],[210,58,-620],[210,40,-810],[210,33,-1010],[35,52,-1140],[-145,70,-1250],[-145,53,-1460],[-145,31,-1660],[0,44,-1820],[85,56,-1950],[85,42,-2130],[85,30,-2350],[85,30,-2650]]),
    jumps: [
      { distance: 300, height: 6.5, approach: 38, landing: 48 },
      { distance: 1110, height: 7, approach: 40, landing: 50 },
      { distance: 1940, height: 7.5, approach: 42, landing: 52 },
      { distance: 2670, height: 7, approach: 38, landing: 50 },
    ],
  },
  {
    id: 'skyline', number: '10', name: '云脊飞跃', english: 'SKYLINE CREST', level: '专家',
    description: '沿高山脊线连续爬升和俯冲，四处大落差坡顶考验起跳速度。高速飞跃距离更长，入坡前先选好落地点。',
    roadWidth: 18, grip: 0.88, goldSpeed: 30, surface: '山脊碎石', surfaceCode: 'RIDGE GRAVEL', weather: '11°C 高云',
    theme: { sky: '#7d9ba9', horizon: '#dde1d3', fog: '#becac8', road: '#c4bca3', shoulder: '#a5a48d', ground: '#7b8972', rock: '#929c93', trees: '#64765f', density: 0.32 },
    points: points([[0,42,180],[0,42,50],[0,56,-180],[0,82,-390],[-155,102,-545],[-215,118,-680],[-215,108,-885],[-215,90,-1090],[-25,70,-1240],[145,92,-1375],[145,120,-1580],[145,135,-1795],[0,116,-1960],[-80,85,-2090],[-80,62,-2290],[-80,44,-2520],[-80,42,-2820]]),
    jumps: [
      { distance: 280, height: 8, approach: 42, landing: 54 },
      { distance: 1240, height: 9, approach: 44, landing: 58 },
      { distance: 2110, height: 10, approach: 46, landing: 60 },
      { distance: 2990, height: 9, approach: 42, landing: 58 },
    ],
  },
];
export const DOWNHILL_STAGE: StageDefinition = {
  id: 'ridge-descent', number: 'DH01', name: '云脊速降', english: 'RIDGELINE DESCENT', level: '标准', downhill: true,
  description: '从山脊沿柏油公路一路滑向谷底，落差 260 米。连续长弯连接急弯，直道收身，入弯提前减速。',
  roadWidth: 12, grip: 1.3, goldSpeed: 17.5, surface: '细粒柏油', surfaceCode: 'ASPHALT', weather: '18°C 山风',
  theme: { sky: '#739da9', horizon: '#f1dfbd', fog: '#bacabd', road: '#697277', shoulder: '#b6ab89', ground: '#74866b', rock: '#8c9588', trees: '#4d6c5a', density: 0.55 },
  points: points([[0,300,180],[0,280,-40],[65,259,-245],[180,237,-420],[200,217,-605],[55,195,-770],[-120,174,-905],[-190,151,-1090],[-70,128,-1270],[115,106,-1430],[180,84,-1625],[60,61,-1825],[0,40,-2045]]),
};
export const DOWNHILL_STAGES: readonly StageDefinition[] = [
  DOWNHILL_STAGE,
  {
    id: 'bamboo-descent', number: 'DH02', name: '青岚林道', english: 'JADE FOREST', level: '入门', downhill: true,
    description: '青翠林间的宽路缓坡，落差 150 米。舒展的 S 弯留足转向空间，适合练习收身与脚刹。',
    roadWidth: 16, grip: 1.42, goldSpeed: 14, surface: '平整柏油', surfaceCode: 'ASPHALT', weather: '21°C 晨光',
    theme: { sky: '#93b9b0', horizon: '#e8ecd3', fog: '#c1d5b5', road: '#707b77', shoulder: '#a8b48c', ground: '#729568', rock: '#89947e', trees: '#3f7453', density: 0.85 },
    points: points([[0,195,180],[0,180,-20],[35,165,-220],[85,150,-410],[105,135,-610],[50,120,-810],[-35,105,-1005],[-75,90,-1200],[-45,75,-1400],[15,60,-1600],[15,45,-1810]]),
  },
  {
    id: 'sunset-descent', number: 'DH03', name: '落日山麓', english: 'SUNSET FOOTHILLS', level: '标准', downhill: true,
    description: '暖金草坡下的高速长弯，落差 300 米。长直道适合收身追赶，终段连续弯前要提前站起减速。',
    roadWidth: 14, grip: 1.3, goldSpeed: 19, surface: '干燥柏油', surfaceCode: 'ASPHALT', weather: '24°C 夕照',
    theme: { sky: '#ba9f94', horizon: '#ffddaa', fog: '#d9bba0', road: '#716c70', shoulder: '#c5ab7a', ground: '#a59a65', rock: '#b29b83', trees: '#787954', density: 0.22 },
    points: points([[0,345,180],[0,320,-60],[10,295,-310],[65,270,-565],[165,245,-790],[205,220,-1030],[110,195,-1250],[-35,170,-1460],[-135,145,-1675],[-95,120,-1900],[60,95,-2085],[115,70,-2305],[20,45,-2540]]),
  },
  {
    id: 'maple-descent', number: 'DH04', name: '枫谷回旋', english: 'AMBER SWITCHBACKS', level: '进阶', downhill: true,
    description: '秋色山谷里接连反向的技术弯，落差 280 米。短直道后立即换边，适合灵活板型练习扶地刹滑。',
    roadWidth: 12, grip: 1.24, goldSpeed: 16.5, surface: '山路柏油', surfaceCode: 'ASPHALT', weather: '17°C 秋晴',
    theme: { sky: '#91a7ad', horizon: '#f1dfbe', fog: '#c8bea2', road: '#706d66', shoulder: '#c39c70', ground: '#a28b60', rock: '#97877a', trees: '#ac6945', density: 0.7 },
    points: points([[0,325,180],[0,305,0],[100,285,-175],[225,265,-305],[185,245,-460],[-15,225,-535],[-205,205,-645],[-225,185,-805],[-25,165,-890],[195,145,-990],[220,125,-1155],[20,105,-1240],[-170,85,-1360],[-105,65,-1540],[0,45,-1760]]),
  },
  {
    id: 'canyon-descent', number: 'DH05', name: '赤壁天路', english: 'RED CLIFF DROP', level: '专家', downhill: true,
    description: '赭红岩壁间的陡降公路，落差 390 米。窄路快弯与大幅折返交错，长直道末端需要果断制动。',
    roadWidth: 10, grip: 1.17, goldSpeed: 19, surface: '粗粒柏油', surfaceCode: 'ASPHALT', weather: '29°C 干热',
    theme: { sky: '#9bafba', horizon: '#f1cfad', fog: '#d5b398', road: '#696465', shoulder: '#bb8c65', ground: '#ad825e', rock: '#bd7857', trees: '#8b8258', density: 0.08 },
    points: points([[0,435,180],[0,405,-45],[45,375,-265],[195,345,-425],[255,315,-595],[95,285,-695],[-155,255,-790],[-245,225,-955],[-95,195,-1115],[150,165,-1220],[245,135,-1400],[90,105,-1590],[-65,75,-1800],[0,45,-2040]]),
  },
  {
    id: 'mist-descent', number: 'DH06', name: '雾岭长降', english: 'MIST RIDGE ENDURO', level: '耐力', downhill: true,
    description: '冷色高山林带中的长距离速降，落差 480 米。湿润柏油抓地较低，连续长弯考验控速与路线规划。',
    roadWidth: 12, grip: 1.06, goldSpeed: 18, surface: '微湿柏油', surfaceCode: 'ASPHALT', weather: '12°C 山雾',
    theme: { sky: '#8196a9', horizon: '#d0dce1', fog: '#aebec9', road: '#616d79', shoulder: '#9da9a0', ground: '#718782', rock: '#89969d', trees: '#49685f', density: 0.6 },
    points: points([[0,525,180],[0,495,-60],[75,465,-280],[200,435,-485],[230,405,-715],[85,375,-915],[-125,345,-1090],[-235,315,-1300],[-145,285,-1525],[60,255,-1715],[205,225,-1930],[165,195,-2160],[-20,165,-2360],[-190,135,-2560],[-155,105,-2800],[-30,75,-3020],[0,45,-3270]]),
  },
];
export const stageDrop = (stage: StageDefinition) => Math.round(stage.points[0].y - stage.points[stage.points.length - 1].y);
export const getStage = (id: unknown): StageDefinition => DOWNHILL_STAGES.find(stage => stage.id === id) ?? STAGES.find(stage => stage.id === id) ?? STAGES[1];

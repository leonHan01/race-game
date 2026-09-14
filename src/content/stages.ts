import { ENDURANCE_STAGES, ENDURANCE_DOWNHILL_STAGES } from './endurance-stages';
import { ADVENTURE_STAGES } from './adventure-stages';

export type StageId = 'pine' | 'valley' | 'canyon' | 'alpine' | 'hangar' | 'dome' | 'depot' | 'ridge-descent' | 'meadow' | 'quarry' | 'skyline'
  | 'bamboo-descent' | 'sunset-descent' | 'maple-descent' | 'canyon-descent' | 'mist-descent'
  | 'jade-serpent' | 'dune-switchbacks' | 'frost-serpent' | 'amber-ridge' | 'basalt-run' | 'highland-crest'
  | 'forest-ring' | 'mesa-ring' | 'cedar-descent' | 'terrace-descent'
  | 'glacier-ring' | 'caldera-ring' | 'maple-ring' | 'dune-ring'
  | 'clover-garden' | 'corkscrew-pass' | 'crescent-dunes' | 'canyon-staircase' | 'triple-jump-ring';
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
  scenery?: { trees?: 'broadleaf' | 'conifer'; mountains?: 'mesa' | 'peak' };
  closed?: boolean;
  downhill?: boolean;
  jumps?: readonly JumpCrest[];
}
const points = (values: number[][]) => values.map(([x, y, z]) => ({ x, y, z }));
export const STAGES: readonly StageDefinition[] = [
  {
    id: 'valley', number: '01', name: '绿谷短途', english: 'GREEN VALLEY', level: '入门',
    description: '宽阔的压实砂石路，缓弯与长直道交替。适合练习刹车点，熟悉手动转向。',
    roadWidth: 26.4, grip: 1.2, goldSpeed: 34, surface: '压实砂石', surfaceCode: 'HARDPACK', weather: '22°C 晴',
    scenery: { trees: 'broadleaf' },
    theme: { sky: '#8faeb8', horizon: '#dedcc4', fog: '#c2cbb2', road: '#caba92', shoulder: '#a7a277', ground: '#829267', rock: '#90917d', trees: '#718354', density: 0.55 },
    points: points([[0,22,360],[0,22,0],[70,23,-360],[180,24,-700],[220,25,-1060],[90,26,-1420],[-90,26,-1800],[-180,25,-2180],[-110,24,-2580],[40,23,-2980],[60,22,-3440]]),
  },
  {
    id: 'pine', number: '02', name: '松岭山道', english: 'PINE RIDGE', level: '标准',
    description: '从松林攀上山脊，连续 S 弯与下坡连接。提前收油，控制入弯速度，再争取出弯加速。',
    roadWidth: 21.6, grip: 1, goldSpeed: 31, surface: '松散砂石', surfaceCode: 'GRAVEL', weather: '16°C 晴',
    theme: { sky: '#6e8f9a', horizon: '#d8ceb0', fog: '#b7b9a7', road: '#d5bc95', shoulder: '#aa9875', ground: '#66715a', rock: '#788278', trees: '#536447', density: 1 },
    points: points([[0,22,360],[0,23,60],[90,30,-310],[320,39,-600],[440,46,-880],[300,52,-1120],[-60,64,-1260],[-360,68,-1520],[-390,60,-1840],[-100,49,-2080],[290,43,-2220],[400,42,-2480],[150,55,-2700],[-200,69,-2760],[-410,83,-3000],[-180,91,-3280],[210,86,-3560],[380,72,-3940],[200,57,-4260],[-140,44,-4500],[-220,33,-4900],[0,26,-5300],[60,24,-5640]]),
  },
  {
    id: 'canyon', number: '03', name: '赤岩峡谷', english: 'RED CANYON', level: '进阶',
    description: '红土峡谷中的连续急弯。高速段后接折返，抓地力较低，反打与刹车时机更重要。',
    roadWidth: 19.2, grip: 0.83, goldSpeed: 26, surface: '浮土碎石', surfaceCode: 'LOOSE DIRT', weather: '31°C 干燥',
    scenery: { mountains: 'mesa' },
    theme: { sky: '#96a6ad', horizon: '#ecd3ae', fog: '#cfb397', road: '#bc875e', shoulder: '#a47556', ground: '#947558', rock: '#aa795e', trees: '#777451', density: 0.12 },
    points: points([[0,22,360],[0,24,-40],[200,31,-420],[480,39,-620],[540,44,-880],[180,48,-970],[-340,51,-1080],[-510,53,-1350],[-200,54,-1480],[320,52,-1640],[510,49,-1940],[130,45,-2040],[-410,42,-2180],[-520,41,-2480],[-120,44,-2640],[410,49,-2800],[530,54,-3100],[90,52,-3260],[-400,45,-3560],[-320,36,-3920],[60,28,-4300],[60,24,-4760]]),
  },
  {
    id: 'alpine', number: '04', name: '雪岭关隘', english: 'FROST PASS', level: '专家',
    description: '积雪山口，连续弯道切换，制动和抓地力明显降低。轻踩油门，给每次转向留出余量。',
    roadWidth: 16.8, grip: 0.63, goldSpeed: 21, surface: '压雪冰面', surfaceCode: 'SNOW', weather: '−8°C 多云',
    theme: { sky: '#9aaebc', horizon: '#e4e7e4', fog: '#cbd4d7', road: '#d8dfdc', shoulder: '#bac7cc', ground: '#c5d0cf', rock: '#9baeb6', trees: '#adbeba', density: 0.6 },
    points: points([[0,35,360],[0,36,0],[240,42,-340],[490,50,-530],[450,57,-740],[-40,66,-810],[-490,75,-930],[-510,79,-1180],[-60,84,-1300],[480,89,-1430],[500,93,-1690],[30,97,-1790],[-460,100,-1940],[-500,96,-2210],[-20,90,-2300],[470,85,-2440],[510,79,-2720],[50,74,-2820],[-490,66,-2980],[-460,60,-3260],[50,54,-3420],[440,47,-3680],[190,40,-4040],[-140,36,-4400],[0,33,-4880],[0,32,-5340]]),
  },
  {
    id: 'hangar', number: '05', name: '机库练习场', english: 'HANGAR RUN', level: '入门',
    description: '封闭机库里的宽阔沥青环道，钢梁与暖白顶灯下连接缓弯。绕行一圈回到起终点，练习并排超车和手刹入弯。',
    roadWidth: 26.4, grip: 1.28, goldSpeed: 30, surface: '干燥沥青', surfaceCode: 'ASPHALT', weather: '室内 · 暖白照明',
    theme: { sky: '#4b4d49', horizon: '#62645a', fog: '#646659', road: '#686963', shoulder: '#b2aa84', ground: '#9b9b8e', rock: '#7d837c', trees: '#69705e', density: 0 },
    venue: { kind: 'hangar', height: 24, margin: 27, wall: '#b5b5a2', structure: '#4e625b', accent: '#d2ae4d', light: '#fff1cf' },
    closed: true,
    points: points([[-250,0,160],[-250,0,0],[-250,0,-300],[-170,0,-450],[0,0,-500],[170,0,-450],[250,0,-300],[250,0,0],[250,0,300],[170,0,450],[0,0,500],[-170,0,450],[-250,0,300]]),
  },
  {
    id: 'dome', number: '06', name: '穹顶拉力馆', english: 'RALLY DOME', level: '进阶',
    description: '带阶梯看台的全封闭赛事馆，压实红土环道串联回头弯与内收 S 弯。大跨度拱形顶棚下争抢出弯位置，绕行一圈冲线。',
    roadWidth: 21.6, grip: 1.02, goldSpeed: 25, surface: '压实红土', surfaceCode: 'CLAY', weather: '室内 · 赛事照明',
    theme: { sky: '#474c4e', horizon: '#676a62', fog: '#706e61', road: '#b8956c', shoulder: '#c6b79b', ground: '#86887c', rock: '#737872', trees: '#69705e', density: 0 },
    venue: { kind: 'dome', height: 22, margin: 34, wall: '#9faaa3', structure: '#465a58', accent: '#b76346', light: '#fff4dc' },
    closed: true,
    points: points([[-340,0,200],[-340,0,40],[-340,0,-200],[-280,0,-420],[-120,0,-500],[130,0,-470],[290,0,-350],[270,0,-190],[70,0,-110],[30,0,30],[230,0,130],[280,0,270],[190,0,430],[-30,0,490],[-260,0,430],[-340,0,340]]),
  },
  {
    id: 'depot', number: '07', name: '货运仓储馆', english: 'DEPOT SPRINT', level: '专家',
    description: '低顶仓储场馆，混凝土闭环赛道上的连续紧弯考验刹车和反打。穿过货架与黄黑标线围绕的技术弯，回到共用起终点。',
    roadWidth: 16.8, grip: 0.82, goldSpeed: 23, surface: '磨光混凝土', surfaceCode: 'CONCRETE', weather: '室内 · 工业照明',
    theme: { sky: '#414743', horizon: '#60665b', fog: '#616858', road: '#85867a', shoulder: '#b9ae7d', ground: '#686e64', rock: '#81877c', trees: '#69705e', density: 0 },
    venue: { kind: 'depot', height: 12, margin: 25, wall: '#a0a491', structure: '#5e695b', accent: '#d2b253', light: '#efefdc' },
    closed: true,
    points: points([[-310,0,180],[-310,0,30],[-310,0,-200],[-250,0,-390],[-90,0,-430],[60,0,-350],[0,0,-220],[110,0,-140],[250,0,-210],[340,0,-120],[290,0,30],[140,0,100],[200,0,230],[120,0,390],[-80,0,430],[-260,0,340],[-310,0,280]]),
  },
  {
    id: 'meadow', number: '08', name: '丘陵牧场', english: 'MEADOW HILLS', level: '标准',
    description: '起伏草坡间的宽阔砂石路，三处圆顶土坡提供初次飞跃体验。低速贴地通过，加速迎坡自然腾空。',
    roadWidth: 26.4, grip: 1.16, goldSpeed: 35, surface: '丘陵砂石', surfaceCode: 'ROLLING GRAVEL', weather: '20°C 晴',
    scenery: { trees: 'broadleaf' },
    theme: { sky: '#93b3bf', horizon: '#e5dec4', fog: '#bdc6ab', road: '#caba90', shoulder: '#aaa075', ground: '#81935e', rock: '#93917d', trees: '#637d48', density: 0.38 },
    points: points([[0,24,360],[0,24,120],[0,27,-280],[0,32,-680],[130,40,-1020],[260,35,-1280],[260,28,-1660],[260,27,-2080],[120,38,-2420],[-110,49,-2680],[-110,40,-3080],[-110,28,-3480],[0,24,-3840],[0,24,-4220]]),
    jumps: [
      { distance: 600, height: 4.5, approach: 34, landing: 42 },
      { distance: 2140, height: 5, approach: 36, landing: 44 },
      { distance: 3620, height: 5.5, approach: 38, landing: 46 },
    ],
  },
  {
    id: 'quarry', number: '09', name: '砂岩采石场', english: 'QUARRY RUN', level: '进阶',
    description: '赭色采石场里上下穿行，四处土坡连接高低平台与制动弯。起跳前摆正车头，预留落地后的刹车距离。',
    roadWidth: 24, grip: 0.98, goldSpeed: 32, surface: '砂岩碎石', surfaceCode: 'QUARRY GRAVEL', weather: '27°C 干燥',
    scenery: { mountains: 'mesa' },
    theme: { sky: '#9aadb5', horizon: '#e8d4ad', fog: '#c7b699', road: '#c59b6b', shoulder: '#ac855e', ground: '#a58c64', rock: '#ae8a63', trees: '#7d8057', density: 0.1 },
    points: points([[0,26,360],[0,26,100],[0,36,-300],[0,50,-700],[290,65,-940],[420,58,-1240],[420,40,-1620],[420,33,-2020],[70,52,-2280],[-290,70,-2500],[-290,53,-2920],[-290,31,-3320],[0,44,-3640],[170,56,-3900],[170,42,-4260],[170,30,-4700],[170,30,-5300]]),
    jumps: [
      { distance: 600, height: 6.5, approach: 38, landing: 48 },
      { distance: 2220, height: 7, approach: 40, landing: 50 },
      { distance: 3880, height: 7.5, approach: 42, landing: 52 },
      { distance: 5340, height: 7, approach: 38, landing: 50 },
    ],
  },
  {
    id: 'skyline', number: '10', name: '云脊飞跃', english: 'SKYLINE CREST', level: '专家',
    description: '沿高山脊线连续爬升和俯冲，四处大落差坡顶考验起跳速度。高速飞跃距离更长，入坡前先选好落地点。',
    roadWidth: 21.6, grip: 0.88, goldSpeed: 30, surface: '山脊碎石', surfaceCode: 'RIDGE GRAVEL', weather: '11°C 高云',
    theme: { sky: '#7d9ba9', horizon: '#dde1d3', fog: '#becac8', road: '#c4bca3', shoulder: '#a5a48d', ground: '#7b8972', rock: '#929c93', trees: '#64765f', density: 0.32 },
    points: points([[0,42,360],[0,42,100],[0,56,-360],[0,82,-780],[-310,102,-1090],[-430,118,-1360],[-430,108,-1770],[-430,90,-2180],[-50,70,-2480],[290,92,-2750],[290,120,-3160],[290,135,-3590],[0,116,-3920],[-160,85,-4180],[-160,62,-4580],[-160,44,-5040],[-160,42,-5640]]),
    jumps: [
      { distance: 560, height: 8, approach: 42, landing: 54 },
      { distance: 2480, height: 9, approach: 44, landing: 58 },
      { distance: 4220, height: 10, approach: 46, landing: 60 },
      { distance: 5980, height: 9, approach: 42, landing: 58 },
    ],
  },
  ...ENDURANCE_STAGES,
  ...ADVENTURE_STAGES,
];
export const DOWNHILL_STAGE: StageDefinition = {
  id: 'ridge-descent', number: 'DH01', name: '云脊速降', english: 'RIDGELINE DESCENT', level: '标准', downhill: true,
  description: '从山脊沿柏油公路一路滑向谷底，落差 260 米。连续长弯连接急弯，直道收身，入弯提前减速。',
  roadWidth: 14.4, grip: 1.3, goldSpeed: 17.5, surface: '细粒柏油', surfaceCode: 'ASPHALT', weather: '18°C 山风',
  theme: { sky: '#739da9', horizon: '#f1dfbd', fog: '#bacabd', road: '#697277', shoulder: '#b6ab89', ground: '#74866b', rock: '#8c9588', trees: '#4d6c5a', density: 0.55 },
  points: points([[0,300,360],[0,280,-80],[130,259,-490],[360,237,-840],[400,217,-1210],[110,195,-1540],[-240,174,-1810],[-380,151,-2180],[-140,128,-2540],[230,106,-2860],[360,84,-3250],[120,61,-3650],[0,40,-4090]]),
};
export const DOWNHILL_STAGES: readonly StageDefinition[] = [
  DOWNHILL_STAGE,
  {
    id: 'bamboo-descent', number: 'DH02', name: '青岚林道', english: 'JADE FOREST', level: '入门', downhill: true,
    description: '青翠林间的宽路缓坡，落差 150 米。舒展的 S 弯留足转向空间，适合练习收身与脚刹。',
    roadWidth: 19.2, grip: 1.42, goldSpeed: 14, surface: '平整柏油', surfaceCode: 'ASPHALT', weather: '21°C 晨光',
    theme: { sky: '#93b9b0', horizon: '#e8ecd3', fog: '#c1d5b5', road: '#707b77', shoulder: '#a8b48c', ground: '#729568', rock: '#89947e', trees: '#3f7453', density: 0.85 },
    points: points([[0,195,360],[0,180,-40],[70,165,-440],[170,150,-820],[210,135,-1220],[100,120,-1620],[-70,105,-2010],[-150,90,-2400],[-90,75,-2800],[30,60,-3200],[30,45,-3620]]),
  },
  {
    id: 'sunset-descent', number: 'DH03', name: '落日山麓', english: 'SUNSET FOOTHILLS', level: '标准', downhill: true,
    description: '暖金草坡下的高速长弯，落差 300 米。长直道适合收身追赶，终段连续弯前要提前站起减速。',
    roadWidth: 16.8, grip: 1.3, goldSpeed: 19, surface: '干燥柏油', surfaceCode: 'ASPHALT', weather: '24°C 夕照',
    theme: { sky: '#ba9f94', horizon: '#ffddaa', fog: '#d9bba0', road: '#716c70', shoulder: '#c5ab7a', ground: '#a59a65', rock: '#b29b83', trees: '#787954', density: 0.22 },
    points: points([[0,345,360],[0,320,-120],[20,295,-620],[130,270,-1130],[330,245,-1580],[410,220,-2060],[220,195,-2500],[-70,170,-2920],[-270,145,-3350],[-190,120,-3800],[120,95,-4170],[230,70,-4610],[40,45,-5080]]),
  },
  {
    id: 'maple-descent', number: 'DH04', name: '枫谷回旋', english: 'AMBER SWITCHBACKS', level: '进阶', downhill: true,
    description: '秋色山谷里接连反向的技术弯，落差 280 米。短直道后立即换边，适合灵活板型练习扶地刹滑。',
    roadWidth: 14.4, grip: 1.24, goldSpeed: 16.5, surface: '山路柏油', surfaceCode: 'ASPHALT', weather: '17°C 秋晴',
    theme: { sky: '#91a7ad', horizon: '#f1dfbe', fog: '#c8bea2', road: '#706d66', shoulder: '#c39c70', ground: '#a28b60', rock: '#97877a', trees: '#ac6945', density: 0.7 },
    points: points([[0,325,360],[0,305,0],[200,285,-350],[450,265,-610],[370,245,-920],[-30,225,-1070],[-410,205,-1290],[-450,185,-1610],[-50,165,-1780],[390,145,-1980],[440,125,-2310],[40,105,-2480],[-340,85,-2720],[-210,65,-3080],[0,45,-3520]]),
  },
  {
    id: 'canyon-descent', number: 'DH05', name: '赤壁天路', english: 'RED CLIFF DROP', level: '专家', downhill: true,
    description: '赭红岩壁间的陡降公路，落差 390 米。窄路快弯与大幅折返交错，长直道末端需要果断制动。',
    roadWidth: 12, grip: 1.17, goldSpeed: 19, surface: '粗粒柏油', surfaceCode: 'ASPHALT', weather: '29°C 干热',
    theme: { sky: '#9bafba', horizon: '#f1cfad', fog: '#d5b398', road: '#696465', shoulder: '#bb8c65', ground: '#ad825e', rock: '#bd7857', trees: '#8b8258', density: 0.08 },
    points: points([[0,435,360],[0,405,-90],[90,375,-530],[390,345,-850],[510,315,-1190],[190,285,-1390],[-310,255,-1580],[-490,225,-1910],[-190,195,-2230],[300,165,-2440],[490,135,-2800],[180,105,-3180],[-130,75,-3600],[0,45,-4080]]),
  },
  {
    id: 'mist-descent', number: 'DH06', name: '雾岭长降', english: 'MIST RIDGE ENDURO', level: '耐力', downhill: true,
    description: '冷色高山林带中的长距离速降，落差 480 米。湿润柏油抓地较低，连续长弯考验控速与路线规划。',
    roadWidth: 14.4, grip: 1.06, goldSpeed: 18, surface: '微湿柏油', surfaceCode: 'ASPHALT', weather: '12°C 山雾',
    theme: { sky: '#8196a9', horizon: '#d0dce1', fog: '#aebec9', road: '#616d79', shoulder: '#9da9a0', ground: '#718782', rock: '#89969d', trees: '#49685f', density: 0.6 },
    points: points([[0,525,360],[0,495,-120],[150,465,-560],[400,435,-970],[460,405,-1430],[170,375,-1830],[-250,345,-2180],[-470,315,-2600],[-290,285,-3050],[120,255,-3430],[410,225,-3860],[330,195,-4320],[-40,165,-4720],[-380,135,-5120],[-310,105,-5600],[-60,75,-6040],[0,45,-6540]]),
  },
  ...ENDURANCE_DOWNHILL_STAGES,
];
export const stageDrop = (stage: StageDefinition) => Math.round(stage.points[0].y - stage.points[stage.points.length - 1].y);
export const getStage = (id: unknown): StageDefinition => DOWNHILL_STAGES.find(stage => stage.id === id) ?? STAGES.find(stage => stage.id === id) ?? STAGES[1];

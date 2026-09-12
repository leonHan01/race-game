export type StageId = 'pine' | 'valley' | 'canyon' | 'alpine' | 'hangar' | 'dome' | 'depot';
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
];
export const getStage = (id: unknown): StageDefinition => STAGES.find(stage => stage.id === id) ?? STAGES[1];

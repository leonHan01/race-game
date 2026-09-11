export type StageId = 'pine' | 'valley' | 'canyon' | 'alpine';
export interface StageDefinition {
  id: StageId; number: string; name: string; english: string; level: string; description: string;
  roadWidth: number; grip: number; goldSpeed: number; surface: string; surfaceCode: string; weather: string;
  theme: { sky: string; horizon: string; fog: string; road: string; shoulder: string; ground: string; rock: string; trees: string; density: number };
  points: readonly { x: number; y: number; z: number }[];
}
const points = (values: number[][]) => values.map(([x, y, z]) => ({ x, y, z }));
export const STAGES: readonly StageDefinition[] = [
  {
    id: 'valley', number: '01', name: '绿谷短途', english: 'GREEN VALLEY', level: '入门',
    description: '宽阔的压实砂石路，缓弯与长直道交替。适合练习刹车点，熟悉手动转向。',
    roadWidth: 15, grip: 1.2, goldSpeed: 34, surface: '压实砂石', surfaceCode: 'HARDPACK', weather: '22°C 晴',
    theme: { sky: '#8faeb8', horizon: '#dedcc4', fog: '#c2cbb2', road: '#caba92', shoulder: '#a7a277', ground: '#829267', rock: '#90917d', trees: '#718354', density: 0.55 },
    points: points([[0,22,180],[0,22,0],[35,23,-180],[90,24,-350],[110,25,-530],[45,26,-710],[-45,26,-900],[-90,25,-1090],[-55,24,-1290],[20,23,-1490],[30,22,-1720]]),
  },
  {
    id: 'pine', number: '02', name: '松岭山道', english: 'PINE RIDGE', level: '标准',
    description: '从松林攀上山脊，连续 S 弯与下坡连接。提前收油，控制入弯速度，再争取出弯加速。',
    roadWidth: 11, grip: 1, goldSpeed: 31, surface: '松散砂石', surfaceCode: 'GRAVEL', weather: '16°C 晴',
    theme: { sky: '#6e8f9a', horizon: '#d8ceb0', fog: '#b7b9a7', road: '#d5bc95', shoulder: '#aa9875', ground: '#66715a', rock: '#788278', trees: '#536447', density: 1 },
    points: points([[0,22,180],[0,23,30],[45,30,-155],[160,39,-300],[220,46,-440],[150,52,-560],[-30,64,-630],[-180,68,-760],[-195,60,-920],[-50,49,-1040],[145,43,-1110],[200,42,-1240],[75,55,-1350],[-100,69,-1380],[-205,83,-1500],[-90,91,-1640],[105,86,-1780],[190,72,-1970],[100,57,-2130],[-70,44,-2250],[-110,33,-2450],[0,26,-2650],[30,24,-2820]]),
  },
  {
    id: 'canyon', number: '03', name: '赤岩峡谷', english: 'RED CANYON', level: '进阶',
    description: '红土峡谷中的窄路和急弯。高速段后接折返，抓地力较低，反打与刹车时机更重要。',
    roadWidth: 9, grip: 0.83, goldSpeed: 26, surface: '浮土碎石', surfaceCode: 'LOOSE DIRT', weather: '31°C 干燥',
    theme: { sky: '#96a6ad', horizon: '#ecd3ae', fog: '#cfb397', road: '#bc875e', shoulder: '#a47556', ground: '#947558', rock: '#aa795e', trees: '#777451', density: 0.12 },
    points: points([[0,22,180],[0,24,-20],[100,31,-210],[240,39,-310],[270,44,-440],[90,48,-485],[-170,51,-540],[-255,53,-675],[-100,54,-740],[160,52,-820],[255,49,-970],[65,45,-1020],[-205,42,-1090],[-260,41,-1240],[-60,44,-1320],[205,49,-1400],[265,54,-1550],[45,52,-1630],[-200,45,-1780],[-160,36,-1960],[30,28,-2150],[30,24,-2380]]),
  },
  {
    id: 'alpine', number: '04', name: '雪岭关隘', english: 'FROST PASS', level: '专家',
    description: '积雪山口，狭窄弯道连续切换，制动和抓地力明显降低。轻踩油门，给每次转向留出余量。',
    roadWidth: 8, grip: 0.63, goldSpeed: 21, surface: '压雪冰面', surfaceCode: 'SNOW', weather: '−8°C 多云',
    theme: { sky: '#9aaebc', horizon: '#e4e7e4', fog: '#cbd4d7', road: '#d8dfdc', shoulder: '#bac7cc', ground: '#c5d0cf', rock: '#9baeb6', trees: '#adbeba', density: 0.6 },
    points: points([[0,35,180],[0,36,0],[120,42,-170],[245,50,-265],[225,57,-370],[-20,66,-405],[-245,75,-465],[-255,79,-590],[-30,84,-650],[240,89,-715],[250,93,-845],[15,97,-895],[-230,100,-970],[-250,96,-1105],[-10,90,-1150],[235,85,-1220],[255,79,-1360],[25,74,-1410],[-245,66,-1490],[-230,60,-1630],[25,54,-1710],[220,47,-1840],[95,40,-2020],[-70,36,-2200],[0,33,-2440],[0,32,-2670]]),
  },
];
export const getStage = (id: unknown): StageDefinition => STAGES.find(stage => stage.id === id) ?? STAGES[1];

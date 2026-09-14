export type VehicleMode = 'car' | 'motorcycle' | 'longboard';
export type VehicleId = 'falcon' | 'swift' | 'comet' | 'nomad' | 'thunder' | 'vortex' | 'summit' | 'apex' | 'trail' | 'longboard' | 'breeze' | 'needle' | 'switchblade' | 'carbon' | 'endurance';
export interface BoardDefinition {
  shape: 'drop-through' | 'pintail' | 'cutaway' | 'race';
  length: number; width: number; wheelbase: number; wheelRadius: number;
  deckColor: string; wheelColor: string;
}
export interface VehicleDefinition {
  id: VehicleId; mode: VehicleMode; name: string; type: string; drive: 'FWD' | 'AWD' | 'RWD' | 'GRAVITY'; body: 'hatch' | 'coupe' | 'truck' | 'muscle' | 'supercar' | 'suv' | 'motorcycle' | 'longboard';
  description: string; power: number; weight: number; topSpeed: number;
  acceleration: number; braking: number; steering: number; grip: number; drift: number; durability: number; offroadDrag: number;
  scale: readonly [number, number, number];
  board?: BoardDefinition;
}
export const VEHICLES: readonly VehicleDefinition[] = [
  { id: 'swift', mode: 'car', name: 'SWIFT F2', type: '前驱小钢炮', drive: 'FWD', body: 'hatch',
    description: '轻巧、抓地力强、甩尾温和。适合入门与狭窄弯道。', power: 210, weight: 1050, topSpeed: 220,
    acceleration: 13, braking: 36, steering: 1.1, grip: 1.22, drift: 0.64, durability: 0.9, offroadDrag: 1.12, scale: [0.91,0.95,0.9] },
  { id: 'falcon', mode: 'car', name: 'FALCON R4', type: '四驱拉力车', drive: 'AWD', body: 'hatch',
    description: '加速、转向与漂移均衡。能适应所有赛段的全能赛车。', power: 300, weight: 1230, topSpeed: 250,
    acceleration: 14, braking: 34, steering: 1, grip: 1, drift: 1, durability: 1, offroadDrag: 1, scale: [1,1,1] },
  { id: 'comet', mode: 'car', name: 'COMET RS', type: '后驱拉力跑车', drive: 'RWD', body: 'coupe',
    description: '加速迅猛、车尾活跃、反应敏捷。大角度漂移需要及时反打。', power: 380, weight: 1180, topSpeed: 250,
    acceleration: 17, braking: 35, steering: 1.08, grip: 0.8, drift: 1.25, durability: 0.82, offroadDrag: 1.18, scale: [1.04,0.84,1.13] },
  { id: 'nomad', mode: 'car', name: 'NOMAD T4', type: '四驱越野皮卡', drive: 'AWD', body: 'truck',
    description: '耐损、擅长路肩行驶。车身较重，转向较慢，需要提前减速。', power: 340, weight: 1780, topSpeed: 210,
    acceleration: 11.5, braking: 29, steering: 0.78, grip: 1.1, drift: 0.8, durability: 1.8, offroadDrag: 0.65, scale: [1.08,1.16,1.17] },
  { id: 'thunder', mode: 'car', name: 'THUNDER V8', type: '复古后驱肌肉车', drive: 'RWD', body: 'muscle',
    description: '长车头、四圆灯与双赛车条纹。直线加速强劲，甩尾幅度大，重车身需要提前制动与反打。', power: 460, weight: 1560, topSpeed: 245,
    acceleration: 16, braking: 30, steering: 0.88, grip: 0.76, drift: 1.48, durability: 1.18, offroadDrag: 1.28, scale: [1.06,0.94,1.16] },
  { id: 'vortex', mode: 'car', name: 'VORTEX GT', type: '中置后驱赛道超跑', drive: 'RWD', body: 'supercar',
    description: '低伏座舱、侧进气与高尾翼。加速和制动出色，铺装路面抓地强；驶入路肩会明显减速。', power: 540, weight: 1120, topSpeed: 250,
    acceleration: 19.2, braking: 41, steering: 1.16, grip: 1.28, drift: 0.82, durability: 0.68, offroadDrag: 1.55, scale: [1.08,0.8,1.14] },
  { id: 'summit', mode: 'car', name: 'SUMMIT X4', type: '四驱远征 SUV', drive: 'AWD', body: 'suv',
    description: '方正高顶、车顶行李架与越野护板。耐损、抓地稳定，路肩速度损失小，急弯需要更早收油。', power: 320, weight: 1960, topSpeed: 200,
    acceleration: 10.8, braking: 28, steering: 0.74, grip: 1.18, drift: 0.68, durability: 2.05, offroadDrag: 0.46, scale: [1.06,1.13,1.09] },
  { id: 'apex', mode: 'motorcycle', name: 'APEX R600', type: '赛道运动摩托', drive: 'RWD', body: 'motorcycle',
    description: '低伏骑姿、迅猛加速、灵敏压弯。适合场馆与快弯，注意提前制动。', power: 128, weight: 190, topSpeed: 250,
    acceleration: 21.5, braking: 39, steering: 1.25, grip: 1.12, drift: 0.5, durability: 0.62, offroadDrag: 1.05, scale: [1,1,1] },
  { id: 'trail', mode: 'motorcycle', name: 'TRAIL X450', type: '越野拉力摩托', drive: 'RWD', body: 'motorcycle',
    description: '高车把、越野轮胎、轻盈车身。路肩损耗更低，擅长山野与连续弯道。', power: 62, weight: 155, topSpeed: 215,
    acceleration: 18.8, braking: 36, steering: 1.38, grip: 1.2, drift: 0.64, durability: 0.95, offroadDrag: 0.5, scale: [1,1.06,1.02] },
];
export const LONGBOARD: VehicleDefinition = {
  id: 'longboard', mode: 'longboard', name: 'RIDGELINE DH', type: '速降长板', drive: 'GRAVITY', body: 'longboard',
  description: '低重心落差板，软质大轮。蹬地起步，压低身体减少风阻，入弯前脚刹或横板减速。',
  power: 0, weight: 4.8, topSpeed: 270, acceleration: 3.2, braking: 5.2, steering: 1.35,
  grip: 1.3, drift: 1.1, durability: 0.8, offroadDrag: 2.2, scale: [1, 1, 1],
  board: { shape: 'drop-through', length: 1.3, width: 0.4, wheelbase: 0.92, wheelRadius: 0.055, deckColor: '#c08c52', wheelColor: '#e4b565' },
};
export const LONGBOARDS: readonly VehicleDefinition[] = [
  LONGBOARD,
  { id: 'breeze', mode: 'longboard', name: 'BREEZE CR42', type: '巡航尖尾板', drive: 'GRAVITY', body: 'longboard',
    description: '修长尖尾板面，转向温和、抓地充足。蹬地轻快，适合宽路缓坡和初次速降。',
    power: 0, weight: 4.1, topSpeed: 270, acceleration: 3.8, braking: 5.8, steering: 1.22,
    grip: 1.48, drift: 0.86, durability: 0.9, offroadDrag: 2.1, scale: [0.96, 1, 1.06],
    board: { shape: 'pintail', length: 1.38, width: 0.38, wheelbase: 0.96, wheelRadius: 0.058, deckColor: '#569b88', wheelColor: '#edc98b' } },
  { id: 'needle', mode: 'longboard', name: 'NEEDLE DH36', type: '短轴竞速板', drive: 'GRAVITY', body: 'longboard',
    description: '紧凑切角板面与短轴距，转向反应最快。连续 S 弯更灵活，高速时需要细调方向。',
    power: 0, weight: 3.9, topSpeed: 270, acceleration: 4, braking: 5.4, steering: 1.62,
    grip: 1.24, drift: 1.18, durability: 0.72, offroadDrag: 2.35, scale: [0.9, 1, 0.91],
    board: { shape: 'cutaway', length: 1.18, width: 0.36, wheelbase: 0.8, wheelRadius: 0.052, deckColor: '#649bc6', wheelColor: '#9fdccc' } },
  { id: 'switchblade', mode: 'longboard', name: 'SWITCHBLADE FR', type: '双向自由滑板', drive: 'GRAVITY', body: 'longboard',
    description: '对称双向板面，滑动减速更强、转向灵活。适合扶地刹滑、站滑与 Switch 技巧衔接。',
    power: 0, weight: 4.4, topSpeed: 270, acceleration: 3.5, braking: 5.5, steering: 1.48,
    grip: 1.14, drift: 1.42, durability: 0.84, offroadDrag: 2.2, scale: [1.05, 1, 0.97],
    board: { shape: 'drop-through', length: 1.26, width: 0.42, wheelbase: 0.86, wheelRadius: 0.053, deckColor: '#a178b2', wheelColor: '#dc9bab' } },
  { id: 'carbon', mode: 'longboard', name: 'CARBON AERO', type: '碳纤维竞速板', drive: 'GRAVITY', body: 'longboard',
    description: '硬朗竞速板面，长轴距让转向更沉稳。适合长直道冲刺，急弯前需要提早制动。',
    power: 0, weight: 4.2, topSpeed: 270, acceleration: 3.1, braking: 4.9, steering: 1.16,
    grip: 1.38, drift: 0.98, durability: 0.76, offroadDrag: 2.3, scale: [1, 1, 1.03],
    board: { shape: 'race', length: 1.34, width: 0.4, wheelbase: 1, wheelRadius: 0.061, deckColor: '#34434f', wheelColor: '#de744f' } },
  { id: 'endurance', mode: 'longboard', name: 'ATLAS ENDURANCE', type: '长途稳定板', drive: 'GRAVITY', body: 'longboard',
    description: '加宽落差板面、强抓地大轮与更高耐损。制动扎实，转向较慢，适合长距离山路。',
    power: 0, weight: 5.2, topSpeed: 270, acceleration: 2.9, braking: 6.2, steering: 1.12,
    grip: 1.52, drift: 0.94, durability: 1.15, offroadDrag: 1.9, scale: [1.15, 1, 1.08],
    board: { shape: 'cutaway', length: 1.4, width: 0.46, wheelbase: 1.02, wheelRadius: 0.06, deckColor: '#c49458', wheelColor: '#729c83' } },
];
export const getVehicle = (id: unknown): VehicleDefinition => LONGBOARDS.find(vehicle => vehicle.id === id) ?? VEHICLES.find(vehicle => vehicle.id === id) ?? VEHICLES[1];

/** Conservative footprint for course barriers and venue walls at any heading. */
export const vehicleClearance = (vehicle: VehicleDefinition) => Math.hypot(
  (vehicle.mode === 'longboard' ? 0.32 : vehicle.mode === 'motorcycle' ? 0.58 : 1.25) * vehicle.scale[0],
  (vehicle.mode === 'longboard' ? 0.7 : vehicle.mode === 'motorcycle' ? 1.55 : 2.35) * vehicle.scale[2],
);
export const roadMargin = (vehicle: VehicleDefinition) => vehicle.mode !== 'car' ? 0.3 : 0.95;

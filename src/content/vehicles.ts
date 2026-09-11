export type VehicleId = 'falcon' | 'swift' | 'comet' | 'nomad';
export interface VehicleDefinition {
  id: VehicleId; name: string; type: string; drive: 'FWD' | 'AWD' | 'RWD'; body: 'hatch' | 'coupe' | 'truck';
  description: string; power: number; weight: number; topSpeed: number;
  acceleration: number; braking: number; steering: number; grip: number; drift: number; durability: number; offroadDrag: number;
  scale: readonly [number, number, number];
}
export const VEHICLES: readonly VehicleDefinition[] = [
  { id: 'swift', name: 'SWIFT F2', type: '前驱小钢炮', drive: 'FWD', body: 'hatch',
    description: '轻巧、抓地力强、甩尾温和。适合入门与狭窄弯道。', power: 210, weight: 1050, topSpeed: 220,
    acceleration: 13, braking: 36, steering: 1.1, grip: 1.22, drift: 0.64, durability: 0.9, offroadDrag: 1.12, scale: [0.91,0.95,0.9] },
  { id: 'falcon', name: 'FALCON R4', type: '四驱拉力车', drive: 'AWD', body: 'hatch',
    description: '加速、转向与漂移均衡。能适应所有赛段的全能赛车。', power: 300, weight: 1230, topSpeed: 250,
    acceleration: 14, braking: 34, steering: 1, grip: 1, drift: 1, durability: 1, offroadDrag: 1, scale: [1,1,1] },
  { id: 'comet', name: 'COMET RS', type: '后驱拉力跑车', drive: 'RWD', body: 'coupe',
    description: '加速迅猛、车尾活跃、反应敏捷。大角度漂移需要及时反打。', power: 380, weight: 1180, topSpeed: 250,
    acceleration: 17, braking: 35, steering: 1.08, grip: 0.8, drift: 1.25, durability: 0.82, offroadDrag: 1.18, scale: [1.04,0.84,1.13] },
  { id: 'nomad', name: 'NOMAD T4', type: '四驱越野皮卡', drive: 'AWD', body: 'truck',
    description: '耐损、擅长路肩行驶。车身较重，转向较慢，需要提前减速。', power: 340, weight: 1780, topSpeed: 210,
    acceleration: 11.5, braking: 29, steering: 0.78, grip: 1.1, drift: 0.8, durability: 1.8, offroadDrag: 0.65, scale: [1.08,1.16,1.17] },
];
export const getVehicle = (id: unknown): VehicleDefinition => VEHICLES.find(vehicle => vehicle.id === id) ?? VEHICLES[1];

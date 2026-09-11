import type { Difficulty } from './simulation/race';
import { getStage, type StageId } from './content/stages';
import { getVehicle, type VehicleId } from './content/vehicles';

export const LIVERIES = [
  { name: '砂岩白', color: '#dedbd0', accent: '#d77c35' },
  { name: '森林绿', color: '#52675a', accent: '#e8c25b' },
  { name: '竞赛红', color: '#ae4133', accent: '#efebe0' },
];
export interface Settings { quality: 'low' | 'standard'; sound: boolean; voice: boolean; autoThrottle: boolean; difficulty: Difficulty; livery: number; camera: number; stageId: StageId; vehicleId: VehicleId }
export const settings: Settings = { quality: 'standard', sound: true, voice: true, autoThrottle: false, difficulty: 'club', livery: 0, camera: 0, stageId: 'pine', vehicleId: 'falcon' };
try {
  const saved: unknown = JSON.parse(localStorage.getItem('dustline-settings') ?? 'null');
  if (saved && typeof saved === 'object') {
    const s = saved as Partial<Settings>;
    if (s.quality === 'low' || s.quality === 'standard') settings.quality = s.quality;
    for (const key of ['sound', 'voice', 'autoThrottle'] as const) if (typeof s[key] === 'boolean') settings[key] = s[key];
    if (s.difficulty === 'club' || s.difficulty === 'pro') settings.difficulty = s.difficulty;
    if (Number.isInteger(s.livery) && s.livery! >= 0 && s.livery! < LIVERIES.length) settings.livery = s.livery!;
    if (s.camera === 0 || s.camera === 1) settings.camera = s.camera;
    settings.stageId = getStage(s.stageId).id;
    settings.vehicleId = getVehicle(s.vehicleId).id;
  }
} catch { /* Storage is optional, including private browsing. */ }
export function saveSettings() { try { localStorage.setItem('dustline-settings', JSON.stringify(settings)); } catch { /* Keep session settings. */ } }
type RecordCategory = Pick<Settings, 'difficulty' | 'autoThrottle'> & Partial<Pick<Settings, 'stageId' | 'vehicleId'>>;
const recordKey = (category: RecordCategory) => `dustline-best-v3-${category.stageId ?? 'pine'}-${category.vehicleId ?? 'falcon'}-${category.difficulty}-${category.autoThrottle ? 'auto' : 'manual'}`;
export function bestTime(category: RecordCategory = settings): number | null {
  try {
    const current = localStorage.getItem(recordKey(category));
    const legacy = (category.stageId ?? 'pine') === 'pine' && (category.vehicleId ?? 'falcon') === 'falcon'
      ? localStorage.getItem(`dustline-best-v2-${category.difficulty}-${category.autoThrottle ? 'auto' : 'manual'}`) : null;
    const n = Number(current ?? legacy);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}
export function saveRecord(time: number, category: RecordCategory = settings): boolean {
  if (!Number.isFinite(time) || time <= 0) return false;
  const best = bestTime(category);
  if (best !== null && time >= best) return false;
  try { localStorage.setItem(recordKey(category), String(time)); } catch { /* Results still work without persistent storage. */ }
  return true;
}

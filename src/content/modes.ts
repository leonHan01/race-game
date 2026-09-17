import { getStage, DOWNHILL_STAGE } from './stages';
import { getVehicle, LONGBOARD } from './vehicles';
export type RaceMode = 'classic' | 'downhill';
export const RACE_MODES: Record<RaceMode, string> = { classic: '经典竞速', downhill: '长板速降' };

/** Car and motorcycle preferences survive a detour into longboard downhill. */
export function raceSelection(mode: RaceMode, stageId: unknown, vehicleId: unknown) {
  const stage = getStage(stageId); const vehicle = getVehicle(vehicleId);
  if (mode === 'downhill') return { stage: stage.downhill ? stage : DOWNHILL_STAGE, vehicle: vehicle.mode === 'longboard' ? vehicle : LONGBOARD };
  return { stage: stage.downhill ? getStage('pine') : stage, vehicle: vehicle.body === 'longboard' ? getVehicle('falcon') : vehicle };
}

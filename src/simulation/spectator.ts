import type { Race } from './race';
import { GHOST_COLORS } from '../content/ghosts';

/** Stable entry order is used for camera selection; standings use live progress. */
export function spectatorEntries(race: Race, elapsed = race.elapsed) {
  return [
    ...race.opponents.cars.map((car, index) => ({
      index, name: `AI · ${car.name}`, color: car.color, position: car.position,
      distance: car.distance, finishTime: car.finishTime,
    })),
    ...race.ghost.replays.map((run, index) => {
      const pose = race.ghost.sample(Math.min(elapsed, run.duration), index)!;
      return { index: index + 5, name: `历史 #${index + 1}`, color: GHOST_COLORS[index],
        position: pose.position, distance: pose.distance,
        finishTime: elapsed >= run.duration ? run.duration : null };
    }),
  ];
}

export function spectatorStandings(race: Race) {
  return spectatorEntries(race).sort((a, b) =>
    a.finishTime !== null && b.finishTime !== null ? a.finishTime - b.finishTime
      : a.finishTime !== null ? -1 : b.finishTime !== null ? 1 : b.distance - a.distance);
}

export function spectatorFocus(race: Race, elapsed = race.elapsed) {
  const entries = spectatorEntries(race, elapsed);
  return entries.find(entry => entry.index === race.spectatorTarget)
    ?? entries.filter(entry => entry.finishTime === null).sort((a, b) => b.distance - a.distance)[0]
    ?? entries[0];
}

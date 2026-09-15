export const DIFFICULTIES = [
  { id: 'easy', name: '简单', description: '抓地更稳，对手更慢，跟车更宽松', grip: 8, pace: 0.74, cornerGrip: 1, acceleration: 0.78, headway: 0.85, laneHold: 1.8 },
  { id: 'medium', name: '中等', description: '均衡抓地与对手节奏', grip: 6.5, pace: 0.91, cornerGrip: 1.2, acceleration: 1, headway: 0.65, laneHold: 1.4 },
  { id: 'hard', name: '困难', description: '高手 AI 精准走线、漂移蓄氮、出弯冲刺', grip: 4, pace: 1.12, cornerGrip: 1.8, acceleration: 1.4, headway: 0.4, laneHold: 0.8 },
] as const;

export type Difficulty = typeof DIFFICULTIES[number]['id'];
export type DifficultyProfile = typeof DIFFICULTIES[number];
export const difficultyProfile = (difficulty: Difficulty): DifficultyProfile => DIFFICULTIES.find(profile => profile.id === difficulty) ?? DIFFICULTIES[1];

/** Keep existing browser preferences when upgrading from the two-level menu. */
export function parseDifficulty(value: unknown): Difficulty {
  if (value === 'easy') return 'easy';
  if (value === 'hard' || value === 'pro') return 'hard';
  return 'medium';
}

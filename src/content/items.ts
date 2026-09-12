export type RaceMode = 'classic' | 'items' | 'downhill';
export type ItemKind = 'boost' | 'banana' | 'disc' | 'homing' | 'shield' | 'lightning';
export const RACE_MODES: Record<RaceMode, string> = { classic: '经典竞速', items: '道具赛', downhill: '长板速降' };
export const ITEMS: Record<ItemKind, { name: string; symbol: string; color: string; description: string }> = {
  boost: { name: '涡轮冲刺', symbol: '»', color: '#68e9ee', description: '持续 3 秒强力加速，刹车和手刹仍优先。' },
  banana: { name: '香蕉陷阱', symbol: '♧', color: '#ffe273', description: '在车后留下香蕉皮，使碰到的车手打滑减速。' },
  disc: { name: '直射飞盘', symbol: '◎', color: '#99ee8b', description: '沿当前车道向前发射，击中前方车手。' },
  homing: { name: '追踪飞盘', symbol: '◉', color: '#ff8c90', description: '追踪前方 180 米内最近的车手；无目标时保留道具。' },
  shield: { name: '能量护盾', symbol: '◇', color: '#91beff', description: '持续 7 秒，抵挡一次飞盘、香蕉或雷电攻击。' },
  lightning: { name: '雷电脉冲', symbol: 'ϟ', color: '#e3acff', description: '使前后 180 米内的其他车手减速。' },
};
export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

/** Rank affects the lottery, never the player's steering or race progress. */
export function rollItem(rank: number, random: number): ItemKind {
  const weights = rank <= 2 ? [12, 34, 22, 4, 27, 1] : rank <= 4 ? [25, 15, 20, 20, 15, 5] : [34, 5, 10, 29, 10, 12];
  let roll = Math.min(0.999999, Math.max(0, random)) * 100;
  for (let i = 0; i < ITEM_KINDS.length; i++) {
    roll -= weights[i];
    if (roll < 0) return ITEM_KINDS[i];
  }
  return 'boost';
}

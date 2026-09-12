import type { Track } from '../simulation/track';

/** Lightweight, static elevation preview; built only when the stage picker opens. */
export function stageElevation(track: Track): string {
  if (!track.hasJumps && !track.definition.downhill) return '';
  const samples = Array.from({ length: 161 }, (_, i) => track.sample(track.length * i / 160).y);
  const min = Math.min(...samples); const max = Math.max(...samples);
  const y = (height: number) => 47 - (height - min) / Math.max(1, max - min) * 32;
  const path = samples.map((height, i) => `${i ? 'L' : 'M'}${(8 + i * 304 / 160).toFixed(1)},${y(height).toFixed(1)}`).join(' ');
  const markers = (track.definition.jumps ?? []).map(crest => `<circle cx="${(8 + crest.distance / track.length * 304).toFixed(1)}" cy="${y(track.sample(crest.distance).y).toFixed(1)}" r="3"/>`).join('');
  const label = track.definition.downhill ? '连续速降 · 海拔剖面' : `起伏飞跃 · ${track.definition.jumps!.length} 处跳台`;
  return `<span class="stage-elevation"><span>${label} <small>高差 ${Math.round(max - min)} M</small></span><svg viewBox="0 0 320 54" role="img" aria-label="${track.definition.downhill ? '从起点到终点的速降海拔变化' : '赛道海拔起伏，圆点标记跳台'}"><path d="${path} L312,54 L8,54 Z" class="elevation-fill"/><path d="${path}" class="elevation-line"/>${markers}</svg></span>`;
}

import type { Track } from '../simulation/track';

export function routeThumbnail(track: Track) {
  const xs = track.points.map(p => p.x); const zs = track.points.map(p => p.z);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  const path = track.points.filter((_, i) => i % 6 === 0 || i === track.points.length - 1).map((p, i) => `${i ? 'L' : 'M'}${20 + (maxZ - p.z) / (maxZ - minZ) * 280},${20 + (p.x - minX) / Math.max(1, maxX - minX) * 60}`).join(' ') + (track.closed ? ' Z' : '');
  const background = track.definition.venue ? '<rect x="8" y="7" width="304" height="86" rx="5" stroke="currentColor" opacity=".2"/><path d="M80 8V92M160 8V92M240 8V92" stroke="currentColor" opacity=".08"/>' : '<path d="M0 80 Q80 10 170 85 T330 40" fill="none" stroke="currentColor" opacity=".12" stroke-width="25"/>';
  const labels = track.closed ? '<text x="15" y="15">START / FINISH</text>' : '<text x="15" y="15">START</text><text x="264" y="96">FINISH</text>';
  return `<svg class="catalog-preview route-preview" viewBox="0 0 320 100" aria-hidden="true">${background}<path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>${labels}</svg>`;
}

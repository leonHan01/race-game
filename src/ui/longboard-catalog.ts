import { DOWNHILL_STAGES, stageDrop } from '../content/stages';
import { LONGBOARDS } from '../content/vehicles';
import { bestTime } from '../settings';
import type { Race } from '../simulation/race';
import { Track } from '../simulation/track';
import { routeThumbnail } from './route-thumbnail';
import { stageElevation } from './stage-elevation';
import { vehicleThumbnail } from './vehicle-thumbnail';

/** Catalogues are built on demand; only the selected course gets a 3D scene. */
export function longboardCatalog(type: 'stage' | 'garage', race: Race, formatTime: (time: number | null) => string) {
  const selecting = race.phase === 'menu';
  const disabled = selecting ? '' : 'disabled';
  const back = `<button class="secondary-button dialog-primary" data-action="close">${selecting ? '返回出发区' : '返回速降'}</button>`;
  if (type === 'stage') return `<span class="eyebrow">DOWNHILL / ${DOWNHILL_STAGES.length} ROUTES</span><h2>选一条，一路向下。</h2>
    <p class="dialog-intro">${selecting ? '林道缓坡、山麓快弯、赤壁陡降。选择地图，挑战不同落差与弯道节奏。' : '当前比赛已暂停；返回主菜单后可切换速降地图。'}</p>
    <div class="catalog-grid">${DOWNHILL_STAGES.map(stage => {
      const track = stage.id === race.stageId ? race.track : new Track(stage);
      const selected = stage.id === race.stageId;
      const best = bestTime({ difficulty: race.difficulty, autoThrottle: race.autoThrottle, stageId: stage.id, vehicleId: race.vehicleId, mode: 'downhill' });
      return `<button class="catalog-card ${selected ? 'selected' : ''}" data-stage="${stage.id}" ${disabled} aria-pressed="${selected}" style="--terrain:${stage.theme.ground};--route:${stage.theme.road}">
        <span class="catalog-top"><span>${stage.number} / ${stage.english}</span><b>${stage.level}</b></span>
        ${routeThumbnail(track)}${stageElevation(track)}<strong>${stage.name}</strong><span class="catalog-description">${stage.description}</span>
        <span class="catalog-specs">${(track.length / 1000).toFixed(2)} KM · 落差 ${stageDrop(stage)} M · ${stage.roadWidth} 米路宽</span>
        <span class="catalog-record">${stage.surface} · ${stage.weather}</span><span class="catalog-record">金牌 ${formatTime(track.length / stage.goldSpeed)} · 当前长板最佳 ${formatTime(best)}</span>
        <span class="catalog-choice">${selected ? '已选择 ✓' : '选择此路线 →'}</span></button>`;
    }).join('')}</div><p class="driver-tip">每条路线设有 5 个顺序计时点。纪录按地图、长板型号、难度和自动蹬地设置分别保存。</p>${back}`;
  return `<span class="eyebrow">DOWNHILL EQUIPMENT / ${LONGBOARDS.length} BOARDS</span><h2>选一块，顺手的板。</h2>
    <p class="dialog-intro">${selecting ? '从巡航尖尾到碳纤维竞速板。比较板长、转向和抓地，搭配你想挑战的山路。' : '当前比赛已暂停；返回主菜单后可更换长板。'}</p>
    <div class="catalog-grid">${LONGBOARDS.map(vehicle => {
      const selected = vehicle.id === race.vehicleId;
      return `<button class="catalog-card vehicle-card ${selected ? 'selected' : ''}" data-vehicle="${vehicle.id}" ${disabled} aria-pressed="${selected}">
        <span class="catalog-top"><span>${vehicle.type}</span><b>GRAVITY</b></span>${vehicleThumbnail(vehicle)}<strong>${vehicle.name}</strong>
        <span class="catalog-description">${vehicle.description}</span><span class="catalog-specs">${vehicle.board!.length.toFixed(2)} M · ${vehicle.weight} KG · 上限 ${vehicle.topSpeed} KM/H</span>
        <span class="vehicle-ratings">${([['转向', vehicle.steering / 1.65], ['抓地', vehicle.grip / 1.55], ['脚刹', vehicle.braking / 6.5]] as const).map(([name, value]) => `<span>${name}<i><em style="width:${Math.min(1, value) * 100}%"></em></i></span>`).join('')}</span>
        <span class="catalog-choice">${selected ? '已选择 ✓' : '使用这块长板 →'}</span></button>`;
    }).join('')}</div><p class="driver-tip">所有板型均支持蹬地、收身、脚刹、扶地刹滑、站滑与 180° Switch。涂装可改变滑手服装与板面饰条；板型和纪录独立保存。</p>${back}`;
}

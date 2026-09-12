import { configureLongboardUI, updateLongboardHUD, longboardDialog } from './longboard-ui';
import type { Race } from '../simulation/race';
import { clamp, SECTORS, Track, type TrackPoint } from '../simulation/track';
import { bestTime, LIVERIES, saveSettings, settings } from '../settings';
import { STAGES } from '../content/stages';
import { VEHICLES, roadMargin, type VehicleMode } from '../content/vehicles';
import { vehicleThumbnail } from './vehicle-thumbnail';
import { stageElevation } from './stage-elevation';
import { routeThumbnail } from './route-thumbnail';
import { ITEMS, ITEM_KINDS, RACE_MODES } from '../content/items';

const icons = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m0-6-6 6"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  mountain: '<path d="m2 19 7-13 4 7 3-5 6 11H2Zm5-9 2 2 2-2"/>',
  reset: '<path d="M4 5v6h6m-6-1a8 8 0 1 1 1 8"/>',
};
export const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
export const formatTime = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return '—:——.——';
  const centiseconds = Math.floor(Math.max(0, seconds) * 100);
  return `${Math.floor(centiseconds / 6000).toString().padStart(2, '0')}:${Math.floor(centiseconds / 100) % 60 < 10 ? '0' : ''}${Math.floor(centiseconds / 100) % 60}.${(centiseconds % 100).toString().padStart(2, '0')}`;
};


export function vehicleModePicker(mode: VehicleMode, disabled = false) {
  return `<div class="vehicle-mode-picker" role="group" aria-label="驾驶模式">${([
    ['car', 'falcon', '汽车模式'], ['motorcycle', 'apex', '摩托车模式'],
  ] as const).map(([value, id, label]) => `<button data-vehicle-mode="${value}" data-vehicle="${id}" aria-pressed="${mode === value}" ${disabled ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
}

export class UI {
  readonly canvas: HTMLCanvasElement;
  readonly dialog: HTMLDialogElement;
  onAction: (action: string) => void = () => {};
  onSetting: () => void = () => {};
  onSelect: (kind: 'stage' | 'vehicle', id: string) => void = () => {};
  private routePath = '';
  private mapPoints: { x: number; y: number }[] = [];
  private mapBounds = { minX: 0, maxZ: 0, width: 1, depth: 1 };
  private mapMarkers = new Map<string, { dot: SVGCircleElement; line: SVGLineElement }>();
  private phase = '';
  private stageFilter: 'all' | 'outdoor' | 'indoor' | 'jumps' = 'all';
  private lastSplit = 0;
  private lastPenalty = 0;
  private nextLeaderboardUpdate = 0;
  private leaderboardHTML = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private cache = new Map<string, HTMLElement>();

  constructor(public track: Track) {
    this.buildMap();
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <canvas id="world" aria-label="松岭山道 3D 拉力赛场景"></canvas>
      <div id="sprint-overlay" class="sprint-overlay" aria-hidden="true" data-active="false">${Array.from({ length: 20 }, (_, i) => `<i style="--angle:${i * 18 + 5}deg;--delay:${-i * 0.071}s;--duration:${0.42 + i % 4 * 0.06}s"></i>`).join('')}</div>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div id="menu-shade" class="menu-shade" aria-hidden="true"></div>
      <header class="topbar">
        <button class="brand" data-action="home" aria-label="尘途拉力，返回主菜单"><span class="brand-mark"><i></i><i></i></span><span>DUSTLINE<small>尘途 · 拉力竞速</small></span></button>
        <div id="menu-nav" class="menu-nav"><span class="nav-active">六车拉力竞速</span><button data-action="stage">选择地图 <span>↗</span></button><button data-action="garage">车库 <span>↗</span></button></div>
        <div class="top-actions"><span id="stage-tag" class="stage-tag"><i></i> OFFLINE RALLY</span><button class="icon-button" id="sound-toggle" data-action="sound" aria-label="关闭声音">${icon('sound')}</button><button class="icon-button" data-action="settings" aria-label="游戏设置">${icon('settings')}</button><button class="icon-button hidden" id="pause-button" data-action="pause" aria-label="暂停比赛">${icon('pause')}</button></div>
      </header>
      <main id="menu" class="menu">
        <section class="hero">
          <div class="eyebrow"><span class="tiny-line"></span> THE RALLY EXPERIENCE <span class="edition">VOL. 01</span></div>
          <h1>DUST &amp;<br><span>GLORY.</span><span class="title-period"></span></h1>
          <h2>越过尘土，驶向山野。</h2>
          ${vehicleModePicker(VEHICLES.find(vehicle => vehicle.id === settings.vehicleId)?.mode ?? 'car')}
          <p id="mode-description" class="hero-copy">与 5 位车手同场出发，争夺领先。<br>宽阔赛道，留下你的超车路线。</p>
          <div class="mode-picker" role="group" aria-label="比赛模式"><button data-action="mode-classic" aria-pressed="true"><span>经典竞速</span><small>PURE RACING</small></button><button data-action="mode-items" aria-pressed="false"><span>✦ 道具赛</span><small>ITEM RUSH / 6 道具</small></button><button data-action="mode-downhill" aria-pressed="false"><span>长板速降</span><small>LONGBOARD / DOWNHILL</small></button></div>
          <div class="start-row"><button id="start-button" class="primary-button" data-action="start"><span><span id="start-label">开始赛段</span> <small>START YOUR ENGINE</small></span>${icon('arrow')}</button><button class="help-button" data-action="controls"><span class="key-cap">?</span> 驾驶指南</button></div>
          <div class="selection-actions"><button data-action="stage">选择地图 <span id="selected-stage">${STAGES.length} 个赛段 ↗</span></button><button data-action="garage"><span id="vehicle-selection-label">选择车辆</span> <span id="selected-vehicle">${VEHICLES.length} 种车型 ↗</span></button></div>
        </section>
        <aside class="car-caption"><span class="eyebrow">YOUR MACHINE / 07</span><strong id="car-name">FALCON R4</strong><span id="car-spec" class="car-spec"></span><div class="livery-picker" aria-label="选择赛车涂装">${LIVERIES.map((livery, i) => `<button class="livery-swatch ${i === settings.livery ? 'selected' : ''}" data-livery="${i}" style="--swatch:${livery.color}" aria-label="${livery.name}" aria-pressed="${i === settings.livery}"></button>`).join('')}<span id="livery-name">${LIVERIES[settings.livery].name}</span></div></aside>
        <section class="stage-strip"><div class="stage-name"><span id="stage-number" class="stage-number">02</span><div><span class="eyebrow">SPECIAL STAGE</span><h3 id="stage-name">松岭山道</h3><p id="stage-summary"></p></div></div><div class="stage-map">${this.mapSVG('preview-map')}</div><div class="stage-stats"><div><span>赛段距离</span><strong id="stage-length">${(track.length / 1000).toFixed(2)} <small>KM</small></strong></div><div><span>路面类型</span><strong id="stage-surface"></strong></div><div><span>地图难度</span><strong id="stage-level"></strong></div></div><button class="stage-more" data-action="stage" aria-label="查看赛段详情">${icon('arrow')}</button></section>
        <footer class="menu-footer"><span>BUILT FOR THE UNTAMED.</span><span>EST. 2026 <i> / </i> DUSTLINE RALLY CLUB</span></footer>
      </main>
      <section id="hud" class="hud hidden" aria-label="比赛仪表">
        <div class="stage-clock"><span id="hud-stage" class="eyebrow"></span><div id="race-time">00:00.00</div><p>个人最佳 <strong id="best-time">—:——.——</strong></p></div>
        <aside class="race-order" aria-label="实时竞速名次"><span class="eyebrow">POSITION</span><div><strong id="race-rank">6</strong><span> / 6</span></div><ol id="race-leaderboard"></ol></aside>
        <aside id="item-panel" class="item-panel hidden" aria-label="道具栏">
          <button id="item-button" data-action="use-item" disabled aria-label="使用道具，快捷键 E" aria-describedby="item-description">
            <span id="item-symbol" class="item-symbol" aria-hidden="true">?</span><span class="item-copy"><small>ITEM RUSH</small><strong id="item-name">寻找道具箱</strong><span id="item-hint">驶过道路上的 ? 箱</span></span><kbd>E</kbd>
          </button>
          <p id="item-description">收集道具，在合适的时机使用。</p>
          <div id="item-effects" class="item-effects"></div>
          <p id="item-notice" class="item-notice" role="status" aria-live="polite"></p>
        </aside>
        <div class="stage-progress"><div><span>STAGE PROGRESS</span><strong id="progress-label">0%</strong></div><div class="progress-track"><i id="progress-fill"></i>${[1,2,3,4].map(i => `<span style="left:${i * 20}%"></span>`).join('')}</div></div>
        <div id="pace-note" class="pace-note hidden"><div class="pace-symbol" id="pace-arrow">↱</div><div><strong id="pace-grade">4</strong><span id="pace-direction">右弯</span></div><span class="pace-distance" id="pace-distance">100 M</span></div>
        <div class="race-map"><span class="eyebrow"><span id="map-stage-name">PINE RIDGE</span><span id="sector-label">01 / 05</span></span>${this.mapSVG('race-map')}<div class="condition"><span>车辆状态</span><div><i id="condition-fill"></i></div><strong id="condition-label">100%</strong></div></div>
        <div class="speedometer"><div class="rpm-bars">${Array.from({length: 18}, (_, i) => `<i data-rpm="${i}"></i>`).join('')}</div><div class="speed-row"><div class="gear"><small>GEAR</small><strong id="gear">N</strong></div><strong id="speed">000</strong><span>KM/H</span></div><div class="speed-footer"><span id="drive-state">AWD · GRAVEL</span><button data-action="camera" aria-label="切换视角">${icon('camera')}<span id="camera-label">赛道追尾</span><kbd>C</kbd></button></div>
          <button id="nitro-button" class="nitro-button" data-control="Nitro" data-state="empty" aria-label="氮气加速，按住按钮或 Shift" aria-describedby="nitro-status nitro-amount" aria-pressed="false" disabled>
            <span class="nitro-heading"><strong>氮气加速 <kbd>SHIFT</kbd></strong><span id="nitro-amount">0%</span></span>
            <span class="nitro-track" aria-hidden="true"><i id="nitro-fill"></i></span>
            <span id="nitro-status" class="nitro-status">转向漂移积攒氮气</span>
          </button>
          <div class="longboard-actions" aria-label="长板技巧">
            <div class="longboard-action-row"><button id="standup-button" data-control="Standup" aria-label="按住站立式刹滑，快捷键 X" aria-pressed="false"><kbd>X</kbd> 站立刹滑</button><button id="switch-button" data-action="switch-stance" aria-label="180 度滑转切换站姿，双击或长按空格，或按 Q" title="双击空格立即切换；长按 0.6 秒从扶地刹滑转入 Switch；11 km/h 以上可用"><kbd>空格×2 / 长按</kbd> 180° Switch</button></div>
            <div class="longboard-stance-row"><strong id="longboard-stance">REGULAR</strong><span id="longboard-action">左脚在前</span></div>
          </div>
        </div>
        <div class="driving-hint" id="driving-hint"><kbd>W</kbd> 油门 <kbd>S</kbd> 刹车 <kbd>A</kbd><kbd>D</kbd> 转向 <kbd>SPACE</kbd> <span data-brake-hint>漂移蓄能</span> <kbd>SHIFT</kbd> 氮气 <span id="item-key-hint" class="hidden"><kbd>E</kbd> 使用道具</span></div>
        <div class="touch-controls"><div><button data-control="ArrowLeft" aria-label="左转">←</button><button data-control="ArrowRight" aria-label="右转">→</button></div><div><button data-control="Space" class="touch-handbrake" aria-label="手刹">手刹</button><button data-control="ArrowDown" aria-label="刹车">刹车</button><button data-control="ArrowUp" class="touch-throttle" aria-label="油门">油门</button></div></div>
      </section>
      <div id="countdown" class="countdown hidden" role="status"><span>READY TO GET DIRTY?</span><strong id="countdown-number">3</strong><p>六车同场 · 倒计时结束一起发车。</p></div>
      <div id="toast" class="toast hidden" role="status"></div>
      <dialog id="dialog"><button class="dialog-close icon-button" data-action="close" aria-label="关闭弹窗">${icon('close')}</button><div id="dialog-content"></div></dialog>
      <div id="loading" class="loading"><span class="brand-mark"><i></i><i></i></span><strong>准备进入山野</strong><span>正在铺设砂石赛道…</span><div class="loading-bar"></div></div>
      <div id="error" class="error-screen hidden" role="alert"><span class="eyebrow">ENGINE INTERRUPTED</span><h2 id="error-title">图形引擎暂不可用</h2><p id="error-message"></p><button class="primary-button" data-action="reload">重新加载 ${icon('reset')}</button></div>
    `;
    this.canvas = document.querySelector('#world')!; this.dialog = document.querySelector('#dialog')!;
    document.querySelectorAll<HTMLElement>('[id]').forEach(element => this.cache.set(element.id, element));
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLElement>('[data-action]');
      if (button) this.onAction(button.dataset.action!);
      const stage = target?.closest<HTMLButtonElement>('[data-stage]');
      const vehicle = target?.closest<HTMLButtonElement>('[data-vehicle]');
      if (stage && !stage.disabled) this.onSelect('stage', stage.dataset.stage!);
      if (vehicle && !vehicle.disabled && !(vehicle.dataset.vehicleMode && vehicle.getAttribute('aria-pressed') === 'true')) this.onSelect('vehicle', vehicle.dataset.vehicle!);
      const swatch = target?.closest<HTMLElement>('[data-livery]');
      if (swatch) {
        settings.livery = Number(swatch.dataset.livery); saveSettings();
        document.querySelectorAll<HTMLElement>('[data-livery]').forEach(item => { const selected = Number(item.dataset.livery) === settings.livery; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
        this.set('livery-name', LIVERIES[settings.livery].name); this.onSetting();
      }
    });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.onAction('close'); });
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) { const r = this.dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.onAction('close'); } });
    this.updateSound();
  }

  private buildMap() {
    const p = this.track.points;
    const minX = Math.min(...p.map(v => v.x)); const maxX = Math.max(...p.map(v => v.x));
    const minZ = Math.min(...p.map(v => v.z)); const maxZ = Math.max(...p.map(v => v.z));
    this.mapBounds = { minX, maxZ, width: Math.max(1, maxX - minX), depth: Math.max(1, maxZ - minZ) };
    this.mapPoints = p.map(point => this.mapPosition(point));
    this.routePath = this.mapPoints.filter((_, i) => i % 6 === 0 || i === p.length - 1).map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  }
  private mapPosition(point: Pick<TrackPoint, 'x' | 'z'>) {
    const { minX, maxZ, width, depth } = this.mapBounds;
    return { x: 16 + (maxZ - point.z) / depth * 288, y: 17 + (point.x - minX) / width * 70 };
  }

  private updateMap(race: Race) {
    const cars = [{ id: 'player', name: '你', color: '#f1d175', position: race.position }, ...race.opponents.cars];
    const placed: { x: number; y: number }[] = [];
    for (const car of cars) {
      let marker = this.mapMarkers.get(car.id);
      if (!marker) {
        const layer = this.get('race-map').querySelector('[data-map-markers]')!;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        const player = car.id === 'player';
        dot.id = player ? 'map-dot' : `map-${car.id}`;
        dot.setAttribute('r', player ? '5' : '4');
        dot.setAttribute('fill', car.color);
        dot.setAttribute('stroke', player ? '#faf6df' : '#262b24');
        dot.setAttribute('stroke-width', '1.5');
        dot.setAttribute('aria-label', car.name);
        title.textContent = car.name; dot.append(title);
        line.setAttribute('stroke', car.color); line.setAttribute('stroke-width', '1');
        line.setAttribute('opacity', '0.7');
        layer.prepend(line); layer.append(dot);
        marker = { dot, line }; this.mapMarkers.set(car.id, marker);
      }
      const point = this.mapPosition(car.position);
      const x = clamp(point.x, 8, 312); const y = clamp(point.y, 8, 100);
      let markerY = y;
      // Keep a packed starting grid or finish group readable, with lines to the real positions.
      for (let attempt = 0; attempt <= cars.length * 2; attempt++) {
        const candidate = y + Math.ceil(attempt / 2) * 10 * (attempt % 2 ? -1 : 1);
        if (candidate < 8 || candidate > 100) continue;
        if (placed.every(other => Math.hypot(x - other.x, candidate - other.y) >= 10)) {
          markerY = candidate; break;
        }
      }
      placed.push({ x, y: markerY });
      marker.dot.setAttribute('cx', x.toFixed(2)); marker.dot.setAttribute('cy', markerY.toFixed(2));
      marker.line.setAttribute('x1', x.toFixed(2)); marker.line.setAttribute('y1', y.toFixed(2));
      marker.line.setAttribute('x2', x.toFixed(2)); marker.line.setAttribute('y2', markerY.toFixed(2));
      marker.line.style.display = markerY === y ? 'none' : '';
    }
  }

  setSelection(race: Race) {
    this.track = race.track; this.buildMap();
    for (const id of ['preview-map', 'race-map']) {
      this.get(id).outerHTML = this.mapSVG(id); this.cache.delete(id);
    }
    this.cache.delete('map-dot');
    this.mapMarkers.clear(); this.updateMap(race);
    const stage = this.track.definition; const vehicle = race.vehicle;
    document.body.dataset.vehicleMode = vehicle.mode;
    document.querySelectorAll<HTMLButtonElement>('[data-vehicle-mode]').forEach(button => {
      const selected = button.dataset.vehicleMode === vehicle.mode;
      button.setAttribute('aria-pressed', String(selected));
      if (selected) button.dataset.vehicle = vehicle.id;
    });
    const rearBrake = vehicle.mode === 'motorcycle' ? '后刹' : '手刹';
    const brakeButton = document.querySelector<HTMLButtonElement>('.touch-handbrake')!;
    brakeButton.textContent = rearBrake; brakeButton.setAttribute('aria-label', rearBrake);
    const brakeHint = this.get('driving-hint').querySelector('[data-brake-hint]');
    if (brakeHint) brakeHint.textContent = vehicle.mode === 'motorcycle' ? '后刹蓄能' : '漂移蓄能';
    document.body.dataset.raceMode = race.mode;
    document.querySelectorAll<HTMLButtonElement>('.mode-picker button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.action === `mode-${race.mode}`)));
    this.set('start-label', race.mode === 'items' ? '开始道具赛' : '开始赛段');
    this.set('mode-description', race.mode === 'items' ? '冲过道具箱，争抢加速带。六种道具，让每一次超车都有新机会。' : '与 5 位车手同场出发，争夺领先。宽阔赛道，留下你的超车路线。');
    this.set('car-name', vehicle.name);
    this.set('selected-stage', `${stage.name} ↗`); this.set('selected-vehicle', `${vehicle.name} ↗`);
    this.set('car-spec', `${vehicle.type} · ${vehicle.power} HP · ${vehicle.weight.toLocaleString()} KG`);
    this.set('stage-number', stage.number); this.set('stage-name', stage.name);
    this.set('stage-summary', `${stage.english} · ${stage.weather}`);
    this.set('stage-length', `${(this.track.length / 1000).toFixed(2)} KM`);
    this.set('stage-surface', stage.surface); this.set('stage-level', stage.level);
    this.set('hud-stage', `${RACE_MODES[race.mode]} / ${stage.name} · ${vehicle.name}`);
    this.set('map-stage-name', stage.english);
    this.set('best-time', formatTime(bestTime(race)));
    this.canvas.setAttribute('aria-label', `${stage.name} 3D ${vehicle.mode === 'motorcycle' ? '摩托车竞速' : '拉力赛'}场景`);
    configureLongboardUI(race);
  }

  private get(id: string) { return this.cache.get(id) ?? document.getElementById(id)!; }
  private set(id: string, value: string) { const element = this.get(id); if (element.textContent !== value) element.textContent = value; }
  private mapSVG(id: string) {
    const first = this.mapPoints[0]; const last = this.mapPoints[this.mapPoints.length - 1];
    return `<svg id="${id}" viewBox="0 0 320 108" fill="none" aria-label="${this.track.definition.name}赛段路线"><path d="${this.routePath}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${first.x}" cy="${first.y}" r="4" fill="currentColor"/><rect x="${last.x - 4}" y="${last.y - 4}" width="8" height="8" fill="currentColor"/><text x="${first.x}" y="${first.y - 10}" fill="currentColor">S</text><text x="${last.x}" y="${last.y - 10}" fill="currentColor">F</text>${id === 'race-map' ? '<g data-map-markers></g>' : ''}</svg>`;
  }

  ready() { this.get('loading').classList.add('hidden'); }
  error(message: string, title = '图形引擎暂不可用') { this.ready(); this.set('error-title', title); this.set('error-message', message); this.get('error').classList.remove('hidden'); }
  clearError() { this.get('error').classList.add('hidden'); }
  updateSound() {
    this.get('sound-toggle').innerHTML = icon(settings.sound ? 'sound' : 'mute');
    this.get('sound-toggle').setAttribute('aria-label', settings.sound ? '关闭声音' : '开启声音');
    this.get('sound-toggle').setAttribute('aria-pressed', String(settings.sound));
  }
  toast(message: string) {
    clearTimeout(this.toastTimer); this.set('toast', message); this.get('toast').classList.remove('hidden');
    this.toastTimer = setTimeout(() => this.get('toast').classList.add('hidden'), 3000);
  }
  update(race: Race) {
    this.get('sprint-overlay').dataset.active = String(race.phase === 'racing' && race.boosting && !race.isLongboard && !race.airborne);
    if (this.phase !== race.phase) {
      this.phase = race.phase;
      this.nextLeaderboardUpdate = 0;
      const menu = race.phase === 'menu';
      this.get('menu').classList.toggle('hidden', !menu); this.get('menu-shade').classList.toggle('hidden', !menu);
      this.get('menu-nav').classList.toggle('hidden', !menu); this.get('stage-tag').classList.toggle('hidden', !menu);
      this.get('hud').classList.toggle('hidden', menu || race.phase === 'finished');
      this.get('pause-button').classList.toggle('hidden', menu || race.phase === 'finished');
      document.body.dataset.phase = race.phase;
      this.set('best-time', formatTime(bestTime(race)));
      if (race.phase === 'countdown') { this.lastSplit = 0; this.lastPenalty = 0; }
    }
    this.get('countdown').classList.toggle('hidden', race.phase !== 'countdown');
    if (race.phase === 'countdown') this.set('countdown-number', race.countdown > 3 ? '•' : String(Math.ceil(Math.max(0, race.countdown))));
    this.updateItems(race);
    if (race.phase === 'menu') return;
    this.set('race-time', formatTime(race.totalTime));
    const standings = race.standings;
    this.set('race-rank', String(standings.findIndex(row => row.player) + 1));
    if (race.elapsed >= this.nextLeaderboardUpdate) {
      const board = standings.map((row, i) => `<li class="${row.player ? 'is-player' : ''}"><span>${i + 1}</span><i style="background:${row.color}"></i><strong>${row.name}</strong><small>${row.finishTime !== null ? '完赛' : row.player ? '你' : `${Math.round(Math.abs(row.distance - race.distance))} m`}</small></li>`).join('');
      if (this.leaderboardHTML !== board) { this.get('race-leaderboard').innerHTML = board; this.leaderboardHTML = board; }
      this.nextLeaderboardUpdate = race.elapsed + 0.15;
    }
    this.set('speed', Math.round(race.speed * 3.6).toString().padStart(3, '0'));
    const gear = race.gear;
    this.set('gear', gear === 0 ? 'N' : String(gear));
    this.set('progress-label', `${Math.floor(race.progress * 100)}%`);
    this.get('progress-fill').style.width = `${race.progress * 100}%`;
    this.set('sector-label', `0${race.sector} / 05`);
    this.get('condition-fill').style.width = `${race.integrity}%`; this.set('condition-label', `${Math.round(race.integrity)}%`);
    this.get('condition-fill').style.background = race.integrity < 35 ? '#d98365' : '';
    const nitroButton = this.get('nitro-button') as HTMLButtonElement;
    nitroButton.disabled = race.phase !== 'racing';
    nitroButton.dataset.state = race.boosting ? 'boosting' : race.nitroCharging ? 'charging' : race.nitro >= 100 ? 'full' : race.nitro > 0 ? 'ready' : 'empty';
    nitroButton.setAttribute('aria-pressed', String(race.boosting));
    this.set('nitro-amount', `${Math.ceil(race.nitro)}%`);
    this.get('nitro-fill').style.transform = `scaleX(${race.nitro / 100})`;
    this.set('nitro-status', race.phase !== 'racing' ? '比赛开始后可用'
      : race.airborne ? '腾空中 · 落地后加速'
      : race.boosting && race.mode === 'items' && race.items.player.boost > 0 ? '道具冲刺中 · 氮气可保留'
      : race.boosting ? '加速中 · 松开停止'
      : race.nitroCharging ? '漂移蓄能中 +'
      : race.nitro <= 0 ? '转向漂移积攒氮气'
      : race.handbrake ? (race.vehicleMode === 'motorcycle' ? '松开后刹后加速' : '松开手刹后加速')
      : race.nitro >= 100 ? '氮气已满 · 按住释放' : '按住加速 · 漂移补充');
    const sliding = race.driftIntensity > 0.2;
    this.set('drive-state', race.missedCheckpoint ? '漏过计时点 · R 救援'
      : race.airborne ? `腾空 ${race.vertical.airTime.toFixed(1)}s · 离地 ${race.airHeight.toFixed(1)}m`
      : race.wrongWay ? '逆向行驶 · 调头或 R 救援'
      : Math.abs(race.lane) > this.track.roadWidth / 2 - roadMargin(race.vehicle) ? '驶离赛道 · R 救援'
      : race.mode === 'items' && race.items.player.stun > 0 ? '道具命中 · 正在恢复'
      : race.boosting ? (race.mode === 'items' && race.items.player.boost > 0 ? '涡轮冲刺中' : '氮气加速中')
      : race.handbrake ? `${race.vehicleMode === 'motorcycle' ? '后刹' : '手刹'} ${race.handbrakeHeldTime.toFixed(1)}s${sliding ? ` · ${Math.round(Math.abs(race.driftAngle) * 180 / Math.PI)}°` : ' · 制动'}`
      : sliding ? `漂移 ${Math.round(Math.abs(race.driftAngle) * 180 / Math.PI)}° · 回正` : `${race.vehicleMode === 'motorcycle' ? '摩托' : race.vehicle.drive} · ${this.track.definition.surfaceCode}`);
    this.get('drive-state').classList.toggle('is-drifting', sliding || race.handbrake);
    this.get('drive-state').classList.toggle('is-boosting', race.boosting);
    this.get('drive-state').classList.toggle('is-airborne', race.airborne);
    this.set('camera-label', settings.camera === 0 ? '赛道追尾' : '低位视角');
    this.get('driving-hint').classList.toggle('hidden', race.elapsed > 12 || race.phase === 'paused');
    const rpm = gear === 0 ? 0 : 4 + race.engineRevs * 14;
    document.querySelectorAll<HTMLElement>('[data-rpm]').forEach((bar, i) => bar.classList.toggle('lit', i < rpm));
    this.updateMap(race);
    const note = race.nextNote; const remaining = note ? note.distance - race.distance : Infinity;
    const jump = race.nextJump; const jumpRemaining = jump ? jump.distance - race.distance : Infinity;
    const showJump = Boolean(jump && jumpRemaining < 155 && jumpRemaining < remaining);
    this.get('pace-note').classList.toggle('hidden', (!showJump && (!note || remaining > 155)) || race.phase !== 'racing');
    if (showJump) {
      this.set('pace-arrow', '↗'); this.set('pace-grade', '跃');
      this.set('pace-direction', '坡顶 · 稳住方向'); this.set('pace-distance', `${Math.max(0, Math.round(jumpRemaining / 10) * 10)} M`);
      this.get('pace-note').classList.add('tight-turn');
    } else if (note) {
      this.set('pace-arrow', note.direction === 'left' ? '↰' : '↱'); this.set('pace-grade', String(note.severity));
      this.set('pace-direction', note.direction === 'left' ? '左弯' : '右弯'); this.set('pace-distance', `${Math.max(0, Math.round(remaining / 10) * 10)} M`);
      this.get('pace-note').classList.toggle('tight-turn', note.severity <= 3);
    }
    if (race.splits.length > this.lastSplit) {
      this.lastSplit = race.splits.length; const split = race.splits[this.lastSplit - 1];
      if (this.lastSplit < SECTORS) this.toast(`分段 0${this.lastSplit}  ·  ${formatTime(split.time)}  ·  ${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(2)}s 对比金牌目标`);
    }
    updateLongboardHUD(race);
    if (race.penalty > this.lastPenalty) { this.lastPenalty = race.penalty; this.toast(race.isLongboard ? '滑手已救援回赛道 · 罚时 +5 秒' : '车辆已救援回赛道 · 罚时 +5 秒'); }
  }

  private updateItems(race: Race) {
    const enabled = race.mode === 'items';
    this.get('item-panel').classList.toggle('hidden', !enabled || race.phase === 'menu');
    this.get('item-key-hint').classList.toggle('hidden', !enabled);
    if (!enabled) return;
    const state = race.items.player;
    const rolling = state.roulette > 0;
    const kind = rolling ? ITEM_KINDS[Math.floor(race.elapsed * 12) % ITEM_KINDS.length] : state.held;
    const item = kind ? ITEMS[kind] : null;
    const button = this.get('item-button') as HTMLButtonElement;
    button.disabled = race.phase !== 'racing' || !state.held || rolling || state.stun > 0;
    button.dataset.ready = String(!button.disabled);
    button.setAttribute('aria-label', state.held && !rolling ? `使用${ITEMS[state.held].name}，快捷键 E` : '等待拾取道具');
    this.get('item-panel').style.setProperty('--item-color', item?.color ?? '#b9d8df');
    this.set('item-symbol', item?.symbol ?? '?');
    this.set('item-name', rolling ? '正在抽取…' : item?.name ?? '寻找道具箱');
    this.set('item-hint', race.phase === 'paused' ? '比赛已暂停' : race.phase !== 'racing' ? '倒计时结束后可用' : rolling ? '随机道具即将揭晓' : state.stun > 0 ? '恢复后可使用' : item ? '按 E 或点击使用' : '驶过道路上的 ? 箱');
    this.set('item-description', rolling ? '落后车手更容易获得追赶道具。' : item?.description ?? '蓝色问号箱随机补给 · 青色箭头带加速');
    const effects: string[] = [];
    if (state.boost > 0) effects.push(`冲刺 ${state.boost.toFixed(1)}s`);
    if (state.shield > 0) effects.push(`护盾 ${state.shield.toFixed(1)}s`);
    if (state.stun > 0) effects.push(`恢复 ${state.stun.toFixed(1)}s`);
    else if (state.immunity > 0) effects.push(`受击保护 ${state.immunity.toFixed(1)}s`);
    this.set('item-effects', effects.join(' · '));
    this.set('item-notice', race.items.noticeTime > 0 ? race.items.notice : '');
    this.get('item-panel').classList.toggle('item-hit', state.stun > 0);
  }

  openDialog(type: 'settings' | 'stage' | 'garage' | 'controls' | 'pause' | 'results', race: Race, newRecord = false) {
    let content = '';
    const downhillContent = longboardDialog(type, race, formatTime);
    if (downhillContent) content = downhillContent;
    else if (type === 'settings') {
      content = `<span class="eyebrow">MAKE IT YOURS</span><h2>驾驶偏好</h2><p class="dialog-intro">找到属于你的驾驶节奏。</p><div class="setting-row"><div><strong>画面质量</strong><small>轻量模式减少植被和像素密度</small></div><select id="quality-setting" aria-label="画面质量"><option value="standard" ${settings.quality === 'standard' ? 'selected' : ''}>标准</option><option value="low" ${settings.quality === 'low' ? 'selected' : ''}>轻量</option></select></div><div class="setting-row"><div><strong>驾驶难度</strong><small>专业模式抓地力更低，对手节奏更快 · 下次发车生效</small></div><select id="difficulty-setting" aria-label="驾驶难度"><option value="club" ${settings.difficulty === 'club' ? 'selected' : ''}>俱乐部</option><option value="pro" ${settings.difficulty === 'pro' ? 'selected' : ''}>专业</option></select></div>${this.toggle('autoThrottle', race.isLongboard ? '自动蹬地' : '自动油门', race.isLongboard ? '低速自动蹬地 · 脚刹和横板优先 · 下次发车生效' : '只需专注转向和刹车 · 下次发车生效')}${this.toggle('sound', race.isLongboard ? '风声与滑行音效' : '引擎与路面音效', race.isLongboard ? '感受山风与轮面摩擦' : '感受转速变化与砂石摩擦')}${this.toggle('voice', '领航员语音', '中文路书播报，语音可用性取决于浏览器')}<button class="primary-button dialog-primary" data-action="close">保存并返回 ${icon('arrow')}</button>`;
    } else if (type === 'controls') {
      content = `<span class="eyebrow">DRIVER BRIEFING</span><h2>每一道弯，都有章法。</h2><p class="dialog-intro">松开油门入弯，找准路线，再全力出弯。</p><div class="controls-list"><div><span><kbd>W</kbd> / <kbd>↑</kbd></span><strong>踩下油门</strong></div><div><span><kbd>S</kbd> / <kbd>↓</kbd></span><strong>刹车减速</strong></div><div><span><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></span><strong>控制车头方向 · 无自动转弯</strong></div><div><kbd>SPACE</kbd><strong>${race.vehicleMode === 'motorcycle' ? '按住后轮制动 · 转向滑胎蓄能' : '按住持续手刹 · 松开释放'}</strong></div><div><kbd>SHIFT</kbd><strong>按住氮气加速 · 漂移积攒氮气</strong></div><div><kbd>E</kbd><strong>道具赛：使用道具，也可点击道具栏</strong></div><div><kbd>C</kbd><strong>赛道追尾 / 低位视角</strong></div><div><kbd>R</kbd><strong>救援回赛道 · 罚时 5 秒</strong></div><div><kbd>ESC</kbd><strong>暂停 / 继续</strong></div></div><p class="driver-tip">摩托车模式使用 A / D 转向压弯，空格控制后轮制动；滑胎角度小于汽车，松开后刹恢复抓地。骑手随车身倾斜，镜头保持平稳。两种车辆模式都支持全部赛道及经典 / 道具赛，切换在主菜单进行。<br>与 5 辆 AI 对手同场竞速，名次按冲线顺序确定。AI 会减速入弯、跟车和寻找空位超车。<br>你的车辆不会自动跟随赛道转弯。按 A / D 渐进转向，松开后转向力度平滑归零。镜头沿前方道路取景，车头可以独立偏转。<br>空格按住越久，甩尾幅度越大；入漂后松开方向仍会侧滑，松开空格才回正。一直拉手刹会减速直至停车。<br>转向漂移会积攒氮气，侧滑越明显蓄能越快；停车或直线拉手刹不会蓄能。松开手刹后，按住 Shift 或右下角氮气按钮加速，松开停止消耗；满槽可持续约 4 秒。刹车和手刹优先。氮气期间极速提高 70 km/h（车辆完好时最高 320 km/h），松开后平滑回落；排气口会喷焰，视野拉宽并出现边缘速度线。<br>道具赛在主菜单切换，适用于全部赛道。驶过蓝色问号箱抽取一个道具，按 E 或点击左侧道具栏使用；青色箭头加速带自动触发。AI 同样拾取和使用道具，落后车手更容易获得冲刺、追踪飞盘和雷电。受击会短暂减速并获得保护；护盾抵挡一次攻击，重开清空所有道具。<br>新增起伏飞跃赛道：低速贴地过坡，加速迎坡自然腾空，无需跳跃键。起跳前摆正车头，腾空时保留惯性，落地后恢复转向和制动。黄色 JUMP 路牌与坡顶路书提前提示，仪表显示腾空时间和离地高度。<br>路书中的数字表示弯道速度等级：<b>2–3 为急弯，4–5 为快弯</b>。路肩会损伤车辆并降低极速，入弯前提前刹车。触屏设备使用屏幕底部按钮。</p><button class="primary-button dialog-primary" data-action="close">准备好了 ${icon('arrow')}</button>`;
    } else if (type === 'stage') {
      const filters = [['all', '全部赛道'], ['outdoor', '室外山野'], ['indoor', '室内场馆'], ['jumps', '起伏飞跃']] as const;
      const matches = (stage: typeof STAGES[number], filter = this.stageFilter) => filter === 'all' || (filter === 'jumps' ? Boolean(stage.jumps?.length) : Boolean(stage.venue) === (filter === 'indoor'));
      content = `<span class="eyebrow">CHOOSE YOUR STAGE / ${String(STAGES.length).padStart(2, '0')} ROUTES</span><h2>下一站，驶向哪里。</h2><p class="dialog-intro">${race.phase === 'menu' ? '从室外山野到封闭场馆。选择赛段后返回发车区，准备六车同场竞速。' : '当前比赛已暂停；返回主菜单后可切换地图。'}</p><div class="stage-filters" role="group" aria-label="赛道类型">${filters.map(([id, label]) => `<button data-stage-filter="${id}" aria-pressed="${this.stageFilter === id}">${label}<span>${STAGES.filter(stage => matches(stage, id)).length}</span></button>`).join('')}</div><div class="catalog-grid">${STAGES.filter(stage => matches(stage)).map(stage => {
        const track = new Track(stage);
        const route = routeThumbnail(track) + stageElevation(track);
        const selected = stage.id === race.stageId;
        const best = bestTime({ difficulty: race.difficulty, autoThrottle: race.autoThrottle, stageId: stage.id, vehicleId: race.vehicleId, mode: race.mode });
        return `<button class="catalog-card ${selected ? 'selected' : ''}" data-stage="${stage.id}" ${race.phase !== 'menu' ? 'disabled' : ''} aria-pressed="${selected}" style="--terrain:${stage.theme.ground};--route:${stage.theme.road}"><span class="catalog-top"><span>SS ${stage.number} / ${stage.english}</span><b>${stage.level}</b></span>${route}<strong>${stage.name}</strong><span class="catalog-description">${stage.description}</span><span class="catalog-specs">${(track.length / 1000).toFixed(2)} KM · ${stage.roadWidth} 米路宽 · ${stage.surface}</span><span class="catalog-record">${stage.weather} · 金牌 ${formatTime(track.length / stage.goldSpeed)}</span><span class="catalog-record">当前车型最佳 ${formatTime(best)}</span><span class="catalog-choice">${selected ? '已选择 ✓' : '选择此赛段 →'}</span></button>`;
      }).join('')}</div><p class="driver-tip">成绩按比赛模式、地图、车型、驾驶难度和油门模式分别保存。</p><button class="secondary-button dialog-primary" data-action="close">返回发车区</button>`;
    } else if (type === 'garage') {
      content = `<span class="eyebrow">SERVICE PARK / ${String(VEHICLES.length).padStart(2, '0')} MACHINES</span><h2>选一台，合拍的车。</h2><p class="dialog-intro">${race.phase === 'menu' ? '四款汽车、两款摩托。选择车辆即切换驾驶模式，AI 对手同步换车。' : '当前比赛已暂停；返回主菜单后可更换车辆。'}</p>${vehicleModePicker(race.vehicleMode, race.phase !== 'menu')}<div class="catalog-grid">${VEHICLES.filter(vehicle => vehicle.mode === race.vehicleMode).map(vehicle => {
        const selected = vehicle.id === race.vehicleId;
        return `<button class="catalog-card vehicle-card ${selected ? 'selected' : ''}" data-vehicle="${vehicle.id}" ${race.phase !== 'menu' ? 'disabled' : ''} aria-pressed="${selected}"><span class="catalog-top"><span>${vehicle.type}</span><b>${vehicle.drive}</b></span>${vehicleThumbnail(vehicle)}<strong>${vehicle.name}</strong><span class="catalog-description">${vehicle.description}</span><span class="catalog-specs">${vehicle.topSpeed} KM/H · ${vehicle.power} HP · ${vehicle.weight} KG</span><span class="vehicle-ratings">${[['加速', vehicle.acceleration / 18], ['抓地', vehicle.grip / 1.3], ['耐损', vehicle.durability / 1.8]].map(([name, value]) => `<span>${name}<i><em style="width:${Math.min(1, Number(value)) * 100}%"></em></i></span>`).join('')}</span><span class="catalog-choice">${selected ? '已选择 ✓' : '驾驶这台车 →'}</span></button>`;
      }).join('')}</div><p class="driver-tip">汽车使用空格手刹，摩托使用空格后刹；转向滑胎可积攒氮气。运动摩托加速更快，越野摩托更适应路肩。成绩按车型独立保存。</p><button class="secondary-button dialog-primary" data-action="close">返回发车区</button>`;
    } else if (type === 'pause') {
      content = `<span class="eyebrow">TAKE A BREATHER</span><h2>山野，等你回来。</h2><p class="dialog-intro">比赛已暂停。${Math.floor(race.progress * 100)}% 赛段完成 · ${formatTime(race.totalTime)}</p><div class="pause-actions"><button class="primary-button" data-action="resume">继续驾驶 ${icon('arrow')}</button><button class="secondary-button" data-action="restart">重新发车 ${icon('reset')}</button><button class="secondary-button" data-action="controls">驾驶指南</button><button class="text-button" data-action="home">返回主菜单</button></div>`;
    } else {
      const medal = { gold: '金牌', silver: '银牌', bronze: '铜牌' }[race.medal];
      content = `<span class="eyebrow">STAGE COMPLETE / ${newRecord ? 'NEW PERSONAL BEST' : race.track.definition.english}</span><div class="result-medal">${icon('flag')}<span>${medal}完赛</span></div><h2>${race.rank === 1 ? '拿下这一站！' : `第 ${race.rank} 名冲线。`}</h2><p class="dialog-intro">${RACE_MODES[race.mode]} · ${race.track.definition.name} · ${race.vehicle.name}</p><div class="finish-rank">P${race.rank}<small> / 6 · 冲线名次</small></div><div class="result-time">${formatTime(race.totalTime)}</div><p class="result-note">${newRecord ? '新的个人最佳。下一次，再快一点。' : `个人最佳 ${formatTime(bestTime(race))} · 下一个弯，继续突破。`}</p><div class="result-stats"><div><span>最高时速</span><strong>${Math.round(race.peakSpeed)} <small>KM/H</small></strong></div><div><span>${race.isLongboard ? '滑手状态' : '车辆状态'}</span><strong>${Math.round(race.integrity)}<small>%</small></strong></div><div><span>救援罚时</span><strong>+${race.penalty}<small>S</small></strong></div></div><div class="finish-order">${race.standings.map((row, i) => `<div class="${row.player ? 'is-player' : ''}"><b>${i + 1}</b><i style="background:${row.color}"></i><span>${row.name}<small>${row.vehicle}</small></span><strong>${row.finishTime !== null ? formatTime(row.finishTime) : `${Math.floor(row.distance / race.track.length * 100)}% · 未完赛`}</strong></div>`).join('')}</div><p class="driver-tip">名次按冲线顺序确定；未完赛车辆显示你冲线时的进度。救援罚时计入个人计时成绩。</p><div class="split-list">${race.splits.map((split, i) => `<div><span>SECTOR 0${i + 1}</span><strong>${formatTime(split.time)}</strong><span class="${split.delta <= 0 ? 'ahead' : 'behind'}">${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(2)}s</span></div>`).join('')}</div><div class="result-actions"><button class="primary-button" data-action="restart">再次挑战 ${icon('arrow')}</button><button class="secondary-button" data-action="home">返回主菜单</button></div>`;
    }
    this.get('dialog-content').innerHTML = content;
    this.dialog.dataset.page = type;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-stage-filter]').forEach(button => button.addEventListener('click', () => {
      this.stageFilter = button.dataset.stageFilter as typeof this.stageFilter;
      this.openDialog('stage', race);
      this.dialog.querySelector<HTMLButtonElement>(`[data-stage-filter="${this.stageFilter}"]`)?.focus();
    }));
    this.dialog.querySelectorAll('select').forEach(select => select.addEventListener('change', () => {
      if (select.id === 'quality-setting') settings.quality = select.value === 'low' ? 'low' : 'standard';
      if (select.id === 'difficulty-setting') settings.difficulty = select.value === 'pro' ? 'pro' : 'club';
      saveSettings(); this.onSetting();
    }));
    this.dialog.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach(input => input.addEventListener('change', () => {
      const key = input.dataset.toggle as 'autoThrottle' | 'sound' | 'voice';
      settings[key] = input.checked; saveSettings(); this.updateSound(); this.onSetting();
    }));
  }
  private toggle(key: 'autoThrottle' | 'sound' | 'voice', label: string, detail: string) {
    return `<label class="setting-row"><span><strong>${label}</strong><small>${detail}</small></span><span class="toggle"><input type="checkbox" data-toggle="${key}" ${settings[key] ? 'checked' : ''}><i></i></span></label>`;
  }
  closeDialog() { this.dialog.close(); }
}

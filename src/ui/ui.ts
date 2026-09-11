import type { Race } from '../simulation/race';
import { SECTORS, Track } from '../simulation/track';
import { bestTime, LIVERIES, saveSettings, settings } from '../settings';
import { STAGES } from '../content/stages';
import { VEHICLES, type VehicleDefinition } from '../content/vehicles';

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

function routeThumbnail(track: Track) {
  const xs = track.points.map(p => p.x); const zs = track.points.map(p => p.z);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  const path = track.points.filter((_, i) => i % 6 === 0).map((p, i) => `${i ? 'L' : 'M'}${20 + (maxZ - p.z) / (maxZ - minZ) * 280},${20 + (p.x - minX) / Math.max(1, maxX - minX) * 60}`).join(' ');
  return `<svg class="catalog-preview route-preview" viewBox="0 0 320 100" aria-hidden="true"><path d="M0 80 Q80 10 170 85 T330 40" fill="none" stroke="currentColor" opacity=".12" stroke-width="25"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><text x="15" y="15">START</text><text x="264" y="96">FINISH</text></svg>`;
}
function vehicleThumbnail(vehicle: VehicleDefinition) {
  const profile = vehicle.body === 'truck' ? 'M25 64 45 43 95 41 118 19 169 19 178 53 274 53 291 66 288 80 27 80Z'
    : vehicle.body === 'coupe' ? 'M23 68 64 59 119 31 169 31 226 60 283 66 294 79 24 79Z'
    : 'M28 62 71 48 111 20 203 20 236 54 282 63 285 80 27 80Z';
  return `<svg class="catalog-preview vehicle-preview" viewBox="0 0 320 100" aria-hidden="true"><path d="${profile}" fill="#d5d2bd"/><path d="M109 43 126 28 165 28 186 48 103 48Z" fill="#465956"/><path d="M28 66H282" stroke="#c48c44" stroke-width="5"/>${[78, 241].map(x => `<circle cx="${x}" cy="78" r="18" fill="#252a26"/><circle cx="${x}" cy="78" r="9" fill="#a1a799"/>`).join('')}</svg>`;
}

export class UI {
  readonly canvas: HTMLCanvasElement;
  readonly dialog: HTMLDialogElement;
  onAction: (action: string) => void = () => {};
  onSetting: () => void = () => {};
  onSelect: (kind: 'stage' | 'vehicle', id: string) => void = () => {};
  private routePath = '';
  private mapPoints: { x: number; y: number }[] = [];
  private phase = '';
  private lastSplit = 0;
  private lastPenalty = 0;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private cache = new Map<string, HTMLElement>();

  constructor(public track: Track) {
    this.buildMap();
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <canvas id="world" aria-label="松岭山道 3D 拉力赛场景"></canvas>
      <div class="scene-vignette" aria-hidden="true"></div>
      <div id="menu-shade" class="menu-shade" aria-hidden="true"></div>
      <header class="topbar">
        <button class="brand" data-action="home" aria-label="尘途拉力，返回主菜单"><span class="brand-mark"><i></i><i></i></span><span>DUSTLINE<small>尘途 · 拉力竞速</small></span></button>
        <div id="menu-nav" class="menu-nav"><span class="nav-active">拉力计时赛</span><button data-action="stage">选择地图 <span>↗</span></button><button data-action="garage">车库 <span>↗</span></button></div>
        <div class="top-actions"><span id="stage-tag" class="stage-tag"><i></i> OFFLINE RALLY</span><button class="icon-button" id="sound-toggle" data-action="sound" aria-label="关闭声音">${icon('sound')}</button><button class="icon-button" data-action="settings" aria-label="游戏设置">${icon('settings')}</button><button class="icon-button hidden" id="pause-button" data-action="pause" aria-label="暂停比赛">${icon('pause')}</button></div>
      </header>
      <main id="menu" class="menu">
        <section class="hero">
          <div class="eyebrow"><span class="tiny-line"></span> THE RALLY EXPERIENCE <span class="edition">VOL. 01</span></div>
          <h1>DUST &amp;<br><span>GLORY.</span><span class="title-period"></span></h1>
          <h2>越过尘土，驶向山野。</h2>
          <p class="hero-copy">从绿谷出发，去往峡谷与雪岭。<br>每一段路，都有自己的驾驶节奏。</p>
          <div class="start-row"><button id="start-button" class="primary-button" data-action="start"><span>开始赛段 <small>START YOUR ENGINE</small></span>${icon('arrow')}</button><button class="help-button" data-action="controls"><span class="key-cap">?</span> 驾驶指南</button></div>
          <div class="selection-actions"><button data-action="stage">选择地图 <span id="selected-stage">4 个赛段 ↗</span></button><button data-action="garage">选择车辆 <span id="selected-vehicle">4 种车型 ↗</span></button></div>
        </section>
        <aside class="car-caption"><span class="eyebrow">YOUR MACHINE / 07</span><strong id="car-name">FALCON R4</strong><span id="car-spec" class="car-spec"></span><div class="livery-picker" aria-label="选择赛车涂装">${LIVERIES.map((livery, i) => `<button class="livery-swatch ${i === settings.livery ? 'selected' : ''}" data-livery="${i}" style="--swatch:${livery.color}" aria-label="${livery.name}" aria-pressed="${i === settings.livery}"></button>`).join('')}<span id="livery-name">${LIVERIES[settings.livery].name}</span></div></aside>
        <section class="stage-strip"><div class="stage-name"><span id="stage-number" class="stage-number">02</span><div><span class="eyebrow">SPECIAL STAGE</span><h3 id="stage-name">松岭山道</h3><p id="stage-summary"></p></div></div><div class="stage-map">${this.mapSVG('preview-map')}</div><div class="stage-stats"><div><span>赛段距离</span><strong id="stage-length">${(track.length / 1000).toFixed(2)} <small>KM</small></strong></div><div><span>路面类型</span><strong id="stage-surface"></strong></div><div><span>地图难度</span><strong id="stage-level"></strong></div></div><button class="stage-more" data-action="stage" aria-label="查看赛段详情">${icon('arrow')}</button></section>
        <footer class="menu-footer"><span>BUILT FOR THE UNTAMED.</span><span>EST. 2026 <i> / </i> DUSTLINE RALLY CLUB</span></footer>
      </main>
      <section id="hud" class="hud hidden" aria-label="比赛仪表">
        <div class="stage-clock"><span id="hud-stage" class="eyebrow"></span><div id="race-time">00:00.00</div><p>个人最佳 <strong id="best-time">—:——.——</strong></p></div>
        <div class="stage-progress"><div><span>STAGE PROGRESS</span><strong id="progress-label">0%</strong></div><div class="progress-track"><i id="progress-fill"></i>${[1,2,3,4].map(i => `<span style="left:${i * 20}%"></span>`).join('')}</div></div>
        <div id="pace-note" class="pace-note hidden"><div class="pace-symbol" id="pace-arrow">↱</div><div><strong id="pace-grade">4</strong><span id="pace-direction">右弯</span></div><span class="pace-distance" id="pace-distance">100 M</span></div>
        <div class="race-map"><span class="eyebrow"><span id="map-stage-name">PINE RIDGE</span><span id="sector-label">01 / 05</span></span>${this.mapSVG('race-map')}<div class="condition"><span>车辆状态</span><div><i id="condition-fill"></i></div><strong id="condition-label">100%</strong></div></div>
        <div class="speedometer"><div class="rpm-bars">${Array.from({length: 18}, (_, i) => `<i data-rpm="${i}"></i>`).join('')}</div><div class="speed-row"><div class="gear"><small>GEAR</small><strong id="gear">N</strong></div><strong id="speed">000</strong><span>KM/H</span></div><div class="speed-footer"><span id="drive-state">AWD · GRAVEL</span><button data-action="camera" aria-label="切换视角">${icon('camera')}<span id="camera-label">赛道追尾</span><kbd>C</kbd></button></div></div>
        <div class="driving-hint" id="driving-hint"><kbd>W</kbd> 油门 <kbd>S</kbd> 刹车 <kbd>A</kbd><kbd>D</kbd> 转向 <kbd>SPACE</kbd> 手刹</div>
        <div class="touch-controls"><div><button data-control="ArrowLeft" aria-label="左转">←</button><button data-control="ArrowRight" aria-label="右转">→</button></div><div><button data-control="Space" class="touch-handbrake" aria-label="手刹">手刹</button><button data-control="ArrowDown" aria-label="刹车">刹车</button><button data-control="ArrowUp" class="touch-throttle" aria-label="油门">油门</button></div></div>
      </section>
      <div id="countdown" class="countdown hidden" role="status"><span>READY TO GET DIRTY?</span><strong id="countdown-number">3</strong><p>握紧方向，前方是你的赛道。</p></div>
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
      if (vehicle && !vehicle.disabled) this.onSelect('vehicle', vehicle.dataset.vehicle!);
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
    this.mapPoints = p.map(point => ({ x: 16 + (maxZ - point.z) / (maxZ - minZ) * 288, y: 17 + (point.x - minX) / (maxX - minX) * 70 }));
    this.routePath = this.mapPoints.filter((_, i) => i % 6 === 0 || i === p.length - 1).map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  }
  setSelection(race: Race) {
    this.track = race.track; this.buildMap();
    for (const id of ['preview-map', 'race-map']) {
      this.get(id).outerHTML = this.mapSVG(id); this.cache.delete(id);
    }
    this.cache.delete('map-dot');
    const stage = this.track.definition; const vehicle = race.vehicle;
    this.set('car-name', vehicle.name);
    this.set('selected-stage', `${stage.name} ↗`); this.set('selected-vehicle', `${vehicle.name} ↗`);
    this.set('car-spec', `${vehicle.type} · ${vehicle.power} HP · ${vehicle.weight.toLocaleString()} KG`);
    this.set('stage-number', stage.number); this.set('stage-name', stage.name);
    this.set('stage-summary', `${stage.english} · ${stage.weather}`);
    this.set('stage-length', `${(this.track.length / 1000).toFixed(2)} KM`);
    this.set('stage-surface', stage.surface); this.set('stage-level', stage.level);
    this.set('hud-stage', `SS ${stage.number} / ${stage.name} · ${vehicle.name}`);
    this.set('map-stage-name', stage.english);
    this.set('best-time', formatTime(bestTime(race)));
    this.canvas.setAttribute('aria-label', `${stage.name} 3D 拉力赛场景`);
  }

  private get(id: string) { return this.cache.get(id) ?? document.getElementById(id)!; }
  private set(id: string, value: string) { const element = this.get(id); if (element.textContent !== value) element.textContent = value; }
  private mapSVG(id: string) {
    const first = this.mapPoints[0]; const last = this.mapPoints[this.mapPoints.length - 1];
    return `<svg id="${id}" viewBox="0 0 320 108" fill="none" aria-label="${this.track.definition.name}赛段路线"><path d="${this.routePath}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${first.x}" cy="${first.y}" r="4" fill="currentColor"/><rect x="${last.x - 4}" y="${last.y - 4}" width="8" height="8" fill="currentColor"/><text x="${first.x}" y="${first.y - 10}" fill="currentColor">S</text><text x="${last.x}" y="${last.y - 10}" fill="currentColor">F</text>${id === 'race-map' ? `<circle id="map-dot" cx="${first.x}" cy="${first.y}" r="5" fill="#faf6df" stroke="#262b24" stroke-width="2"/>` : ''}</svg>`;
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
    if (this.phase !== race.phase) {
      this.phase = race.phase;
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
    if (race.phase === 'menu') return;
    this.set('race-time', formatTime(race.totalTime));
    this.set('speed', Math.round(race.speed * 3.6).toString().padStart(3, '0'));
    const gear = race.gear;
    this.set('gear', gear === 0 ? 'N' : String(gear));
    this.set('progress-label', `${Math.floor(race.progress * 100)}%`);
    this.get('progress-fill').style.width = `${race.progress * 100}%`;
    this.set('sector-label', `0${race.sector} / 05`);
    this.get('condition-fill').style.width = `${race.integrity}%`; this.set('condition-label', `${Math.round(race.integrity)}%`);
    this.get('condition-fill').style.background = race.integrity < 35 ? '#d98365' : '';
    const sliding = race.driftIntensity > 0.2;
    this.set('drive-state', race.missedCheckpoint ? '漏过计时点 · R 救援'
      : race.wrongWay ? '逆向行驶 · 调头或 R 救援'
      : Math.abs(race.lane) > this.track.roadWidth / 2 - 0.95 ? '驶离赛道 · R 救援'
      : race.handbrake ? `手刹 ${race.handbrakeHeldTime.toFixed(1)}s${sliding ? ` · ${Math.round(Math.abs(race.driftAngle) * 180 / Math.PI)}°` : ' · 制动'}`
      : sliding ? `漂移 ${Math.round(Math.abs(race.driftAngle) * 180 / Math.PI)}° · 回正` : `${race.vehicle.drive} · ${this.track.definition.surfaceCode}`);
    this.get('drive-state').classList.toggle('is-drifting', sliding || race.handbrake);
    this.set('camera-label', settings.camera === 0 ? '赛道追尾' : '低位视角');
    this.get('driving-hint').classList.toggle('hidden', race.elapsed > 12 || race.phase === 'paused');
    const rpm = gear === 0 ? 0 : 4 + race.engineRevs * 14;
    document.querySelectorAll<HTMLElement>('[data-rpm]').forEach((bar, i) => bar.classList.toggle('lit', i < rpm));
    const index = Math.min(this.mapPoints.length - 1, Math.floor(race.progress * (this.mapPoints.length - 1)));
    // Position by arc length, matching simulation even where spline samples are uneven.
    const distanceIndex = this.track.distances.findIndex(d => d >= race.distance);
    const map = this.mapPoints[distanceIndex >= 0 ? distanceIndex : index];
    this.get('map-dot').setAttribute('cx', String(map.x)); this.get('map-dot').setAttribute('cy', String(map.y));
    const note = race.nextNote; const remaining = note ? note.distance - race.distance : Infinity;
    this.get('pace-note').classList.toggle('hidden', !note || remaining > 155 || race.phase !== 'racing');
    if (note) {
      this.set('pace-arrow', note.direction === 'left' ? '↰' : '↱'); this.set('pace-grade', String(note.severity));
      this.set('pace-direction', note.direction === 'left' ? '左弯' : '右弯'); this.set('pace-distance', `${Math.max(0, Math.round(remaining / 10) * 10)} M`);
      this.get('pace-note').classList.toggle('tight-turn', note.severity <= 3);
    }
    if (race.splits.length > this.lastSplit) {
      this.lastSplit = race.splits.length; const split = race.splits[this.lastSplit - 1];
      if (this.lastSplit < SECTORS) this.toast(`分段 0${this.lastSplit}  ·  ${formatTime(split.time)}  ·  ${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(2)}s 对比金牌目标`);
    }
    if (race.penalty > this.lastPenalty) { this.lastPenalty = race.penalty; this.toast('车辆已救援回赛道 · 罚时 +5 秒'); }
  }

  openDialog(type: 'settings' | 'stage' | 'garage' | 'controls' | 'pause' | 'results', race: Race, newRecord = false) {
    let content = '';
    if (type === 'settings') {
      content = `<span class="eyebrow">MAKE IT YOURS</span><h2>驾驶偏好</h2><p class="dialog-intro">找到属于你的驾驶节奏。</p><div class="setting-row"><div><strong>画面质量</strong><small>轻量模式减少植被和像素密度</small></div><select id="quality-setting" aria-label="画面质量"><option value="standard" ${settings.quality === 'standard' ? 'selected' : ''}>标准</option><option value="low" ${settings.quality === 'low' ? 'selected' : ''}>轻量</option></select></div><div class="setting-row"><div><strong>驾驶难度</strong><small>专业模式抓地力更低，转向惯性更明显 · 下次发车生效</small></div><select id="difficulty-setting" aria-label="驾驶难度"><option value="club" ${settings.difficulty === 'club' ? 'selected' : ''}>俱乐部</option><option value="pro" ${settings.difficulty === 'pro' ? 'selected' : ''}>专业</option></select></div>${this.toggle('autoThrottle', '自动油门', '只需专注转向和刹车 · 下次发车生效')}${this.toggle('sound', '引擎与路面音效', '感受转速变化与砂石摩擦')}${this.toggle('voice', '领航员语音', '中文路书播报，语音可用性取决于浏览器')}<button class="primary-button dialog-primary" data-action="close">保存并返回 ${icon('arrow')}</button>`;
    } else if (type === 'controls') {
      content = `<span class="eyebrow">DRIVER BRIEFING</span><h2>每一道弯，都有章法。</h2><p class="dialog-intro">松开油门入弯，找准路线，再全力出弯。</p><div class="controls-list"><div><span><kbd>W</kbd> / <kbd>↑</kbd></span><strong>踩下油门</strong></div><div><span><kbd>S</kbd> / <kbd>↓</kbd></span><strong>刹车减速</strong></div><div><span><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></span><strong>控制车头方向 · 无自动转弯</strong></div><div><kbd>SPACE</kbd><strong>按住持续手刹 · 松开释放</strong></div><div><kbd>C</kbd><strong>赛道追尾 / 低位视角</strong></div><div><kbd>R</kbd><strong>救援回赛道 · 罚时 5 秒</strong></div><div><kbd>ESC</kbd><strong>暂停 / 继续</strong></div></div><p class="driver-tip">车辆不会自动跟随赛道转弯。按 A / D 渐进转向，松开后转向力度平滑归零。镜头沿前方道路取景，车头可以独立偏转。<br>空格按住越久，甩尾幅度越大；入漂后松开方向仍会侧滑，松开空格才回正。一直拉手刹会减速直至停车。<br>路书中的数字表示弯道速度等级：<b>2–3 为急弯，4–5 为快弯</b>。路肩会损伤车辆并降低极速，入弯前提前刹车。触屏设备使用屏幕底部按钮。</p><button class="primary-button dialog-primary" data-action="close">准备好了 ${icon('arrow')}</button>`;
    } else if (type === 'stage') {
      content = `<span class="eyebrow">CHOOSE YOUR STAGE / 04 ROUTES</span><h2>下一站，驶向哪里。</h2><p class="dialog-intro">${race.phase === 'menu' ? '选择赛段后返回发车区。地图难度由弯道、路宽和抓地力共同决定。' : '当前比赛已暂停；返回主菜单后可切换地图。'}</p><div class="catalog-grid">${STAGES.map(stage => {
        const track = new Track(stage);
        const route = routeThumbnail(track);
        const selected = stage.id === race.stageId;
        const best = bestTime({ difficulty: race.difficulty, autoThrottle: race.autoThrottle, stageId: stage.id, vehicleId: race.vehicleId });
        return `<button class="catalog-card ${selected ? 'selected' : ''}" data-stage="${stage.id}" ${race.phase !== 'menu' ? 'disabled' : ''} aria-pressed="${selected}" style="--terrain:${stage.theme.ground};--route:${stage.theme.road}"><span class="catalog-top"><span>SS ${stage.number} / ${stage.english}</span><b>${stage.level}</b></span>${route}<strong>${stage.name}</strong><span class="catalog-description">${stage.description}</span><span class="catalog-specs">${(track.length / 1000).toFixed(2)} KM · ${stage.roadWidth} 米路宽 · ${stage.surface}</span><span class="catalog-record">${stage.weather} · 金牌 ${formatTime(track.length / stage.goldSpeed)}</span><span class="catalog-record">当前车型最佳 ${formatTime(best)}</span><span class="catalog-choice">${selected ? '已选择 ✓' : '选择此赛段 →'}</span></button>`;
      }).join('')}</div><p class="driver-tip">成绩按地图、车型、驾驶难度和油门模式分别保存。</p><button class="secondary-button dialog-primary" data-action="close">返回发车区</button>`;
    } else if (type === 'garage') {
      content = `<span class="eyebrow">SERVICE PARK / 04 MACHINES</span><h2>选一台，合拍的车。</h2><p class="dialog-intro">${race.phase === 'menu' ? '不同驱动形式，不同驾驶节奏。选择车辆即可查看场景中的车身。' : '当前比赛已暂停；返回主菜单后可更换车辆。'}</p><div class="catalog-grid">${VEHICLES.map(vehicle => {
        const selected = vehicle.id === race.vehicleId;
        return `<button class="catalog-card vehicle-card ${selected ? 'selected' : ''}" data-vehicle="${vehicle.id}" ${race.phase !== 'menu' ? 'disabled' : ''} aria-pressed="${selected}"><span class="catalog-top"><span>${vehicle.type}</span><b>${vehicle.drive}</b></span>${vehicleThumbnail(vehicle)}<strong>${vehicle.name}</strong><span class="catalog-description">${vehicle.description}</span><span class="catalog-specs">${vehicle.topSpeed} KM/H · ${vehicle.power} HP · ${vehicle.weight} KG</span><span class="vehicle-ratings">${[['加速', vehicle.acceleration / 18], ['抓地', vehicle.grip / 1.3], ['耐损', vehicle.durability / 1.8]].map(([name, value]) => `<span>${name}<i><em style="width:${Number(value) * 100}%"></em></i></span>`).join('')}</span><span class="catalog-choice">${selected ? '已选择 ✓' : '驾驶这台车 →'}</span></button>`;
      }).join('')}</div><p class="driver-tip">所有车型均保留手动转向与持续手刹。车辆完好时的极速上限为 250 km/h。</p><button class="secondary-button dialog-primary" data-action="close">返回发车区</button>`;
    } else if (type === 'pause') {
      content = `<span class="eyebrow">TAKE A BREATHER</span><h2>山野，等你回来。</h2><p class="dialog-intro">比赛已暂停。${Math.floor(race.progress * 100)}% 赛段完成 · ${formatTime(race.totalTime)}</p><div class="pause-actions"><button class="primary-button" data-action="resume">继续驾驶 ${icon('arrow')}</button><button class="secondary-button" data-action="restart">重新发车 ${icon('reset')}</button><button class="secondary-button" data-action="controls">驾驶指南</button><button class="text-button" data-action="home">返回主菜单</button></div>`;
    } else {
      const medal = { gold: '金牌', silver: '银牌', bronze: '铜牌' }[race.medal];
      content = `<span class="eyebrow">STAGE COMPLETE / ${newRecord ? 'NEW PERSONAL BEST' : race.track.definition.english}</span><div class="result-medal">${icon('flag')}<span>${medal}完赛</span></div><h2>把尘土留在身后。</h2><p class="dialog-intro">${race.track.definition.name} · ${race.vehicle.name}</p><div class="result-time">${formatTime(race.totalTime)}</div><p class="result-note">${newRecord ? '新的个人最佳。下一次，再快一点。' : `个人最佳 ${formatTime(bestTime(race))} · 下一个弯，继续突破。`}</p><div class="result-stats"><div><span>最高时速</span><strong>${Math.round(race.peakSpeed)} <small>KM/H</small></strong></div><div><span>车辆状态</span><strong>${Math.round(race.integrity)}<small>%</small></strong></div><div><span>救援罚时</span><strong>+${race.penalty}<small>S</small></strong></div></div><div class="split-list">${race.splits.map((split, i) => `<div><span>SECTOR 0${i + 1}</span><strong>${formatTime(split.time)}</strong><span class="${split.delta <= 0 ? 'ahead' : 'behind'}">${split.delta > 0 ? '+' : '−'}${Math.abs(split.delta).toFixed(2)}s</span></div>`).join('')}</div><div class="result-actions"><button class="primary-button" data-action="restart">再次挑战 ${icon('arrow')}</button><button class="secondary-button" data-action="home">返回主菜单</button></div>`;
    }
    this.get('dialog-content').innerHTML = content;
    this.dialog.dataset.page = type;
    if (!this.dialog.open) this.dialog.showModal();
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

import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-400.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700-italic.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';
import '@fontsource/barlow-condensed/latin-900-italic.css';
import './style.css';
import { Track } from './simulation/track';
import { Race } from './simulation/race';
import { RaceTimeline, PaintClock } from './presentation';
import type { RallyRenderer } from './render/renderer';
import { RallyAudio } from './audio';
import { Input } from './input';
import { saveRecord, saveSettings, settings } from './settings';
import { UI } from './ui/ui';
import { getVehicle } from './content/vehicles';
import { raceSelection } from './content/modes';
import type { RaceMode } from './content/items';

const initialSelection = raceSelection(settings.mode,
  settings.mode === 'downhill' ? settings.downhillStageId : settings.stageId,
  settings.mode === 'downhill' ? settings.downhillVehicleId : settings.vehicleId);
let track = new Track(initialSelection.stage);
let race = new Race(track, initialSelection.vehicle);
race.difficulty = settings.difficulty; race.autoThrottle = settings.autoThrottle; race.mode = settings.mode;
let timeline = new RaceTimeline(race);
const paintClock = new PaintClock();
const ui = new UI(track);
ui.setSelection(race);
const input = new Input();
const audio = new RallyAudio();
let view: RallyRenderer | undefined;
let dirty = true;
let lastFrame = 0;
let lastPaint = 0;
let animationFrame = 0;
let generation = 0;
let wasPausedForDialog = false;

function closeDialog() {
  const page = ui.dialog.dataset.page;
  if (page === 'results') { home(); return; }
  ui.closeDialog();
  if (race.phase === 'paused') {
    if (page === 'pause' || wasPausedForDialog) {
      race.resume(); input.clear(); wasPausedForDialog = false;
    } else ui.openDialog('pause', race);
  }
  dirty = true;
}
function openDialog(type: 'settings' | 'controls' | 'stage' | 'garage') {
  if (race.phase === 'racing' || race.phase === 'countdown') {
    wasPausedForDialog = true; race.pause(); input.clear(); audio.silence();
  }
  ui.openDialog(type, race); dirty = true;
}
function pause() {
  if (race.phase === 'paused') { closeDialog(); return; }
  if (race.phase !== 'racing' && race.phase !== 'countdown') return;
  race.pause(); input.clear(); audio.silence(); wasPausedForDialog = false;
  ui.openDialog('pause', race); dirty = true;
}
function start() {
  if (!view?.contextAvailable) return;
  generation++;
  ui.closeDialog(); input.clear(); audio.reset(); void audio.unlock();
  race.difficulty = settings.difficulty; race.autoThrottle = settings.autoThrottle;
  race.mode = settings.mode;
  race.start(); timeline.reset(); view.reset(); lastFrame = performance.now();
  wasPausedForDialog = false; dirty = true;
}
function home() {
  generation++; ui.closeDialog(); audio.reset(); input.clear();
  race.reset(); race.phase = 'menu'; timeline.reset(); view?.reset();
  race.difficulty = settings.difficulty; race.autoThrottle = settings.autoThrottle; race.mode = settings.mode; ui.setSelection(race);
  wasPausedForDialog = false; dirty = true;
}

function setRaceMode(mode: RaceMode) {
  if (race.phase !== 'menu' || !view?.contextAvailable) return;
  const selection = raceSelection(mode,
    mode === 'downhill' ? settings.downhillStageId : settings.stageId,
    mode === 'downhill' ? settings.downhillVehicleId : settings.vehicleId);
  input.clear(); audio.reset();
  if (selection.stage.id !== race.stageId) { track = new Track(selection.stage); view.setStage(track); }
  race = new Race(track, selection.vehicle); race.mode = mode;
  race.difficulty = settings.difficulty; race.autoThrottle = settings.autoThrottle;
  timeline = new RaceTimeline(race);
  view.setVehicle(selection.vehicle); view.reset();
  settings.mode = mode; saveSettings(); ui.setSelection(race);
  lastFrame = performance.now(); dirty = true;
}

ui.onAction = action => {
  if (action === 'start' || action === 'restart') start();
  else if (action === 'switch-stance') {
    if (race.isLongboard && race.phase === 'racing' && !race.switchLongboardStance() && !race.longboard.switching) ui.toast('达到 11 km/h 后可做 180° switch');
    dirty = true;
  }
  else if (action === 'use-item') { race.items.use(race); dirty = true; }
  else if (action === 'mode-classic' || action === 'mode-items' || action === 'mode-downhill') {
    setRaceMode(action === 'mode-downhill' ? 'downhill' : action === 'mode-items' ? 'items' : 'classic');
  }
  else if (action === 'home') home();
  else if (action === 'settings' || action === 'stage' || action === 'garage' || action === 'controls') openDialog(action);
  else if (action === 'pause') pause();
  else if (action === 'resume') { ui.closeDialog(); race.resume(); input.clear(); wasPausedForDialog = false; dirty = true; }
  else if (action === 'close') closeDialog();
  else if (action === 'sound') {
    settings.sound = !settings.sound; saveSettings(); ui.updateSound();
    if (settings.sound) void audio.unlock(); else audio.silence();
  } else if (action === 'camera') {
    settings.camera = settings.camera === 0 ? 1 : 0; saveSettings(); dirty = true;
    ui.toast(settings.camera === 0 ? '赛道追尾视角' : '低位赛道视角');
  } else if (action === 'reload') window.location.reload();
};
ui.onSetting = () => {
  view?.setQuality(); dirty = true;
  if (race.phase === 'menu') {
    race.difficulty = settings.difficulty; race.autoThrottle = settings.autoThrottle; ui.setSelection(race);
  }
  if (!settings.sound || !settings.voice) audio.silence();
};
ui.onSelect = (kind, id) => {
  if (race.phase !== 'menu' || !view?.contextAvailable) return;
  const garageModeSwitch = kind === 'vehicle' && getVehicle(id).mode !== race.vehicleMode
    && ui.dialog?.open && ui.dialog.dataset.page === 'garage';
  const { stage, vehicle } = raceSelection(settings.mode,
    kind === 'stage' ? id : race.stageId, kind === 'vehicle' ? id : race.vehicleId);
  const stageChanged = stage.id !== race.stageId;
  input.clear(); audio.reset();
  if (stageChanged) track = new Track(stage);
  race = new Race(track, vehicle); race.difficulty = settings.difficulty; race.autoThrottle = settings.autoThrottle; race.mode = settings.mode;
  timeline = new RaceTimeline(race);
  if (stageChanged) view.setStage(track);
  view.setVehicle(vehicle); view.reset();
  if (race.isLongboard) { settings.downhillStageId = stage.id; settings.downhillVehicleId = vehicle.id; }
  else { settings.stageId = stage.id; settings.vehicleId = vehicle.id; }
  saveSettings();
  ui.setSelection(race); ui.closeDialog();
  if (garageModeSwitch) ui.openDialog('garage', race);
  lastFrame = performance.now(); dirty = true;
  ui.toast(`${stage.name} · ${vehicle.name} · 准备发车`);
};
input.onDoubleSpace = () => {
  if (ui.dialog.open || race.phase !== 'racing' || !race.isLongboard) return false;
  ui.onAction('switch-stance');
  return race.longboard.switching;
};
input.onLongSpace = () => {
  if (ui.dialog.open || race.phase !== 'racing' || !race.isLongboard) return false;
  ui.onAction('switch-stance');
  return race.longboard.switching;
};
input.onCommand = command => {
  if (command === 'Escape' || command === 'KeyP') {
    if (ui.dialog.open) closeDialog(); else pause();
    return;
  }
  if (ui.dialog.open) return;
  if (command === 'Enter' && race.phase === 'menu') {
    // Native buttons already emit a click on Enter.
    if (!(document.activeElement instanceof HTMLButtonElement)) start();
  }
  if (command === 'KeyC' && race.phase === 'racing') ui.onAction('camera');
  if (command === 'KeyQ' && race.phase === 'racing') ui.onAction('switch-stance');
  if (command === 'KeyE' && race.phase === 'racing') ui.onAction('use-item');
  if (command === 'KeyR' && race.phase === 'racing') { race.recover(); timeline.reset(); view?.reset(); dirty = true; }
};

function onHidden() {
  input.clear();
  if (race.phase === 'racing' || race.phase === 'countdown') pause();
  audio.silence();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { onHidden(); cancelAnimationFrame(animationFrame); animationFrame = 0; }
  else { lastFrame = performance.now(); dirty = true; if (!animationFrame) animationFrame = requestAnimationFrame(frame); }
});
window.addEventListener('blur', onHidden);
window.addEventListener('resize', () => { view?.resize(); dirty = true; });
window.addEventListener('pagehide', () => { audio.silence(); cancelAnimationFrame(animationFrame); });
window.addEventListener('pageshow', event => {
  if (event.persisted) { lastFrame = performance.now(); dirty = true; animationFrame = requestAnimationFrame(frame); }
});

function recordResult() {
  // Records follow the active run, even if next-run preferences were edited while paused.
  const newRecord = saveRecord(race.totalTime, race);
  ui.openDialog('results', race, newRecord);
}

function frame(now: number) {
  animationFrame = 0;
  if (document.hidden) return;
  animationFrame = requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - (lastFrame || now)) / 1000));
  lastFrame = now;
  input.enabled = race.phase === 'racing' || race.phase === 'countdown';
  input.advance(now);
  const controls = input.read();
  const active = race.phase === 'racing' || race.phase === 'countdown';
  if (active) {
    const previous = race.phase;
    timeline.advance(dt, controls);
    if (previous !== 'finished' && (race.phase as string) === 'finished') {
      input.clear(); audio.silence(); recordResult(); dirty = true;
    }
    if (previous === 'countdown' && (race.phase as string) === 'racing') ui.toast(race.isLongboard ? '出发！W 蹬地，Shift 收身，S 脚刹，空格扶地刹滑，X 站滑，Q 切换站姿。' : race.autoThrottle ? '出发！自动油门已开启，专注转向与刹车。' : '出发！按 W / ↑ 踩下油门。');
  }
  const interval = settings.quality === 'low' ? 1000 / 30 : 1000 / 60;
  if ((active || dirty) && paintClock.ready(now, interval, dirty)) {
    view?.render(race, controls, Math.min(0.1, (now - (lastPaint || now)) / 1000), timeline.pose);
    ui.update(race); audio.update(race); lastPaint = now; dirty = false;
  }
}

// Let the lightweight loading UI paint before preparing the geometry.
requestAnimationFrame(() => {
  window.setTimeout(async () => {
    const currentGeneration = generation;
    try {
      const { RallyRenderer } = await import('./render/renderer');
      view = new RallyRenderer(ui.canvas, track, available => {
        if (!available) { onHidden(); ui.error('图形上下文已中断，比赛已暂停。恢复后可继续，也可以重新加载。', '图形引擎正在恢复'); }
        else { ui.clearError(); dirty = true; }
      });
      if (generation === currentGeneration) ui.ready();
      lastFrame = performance.now();
      animationFrame = requestAnimationFrame(frame);
    } catch (error) {
      console.error('Rally renderer could not initialize:', error);
      ui.error('当前浏览器无法初始化 WebGL 2。请开启浏览器硬件加速，或换用支持 WebGL 2 的浏览器后重试。');
    }
  }, 30);
});

if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(animationFrame); audio.silence(); view?.dispose(); });

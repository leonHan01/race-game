import type { Race } from '../simulation/race';
import { stageDrop } from '../content/stages';
import { longboardCatalog } from './longboard-catalog';

const set = (selector: string, value: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (element && element.textContent !== value) element.textContent = value;
};

export function configureLongboardUI(race: Race) {
  const board = race.isLongboard;
  set('#vehicle-selection-label', board ? '选择长板' : '选择车辆');
  set('#nitro-button .nitro-heading strong', board ? '收身滑行 · SHIFT' : '氮气加速 · SHIFT');
  document.querySelector('#nitro-button')?.setAttribute('aria-label', board ? '按住收身降低风阻，按钮或 Shift' : '氮气加速，按住按钮或 Shift');
  set('.gear > small', board ? 'RIDE' : 'GEAR');
  set('.condition > span', board ? '滑手状态' : '车辆状态');
  set('.touch-controls [data-control="Space"]', board ? '扶地' : race.vehicleMode === 'motorcycle' ? '后刹' : '手刹');
  set('.touch-controls [data-control="ArrowDown"]', board ? '脚刹' : '刹车 / 倒车');
  set('.touch-controls [data-control="ArrowUp"]', board ? '蹬地' : '油门');
  for (const control of ['Space', 'ArrowDown', 'ArrowUp']) {
    const button = document.querySelector(`.touch-controls [data-control="${control}"]`);
    if (button) button.setAttribute('aria-label', button.textContent ?? '');
  }
  set('#countdown > span', board ? 'READY TO DROP IN?' : 'READY TO GET DIRTY?');
  set('#countdown > p', board ? '六人速降 · 倒计时结束一起出发。' : '六车同场 · 倒计时结束一起发车。');
  set('#start-button small', board ? 'DROP INTO THE DESCENT' : 'START YOUR ENGINE');
  set('#menu-nav .nav-active', board ? '六人长板速降' : race.vehicleMode === 'motorcycle' ? '六人摩托竞速' : '六车拉力竞速');
  set('.hero h2', board ? '俯身迎风，一路向下。' : '越过尘土，驶向山野。');
  if (!board) {
    const hint = document.querySelector('#driving-hint');
    if (hint) hint.innerHTML = `<kbd>W</kbd> 油门 <kbd>S</kbd> 刹车 / 倒车 <kbd>A</kbd><kbd>D</kbd> 转向 <kbd>SPACE</kbd> <span data-brake-hint>${race.vehicleMode === 'motorcycle' ? '后刹蓄能' : '漂移蓄能'}</span> <kbd>SHIFT</kbd> 氮气`;
    return;
  }
  set('#start-label', '开始速降');
  set('#mode-description', `${stageDrop(race.track.definition)} 米落差，六人同场。蹬地起步、直道收身，入弯横板减速。`);
  set('#car-spec', `${race.vehicle.type} · ${race.vehicle.weight} KG · 重力驱动`);
  set('#driving-hint', 'W / ↑ 蹬地 · S / ↓ 脚刹 · A / D 转向 · 空格扶地 / 长按 SWITCH · X 站滑 · SHIFT 收身');
  set('#stage-summary', `${race.track.definition.english} · 落差 ${stageDrop(race.track.definition)} M · ${race.track.definition.weather}`);
  document.querySelector('#world')?.setAttribute('aria-label', `${race.track.definition.name} 3D 长板竞速场景`);
}

export function updateLongboardHUD(race: Race) {
  if (!race.isLongboard) return;
  const button = document.querySelector<HTMLButtonElement>('#nitro-button');
  if (button) { button.dataset.state = race.tucking ? 'boosting' : 'ready'; button.setAttribute('aria-pressed', String(race.tucking)); }
  set('#gear', race.longboard.stance === 'switch' ? 'SW' : race.tucking ? '↓' : 'DH');
  set('#longboard-stance', race.longboard.stance === 'switch' ? 'SWITCH' : 'REGULAR');
  set('#longboard-action', race.longboard.label || (race.longboard.stance === 'switch' ? '右脚在前' : '左脚在前'));
  const standup = document.querySelector<HTMLButtonElement>('#standup-button');
  const switchButton = document.querySelector<HTMLButtonElement>('#switch-button');
  if (standup) { standup.disabled = race.phase !== 'racing'; standup.setAttribute('aria-pressed', String(race.longboard.style === 'standup')); }
  if (switchButton) switchButton.disabled = race.phase !== 'racing' || race.longboard.switching || race.speed < 3;
  set('#nitro-amount', `${Math.round(race.descent)} M ↓`);
  set('#nitro-status', race.phase !== 'racing' ? '比赛开始后可用' : race.footbraking || race.handbrake ? '制动优先 · 松开后可收身' : race.tucking ? '收身中 · 风阻降低' : '按住降低风阻 · 无需蓄能');
  if (!race.missedCheckpoint && !race.wrongWay && Math.abs(race.lane) <= race.track.roadWidth / 2 - 0.3) {
    const grade = Math.abs(race.track.grade(race.distance) * 100).toFixed(1);
    set('#drive-state', race.longboard.switching ? '180° 滑转 · 重心切换' : race.handbrake ? (race.longboard.label || '刹滑减速') : race.footbraking ? '脚刹制动' : race.tucking ? `收身速降 · 下坡 ${grade}%` : race.pushing ? '蹬地起步' : `重力滑行 · 下坡 ${grade}%`);
  }
  document.querySelectorAll<HTMLElement>('[data-rpm]').forEach((bar, i) => bar.classList.toggle('lit', i < race.speed * 3.6 / race.vehicle.topSpeed * 18));
}

export function longboardDialog(type: string, race: Race, formatTime: (time: number | null) => string): string | null {
  if (!race.isLongboard) return null;
  const back = '<button class="primary-button dialog-primary" data-action="close">返回速降</button>';
  if (type === 'controls') return `<span class="eyebrow">LONGBOARD / RIDER BRIEFING</span><h2>迎风收身，入弯减速。</h2><p class="dialog-intro">坡度提供动力，双脚控制节奏。六位滑手争夺冲线名次。</p><div class="controls-list">${[
    ['W / ↑', '蹬地起步 · 低速时有效'], ['S / ↓', '脚刹减速 · 按住可停下'], ['A / D · ← / →', '重心压弯 · 高速内手扶地、外臂展开'], ['SPACE', '扶地刹滑 · 配合 A / D 选择侧向'], ['X', '站立式 Speed Check · 按住减速'], ['空格 × 2 / 长按 / Q', '180° 滑转 · 前后脚换位'], ['SHIFT', '收身降低风阻 · 松开恢复站姿'], ['C', '跟随 / 低位视角'], ['R', '救援回赛道 · 罚时 5 秒'], ['ESC / P', '暂停 / 继续'],
  ].map(([key, action]) => `<div><kbd>${key}</kbd><strong>${action}</strong></div>`).join('')}</div><p class="driver-tip">下坡时松开按键也会自然加速；蹬地只在 32 km/h 以下有效。直道按住 Shift 收身，弯前松开并用脚刹或横板降速。空格配合方向键做脚跟侧或脚尖侧扶地刹滑，先屈膝预压，再推出板尾、手套触地；反打减小板角，松开后收板恢复抓地。X 为站立式 speed check，张臂平衡、减速较轻。约 11 km/h 以上快速双击空格（或按 Q）可立即做 180°；持续按住空格 0.6 秒则先扶地刹滑，再自动转入 Switch，切到另一侧。两种方式都会让人和板一起水平滑转 180°，板头板尾调换、原后脚成为前脚，并继续沿原方向下坡；松开后才能再次触发。<br>脚刹优先于刹滑；两种刹滑及 180° 滑转均优先于蹬地、收身。必须按顺序通过 5 个计时点，驶离柏油路会大幅减速并损失状态。触屏可组合使用转向、扶地、站立刹滑和收身按钮，点击「180° Switch」切换站姿。<br>这是重力驱动玩法，无氮气。当前板型速度上限 ${race.vehicle.topSpeed} km/h，成绩按地图、板型和速降模式单独保存。</p>${back}`;
  if (type === 'garage' || type === 'stage') return longboardCatalog(type, race, formatTime);
  return null;
}

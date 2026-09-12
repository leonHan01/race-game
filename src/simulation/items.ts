import { ITEMS, rollItem, type ItemKind } from '../content/items';
import type { Race } from './race';
import { clamp, SECTORS, type Track, type TrackPoint } from './track';

export const MAX_PROJECTILES = 24;
export const MAX_TRAPS = 36;
export interface ItemStatus {
  held: ItemKind | null; roulette: number; boost: number; shield: number;
  stun: number; immunity: number; aiDelay: number; padCooldown: number;
}
export interface RoadPickup { id: number; distance: number; lane: number; position: TrackPoint; cooldown: number }
export interface Projectile { id: number; owner: string; kind: 'disc' | 'homing'; target: string | null; distance: number; lane: number; life: number; position: TrackPoint }
export interface BananaTrap { id: number; owner: string; distance: number; lane: number; life: number; position: TrackPoint }
type Actor = ReturnType<ItemRace['actors']>[number];
const status = (): ItemStatus => ({ held: null, roulette: 0, boost: 0, shield: 0, stun: 0, immunity: 0, aiDelay: 0, padCooldown: 0 });

/** First contact of a swept point with a circle; used for both cars and missiles. */
function contact(a: TrackPoint, b: TrackPoint, p: TrackPoint, radius: number): number | null {
  const x = a.x - p.x; const z = a.z - p.z;
  const dx = b.x - a.x; const dz = b.z - a.z;
  const c = x * x + z * z - radius * radius;
  if (c <= 0) return 0;
  const length = dx * dx + dz * dz;
  if (length < 1e-9) return null;
  const dot = x * dx + z * dz;
  const discriminant = dot * dot - length * c;
  if (discriminant < 0) return null;
  const t = (-dot - Math.sqrt(discriminant)) / length;
  return t >= 0 && t <= 1 ? t : null;
}

/** Bounded, renderer-independent item race simulation. */
export class ItemRace {
  readonly boxes: RoadPickup[] = [];
  readonly pads: RoadPickup[] = [];
  readonly states = new Map<string, ItemStatus>();
  readonly projectiles: Projectile[] = [];
  readonly traps: BananaTrap[] = [];
  notice = '';
  noticeTime = 0;
  pulse = 0;
  pulsePosition: TrackPoint = { x: 0, y: 0, z: 0 };
  private serial = 0;
  private seed = 7319;
  private previous = new Map<string, { position: TrackPoint; distance: number; airHeight: number }>();

  constructor(readonly track: Track, rivalIds: readonly string[]) {
    for (const id of ['player', ...rivalIds]) this.states.set(id, status());
    const lane = Math.min(4.2, track.roadWidth * 0.28);
    const awayFromGate = (d: number) => Array.from({ length: SECTORS }, (_, i) => (i + 1) * track.length / SECTORS).every(gate => Math.abs(d - gate) > 24);
    for (let d = 95, row = 0; d < track.length - 65; d += 150, row++) {
      if (awayFromGate(d)) for (const offset of [-lane, 0, lane]) {
        this.boxes.push({ id: this.boxes.length, distance: d, lane: offset, position: track.position(d, offset), cooldown: 0 });
      }
      const padDistance = d + 70;
      if (padDistance < track.length - 45 && awayFromGate(padDistance)) {
        const offset = row % 2 ? -lane : lane;
        this.pads.push({ id: this.pads.length, distance: padDistance, lane: offset, position: track.position(padDistance, offset), cooldown: 0 });
      }
    }
  }
  get player() { return this.states.get('player')!; }
  state(id: string) { return this.states.get(id)!; }
  actors(race: Race) {
    return [{ id: 'player', body: race, finished: race.phase === 'finished' },
      ...race.opponents.cars.map(car => ({ id: car.id, body: car, finished: car.finishTime !== null }))];
  }
  reset() {
    for (const state of this.states.values()) Object.assign(state, status());
    this.boxes.forEach(box => box.cooldown = 0);
    this.projectiles.length = 0; this.traps.length = 0; this.previous.clear();
    this.serial = 0; this.seed = 7319; this.notice = ''; this.noticeTime = 0; this.pulse = 0;
  }
  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  private tell(message: string) { this.notice = message; this.noticeTime = 2.8; }
  recover() { this.player.stun = 0; this.player.boost = 0; this.player.immunity = 2.5; this.previous.delete('player'); }
  private onRoad(actor: Actor) { return Math.abs(actor.body.lane) <= this.track.roadWidth / 2; }
  private clearanceAt(actor: Actor, fraction: number) {
    const before = this.previous.get(actor.id)?.airHeight ?? actor.body.airHeight;
    return before + (actor.body.airHeight - before) * fraction;
  }

  use(race: Race, id = 'player'): boolean {
    if (race.mode !== 'items' || race.phase !== 'racing') return false;
    const state = this.states.get(id);
    const actors = this.actors(race); const actor = actors.find(car => car.id === id);
    if (!state?.held || state.roulette > 0 || state.stun > 0 || !actor || actor.finished) return false;
    const item = state.held;
    if (['banana', 'disc', 'homing'].includes(item) && (!this.onRoad(actor) || (id === 'player' && race.wrongWay))) {
      if (id === 'player') this.tell('回到道路并朝前行驶后使用');
      return false;
    }
    const target = actors.filter(other => !other.finished && other.id !== id && this.onRoad(other)
      && other.body.distance > actor.body.distance + 2 && other.body.distance - actor.body.distance <= 180)
      .sort((a, b) => a.body.distance - b.body.distance)[0];
    if (item === 'homing' && !target) { if (id === 'player') this.tell('前方 180 米内没有可追踪目标'); return false; }
    state.held = null;
    if (item === 'boost') state.boost = Math.max(state.boost, 3);
    if (item === 'shield') state.shield = 7;
    if (item === 'banana') {
      const distance = Math.max(2, actor.body.distance - 7); const lane = actor.body.lane;
      if (this.traps.length >= MAX_TRAPS) this.traps.shift();
      this.traps.push({ id: this.serial++, owner: id, distance, lane, position: this.track.position(distance, lane), life: 24 });
    }
    if (item === 'disc' || item === 'homing') {
      const distance = actor.body.distance + 5; const lane = actor.body.lane;
      if (this.projectiles.length >= MAX_PROJECTILES) this.projectiles.shift();
      this.projectiles.push({ id: this.serial++, owner: id, kind: item, target: item === 'homing' ? target!.id : null,
        distance, lane, position: this.track.position(distance, lane), life: 4 });
    }
    if (item === 'lightning') {
      this.pulse = 0.65; this.pulsePosition = { ...actor.body.position };
      for (const other of actors) if (!other.finished && other.id !== id && Math.abs(other.body.distance - actor.body.distance) <= 180) this.hit(other, id, '雷电脉冲');
    }
    if (id === 'player') this.tell(`已使用 ${ITEMS[item].name}`);
    return true;
  }
  private hit(actor: Actor, owner: string, source: string) {
    const state = this.state(actor.id);
    if (state.immunity > 0) return;
    if (state.shield > 0) {
      state.shield = 0; state.immunity = 0.8;
      if (actor.id === 'player') this.tell(`护盾挡住了${source}`);
      else if (owner === 'player') this.tell('对手的护盾挡住了攻击');
      return;
    }
    actor.body.speed *= 0.42; state.stun = 1.15; state.immunity = 2.8; state.boost = 0;
    if (actor.id === 'player') { raceHit(actor.body as Race); this.tell(`被${source}击中 · 短暂减速`); }
    else if (owner === 'player') this.tell(`${source}命中对手`);
  }

  beginStep(dt: number, race: Race) {
    if (race.mode !== 'items') return;
    this.noticeTime = Math.max(0, this.noticeTime - dt); this.pulse = Math.max(0, this.pulse - dt);
    for (const box of this.boxes) box.cooldown = Math.max(0, box.cooldown - dt);
    const actors = this.actors(race);
    for (const actor of actors) {
      this.previous.set(actor.id, { position: { ...actor.body.position }, distance: actor.body.distance, airHeight: actor.body.airHeight });
      const state = this.state(actor.id);
      for (const timer of ['roulette', 'boost', 'shield', 'stun', 'immunity', 'aiDelay', 'padCooldown'] as const) state[timer] = Math.max(0, state[timer] - dt);
      if (actor.id === 'player' || actor.finished || !state.held || state.roulette > 0 || state.aiDelay > 0) continue;
      // Drivers save sprint for a straight and drop traps when traffic follows.
      const use = state.held === 'boost' ? Math.abs(this.track.curvature(actor.body.distance + 20)) < 0.008
        : state.held === 'banana' ? actors.some(other => other.id !== actor.id && !other.finished && actor.body.distance - other.body.distance > 0 && actor.body.distance - other.body.distance < 70)
        : true;
      if (use) this.use(race, actor.id);
      state.aiDelay = 0.65;
    }
  }
  endStep(dt: number, race: Race) {
    if (race.mode !== 'items') return;
    const actors = this.actors(race).filter(actor => !actor.finished);
    const crossings = (point: RoadPickup, heightLimit = 2.3) => actors.flatMap(actor => {
      const before = this.previous.get(actor.id);
      if (!before || !this.onRoad(actor) || actor.body.distance <= before.distance || Math.abs(actor.body.distance - point.distance) > 65) return [];
      const t = contact(before.position, actor.body.position, point.position, 2.15);
      return t === null || this.clearanceAt(actor, t) > heightLimit ? [] : [{ actor, t }];
    }).sort((a, b) => a.t - b.t || a.actor.id.localeCompare(b.actor.id));
    for (const box of this.boxes) {
      if (box.cooldown > 0) continue;
      const crossing = crossings(box).find(({ actor }) => !this.state(actor.id).held);
      if (!crossing) continue;
      const state = this.state(crossing.actor.id);
      const rank = race.standings.findIndex(row => row.id === crossing.actor.id) + 1;
      state.held = rollItem(rank, this.random()); state.roulette = 0.8; state.aiDelay = 1.5 + this.random();
      box.cooldown = 2.5;
      if (crossing.actor.id === 'player') this.tell('获得道具箱 · 正在抽取…');
    }
    for (const pad of this.pads) for (const { actor } of crossings(pad, 0.15)) {
      const state = this.state(actor.id);
      if (state.padCooldown > 0 || state.stun > 0) continue;
      state.boost = Math.max(state.boost, 1.4); state.padCooldown = 2;
      if (actor.id === 'player') this.tell('加速带 · 涡轮启动');
    }
    for (const trap of this.traps) {
      trap.life -= dt;
      const collisions = actors.flatMap(actor => {
        const before = this.previous.get(actor.id);
        if (!before || (actor.id === trap.owner && trap.life > 22.5) || !this.onRoad(actor) || Math.abs(actor.body.distance - trap.distance) > 65) return [];
        const t = contact(before.position, actor.body.position, trap.position, 2);
        return t === null || this.clearanceAt(actor, t) > 0.5 ? [] : [{ actor, t }];
      }).sort((a, b) => a.t - b.t);
      if (trap.life > 0 && collisions[0]) { this.hit(collisions[0].actor, trap.owner, '香蕉陷阱'); trap.life = 0; }
    }
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      if (projectile.life <= 0) continue;
      const before = { ...projectile.position };
      const target = actors.find(actor => actor.id === projectile.target);
      if (target && this.onRoad(target) && target.body.distance >= projectile.distance - 4) {
        projectile.lane += clamp(target.body.lane - projectile.lane, -14 * dt, 14 * dt);
      } else projectile.target = null;
      projectile.distance += (projectile.kind === 'homing' ? 110 : 95) * dt;
      projectile.position = this.track.position(projectile.distance, projectile.lane);
      const collisions = actors.flatMap(actor => {
        const previous = this.previous.get(actor.id);
        if (!previous || actor.id === projectile.owner || !this.onRoad(actor) || Math.abs(actor.body.distance - projectile.distance) > 65) return [];
        const start = { x: previous.position.x - before.x, y: 0, z: previous.position.z - before.z };
        const end = { x: actor.body.position.x - projectile.position.x, y: 0, z: actor.body.position.z - projectile.position.z };
        const t = contact(start, end, { x: 0, y: 0, z: 0 }, 2.5);
        return t === null || this.clearanceAt(actor, t) > 1.6 ? [] : [{ actor, t }];
      }).sort((a, b) => a.t - b.t);
      if (collisions[0]) { this.hit(collisions[0].actor, projectile.owner, ITEMS[projectile.kind].name); projectile.life = 0; }
      if (projectile.distance >= this.track.length) projectile.life = 0;
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].life <= 0) this.projectiles.splice(i, 1);
    for (let i = this.traps.length - 1; i >= 0; i--) if (this.traps[i].life <= 0) this.traps.splice(i, 1);
  }
}

function raceHit(race: Race) {
  race.boosting = false; race.drifting = false; race.handbrake = false;
  race.driftAngle = 0; race.handbrakeHeldTime = 0;
}

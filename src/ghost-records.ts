import { bestTime, recordKey, saveRecord } from './settings';
import { getVehicle } from './content/vehicles';
import type { Race } from './simulation/race';
import { ghostRunId, ghostTrackSignature, rankGhosts, validGhost, validGhostRun, type GhostRun } from './simulation/ghost';

export interface GhostStorage {
  load(key: string): Promise<unknown>;
  /** Read every category for a layout; spectator history is independent of driving settings. */
  loadAll?(track: string): Promise<unknown[]>;
  /** Atomically append a finish and return the retained history. */
  save(key: string, run: GhostRun): Promise<unknown>;
}

const candidates = (value: unknown): unknown[] => Array.isArray(value) ? value : [value];
type Category = Pick<Race, 'track' | 'stageId' | 'vehicleId' | 'isLongboard' | 'difficulty' | 'autoThrottle' | 'mode'>;
const snapshot = (race: Category): Category => ({ track: race.track, stageId: race.stageId, vehicleId: race.vehicleId,
  isLongboard: race.isLongboard, difficulty: race.difficulty, autoThrottle: race.autoThrottle, mode: race.mode });
const history = (value: unknown, category: Category) => candidates(value).filter((run): run is GhostRun => validGhost(run, category));

/** Large replays use asynchronous storage, leaving localStorage for small scores. */
export class IndexedGhostStorage implements GhostStorage {
  private database?: Promise<IDBDatabase>;

  private open() {
    return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dustline-ghosts', 1);
      let settled = false;
      const fail = () => { settled = true; clearTimeout(timer); reject(new Error('Ghost storage unavailable')); };
      const timer = setTimeout(fail, 2000);
      request.onupgradeneeded = () => request.result.createObjectStore('best');
      request.onerror = fail; request.onblocked = fail;
      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); this.database = undefined; };
        resolve(db);
      };
    });
  }

  async load(key: string): Promise<unknown> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('best', 'readonly');
      const request = transaction.objectStore('best').get(key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  }

  async loadAll(track: string): Promise<unknown[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('best', 'readonly');
      const request = transaction.objectStore('best').openCursor();
      const runs: unknown[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        for (const run of candidates(cursor.value)) {
          if (run && typeof run === 'object' && 'track' in run && run.track === track) runs.push(run);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(runs);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  }

  async save(key: string, run: GhostRun) {
    const db = await this.open();
    return new Promise<GhostRun[]>((resolve, reject) => {
      const transaction = db.transaction('best', 'readwrite');
      const store = transaction.objectStore('best'); const request = store.get(key);
      let retained: GhostRun[] = [];
      request.onsuccess = () => {
        const previous = candidates(request.result).filter((value): value is GhostRun => validGhostRun(value)
          && value.track === run.track && value.vehicleId === run.vehicleId
          && Math.abs(value.frames.at(-1)!.distance - run.frames.at(-1)!.distance) < 0.01);
        retained = rankGhosts([...previous, run]); store.put(retained, key);
      };
      transaction.oncomplete = () => resolve(retained);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  }
}

export class GhostRecords {
  private readonly session = new Map<string, GhostRun[]>();
  private readonly loads = new Map<string, Promise<GhostRun[]>>();
  private readonly loaded = new Set<string>();
  private writes = Promise.resolve();
  constructor(private readonly storage: GhostStorage = new IndexedGhostStorage()) {}

  private best(race: Category) {
    const stored = bestTime(race); const session = history(this.session.get(recordKey(race)), race)[0]?.totalTime;
    return session === undefined ? stored : stored === null ? session : Math.min(stored, session);
  }

  private async loadSpectator(race: Category): Promise<GhostRun[]> {
    const category = snapshot(race);
    let stored: unknown[] = [];
    let failed = false;
    try {
      stored = this.storage.loadAll
        ? await this.storage.loadAll(ghostTrackSignature(category.track))
        : [await this.storage.load(recordKey(category))];
    } catch { failed = true; }
    const runs = [...stored.flatMap(candidates), ...[...this.session.values()].flat()]
      .filter((run): run is GhostRun => {
        if (!validGhostRun(run)) return false;
        const vehicle = getVehicle(run.vehicleId);
        return vehicle.id === run.vehicleId && validGhost(run, {
          track: category.track, vehicleId: vehicle.id, isLongboard: vehicle.mode === 'longboard',
        });
      });
    if (failed && !runs.length) throw new Error('Historical replay storage unavailable');
    return rankGhosts(runs);
  }

  async load(race: Category & { spectating?: boolean }): Promise<GhostRun[]> {
    if (race.spectating) return this.loadSpectator(race);
    const category = snapshot(race); const key = recordKey(category);
    if (this.loaded.has(key)) return history(this.session.get(key), category);
    const pending = this.loads.get(key); if (pending) return pending;
    const load = (async () => {
      let stored: GhostRun[] = [];
      try { stored = history(await this.storage.load(key), category); }
      catch { /* Replays still work for this session when browser storage is disabled. */ }
      // Merge any finishes recorded while the read was pending, including slower top-five times.
      const merged = rankGhosts([...stored, ...history(this.session.get(key), category)]);
      this.session.set(key, merged); this.loaded.add(key); this.loads.delete(key);
      return merged;
    })();
    this.loads.set(key, load); return load;
  }

  /** Commit at the finish line; the delayed results dialog only presents the result. */
  save(race: Race): boolean {
    if (race.spectating || race.phase !== 'finished' || !Number.isFinite(race.totalTime) || race.totalTime <= 0) return false;
    const best = this.best(race);
    const newRecord = best === null || race.totalTime < best;
    if (newRecord) saveRecord(race.totalTime, race);
    const run = race.ghost.finish(race);
    if (validGhost(run, race, race.totalTime)) {
      const category = snapshot(race); const key = recordKey(category);
      this.session.set(key, rankGhosts([...history(this.session.get(key), category), run]));
      this.writes = this.writes.then(async () => {
        await this.load(category);
        if (!this.session.get(key)?.some(saved => ghostRunId(saved) === ghostRunId(run))) return;
        const stored = await this.storage.save(key, run);
        this.session.set(key, rankGhosts([...history(stored, category), ...history(this.session.get(key), category)]));
      }).catch(() => { /* Keep the historical ghosts available for this session. */ });
    }
    return newRecord;
  }
}

export const ghostRecords = new GhostRecords();

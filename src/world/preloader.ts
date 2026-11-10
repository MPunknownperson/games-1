import CellWorker from './cell.worker?worker&inline';
import { parseCollision, parseVisual, type ArchiveRef, type CellJob, type CellResult, type CollisionLayer, type VisualLayer } from './cellArchive';
import { WORLD_UNITS_PER_CELL } from './cells';

export interface CachedCell {
  key: string;
  revision: number;
  collision: CollisionLayer;
  visual?: VisualLayer;
}

/** Buffer collision synchronously, then decode visual vertices in a browser worker. */
export class CellPreloader {
  readonly cache = new Map<string, CachedCell>();
  private worker: Worker | null = null;
  private queue: CellJob[] = [];
  private inFlight: CellJob | null = null;
  private buffered = new Set<string>();
  private stopped = false;

  constructor(private refsFor: (key: string) => ArchiveRef[], private onVisual: (key: string) => void) {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new CellWorker();
      this.worker.onmessage = (event: MessageEvent<CellResult>) => this.accept(event.data);
      this.worker.onerror = () => {
        this.worker?.terminate(); this.worker = null;
        if (this.inFlight) this.queue.unshift(this.inFlight);
        this.inFlight = null;
        this.dispatch();
      };
    } catch { this.worker = null; }
  }

  sync(buffered: Set<string>, active: Set<string>, revision: number, origin: { x: number; z: number }) {
    if (this.stopped) return;
    this.buffered = new Set(buffered);
    for (const key of this.cache.keys()) if (!buffered.has(key)) this.cache.delete(key);
    this.queue = this.queue.filter((job) => buffered.has(job.key));
    for (const key of buffered) {
      const cached = this.cache.get(key);
      if (cached?.revision === revision) continue;
      const refs = this.refsFor(key);
      const cell: CachedCell = { key, revision, collision: parseCollision(refs) };
      if (!refs.length) cell.visual = { positions: new Float32Array(), normals: new Float32Array(), colors: new Float32Array(),
        treePositions: new Float32Array(), treeUvs: new Float32Array(), treeColors: new Float32Array(), textureKey: 'meadow-tree-atlas' };
      else this.queue.push({ key, revision, refs });
      this.cache.set(key, cell);
    }
    this.queue.sort((a, b) => {
      const priority = (job: CellJob) => {
        const [, sx, sz] = job.key.split(':');
        const x = (Number(sx) + 0.5) * WORLD_UNITS_PER_CELL, z = (Number(sz) + 0.5) * WORLD_UNITS_PER_CELL;
        return (active.has(job.key) ? -1e6 : 0) + (x - origin.x) ** 2 + (z - origin.z) ** 2;
      };
      return priority(a) - priority(b);
    });
    this.dispatch();
  }

  get(key: string) { return this.cache.get(key); }
  get bufferedCount() { return this.cache.size; }
  get visualCount() { return [...this.cache.values()].filter((cell) => !!cell.visual).length; }
  get usingWorker() { return !!this.worker; }

  private dispatch() {
    if (this.stopped || this.inFlight) return;
    let next = this.queue.shift();
    while (next && (!this.buffered.has(next.key) || this.cache.get(next.key)?.revision !== next.revision)) next = this.queue.shift();
    if (!next) return;
    this.inFlight = next;
    if (this.worker) this.worker.postMessage(next);
    else setTimeout(() => {
      if (!this.inFlight || this.stopped) return;
      const job = this.inFlight;
      this.accept({ key: job.key, revision: job.revision, stage: 'collision', layer: parseCollision(job.refs) });
      this.accept({ key: job.key, revision: job.revision, stage: 'visual', layer: parseVisual(job.refs) });
    }, 0);
  }

  private accept(result: CellResult) {
    if (this.stopped) return;
    const cell = this.cache.get(result.key);
    if (cell && cell.revision === result.revision && this.buffered.has(result.key)) {
      if (result.stage === 'collision') cell.collision = result.layer;
      else { cell.visual = result.layer; this.onVisual(result.key); }
    }
    if (result.stage === 'visual' && this.inFlight?.key === result.key && this.inFlight.revision === result.revision) {
      this.inFlight = null;
      this.dispatch();
    }
  }

  dispose() {
    this.stopped = true;
    this.worker?.terminate();
    this.worker = null;
    this.cache.clear(); this.queue.length = 0; this.inFlight = null;
  }
}
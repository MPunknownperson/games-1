import createOzzModule, { type OzzModule } from './ozz-runtime.js';

let module: OzzModule | undefined;
let pending: Promise<boolean> | undefined;
export let ozzStatus: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';

export function initializeOzz() {
  if (pending) return pending;
  ozzStatus = 'loading';
  pending = createOzzModule({ print: () => {}, printErr: () => {} }).then((loaded) => {
    module = loaded;
    ozzStatus = 'ready';
    return true;
  }).catch(() => { ozzStatus = 'fallback'; return false; });
  return pending;
}

export class OzzPose {
  readonly quaternions: Float32Array;
  readonly matrices: Float32Array;
  private handle = 0;
  private allocations: number[] = [];
  private base = 0;
  private upper = 0;
  private additive = 0;
  private mask = 0;
  private outputQuaternions = 0;
  private outputMatrices = 0;
  private target = 0;
  private rotation = 0;

  constructor(private readonly wasm: OzzModule, readonly count: number, parents: Int32Array, positions: Float32Array) {
    this.quaternions = new Float32Array(count * 4);
    this.matrices = new Float32Array(count * 16);
    const allocate = (bytes: number) => { const pointer = wasm._malloc(bytes); if (!pointer) throw new Error('ozz allocation failed'); this.allocations.push(pointer); return pointer; };
    try {
      const parentsPointer = allocate(count * 4), positionsPointer = allocate(count * 3 * 4);
      this.base = allocate(count * 4 * 4); this.upper = allocate(count * 4 * 4); this.additive = allocate(count * 4 * 4);
      this.mask = allocate(count * 4); this.outputQuaternions = allocate(count * 4 * 4); this.outputMatrices = allocate(count * 16 * 4);
      this.target = allocate(3 * 4);
      this.rotation = allocate(4 * 4);
      wasm.HEAP32.set(parents, parentsPointer >> 2);
      wasm.HEAPF32.set(positions, positionsPointer >> 2);
      this.handle = wasm._ozz_create_rig(count, parentsPointer, positionsPointer);
      if (!this.handle) throw new Error('ozz could not create the skeleton');
    } catch (error) { this.dispose(); throw error; }
  }

  private readOutput() {
    this.quaternions.set(this.wasm.HEAPF32.subarray(this.outputQuaternions >> 2, (this.outputQuaternions >> 2) + this.count * 4));
    this.matrices.set(this.wasm.HEAPF32.subarray(this.outputMatrices >> 2, (this.outputMatrices >> 2) + this.count * 16));
  }

  blend(base: Float32Array, upper: Float32Array, additive: Float32Array, mask: Float32Array,
    upperWeight: number, additiveWeight: number, hipsOffset: number) {
    if (!this.handle) return false;
    this.wasm.HEAPF32.set(base, this.base >> 2); this.wasm.HEAPF32.set(upper, this.upper >> 2);
    this.wasm.HEAPF32.set(additive, this.additive >> 2); this.wasm.HEAPF32.set(mask, this.mask >> 2);
    const ok = this.wasm._ozz_blend_pose(this.handle, this.base, this.upper, this.additive, this.mask,
      upperWeight, additiveWeight, hipsOffset, this.outputQuaternions, this.outputMatrices);
    if (ok) this.readOutput();
    return !!ok;
  }

  solveLeg(start: number, middle: number, end: number, target: { x: number; y: number; z: number }, weight: number) {
    if (!this.handle) return false;
    this.wasm.HEAPF32.set([target.x, target.y, target.z], this.target >> 2);
    const ok = this.wasm._ozz_solve_leg(this.handle, start, middle, end, this.target, weight, this.outputQuaternions, this.outputMatrices);
    if (ok) this.readOutput();
    return !!ok;
  }

  rotateJoint(joint: number, rotation: { x: number; y: number; z: number; w: number }) {
    if (!this.handle) return false;
    this.wasm.HEAPF32.set([rotation.x, rotation.y, rotation.z, rotation.w], this.rotation >> 2);
    const ok = this.wasm._ozz_rotate_joint(this.handle, joint, this.rotation, this.outputQuaternions, this.outputMatrices);
    if (ok) this.readOutput();
    return !!ok;
  }

  dispose() {
    if (this.handle) this.wasm._ozz_destroy_rig(this.handle);
    this.handle = 0;
    for (const pointer of this.allocations) this.wasm._free(pointer);
    this.allocations.length = 0;
  }
}

export function createOzzPose(parents: Int32Array, positions: Float32Array) {
  if (!module) return undefined;
  try { return new OzzPose(module, parents.length, parents, positions); } catch { return undefined; }
}
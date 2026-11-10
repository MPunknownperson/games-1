export interface OzzModule {
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _ozz_create_rig(count: number, parents: number, positions: number): number;
  _ozz_destroy_rig(handle: number): void;
  _ozz_blend_pose(handle: number, base: number, upper: number, additive: number, mask: number,
    upperWeight: number, additiveWeight: number, hipsOffset: number, quaternions: number, matrices: number): number;
  _ozz_solve_leg(handle: number, start: number, middle: number, end: number, target: number,
    weight: number, quaternions: number, matrices: number): number;
  _ozz_rotate_joint(handle: number, joint: number, rotation: number, quaternions: number, matrices: number): number;
}
export default function createOzzModule(options?: { print?: (text: string) => void; printErr?: (text: string) => void }): Promise<OzzModule>;
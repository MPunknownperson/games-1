import * as THREE from 'three';
import { INTERSECTED, NOT_INTERSECTED, ObjectBVH } from 'three-mesh-bvh';
import { spaceOf } from './cells';
import { prepareMeshBVH } from './meshAcceleration';
import type { Actor } from './simulation';

// The simulation uses cylindrical bodies. The same proxy geometry is shared by every instance.
const colliderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
colliderGeometry.translate(0, 0.5, 0);
prepareMeshBVH(colliderGeometry);
const colliderMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

interface SpaceIndex {
  mesh: THREE.InstancedMesh;
  tree: ObjectBVH;
  actors: Actor[];
  transforms: number[];
}

/** An object-level BVH over the simulation's instanced collision bodies. */
export class WorldSpatialIndex {
  private spaces = new Map<string, SpaceIndex>();
  private matrix = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private box = new THREE.Box3();
  private raycaster = new THREE.Raycaster();
  private direction = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private target = new THREE.Vector3();

  sync(actors: Actor[], space: string) {
    const current = actors.filter((a) => a.alive && spaceOf(a) === space);
    let index = this.spaces.get(space);
    const sameMembership = !!index && index.actors.length === current.length
      && current.every((a, i) => a.id === index!.actors[i].id);
    if (!current.length) {
      if (index) { index.mesh.dispose(); this.spaces.delete(space); }
      return;
    }
    if (!sameMembership) {
      index?.mesh.dispose();
      const mesh = new THREE.InstancedMesh(colliderGeometry, colliderMaterial, current.length);
      const transforms: number[] = [];
      current.forEach((a, i) => this.writeInstance(mesh, transforms, a, i));
      mesh.updateMatrixWorld(true);
      index = { mesh, tree: new ObjectBVH(mesh), actors: current, transforms };
      this.spaces.set(space, index);
      return;
    }
    let changed = false;
    current.forEach((a, i) => {
      const at = i * 5;
      if (index!.transforms[at] !== a.x || index!.transforms[at + 1] !== a.y || index!.transforms[at + 2] !== a.z
        || index!.transforms[at + 3] !== a.radius || index!.transforms[at + 4] !== a.height) {
        this.writeInstance(index!.mesh, index!.transforms, a, i);
        changed = true;
      }
    });
    index!.actors = current;
    if (changed) index!.tree.refit();
  }

  private writeInstance(mesh: THREE.InstancedMesh, transforms: number[], actor: Actor, index: number) {
    const at = index * 5;
    transforms[at] = actor.x; transforms[at + 1] = actor.y; transforms[at + 2] = actor.z;
    transforms[at + 3] = actor.radius; transforms[at + 4] = actor.height;
    this.matrix.makeScale(Math.max(0.05, actor.radius), Math.max(0.05, actor.height), Math.max(0.05, actor.radius));
    this.matrix.setPosition(actor.x, actor.y, actor.z);
    mesh.setMatrixAt(index, this.matrix);
  }

  nearby(space: string, point: Actor, radius: number): Actor[] {
    const index = this.spaces.get(space);
    if (!index) return [];
    this.sphere.center.set(point.x, point.y + Math.min(1, point.height / 2), point.z);
    this.sphere.radius = radius;
    const result: Actor[] = [];
    index.tree.shapecast({
      intersectsBounds: (box) => box.intersectsSphere(this.sphere) ? INTERSECTED : NOT_INTERSECTED,
      intersectsObject: (_mesh, instanceId) => { result.push(index.actors[instanceId]); return false; },
    });
    return result;
  }

  visible(space: string, frustum: THREE.Frustum): Set<string> {
    const index = this.spaces.get(space);
    const result = new Set<string>();
    if (!index) return result;
    index.tree.shapecast({
      intersectsBounds: (box) => frustum.intersectsBox(this.box.copy(box).expandByScalar(5)) ? INTERSECTED : NOT_INTERSECTED,
      intersectsObject: (_mesh, instanceId) => { result.add(index.actors[instanceId].id); return false; },
    });
    return result;
  }

  clearLine(space: string, from: Actor, to: Actor) {
    const index = this.spaces.get(space);
    if (!index) return true;
    this.origin.set(from.x, from.y + Math.min(1, from.height * 0.5), from.z);
    this.target.set(to.x, to.y + Math.min(1, to.height * 0.5), to.z);
    this.direction.subVectors(this.target, this.origin);
    const length = this.direction.length();
    if (length < 0.01) return true;
    this.raycaster.set(this.origin, this.direction.multiplyScalar(1 / length));
    this.raycaster.near = 0.02;
    this.raycaster.far = Math.max(0, length - 0.02);
    const hits = index.tree.raycast(this.raycaster);
    return !hits.some((hit) => {
      const actor = index.actors[hit.instanceId ?? -1];
      if (!actor || !actor.alive || !actor.solid || actor.id === from.id || actor.id === to.id) return false;
      // Characters can spawn inside a structure; do not make that structure block every attack.
      return Math.hypot(actor.x - from.x, actor.z - from.z) > actor.radius + from.radius * 0.25;
    });
  }

  get instanceCount() { return [...this.spaces.values()].reduce((sum, index) => sum + index.actors.length, 0); }
  dispose() { for (const index of this.spaces.values()) index.mesh.dispose(); this.spaces.clear(); }
}
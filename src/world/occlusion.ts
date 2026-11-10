import type { Actor, Point } from './simulation';
import { sameSpace } from './cells';
import { terrainHeight } from './terrainLod';

export interface OcclusionPlane extends Point { id: string; radius: number; height: number }

const occludingKinds = new Set<Actor['kind']>(['house', 'tavern', 'citadel', 'camp', 'tower']);

export function occlusionPlanes(camera: Point, actors: Actor[]): OcclusionPlane[] {
  const planes: OcclusionPlane[] = [];
  for (const actor of actors) if (actor.alive && sameSpace(actor, { spaceId: 'exterior' })
    && occludingKinds.has(actor.kind) && actor.radius >= 1.3) {
    planes.push({ id: actor.id, x: actor.x, z: actor.z, radius: actor.radius * 0.85, height: actor.height });
  }
  // Invisible conservative terrain planes only exist beyond the playable valley.
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    const x = Math.cos(angle) * 155, z = Math.sin(angle) * 155;
    if (terrainHeight(x, z) > 15) planes.push({ id: `hill-${i}`, x, z, radius: 10, height: terrainHeight(x, z) });
  }
  return planes.filter((plane) => Math.hypot(plane.x - camera.x, plane.z - camera.z) > plane.radius + 1);
}

/** Reject only targets fully hidden by a nearer, taller angular silhouette. */
export function isOccluded(camera: Point & { y?: number }, target: Actor | (Point & { id?: string; radius: number; height: number; neverFade?: boolean; kind?: string; questFor?: string }), planes: OcclusionPlane[]) {
  if (target.neverFade || target.questFor || target.kind === 'player' || target.kind === 'villager' || target.kind === 'foe') return false;
  const dx = target.x - camera.x, dz = target.z - camera.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 16) return false;
  const targetAngle = Math.atan2(dx, dz);
  const targetWidth = Math.atan2(target.radius, distance);
  const eye = camera.y ?? 1.7;
  for (const plane of planes) {
    if (plane.id === target.id) continue;
    const px = plane.x - camera.x, pz = plane.z - camera.z;
    const near = Math.hypot(px, pz);
    if (near + plane.radius + target.radius + 1 >= distance) continue;
    let angle = Math.atan2(px, pz) - targetAngle;
    angle = (angle + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    const cover = Math.atan2(plane.radius, near) * 0.78;
    if (Math.abs(angle) + targetWidth >= cover) continue;
    if ((plane.height - eye) / near <= (target.height - eye) / distance + 0.04) continue;
    return true;
  }
  return false;
}
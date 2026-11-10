import * as THREE from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** Preserve index order so the same geometry remains compatible with render batching. */
export function prepareMeshBVH(geometry: THREE.BufferGeometry, minTriangles = 32) {
  const triangles = (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3;
  if (!geometry.boundsTree && triangles >= minTriangles) geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
  return geometry;
}
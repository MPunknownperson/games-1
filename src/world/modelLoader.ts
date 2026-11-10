import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/** Load gltfpack's EXT_meshopt_compression output without an external decoder URL. */
export function createOptimizedModelLoader(ktx2?: KTX2Loader) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (ktx2) loader.setKTX2Loader(ktx2);
  return loader;
}
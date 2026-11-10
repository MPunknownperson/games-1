import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { ITEMS } from './items';
import { EMBEDDED_KTX2 } from './textureAssets';

export const TEXTURE_NAMES = ['grass', 'paving', 'water-normal', ...Object.keys(ITEMS).map((type) => `item-${type}`)];

export function createKTX2Loader(renderer: THREE.WebGLRenderer) {
  const loader = new KTX2Loader().setWorkerLimit(2).detectSupport(renderer);
  if (import.meta.env.DEV) loader.setTranscoderPath(`${import.meta.env.BASE_URL}node_modules/three/examples/jsm/libs/basis/`);
  return loader;
}

/** Load once before revealing the scene; unavailable textures retain their procedural fallback. */
export class CompressedTexturePack {
  private loader: KTX2Loader;
  private controller = new AbortController();
  private finish?: () => void;
  private closed = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.loader = createKTX2Loader(renderer);
  }

  load(timeoutMs = 8000): Promise<Map<string, THREE.Texture>> {
    const textures = new Map<string, THREE.Texture>();
    const init = this.loader.init();
    void init.then(() => {
      if (this.closed && this.loader.workerSourceURL) URL.revokeObjectURL(this.loader.workerSourceURL);
    }).catch(() => {});
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => this.finish?.(), timeoutMs);
      this.finish = () => {
        if (this.closed) return;
        this.closed = true;
        window.clearTimeout(timer);
        this.controller.abort();
        this.loader.dispose();
        resolve(textures);
      };
      const tasks = TEXTURE_NAMES.map(async (name) => {
        try {
          const external = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('externalTexture') : null;
          const embedded = external === name ? undefined : EMBEDDED_KTX2[name];
          let buffer: ArrayBuffer;
          if (embedded) {
            const binary = atob(embedded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            buffer = bytes.buffer;
          } else {
            const response = await fetch(`${import.meta.env.BASE_URL}textures/${name}.ktx2`, { signal: this.controller.signal });
            if (!response.ok) throw new Error(`Texture request failed: ${response.status}`);
            buffer = await response.arrayBuffer();
          }
          await init;
          if (this.closed) return;
          const texture = await new Promise<THREE.Texture>((done, fail) => this.loader.parse(buffer, done, fail));
          if (this.closed) texture.dispose();
          else textures.set(name, texture);
        } catch { /* The original CanvasTexture remains usable. */ }
      });
      void Promise.allSettled([init, ...tasks]).then(() => this.finish?.());
    });
  }

  dispose() { this.finish?.(); }
}
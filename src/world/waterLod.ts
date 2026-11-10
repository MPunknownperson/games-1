import * as THREE from 'three';

export const GLOBAL_WATER_HEIGHT = 0.055;
export const WATER_BODIES = [{ id: 'hollowroot-pool', x: 42, z: -36, radius: 11 }] as const;

export function waterGeometry(radius: number, segments: number, rings: number) {
  const positions: number[] = [0, GLOBAL_WATER_HEIGHT, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring++) {
    const r = radius * ring / rings;
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * r, GLOBAL_WATER_HEIGHT, Math.sin(angle) * r);
      uvs.push(0.5 + Math.cos(angle) * ring / rings * 0.5, 0.5 + Math.sin(angle) * ring / rings * 0.5);
    }
  }
  for (let i = 0; i < segments; i++) indices.push(0, 1 + (i + 1) % segments, 1 + i);
  for (let ring = 1; ring < rings; ring++) for (let i = 0; i < segments; i++) {
    const a = 1 + (ring - 1) * segments + i;
    const b = 1 + (ring - 1) * segments + (i + 1) % segments;
    const c = a + segments, d = b + segments;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class WaterLod {
  readonly group = new THREE.Group();
  readonly normalMap: THREE.CanvasTexture;
  private layers: { high: THREE.Mesh; low: THREE.Mesh; highMaterial: THREE.MeshPhongMaterial; lowMaterial: THREE.MeshPhongMaterial; fade: number }[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private time = 0;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const phaseX = x / 64 * Math.PI * 4, phaseY = y / 64 * Math.PI * 4;
      const i = (y * 64 + x) * 4;
      image.data[i] = 128 + Math.round(Math.cos(phaseX + Math.sin(phaseY)) * 30);
      image.data[i + 1] = 128 + Math.round(Math.cos(phaseY + Math.sin(phaseX)) * 30);
      image.data[i + 2] = 244; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.normalMap = new THREE.CanvasTexture(canvas);
    this.normalMap.wrapS = this.normalMap.wrapT = THREE.RepeatWrapping;
    this.normalMap.repeat.set(3, 3);
    for (const body of WATER_BODIES) {
      const highGeometry = waterGeometry(body.radius, 96, 4);
      const lowGeometry = waterGeometry(body.radius, 24, 1);
      this.geometries.push(highGeometry, lowGeometry);
      const common = { color: '#4b7480', specular: '#879da3', shininess: 55, normalMap: this.normalMap,
        transparent: true, depthWrite: false, side: THREE.DoubleSide } as const;
      const highMaterial = new THREE.MeshPhongMaterial({ ...common, opacity: 0 });
      const lowMaterial = new THREE.MeshPhongMaterial({ ...common, opacity: 0.78 });
      const high = new THREE.Mesh(highGeometry, highMaterial);
      const low = new THREE.Mesh(lowGeometry, lowMaterial);
      high.position.set(body.x, 0, body.z);
      low.position.set(body.x, 0, body.z);
      high.renderOrder = 2; low.renderOrder = 1;
      high.visible = false;
      this.group.add(low, high);
      this.layers.push({ high, low, highMaterial, lowMaterial, fade: 0 });
    }
  }

  update(camera: { x: number; z: number }, dt: number) {
    this.time += Math.max(0, dt);
    this.normalMap.offset.set(this.time * 0.007 % 1, this.time * 0.005 % 1);
    for (const [i, body] of WATER_BODIES.entries()) {
      const layer = this.layers[i];
      const distance = Math.hypot(camera.x - body.x, camera.z - body.z);
      const target = distance < 48 ? 1 : 0;
      layer.fade = Math.max(0, Math.min(1, layer.fade + Math.sign(target - layer.fade) * Math.min(1 / 8, dt * 2.5)));
      layer.highMaterial.opacity = layer.fade * 0.82;
      layer.lowMaterial.opacity = (1 - layer.fade) * 0.78;
      layer.high.visible = layer.fade > 0.005;
      layer.low.visible = layer.fade < 0.995;
    }
  }

  get highDetailCount() { return this.layers.filter((layer) => layer.high.visible).length; }
  get lowDetailCount() { return this.layers.filter((layer) => layer.low.visible).length; }
  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const layer of this.layers) { layer.highMaterial.dispose(); layer.lowMaterial.dispose(); }
    this.normalMap.dispose();
  }
}
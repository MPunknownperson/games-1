import * as THREE from 'three';

/** A fixed 4x4 Bayer mask keeps LOD fades spatially stable instead of shimmering over time. */
export function screenDoorMaterial<T extends THREE.Material>(source: T): T {
  const material = source.clone() as T;
  material.alphaHash = false;
  material.transparent = false;
  material.opacity = 1;
  material.userData.screenDoor = true;
  material.userData.fade = 1;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uScreenDoorFade = { value: material.userData.fade };
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float uScreenDoorFade;\nvoid main() {');
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
      #include <alphatest_fragment>
      float px = mod(floor(gl_FragCoord.x), 4.0);
      float py = mod(floor(gl_FragCoord.y), 4.0);
      float bayer = py < 1.0 ? (px < 1.0 ? 0.0 : px < 2.0 ? 8.0 : px < 3.0 ? 2.0 : 10.0)
        : py < 2.0 ? (px < 1.0 ? 12.0 : px < 2.0 ? 4.0 : px < 3.0 ? 14.0 : 6.0)
        : py < 3.0 ? (px < 1.0 ? 3.0 : px < 2.0 ? 11.0 : px < 3.0 ? 1.0 : 9.0)
        : (px < 1.0 ? 15.0 : px < 2.0 ? 7.0 : px < 3.0 ? 13.0 : 5.0);
      if (uScreenDoorFade < (bayer + 0.5) / 16.0) discard;
    `);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'stable-screen-door-v1';
  return material;
}

export function setScreenDoorFade(material: THREE.Material, fade: number) {
  material.userData.fade = Math.max(0, Math.min(1, fade));
  if (material.userData.shader) material.userData.shader.uniforms.uScreenDoorFade.value = material.userData.fade;
}
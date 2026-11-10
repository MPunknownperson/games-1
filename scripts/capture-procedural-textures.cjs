const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const url = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173/');
    url.searchParams.set('captureTextures', '1');
    await page.goto(url.href, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Begin/ }).click();
    await page.locator('.intro').waitFor({ timeout: 90000 });
    const captured = await page.evaluate(async () => {
      const { ITEMS } = await import('/src/world/items.ts');
      const renderer = window.__renderer;
      const textures = { grass: renderer.grassTexture, 'water-normal': renderer.waterLod.normalMap };
      renderer.scene.traverse((object) => {
        const map = object.material?.map;
        if (map?.isCanvasTexture && map !== renderer.grassTexture && map.image.width === 256) textures.paving = map;
      });
      for (const type of Object.keys(ITEMS)) textures[`item-${type}`] = renderer.itemTexture(type);
      if (!textures.paving) throw new Error('Could not find the paving texture');
      const images = Object.fromEntries(Object.entries(textures).map(([name, texture]) => [name, texture.image.toDataURL('image/png').split(',')[1]]));
      renderer.renderer.setPixelRatio(1);
      renderer.renderer.setSize(1600, 1000, false);
      renderer.camera.aspect = 1.6; renderer.camera.updateProjectionMatrix();
      renderer.camera.position.set(39, 23, 43); renderer.camera.lookAt(0, 3, -2); renderer.camera.updateMatrixWorld();
      renderer.sync(0, renderer.renderFocus);
      renderer.renderer.render(renderer.scene, renderer.camera);
      return { images, preview: renderer.renderer.domElement.toDataURL('image/jpeg', 0.87).split(',')[1] };
    });
    const directory = path.join('assets', 'texture-sources');
    fs.mkdirSync(directory, { recursive: true });
    for (const [name, data] of Object.entries(captured.images)) fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from(data, 'base64'));
    fs.mkdirSync('public/images', { recursive: true });
    fs.writeFileSync('public/images/meadow-preview.jpg', Buffer.from(captured.preview, 'base64'));
    console.log(`Captured ${Object.keys(captured.images).length} procedural textures and the meadow backdrop.`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
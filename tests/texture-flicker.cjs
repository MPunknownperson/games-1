const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173/';
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'];

async function start(page, externalTexture) {
  const url = new URL(baseUrl);
  if (externalTexture) url.searchParams.set('externalTexture', externalTexture);
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Begin/ }).click();
  await page.locator('.intro').waitFor({ timeout: 90000 });
  await page.keyboard.press('x');
  await page.locator('.world-fallback.is-hidden').waitFor({ timeout: 90000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.request.get(new URL('/src/world/modelLoader.ts', baseUrl).href);
    await page.waitForTimeout(1000);
    await start(page);

    const textureState = await page.evaluate(() => {
      const r = window.__renderer;
      const textures = [r.grassTexture, r.pavingTexture, r.waterLod.normalMap, ...r.itemTextures.values()];
      const size = textures.reduce((sum, texture) => sum + texture.mipmaps.reduce((n, mip) => n + mip.data.byteLength, 0), 0);
      const rgba = textures.reduce((sum, texture) => {
        const { width, height } = texture.image;
        let w = width, h = height;
        while (true) { sum += w * h * 4; if (w === 1 && h === 1) break; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
        return sum;
      }, 0);
      return { info: r.info(), color: r.grassTexture.colorSpace, normal: r.waterLod.normalMap.colorSpace,
        allHaveMips: textures.every((texture) => texture.isCompressedTexture && texture.mipmaps.length > 1), size, rgba };
    });
    assert.equal(textureState.info.ktxTextures, 29);
    assert.equal(textureState.info.textureFallbacks, 0);
    assert.equal(textureState.color, 'srgb');
    assert.equal(textureState.normal, '');
    assert.ok(textureState.allHaveMips, 'textures were not transcoded with mipmaps');
    if (textureState.info.gpuCompressedTextures === 29) {
      assert.ok(textureState.size < textureState.rgba * 0.35, `unexpected compressed GPU size: ${JSON.stringify(textureState)}`);
    }

    const gltfTexture = await page.evaluate(async () => {
      const { createKTX2Loader } = await import('/src/world/compressedTextures.ts');
      const { createOptimizedModelLoader } = await import('/src/world/modelLoader.ts');
      const { EMBEDDED_KTX2 } = await import('/src/world/textureAssets.ts');
      const ktx2 = createKTX2Loader(window.__renderer.renderer);
      try {
        const bytes = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
        const uri = `data:application/octet-stream;base64,${btoa(String.fromCharCode(...bytes))}`;
        const gltf = { asset: { version: '2.0' }, extensionsUsed: ['KHR_texture_basisu'], extensionsRequired: ['KHR_texture_basisu'],
          scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
          materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
          textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }], images: [{ uri: `data:image/ktx2;base64,${EMBEDDED_KTX2['item-crate']}` }],
          buffers: [{ uri, byteLength: bytes.length }], bufferViews: [{ buffer: 0, byteLength: bytes.length }],
          accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] };
        const model = await createOptimizedModelLoader(ktx2).parseAsync(JSON.stringify(gltf), '');
        const mesh = model.scene.getObjectByProperty('isMesh', true);
        return { compressed: !!mesh?.material.map?.isCompressedTexture, mips: mesh?.material.map?.mipmaps.length };
      } finally { ktx2.dispose(); }
    });
    assert.ok(gltfTexture.compressed && gltfTexture.mips > 1, 'KHR_texture_basisu GLTF did not load its texture');

    const resize = await page.evaluate(() => {
      const r = window.__renderer;
      r.renderer.setPixelRatio(1); r.pixelRatio = 1; r.pendingPixelRatio = null; r.resize(); r.render(0.04);
      const gl = r.renderer.getContext();
      const read = () => { const pixel = new Uint8Array(4); gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [...pixel]; };
      const before = read(), width = gl.drawingBufferWidth;
      r.adaptQuality(100); r.adaptQuality(100);
      const after = read(), queued = r.pendingPixelRatio, unchangedWidth = gl.drawingBufferWidth;
      r.render(0.04);
      return { before, after, queued, width, unchangedWidth, redrawn: read(), ratio: r.pixelRatio };
    });
    assert.deepEqual(resize.after, resize.before, 'quality adaptation cleared the frame before redraw');
    assert.equal(resize.unchangedWidth, resize.width);
    assert.ok(resize.queued < 1 && resize.ratio === resize.queued);
    assert.equal(resize.redrawn[3], 255, 'resized canvas was not redrawn atomically');

    await page.evaluate(() => {
      const r = window.__renderer, render = r.render.bind(r), prepare = r.prepareFrame.bind(r);
      const setSize = r.renderer.setSize.bind(r.renderer);
      let drawing = 0;
      window.__outsideResizes = 0;
      r.render = (...args) => { drawing++; try { return render(...args); } finally { drawing--; } };
      r.prepareFrame = (...args) => { drawing++; try { return prepare(...args); } finally { drawing--; } };
      r.renderer.setSize = (...args) => { if (!drawing) window.__outsideResizes++; return setSize(...args); };
      window.dispatchEvent(new Event('resize'));
    });

    await page.locator('canvas.view').click({ position: { x: 500, y: 380 } });
    await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas.view'));
    await page.keyboard.press('Tab');
    await page.locator('.journal').waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.system').count(), 0, 'intentional unlock opened the wrong menu');
    await page.keyboard.press('Escape');
    await page.locator('.journal').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      const w = window.__world, mara = w.npc('Mara');
      mara.goal = undefined; mara.decideIn = 99; mara.work = { x: mara.x, z: mara.z }; mara.vx = mara.vz = 0;
      w.player.x = mara.x; w.player.z = mara.z + 1.1; w.player.vx = w.player.vz = 0; w.player.facing = Math.PI;
    });
    await page.locator('.prompt', { hasText: 'Talk' }).waitFor();
    await page.locator('canvas.view').click({ position: { x: 500, y: 380 } });
    await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas.view'));
    await page.keyboard.press('e');
    await page.locator('.dialogue .speaker', { hasText: 'Mara' }).waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.system').count(), 0, 'dialogue unlock opened the system menu');
    assert.equal(await page.locator('.world-fallback.is-hidden').count(), 1, 'dialogue hid the live scene');
    await page.keyboard.press('Escape');
    await page.locator('.dialogue').waitFor({ state: 'detached' });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__world.player.y > 0.05);
    await page.keyboard.down('w'); await page.waitForTimeout(250); await page.keyboard.up('w');
    assert.equal(await page.locator('.world-fallback.is-hidden').count(), 1, 'movement hid the live scene');
    assert.equal(await page.evaluate(() => window.__renderer.info().textureFallbacks), 0);
    assert.equal(await page.evaluate(() => window.__outsideResizes), 0, 'a screen transition resized the canvas outside a draw');

    const supportsLoss = await page.evaluate(() => {
      window.__lossExtension = window.__renderer.renderer.getContext().getExtension('WEBGL_lose_context');
      if (!window.__lossExtension) return false;
      window.__lossExtension.loseContext();
      return true;
    });
    if (supportsLoss) {
      await page.locator('.graphics-recovery').waitFor();
      assert.equal(await page.locator('.world-fallback.recovering').count(), 1);
      const pausedAt = await page.evaluate(() => window.__world.elapsed);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__world.elapsed), pausedAt, 'simulation continued during context loss');
      await page.evaluate(() => window.__lossExtension.restoreContext());
      await page.locator('.graphics-recovery').waitFor({ state: 'detached', timeout: 30000 });
      await page.locator('.world-fallback.is-hidden').waitFor();
      assert.equal(await page.evaluate(() => window.__renderer.info().textureFallbacks), 0, 'textures were lost after context restoration');
    }

    await page.evaluate(() => { window.__grassBeforeTitle = window.__renderer.grassTexture; });
    await page.keyboard.press('Escape');
    await page.locator('.system').waitFor();
    await page.getByRole('button', { name: 'Save and leave to title' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('.world-fallback.is-hidden').waitFor({ timeout: 90000 });
    assert.ok(await page.evaluate(() => window.__renderer.grassTexture === window.__grassBeforeTitle), 'screen transition reloaded or swapped visible textures');
    assert.equal(await page.evaluate(() => window.__outsideResizes), 0, 'title transition cleared the canvas outside a draw');
    assert.deepEqual(errors, []);
    await page.close();

    const fallback = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await fallback.route('**/textures/item-crate.ktx2', (route) => route.abort());
    await start(fallback, 'item-crate');
    const recovered = await fallback.evaluate(() => ({ info: window.__renderer.info(),
      crateFallback: !!window.__renderer.itemTextures.get('crate')?.isCanvasTexture,
      grassCompressed: !!window.__renderer.grassTexture?.isCompressedTexture }));
    assert.equal(recovered.info.ktxTextures, 28);
    assert.equal(recovered.info.textureFallbacks, 1);
    assert.ok(recovered.crateFallback && recovered.grassCompressed, 'missing compressed texture did not retain its usable fallback');
    await fallback.close();

    const missingDecoder = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await missingDecoder.route('**/basis/basis_transcoder.wasm', (route) => route.abort());
    await start(missingDecoder);
    const decoderFallback = await missingDecoder.evaluate(() => ({ info: window.__renderer.info(),
      grassFallback: !!window.__renderer.grassTexture?.isCanvasTexture,
      itemFallback: !!window.__renderer.itemTextures.get('crate')?.isCanvasTexture }));
    assert.equal(decoderFallback.info.textureFallbacks, 29);
    assert.ok(decoderFallback.grassFallback && decoderFallback.itemFallback, 'a missing decoder left untextured models');
    await missingDecoder.close();

    const slowTexture = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await slowTexture.route('**/textures/grass.ktx2', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 9000));
      await route.continue().catch(() => {});
    });
    await start(slowTexture, 'grass');
    const slowState = await slowTexture.evaluate(() => {
      window.__grassAtReveal = window.__renderer.grassTexture;
      return { info: window.__renderer.info(), fallback: !!window.__grassAtReveal?.isCanvasTexture };
    });
    assert.ok(slowState.fallback && slowState.info.textureFallbacks >= 1, 'slow texture did not fall back before revealing the scene');
    await slowTexture.waitForTimeout(1500);
    assert.ok(await slowTexture.evaluate(() => window.__renderer.grassTexture === window.__grassAtReveal), 'a late texture swapped into a visible scene');
    await slowTexture.close();
    console.log(`Texture and flicker regressions passed; transcoded mip data ${textureState.size} bytes vs ${textureState.rgba} RGBA bytes.`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
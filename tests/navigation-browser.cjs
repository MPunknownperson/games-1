const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Begin/ }).click();
    await page.locator('.intro').waitFor({ timeout: 90000 });
    await page.keyboard.press('x');
    await page.locator('.compass').waitFor();
    await page.waitForFunction(() => window.__world.navigationInfo?.agents > 0);
    const result = await page.evaluate(() => {
      const w = window.__world, r = window.__renderer, failures = [];
      const info = r.info();
      if (info.navigation !== 'ready' || info.crowdAgents < 1 || info.navObstacles < 100 || info.bvhInstances < 100 || info.bvhGeometries < 5) failures.push('navigation or BVH was not active');
      const tree = w.actors.find((a) => a.kind === 'tree' && a.alive);
      const treeVisual = r.visuals.get(tree.id), treePool = treeVisual && r.pools.get(treeVisual.poolKey);
      if (!treePool?.mesh.geometry.boundsTree) failures.push('instanced tree geometry has no mesh BVH');
      const nav = w.navigation, exterior = nav.spaces.get('exterior');
      const crate = w.spawnItem('crate', 70, 70, 0);
      for (let i = 0; i < 80 && !exterior.obstacles.has(crate.id); i++) w.update(0.05);
      if (!exterior.obstacles.has(crate.id)) failures.push('stationary crate was not added');
      crate.x = 74; crate.z = 74; crate.sleeping = true;
      for (let i = 0; i < 80 && Math.abs((exterior.obstacles.get(crate.id)?.x ?? 0) - 74) > 0.4; i++) w.update(0.05);
      if (Math.abs((exterior.obstacles.get(crate.id)?.x ?? 0) - 74) > 0.4) failures.push('moved crate obstacle was not updated');
      crate.carriedBy = w.player.id;
      for (let i = 0; i < 80 && exterior.obstacles.has(crate.id); i++) w.update(0.05);
      if (exterior.obstacles.has(crate.id)) failures.push('carried crate still blocked navigation');
      if (!w.enterInterior(w.tavern)) failures.push('could not enter interior');
      w.update(0.05);
      if (w.navigationInfo.spaces < 2) failures.push('interior navmesh was not created');
      if (!w.leaveInterior()) failures.push('could not leave interior');
      w.update(0.05);
      if (w.navigationStatus !== 'ready') failures.push('navigation fell back after transitions');
      return { failures, info: r.info() };
    });
    assert.deepEqual(result.failures, []);
    assert.deepEqual(errors, []);
    console.log(`Browser navigation passed with ${result.info.crowdAgents} crowd agents and ${result.info.navObstacles} obstacles.`);
    await page.close();

    const fallback = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await fallback.addInitScript(() => {
      WebAssembly.instantiate = () => Promise.reject(new Error('WASM disabled for test'));
      WebAssembly.instantiateStreaming = () => Promise.reject(new Error('WASM disabled for test'));
    });
    await fallback.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await fallback.getByRole('button', { name: /^Begin/ }).click();
    await fallback.locator('.intro').waitFor({ timeout: 90000 });
    assert.equal(await fallback.evaluate(() => window.__world.navigationStatus), 'fallback');
    assert.equal(await fallback.evaluate(() => window.__renderer.info().animationRuntime), 'fallback');
    await fallback.keyboard.press('x');
    await fallback.locator('.compass').waitFor();
    const moved = await fallback.evaluate(() => {
      const w = window.__world, before = w.player.z;
      w.input = { x: 0, z: 1, sprint: false };
      for (let i = 0; i < 10; i++) w.update(0.05);
      return w.player.z !== before;
    });
    assert.ok(moved, 'the world did not remain playable after Recast initialization failed');
    await fallback.close();
    console.log('Browser navigation fallback passed with WebAssembly disabled.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
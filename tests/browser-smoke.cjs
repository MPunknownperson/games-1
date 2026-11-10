const { chromium } = require('@playwright/test');
const fs = require('node:fs');
fs.mkdirSync('test-results', { recursive: true });
const assertVisual = (name) => {
  if (fs.statSync(`test-results/${name}.png`).size < 80000) throw new Error(`${name} rendered as a blank frame`);
};
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173/';
const dev = !process.env.BASE_URL;
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /preserve/i }).waitFor();
  if (dev && !await page.evaluate(() => window.__renderer === undefined)) {
    throw new Error('The title screen initialized WebGL before the player started');
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/title.png' });
  if (dev) {
    const titleFrames = await page.evaluate(async () => {
      let frames = 0;
      const start = performance.now();
      await new Promise((resolve) => {
        const step = (now) => { frames++; if (now - start < 1000) requestAnimationFrame(step); else resolve(); };
        requestAnimationFrame(step);
      });
      return frames;
    });
    console.log(`Title frame rate: ${titleFrames} fps`);
    if (titleFrames < 24) throw new Error(`The title screen stalled (${titleFrames} fps)`);
  }
  await page.getByRole('button', { name: /^Begin/ }).click();
  await page.locator('.loading-screen').waitFor();
  await page.locator('.intro').waitFor();
  if (dev) await page.waitForFunction(() => window.__renderer?.isReady());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/intro.png' });
  assertVisual('intro');
  await page.keyboard.press('x');
  await page.locator('.compass').waitFor();
  if (dev) {
    await page.waitForFunction(() => window.__renderer.isReady());
    const streaming = await page.evaluate(() => window.__renderer.info());
    if (!streaming.worker || streaming.bufferedCells !== 36 || streaming.collisionCells !== 36
      || streaming.precombinedRefs < 20 || streaming.terrainDraws < 1 || streaming.terrainDraws > 16
      || streaming.navigation !== 'ready' || streaming.bvhGeometries < 5 || streaming.animationRuntime !== 'ready' || streaming.ozzRigs < 1) {
      throw new Error(`The worker/collision buffer was not ready: ${JSON.stringify(streaming)}`);
    }
  }
  await page.locator('.world-fallback.is-hidden').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.world-fallback')).opacity === '0');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/world.png' });
  assertVisual('world');
  if (dev) {
    const moved = await page.evaluate(async () => {
      const w = window.__world; const z0 = w.player.z;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      await new Promise((r) => setTimeout(r, 1200));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      return Math.abs(w.player.z - z0);
    });
    if (moved < 1) throw new Error(`Guardian barely moved (${moved})`);
    await page.evaluate(() => { const w = window.__world; const m = w.npc('Mara'); m.goal = undefined; m.decideIn = 99; m.work = { x: m.x, z: m.z }; m.vx = m.vz = 0; const p = w.player; p.x = m.x; p.z = m.z + 1.1; p.vx = p.vz = 0; p.facing = Math.PI; });
    await page.locator('.prompt', { hasText: 'Talk' }).waitFor();
    await page.screenshot({ path: 'test-results/prompt.png' });
    await page.keyboard.press('e');
    await page.locator('.dialogue .speaker', { hasText: 'Mara' }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'test-results/dialogue.png' });
    await page.keyboard.press('1');
    await page.locator('.dialogue .line', { hasText: 'timber and stone' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.dialogue').waitFor({ state: 'detached' });
    await page.keyboard.press('Tab');
    await page.locator('.journal .entry', { hasText: 'timber' }).waitFor();
    await page.screenshot({ path: 'test-results/journal.png' });
    await page.getByRole('button', { name: 'Pack' }).click();
    await page.locator('.pack', { hasText: 'Apple' }).waitFor();
    await page.getByRole('button', { name: 'Map' }).click();
    await page.locator('svg.map').waitFor();
    await page.keyboard.press('Escape');
    await page.keyboard.press('b');
    await page.locator('.plans', { hasText: 'Archer tower' }).waitFor();
    await page.screenshot({ path: 'test-results/plans.png' });
    await page.keyboard.press('b');
    await page.evaluate(() => { const w = window.__world; w.elapsed = (21 - 8) * 30; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/dusk.png' });
    const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return n / 2; });
    console.log(`Software-rendered frame rate: ${fps.toFixed(1)} fps`);
    await page.evaluate(() => { const w = window.__world; w.uGridsToLoad = 1; w.update(0.05); });
    await page.waitForFunction(() => window.__renderer.readyCells.size === 1);
    await page.evaluate(() => { const w = window.__world; w.player.x = -44; w.player.z = 33; w.player.vx = w.player.vz = 0; w.update(0.05); });
    await page.waitForFunction(() => window.__world.streamer.loadedCells.has('exterior:-1:0'));
    await page.waitForFunction(() => window.__renderer.readyCells.has('exterior:-1:0'));
    const fastTravel = await page.evaluate(() => {
      const w = window.__world, r = window.__renderer;
      const trees = w.actors.filter((a) => a.kind === 'tree' && a.alive && !w.streamer.isLoaded(a));
      return { info: r.info(), height: w.player.y,
        fullTrees: trees.length > 0 && trees.every((a) => {
          const visual = r.visuals.get(a.id), pool = visual && r.pools.get(visual.poolKey);
          return visual?.poolAlive && !!pool?.mesh;
        }),
        landmark: !w.streamer.loadedCells.has('exterior:0:-1') && !!r.visuals.get(w.citadel.id)?.obj.visible,
      };
    });
    if (fastTravel.info.bufferedCells !== 36 || fastTravel.info.collisionCells !== 36 || fastTravel.height < 0
      || !fastTravel.fullTrees || !fastTravel.landmark) {
      throw new Error(`Fast cell transition lost geometry or collision: ${JSON.stringify(fastTravel)}`);
    }
    await page.screenshot({ path: 'test-results/buffer-travel.png' });
    assertVisual('buffer-travel');
    await page.evaluate(() => { const w = window.__world; w.player.x = 42; w.player.z = -36; w.player.vx = w.player.vz = 0; w.update(0.05); });
    await page.waitForFunction(() => window.__renderer.info().waterHigh === 1);
    const water = await page.evaluate(() => {
      const lod = window.__renderer.waterLod, layer = lod.layers[0];
      return { highVisible: layer.high.visible, normalMap: layer.highMaterial.normalMap === lod.normalMap,
        level: layer.high.geometry.attributes.position.getY(0), lowCount: lod.lowDetailCount };
    });
    if (!water.highVisible || !water.normalMap || Math.abs(water.level - 0.055) > 1e-6 || water.lowCount !== 0) {
      throw new Error(`Water did not remain in full detail: ${JSON.stringify(water)}`);
    }
    await page.screenshot({ path: 'test-results/water-near.png' });
    const entered = await page.evaluate(() => { const w = window.__world; w.uGridsToLoad = 1; return w.enterInterior(w.tavern); });
    if (!entered) throw new Error('The tavern interior did not open');
    await page.waitForFunction(() => window.__world.streamer.loadedCells.size === 1 && window.__world.currentSpace.startsWith('interior:'));
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/interior-room.png' });
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Map' }).click();
    await page.locator('svg.map[aria-label^="Map of The Kettle"]').waitFor();
    await page.screenshot({ path: 'test-results/interior-map.png' });
    await page.keyboard.press('Escape');
    const focusKind = await page.evaluate(() => {
      const w = window.__world, exit = w.actors.find((a) => a.kind === 'portal' && a.spaceId === w.currentSpace);
      w.player.x = exit.x; w.player.z = exit.z - exit.radius - w.player.radius - 0.2;
      w.player.facing = 0; w.player.action = undefined;
      return w.focus()?.kind;
    });
    if (focusKind !== 'portal') throw new Error(`The exit could not be focused (${focusKind})`);
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__world.currentSpace === 'exterior');
    await page.evaluate(() => { window.__world.uGridsToLoad = 5; });
  }
  await page.keyboard.press('Escape');
  const streamState = await page.locator('.system .stats').innerText();
  if (!streamState.includes('36 buffered') || !streamState.includes('background stream')
    || !streamState.includes('precombined') || !streamState.includes('terrain draws') || !streamState.includes('Recast navigation') || !streamState.includes('ozz ready')) {
    throw new Error(`Production streaming worker was not active: ${streamState}`);
  }
  await page.getByRole('button', { name: 'Save and leave to title' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.compass').waitFor();
  if (dev) {
    await page.evaluate(() => { window.__savedRenderer = window.__renderer; });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save and leave to title' }).click();
    await page.getByRole('button', { name: 'Begin anew' }).click();
    await page.locator('.loading-screen').waitFor();
    await page.locator('.intro').waitFor();
    await page.keyboard.press('x');
    await page.locator('.compass').waitFor();
    await page.waitForFunction(() => window.__renderer.isReady());
    await page.locator('.world-fallback.is-hidden').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.world-fallback')).opacity === '0');
    await page.screenshot({ path: 'test-results/new-world.png' });
    assertVisual('new-world');
    if (!await page.evaluate(() => window.__renderer === window.__savedRenderer)) {
      throw new Error('Beginning anew replaced the WebGL context');
    }
  }
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: 'test-results/mobile-title.png' });
  console.log(errors.length ? `BROWSER ERRORS: ${errors.join(' | ')}` : 'Browser smoke test passed with no console errors.');
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(async (e) => { console.error(e); if (browser) await browser.close(); process.exitCode = 1; });

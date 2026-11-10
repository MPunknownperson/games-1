const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Begin/ }).click();
    await page.waitForFunction(() => window.__renderer?.isReady(), null, { timeout: 90000 });
    await page.keyboard.press('x');
    await page.locator('.compass').waitFor();

    const result = await page.evaluate(() => {
      const w = window.__world, r = window.__renderer;
      const failures = [];
      const cell = (a) => `exterior:${Math.floor(a.x / 57.6)}:${Math.floor(a.z / 57.6)}`;
      const staticKinds = new Set(['house', 'tavern', 'dungeon', 'ruin', 'pillar', 'roof', 'post', 'well', 'stall', 'table', 'bell', 'note', 'ore']);
      const check = (label) => {
        for (const a of w.actors) {
          if ((a.spaceId || 'exterior') !== 'exterior' || !a.alive) continue;
          if (a.kind === 'tree') {
            const v = r.visuals.get(a.id), pool = v && r.pools.get(v.poolKey);
            if (!v?.poolAlive || !pool?.mesh) failures.push(`${label}: missing tree ${a.id}`);
            else if (r.actorInView(a) && (!pool.mesh.visible || !r.frustum.intersectsObject(pool.mesh))) failures.push(`${label}: tree pool culled in view ${a.id}`);
          } else if (staticKinds.has(a.kind) && !a.neverFade) {
            const batch = r.staticBatches.get(cell(a));
            if (!batch || !batch.signature.includes(a.id) || (r.actorInView(a) && !batch.group.visible)) failures.push(`${label}: missing full static model ${a.id}`);
          } else if (a.kind === 'item') {
            const v = r.visuals.get(a.id);
            if (!v?.obj.visible || !v.obj.isMesh || v.obj.isLOD) failures.push(`${label}: item not full detail ${a.id}`);
          } else if ((a.kind === 'villager' && a.activity !== 'Sleeping')
            || (a.kind === 'foe' && a.hp > 0 && ['brute', 'stalker'].includes(a.foeKind))) {
            const v = r.visuals.get(a.id);
            if (!v?.obj.visible || !v.rig?.root.visible || v.low) failures.push(`${label}: rig not full detail ${a.id}`);
          }
        }
        if (r.info().waterLow !== 0 || r.info().waterHigh !== 1) failures.push(`${label}: low-detail water`);
      };

      w.uGridsToLoad = 1;
      const warmedGeometries = r.renderer.info.memory.geometries;
      const positions = [[57.59, 20], [57.61, 20], [89, 89], [-89, -89], [0, 11]];
      let unbufferedTrees = 0;
      for (const [x, z] of positions) {
        w.player.x = x; w.player.z = z; w.player.vx = w.player.vz = 0;
        w.streamer.reconcile(w.actors);
        w.streamer.update(w.player, 1, w.uExteriorCellBuffer, { x: 1, z: 0 });
        unbufferedTrees = Math.max(unbufferedTrees, w.actors.filter((a) => a.kind === 'tree' && !w.streamer.isBuffered(a)).length);
        for (let angle = 0; angle < 4; angle++) {
          r.yaw = angle * Math.PI / 2;
          r.render(0.2);
          check(`${x},${z},${angle}`);
        }
      }
      if (!unbufferedTrees) failures.push('test did not cover trees outside the physics buffer');
      if (r.renderer.info.memory.geometries !== warmedGeometries) failures.push('camera movement uploaded geometry that was not prewarmed');

      r.adaptQuality(100); r.adaptQuality(100); r.adaptQuality(100);
      r.render(0.05);
      check('reduced resolution');

      const tree = w.actors.find((a) => a.kind === 'tree' && a.alive);
      const treeVisual = r.visuals.get(tree.id), pool = r.pools.get(treeVisual.poolKey);
      const capacity = pool.mesh.count, active = pool.active;
      w.addNode('tree', tree.x, tree.z, tree.variant);
      const added = w.actors[w.actors.length - 1];
      w.streamer.reconcile(w.actors);
      r.render(0.05);
      const addedVisual = r.visuals.get(added.id);
      if (!addedVisual?.poolAlive || pool.mesh.count <= capacity || pool.active !== active + 1) failures.push('instance pool did not safely grow');
      const reusedIndex = addedVisual?.poolIndex;
      w.removeActor(added);
      w.streamer.reconcile(w.actors);
      r.render(0.05);
      if (pool.active !== active) failures.push('removed tree left an active instance');
      w.addNode('tree', tree.x, tree.z, tree.variant);
      const replacement = w.actors[w.actors.length - 1];
      w.streamer.reconcile(w.actors);
      r.render(0.05);
      if (r.visuals.get(replacement.id)?.poolIndex !== reusedIndex) failures.push('released instance slot was not reused');

      const originalPool = pool.mesh;
      if (!w.enterInterior(w.tavern)) failures.push('could not enter interior');
      r.render(0.05);
      if (r.exteriorGroup.visible || !r.interiorGroup.visible) failures.push('interior visibility is incorrect');
      if (!w.leaveInterior()) failures.push('could not leave interior');
      r.render(0.05);
      if (pool.mesh !== originalPool || !pool.active) failures.push('exterior pool was discarded across interior transition');
      check('after interior');
      return { failures: failures.slice(0, 30), count: failures.length, unbufferedTrees, info: r.info() };
    });
    if (result.count || errors.length) throw new Error(JSON.stringify({ ...result, errors }, null, 2));
    console.log(`Full-detail rendering regression passed (${result.unbufferedTrees} trees outside the buffer).`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Begin/ }).click();
    await page.locator('.intro').waitFor({ timeout: 90000 });
    await page.keyboard.press('x');
    await page.locator('.compass').waitFor();
    const result = await page.evaluate(() => {
      const w = window.__world, r = window.__renderer, player = w.player;
      player.vx = 4; player.vz = 0; player.y = 0; player.vy = 0;
      player.action = 'attack1'; player.actionT = 0.24; player.actionDur = 0.48;
      for (let i = 0; i < 20; i++) r.render(0.03);
      const rig = r.visuals.get(player.id).rig;
      const mixed = { upperWeight: rig.upperWeight, active: rig.ozzMatricesActive,
        matricesFinite: [...rig.skeleton.boneMatrices].every(Number.isFinite),
        footContact: rig.feet.some((foot) => foot.planted && foot.weight > 0.5) };
      player.y = 1; player.vy = 2;
      r.render(0.03);
      const airborne = rig.feet.every((foot) => foot.weight === 0 && !foot.planted);
      return { info: r.info(), mixed, airborne };
    });
    assert.equal(result.info.animationRuntime, 'ready');
    assert.ok(result.info.ozzRigs > 0 && result.mixed.active && result.mixed.upperWeight > 0.9);
    assert.ok(result.mixed.matricesFinite && result.mixed.footContact, `invalid layered or grounded pose: ${JSON.stringify(result)}`);
    assert.ok(result.airborne, 'foot IK remained locked while jumping');
    await page.evaluate(() => { const p = window.__world.player; p.y = p.vy = p.vx = p.vz = 0; p.action = undefined; });
    await page.keyboard.down('q'); await page.keyboard.down('Shift'); await page.keyboard.down('w');
    await page.waitForFunction(() => {
      const w = window.__world, rig = window.__renderer.visuals.get(w.player.id)?.rig;
      return w.player.blocking && Math.hypot(w.player.vx, w.player.vz) > 0.3 && rig?.upperWeight > 0.5;
    }, null, { timeout: 30000 });
    await page.keyboard.up('w'); await page.keyboard.up('Shift'); await page.keyboard.up('q');
    await page.waitForFunction(() => !window.__world.player.blocking);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Live ozz animation passed with ${result.info.ozzRigs} active rigs.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
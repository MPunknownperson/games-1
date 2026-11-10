const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173/';
const args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'];

(async () => {
  const browser = await chromium.launch({ headless: true, args });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Begin/ }).click();
    await page.locator('.intro').waitFor({ timeout: 90000 });
    await page.keyboard.press('x');
    await page.locator('.compass').waitFor();
    const result = await page.evaluate(() => {
      const w = window.__world, r = window.__renderer, player = w.player;
      const foe = w.actors.find((a) => a.kind === 'foe' && a.foeKind === 'brute');
      player.x = 40; player.z = 40; player.y = 0; player.vx = player.vz = 0; player.facing = Math.PI;
      foe.x = 40; foe.z = 38.3; foe.y = 0; foe.vx = foe.vz = 0; foe.alive = true; foe.hp = 1;
      foe.action = 'windup'; foe.actionT = 0; foe.actionDur = 10;
      for (const a of w.actors) if (a !== foe && a.solid && Math.hypot(a.x - 40, a.z - 39) < 4) { a.alive = false; a.solid = false; }
      w.streamer.reconcile(w.actors);
      w.attack();
      for (let i = 0; i < 5; i++) w.update(0.05);
      r.render(0.05);
      const snapshot = w.capturePhysicsSnapshot(), before = w.ragdollPoses()[0]?.parts[0]?.position;
      const visual = r.ragdollVisuals.get(foe.id)?.parts.size, slash = r.visuals.get(player.id)?.slash.visible;
      for (let i = 0; i < 8; i++) w.update(0.05);
      w.restorePhysicsSnapshot(snapshot);
      const after = w.ragdollPoses()[0]?.parts[0]?.position;
      return { info: r.info(), dead: !foe.alive, visual, slash, before, after, snapshotBytes: snapshot.bytes.length };
    });
    assert.equal(result.info.physics, 'ready');
    assert.ok(['simd', 'deterministic'].includes(result.info.physicsBackend));
    assert.equal(result.info.choreography, 'ready');
    assert.ok(result.dead && result.visual === 6 && result.slash, `combat did not create the expected effects: ${JSON.stringify(result)}`);
    assert.ok(result.snapshotBytes > 0);
    assert.deepEqual(result.after, result.before, 'physics snapshot did not restore the ragdoll');
    assert.deepEqual(errors, []);
    await page.close();

    const rollback = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const rollbackUrl = new URL(baseUrl); rollbackUrl.searchParams.set('physics', 'deterministic');
    await rollback.goto(rollbackUrl.href, { waitUntil: 'networkidle' });
    await rollback.getByRole('button', { name: /^Begin/ }).click();
    await rollback.locator('.intro').waitFor({ timeout: 90000 });
    assert.equal(await rollback.evaluate(() => window.__renderer.info().physicsBackend), 'deterministic');
    await rollback.close();

    const noSimd = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await noSimd.route('**/*rapier3d-simd-compat*', (route) => route.abort());
    await noSimd.goto(baseUrl, { waitUntil: 'networkidle' });
    await noSimd.getByRole('button', { name: /^Begin/ }).click();
    await noSimd.locator('.intro').waitFor({ timeout: 90000 });
    assert.equal(await noSimd.evaluate(() => window.__renderer.info().physicsBackend), 'deterministic');
    await noSimd.close();

    const editor = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await editor.route('https://updates.theatrejs.com/**', (route) => route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }));
    const url = new URL(baseUrl); url.searchParams.set('theatre', '1');
    await editor.goto(url.href, { waitUntil: 'networkidle' });
    await editor.locator('#theatrejs-studio-root').waitFor();
    await editor.waitForTimeout(2000);
    const edit = await editor.evaluate(async () => {
      const m = await import('/src/world/choreography.ts');
      await m.initializeChoreography();
      const entries = performance.getEntriesByType('resource').map((entry) => entry.name);
      const core = (await import(entries.find((entry) => entry.includes('/@theatre_core.js?')))).default;
      const studio = (await import(entries.find((entry) => entry.includes('/@theatre_studio.js?')))).default.default;
      const state = await (await fetch('/src/world/choreography.json')).json();
      const sheet = core.getProject('Preserve Choreography', { state }).sheet('Attack One');
      const timing = sheet.object('Timing', { windup: 0.2, recovery: 0.28, shakeScale: 0.055 }, { reconfigure: true });
      studio.transaction(({ set }) => set(timing.props.windup, 0.31));
      const exported = await m.exportChoreographyState();
      return { status: m.choreographyStatus, timing: m.attackTiming('attack1'),
        exported: exported.sheetsById['Attack One'].staticOverrides.byObject.Timing.windup,
        hasTracks: !!exported.sheetsById.Cinematic.sequence.tracksByObject.Camera };
    });
    assert.equal(edit.status, 'ready');
    assert.equal(edit.timing.windup, 0.31);
    assert.equal(edit.exported, 0.31);
    assert.ok(edit.hasTracks);
    await editor.getByRole('button', { name: /^Begin/ }).click();
    await editor.locator('.intro').waitFor({ timeout: 90000 });
    const editedDuration = await editor.evaluate(() => { window.__world.attack(); return window.__world.player.actionDur; });
    assert.ok(Math.abs(editedDuration - 0.59) < 1e-6, `edited wind-up was not used: ${editedDuration}`);
    await editor.close();
    console.log(`Rapier combat, snapshot, Theatre editor, and JSON export passed (${result.info.physicsBackend}).`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
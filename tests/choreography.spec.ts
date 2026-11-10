import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attackTiming, initializeChoreography, sampleAttack, sampleCinematic, sampleRecoil } from '../src/world/choreography';

test('exported Theatre state drives combat timing, effects, and cinematic movement', async () => {
  assert.equal(await initializeChoreography(), true);
  const light = attackTiming('attack1'), heavy = attackTiming('attack3');
  assert.equal(light.windup, 0.2);
  assert.ok(Math.abs(light.duration - 0.48) < 1e-9);
  assert.equal(heavy.windup, 0.4);
  const start = sampleAttack('attack1', 0);
  const impact = sampleAttack('attack1', 0.225);
  const recovered = sampleAttack('attack1', 0.48);
  assert.equal(start.effect, 0);
  assert.ok(impact.effect > 0.5 && impact.shake > 0.5, `missing impact cue: ${JSON.stringify(impact)}`);
  assert.equal(recovered.effect, 0);
  const cameraStart = sampleCinematic(0), cameraMid = sampleCinematic(0.5), cameraEnd = sampleCinematic(1);
  assert.equal(cameraStart.weight, 0);
  assert.ok(cameraMid.weight > 0.9 && cameraMid.x !== cameraStart.x);
  assert.equal(cameraEnd.weight, 0);
  assert.equal(sampleRecoil(0), 0);
  assert.ok(sampleRecoil(0.08) > 0.9);
  assert.equal(sampleRecoil(0.3), 0);
});
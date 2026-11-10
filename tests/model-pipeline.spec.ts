import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { createOptimizedModelLoader } from '../src/world/modelLoader';

test('gltfpack output decodes in Three.js without simplifying the source mesh', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'preserve-model-'));
  try {
    const size = 32;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let z = 0; z <= size; z++) for (let x = 0; x <= size; x++) {
      positions.push(x, Math.sin(x / 4) * Math.cos(z / 5), z);
    }
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const a = z * (size + 1) + x, b = a + 1, c = a + size + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const vertexBytes = Buffer.from(new Float32Array(positions).buffer);
    const indexBytes = Buffer.from(new Uint16Array(indices).buffer);
    const binary = Buffer.concat([vertexBytes, indexBytes]);
    const input = join(dir, 'source.gltf');
    const output = join(dir, 'packed.glb');
    writeFileSync(input, JSON.stringify({
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
      nodes: [{ name: 'detail-grid', mesh: 0, extras: { purpose: 'regression' } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString('base64')}`, byteLength: binary.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: vertexBytes.length, target: 34962 },
        { buffer: 0, byteOffset: vertexBytes.length, byteLength: indexBytes.length, target: 34963 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [0, -1, 0], max: [size, 1, size] },
        { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
      ],
    }));
    const run = spawnSync(process.execPath, [resolve('scripts/optimize-model.mjs'), input, output], { encoding: 'utf8' });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const packed = readFileSync(output);
    const jsonLength = packed.readUInt32LE(12);
    const json = JSON.parse(packed.subarray(20, 20 + jsonLength).toString('utf8'));
    assert.ok(json.extensionsUsed.includes('EXT_meshopt_compression'));

    const bytes = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength) as ArrayBuffer;
    const model = await createOptimizedModelLoader().parseAsync(bytes, '');
    let triangles = 0;
    model.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    });
    assert.equal(triangles, indices.length / 3, 'the full-detail model was simplified');
    assert.equal(model.scene.getObjectByName('detail-grid')?.userData.purpose, 'regression');

    const sameFile = spawnSync(process.execPath, [resolve('scripts/optimize-model.mjs'), output, output], { encoding: 'utf8' });
    assert.notEqual(sameFile.status, 0, 'the optimizer must not overwrite the source');
    assert.deepEqual(readFileSync(output), packed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';

const [inputArg, outputArg, ...extra] = process.argv.slice(2);
if (!inputArg || !outputArg || extra.length || !['.glb', '.gltf'].includes(extname(inputArg).toLowerCase())
  || extname(outputArg).toLowerCase() !== '.glb') {
  console.error('Usage: node scripts/optimize-model.mjs <input.glb|input.gltf> <output.glb>');
  process.exit(1);
}

const input = resolve(inputArg);
const output = resolve(outputArg);
let source;
try {
  source = realpathSync(input);
  if (!statSync(source).isFile()) throw new Error('Input is not a file');
} catch (error) {
  console.error(`Cannot read input model: ${error.message}`);
  process.exit(1);
}
let outputTarget = output;
try { outputTarget = realpathSync(output); } catch { /* The destination does not exist yet. */ }
if (source === outputTarget) {
  console.error('Input and output must be different files.');
  process.exit(1);
}

mkdirSync(dirname(output), { recursive: true });
const temporary = `${output}.${process.pid}.tmp.glb`;
const require = createRequire(import.meta.url);
const cli = require.resolve('gltfpack/cli.js');
const result = spawnSync(process.execPath, [cli, '-i', source, '-o', temporary,
  '-cc', '-ce', 'ext', '-si', '1', '-vp', '16', '-vt', '16', '-vn', '16', '-kn', '-ke', '-af', '0'],
{ stdio: 'inherit' });
if (result.error || result.status !== 0) {
  rmSync(temporary, { force: true });
  console.error(result.error?.message ?? `gltfpack failed with exit code ${result.status}`);
  process.exit(result.status || 1);
}
renameSync(temporary, output);
const outputBytes = statSync(output).size;
const sourceBytes = statSync(source).size;
console.log(`Optimized model written to ${output} (${outputBytes} bytes).`);
if (extname(source).toLowerCase() === '.glb') {
  console.log(`Source: ${sourceBytes} bytes; change: ${((1 - outputBytes / sourceBytes) * 100).toFixed(1)}%.`);
}
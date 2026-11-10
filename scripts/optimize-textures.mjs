import { readdir, readFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const [sourceArg = 'assets/texture-sources', outputArg = 'public/textures', ...extra] = process.argv.slice(2);
if (extra.length || resolve(sourceArg) === resolve(outputArg)) {
  console.error('Usage: node scripts/optimize-textures.mjs [source-directory] [output-directory]');
  process.exit(1);
}
const sources = (await readdir(sourceArg)).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort();
if (!sources.length) throw new Error(`No PNG or JPEG textures found in ${sourceArg}`);
await mkdir(outputArg, { recursive: true });
let inputBytes = 0, outputBytes = 0;
for (const name of sources) {
  const input = join(sourceArg, name);
  const destination = join(outputArg, `${name.slice(0, -extname(name).length)}.ktx2`);
  const normalMap = /(?:^|[-_])normal(?:[-_.]|$)/i.test(name);
  const encoded = await encodeToKTX2(await readFile(input), {
    imageDecoder: async (data) => {
      const decoded = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data: new Uint8Array(decoded.data), width: decoded.info.width, height: decoded.info.height };
    },
    isUASTC: normalMap,
    isNormalMap: normalMap,
    isPerceptual: !normalMap,
    isSetKTX2SRGBTransferFunc: !normalMap,
    isYFlip: true,
    qualityLevel: 190,
    generateMipmap: true,
  });
  const temporary = `${destination}.${process.pid}.tmp`;
  try { await writeFile(temporary, encoded); await rename(temporary, destination); }
  finally { await rm(temporary, { force: true }); }
  inputBytes += (await stat(input)).size;
  outputBytes += encoded.byteLength;
  console.log(`${name} -> ${destination} (${encoded.byteLength} bytes)`);
}
console.log(`Encoded ${sources.length} textures: ${inputBytes} -> ${outputBytes} bytes.`);
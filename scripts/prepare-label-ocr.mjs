import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'public', 'assets', 'label-ocr-v1');
const tesseract = path.dirname(require.resolve('tesseract.js/package.json'));
const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
const eng = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
const spa = path.dirname(require.resolve('@tesseract.js-data/spa/package.json'));
const files = [
  [path.join(tesseract, 'dist', 'worker.min.js'), 'worker.min.js'],
  // Use separate WASM files rather than the much larger base64-embedded builds.
  // Tesseract's pinned browser worker chooses these standard filenames.
  [path.join(core, 'tesseract-core-lstm.js'), 'tesseract-core-lstm.wasm.js'],
  [path.join(core, 'tesseract-core-lstm.wasm'), 'tesseract-core-lstm.wasm'],
  [path.join(core, 'tesseract-core-simd-lstm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [path.join(core, 'tesseract-core-simd-lstm.wasm'), 'tesseract-core-simd-lstm.wasm'],
  [path.join(eng, '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
  [path.join(spa, '4.0.0_best_int', 'spa.traineddata.gz'), 'spa.traineddata.gz'],
  [path.join(core, 'LICENSE'), 'TESSERACT-CORE-LICENSE.txt'],
  [path.join(tesseract, 'LICENSE.md'), 'TESSERACT-JS-LICENSE.md'],
];
await mkdir(target, { recursive: true });
const entries = [];
for (const [source, name] of files) {
  await copyFile(source, path.join(target, name));
  const data = await readFile(source);
  entries.push({ name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const versions = {};
for (const packageName of ['tesseract.js', 'tesseract.js-core', '@tesseract.js-data/eng', '@tesseract.js-data/spa']) {
  versions[packageName] = JSON.parse(await readFile(require.resolve(`${packageName}/package.json`), 'utf8')).version;
}
await writeFile(path.join(target, 'manifest.json'), `${JSON.stringify({ versions, files: entries }, null, 2)}\n`);
console.log('Prepared self-hosted label OCR assets.');

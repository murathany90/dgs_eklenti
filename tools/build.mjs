import { mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const out = 'dist';
await rm(out, { recursive: true, force: true });
for (const folder of ['', 'legacy', 'workers', 'assets/data', 'assets/branding', 'assets/icons']) await mkdir(join(out, folder), { recursive: true });
await copyFile('manifest.json', join(out, 'manifest.json'));
await copyFile('src/workspace/workspace.html', join(out, 'workspace.html'));
await copyFile('src/workspace/workspace.css', join(out, 'workspace.css'));
await copyFile('src/sidepanel/sidepanel.html', join(out, 'sidepanel.html'));
await copyFile('src/sidepanel/sidepanel.css', join(out, 'sidepanel.css'));
for (const file of await readdir('src/legacy')) await copyFile(join('src/legacy', file), join(out, 'legacy', file));
for (const file of await readdir('assets/data')) await copyFile(join('assets/data', file), join(out, 'assets/data', file));
for (const file of await readdir('assets/branding')) await copyFile(join('assets/branding', file), join(out, 'assets/branding', file));
for (const file of await readdir('assets/icons')) await copyFile(join('assets/icons', file), join(out, 'assets/icons', file));
for (const [file, expected] of [['ga-16.png', 16], ['ga-32.png', 32], ['ga-48.png', 48], ['ga-128.png', 128]]) {
  const bytes = await readFile(join(out, 'assets/icons', file));
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(pngSignature) || bytes.readUInt32BE(16) !== expected || bytes.readUInt32BE(20) !== expected) {
    throw new Error(`Invalid ${file}: expected a ${expected}x${expected} PNG.`);
  }
}
for (const file of await readdir('workers')) if (file.endsWith('.js')) await copyFile(join('workers', file), join(out, 'workers', file));
const capacity = JSON.parse(await readFile('assets/data/line-capacity-v1.json', 'utf8'));
await writeFile(join(out, 'capacity-data.js'), `window.__LINE_CAPACITY_DATA__=${JSON.stringify(capacity)};\n`);
for (const [entry, output, format] of [
  ['src/background/service-worker.ts', 'background.js', 'iife'],
  ['src/sidepanel/sidepanel.ts', 'sidepanel.js', 'esm'],
  ['src/workspace/workspace.ts', 'workspace.js', 'esm'],
  ['workers/parser.worker.ts', 'workers/parser.worker.js', 'iife'],
  ['workers/topology.worker.ts', 'workers/topology.worker.js', 'iife'],
]) await build({ entryPoints: [entry], outfile: join(out, output), bundle: true, format, target: 'chrome116', minify: false });
console.log('MV3 unpacked extension built at dist/');

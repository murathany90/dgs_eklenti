import { mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const out = 'dist';
await rm(out, { recursive: true, force: true });
for (const folder of ['', 'legacy', 'workers', 'assets/data']) await mkdir(join(out, folder), { recursive: true });
await copyFile('manifest.json', join(out, 'manifest.json'));
await copyFile('src/workspace/workspace.html', join(out, 'workspace.html'));
await copyFile('src/workspace/workspace.css', join(out, 'workspace.css'));
await copyFile('src/sidepanel/sidepanel.html', join(out, 'sidepanel.html'));
await copyFile('src/sidepanel/sidepanel.css', join(out, 'sidepanel.css'));
for (const file of await readdir('src/legacy')) await copyFile(join('src/legacy', file), join(out, 'legacy', file));
for (const file of await readdir('assets/data')) await copyFile(join('assets/data', file), join(out, 'assets/data', file));
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

import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files = await readdir('src/legacy');
for (const file of files.filter(name => name.endsWith('.js'))) {
  const check = spawnSync(process.execPath, ['--check', `src/legacy/${file}`], { encoding: 'utf8' });
  if (check.status !== 0) throw Error(`${file}: ${check.stderr}`);
}
for (const file of ['workers/solver.worker.js']) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw Error(`${file}: ${check.stderr}`);
}
const html = await readFile('src/workspace/workspace.html', 'utf8');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) || /<style\b/i.test(html)) throw Error('Inline script/style blocks remain');
if (/new Worker\(blobUrl\)|solverWorkerSource|new Blob\(\[`self\.onmessage/.test((await Promise.all(files.filter(name => name.endsWith('.js')).map(name => readFile(`src/legacy/${name}`, 'utf8')))).join('\n'))) throw Error('Blob worker remains');
console.log('Legacy syntax and MV3 static checks passed');

import { readFile, stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { mapElectricalNetwork } from '../src/model/dgs/electrical-network.ts';

const paths = process.argv.slice(2);
for (const path of paths) {
  try { await stat(path); } catch { console.log(JSON.stringify({ file: path, status: 'SKIPPED/SOURCE_UNAVAILABLE' })); continue; }
  const before = performance.now();
  const bytes = await readFile(path); const readMs = performance.now() - before;
  const startHash = performance.now(), hash = createHash('sha256').update(bytes).digest('hex'), hashMs = performance.now() - startHash;
  const startParse = performance.now(), raw = JSON.parse(bytes.toString('utf8')), parseMs = performance.now() - startParse;
  const startMap = performance.now(), network = mapElectricalNetwork(raw, path, hash), mapMs = performance.now() - startMap;
  const startSerialize = performance.now(), compactBytes = Buffer.byteLength(JSON.stringify(network)), serializeMs = performance.now() - startSerialize;
  console.log(JSON.stringify({ file: path, status: 'PASS', bytes: bytes.length, readMs, hashMs, parseMs, mapMs, serializeMs, compactBytes,
    completeness: network.completeness, counts: Object.fromEntries(['buses', 'lines', 'transformers', 'generators', 'loads', 'shunts', 'seriesCompensators', 'externalGrids', 'switches'].map(key => [key, network[key].length])),
    findingCounts: network.findingCounts, peakRssBytes: process.memoryUsage().rss }));
}

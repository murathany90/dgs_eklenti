import type { DgsDocument } from '../src/model/types.ts';
import { mapElectricalNetwork } from '../src/model/dgs/electrical-network.ts';

type Request = { type: 'LOAD_MODEL'; file: File; modelId: string };
const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const progress = (phase: string): void => { scope.postMessage({ type: 'PARSE_PROGRESS', phase, message: phase }); };
scope.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data.type !== 'LOAD_MODEL') return;
  const started = performance.now();
  try {
    progress('READING');
    const bytes = await event.data.file.arrayBuffer();
    const readMs = performance.now() - started;
    progress('HASHING');
    const hashStarted = performance.now();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const modelHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const hashMs = performance.now() - hashStarted;
    progress('PARSING');
    const parseStarted = performance.now();
    const model = JSON.parse(new TextDecoder().decode(bytes)) as DgsDocument;
    const parseMs = performance.now() - parseStarted;
    progress('MAPPING');
    const mapStarted = performance.now();
    const electrical = mapElectricalNetwork(model, event.data.modelId, modelHash);
    const mapMs = performance.now() - mapStarted;
    progress('VALIDATING');
    if (!model || typeof model !== 'object' || !model.ElmTerm?.Attributes || !Array.isArray(model.ElmTerm.Values)) throw Error('ElmTerm tablosu olmayan DGS JSON');
    progress('READY');
    // Legacy v5.5 still requires the raw model on the UI thread. This is the one remaining large clone.
    scope.postMessage({ type: 'PARSE_COMPLETE', model, modelHash, electrical, timings: { readMs, hashMs, parseMs, mapMs } });
  } catch (error) { scope.postMessage({ type: 'PARSE_ERROR', error: String(error) }); }
};

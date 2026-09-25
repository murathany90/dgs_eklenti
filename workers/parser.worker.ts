import type { DgsDocument } from '../src/model/types.ts';
type Request = { type: 'LOAD_MODEL'; text: string };
type Response = { type: 'PARSE_PROGRESS'; message: string } | { type: 'PARSE_COMPLETE'; model: DgsDocument } | { type: 'PARSE_ERROR'; error: string };
const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<Request>) => {
  if (event.data.type !== 'LOAD_MODEL') return;
  try {
    scope.postMessage({ type: 'PARSE_PROGRESS', message: 'JSON worker içinde ayrıştırılıyor' } satisfies Response);
    const model = JSON.parse(event.data.text) as DgsDocument;
    scope.postMessage({ type: 'PARSE_COMPLETE', model } satisfies Response);
  } catch (error) { scope.postMessage({ type: 'PARSE_ERROR', error: String(error) } satisfies Response); }
};

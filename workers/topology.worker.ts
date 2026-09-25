export {};
type TopologyRequest = { type: 'BUILD_TOPOLOGY'; nodes: string[]; edges: [string, string][] };
type TopologyResponse = { type: 'TOPOLOGY_PROGRESS'; message: string } | { type: 'TOPOLOGY_COMPLETE'; components: number; islands: string[][] } | { type: 'TOPOLOGY_ERROR'; error: string };
const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<TopologyRequest>) => {
  if (event.data.type !== 'BUILD_TOPOLOGY') return;
  try {
    scope.postMessage({ type: 'TOPOLOGY_PROGRESS', message: 'Bağlantı bileşenleri hazırlanıyor' } satisfies TopologyResponse);
    const parent = new Map(event.data.nodes.map(id => [id, id]));
    const find = (id: string): string => { const p = parent.get(id)!; if (p === id) return id; const root = find(p); parent.set(id, root); return root; };
    for (const [a, b] of event.data.edges) if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
    const groups = new Map<string, string[]>();
    for (const id of parent.keys()) { const root = find(id); const group = groups.get(root) ?? []; group.push(id); groups.set(root, group); }
    scope.postMessage({ type: 'TOPOLOGY_COMPLETE', components: groups.size, islands: [...groups.values()] } satisfies TopologyResponse);
  } catch (error) { scope.postMessage({ type: 'TOPOLOGY_ERROR', error: String(error) } satisfies TopologyResponse); }
};

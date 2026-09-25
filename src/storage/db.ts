export type Store = 'models' | 'canonical' | 'scenarios' | 'results';
export interface LatestCalculationPointer { id: string; kind: 'latest-calculation'; calculationId: string }
export interface PersistedCalculation<T = unknown> { id: string; kind: 'calculation'; keyId: string; modelHash: string; calculationId: string; savedAt: number; metadata: unknown; result: T }
const DB_NAME = 'ytbs-dgs-v6';
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['models', 'canonical', 'scenarios', 'results']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function putRecord<T extends { id: string }>(store: Store, value: T): Promise<void> {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
export async function getRecord<T>(store: Store, id: string): Promise<T | undefined> {
  const db = await openDatabase();
  try { return await new Promise<T | undefined>((resolve, reject) => { const tx = db.transaction(store, 'readonly'); const request = tx.objectStore(store).get(id); request.onsuccess = () => resolve(request.result as T | undefined); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function getAllRecords<T>(store: Store): Promise<T[]> {
  const db = await openDatabase();
  try { return await new Promise<T[]>((resolve, reject) => { const tx = db.transaction(store, 'readonly'); const request = tx.objectStore(store).getAll(); request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function saveCalculation<T>(record: PersistedCalculation<T>, latestPointerId: string, maxHistory = 20): Promise<void> {
  await putRecord('results', record);
  await putRecord<LatestCalculationPointer>('results', { id: latestPointerId, kind: 'latest-calculation', calculationId: record.calculationId });
  const history = (await getAllRecords<PersistedCalculation>('results')).filter(item => item.kind === 'calculation' && item.modelHash === record.modelHash)
    .sort((left, right) => right.savedAt - left.savedAt);
  await Promise.all(history.slice(maxHistory).map(item => deleteRecord('results', item.id)));
}
export async function getCalculation<T>(keyId: string, latestPointerId: string): Promise<PersistedCalculation<T> | undefined> {
  const pointer = await getRecord<LatestCalculationPointer>('results', latestPointerId);
  if (pointer?.kind === 'latest-calculation') {
    const record = await getRecord<PersistedCalculation<T>>('results', pointer.calculationId);
    if (record?.kind === 'calculation' && record.keyId === keyId) return record;
  }
  const records = (await getAllRecords<PersistedCalculation<T>>('results')).filter(item => item.kind === 'calculation' && item.keyId === keyId);
  return records.sort((left, right) => right.savedAt - left.savedAt)[0];
}
export async function getCalculationHistory(modelHash: string, limit = 20): Promise<PersistedCalculation[]> {
  const records = (await getAllRecords<PersistedCalculation>('results')).filter(item => item.kind === 'calculation' && item.modelHash === modelHash);
  return records.sort((left, right) => right.savedAt - left.savedAt).slice(0, limit);
}
export async function deleteRecord(store: Store, id: string): Promise<void> {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}

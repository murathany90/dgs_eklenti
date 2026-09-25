export type Store = 'models' | 'canonical' | 'scenarios' | 'results';
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
export async function deleteRecord(store: Store, id: string): Promise<void> {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}

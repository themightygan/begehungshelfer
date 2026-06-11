// Gemeinsamer IndexedDB-Zugriff für Upload-Queue (Medien + Ops) und
// Workspace-Snapshot. EIN Modul öffnet die DB (eine Version!) — zwei Module
// mit eigenen open()-Versionen würden sich gegenseitig VersionError werfen.

const DB = "begehung-media";
const VERSION = 2;

export const STORE_QUEUE = "queue";
export const STORE_WORKSPACE = "workspace";

export function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE))
        db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_WORKSPACE))
        db.createObjectStore(STORE_WORKSPACE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function objStore(store: string, mode: IDBTransactionMode) {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

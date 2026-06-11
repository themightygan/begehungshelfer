// Lokaler Upload-Puffer (IndexedDB) für Fotos/Audio bei schlechtem/keinem Netz.
// In-Memory-Spiegel ermöglicht synchrone Snapshots (useSyncExternalStore);
// IndexedDB persistiert die Daten, sodass gepufferte Medien App-Neustarts überleben.
//
// Persistiert wird ein ArrayBuffer (nicht ein Blob): WebKit/iOS-Safari kann in IDB
// abgelegte Blobs nach Session-Ende ungültig machen — ein ArrayBuffer ist robust.
// Der Blob wird beim Lesen/Senden aus (data, mime) rekonstruiert.

export type QueueKind = "foto" | "audio";
export type QueueItem = {
  id: string;
  kind: QueueKind;
  rundeId: number; // Bindung an die Runde beim Enqueue — verhindert Fehl-Zuordnung
  parzelleId: string;
  kontext?: string; // foto: zustand | mangel | beet | kompensation
  mangelId?: number;
  beetId?: number;
  data: ArrayBuffer;
  mime: string;
  ts: number;
  attempts: number;
};

const DB = "begehung-media";
const STORE = "queue";

// Ab so vielen SERVERseitigen Fehlversuchen (5xx/unerwartete 4xx) wird ein Item
// übersprungen, bis die Versuche zurückgesetzt werden (online-Event / manuell).
// Reine Netzfehler zählen NICHT — sonst würde eine Funklochphase Items vergiften.
export const MAX_ATTEMPTS = 8;

let mirror: QueueItem[] = [];
let loaded = false;
// IndexedDB-Schreibfehler (privater Modus, Speicher voll): Items leben dann nur
// im Speicher und überleben keinen Reload -> Warnung im Sync-Panel.
let persistFehler = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function objStore(mode: IDBTransactionMode) {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function loadQueue() {
  if (loaded || typeof indexedDB === "undefined") return;
  try {
    const s = await objStore("readonly");
    mirror = ((await reqP(s.getAll())) as QueueItem[]).sort((a, b) => a.ts - b.ts);
    loaded = true;
    emit();
  } catch {
    /* ignore */
  }
}

export async function enqueue(item: {
  kind: QueueKind;
  rundeId: number;
  parzelleId: string;
  kontext?: string;
  mangelId?: number;
  beetId?: number;
  blob: Blob;
  mime: string;
}) {
  const data = await item.blob.arrayBuffer();
  const full: QueueItem = {
    id: crypto.randomUUID(),
    kind: item.kind,
    rundeId: item.rundeId,
    parzelleId: item.parzelleId,
    kontext: item.kontext,
    mangelId: item.mangelId,
    beetId: item.beetId,
    data,
    mime: item.mime,
    ts: Date.now(),
    attempts: 0,
  };
  mirror = [...mirror, full];
  emit();
  try {
    const s = await objStore("readwrite");
    await reqP(s.put(full));
  } catch {
    persistFehler = true;
    mirror = [...mirror]; // neue Referenz, damit der Snapshot-Vergleich anschlägt
    emit();
  }
  return full.id;
}

export async function removeItem(id: string) {
  mirror = mirror.filter((x) => x.id !== id);
  emit();
  try {
    const s = await objStore("readwrite");
    await reqP(s.delete(id));
  } catch {
    /* ignore */
  }
}

// Versuche eines Items setzen (neue Array- UND Item-Referenz, damit
// useSyncExternalStore zuverlässig neu rendert) und in IndexedDB spiegeln.
async function setAttempts(id: string, attempts: number) {
  let updated: QueueItem | undefined;
  mirror = mirror.map((x) => {
    if (x.id !== id) return x;
    updated = { ...x, attempts };
    return updated;
  });
  if (!updated) return;
  emit();
  try {
    const s = await objStore("readwrite");
    await reqP(s.put(updated));
  } catch {
    /* ignore */
  }
}

export async function bumpAttempt(id: string) {
  const it = mirror.find((x) => x.id === id);
  if (it) await setAttempts(id, it.attempts + 1);
}

// Item als dauerhaft unzustellbar markieren (z. B. 410: Runde gelöscht/Frist
// abgelaufen) -> landet im „hängt"-Bereich des Sync-Panels (verwerfen/sichern).
export async function markTot(id: string) {
  await setAttempts(id, MAX_ATTEMPTS);
}

// Nach echtem Reconnect (online-Event) oder manuell: alle Items wieder freigeben.
export async function resetAttempts() {
  for (const it of mirror.filter((x) => x.attempts > 0)) {
    await setAttempts(it.id, 0);
  }
}

// Blob aus einem Queue-Item (für Vorschau / Versand) rekonstruieren.
export const blobVon = (it: QueueItem) => new Blob([it.data], { type: it.mime });

export const getItems = () => mirror;
export const hatPersistFehler = () => persistFehler;
export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

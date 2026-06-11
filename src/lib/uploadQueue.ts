// Lokaler Upload-Puffer (IndexedDB) für Fotos/Audio/Änderungs-Ops bei
// schlechtem/keinem Netz. In-Memory-Spiegel ermöglicht synchrone Snapshots
// (useSyncExternalStore); IndexedDB persistiert die Daten, sodass der Puffer
// App-Neustarts überlebt.
//
// Persistiert wird ein ArrayBuffer (nicht ein Blob): WebKit/iOS-Safari kann in IDB
// abgelegte Blobs nach Session-Ende ungültig machen — ein ArrayBuffer ist robust.
// Der Blob wird beim Lesen/Senden aus (data, mime) rekonstruiert.
//
// kind "op" (Stufe 2): textuelle Änderungen (Befund, Mängel, Beete …) laufen als
// idempotente SyncOps durch DIESELBE Queue — eine Outbox für alles. Die strikte
// ts-Reihenfolge stellt sicher, dass z. B. ein Mangel-Upsert vor den Fotos
// dieses Mangels beim Server ankommt.

import type { SyncOp } from "./workspaceTypes";
import { STORE_QUEUE, objStore as idbStore, reqP } from "./idb";

export type QueueKind = "foto" | "audio" | "op";
export type QueueItem = {
  id: string;
  kind: QueueKind;
  rundeId: number; // Bindung an die Runde beim Enqueue — verhindert Fehl-Zuordnung
  parzelleId: string;
  kontext?: string; // foto: zustand | mangel | beet | kompensation
  mangelId?: number; // veraltet (Server-ID) — neue Items nutzen mangelUid
  beetId?: number; // veraltet (Server-ID) — neue Items nutzen beetUid
  mangelUid?: string;
  beetUid?: string;
  data: ArrayBuffer; // bei kind "op": leer
  mime: string;
  ts: number;
  attempts: number;
  op?: SyncOp; // nur kind "op"
  // Koaleszierung: neuere Op ersetzt ältere mit gleichem Schlüssel (z. B.
  // mehrfaches Befund-Speichern), behält aber den ÄLTESTEN ts (Reihenfolge!).
  koaleszKey?: string;
};

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

const objStore = (mode: IDBTransactionMode) => idbStore(STORE_QUEUE, mode);

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

async function persistiere(full: QueueItem) {
  try {
    const s = await objStore("readwrite");
    await reqP(s.put(full));
  } catch {
    persistFehler = true;
    mirror = [...mirror]; // neue Referenz, damit der Snapshot-Vergleich anschlägt
    emit();
  }
}

export async function enqueue(item: {
  kind: QueueKind;
  rundeId: number;
  parzelleId: string;
  kontext?: string;
  mangelUid?: string;
  beetUid?: string;
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
    mangelUid: item.mangelUid,
    beetUid: item.beetUid,
    data,
    mime: item.mime,
    ts: Date.now(),
    attempts: 0,
  };
  mirror = [...mirror, full];
  emit();
  await persistiere(full);
  return full.id;
}

// Änderungs-Op in die Outbox legen. Gleicher koaleszKey ersetzt die ältere Op
// (z. B. wiederholtes Befund-Speichern), behält aber deren ts — sonst könnte
// eine koaleszierte Mangel-Op HINTER ihre bereits gepufferten Fotos rutschen.
export async function enqueueOp(item: {
  rundeId: number;
  parzelleId: string;
  op: SyncOp;
  koaleszKey?: string;
}) {
  const alt = item.koaleszKey
    ? mirror.find((x) => x.kind === "op" && x.koaleszKey === item.koaleszKey)
    : undefined;
  // Immer NEUE id (alter Eintrag wird entfernt): wäre die alte Op gerade „in
  // flight", würde ihr Erfolg sonst die ersetzte Fassung ungesendet löschen.
  const full: QueueItem = {
    id: crypto.randomUUID(),
    kind: "op",
    rundeId: item.rundeId,
    parzelleId: item.parzelleId,
    data: new ArrayBuffer(0),
    mime: "application/json",
    ts: alt?.ts ?? Date.now(),
    attempts: 0,
    op: item.op,
    koaleszKey: item.koaleszKey,
  };
  mirror = [...mirror.filter((x) => x.id !== alt?.id), full].sort((a, b) => a.ts - b.ts);
  emit();
  try {
    const s = await objStore("readwrite");
    if (alt) await reqP(s.delete(alt.id));
    await reqP(s.put(full));
  } catch {
    persistFehler = true;
    mirror = [...mirror];
    emit();
  }
  return full.id;
}

// Items nach Prädikat entfernen (z. B. gepufferte Fotos eines gelöschten Mangels).
export async function removeItemsWo(praedikat: (it: QueueItem) => boolean) {
  const weg = mirror.filter(praedikat);
  if (weg.length === 0) return;
  mirror = mirror.filter((x) => !praedikat(x));
  emit();
  try {
    const s = await objStore("readwrite");
    for (const it of weg) await reqP(s.delete(it.id));
  } catch {
    /* ignore */
  }
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

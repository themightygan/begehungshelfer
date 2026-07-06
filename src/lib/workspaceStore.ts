// Lokaler Workspace für den Offline-Begehungsmodus (Stufe 2).
//
// Prinzip: SICHT = Server-Snapshot ⊕ Replay der ausstehenden Ops.
//  - serverSnap: letzter bekannter Server-Stand (IndexedDB-persistiert),
//    inklusive der bereits BESTÄTIGTEN eigenen Ops (verarbeiteAck wendet jede
//    quittierte Op direkt auf serverSnap an -> kein Flicker, Reload-sicher).
//  - Ausstehende Ops liegen in der Upload-Queue (uploadQueue, kind "op") und
//    werden für die Anzeige auf einen Klon der betroffenen Parzellen gespielt.
//  - Jede Mutation hier erzeugt NUR eine Op (koalesziert) — die Sicht ergibt
//    sich aus dem Replay, es gibt keinen zweiten Zustand, der divergieren kann.

import {
  enqueueOp,
  getItems,
  removeItemsWo,
  subscribe as queueSubscribe,
  type QueueItem,
} from "./uploadQueue";
import { STORE_WORKSPACE, objStore, reqP } from "./idb";
import type {
  SnapBefund,
  SnapParzelle,
  SyncOp,
  WorkspaceSnapshot,
} from "./workspaceTypes";

export type WorkspaceStatus =
  | "laden" // erster Ladevorgang läuft
  | "bereit" // Sicht verfügbar (frisch oder aus IndexedDB)
  | "keineRunde" // Server: keine aktive Begehung in der Session
  | "loginNoetig" // Session abgelaufen
  | "leer"; // offline und kein gespeicherter Snapshot

export type WorkspaceZustand = {
  status: WorkspaceStatus;
  sicht: WorkspaceSnapshot | null;
  stand: string | null; // Zeitpunkt des Server-Snapshots (Anzeige „Stand …")
  veraltet: boolean; // letzter Server-Abgleich fehlgeschlagen (offline)
};

let serverSnap: WorkspaceSnapshot | null = null;
let zustand: WorkspaceZustand = { status: "laden", sicht: null, stand: null, veraltet: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getZustand = () => zustand;
export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// --- IndexedDB-Persistenz (ein Snapshot, Schlüssel "snapshot") ---

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persistiere() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!serverSnap) return;
    try {
      const s = await objStore(STORE_WORKSPACE, "readwrite");
      await reqP(s.put(serverSnap, "snapshot"));
    } catch {
      /* Quota/privater Modus — Sicht lebt dann nur im Speicher */
    }
  }, 800);
}

async function ladeAusIDB(): Promise<WorkspaceSnapshot | null> {
  try {
    const s = await objStore(STORE_WORKSPACE, "readonly");
    return ((await reqP(s.get("snapshot"))) as WorkspaceSnapshot) ?? null;
  } catch {
    return null;
  }
}

// --- Op auf eine Parzelle anwenden (mutiert) — für Replay UND Ack ---

function leererBefund(): SnapBefund {
  return {
    stufe: "neutral",
    notiz: "",
    diktatNachgereicht: "",
    gutGemacht: false,
    plakettenNotiz: "",
    kompObstAnzahl: 0,
    kompObstFlaecheM2: 0,
    kompBeerenAnzahl: 0,
    kompBeerenFlaecheM2: 0,
    kompensationNotiz: "",
    kompensationAusreichend: false,
    maengel: [],
    beete: [],
    zustandFotos: [],
    kompFotos: [],
  };
}

function wendeOpAn(p: SnapParzelle, op: SyncOp) {
  if (op.art === "behobenToggle") {
    const m = p.offeneFruehere.find((x) => x.uid === op.uid);
    if (m) m.behoben = op.behoben;
    return;
  }
  const b = (p.befund ??= leererBefund());
  switch (op.art) {
    case "befund":
      b.stufe = op.stufe;
      b.notiz = op.notiz;
      b.gutGemacht = op.gutGemacht;
      b.plakettenNotiz = op.gutGemacht ? op.plakettenNotiz : "";
      break;
    case "kompensation":
      b.kompObstAnzahl = op.obstAnzahl;
      b.kompObstFlaecheM2 = op.obstFlaecheM2;
      b.kompBeerenAnzahl = op.beerenAnzahl;
      b.kompBeerenFlaecheM2 = op.beerenFlaecheM2;
      b.kompensationNotiz = op.notiz;
      b.kompensationAusreichend = op.ausreichend;
      break;
    case "mangelUpsert": {
      const m = b.maengel.find((x) => x.uid === op.uid);
      if (m) {
        m.punkt = op.punkt;
        m.notiz = op.notiz;
        m.frist = op.frist;
      } else {
        b.maengel.push({
          uid: op.uid,
          katalogId: op.katalogId,
          bereich: op.bereich,
          punkt: op.punkt,
          notiz: op.notiz,
          frist: op.frist,
          diktatNachgereicht: "",
          fotos: [],
        });
      }
      break;
    }
    case "mangelLoeschen":
      b.maengel = b.maengel.filter((x) => x.uid !== op.uid);
      break;
    case "beetUpsert": {
      const beet = b.beete.find((x) => x.uid === op.uid);
      if (beet) {
        beet.bezeichnung = op.bezeichnung;
        beet.flaecheM2 = op.flaecheM2;
      } else {
        b.beete.push({ uid: op.uid, bezeichnung: op.bezeichnung, flaecheM2: op.flaecheM2, fotos: [] });
      }
      break;
    }
    case "beetLoeschen":
      b.beete = b.beete.filter((x) => x.uid !== op.uid);
      break;
    case "fotoLoeschen": {
      const weg = (f: { id: number }) => f.id !== op.fotoId;
      b.zustandFotos = b.zustandFotos.filter(weg);
      b.kompFotos = b.kompFotos.filter(weg);
      for (const m of b.maengel) m.fotos = m.fotos.filter(weg);
      for (const beet of b.beete) beet.fotos = beet.fotos.filter(weg);
      break;
    }
  }
}

// --- Sicht = serverSnap ⊕ Replay der ausstehenden Ops ---

function rechneSicht(statusNeu?: WorkspaceStatus) {
  const status = statusNeu ?? (serverSnap ? "bereit" : zustand.status);
  if (!serverSnap) {
    zustand = { ...zustand, status, sicht: null, stand: null };
    emit();
    return;
  }
  const rundeId = serverSnap.runde.id;
  const ops = getItems().filter((it) => it.kind === "op" && it.rundeId === rundeId);
  let sicht = serverSnap;
  if (ops.length > 0) {
    const proParzelle = new Map<string, QueueItem[]>();
    for (const it of ops) {
      const liste = proParzelle.get(it.parzelleId) ?? [];
      liste.push(it);
      proParzelle.set(it.parzelleId, liste);
    }
    sicht = {
      ...serverSnap,
      parzellen: serverSnap.parzellen.map((p) => {
        const meine = proParzelle.get(p.parzelleId);
        if (!meine) return p;
        const klon = structuredClone(p);
        for (const it of meine) wendeOpAn(klon, it.op!);
        return klon;
      }),
    };
  }
  zustand = { ...zustand, status, sicht, stand: serverSnap.stand };
  emit();
}

// Queue-Änderungen (neue Ops, gesendete Ops, Medien) -> Sicht neu ableiten.
let queueAbo = false;
function aboSicherstellen() {
  if (queueAbo) return;
  queueAbo = true;
  queueSubscribe(() => rechneSicht());
}

// --- Laden / Server-Abgleich ---

export async function aktualisiereVomServer(): Promise<boolean> {
  try {
    const r = await fetch("/api/begehung/snapshot");
    if (r.redirected) {
      rechneSicht(serverSnap ? "bereit" : "loginNoetig");
      zustand = { ...zustand, veraltet: true };
      emit();
      return false;
    }
    if (r.status === 409) {
      // Keine aktive Runde in der Session (Server ist online die Autorität).
      serverSnap = null;
      rechneSicht("keineRunde");
      return false;
    }
    if (!r.ok) throw new Error(String(r.status));
    serverSnap = (await r.json()) as WorkspaceSnapshot;
    persistiere();
    zustand = { ...zustand, veraltet: false };
    rechneSicht("bereit");
    return true;
  } catch {
    // Offline o. Ä.: vorhandenen Stand weiterverwenden, als veraltet markieren.
    zustand = { ...zustand, veraltet: true };
    rechneSicht(serverSnap ? "bereit" : "leer");
    return false;
  }
}

let ladePromise: Promise<void> | null = null;
export function ladeWorkspace(): Promise<void> {
  aboSicherstellen();
  if (ladePromise) {
    // Erneuter Mount in derselben Browser-Session (z. B. Rundenwechsel über
    // „beitreten"): frischen Server-Abgleich anstoßen, sonst bliebe der
    // Snapshot der vorherigen Runde stehen.
    aktualisiereVomServer();
    return ladePromise;
  }
  ladePromise = (async () => {
    serverSnap = await ladeAusIDB();
    if (serverSnap) rechneSicht("bereit"); // sofort letzter Stand, Abgleich folgt
    await aktualisiereVomServer();
  })();
  return ladePromise;
}

// --- Mutationen (erzeugen koaleszierte Ops; Sicht folgt via Replay) ---

function parzelle(pid: string): SnapParzelle | undefined {
  return zustand.sicht?.parzellen.find((p) => p.parzelleId === pid);
}
function rundeIdAktiv(): number {
  const id = zustand.sicht?.runde.id ?? serverSnap?.runde.id;
  if (!id) throw new Error("Kein Workspace geladen.");
  return id;
}

export function speichereBefund(
  pid: string,
  daten: Partial<{ stufe: string; notiz: string; gutGemacht: boolean; plakettenNotiz: string }>
) {
  const rundeId = rundeIdAktiv();
  const b = parzelle(pid)?.befund ?? leererBefund();
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `befund:${rundeId}:${pid}`,
    op: {
      art: "befund",
      stufe: daten.stufe ?? b.stufe,
      notiz: daten.notiz ?? b.notiz,
      gutGemacht: daten.gutGemacht ?? b.gutGemacht,
      plakettenNotiz: daten.plakettenNotiz ?? b.plakettenNotiz,
    },
  });
}

export function speichereKompensation(
  pid: string,
  daten: Partial<{
    obstAnzahl: number;
    obstFlaecheM2: number;
    beerenAnzahl: number;
    beerenFlaecheM2: number;
    notiz: string;
    ausreichend: boolean;
  }>
) {
  const rundeId = rundeIdAktiv();
  const b = parzelle(pid)?.befund ?? leererBefund();
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `komp:${rundeId}:${pid}`,
    op: {
      art: "kompensation",
      obstAnzahl: daten.obstAnzahl ?? b.kompObstAnzahl,
      obstFlaecheM2: daten.obstFlaecheM2 ?? b.kompObstFlaecheM2,
      beerenAnzahl: daten.beerenAnzahl ?? b.kompBeerenAnzahl,
      beerenFlaecheM2: daten.beerenFlaecheM2 ?? b.kompBeerenFlaecheM2,
      notiz: daten.notiz ?? b.kompensationNotiz,
      ausreichend: daten.ausreichend ?? b.kompensationAusreichend,
    },
  });
}

export function mangelHinzufuegen(
  pid: string,
  katalog: { id: number; bereich: string; punkt: string } | null
): string {
  const rundeId = rundeIdAktiv();
  const uid = crypto.randomUUID();
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `mangel:${uid}`,
    op: {
      art: "mangelUpsert",
      uid,
      katalogId: katalog?.id ?? null,
      bereich: katalog?.bereich ?? "Sonstiges",
      punkt: katalog?.punkt ?? "",
      notiz: "",
      frist: null,
    },
  });
  return uid;
}

export function mangelAendern(
  pid: string,
  uid: string,
  daten: Partial<{ punkt: string; notiz: string; frist: string | null }>
) {
  const rundeId = rundeIdAktiv();
  const m = parzelle(pid)?.befund?.maengel.find((x) => x.uid === uid);
  if (!m) return;
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `mangel:${uid}`,
    op: {
      art: "mangelUpsert",
      uid,
      katalogId: m.katalogId,
      bereich: m.bereich,
      punkt: daten.punkt ?? m.punkt,
      notiz: daten.notiz ?? m.notiz,
      frist: daten.frist === undefined ? m.frist : daten.frist,
    },
  });
}

export async function mangelEntfernen(pid: string, uid: string) {
  const rundeId = rundeIdAktiv();
  // Ausstehende Upserts/Medien dieses Mangels sind hinfällig -> aus der Queue.
  await removeItemsWo(
    (it) =>
      (it.kind === "op" && it.koaleszKey === `mangel:${uid}`) ||
      ((it.kind === "foto" || it.kind === "audio") && it.mangelUid === uid)
  );
  // Löschen-Op IMMER senden: der Upsert könnte schon (oder gerade) beim Server
  // angekommen sein; deleteMany über uid ist idempotent (no-op, wenn unbekannt).
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `mangelweg:${uid}`,
    op: { art: "mangelLoeschen", uid },
  });
}

export function beetHinzufuegen(pid: string, daten: { bezeichnung: string; flaecheM2: number }): string {
  const rundeId = rundeIdAktiv();
  const uid = crypto.randomUUID();
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `beet:${uid}`,
    op: { art: "beetUpsert", uid, bezeichnung: daten.bezeichnung, flaecheM2: daten.flaecheM2 },
  });
  return uid;
}

export function beetAendern(
  pid: string,
  uid: string,
  daten: Partial<{ bezeichnung: string; flaecheM2: number }>
) {
  const rundeId = rundeIdAktiv();
  const beet = parzelle(pid)?.befund?.beete.find((x) => x.uid === uid);
  if (!beet) return;
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `beet:${uid}`,
    op: {
      art: "beetUpsert",
      uid,
      bezeichnung: daten.bezeichnung ?? beet.bezeichnung,
      flaecheM2: daten.flaecheM2 ?? beet.flaecheM2,
    },
  });
}

export async function beetEntfernen(pid: string, uid: string) {
  const rundeId = rundeIdAktiv();
  await removeItemsWo(
    (it) =>
      (it.kind === "op" && it.koaleszKey === `beet:${uid}`) ||
      (it.kind === "foto" && it.beetUid === uid)
  );
  enqueueOp({
    rundeId,
    parzelleId: pid,
    koaleszKey: `beetweg:${uid}`,
    op: { art: "beetLoeschen", uid },
  });
}

export function behobenSetzen(pid: string, uid: string, behoben: boolean) {
  enqueueOp({
    rundeId: rundeIdAktiv(),
    parzelleId: pid,
    koaleszKey: `behoben:${uid}`,
    op: { art: "behobenToggle", uid, behoben },
  });
}

export function fotoLoeschen(pid: string, fotoId: number) {
  enqueueOp({
    rundeId: rundeIdAktiv(),
    parzelleId: pid,
    koaleszKey: `fotoweg:${fotoId}`,
    op: { art: "fotoLoeschen", fotoId },
  });
}

// --- Ack vom Sync-Worker (MediaSync): quittierte Items in den Server-Stand
// übernehmen, BEVOR sie aus der Queue verschwinden -> kein Flicker. ---

export async function verarbeiteAck(
  item: QueueItem,
  antwort: { id?: number; dateipfad?: string; kontext?: string; text?: string }
) {
  if (!serverSnap) serverSnap = await ladeAusIDB();
  if (!serverSnap || serverSnap.runde.id !== item.rundeId) return; // anderer Kontext
  const p = serverSnap.parzellen.find((x) => x.parzelleId === item.parzelleId);
  if (!p) return;

  if (item.kind === "op" && item.op) {
    wendeOpAn(p, item.op);
  } else if (item.kind === "foto" && antwort.id && antwort.dateipfad) {
    const b = (p.befund ??= leererBefund());
    const foto = { id: antwort.id, pfad: antwort.dateipfad };
    const kontext = antwort.kontext ?? item.kontext;
    const mangel = item.mangelUid ? b.maengel.find((m) => m.uid === item.mangelUid) : undefined;
    // Beleg-Foto zu einem offenen Mangel aus einer FRÜHEREN Begehung
    // (Nachverfolgungs-Abgleich): dort einsortieren, nicht als Zustand.
    const frueher = item.mangelUid && !mangel
      ? p.offeneFruehere.find((m) => m.uid === item.mangelUid)
      : undefined;
    const beet = item.beetUid ? b.beete.find((x) => x.uid === item.beetUid) : undefined;
    if (kontext === "mangel" && mangel) mangel.fotos.push(foto);
    else if (kontext === "mangel" && frueher) (frueher.fotos ??= []).push(foto);
    else if (kontext === "beet" && beet) beet.fotos.push(foto);
    else if (kontext === "kompensation") b.kompFotos.push(foto);
    else b.zustandFotos.push(foto);
  } else if (item.kind === "audio" && antwort.text) {
    const b = (p.befund ??= leererBefund());
    const mangel = item.mangelUid ? b.maengel.find((m) => m.uid === item.mangelUid) : undefined;
    const ziel = mangel ?? b;
    ziel.diktatNachgereicht = ziel.diktatNachgereicht
      ? `${ziel.diktatNachgereicht}\n${antwort.text}`
      : antwort.text;
  }

  persistiere();
  rechneSicht();
}

// Workspace-Daten verwerfen (z. B. nach Rundenwechsel nicht nötig — Snapshot
// wird ohnehin überschrieben; vorgesehen für explizites Aufräumen).
export async function verwerfeWorkspace() {
  serverSnap = null;
  try {
    const s = await objStore(STORE_WORKSPACE, "readwrite");
    await reqP(s.delete("snapshot"));
  } catch {
    /* ignore */
  }
  rechneSicht("leer");
}

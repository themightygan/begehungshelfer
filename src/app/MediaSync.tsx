"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Camera, Hourglass, Mic, PenLine, TriangleAlert } from "lucide-react";
import {
  subscribe,
  getItems,
  loadQueue,
  removeItem,
  bumpAttempt,
  markTot,
  resetAttempts,
  hatPersistFehler,
  blobVon,
  MAX_ATTEMPTS,
  type QueueItem,
} from "@/lib/uploadQueue";
import { verarbeiteAck } from "@/lib/workspaceStore";

// Stabile Server-/Initial-Snapshot-Referenz (kein Hydration-Mismatch).
const EMPTY: QueueItem[] = [];
const INTERVALL_MS = 20000;
// Großzügig: auch ein Original-HEIC (~8 MB) über langsames Mobilfunknetz.
const TIMEOUT_MS = 120000;

// fetch mit Timeout — ein hängender Request (sehr langsames Netz) darf den
// Drain nicht dauerhaft blockieren. Abbruch wirft -> zählt als Netzfehler.
async function fetchMitTimeout(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

type SendErgebnis = "erledigt" | "warten" | "serverfehler" | "tot";
// Quittungs-Daten für den Workspace-Store (Foto: wohin einsortieren; Audio: Text).
type SendResultat = {
  ergebnis: SendErgebnis;
  ack?: { id?: number; dateipfad?: string; kontext?: string; text?: string };
};

// Antwort-Mapping (Konvention mit /api/foto + /api/notiz-append):
//   2xx                  -> erledigt (aus Queue entfernen — NUR bei explizitem Erfolg)
//   redirect/401/403/409 -> warten (Session/Access abgelaufen o. Ä. — gepuffert
//                           lassen, zählt NICHT als Fehlversuch)
//   410                  -> tot (Runde gelöscht / Gnadenfrist vorbei — bleibt
//                           gepuffert, manuell sichern/verwerfen)
//   sonst (4xx/5xx)      -> serverfehler (zählt Richtung MAX_ATTEMPTS)
function bewerte(r: Response): SendErgebnis {
  if (r.redirected) return "warten";
  if (r.ok) return "erledigt";
  if (r.status === 401 || r.status === 403 || r.status === 409) return "warten";
  if (r.status === 410) return "tot";
  return "serverfehler";
}

// Ein Item senden. Netzfehler (fetch wirft) -> Drain abbrechen, später erneut.
async function sendItem(it: QueueItem): Promise<SendResultat> {
  // Änderungs-Op (Stufe 2): idempotent, winzig — einzeln an /api/sync.
  if (it.kind === "op") {
    const r = await fetchMitTimeout("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rundeId: it.rundeId, parzelleId: it.parzelleId, op: it.op }),
    });
    return { ergebnis: bewerte(r) };
  }

  if (it.kind === "foto") {
    const fd = new FormData();
    fd.append("rundeId", String(it.rundeId));
    fd.append("parzelleId", it.parzelleId);
    if (it.kontext) fd.append("kontext", it.kontext);
    if (it.mangelUid) fd.append("mangelUid", it.mangelUid);
    if (it.beetUid) fd.append("beetUid", it.beetUid);
    if (it.mangelId != null) fd.append("mangelId", String(it.mangelId)); // Alt-Items
    if (it.beetId != null) fd.append("beetId", String(it.beetId));
    fd.append("foto", blobVon(it), "foto");
    const r = await fetchMitTimeout("/api/foto", { method: "POST", body: fd });
    const ergebnis = bewerte(r);
    if (ergebnis !== "erledigt") return { ergebnis };
    const ack = (await r.json().catch(() => ({}))) as SendResultat["ack"];
    return { ergebnis, ack };
  }

  // Audio: erst transkribieren, dann serverseitig an „Nachgereichte Diktate" anhängen.
  const fda = new FormData();
  fda.append("audio", blobVon(it), "diktat");
  const tr = await fetchMitTimeout("/api/transkript", { method: "POST", body: fda });
  const trErgebnis = bewerte(tr);
  if (trErgebnis !== "erledigt") return { ergebnis: trErgebnis };
  const { text } = (await tr.json()) as { text?: string };
  if (!text) return { ergebnis: "erledigt" }; // nichts erkannt -> Item erledigt
  const ar = await fetchMitTimeout("/api/notiz-append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rundeId: it.rundeId,
      parzelleId: it.parzelleId,
      mangelUid: it.mangelUid,
      mangelId: it.mangelId, // Alt-Items
      text,
    }),
  });
  return { ergebnis: bewerte(ar), ack: { text } };
}

// Gepuffertes Foto als Datei sichern (letzter Ausweg bei „toten" Items).
function itemSichern(it: QueueItem) {
  const url = URL.createObjectURL(blobVon(it));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${it.parzelleId}-${new Date(it.ts).toISOString().slice(0, 16).replace(":", "-")}.${it.kind === "foto" ? "jpg" : "webm"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// App-weiter Sync-Worker: lädt gepufferte Medien im Hintergrund hoch, sobald
// Empfang besteht. Läuft solange die App offen ist (Mount, online-Event, Intervall,
// nach jedem Enqueue). Kein Service Worker (iOS-Realität).
export function MediaSync() {
  const router = useRouter();
  const items = useSyncExternalStore(subscribe, getItems, () => EMPTY);
  const [panelOffen, setPanelOffen] = useState(false);
  const draining = useRef(false);

  useEffect(() => {
    loadQueue();
    // Browser bitten, den Puffer nicht zu räumen (Safari-Eviction nach Inaktivität).
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const drain = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const arbeit = async () => {
      let erfolg = false;
      try {
        for (const it of getItems()) {
          if (it.attempts >= MAX_ATTEMPTS) continue; // hängendes Item überspringen
          try {
            const { ergebnis, ack } = await sendItem(it);
            if (ergebnis === "erledigt") {
              // Quittung ZUERST in den lokalen Server-Stand übernehmen, dann
              // aus der Queue entfernen — sonst flackert die Sicht kurz zurück.
              await verarbeiteAck(it, ack ?? {});
              await removeItem(it.id);
              erfolg = true;
            } else if (ergebnis === "serverfehler") {
              await bumpAttempt(it.id);
              // Ops bauen aufeinander auf (Mangel vor seinen Fotos): bei einem
              // Op-Serverfehler Drain abbrechen, Reihenfolge später erneut.
              if (it.kind === "op") break;
            } else if (ergebnis === "tot") {
              await markTot(it.id); // dauerhaft unzustellbar -> Panel
            }
            // "warten": gepuffert lassen, zählt NICHT als Fehlversuch
          } catch {
            break; // Netzfehler/Timeout: abbrechen, NICHT zählen, später erneut
          }
        }
      } finally {
        if (erfolg) router.refresh(); // neue Server-Fotos/-Diktate anzeigen
      }
    };

    // Web Lock verhindert Doppel-Uploads aus mehreren Tabs desselben Browsers;
    // ifAvailable deckt auch die Re-Entranz im selben Tab ab.
    if (navigator.locks?.request) {
      await navigator.locks.request("begehung-drain", { ifAvailable: true }, async (lock) => {
        if (lock) await arbeit();
      });
    } else {
      if (draining.current) return;
      draining.current = true;
      try {
        await arbeit();
      } finally {
        draining.current = false;
      }
    }
  }, [router]);

  useEffect(() => {
    drain();
    // Echter Reconnect: Fehlversuche zurücksetzen, damit hängende Items wieder dürfen.
    const onOnline = () => resetAttempts().then(drain);
    window.addEventListener("online", onOnline);
    const iv = setInterval(drain, INTERVALL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(iv);
    };
  }, [items, drain]);

  const offen = items.length;
  const haengend = items.filter((i) => i.attempts >= MAX_ATTEMPTS);
  if (offen === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setPanelOffen((p) => !p)}
        className={`rounded-full px-3 py-1 text-sm font-medium ${
          haengend.length > 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
        }`}
        title="Gepufferte Medien werden im Hintergrund hochgeladen, sobald Empfang besteht."
      >
        <Hourglass className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
        {offen} {offen === 1 ? "Upload" : "Uploads"}
        {haengend.length > 0 && (
          <>
            {" · "}
            <TriangleAlert className="inline h-3.5 w-3.5 align-text-bottom" aria-label="hängend" />{" "}
            {haengend.length}
          </>
        )}
      </button>

      {panelOffen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-stone-200 bg-white p-3 text-sm shadow-lg">
          <p className="text-stone-600">
            {offen} {offen === 1 ? "Medium wartet" : "Medien warten"} auf Upload —
            geht automatisch raus, sobald Empfang besteht.
          </p>
          {hatPersistFehler() && (
            <p className="mt-2 rounded bg-red-50 p-2 text-red-700">
              <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              Puffer kann nicht dauerhaft gespeichert werden (Speicher voll oder
              privater Modus) — App nicht schließen, bis alles hochgeladen ist!
            </p>
          )}
          <button
            onClick={() => resetAttempts().then(drain)}
            className="mt-2 rounded border border-stone-300 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-50"
          >
            Jetzt erneut versuchen
          </button>

          {haengend.length > 0 && (
            <div className="mt-3 border-t border-stone-100 pt-2">
              <p className="font-medium text-red-700">
                Hängende Uploads ({haengend.length})
              </p>
              <ul className="mt-1 space-y-1.5">
                {haengend.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-stone-700">
                      {it.kind === "foto" ? (
                        <Camera className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-label="Foto" />
                      ) : it.kind === "audio" ? (
                        <Mic className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-label="Diktat" />
                      ) : (
                        <PenLine className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-label="Eingabe" />
                      )}
                      {it.parzelleId} ·{" "}
                      {new Date(it.ts).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {it.kind !== "op" && (
                        <button
                          onClick={() => itemSichern(it)}
                          className="rounded px-2 py-1 text-emerald-700 hover:bg-emerald-50"
                          title="Als Datei sichern"
                        >
                          sichern
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm("Dieses gepufferte Medium endgültig verwerfen?"))
                            removeItem(it.id);
                        }}
                        className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        verwerfen
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

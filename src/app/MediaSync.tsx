"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  subscribe,
  getItems,
  loadQueue,
  removeItem,
  bumpAttempt,
  blobVon,
  type QueueItem,
} from "@/lib/uploadQueue";

// Stabile Server-/Initial-Snapshot-Referenz (kein Hydration-Mismatch).
const EMPTY: QueueItem[] = [];
// Nach so vielen Fehlversuchen wird ein „Gift-Item" übersprungen (blockiert die
// Queue nicht mehr), bleibt aber gepuffert/sichtbar.
const MAX_ATTEMPTS = 8;
const INTERVALL_MS = 20000;

// Ein Item senden. Konvention:
//   true            -> erledigt (aus Queue entfernen)
//   false           -> Serverseitig (noch) nicht verarbeitbar -> bumpAttempt, nächstes Item
//   throw           -> Netzfehler -> Drain abbrechen (offline), später erneut
async function sendItem(it: QueueItem): Promise<boolean> {
  if (it.kind === "foto") {
    const fd = new FormData();
    fd.append("rundeId", String(it.rundeId));
    fd.append("parzelleId", it.parzelleId);
    if (it.kontext) fd.append("kontext", it.kontext);
    if (it.mangelId != null) fd.append("mangelId", String(it.mangelId));
    if (it.beetId != null) fd.append("beetId", String(it.beetId));
    fd.append("foto", blobVon(it), "foto");
    const r = await fetch("/api/foto", { method: "POST", body: fd });
    if (r.redirected) return false; // Session abgelaufen -> Login-Redirect: gepuffert lassen
    if (r.status === 409 || r.status >= 500) return false; // bleibt gepuffert
    return r.ok || r.status < 500; // 2xx/4xx -> erledigt (4xx wäre dauerhaft ungültig)
  }

  // Audio: erst transkribieren, dann serverseitig an „Nachgereichte Diktate" anhängen.
  const fda = new FormData();
  fda.append("audio", blobVon(it), "diktat");
  const tr = await fetch("/api/transkript", { method: "POST", body: fda });
  if (tr.redirected || !tr.ok) return false;
  const { text } = (await tr.json()) as { text?: string };
  if (!text) return true; // nichts erkannt -> Item erledigt
  const ar = await fetch("/api/notiz-append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rundeId: it.rundeId,
      parzelleId: it.parzelleId,
      mangelId: it.mangelId,
      text,
    }),
  });
  if (ar.redirected || ar.status === 409 || ar.status >= 500) return false;
  return ar.ok || ar.status < 500;
}

// App-weiter Sync-Worker: lädt gepufferte Medien im Hintergrund hoch, sobald
// Empfang besteht. Läuft solange die App offen ist (Mount, online-Event, Intervall,
// nach jedem Enqueue). Kein Service Worker (iOS-Realität).
export function MediaSync() {
  const router = useRouter();
  const items = useSyncExternalStore(subscribe, getItems, () => EMPTY);
  const draining = useRef(false);

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    const drain = async () => {
      if (draining.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      draining.current = true;
      let erfolg = false;
      try {
        for (const it of getItems()) {
          if (it.attempts >= MAX_ATTEMPTS) continue; // Gift-Item überspringen
          try {
            const ok = await sendItem(it);
            if (ok) {
              await removeItem(it.id);
              erfolg = true;
            } else {
              await bumpAttempt(it.id); // Serverfehler: nächstes Item versuchen
            }
          } catch {
            await bumpAttempt(it.id); // Netzfehler: abbrechen, später erneut
            break;
          }
        }
      } finally {
        draining.current = false;
        if (erfolg) router.refresh(); // neue Server-Fotos/-Diktate anzeigen
      }
    };

    drain();
    const onOnline = () => drain();
    window.addEventListener("online", onOnline);
    const iv = setInterval(drain, INTERVALL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(iv);
    };
  }, [items, router]);

  const offen = items.length;
  if (offen === 0) return null;
  return (
    <span
      className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800"
      title="Gepufferte Medien werden im Hintergrund hochgeladen, sobald Empfang besteht."
    >
      ⏳ {offen} {offen === 1 ? "Upload" : "Uploads"} offen
    </span>
  );
}

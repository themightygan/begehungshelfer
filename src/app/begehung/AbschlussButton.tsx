"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Hourglass } from "lucide-react";
import { subscribe, getItems, loadQueue, type QueueItem } from "@/lib/uploadQueue";
import { ConfirmButton } from "./ConfirmButton";

const EMPTY: QueueItem[] = [];

// Abschließen-Knopf, der blockiert, solange DIESES Gerät noch gepufferte Medien
// für die Runde hat — nach dem Einfrieren wären sie (nach Ablauf der Gnadenfrist)
// unzustellbar. Puffer anderer Geräte deckt die 48-h-Gnadenfrist serverseitig ab.
export function AbschlussButton({ rundeId }: { rundeId: number }) {
  const items = useSyncExternalStore(subscribe, getItems, () => EMPTY);
  useEffect(() => {
    loadQueue();
  }, []);

  const offen = items.filter((it) => it.rundeId === rundeId).length;
  if (offen > 0) {
    return (
      <p className="rounded bg-red-50 p-2 text-sm font-medium text-red-700">
        <Hourglass className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
        Noch {offen} {offen === 1 ? "Upload" : "Uploads"} dieser Begehung auf
        diesem Gerät — bitte warten, bis der Zähler oben verschwindet, dann
        abschließen.
      </p>
    );
  }
  return (
    <ConfirmButton
      message="Begehung jetzt abschließen? Die Erfassung wird beendet und die Berichte werden erzeugt (Korrekturen später über die Parzellenverwaltung)."
      className="rounded bg-amber-700 px-4 py-2.5 text-base font-medium text-white hover:bg-amber-800"
    >
      Jetzt abschließen &amp; Berichte erzeugen
    </ConfirmButton>
  );
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Hourglass, TriangleAlert } from "lucide-react";
import { subscribe, getItems, loadQueue, MAX_ATTEMPTS, type QueueItem } from "@/lib/uploadQueue";
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

  const meine = items.filter((it) => it.rundeId === rundeId);
  // Hängende Items (MAX_ATTEMPTS erreicht) gehen NICHT mehr von selbst raus —
  // der Sync überspringt sie. Ohne Unterscheidung wäre der Abschluss dauerhaft
  // blockiert („warten, bis der Zähler verschwindet" = Sackgasse). Deshalb hier
  // eine handlungsleitende Meldung, die auf das ⏳-Menü verweist.
  const haengend = meine.filter((it) => it.attempts >= MAX_ATTEMPTS).length;
  const laufend = meine.length - haengend;
  if (laufend > 0) {
    return (
      <p className="rounded bg-red-50 p-2 text-sm font-medium text-red-700">
        <Hourglass className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
        Noch {laufend} {laufend === 1 ? "Upload" : "Uploads"} dieser Begehung auf
        diesem Gerät — bitte warten, bis der Zähler oben verschwindet, dann
        abschließen.
      </p>
    );
  }
  if (haengend > 0) {
    return (
      <p className="rounded bg-red-50 p-2 text-sm font-medium text-red-700">
        <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
        {haengend} {haengend === 1 ? "hängender Upload" : "hängende Uploads"} dieser
        Begehung gehen nicht mehr von selbst raus. Öffne oben das{" "}
        <Hourglass className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden />-Menü
        und „sichern" bzw. „verwerfen" — danach lässt sich abschließen.
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

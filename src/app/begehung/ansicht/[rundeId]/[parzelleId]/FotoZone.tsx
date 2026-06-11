"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Thumb } from "@/components/Thumb";
import { loescheFotoNachtraeglich, verschiebeFoto } from "./actions";

export type FotoZiel = { mangelId?: number; beetId?: number; kontext: string };

// Foto-Bereich der Bearbeitungsansicht mit Drag & Drop: Fotos lassen sich
// zwischen Gesamtansicht, Mängeln, Beeten und Kompensation umhängen (ziehen
// und auf dem Ziel-Bereich loslassen; auf dem iPad: Foto gedrückt halten und
// ziehen). Löschen wie gehabt über das ✕.
export function FotoZone({
  fotos,
  ziel,
  pfad,
  leerHinweis,
}: {
  fotos: { id: number; dateipfad: string }[];
  ziel: FotoZiel;
  pfad: string;
  leerHinweis?: string;
}) {
  const router = useRouter();
  const [ueber, setUeber] = useState(false);
  const [, startTransition] = useTransition();

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setUeber(false);
    const id = Number(e.dataTransfer.getData("text/foto-id"));
    if (!Number.isFinite(id) || id <= 0) return;
    if (fotos.some((f) => f.id === id)) return; // schon hier
    startTransition(async () => {
      await verschiebeFoto(id, ziel, pfad);
      router.refresh();
    });
  }

  function del(fotoId: number) {
    if (!window.confirm("Foto löschen?")) return;
    startTransition(async () => {
      await loescheFotoNachtraeglich(fotoId, pfad);
      router.refresh();
    });
  }

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/foto-id")) {
          e.preventDefault();
          setUeber(true);
        }
      }}
      onDragLeave={() => setUeber(false)}
      onDrop={onDrop}
      className={`mt-2 rounded border-2 border-dashed p-1 transition-colors ${
        ueber ? "border-emerald-500 bg-emerald-50" : "border-transparent"
      }`}
    >
      {fotos.length === 0 ? (
        <p className="px-1 py-2 text-xs text-stone-300">
          {leerHinweis ?? "Keine Fotos — hierher ziehen zum Zuordnen."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <div
              key={f.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/foto-id", String(f.id));
                e.dataTransfer.effectAllowed = "move";
              }}
              className="relative cursor-grab active:cursor-grabbing"
            >
              <Thumb src={`/api/datei/${f.dateipfad}`} />
              <button
                onClick={() => del(f.id)}
                className="absolute right-1 top-1 rounded-full bg-red-600 px-2 py-0.5 text-sm font-bold text-white shadow"
                title="Foto löschen"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

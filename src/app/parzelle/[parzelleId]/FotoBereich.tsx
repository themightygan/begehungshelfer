"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Thumb } from "@/components/Thumb";
import { enqueue, subscribe, getItems, blobVon, type QueueItem } from "@/lib/uploadQueue";

type Foto = { id: number; dateipfad: string };

const EMPTY: QueueItem[] = [];

// Foto-Bereich mit lokalem Puffer (kein blockierender Upload mehr): beim Auswählen
// wird das Foto in die IndexedDB-Queue gelegt und sofort als Vorschau-Kachel mit „⏳"
// gezeigt. MediaSync lädt es im Hintergrund hoch (auch nach Offline-Phasen); sobald
// fertig, ersetzt das echte Thumbnail (Server-Foto) die Vorschau.
// 📷 Kamera (Default) + 🖼 Mediathek (mehrere).
export function FotoBereich({
  rundeId,
  parzelleId,
  fotos,
  kontext,
  mangelId,
  beetId,
  deleteAction,
}: {
  rundeId: number;
  parzelleId: string;
  fotos: Foto[];
  kontext: string;
  mangelId?: number;
  beetId?: number;
  deleteAction: (parzelleId: string, fotoId: number) => Promise<void> | void;
}) {
  const router = useRouter();
  const items = useSyncExternalStore(subscribe, getItems, () => EMPTY);

  // Nur die gepufferten Fotos GENAU dieses Ziels.
  const meine = items.filter(
    (it) =>
      it.kind === "foto" &&
      it.parzelleId === parzelleId &&
      it.kontext === kontext &&
      (it.mangelId ?? null) === (mangelId ?? null) &&
      (it.beetId ?? null) === (beetId ?? null)
  );

  // Object-URLs je Item memoisieren + aufräumen (kein Leak).
  const urls = useRef(new Map<string, string>());
  const urlFuer = (it: QueueItem) => {
    let u = urls.current.get(it.id);
    if (!u) {
      u = URL.createObjectURL(blobVon(it));
      urls.current.set(it.id, u);
    }
    return u;
  };
  useEffect(() => {
    // Verwaiste URLs (Item hochgeladen/entfernt) freigeben.
    const cache = urls.current;
    const lebend = new Set(meine.map((m) => m.id));
    for (const [id, url] of cache) {
      if (!lebend.has(id)) {
        URL.revokeObjectURL(url);
        cache.delete(id);
      }
    }
  });
  useEffect(() => {
    const cache = urls.current;
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (files?.length) {
      for (const f of Array.from(files)) {
        enqueue({
          kind: "foto",
          rundeId,
          parzelleId,
          kontext,
          mangelId,
          beetId,
          blob: f,
          mime: f.type || "image/jpeg",
        });
      }
    }
    e.currentTarget.value = "";
  }

  async function del(fotoId: number) {
    await deleteAction(parzelleId, fotoId);
    router.refresh();
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-emerald-700 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-800">
          📷 Kamera
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-50">
          🖼 Mediathek
          <input type="file" accept="image/*" multiple className="hidden" onChange={pick} />
        </label>
        {meine.length > 0 && (
          <span className="text-sm text-stone-500">{meine.length} gepuffert…</span>
        )}
      </div>

      {(fotos.length > 0 || meine.length > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <div key={f.id} className="relative">
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
          {meine.map((it) => (
            <div key={it.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFuer(it)} alt="" className="aspect-square w-full rounded object-cover opacity-40" />
              <span className="absolute inset-0 flex items-center justify-center text-2xl">⏳</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Thumb } from "@/components/Thumb";

type Foto = { id: number; dateipfad: string };

// Foto-Bereich mit parallelem, nicht-blockierendem Upload: beim Auswählen
// erscheint sofort eine Vorschau-Kachel ("wird verarbeitet"), der Upload läuft
// im Hintergrund; weitere Fotos können sofort aufgenommen werden. Sobald der
// Server fertig ist (resize/HEIC/EXIF-Strip), ersetzt das echte Thumbnail die
// Vorschau. 📷 Kamera (Default) + 🖼 Mediathek (mehrere).
export function FotoBereich({
  parzelleId,
  fotos,
  uploadAction,
  deleteAction,
}: {
  parzelleId: string;
  fotos: Foto[];
  uploadAction: (formData: FormData) => Promise<void> | void;
  deleteAction: (parzelleId: string, fotoId: number) => Promise<void> | void;
}) {
  const router = useRouter();
  const [temps, setTemps] = useState<{ id: string; url: string }[]>([]);

  function upload(files: FileList) {
    for (const f of Array.from(files)) {
      const id = `${Date.now()}-${Math.random()}`;
      setTemps((t) => [...t, { id, url: URL.createObjectURL(f) }]);
      const fd = new FormData();
      fd.append("fotos", f);
      Promise.resolve(uploadAction(fd))
        .then(() => router.refresh())
        .catch(() => alert("Upload fehlgeschlagen. Läuft die Begehung noch?"))
        .finally(() => setTemps((t) => t.filter((x) => x.id !== id)));
    }
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.currentTarget.files?.length) upload(e.currentTarget.files);
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
        {temps.length > 0 && (
          <span className="text-sm text-stone-500">{temps.length} wird verarbeitet…</span>
        )}
      </div>

      {(fotos.length > 0 || temps.length > 0) && (
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
          {temps.map((t) => (
            <div key={t.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url} alt="" className="aspect-square w-full rounded object-cover opacity-40" />
              <span className="absolute inset-0 flex items-center justify-center text-2xl">⏳</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

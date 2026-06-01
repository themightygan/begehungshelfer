"use client";

import { useTransition } from "react";

// Foto-Upload mit zwei Wegen:
//  📷 Kamera   -> direkt aufnehmen (Default auf iPhone/iPad via capture)
//  🖼 Mediathek -> ein oder mehrere vorhandene Bilder wählen (multiple)
// Die Server-Action wird direkt über useTransition aufgerufen: "Lädt…" endet
// automatisch nach Abschluss, der Input wird geleert -> sofort nächstes Foto.
export function FotoUpload({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const aufnehmen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = input.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("fotos", f);
    input.value = ""; // erlaubt erneutes Auswählen desselben Bilds / nächste Aufnahme
    startTransition(async () => {
      try {
        await action(fd);
      } catch {
        alert("Upload fehlgeschlagen. Läuft die Begehung noch? Ggf. neu starten.");
      }
    });
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <label
        className={`inline-flex cursor-pointer items-center gap-1 rounded px-4 py-2.5 text-base font-medium text-white ${
          pending ? "bg-stone-400" : "bg-emerald-700 hover:bg-emerald-800"
        }`}
      >
        {pending ? "Lädt…" : "📷 Kamera"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={pending}
          className="hidden"
          onChange={aufnehmen}
        />
      </label>
      <label
        className={`inline-flex cursor-pointer items-center gap-1 rounded border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 ${
          pending ? "opacity-50" : "hover:bg-stone-50"
        }`}
      >
        🖼 Mediathek
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={pending}
          className="hidden"
          onChange={aufnehmen}
        />
      </label>
    </div>
  );
}

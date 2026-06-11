"use client";

import { useFormStatus } from "react-dom";

// Ein-Knopf-Foto-Upload: öffnet direkt die Dateiauswahl und schickt das
// umgebende Formular nach der Auswahl automatisch ab (kein separates
// „Dateien auswählen"-Feld mehr).
export function FotoWaehlenKnopf() {
  const { pending } = useFormStatus();
  if (pending) {
    return <span className="text-sm text-stone-500">⏳ wird hochgeladen…</span>;
  }
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">
      + Fotos ergänzen
      <input
        type="file"
        name="fotos"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
        }}
      />
    </label>
  );
}

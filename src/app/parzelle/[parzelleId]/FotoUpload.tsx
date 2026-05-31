"use client";

import { useRef, useState } from "react";

// Foto-Upload, das BEIM AUSWÄHLEN automatisch hochlädt (kein separater Button
// -> keine Verwechslung mit "Speichern"). Am Handy öffnet das Kamera ODER Galerie.
export function FotoUpload({
  action,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form ref={formRef} action={action} className="mt-2">
      <label
        className={`inline-flex cursor-pointer items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-white ${
          busy ? "bg-stone-400" : "bg-emerald-700 hover:bg-emerald-800"
        }`}
      >
        {busy ? "Lädt…" : label}
        <input
          type="file"
          name="fotos"
          accept="image/*"
          multiple
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            if (e.currentTarget.files?.length) {
              setBusy(true);
              formRef.current?.requestSubmit();
            }
          }}
        />
      </label>
    </form>
  );
}

"use client";

import { useRef, useState } from "react";

// Foto-Upload mit zwei Wegen, beide laden beim Auswählen automatisch hoch:
//  📷 Kamera   -> direkt aufnehmen (Default auf iPhone/iPad via capture)
//  🖼 Mediathek -> ein oder mehrere vorhandene Bilder wählen (multiple)
// Nach jedem Upload lädt die Seite neu -> der Button ist gleich wieder bereit,
// sodass man nacheinander mehrere Fotos aufnehmen kann.
export function FotoUpload({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  const aufnehmen = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files?.length) {
      setBusy(true);
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form ref={formRef} action={action} className="mt-2 flex flex-wrap gap-2">
      <label
        className={`inline-flex cursor-pointer items-center gap-1 rounded px-4 py-2.5 text-base font-medium text-white ${
          busy ? "bg-stone-400" : "bg-emerald-700 hover:bg-emerald-800"
        }`}
      >
        {busy ? "Lädt…" : "📷 Kamera"}
        <input
          type="file"
          name="fotos"
          accept="image/*"
          capture="environment"
          disabled={busy}
          className="hidden"
          onChange={aufnehmen}
        />
      </label>
      <label
        className={`inline-flex cursor-pointer items-center gap-1 rounded border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 ${
          busy ? "opacity-50" : "hover:bg-stone-50"
        }`}
      >
        🖼 Mediathek
        <input
          type="file"
          name="fotos"
          accept="image/*"
          multiple
          disabled={busy}
          className="hidden"
          onChange={aufnehmen}
        />
      </label>
    </form>
  );
}

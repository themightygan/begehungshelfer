"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

// Zentrale Frist für alle Mängel des Befunds. Das Datumsfeld ist ein reiner
// Auslöser (kein gespeicherter Wert): Auswahl -> ggf. Rückfrage -> Server-Action
// -> Feld leeren. Gibt es schon individuelle Fristen, entscheidet die Rückfrage,
// ob sie überschrieben werden (nein = nur Mängel ohne Frist erhalten das Datum).
export function FristAlle({
  hatFristen,
  action,
}: {
  hatFristen: boolean;
  action: (frist: string, ueberschreiben: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  return (
    <label className="flex items-center gap-2 text-sm font-normal text-stone-600">
      Frist für alle
      <input
        ref={ref}
        type="date"
        disabled={pending}
        onChange={(e) => {
          const wert = e.target.value;
          if (!wert) return;
          const ueberschreiben =
            !hatFristen ||
            window.confirm("Bestehende individuelle Fristen überschreiben?");
          startTransition(async () => {
            await action(wert, ueberschreiben);
            if (ref.current) ref.current.value = "";
            router.refresh();
          });
        }}
        className="rounded border border-stone-300 px-2 py-1"
      />
      {pending && <span className="text-stone-400">speichert…</span>}
    </label>
  );
}

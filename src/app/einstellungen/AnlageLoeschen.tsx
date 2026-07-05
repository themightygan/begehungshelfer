"use client";

import { useState, useActionState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { FormState } from "./actions";

// Anlage löschen mit strenger Sicherheitsfrage: Warnung + Anlagen-Name muss
// von Hand eingetippt werden (Einfügen/Drop blockiert; der Server prüft die
// Übereinstimmung nochmal). Nur Anlagen ohne Begehungs-Historie löschbar.
export function AnlageLoeschen({
  action,
  name,
  parzellen,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  name: string;
  parzellen: number;
}) {
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState("");
  const [state, formAction, pending] = useActionState(action, {});

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-red-700 hover:underline"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Anlage löschen…
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3">
      <p className="flex items-start gap-2 text-sm font-medium text-red-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Anlage „{name}" endgültig löschen? Dabei werden auch ihre {parzellen} Parzellen
          (inkl. Pächter-Stammdaten) gelöscht. Das kann nicht rückgängig gemacht werden.
          Anlagen mit Begehungs-Historie oder Dokumenten sind nicht löschbar — das Löschen
          ist für leere, versehentlich angelegte Anlagen gedacht.
        </span>
      </p>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="bestaetigung"
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          autoComplete="off"
          placeholder={`Zur Bestätigung „${name}" eintippen`}
          className="w-72 rounded border border-red-300 bg-white px-3 py-1.5 text-sm"
        />
        <button
          disabled={pending || eingabe !== name}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          Endgültig löschen
        </button>
        <button
          type="button"
          onClick={() => { setOffen(false); setEingabe(""); }}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100"
        >
          Abbrechen
        </button>
        {state.fehler && <span className="text-sm text-red-700">{state.fehler}</span>}
      </form>
    </div>
  );
}

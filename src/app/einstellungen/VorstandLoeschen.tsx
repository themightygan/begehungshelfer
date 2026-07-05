"use client";

import { useState, useActionState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { FormState } from "./actions";

// Vorstand löschen mit Sicherheitsfrage (zweistufig). Historie bleibt intakt —
// Teilnehmer alter Runden sind Text-Snapshots. Bei vorhandenem Login wird
// zusätzlich gewarnt (Anmeldung entfällt; .env-Fallback bleibt).
export function VorstandLoeschen({
  action,
  name,
  hatLogin,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  name: string;
  hatLogin: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-red-700 hover:underline"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Löschen…
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-red-300 bg-red-50 p-2">
      <span className="flex items-center gap-1.5 text-sm text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        „{name}" endgültig löschen{hatLogin ? " — der App-Login entfällt damit" : ""}?
      </span>
      <form action={formAction} className="contents">
        <input type="hidden" name="bestaetigt" value="1" />
        <button
          disabled={pending}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          Ja, löschen
        </button>
      </form>
      <button
        type="button"
        onClick={() => setOffen(false)}
        className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100"
      >
        Abbrechen
      </button>
      {state.fehler && <span className="text-sm text-red-700">{state.fehler}</span>}
    </div>
  );
}

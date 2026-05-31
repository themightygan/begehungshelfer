"use client";

import { useState } from "react";
import { STUFEN } from "@/lib/constants";

// Kontrolliertes Befund-Formular -> die gewählte Stufe/Bemerkung bleibt nach dem
// Speichern sichtbar (unkontrollierte Felder würden durch den React-19-Form-Reset
// kurz auf den ersten Eintrag zurückspringen).
export function BefundForm({
  action,
  stufe,
  notiz,
}: {
  action: (formData: FormData) => void | Promise<void>;
  stufe: string;
  notiz: string;
}) {
  const [stufeWert, setStufeWert] = useState(stufe);
  const [notizWert, setNotizWert] = useState(notiz);

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-stone-200 bg-white p-4"
    >
      <h2 className="text-sm font-medium text-stone-600">Befund</h2>
      <label className="block text-sm">
        <span className="text-stone-600">Eskalationsstufe</span>
        <select
          name="stufe"
          value={stufeWert}
          onChange={(e) => setStufeWert(e.target.value)}
          className="mt-1 block w-full rounded border border-stone-300 px-2 py-1.5"
        >
          {STUFEN.map((s) => (
            <option key={s.wert} value={s.wert}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-stone-600">Allgemeine Bemerkung</span>
        <textarea
          name="notiz"
          value={notizWert}
          onChange={(e) => setNotizWert(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-stone-300 px-2 py-1.5"
        />
      </label>
      <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
        Befund speichern
      </button>
    </form>
  );
}

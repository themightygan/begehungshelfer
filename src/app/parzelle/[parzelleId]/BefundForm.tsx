"use client";

import { useState } from "react";
import { STUFEN } from "@/lib/constants";

// Kontrolliertes Befund-Formular -> die gewählte Stufe/Bemerkung bleibt nach dem
// Speichern sichtbar (unkontrollierte Felder würden durch den React-19-Form-Reset
// kurz auf den ersten Eintrag zurückspringen).
export function BefundForm({
  action,
  weiterAction,
  stufe,
  notiz,
}: {
  action: (formData: FormData) => void | Promise<void>;
  weiterAction?: (formData: FormData) => void | Promise<void>;
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
      <h2 className="text-base font-medium text-stone-600">Befund</h2>
      <label className="block text-base">
        <span className="text-stone-600">Eskalationsstufe</span>
        <select
          name="stufe"
          value={stufeWert}
          onChange={(e) => setStufeWert(e.target.value)}
          className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-base"
        >
          {STUFEN.map((s) => (
            <option key={s.wert} value={s.wert}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-base">
        <span className="text-stone-600">Allgemeine Bemerkung</span>
        <textarea
          name="notiz"
          value={notizWert}
          onChange={(e) => setNotizWert(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-base"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="rounded border border-emerald-700 px-4 py-2.5 text-base font-medium text-emerald-700 hover:bg-emerald-50">
          Speichern
        </button>
        {weiterAction && (
          <button
            formAction={weiterAction}
            className="rounded bg-emerald-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-emerald-800"
          >
            💾 Speichern & weiter →
          </button>
        )}
      </div>
    </form>
  );
}

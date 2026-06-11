"use client";

import { useState } from "react";
import { STUFEN } from "@/lib/constants";
import { DiktatTextarea } from "./DiktatTextarea";

// Kontrolliertes Befund-Formular -> die gewählte Stufe/Bemerkung bleibt nach dem
// Speichern sichtbar (unkontrollierte Felder würden durch den React-19-Form-Reset
// kurz auf den ersten Eintrag zurückspringen).
export function BefundForm({
  action,
  weiterAction,
  rundeId,
  parzelleId,
  stufe,
  notiz,
  diktatNachgereicht,
  gutGemacht,
  plakettenNotiz,
}: {
  action: (formData: FormData) => void | Promise<void>;
  weiterAction?: (formData: FormData) => void | Promise<void>;
  rundeId: number;
  parzelleId: string;
  stufe: string;
  notiz: string;
  diktatNachgereicht: string;
  gutGemacht: boolean;
  plakettenNotiz: string;
}) {
  const [stufeWert, setStufeWert] = useState(stufe);
  const [lob, setLob] = useState(gutGemacht);
  const [lobNotiz, setLobNotiz] = useState(plakettenNotiz);

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
      <div className="block text-base">
        <span className="text-stone-600">Allgemeine Bemerkung</span>
        <DiktatTextarea
          name="notiz"
          defaultValue={notiz}
          rows={2}
          className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-base"
          rundeId={rundeId}
          parzelleId={parzelleId}
        />
        {diktatNachgereicht.trim() !== "" && (
          <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 p-2 text-sm">
            <p className="font-medium text-amber-800">Nachgereichte Diktate (offline)</p>
            <p className="whitespace-pre-line text-stone-700">{diktatNachgereicht}</p>
          </div>
        )}
      </div>

      {/* "Gut gemacht"-Plakette (Lob für gepflegte Gärten) */}
      <div className="rounded border border-emerald-200 bg-emerald-50/60 p-3">
        <label className="flex items-center gap-2 text-base font-medium text-emerald-800">
          <input
            type="checkbox"
            name="gutGemacht"
            value="1"
            checked={lob}
            onChange={(e) => setLob(e.target.checked)}
            className="h-5 w-5"
          />
          👍 „Gut gemacht"-Plakette
        </label>
        {lob && (
          <input
            type="text"
            name="plakettenNotiz"
            value={lobNotiz}
            onChange={(e) => setLobNotiz(e.target.value)}
            placeholder="Lob / Begründung (optional)"
            className="mt-2 block w-full rounded border border-emerald-300 px-3 py-2 text-base"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="rounded border border-emerald-700 px-4 py-2.5 text-base font-medium text-emerald-700 hover:bg-emerald-50">
          Speichern
        </button>
        {weiterAction && (
          <button
            formAction={weiterAction}
            className="rounded bg-emerald-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-emerald-800"
          >
            💾 Speichern & zurück zum Plan
          </button>
        )}
      </div>
    </form>
  );
}

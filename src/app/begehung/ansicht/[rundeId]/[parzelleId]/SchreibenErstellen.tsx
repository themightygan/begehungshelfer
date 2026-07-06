"use client";

import { useActionState, useState } from "react";
import { FileText, TriangleAlert } from "lucide-react";
import type { SchreibenFormErgebnis } from "./actions";

// „Schreiben erstellen": voller Prozess auf Knopfdruck — Typ ist aus der
// Befund-Stufe vorbelegt; fehlende Anrede wird hier nachgetragen (1x anfassen);
// Historie (nur 2. Abmahnung) kommt vorbefüllt aus der Dokumenten-Akte.
export function SchreibenErstellen({
  action,
  stufe,
  anredeFehlt,
  historieVorschlag,
  paechterEmail,
  bvEmail,
}: {
  action: (prev: SchreibenFormErgebnis, formData: FormData) => Promise<SchreibenFormErgebnis>;
  stufe: string;
  anredeFehlt: boolean;
  historieVorschlag: { seit: string; hinweise: string; datum1Abmahnung: string } | null;
  paechterEmail: string;
  bvEmail: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const vorbelegt = ["mitteilung", "abmahnung_1", "abmahnung_2"].includes(stufe) ? stufe : "mitteilung";
  const [typ, setTyp] = useState(vorbelegt);

  const INP = "rounded border border-stone-300 px-3 py-1.5 text-sm";
  const zielText =
    typ === "mitteilung"
      ? `E-Mail-Entwurf mit PDF ins Postfach (An: ${paechterEmail || "— keine Pächter-E-Mail —"}), Versand durch dich im Mail-Programm.`
      : typ === "abmahnung_1"
        ? "Word-Datei (docx) an die Vereinsadresse — Feinschliff in Word, Versand per Post."
        : `Word-Datei (docx) an den Bezirksverband (${bvEmail || "BV-E-Mail fehlt!"}) mit Bitte um Übernahme, Kopie an den Verein.`;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Schreiben-Typ
          <select name="typ" value={typ} onChange={(e) => setTyp(e.target.value)} className={`mt-1 block ${INP}`}>
            <option value="mitteilung">Mitteilung (E-Mail + PDF)</option>
            <option value="abmahnung_1">1. Abmahnung (Verein, docx)</option>
            <option value="abmahnung_2">2. Abmahnung (Bezirksverband, docx)</option>
          </select>
        </label>
        {anredeFehlt && (
          <label className="text-sm">
            Anrede des Pächters
            <select name="anrede" defaultValue="" required className={`mt-1 block ${INP}`}>
              <option value="" disabled>— wählen —</option>
              <option value="herr">Herr</option>
              <option value="frau">Frau</option>
            </select>
          </label>
        )}
      </div>

      {typ !== "mitteilung" && (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="wiederholung" value="1" defaultChecked />
            Mängel wurden erneut festgestellt („– erneut –")
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="ersatzvornahme" value="1" />
            Ersatzvornahme-Hinweis (§ 10 UPV)
          </label>
        </div>
      )}

      {typ === "abmahnung_2" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Feststellungen seit …
            <input name="historie_seit" defaultValue={historieVorschlag?.seit ?? ""} placeholder="dem Jahr 2023" className={`mt-1 block w-full ${INP}`} />
          </label>
          <label className="text-sm">
            Bereits angeschrieben …
            <input name="historie_hinweise" defaultValue={historieVorschlag?.hinweise ?? ""} placeholder="in den Jahren 2023 und 2024" className={`mt-1 block w-full ${INP}`} />
          </label>
          <label className="text-sm">
            Datum 1. Abmahnung
            <input name="historie_datum1" defaultValue={historieVorschlag?.datum1Abmahnung ?? ""} placeholder="7. Juni 2025" className={`mt-1 block w-full ${INP}`} />
          </label>
          <p className="text-xs text-stone-600 sm:col-span-3">
            Vorschlag aus der Dokumenten-Akte — bitte prüfen (ohne Verb am Ende, die Vorlage ergänzt „angeschrieben").
          </p>
        </div>
      )}

      <p className="text-sm text-stone-600">{zielText}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-1.5 rounded bg-emerald-700 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          {pending ? "erzeuge…" : "Schreiben erstellen + senden"}
        </button>
        {state.ok && !pending && <span className="text-sm text-emerald-700">✓ {state.ok}</span>}
        {state.fehler && <span className="text-sm text-red-700">{state.fehler}</span>}
      </div>

      {!!state.warnungen?.length && !pending && (
        <ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3">
          {state.warnungen.map((warnung, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {warnung}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

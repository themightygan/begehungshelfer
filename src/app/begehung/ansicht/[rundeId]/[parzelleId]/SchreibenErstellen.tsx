"use client";

import { useActionState } from "react";
import { FileText, TriangleAlert } from "lucide-react";
import type { SchreibenFormErgebnis } from "./actions";

// „Schreiben erstellen": voller Prozess auf Knopfdruck. Der Typ folgt der
// oben gewählten Befund-Stufe (Mitteilung/1./2. Abmahnung) — keine eigene
// Auswahl; ändert sich die Stufe, ändert sich hier der Typ. Fehlende Anrede
// wird inline nachgetragen; Historie (2. Abm.) kommt vorbefüllt aus der Akte.
export function SchreibenErstellen({
  action,
  stufe,
  anredeFehlt,
  historieVorschlag,
  paechterEmail,
  bvEmail,
  bereitsInAkte,
}: {
  action: (prev: SchreibenFormErgebnis, formData: FormData) => Promise<SchreibenFormErgebnis>;
  stufe: string;
  anredeFehlt: boolean;
  historieVorschlag: { seit: string; hinweise: string; datum1Abmahnung: string } | null;
  paechterEmail: string;
  bvEmail: string;
  bereitsInAkte: string | null; // "TT.MM.JJJJ" — Schreiben liegt schon in der Akte
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const INP = "rounded border border-stone-300 px-3 py-1.5 text-sm";

  const typ =
    stufe === "mitteilung" || stufe === "abmahnung_1" || stufe === "abmahnung_2" ? stufe : null;
  if (!typ) {
    return (
      <p className="text-sm text-stone-600">
        Für die gewählte Stufe ist kein Schreiben vorgesehen — oben die Stufe auf
        „Mitteilung", „1. Abmahnung" oder „2. Abmahnung" stellen.
      </p>
    );
  }

  const typLabel =
    typ === "mitteilung"
      ? "Mitteilung"
      : typ === "abmahnung_1"
        ? "1. Abmahnung (Verein)"
        : "2. Abmahnung (Bezirksverband)";
  const zielText =
    typ === "mitteilung"
      ? `E-Mail-Entwurf mit PDF + docx ins Postfach (An: ${paechterEmail || "— keine Pächter-E-Mail —"}) — prüfen und selbst senden; bei Änderungen PDF löschen, docx überarbeiten, neu als PDF anhängen.`
      : typ === "abmahnung_1"
        ? "Word-Datei (docx) an die Vereinsadresse — Feinschliff in Word, Versand per Post."
        : `E-Mail-Entwurf an den Bezirksverband (${bvEmail || "BV-E-Mail fehlt!"}) mit Bitte um Abmahnung, docx-Entwurf anbei — prüfen und selbst senden.`;

  return (
    <form action={formAction} className="space-y-3">
      {bereitsInAkte && (
        <p className="flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Zu dieser Begehung liegt bereits ein versendetes Schreiben in der Akte (seit{" "}
          {bereitsInAkte}) — die Parzelle ist deshalb von der Sammel-Erstellung ausgenommen.
          Hier kannst du bewusst trotzdem ein (weiteres) Schreiben erstellen.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <p className="text-sm">
          Typ (aus der Stufe): <span className="font-medium">{typLabel}</span>
        </p>
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
          {pending ? "erzeuge…" : "Schreiben erstellen"}
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

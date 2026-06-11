"use client";

import Link from "next/link";

// App-weite Fehlergrenze: eine fehlgeschlagene Aktion (z. B. Funkloch beim
// Speichern) zeigt sonst nur Next' nackte Fehlerseite. Klar sagen, was los ist,
// und den Weg zurück anbieten. Gepufferte Fotos/Diktate sind davon NICHT
// betroffen (IndexedDB-Queue lädt weiter hoch, sobald Empfang besteht).
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-red-200 bg-red-50/60 p-6">
      <h1 className="text-xl font-semibold text-red-800">
        {offline ? "Kein Empfang" : "Das hat nicht geklappt"}
      </h1>
      <p className="text-base text-stone-700">
        {offline
          ? "Die letzte Aktion konnte nicht gesendet werden (offline). Eingaben aus Textfeldern der letzten Aktion wurden möglicherweise nicht gespeichert — bei Empfang bitte prüfen und erneut speichern."
          : "Die letzte Aktion ist fehlgeschlagen — häufigste Ursache: Die Seite war noch von einem älteren App-Stand geöffnet. Bitte die Seite neu laden und erneut versuchen."}
      </p>
      <p className="text-sm text-stone-500">
        Gepufferte Fotos und Diktate gehen nicht verloren — sie werden automatisch
        hochgeladen, sobald wieder Empfang besteht.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-emerald-700 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-800"
        >
          Seite neu laden
        </button>
        <button
          onClick={() => reset()}
          className="rounded border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-50"
        >
          Erneut versuchen
        </button>
        <Link
          href="/begehung"
          className="rounded border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-50"
        >
          Zurück zum Plan
        </Link>
      </div>
    </div>
  );
}

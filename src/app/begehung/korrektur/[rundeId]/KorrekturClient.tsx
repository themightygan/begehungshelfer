"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { KorrekturFeld } from "@/lib/korrektur";

// Review-UI der KI-Textkorrektur: prüft Feld für Feld (kurze Requests, Fortschritt
// sichtbar), zeigt Diffs mit Wort-Hervorhebung; übernommen wird NUR, was der
// Mensch bestätigt — der Vorschlag ist vor der Übernahme frei editierbar.

type Vorschlag = {
  feld: KorrekturFeld;
  vorschlag: string;
  text: string; // editierbare Fassung
  gewaehlt: boolean;
  uebernommen: boolean;
};

// Einfache Wort-Diff (LCS) für die Hervorhebung geänderter Wörter.
function wortDiff(a: string, b: string): { alt: React.ReactNode; neu: React.ReactNode } {
  const wa = a.split(/(\s+)/);
  const wb = b.split(/(\s+)/);
  const n = wa.length, m = wb.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = wa[i] === wb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const altTeile: React.ReactNode[] = [];
  const neuTeile: React.ReactNode[] = [];
  let i = 0, j = 0, k = 0;
  while (i < n && j < m) {
    if (wa[i] === wb[j]) {
      altTeile.push(wa[i]);
      neuTeile.push(wb[j]);
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      altTeile.push(<del key={k++} className="rounded bg-red-100 text-red-800 no-underline">{wa[i++]}</del>);
    } else {
      neuTeile.push(<mark key={k++} className="rounded bg-emerald-100 text-emerald-900">{wb[j++]}</mark>);
    }
  }
  while (i < n) altTeile.push(<del key={k++} className="rounded bg-red-100 text-red-800 no-underline">{wa[i++]}</del>);
  while (j < m) neuTeile.push(<mark key={k++} className="rounded bg-emerald-100 text-emerald-900">{wb[j++]}</mark>);
  return { alt: altTeile, neu: neuTeile };
}

export function KorrekturClient({ rundeId, bezeichnung }: { rundeId: number; bezeichnung: string }) {
  const [phase, setPhase] = useState<"laden" | "pruefen" | "bereit" | "fehler">("laden");
  const [gesamt, setGesamt] = useState(0);
  const [geprueft, setGeprueft] = useState(0);
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [uebernehme, setUebernehme] = useState(false);
  const laeuft = useRef(false);

  useEffect(() => {
    if (laeuft.current) return;
    laeuft.current = true;
    (async () => {
      try {
        const r = await fetch(`/api/korrektur?rundeId=${rundeId}`);
        if (!r.ok) throw new Error(String(r.status));
        const { felder } = (await r.json()) as { felder: KorrekturFeld[] };
        setGesamt(felder.length);
        setPhase("pruefen");
        for (const feld of felder) {
          const pr = await fetch("/api/korrektur", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ aktion: "pruefen", text: feld.text }),
          });
          const { vorschlag } = pr.ok ? await pr.json() : { vorschlag: null };
          if (vorschlag) {
            setVorschlaege((v) => [
              ...v,
              { feld, vorschlag, text: vorschlag, gewaehlt: true, uebernommen: false },
            ]);
          }
          setGeprueft((x) => x + 1);
        }
        setPhase("bereit");
      } catch {
        setPhase("fehler");
      }
    })();
  }, [rundeId]);

  async function uebernehmen() {
    setUebernehme(true);
    for (const v of vorschlaege) {
      if (!v.gewaehlt || v.uebernommen) continue;
      const r = await fetch("/api/korrektur", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aktion: "anwenden", schluessel: v.feld.schluessel, text: v.text }),
      });
      if (r.ok) {
        setVorschlaege((alle) =>
          alle.map((x) => (x.feld.schluessel === v.feld.schluessel ? { ...x, uebernommen: true } : x))
        );
      }
    }
    setUebernehme(false);
  }

  const offen = vorschlaege.filter((v) => v.gewaehlt && !v.uebernommen).length;

  return (
    <div className="space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold">🪄 KI-Textkorrektur</h1>
        <p className="text-base text-stone-500">{bezeichnung}</p>
        <p className="mt-1 text-sm text-stone-400">
          Korrigiert nur Diktat-/Erkennungsfehler und Zeichensetzung (lokale KI, Garten-Vokabular).
          Übernommen wird ausschließlich, was unten bestätigt wird — jeder Vorschlag ist vorher editierbar.
        </p>
      </div>

      {phase === "laden" && <p className="text-stone-500">Felder werden geladen…</p>}
      {phase === "fehler" && (
        <p className="text-red-600">Korrektur nicht verfügbar (Verbindung/KI prüfen).</p>
      )}
      {(phase === "pruefen" || phase === "bereit") && (
        <p className="text-sm text-stone-500">
          {geprueft}/{gesamt} Texte geprüft
          {phase === "pruefen" ? "…" : ""} · {vorschlaege.length} Korrekturvorschläge
        </p>
      )}

      {vorschlaege.map((v) => {
        const diff = wortDiff(v.feld.text, v.vorschlag);
        return (
          <div
            key={v.feld.schluessel}
            className={`rounded-lg border p-4 ${v.uebernommen ? "border-emerald-300 bg-emerald-50/50" : "border-stone-200 bg-white"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-stone-600">
                <span className="rounded bg-stone-100 px-2 py-0.5">{v.feld.parzelleId}</span>{" "}
                {v.feld.label}
              </p>
              {v.uebernommen ? (
                <span className="text-sm font-medium text-emerald-700">✓ übernommen</span>
              ) : (
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={v.gewaehlt}
                    onChange={(e) =>
                      setVorschlaege((alle) =>
                        alle.map((x) =>
                          x.feld.schluessel === v.feld.schluessel
                            ? { ...x, gewaehlt: e.target.checked }
                            : x
                        )
                      )
                    }
                    className="h-4 w-4"
                  />
                  übernehmen
                </label>
              )}
            </div>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <div className="rounded bg-stone-50 p-2 text-base whitespace-pre-wrap">{diff.alt}</div>
              <div className="rounded bg-stone-50 p-2 text-base whitespace-pre-wrap">{diff.neu}</div>
            </div>
            {!v.uebernommen && v.text !== v.vorschlag && (
              <p className="mt-1 text-xs text-amber-700">(manuell angepasst)</p>
            )}
            {!v.uebernommen && (
              <textarea
                defaultValue={v.vorschlag}
                onBlur={(e) =>
                  setVorschlaege((alle) =>
                    alle.map((x) =>
                      x.feld.schluessel === v.feld.schluessel ? { ...x, text: e.target.value } : x
                    )
                  )
                }
                rows={2}
                className="mt-2 block w-full rounded border border-stone-200 px-2 py-1.5 text-sm text-stone-600"
              />
            )}
          </div>
        );
      })}

      {phase === "bereit" && vorschlaege.length === 0 && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-base text-emerald-800">
          ✓ Keine Korrekturen nötig — alle Texte sehen sauber aus.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
        {offen > 0 && (
          <button
            onClick={uebernehmen}
            disabled={uebernehme || phase === "pruefen"}
            className="rounded bg-emerald-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {uebernehme ? "Wird übernommen…" : `${offen} Korrektur${offen === 1 ? "" : "en"} übernehmen`}
          </button>
        )}
        <Link href="/begehung" className="text-sm text-emerald-700 hover:underline">
          → zur Begehung
        </Link>
        <Link href={`/begehung/berichte/${rundeId}`} className="text-sm text-emerald-700 hover:underline">
          → zu den Berichten
        </Link>
      </div>
    </div>
  );
}

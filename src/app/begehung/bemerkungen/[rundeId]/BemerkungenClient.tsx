"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import type { BemerkungBefund, BemerkungFinding } from "@/lib/bemerkung";

// Review-UI der Bemerkungs-Prüfung: prüft Befund für Befund (kurze Requests,
// Fortschritt sichtbar), zeigt je Befund die Original-Bemerkung + die von der KI
// erkannten möglichen Mängel. Zu Mangel-Zeilen wird NUR, was der Mensch bestätigt;
// jeder Vorschlag ist vorher in Text und Baustein-Zuordnung frei änderbar.

type BausteinOpt = { id: string; label: string; bereich: number };

type Finding = BemerkungFinding & {
  uid: string; // client-seitiger Idempotenzschlüssel
  gewaehlt: boolean;
  uebernommen: boolean;
};

type BefundState = BemerkungBefund & {
  findings: Finding[];
  geprueftGesetzt: boolean; // bemerkungGeprueft in der DB gesetzt
};

const BEREICH_NAME: Record<number, string> = {
  1: "Garten",
  2: "Baulichkeiten und Nebenanlagen",
  3: "Sonstiges",
};

export function BemerkungenClient({
  rundeId,
  bezeichnung,
  bausteine,
}: {
  rundeId: number;
  bezeichnung: string;
  bausteine: BausteinOpt[];
}) {
  const [phase, setPhase] = useState<"laden" | "pruefen" | "bereit" | "fehler">("laden");
  const [gesamt, setGesamt] = useState(0);
  const [geprueft, setGeprueft] = useState(0);
  const [befunde, setBefunde] = useState<BefundState[]>([]);
  const [uebernehme, setUebernehme] = useState(false);
  const laeuft = useRef(false);

  useEffect(() => {
    if (laeuft.current) return;
    laeuft.current = true;
    (async () => {
      try {
        const r = await fetch(`/api/bemerkungen?rundeId=${rundeId}`);
        if (!r.ok) throw new Error(String(r.status));
        const { befunde: liste } = (await r.json()) as { befunde: BemerkungBefund[] };
        setGesamt(liste.length);
        setPhase("pruefen");
        for (const b of liste) {
          const pr = await fetch("/api/bemerkungen", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              aktion: "pruefen",
              notiz: b.notiz,
              vorhandeneMaengel: b.vorhandeneMaengel,
            }),
          });
          const { findings } = pr.ok
            ? ((await pr.json()) as { findings: BemerkungFinding[] })
            : { findings: [] as BemerkungFinding[] };
          setBefunde((v) => [
            ...v,
            {
              ...b,
              geprueftGesetzt: false,
              findings: findings.map((f, i) => ({
                ...f,
                uid: `${b.befundId}-${i}-${f.baustein}`,
                gewaehlt: true,
                uebernommen: false,
              })),
            },
          ]);
          setGeprueft((x) => x + 1);
        }
        setPhase("bereit");
      } catch {
        setPhase("fehler");
      }
    })();
  }, [rundeId]);

  function findingAendern(befundId: number, uid: string, patch: Partial<Finding>) {
    setBefunde((alle) =>
      alle.map((b) =>
        b.befundId === befundId
          ? { ...b, findings: b.findings.map((f) => (f.uid === uid ? { ...f, ...patch } : f)) }
          : b
      )
    );
  }

  // Alles Bestätigte übernehmen + jeden geprüften Befund als geprüft markieren.
  async function abschliessen() {
    setUebernehme(true);
    for (const b of befunde) {
      for (const f of b.findings) {
        if (!f.gewaehlt || f.uebernommen) continue;
        const r = await fetch("/api/bemerkungen", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            aktion: "anwenden",
            befundId: b.befundId,
            baustein: f.baustein,
            text: f.text,
          }),
        });
        if (r.ok) findingAendern(b.befundId, f.uid, { uebernommen: true });
      }
      if (!b.geprueftGesetzt) {
        const g = await fetch("/api/bemerkungen", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ aktion: "geprueft", befundId: b.befundId }),
        });
        if (g.ok) {
          setBefunde((alle) =>
            alle.map((x) => (x.befundId === b.befundId ? { ...x, geprueftGesetzt: true } : x))
          );
        }
      }
    }
    setUebernehme(false);
  }

  const offen = befunde.reduce(
    (n, b) => n + b.findings.filter((f) => f.gewaehlt && !f.uebernommen).length,
    0
  );
  const alleGeprueft =
    phase === "bereit" && befunde.length > 0 && befunde.every((b) => b.geprueftGesetzt);

  return (
    <div className="space-y-4 pb-12">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardCheck className="h-6 w-6 shrink-0" aria-hidden /> Bemerkungs-Prüfung
        </h1>
        <p className="text-base text-stone-500">{bezeichnung}</p>
        <p className="mt-1 text-sm text-stone-600">
          Prüft die allgemeinen Bemerkungen auf enthaltene Mängel (lokale KI). Zu Mangel-Zeilen wird
          ausschließlich, was unten bestätigt wird — jeder Vorschlag ist vorher in Text und Zuordnung
          editierbar.
        </p>
      </div>

      {phase === "laden" && <p className="text-stone-500">Bemerkungen werden geladen…</p>}
      {phase === "fehler" && (
        <p className="text-red-600">Prüfung nicht verfügbar (Verbindung/KI prüfen).</p>
      )}
      {(phase === "pruefen" || phase === "bereit") && (
        <p className="text-sm text-stone-500">
          {geprueft}/{gesamt} Bemerkungen geprüft
          {phase === "pruefen" ? "…" : ""} ·{" "}
          {befunde.reduce((n, b) => n + b.findings.length, 0)} mögliche Mängel erkannt
        </p>
      )}

      {befunde.map((b) => (
        <div
          key={b.befundId}
          className={`rounded-lg border p-4 ${
            b.geprueftGesetzt ? "border-emerald-300 bg-emerald-50/50" : "border-stone-200 bg-white"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-stone-600">
              <span className="rounded bg-stone-100 px-2 py-0.5">{b.parzelleId}</span> Bemerkung
            </p>
            {b.geprueftGesetzt && (
              <span className="text-sm font-medium text-emerald-700">✓ geprüft</span>
            )}
          </div>
          <p className="mt-2 rounded bg-stone-50 p-2 text-base whitespace-pre-wrap text-stone-600">
            {b.notiz}
          </p>
          {b.vorhandeneMaengel.length > 0 && (
            <p className="mt-1 text-xs text-stone-500">
              Bereits erfasst: {b.vorhandeneMaengel.join(" · ")}
            </p>
          )}

          {b.findings.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">
              Keine zusätzlichen Mängel erkannt — wird beim Abschließen als geprüft markiert.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {b.findings.map((f) => {
                const dublette = f.baustein !== "FREITEXT" && b.vorhandeneBausteine.includes(f.baustein);
                return (
                  <li
                    key={f.uid}
                    className="rounded border border-stone-200 bg-stone-50/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {f.uebernommen ? (
                        <span className="text-sm font-medium text-emerald-700">✓ als Mangel angelegt</span>
                      ) : (
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={f.gewaehlt}
                            onChange={(e) =>
                              findingAendern(b.befundId, f.uid, { gewaehlt: e.target.checked })
                            }
                            className="h-4 w-4"
                          />
                          als Mangel übernehmen
                        </label>
                      )}
                      {dublette && !f.uebernommen && (
                        <span className="text-xs font-medium text-amber-800">evtl. Dublette</span>
                      )}
                    </div>
                    {!f.uebernommen && (
                      <>
                        <textarea
                          defaultValue={f.text}
                          onBlur={(e) => findingAendern(b.befundId, f.uid, { text: e.target.value })}
                          rows={2}
                          className="mt-2 block w-full rounded border border-stone-200 px-2 py-1.5 text-sm text-stone-600"
                        />
                        <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
                          Zuordnung
                          <select
                            value={f.baustein}
                            onChange={(e) =>
                              findingAendern(b.befundId, f.uid, { baustein: e.target.value })
                            }
                            className="min-w-0 flex-1 rounded border border-stone-200 px-2 py-1.5 text-sm"
                          >
                            <option value="FREITEXT">Freitext (kein Baustein)</option>
                            {[1, 2, 3].map((ber) => (
                              <optgroup key={ber} label={BEREICH_NAME[ber]}>
                                {bausteine
                                  .filter((x) => x.bereich === ber)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.id} — {x.label}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}

      {phase === "bereit" && befunde.length === 0 && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-base text-emerald-800">
          ✓ Keine offenen Bemerkungen zu prüfen.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
        {phase === "bereit" && befunde.length > 0 && !alleGeprueft && (
          <button
            onClick={abschliessen}
            disabled={uebernehme}
            className="rounded bg-emerald-700 px-5 py-2.5 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {uebernehme
              ? "Wird übernommen…"
              : offen > 0
                ? `${offen} Mangel${offen === 1 ? "" : "-Positionen"} übernehmen & abschließen`
                : "Als geprüft abschließen"}
          </button>
        )}
        {alleGeprueft && (
          <span className="text-sm font-medium text-emerald-700">✓ Alle Bemerkungen geprüft.</span>
        )}
        <Link href={`/begehung/korrektur/${rundeId}`} className="text-sm text-emerald-700 hover:underline">
          → zur KI-Textkorrektur
        </Link>
        <Link href={`/begehung/berichte/${rundeId}`} className="text-sm text-emerald-700 hover:underline">
          → zu den Berichten
        </Link>
      </div>
    </div>
  );
}

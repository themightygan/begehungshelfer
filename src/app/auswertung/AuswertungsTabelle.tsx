"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Mail, ThumbsUp, TriangleAlert } from "lucide-react";
import { STUFE_LABEL, STUFE_SYMBOL, STUFE_TEXTFARBE } from "@/lib/constants";
import { KlickZeile } from "@/components/KlickZeile";
import { BeetZelle } from "@/components/BeetZelle";
import { NeupaechterTag } from "@/components/NeupaechterTag";

// Sortierbare Auswertungs-Tabelle (Einzel-Runde + kombinierte Jahres-Ansicht).
// Zeilen kommen fertig berechnet vom Server; Sortierung + Filter rein clientseitig.

export type Zeile = {
  parzelleId: string; // "S35" — auch Anker-Id der Zeile (p-S35)
  rundeId: number; // Runde des (neuesten) Befunds — für die Sammel-Schreiben
  nummer: number;
  index: string; // "", "a", …
  nachname: string;
  vorname: string;
  neupaechter: boolean;
  beetIst: number;
  beetSoll: number | null;
  komp: boolean;
  stufe: string;
  stufeRang: number;
  plakette: boolean;
  maengel: number;
  ansichtHref: string; // Zeilenziel (inkl. evtl. ?von=…)
  pdfHref: string;
};

type SortKey =
  | "nummer"
  | "nachname"
  | "beetSoll"
  | "beetIst"
  | "stufeRang"
  | "plakette"
  | "maengel";

// Stabiler Grund-Sort (= Server-Reihenfolge): Parzellennummer, dann Index.
const stamm = (a: Zeile, b: Zeile) =>
  a.nummer - b.nummer || a.index.localeCompare(b.index);

function vergleich(a: Zeile, b: Zeile, key: SortKey): number {
  switch (key) {
    case "nachname":
      return a.nachname.localeCompare(b.nachname, "de");
    case "beetSoll":
      return (a.beetSoll ?? -1) - (b.beetSoll ?? -1);
    case "beetIst":
      return a.beetIst - b.beetIst;
    case "stufeRang":
      return a.stufeRang - b.stufeRang;
    case "plakette":
      return Number(a.plakette) - Number(b.plakette);
    case "maengel":
      return a.maengel - b.maengel;
    default:
      return stamm(a, b);
  }
}

// Sticky-Kopf: klebt beim Scrollen oben (auf schmalen Screens scrollt die
// Tabelle horizontal im Container, dort kann der Kopf nicht kleben).
const TH = "sticky top-0 z-10 border-b border-stone-300 bg-white py-2 pr-3";

// Stufen, für die ein Schreiben vorgesehen ist (voller Prozess je Typ).
const SCHREIBEN_STUFEN = new Set(["mitteilung", "abmahnung_1", "abmahnung_2"]);
type SchreibenStatus = { sym: "läuft" | "ok" | "warn" | "fehler"; text: string };

export function AuswertungsTabelle({
  zeilen,
  schreibenAction,
}: {
  zeilen: Zeile[];
  // Server-Action: erzeugt + versendet das Schreiben einer Parzelle
  // (Typ aus der Befund-Stufe). Optional — ohne Action keine Auswahl-Spalte.
  schreibenAction?: (
    rundeId: number,
    parzelleId: string
  ) => Promise<{ ok?: string; fehler?: string; warnungen?: string[] }>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "nummer",
    dir: 1,
  });
  const [filter, setFilter] = useState("");
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Map<string, SchreibenStatus>>(new Map());
  const [laufend, setLaufend] = useState(false);

  const f = filter.trim().toLowerCase();
  const gefiltert = f
    ? zeilen.filter(
        (z) =>
          z.parzelleId.toLowerCase().includes(f) ||
          `${z.nachname} ${z.vorname}`.toLowerCase().includes(f)
      )
    : zeilen;
  const sortiert = [...gefiltert].sort(
    (a, b) => sort.dir * vergleich(a, b, sort.key) || stamm(a, b)
  );

  const klick = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  // --- Sammel-Schreiben: Auswahl + sequenzieller Lauf über die Server-Action ---
  const waehlbar = sortiert.filter((z) => SCHREIBEN_STUFEN.has(z.stufe));
  const alleGewaehlt = waehlbar.length > 0 && waehlbar.every((z) => auswahl.has(z.parzelleId));
  const umschalten = (id: string) =>
    setAuswahl((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const alleUmschalten = () =>
    setAuswahl(alleGewaehlt ? new Set() : new Set(waehlbar.map((z) => z.parzelleId)));

  async function schreibenLauf() {
    if (!schreibenAction || laufend) return;
    const ziele = zeilen.filter((z) => auswahl.has(z.parzelleId) && SCHREIBEN_STUFEN.has(z.stufe));
    if (!ziele.length) return;
    const anzahlBv = ziele.filter((z) => z.stufe === "abmahnung_2").length;
    const frage =
      `${ziele.length} Schreiben erstellen und versenden?\n\n` +
      `${ziele.filter((z) => z.stufe === "mitteilung").length}× Mitteilung (E-Mail-Entwurf im Postfach)\n` +
      `${ziele.filter((z) => z.stufe === "abmahnung_1").length}× 1. Abmahnung (docx an Vereinsadresse)\n` +
      `${anzahlBv}× 2. Abmahnung (docx DIREKT an den Bezirksverband!)`;
    if (!window.confirm(frage)) return;
    setLaufend(true);
    for (const z of ziele) {
      setStatus((s) => new Map(s).set(z.parzelleId, { sym: "läuft", text: "wird erstellt…" }));
      try {
        const r = await schreibenAction(z.rundeId, z.parzelleId);
        const st: SchreibenStatus = r.fehler
          ? { sym: "fehler", text: r.fehler }
          : r.warnungen?.length
            ? { sym: "warn", text: `${r.ok ?? "OK"} — Hinweise: ${r.warnungen.join(" · ")}` }
            : { sym: "ok", text: r.ok ?? "OK" };
        setStatus((s) => new Map(s).set(z.parzelleId, st));
      } catch (e) {
        setStatus((s) =>
          new Map(s).set(z.parzelleId, { sym: "fehler", text: e instanceof Error ? e.message : String(e) })
        );
      }
    }
    setLaufend(false);
  }

  const fertigOk = [...status.values()].filter((s) => s.sym === "ok" || s.sym === "warn").length;
  const fertigFehler = [...status.values()].filter((s) => s.sym === "fehler").length;

  const ariaSort = (k: SortKey) =>
    sort.key === k ? (sort.dir === 1 ? ("ascending" as const) : ("descending" as const)) : undefined;

  function SortKnopf({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const aktiv = sort.key === k;
    return (
      <button
        type="button"
        onClick={() => klick(k)}
        className={`hover:text-emerald-700 ${aktiv ? "font-semibold text-emerald-700" : ""}`}
        title="Sortieren"
      >
        {children}
        {aktiv ? (sort.dir === 1 ? " ▲" : " ▼") : <span className="text-stone-400"> ↕</span>}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtern: Garten oder Pächter…"
          aria-label="Tabelle filtern nach Garten oder Pächter"
          className="w-full max-w-xs rounded border border-stone-300 px-3 py-2 text-base"
        />
        {f && (
          <span className="text-sm text-stone-600" aria-live="polite">
            {gefiltert.length} von {zeilen.length} Zeilen
          </span>
        )}
        {schreibenAction && (
          <button
            type="button"
            onClick={schreibenLauf}
            disabled={laufend || auswahl.size === 0}
            className="inline-flex min-h-11 items-center gap-1.5 rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            {laufend
              ? `erstelle… (${fertigOk + fertigFehler}/${auswahl.size})`
              : `Schreiben erstellen (${auswahl.size} gewählt)`}
          </button>
        )}
        {status.size > 0 && !laufend && (
          <span className="text-sm text-stone-600" aria-live="polite">
            {fertigOk} erstellt{fertigFehler > 0 ? `, ${fertigFehler} Fehler` : ""}
          </span>
        )}
      </div>
      <div className="overflow-x-auto md:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-stone-600">
              {schreibenAction && (
                <th scope="col" className={TH}>
                  <input
                    type="checkbox"
                    checked={alleGewaehlt}
                    onChange={alleUmschalten}
                    disabled={laufend || waehlbar.length === 0}
                    aria-label="Alle Parzellen mit Schreiben-Stufe auswählen"
                    className="h-5 w-5"
                  />
                </th>
              )}
              <th scope="col" aria-sort={ariaSort("nummer")} className={TH}>
                <SortKnopf k="nummer">Garten</SortKnopf>
              </th>
              <th scope="col" aria-sort={ariaSort("nachname")} className={TH}>
                <SortKnopf k="nachname">Pächter</SortKnopf>
              </th>
              <th
                scope="col"
                aria-sort={ariaSort("beetSoll") ?? ariaSort("beetIst")}
                className={TH}
              >
                Beet <SortKnopf k="beetSoll">SOLL</SortKnopf>/<SortKnopf k="beetIst">IST</SortKnopf> (m²)
              </th>
              <th scope="col" aria-sort={ariaSort("stufeRang")} className={TH}>
                <SortKnopf k="stufeRang">Stufe</SortKnopf>
              </th>
              <th scope="col" aria-sort={ariaSort("plakette")} className={TH}>
                <SortKnopf k="plakette">Plakette</SortKnopf>
              </th>
              <th scope="col" aria-sort={ariaSort("maengel")} className={TH}>
                <SortKnopf k="maengel">Mängel</SortKnopf>
              </th>
              <th scope="col" className={TH}>
                Bericht
              </th>
            </tr>
          </thead>
          <tbody>
            {sortiert.map((z) => (
              // Ganze Zeile klickbar -> Begehungsansicht; Pächter-/PDF-Link
              // in der Zeile behalten ihre eigenen Ziele.
              <KlickZeile
                key={z.parzelleId}
                id={`p-${z.parzelleId}`}
                href={z.ansichtHref}
                className="border-b border-stone-100 hover:bg-stone-50"
              >
                {schreibenAction && (
                  <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const st = status.get(z.parzelleId);
                      if (st?.sym === "läuft") return <span className="text-sm text-stone-600" title={st.text}>…</span>;
                      if (st?.sym === "ok") return <span className="text-sm text-emerald-700" title={st.text}>✓</span>;
                      if (st?.sym === "warn")
                        return (
                          <span title={st.text}>
                            <TriangleAlert className="h-4 w-4 text-amber-800" aria-label={st.text} />
                          </span>
                        );
                      if (st?.sym === "fehler") return <span className="text-sm font-medium text-red-700" title={st.text}>✗</span>;
                      return SCHREIBEN_STUFEN.has(z.stufe) ? (
                        <input
                          type="checkbox"
                          checked={auswahl.has(z.parzelleId)}
                          onChange={() => umschalten(z.parzelleId)}
                          disabled={laufend}
                          aria-label={`Schreiben für ${z.parzelleId} auswählen`}
                          className="h-5 w-5"
                        />
                      ) : null;
                    })()}
                  </td>
                )}
                <td className="py-2 pr-3 font-medium">
                  <Link href={z.ansichtHref} className="text-emerald-700 hover:underline">
                    {z.parzelleId}
                  </Link>
                </td>
                <td className="py-2 pr-3">
                  <Link
                    href={`/parzellen/${z.parzelleId}`}
                    className="text-emerald-700 hover:underline"
                    title="Zur Parzellenverwaltung"
                  >
                    {`${z.nachname} ${z.vorname}`.trim() || "—"}
                  </Link>
                  {z.neupaechter && (
                    <span className="ml-1.5"><NeupaechterTag /></span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <BeetZelle ist={z.beetIst} soll={z.beetSoll} komp={z.komp} />
                </td>
                <td className={`py-2 pr-3 font-medium ${STUFE_TEXTFARBE[z.stufe] ?? "text-stone-600"}`}>
                  {STUFE_SYMBOL[z.stufe]} {STUFE_LABEL[z.stufe] ?? z.stufe}
                </td>
                <td className="py-2 pr-3">
                  {z.plakette ? (
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden /> ja
                    </span>
                  ) : (
                    "nein"
                  )}
                </td>
                <td className="py-2 pr-3">{z.maengel}</td>
                <td className="py-2 pr-3">
                  <a
                    href={z.pdfHref}
                    target="_blank"
                    rel="noopener"
                    aria-label={`PDF für ${z.parzelleId}`}
                    className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden /> PDF
                  </a>
                </td>
              </KlickZeile>
            ))}
          </tbody>
        </table>
        {sortiert.length === 0 && (
          <p className="py-4 text-sm text-stone-600">
            {f ? "Keine Zeile passt zum Filter." : "Keine Befunde mit Daten in dieser Auswahl."}
          </p>
        )}
      </div>
    </div>
  );
}

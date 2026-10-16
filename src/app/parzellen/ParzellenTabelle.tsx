"use client";

import Link from "next/link";
import { useState } from "react";
import { NeupaechterTag } from "@/components/NeupaechterTag";

// Sortierbare Parzellen-Tabelle der Verwaltung. Zeilen kommen fertig berechnet
// vom Server (Anlagen-Tab + Suche bleiben serverseitig), Sortierung ist rein
// clientseitig — Muster wie AuswertungsTabelle.

export type ParzellenZeile = {
  parzelleId: string; // "K45", "S59a"
  nummer: number;
  index: string; // "", "a", …
  anlage: string; // Kürzel
  nachname: string;
  vorname: string;
  neupaechter: boolean;
  ort: string;
  groesseM2: number | null;
  groesseErmitteltM2: number | null; // inoffiziell (Luftbild), nur wo erhoben
  status: string;
  statusLabel: string;
};

type SortKey =
  | "nummer"
  | "anlage"
  | "paechter"
  | "ort"
  | "groesse"
  | "groesseErmittelt"
  | "status";

// Stabiler Grund-Sort (= Server-Reihenfolge): Anlage, Nummer, Index.
const stamm = (a: ParzellenZeile, b: ParzellenZeile) =>
  a.anlage.localeCompare(b.anlage) || a.nummer - b.nummer || a.index.localeCompare(b.index);

function vergleich(a: ParzellenZeile, b: ParzellenZeile, key: SortKey): number {
  switch (key) {
    case "anlage":
      return a.anlage.localeCompare(b.anlage) || stamm(a, b);
    case "paechter":
      return `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`, "de");
    case "ort":
      return a.ort.localeCompare(b.ort, "de");
    // Leere Werte sortieren ans Ende der Aufsteigend-Richtung (-1).
    case "groesse":
      return (a.groesseM2 ?? -1) - (b.groesseM2 ?? -1);
    case "groesseErmittelt":
      return (a.groesseErmitteltM2 ?? -1) - (b.groesseErmitteltM2 ?? -1);
    case "status":
      return a.statusLabel.localeCompare(b.statusLabel, "de") || stamm(a, b);
    default:
      return stamm(a, b);
  }
}

// Sticky-Kopf (klebt beim Scrollen; auf schmalen Screens scrollt die Tabelle
// horizontal im Container, dort kann der Kopf nicht kleben).
const TH = "sticky top-0 z-10 border-b border-stone-300 bg-white py-2 pr-3";

export function ParzellenTabelle({ zeilen }: { zeilen: ParzellenZeile[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "nummer", dir: 1 });
  const klick = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const sortiert = [...zeilen].sort((a, b) => sort.dir * vergleich(a, b, sort.key));

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
        {aktiv ? (sort.dir === 1 ? " ▲" : " ▼") : <span className="text-stone-500"> ↕</span>}
      </button>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-stone-600">
            <th scope="col" aria-sort={ariaSort("nummer")} className={TH}>
              <SortKnopf k="nummer">Nr.</SortKnopf>
            </th>
            <th scope="col" aria-sort={ariaSort("anlage")} className={TH}>
              <SortKnopf k="anlage">Anlage</SortKnopf>
            </th>
            <th scope="col" aria-sort={ariaSort("paechter")} className={TH}>
              <SortKnopf k="paechter">Pächter</SortKnopf>
            </th>
            <th scope="col" aria-sort={ariaSort("ort")} className={TH}>
              <SortKnopf k="ort">Ort</SortKnopf>
            </th>
            <th scope="col" aria-sort={ariaSort("groesse")} className={TH}>
              <SortKnopf k="groesse">Fläche (m²)</SortKnopf>
            </th>
            <th scope="col" aria-sort={ariaSort("groesseErmittelt")} className={TH}>
              <SortKnopf k="groesseErmittelt">
                <span className="italic">erm. (m²)</span>
              </SortKnopf>
            </th>
            <th scope="col" aria-sort={ariaSort("status")} className={TH}>
              <SortKnopf k="status">Status</SortKnopf>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortiert.map((p) => (
            <tr key={p.parzelleId} className="border-b border-stone-100 hover:bg-stone-50">
              <td className="py-2 pr-3 font-medium">
                <Link href={`/parzellen/${p.parzelleId}`} className="text-emerald-700 hover:underline">
                  {p.parzelleId}
                </Link>
              </td>
              <td className="py-2 pr-3">{p.anlage}</td>
              <td className="py-2 pr-3">
                {`${p.nachname} ${p.vorname}`.trim() || "—"}
                {p.neupaechter && (
                  <span className="ml-1.5"><NeupaechterTag /></span>
                )}
              </td>
              <td className="py-2 pr-3">{p.ort || "—"}</td>
              <td className="py-2 pr-3">{p.groesseM2 ?? "—"}</td>
              <td className="py-2 pr-3 italic text-stone-600">{p.groesseErmitteltM2 ?? "—"}</td>
              <td className="py-2 pr-3">{p.statusLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sortiert.length === 0 && (
        <p className="py-4 text-sm text-stone-600">Keine Parzelle passt zur Auswahl.</p>
      )}
    </div>
  );
}

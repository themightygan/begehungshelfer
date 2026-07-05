"use client";

import Link from "next/link";
import { useState } from "react";
import { STUFE_LABEL, STUFE_SYMBOL } from "@/lib/constants";
import { KlickZeile } from "@/components/KlickZeile";
import { BeetZelle } from "@/components/BeetZelle";
import { NeupaechterTag } from "@/components/NeupaechterTag";

// Sortierbare Auswertungs-Tabelle (Einzel-Runde + kombinierte Jahres-Ansicht).
// Zeilen kommen fertig berechnet vom Server; Sortierung rein clientseitig.

export type Zeile = {
  parzelleId: string; // "S35" — auch Anker-Id der Zeile (p-S35)
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

export function AuswertungsTabelle({ zeilen }: { zeilen: Zeile[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "nummer",
    dir: 1,
  });

  const sortiert = [...zeilen].sort(
    (a, b) => sort.dir * vergleich(a, b, sort.key) || stamm(a, b)
  );

  const klick = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

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
        {aktiv ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left text-stone-500">
            <th className="py-2 pr-3"><SortKnopf k="nummer">Garten</SortKnopf></th>
            <th className="py-2 pr-3"><SortKnopf k="nachname">Pächter</SortKnopf></th>
            <th className="py-2 pr-3">
              Beet <SortKnopf k="beetSoll">SOLL</SortKnopf>/<SortKnopf k="beetIst">IST</SortKnopf> (m²)
            </th>
            <th className="py-2 pr-3"><SortKnopf k="stufeRang">Stufe</SortKnopf></th>
            <th className="py-2 pr-3"><SortKnopf k="plakette">Plakette</SortKnopf></th>
            <th className="py-2 pr-3"><SortKnopf k="maengel">Mängel</SortKnopf></th>
            <th className="py-2 pr-3">Bericht</th>
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
              <td className="py-2 pr-3">{STUFE_SYMBOL[z.stufe]} {STUFE_LABEL[z.stufe] ?? z.stufe}</td>
              <td className="py-2 pr-3">{z.plakette ? "👍 ja" : "nein"}</td>
              <td className="py-2 pr-3">{z.maengel}</td>
              <td className="py-2 pr-3">
                <a
                  href={z.pdfHref}
                  target="_blank"
                  rel="noopener"
                  className="text-emerald-700 hover:underline"
                >
                  📄 PDF
                </a>
              </td>
            </KlickZeile>
          ))}
        </tbody>
      </table>
    </div>
  );
}

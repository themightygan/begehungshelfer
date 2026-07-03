import Link from "next/link";
import { prisma } from "@/lib/db";
import { STUFE_LABEL, STUFE_SYMBOL } from "@/lib/constants";
import { istNeupaechter } from "@/lib/paechter";
import { NeupaechterTag } from "@/components/NeupaechterTag";
import { KlickZeile } from "@/components/KlickZeile";

export const dynamic = "force-dynamic";

type BefundLite = {
  stufe: string;
  notiz: string;
  gutGemacht: boolean;
  kompensationAusreichend: boolean;
  _count: { maengel: number; fotos: number };
  beete: { flaecheM2: number }[];
  parzelle: {
    parzelleId: string;
    nachname: string;
    vorname: string;
    groesseM2: number | null;
    eintritt: string;
    status: string;
  };
};

// Beet-IST-Zelle mit Ampel: grün = erfüllt (>80 % vom Soll) ODER dokumentiert
// kompensiert; gelb = knapp (60–80 %); rot = unter 60 % ohne Kompensation.
// IST 0 ohne Kompensation = (noch) nicht erfasst -> bewusst NICHT gewertet.
function BeetZelle({ ist, soll, komp }: { ist: number; soll: number | null; komp: boolean }) {
  const sollTeil = soll !== null ? `${m2(soll)} / ` : "— / ";
  if (ist === 0 && !komp) {
    return <span className="text-stone-400">{sollTeil}nicht erfasst</span>;
  }
  const ratio = soll ? ist / soll : null;
  const farbe = komp || (ratio !== null && ratio > 0.8)
    ? "text-emerald-700"
    : ratio !== null && ratio >= 0.6
      ? "text-amber-600"
      : ratio !== null
        ? "text-red-600"
        : "text-stone-700"; // keine Parzellenfläche -> kein Soll, keine Wertung
  return (
    <span>
      {sollTeil}
      <span className={`font-medium ${farbe}`}>
        {m2(ist)}
        {komp ? " · kompensiert" : ""}
      </span>
    </span>
  );
}

function hatDaten(b: BefundLite) {
  return (
    b.stufe !== "neutral" ||
    b._count.maengel > 0 ||
    b.beete.length > 0 ||
    b.gutGemacht ||
    b._count.fotos > 0 ||
    b.notiz.trim() !== ""
  );
}

function summary(befunde: BefundLite[]) {
  let begutachtet = 0,
    mitMaengel = 0,
    ohneMaengel = 0,
    plaketten = 0;
  for (const b of befunde) {
    if (!hatDaten(b)) continue;
    begutachtet++;
    if (b._count.maengel > 0) mitMaengel++;
    else ohneMaengel++;
    if (b.gutGemacht) plaketten++;
  }
  return { begutachtet, mitMaengel, ohneMaengel, plaketten };
}

function Zusammenfassung({ s }: { s: ReturnType<typeof summary> }) {
  return (
    <p className="text-sm text-stone-600">
      {s.begutachtet} begutachtet · {s.mitMaengel} mit Mängeln · {s.ohneMaengel} ohne Mängel ·{" "}
      {s.plaketten} Plakette(n)
    </p>
  );
}

const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export default async function AuswertungSeite({
  searchParams,
}: {
  searchParams: Promise<{ rundeId?: string }>;
}) {
  const rundeIdParam = Number((await searchParams).rundeId) || null;

  const inc = {
    parzelle: {
      select: {
        parzelleId: true,
        nachname: true,
        vorname: true,
        groesseM2: true,
        eintritt: true,
        status: true,
      },
    },
    beete: { select: { flaecheM2: true } },
    _count: { select: { maengel: true, fotos: true } },
  } as const;

  // --- Tabelle einer Begehung ---
  if (rundeIdParam) {
    const runde = await prisma.begehungsrunde.findUnique({
      where: { id: rundeIdParam },
      include: { befunde: { include: inc, orderBy: { parzelle: { nummer: "asc" } } } },
    });
    if (!runde) return <p className="text-stone-500">Begehung nicht gefunden.</p>;
    const zeilen = runde.befunde.filter(hatDaten);
    const s = summary(runde.befunde);

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Auswertung</h1>
            <p className="text-base text-stone-500">{runde.bezeichnung}</p>
            {runde.teilnehmende && (
              <p className="text-sm text-stone-400">Teilnehmer: {runde.teilnehmende}</p>
            )}
            <Zusammenfassung s={s} />
          </div>
          <Link href="/auswertung" className="shrink-0 text-base text-emerald-700 hover:underline">
            ← Übersicht
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left text-stone-500">
                <th className="py-2 pr-3">Garten</th>
                <th className="py-2 pr-3">Pächter</th>
                <th className="py-2 pr-3">Beet SOLL/IST (m²)</th>
                <th className="py-2 pr-3">Stufe</th>
                <th className="py-2 pr-3">Plakette</th>
                <th className="py-2 pr-3">Mängel</th>
                <th className="py-2 pr-3">Bericht</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((b) => {
                const ist = b.beete.reduce((x, y) => x + y.flaecheM2, 0);
                const soll = b.parzelle.groesseM2 ? b.parzelle.groesseM2 / 6 : null;
                return (
                  // Ganze Zeile klickbar -> Begehungsansicht; Pächter-/PDF-Link
                  // in der Zeile behalten ihre eigenen Ziele.
                  <KlickZeile
                    key={b.parzelle.parzelleId}
                    href={`/begehung/ansicht/${runde.id}/${b.parzelle.parzelleId}`}
                    className="border-b border-stone-100 hover:bg-stone-50"
                  >
                    <td className="py-2 pr-3 font-medium">
                      <Link
                        href={`/begehung/ansicht/${runde.id}/${b.parzelle.parzelleId}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {b.parzelle.parzelleId}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/parzellen/${b.parzelle.parzelleId}`}
                        className="text-emerald-700 hover:underline"
                        title="Zur Parzellenverwaltung"
                      >
                        {`${b.parzelle.nachname} ${b.parzelle.vorname}`.trim() || "—"}
                      </Link>
                      {istNeupaechter(b.parzelle.eintritt, b.parzelle.status) && (
                        <span className="ml-1.5"><NeupaechterTag /></span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <BeetZelle ist={ist} soll={soll} komp={b.kompensationAusreichend} />
                    </td>
                    <td className="py-2 pr-3">{STUFE_SYMBOL[b.stufe]} {STUFE_LABEL[b.stufe] ?? b.stufe}</td>
                    <td className="py-2 pr-3">{b.gutGemacht ? "👍 ja" : "nein"}</td>
                    <td className="py-2 pr-3">{b._count.maengel}</td>
                    <td className="py-2 pr-3">
                      <a
                        href={`/api/parzelle/${b.parzelle.parzelleId}/pdf?rundeId=${runde.id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-emerald-700 hover:underline"
                      >
                        📄 PDF
                      </a>
                    </td>
                  </KlickZeile>
                );
              })}
            </tbody>
          </table>
        </div>
        <a href={`/api/export/csv?rundeId=${runde.id}`} className="inline-block rounded border border-stone-300 px-3 py-1.5 text-base hover:bg-stone-100">⬇ als CSV</a>
      </div>
    );
  }

  // --- Übersicht: je Kalenderjahr aggregiert + Begehungen ---
  const runden = await prisma.begehungsrunde.findMany({
    orderBy: { datum: "desc" },
    include: { anlage: true, befunde: { include: inc } },
  });
  const jahre = new Map<number, typeof runden>();
  for (const r of runden) {
    const j = new Date(r.datum).getFullYear();
    let arr = jahre.get(j);
    if (!arr) jahre.set(j, (arr = []));
    arr.push(r);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold">Auswertung</h1>
        <Link href="/" className="shrink-0 text-base text-emerald-700 hover:underline">Start</Link>
      </div>

      {[...jahre.entries()].map(([jahr, rs]) => {
        const alle = rs.flatMap((r) => r.befunde);
        const s = summary(alle);
        return (
          <section key={jahr} className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-semibold">{jahr}</h2>
            <p className="text-sm font-medium text-stone-700">Jahr gesamt:</p>
            <Zusammenfassung s={s} />
            <ul className="mt-3 space-y-1">
              {rs.map((r) => {
                const rs2 = summary(r.befunde);
                return (
                  <li key={r.id} className="border-t border-stone-100">
                    <Link
                      href={`/auswertung?rundeId=${r.id}`}
                      className="flex items-start justify-between gap-3 py-2 text-sm hover:bg-stone-50"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-emerald-700">{r.bezeichnung}</span>
                        {r.teilnehmende && (
                          <p className="text-stone-400">Teilnehmer: {r.teilnehmende}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-stone-500">
                        {rs2.begutachtet} begutachtet · {rs2.mitMaengel} m. Mängeln · {rs2.plaketten} Plakette(n)
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {jahre.size === 0 && <p className="text-base text-stone-400">Noch keine Begehungen.</p>}
    </div>
  );
}

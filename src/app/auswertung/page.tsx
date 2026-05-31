import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type BefundLite = {
  stufe: string;
  notiz: string;
  gutGemacht: boolean;
  _count: { maengel: number; fotos: number };
  beete: { flaecheM2: number }[];
  parzelle: {
    parzelleId: string;
    nachname: string;
    vorname: string;
    groesseM2: number | null;
  };
};

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
      select: { parzelleId: true, nachname: true, vorname: true, groesseM2: true },
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
                <th className="py-2 pr-3">Plakette</th>
                <th className="py-2 pr-3">Mängel</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((b) => {
                const ist = b.beete.reduce((x, y) => x + y.flaecheM2, 0);
                const soll = b.parzelle.groesseM2 ? b.parzelle.groesseM2 / 6 : null;
                return (
                  <tr key={b.parzelle.parzelleId} className="border-b border-stone-100">
                    <td className="py-2 pr-3 font-medium">{b.parzelle.parzelleId}</td>
                    <td className="py-2 pr-3">{`${b.parzelle.nachname} ${b.parzelle.vorname}`.trim() || "—"}</td>
                    <td className="py-2 pr-3">{soll !== null ? `${m2(soll)} / ${m2(ist)}` : `— / ${m2(ist)}`}</td>
                    <td className="py-2 pr-3">{b.gutGemacht ? "ja" : "nein"}</td>
                    <td className="py-2 pr-3">{b._count.maengel}</td>
                  </tr>
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
                  <li key={r.id} className="flex items-start justify-between gap-3 border-t border-stone-100 pt-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/auswertung?rundeId=${r.id}`} className="font-medium text-emerald-700 hover:underline">
                        {r.bezeichnung}
                      </Link>
                      {r.teilnehmende && (
                        <p className="text-stone-400">Teilnehmer: {r.teilnehmende}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-stone-500">
                      {rs2.begutachtet} begutachtet · {rs2.mitMaengel} m. Mängeln · {rs2.plaketten} Plakette(n)
                    </span>
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

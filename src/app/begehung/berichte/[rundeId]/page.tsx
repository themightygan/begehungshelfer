import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STUFE_LABEL, STUFE_SYMBOL } from "@/lib/constants";
import { hatDaten } from "@/lib/auswertung";
import { BeetZelle } from "@/components/BeetZelle";

export const dynamic = "force-dynamic";

export default async function BerichteSeite({
  params,
}: {
  params: Promise<{ rundeId: string }>;
}) {
  const rundeId = Number((await params).rundeId);
  const runde = await prisma.begehungsrunde.findUnique({
    where: { id: rundeId },
    include: {
      anlage: true,
      befunde: {
        orderBy: { parzelle: { nummer: "asc" } },
        include: {
          parzelle: true,
          _count: { select: { maengel: true, fotos: true } },
          beete: { select: { flaecheM2: true } },
        },
      },
    },
  });
  if (!runde) notFound();

  // Nur tatsächlich begutachtete Parzellen (mit Inhalt), nicht bloß geöffnete.
  const begutachtet = runde.befunde.filter(hatDaten);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Berichte</h1>
          <p className="text-base text-stone-500">{runde.bezeichnung}</p>
          {runde.teilnehmende && (
            <p className="text-sm text-stone-400">Teilnehmer: {runde.teilnehmende}</p>
          )}
          <p className="text-sm text-stone-400">Status: {runde.status}</p>
        </div>
        <Link href="/" className="shrink-0 text-base text-emerald-700 hover:underline">
          Start
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/export/csv?rundeId=${runde.id}`}
          className="rounded border border-stone-300 px-3 py-1.5 text-base hover:bg-stone-100"
        >
          ⬇ CSV dieser Begehung
        </a>
        <Link
          href={`/begehung/korrektur/${runde.id}`}
          className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-base text-emerald-800 hover:bg-emerald-100"
        >
          🪄 KI-Textkorrektur
        </Link>
        <span className="text-sm text-stone-500">
          {begutachtet.length} begutachtete Parzellen · Balken öffnet die Ansicht (editierbar):
        </span>
      </div>

      {begutachtet.length === 0 ? (
        <p className="text-base text-stone-400">
          In dieser Begehung wurden keine Parzellen mit Daten erfasst.
        </p>
      ) : (
        <ul className="space-y-2">
          {begutachtet.map((b) => {
            const beetIst = b.beete.reduce((s, x) => s + x.flaecheM2, 0);
            const beetSoll = b.parzelle.groesseM2 ? b.parzelle.groesseM2 / 6 : null;
            return (
              // Ganzer Balken -> editierbare Begehungsansicht; der PDF-Knopf
              // liegt absolut ÜBER dem Balken (Geschwister, kein <a> im <a>).
              <li key={b.id} className="relative">
                <Link
                  href={`/begehung/ansicht/${runde.id}/${b.parzelle.parzelleId}`}
                  className="block rounded-lg border border-stone-200 bg-white p-3 pr-28 hover:border-emerald-400 hover:bg-stone-50"
                >
                  <span className="text-lg font-medium text-emerald-800">
                    {b.parzelle.parzelleId}
                  </span>
                  <span className="ml-2 text-sm text-stone-500">
                    {STUFE_SYMBOL[b.stufe]} {STUFE_LABEL[b.stufe] ?? b.stufe}
                    {b.gutGemacht ? " · 👍" : ""}
                    {" · Beet "}
                    <BeetZelle ist={beetIst} soll={beetSoll} komp={b.kompensationAusreichend} />
                    {b._count.maengel > 0 ? ` · ${b._count.maengel} Mangel` : ""}
                    {b._count.fotos > 0 ? ` · ${b._count.fotos} Foto` : ""}
                  </span>
                </Link>
                <a
                  href={`/api/parzelle/${b.parzelle.parzelleId}/pdf?rundeId=${runde.id}`}
                  target="_blank"
                  rel="noopener"
                  className="absolute right-3 top-2.5 rounded border border-emerald-700 px-4 py-1.5 text-base font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  📄 PDF
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

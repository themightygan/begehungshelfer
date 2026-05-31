import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STUFE_LABEL } from "@/lib/constants";

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
          _count: { select: { maengel: true, fotos: true, beete: true } },
        },
      },
    },
  });
  if (!runde) notFound();

  // Nur tatsächlich begutachtete Parzellen (mit Inhalt), nicht bloß geöffnete.
  const begutachtet = runde.befunde.filter(
    (b) =>
      b.stufe !== "neutral" ||
      b._count.maengel > 0 ||
      b._count.fotos > 0 ||
      b._count.beete > 0 ||
      b.gutGemacht ||
      b.notiz.trim() !== ""
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Berichte</h1>
          <p className="text-base text-stone-500">{runde.bezeichnung}</p>
          {runde.teilnehmende && (
            <p className="text-sm text-stone-400">Teilnehmer: {runde.teilnehmende}</p>
          )}
          <p className="text-sm text-stone-400">
            Status: {runde.status}
            {runde.status === "abgeschlossen" ? " · eingefroren (nur Ansicht)" : ""}
          </p>
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
        <span className="text-sm text-stone-500">
          {begutachtet.length} begutachtete Parzellen · Bericht-PDF je Parzelle:
        </span>
      </div>

      {begutachtet.length === 0 ? (
        <p className="text-base text-stone-400">
          In dieser Begehung wurden keine Parzellen mit Daten erfasst.
        </p>
      ) : (
        <ul className="space-y-2">
          {begutachtet.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/begehung/ansicht/${runde.id}/${b.parzelle.parzelleId}`}
                  className="text-lg font-medium text-emerald-700 hover:underline"
                >
                  {b.parzelle.parzelleId}
                </Link>
                <span className="ml-2 text-sm text-stone-500">
                  {STUFE_LABEL[b.stufe] ?? b.stufe}
                  {b.gutGemacht ? " · 👍" : ""}
                  {b._count.maengel > 0 ? ` · ${b._count.maengel} Mangel` : ""}
                  {b._count.beete > 0 ? ` · ${b._count.beete} Beet` : ""}
                  {b._count.fotos > 0 ? ` · ${b._count.fotos} Foto` : ""}
                </span>
              </div>
              <a
                href={`/api/parzelle/${b.parzelle.parzelleId}/pdf?rundeId=${runde.id}`}
                target="_blank"
                rel="noopener"
                className="shrink-0 rounded border border-emerald-700 px-4 py-2 text-base font-medium text-emerald-700 hover:bg-emerald-50"
              >
                📄 PDF
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

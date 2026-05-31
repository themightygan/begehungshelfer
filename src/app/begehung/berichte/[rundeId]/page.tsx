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
          _count: { select: { maengel: true, fotos: true } },
        },
      },
    },
  });
  if (!runde) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Berichte</h1>
          <p className="text-sm text-stone-500">{runde.bezeichnung}</p>
          {runde.teilnehmende && (
            <p className="text-xs text-stone-400">Teilnehmer: {runde.teilnehmende}</p>
          )}
          <p className="text-xs text-stone-400">
            Status: {runde.status}
            {runde.status === "abgeschlossen" ? " (eingefroren)" : ""}
          </p>
        </div>
        <Link href="/" className="shrink-0 text-sm text-emerald-700 hover:underline">
          Start
        </Link>
      </div>

      <p className="text-sm text-stone-500">
        {runde.befunde.length} Parzellen erfasst — Bericht-PDF je Parzelle:
      </p>

      {runde.befunde.length === 0 ? (
        <p className="text-sm text-stone-400">Keine Befunde in dieser Begehung.</p>
      ) : (
        <ul className="space-y-2">
          {runde.befunde.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3"
            >
              <div className="min-w-0">
                <span className="font-medium">{b.parzelle.parzelleId}</span>
                <span className="ml-2 text-xs text-stone-500">
                  {STUFE_LABEL[b.stufe] ?? b.stufe}
                  {b._count.maengel > 0 ? ` · ${b._count.maengel} Mangel` : ""}
                  {b._count.fotos > 0 ? ` · ${b._count.fotos} Foto` : ""}
                </span>
              </div>
              <a
                href={`/api/parzelle/${b.parzelle.parzelleId}/pdf?rundeId=${runde.id}`}
                target="_blank"
                rel="noopener"
                className="shrink-0 rounded border border-emerald-700 px-2.5 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
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

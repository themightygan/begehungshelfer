import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STUFE_LABEL, STUFE_SYMBOL } from "@/lib/constants";
import { Thumb } from "@/components/Thumb";

export const dynamic = "force-dynamic";

const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

function FotoGitter({ fotos }: { fotos: { id: number; dateipfad: string }[] }) {
  if (fotos.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
      {fotos.map((f) => (
        <Thumb key={f.id} src={`/api/datei/${f.dateipfad}`} />
      ))}
    </div>
  );
}

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
          maengel: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
          beete: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
          fotos: {
            where: { mangelId: null, beetId: null, kontext: "zustand" },
            orderBy: { id: "asc" },
          },
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
        <Link
          href={`/begehung/korrektur/${runde.id}`}
          className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-base text-emerald-800 hover:bg-emerald-100"
        >
          🪄 KI-Textkorrektur
        </Link>
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
          {begutachtet.map((b) => {
            const beetIst = b.beete.reduce((s, x) => s + x.flaecheM2, 0);
            const beetSoll = b.parzelle.groesseM2 ? b.parzelle.groesseM2 / 6 : null;
            return (
              <li key={b.id}>
                {/* Ganzer Balken klappt das Protokoll auf; der PDF-Knopf liegt
                    absolut ÜBER dem Balken (außerhalb der summary) und löst
                    das Aufklappen daher nicht aus. */}
                <details className="relative rounded-lg border border-stone-200 bg-white">
                  <summary className="cursor-pointer list-none p-3 pr-28 hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
                    <span className="text-lg font-medium text-emerald-800">
                      {b.parzelle.parzelleId}
                    </span>
                    <span className="ml-2 text-sm text-stone-500">
                      {STUFE_LABEL[b.stufe] ?? b.stufe}
                      {b.gutGemacht ? " · 👍" : ""}
                      {b._count.maengel > 0 ? ` · ${b._count.maengel} Mangel` : ""}
                      {b._count.beete > 0 ? ` · ${b._count.beete} Beet` : ""}
                      {b._count.fotos > 0 ? ` · ${b._count.fotos} Foto` : ""}
                    </span>
                  </summary>
                  <a
                    href={`/api/parzelle/${b.parzelle.parzelleId}/pdf?rundeId=${runde.id}`}
                    target="_blank"
                    rel="noopener"
                    className="absolute right-3 top-2.5 rounded border border-emerald-700 px-4 py-1.5 text-base font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    📄 PDF
                  </a>

                  {/* Protokoll (kompakt, read-only) */}
                  <div className="space-y-3 border-t border-stone-100 p-3 text-base">
                    <p className="text-sm text-stone-500">
                      {b.parzelle.nachname} {b.parzelle.vorname}
                      {" · "}
                      {STUFE_SYMBOL[b.stufe]} {STUFE_LABEL[b.stufe] ?? b.stufe}
                      {b.gutGemacht
                        ? ` · 👍 Plakette${b.plakettenNotiz ? ` (${b.plakettenNotiz})` : ""}`
                        : ""}
                      {" · "}
                      <Link
                        href={`/begehung/ansicht/${runde.id}/${b.parzelle.parzelleId}`}
                        className="text-emerald-700 hover:underline"
                      >
                        ✎ bearbeiten
                      </Link>
                    </p>
                    {b.notiz.trim() !== "" && (
                      <p className="whitespace-pre-line text-stone-700">{b.notiz}</p>
                    )}
                    {b.diktatNachgereicht.trim() !== "" && (
                      <p className="whitespace-pre-line text-sm text-amber-800">
                        🎤 {b.diktatNachgereicht}
                      </p>
                    )}

                    {b.fotos.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-stone-500">Gesamtansicht</p>
                        <FotoGitter fotos={b.fotos} />
                      </div>
                    )}

                    {(b.beete.length > 0 || beetSoll !== null) && b._count.beete > 0 && (
                      <div>
                        <p className="text-sm font-medium text-stone-500">
                          Gemüsebeete — IST {m2(beetIst)} m²
                          {beetSoll !== null ? ` / SOLL ${m2(beetSoll)} m²` : ""}
                          {b.kompensationAusreichend ? " · kompensiert" : ""}
                        </p>
                        {b.beete.map((beet) => (
                          <div key={beet.id} className="mt-1">
                            <p className="text-sm text-stone-600">
                              {beet.bezeichnung || "Beet"}: {m2(beet.flaecheM2)} m²
                            </p>
                            <FotoGitter fotos={beet.fotos} />
                          </div>
                        ))}
                      </div>
                    )}

                    {b.maengel.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-stone-500">
                          Mängel ({b.maengel.length})
                        </p>
                        <ul className="mt-1 space-y-2">
                          {b.maengel.map((mg, i) => (
                            <li key={mg.id} className="rounded border border-stone-100 p-2">
                              <p className="font-medium">
                                {i + 1}. {mg.punkt || "(ohne Bezeichnung)"}
                                {mg.frist
                                  ? ` · Frist ${new Date(mg.frist).toLocaleDateString("de-DE")}`
                                  : ""}
                                {mg.status === "behoben" ? " · ✓ behoben" : ""}
                              </p>
                              {mg.notiz.trim() !== "" && (
                                <p className="whitespace-pre-line text-sm text-stone-600">
                                  {mg.notiz}
                                </p>
                              )}
                              <FotoGitter fotos={mg.fotos} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

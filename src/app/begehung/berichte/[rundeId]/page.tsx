import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Sparkles, ThumbsUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { STUFE_LABEL, STUFE_SYMBOL, STUFE_TEXTFARBE } from "@/lib/constants";
import { hatDaten, stufeRang } from "@/lib/auswertung";
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
  // Kritische zuerst (Eskalation absteigend), dann Nummer + Index.
  const begutachtet = runde.befunde.filter(hatDaten).sort(
    (a, b) =>
      stufeRang(b.stufe) - stufeRang(a.stufe) ||
      a.parzelle.nummer - b.parzelle.nummer ||
      a.parzelle.index.localeCompare(b.parzelle.index, "de")
  );

  // Zeilen-Tönung nur als Zustandssprache: Abmahnung/Kündigung stechen heraus.
  const ZEILEN_TON: Record<string, string> = {
    kuendigung: "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100",
    abmahnung_2: "border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100",
    abmahnung_1: "border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Berichte</h1>
          <p className="text-base text-stone-500">{runde.bezeichnung}</p>
          {runde.teilnehmende && (
            <p className="text-sm text-stone-600">Teilnehmer: {runde.teilnehmende}</p>
          )}
          <p className="text-sm text-stone-600">
            {runde.status === "abgeschlossen"
              ? `Abgeschlossen${
                  runde.abgeschlossenAm
                    ? ` am ${runde.abgeschlossenAm.toLocaleDateString("de-DE")}`
                    : ""
                }`
              : "Runde läuft noch — Berichte sind vorläufig"}
          </p>
        </div>
        <Link href="/" className="shrink-0 text-base text-emerald-700 hover:underline">
          Start
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/export/csv?rundeId=${runde.id}`}
          className="inline-flex items-center gap-1.5 rounded border border-stone-300 px-3 py-1.5 text-base hover:bg-stone-100"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden /> CSV dieser Begehung
        </a>
        <Link
          href={`/begehung/korrektur/${runde.id}`}
          className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-base text-emerald-800 hover:bg-emerald-100"
        >
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden /> KI-Textkorrektur
        </Link>
        <span className="text-sm text-stone-600">
          {begutachtet.length} begutachtete Parzellen, kritische zuerst — Antippen öffnet die
          editierbare Ansicht.
        </span>
      </div>

      {begutachtet.length === 0 ? (
        <p className="text-base text-stone-600">
          In dieser Begehung wurden noch keine Parzellen mit Daten erfasst.
          {runde.status !== "abgeschlossen" && (
            <>
              {" "}
              <Link href="/begehung" className="text-emerald-700 hover:underline">
                → zur Begehung
              </Link>
            </>
          )}
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
                  className={`block rounded-lg border p-3 pr-28 ${
                    ZEILEN_TON[b.stufe] ??
                    "border-stone-200 bg-white hover:border-emerald-400 hover:bg-stone-50"
                  }`}
                >
                  <span className="text-lg font-medium text-emerald-800">
                    {b.parzelle.parzelleId}
                  </span>
                  <span
                    className={`ml-2 text-sm font-medium ${
                      STUFE_TEXTFARBE[b.stufe] ?? "text-stone-600"
                    }`}
                  >
                    {STUFE_SYMBOL[b.stufe]} {STUFE_LABEL[b.stufe] ?? b.stufe}
                  </span>
                  <span className="ml-2 text-sm text-stone-600">
                    {b.gutGemacht && (
                      <>
                        <ThumbsUp className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-emerald-700" aria-hidden />
                        Plakette ·{" "}
                      </>
                    )}
                    {"Beet "}
                    <BeetZelle ist={beetIst} soll={beetSoll} komp={b.kompensationAusreichend} />
                    {b._count.maengel > 0
                      ? ` · ${b._count.maengel} ${b._count.maengel === 1 ? "Mangel" : "Mängel"}`
                      : ""}
                    {b._count.fotos > 0
                      ? ` · ${b._count.fotos} ${b._count.fotos === 1 ? "Foto" : "Fotos"}`
                      : ""}
                  </span>
                </Link>
                <a
                  href={`/api/parzelle/${b.parzelle.parzelleId}/pdf?rundeId=${runde.id}`}
                  target="_blank"
                  rel="noopener"
                  aria-label={`PDF für ${b.parzelle.parzelleId}`}
                  className="absolute right-3 top-2.5 inline-flex items-center gap-1.5 rounded border border-emerald-700 px-4 py-1.5 text-base font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <FileText className="h-4 w-4 shrink-0" aria-hidden /> PDF
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

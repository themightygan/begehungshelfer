import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { STUFE_LABEL } from "@/lib/constants";
import { getAktiveRundeId } from "@/lib/runde";
import { begehungAbschliessen, begehungVerlassen } from "./actions";
import { ConfirmButton } from "./ConfirmButton";

export const dynamic = "force-dynamic";

export default async function BegehungSeite() {
  const rundeId = await getAktiveRundeId();
  if (!rundeId) redirect("/");

  const runde = await prisma.begehungsrunde.findUnique({
    where: { id: rundeId },
    include: { anlage: true },
  });
  if (!runde) redirect("/");

  const [parzellen, befunde] = await Promise.all([
    prisma.parzelle.findMany({
      where: { anlageId: runde.anlageId },
      orderBy: [{ nummer: "asc" }, { index: "asc" }],
      select: { id: true, parzelleId: true },
    }),
    prisma.befund.findMany({
      where: { rundeId },
      include: { _count: { select: { maengel: true } } },
    }),
  ]);

  // Bearbeitungsstand je Parzelle (für Markierung im Raster).
  const stand = new Map(
    befunde.map((b) => [
      b.parzelleId,
      { stufe: b.stufe, maengel: b._count.maengel },
    ])
  );
  const bearbeitet = befunde.filter(
    (b) => b.stufe !== "neutral" || b._count.maengel > 0 || b.notiz.trim() !== ""
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{runde.bezeichnung}</h1>
          <p className="text-sm text-stone-500">
            {parzellen.length} Parzellen · {bearbeitet} bearbeitet
          </p>
          {runde.teilnehmende && (
            <p className="text-xs text-stone-400">
              Teilnehmer: {runde.teilnehmende}
            </p>
          )}
        </div>
        <Link href="/" className="shrink-0 text-sm text-emerald-700 hover:underline">
          Start
        </Link>
      </div>

      {/* Karte der Anlage (statisches Orientierungsbild) */}
      {runde.anlage.planBild ? (
        <details className="rounded-lg border border-stone-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-600">
            🗺️ Karte der Anlage anzeigen
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={runde.anlage.planBild}
            alt={`Plan ${runde.anlage.name}`}
            className="mt-2 w-full rounded border border-stone-200"
          />
        </details>
      ) : (
        <p className="text-xs text-stone-400">
          Für {runde.anlage.name} ist kein Plan hinterlegt.
        </p>
      )}

      {/* Parzellen-Raster */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-stone-600">Parzellen</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {parzellen.map((p) => {
            const s = stand.get(p.id);
            const aktiv = s && (s.stufe !== "neutral" || s.maengel > 0);
            return (
              <Link
                key={p.id}
                href={`/parzelle/${p.parzelleId}`}
                className={`rounded border px-2 py-3 text-center text-base font-medium ${
                  aktiv
                    ? "border-emerald-400 bg-emerald-50"
                    : s
                      ? "border-stone-300 bg-stone-50"
                      : "border-stone-200 bg-white"
                } hover:border-emerald-400`}
                title={
                  s
                    ? `${STUFE_LABEL[s.stufe] ?? s.stufe}${
                        s.maengel ? `, ${s.maengel} Mangel` : ""
                      }`
                    : "noch nicht erfasst"
                }
              >
                {p.parzelleId}
                {s && s.maengel > 0 && (
                  <span className="ml-1 text-xs text-red-600">{s.maengel}</span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Abschluss / Verlassen */}
      <div className="space-y-2 border-t border-stone-200 pt-4">
        <details className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-900">
            ✔ Begehung abschließen
          </summary>
          <p className="mt-2 text-xs text-amber-800">
            Die Runde wird <strong>eingefroren</strong> (unveränderlich) und die
            Berichte werden erzeugt. Danach keine Änderungen mehr möglich.
          </p>
          <form action={begehungAbschliessen} className="mt-2">
            <ConfirmButton
              message="Begehung jetzt abschließen? Die Runde wird eingefroren und kann nicht mehr geändert werden."
              className="rounded bg-amber-700 px-4 py-2.5 text-base font-medium text-white hover:bg-amber-800"
            >
              Jetzt abschließen & Berichte erzeugen
            </ConfirmButton>
          </form>
        </details>
        <form action={begehungVerlassen}>
          <button className="text-xs text-stone-500 hover:underline">
            Begehung pausieren (zurück zum Start, ohne Abschluss)
          </button>
        </form>
      </div>
    </div>
  );
}

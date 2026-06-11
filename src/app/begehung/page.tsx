import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { STUFE_LABEL } from "@/lib/constants";
import { getAktiveRunde } from "@/lib/runde";
import { begehungAbschliessen, begehungVerlassen, begehungAbbrechen } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { AbschlussButton } from "./AbschlussButton";

export const dynamic = "force-dynamic";

export default async function BegehungSeite() {
  const aktiv = await getAktiveRunde();
  if (!aktiv) redirect("/");
  const rundeId = aktiv.id;

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

  // Nachbegehung: offene Mängel je Parzelle (aus allen Befunden) -> Raster-Ampel.
  const istNach = runde.art === "nachbegehung";
  const offenMap = new Map<number, { offen: number; ueberfaellig: number }>();
  if (istNach) {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const offene = await prisma.mangel.findMany({
      where: { status: "offen", befund: { parzelle: { anlageId: runde.anlageId } } },
      select: { frist: true, befund: { select: { parzelleId: true } } },
    });
    for (const m of offene) {
      const pid = m.befund.parzelleId;
      const e = offenMap.get(pid) ?? { offen: 0, ueberfaellig: 0 };
      e.offen++;
      if (m.frist && new Date(m.frist) < heute) e.ueberfaellig++;
      offenMap.set(pid, e);
    }
  }

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
        {istNach && (
          <p className="mb-2 text-sm text-stone-500">
            Nachbegehung: <span className="font-medium text-red-600">rot</span> = überfällige Mängel,{" "}
            <span className="font-medium text-amber-600">gelb</span> = offene Mängel.
          </p>
        )}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {parzellen.map((p) => {
            const s = stand.get(p.id);
            const o = offenMap.get(p.id);
            let farbe: string;
            if (istNach) {
              farbe = o?.ueberfaellig
                ? "border-red-400 bg-red-50"
                : o?.offen
                  ? "border-amber-400 bg-amber-50"
                  : s
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-stone-200 bg-white";
            } else {
              const aktiv = s && (s.stufe !== "neutral" || s.maengel > 0);
              farbe = aktiv
                ? "border-emerald-400 bg-emerald-50"
                : s
                  ? "border-stone-300 bg-stone-50"
                  : "border-stone-200 bg-white";
            }
            return (
              <Link
                key={p.id}
                href={`/parzelle/${p.parzelleId}`}
                className={`rounded border px-2 py-3 text-center text-base font-medium ${farbe} hover:border-emerald-400`}
                title={istNach && o ? `${o.offen} offen, ${o.ueberfaellig} überfällig` : undefined}
              >
                {p.parzelleId}
                {istNach && o?.offen ? (
                  <span className={`ml-1 text-xs ${o.ueberfaellig ? "text-red-600" : "text-amber-600"}`}>{o.offen}</span>
                ) : s && s.maengel > 0 ? (
                  <span className="ml-1 text-xs text-red-600">{s.maengel}</span>
                ) : null}
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
            <AbschlussButton rundeId={rundeId} />
          </form>
        </details>
        <form action={begehungVerlassen}>
          <button className="text-xs text-stone-500 hover:underline">
            Begehung pausieren (zurück zum Start, ohne Abschluss)
          </button>
        </form>
        <form action={begehungAbbrechen.bind(null, rundeId)}>
          <ConfirmButton
            message="Begehung wirklich ABBRECHEN? Alle in dieser Begehung erfassten Daten (Befunde, Mängel, Fotos, Beete) werden gelöscht. Archiv und frühere Begehungen bleiben erhalten."
            className="text-xs text-red-600 hover:underline"
          >
            Begehung abbrechen (Daten verwerfen)
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}

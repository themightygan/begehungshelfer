import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAktiveRunde } from "@/lib/runde";
import { begehungStarten, begehungFortsetzen, begehungAbbrechen } from "./begehung/actions";
import { ConfirmButton } from "./begehung/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [anlagen, runden, aktiveRunde, vorstand] = await Promise.all([
    prisma.anlage.findMany({ orderBy: { kuerzel: "asc" } }),
    prisma.begehungsrunde.findMany({
      orderBy: { erstelltAm: "desc" },
      include: { anlage: true, _count: { select: { befunde: true } } },
    }),
    getAktiveRunde(),
    prisma.vorstand.findMany({ where: { aktiv: true }, orderBy: { sortierung: "asc" } }),
  ]);
  const offeneRunden = runden.filter((r) => r.status === "offen");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/maengel"
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
        >
          📋 Mängel-Nachverfolgung
        </Link>
        <Link
          href="/auswertung"
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
        >
          📊 Auswertung
        </Link>
        <Link
          href="/parzellen"
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
        >
          🗂️ Parzellenverwaltung
        </Link>
        <a
          href="/api/export/csv"
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
        >
          ⬇ CSV-Export
        </a>
      </div>

      {aktiveRunde && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">Es läuft eine Begehung.</p>
          <Link
            href="/begehung"
            className="mt-2 inline-block rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            → Begehung fortsetzen
          </Link>
        </div>
      )}

      {/* Offene Begehung anderer Geräte: BEITRETEN statt versehentlich eine
          zweite parallele Runde zu starten (sonst zwei getrennte Berichte). */}
      {!aktiveRunde && offeneRunden.length > 0 && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            {offeneRunden.length === 1
              ? "Es läuft bereits eine offene Begehung — zum Mitmachen beitreten:"
              : `Es laufen bereits ${offeneRunden.length} offene Begehungen — zum Mitmachen beitreten:`}
          </p>
          <div className="mt-2 space-y-2">
            {offeneRunden.map((r) => (
              <form
                key={r.id}
                action={begehungFortsetzen.bind(null, r.id)}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate text-sm text-emerald-900">
                  {r.bezeichnung}
                  {r.teilnehmende ? ` · ${r.teilnehmende}` : ""}
                </span>
                <button className="shrink-0 rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                  → beitreten
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {/* Begehung starten */}
      <form
        action={begehungStarten}
        className="space-y-4 rounded-lg border border-stone-200 bg-white p-4"
      >
        <h1 className="text-lg font-semibold">Begehung starten</h1>

        <div>
          <p className="mb-1 text-sm font-medium text-stone-600">Art</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="art" value="begehung" defaultChecked />
              Begehung
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="art" value="nachbegehung" />
              Nachbegehung (offene Mängel prüfen)
            </label>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-stone-600">Anlage</p>
          <div className="flex gap-4">
            {anlagen.map((a, i) => (
              <label key={a.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="anlageId"
                  value={a.id}
                  defaultChecked={i === 0}
                  required
                />
                {a.name} ({a.kuerzel})
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-stone-600">Teilnehmer</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {vorstand.map((v) => (
              <label key={v.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="teilnehmer" value={v.name} />
                {v.name}
              </label>
            ))}
          </div>
        </div>

        {offeneRunden.length > 0 ? (
          <ConfirmButton
            message={`Es ist bereits eine Begehung offen (${offeneRunden[0].bezeichnung}). Wirklich eine ZWEITE parallele Begehung starten? Für eine gemeinsame Begehung stattdessen oben „beitreten" wählen.`}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Begehung starten →
          </ConfirmButton>
        ) : (
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            Begehung starten →
          </button>
        )}
      </form>

      {/* Begehungen */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-stone-600">Begehungen</h2>
        {runden.length === 0 ? (
          <p className="text-sm text-stone-400">Noch keine Begehung.</p>
        ) : (
          <ul className="space-y-2">
            {runden.map((r) => (
              // Abgeschlossene Runden: ganzer Balken klickbar -> Berichte.
              // Offene behalten ihre Aktions-Knöpfe (fortsetzen/abbrechen).
              r.status === "abgeschlossen" ? (
                <li key={r.id}>
                  <Link
                    href={`/begehung/berichte/${r.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:border-emerald-400 hover:bg-stone-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.bezeichnung}</p>
                      <p className="truncate text-xs text-stone-500">
                        {r._count.befunde} Befund(e)
                        {r.teilnehmende ? ` · ${r.teilnehmende}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-stone-300 px-2.5 py-1 text-sm">
                      Berichte →
                    </span>
                  </Link>
                </li>
              ) : (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.bezeichnung}</p>
                  <p className="truncate text-xs text-stone-500">
                    {r._count.befunde} Befund(e)
                    {r.teilnehmende ? ` · ${r.teilnehmende}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={begehungFortsetzen.bind(null, r.id)}>
                    <button className="rounded bg-emerald-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-emerald-800">
                      fortsetzen
                    </button>
                  </form>
                  <form action={begehungAbbrechen.bind(null, r.id)}>
                    <ConfirmButton
                      message="Begehung wirklich ABBRECHEN? Alle erfassten Daten dieser Begehung werden gelöscht."
                      className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      abbrechen
                    </ConfirmButton>
                  </form>
                </div>
              </li>
              )
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

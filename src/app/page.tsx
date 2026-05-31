import Link from "next/link";
import { prisma } from "@/lib/db";
import { TEILNEHMER } from "@/lib/constants";
import { getAktiveRundeId } from "@/lib/runde";
import { begehungStarten, begehungFortsetzen } from "./begehung/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [anlagen, runden, aktiveRundeId] = await Promise.all([
    prisma.anlage.findMany({ orderBy: { kuerzel: "asc" } }),
    prisma.begehungsrunde.findMany({
      orderBy: { erstelltAm: "desc" },
      include: { anlage: true, _count: { select: { befunde: true } } },
    }),
    getAktiveRundeId(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/maengel"
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
        >
          📋 Mängel-Nachverfolgung
        </Link>
        <a
          href="/api/export/csv"
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100"
        >
          ⬇ CSV-Export
        </a>
      </div>

      {aktiveRundeId && (
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

      {/* Begehung starten */}
      <form
        action={begehungStarten}
        className="space-y-4 rounded-lg border border-stone-200 bg-white p-4"
      >
        <h1 className="text-lg font-semibold">Begehung starten</h1>

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
            {TEILNEHMER.map((name) => (
              <label key={name} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="teilnehmer" value={name} />
                {name}
              </label>
            ))}
          </div>
        </div>

        <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          Begehung starten →
        </button>
      </form>

      {/* Begehungen */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-stone-600">Begehungen</h2>
        {runden.length === 0 ? (
          <p className="text-sm text-stone-400">Noch keine Begehung.</p>
        ) : (
          <ul className="space-y-2">
            {runden.map((r) => (
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
                {r.status === "abgeschlossen" ? (
                  <Link
                    href={`/begehung/berichte/${r.id}`}
                    className="shrink-0 rounded border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-50"
                  >
                    Berichte
                  </Link>
                ) : (
                  <form action={begehungFortsetzen.bind(null, r.id)}>
                    <button className="shrink-0 rounded bg-emerald-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-emerald-800">
                      fortsetzen
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

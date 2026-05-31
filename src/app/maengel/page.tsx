import Link from "next/link";
import { prisma } from "@/lib/db";
import { STUFE_LABEL } from "@/lib/constants";
import { toggleBehoben } from "./actions";

export const dynamic = "force-dynamic";

export default async function MaengelSeite({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // Default: nur offene; "alle" zeigt auch behobene.
  const nurOffen = status !== "alle";

  const maengel = await prisma.mangel.findMany({
    where: nurOffen ? { status: "offen" } : {},
    include: {
      katalog: true,
      befund: { include: { parzelle: { include: { anlage: true } } } },
    },
  });

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  // Sortierung: überfällig zuerst, dann nach Frist, dann ohne Frist.
  const angereichert = maengel
    .map((m) => ({
      m,
      ueberfaellig:
        m.status === "offen" && m.frist !== null && new Date(m.frist) < heute,
    }))
    .sort((a, b) => {
      if (a.ueberfaellig !== b.ueberfaellig) return a.ueberfaellig ? -1 : 1;
      const af = a.m.frist ? new Date(a.m.frist).getTime() : Infinity;
      const bf = b.m.frist ? new Date(b.m.frist).getTime() : Infinity;
      return af - bf;
    });

  const offenCount = maengel.filter((m) => m.status === "offen").length;
  const ueberfaelligCount = angereichert.filter((x) => x.ueberfaellig).length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mängel-Nachverfolgung</h1>
          <p className="text-sm text-stone-500">
            {offenCount} offen · {ueberfaelligCount} überfällig
          </p>
        </div>
        <Link href="/" className="text-sm text-emerald-700 hover:underline">
          Liste
        </Link>
      </div>

      <div className="flex gap-2 text-sm">
        <Link
          href="/maengel"
          className={`rounded-full px-3 py-1 ${
            nurOffen ? "bg-emerald-700 text-white" : "border border-stone-300"
          }`}
        >
          Nur offene
        </Link>
        <Link
          href="/maengel?status=alle"
          className={`rounded-full px-3 py-1 ${
            !nurOffen ? "bg-emerald-700 text-white" : "border border-stone-300"
          }`}
        >
          Alle
        </Link>
      </div>

      {angereichert.length === 0 ? (
        <p className="text-sm text-stone-400">Keine Mängel.</p>
      ) : (
        <ul className="space-y-2">
          {angereichert.map(({ m, ueberfaellig }) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/parzelle/${m.befund.parzelle.parzelleId}`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {m.befund.parzelle.parzelleId}
                  </Link>
                  <span className="text-[10px] uppercase tracking-wide text-stone-400">
                    {m.bereich}
                  </span>
                  {m.befund.stufe !== "neutral" && (
                    <span className="rounded bg-stone-100 px-1.5 text-xs text-stone-600">
                      {STUFE_LABEL[m.befund.stufe] ?? m.befund.stufe}
                    </span>
                  )}
                  {m.status === "behoben" && (
                    <span className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-700">
                      behoben
                    </span>
                  )}
                </div>
                <p className="truncate text-sm">{m.punkt || "(ohne Bezeichnung)"}</p>
                {m.notiz && <p className="truncate text-xs text-stone-500">{m.notiz}</p>}
                {m.frist && (
                  <p
                    className={`text-xs ${
                      ueberfaellig ? "font-medium text-red-600" : "text-stone-400"
                    }`}
                  >
                    Frist: {new Date(m.frist).toLocaleDateString("de-DE")}
                    {ueberfaellig ? " — überfällig" : ""}
                  </p>
                )}
              </div>
              <form action={toggleBehoben.bind(null, m.id)} className="shrink-0">
                <button
                  className={`rounded px-2.5 py-1 text-sm font-medium ${
                    m.status === "behoben"
                      ? "border border-stone-300 text-stone-600 hover:bg-stone-50"
                      : "bg-emerald-700 text-white hover:bg-emerald-800"
                  }`}
                >
                  {m.status === "behoben" ? "↩ offen" : "✓ behoben"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/db";
import { toggleBehoben } from "./actions";
import { Thumb } from "@/components/Thumb";

export const dynamic = "force-dynamic";

export default async function MaengelSeite({
  searchParams,
}: {
  searchParams: Promise<{ parzelle?: string; status?: string }>;
}) {
  const { parzelle: parzelleId, status } = await searchParams;
  const nurOffen = status !== "alle";
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const istUeberfaellig = (m: { status: string; frist: Date | null }) =>
    m.status === "offen" && m.frist !== null && new Date(m.frist) < heute;

  // --- Detailansicht einer Parzelle ---
  if (parzelleId) {
    const parzelle = await prisma.parzelle.findUnique({
      where: { parzelleId },
      include: { anlage: true },
    });
    const maengel = parzelle
      ? await prisma.mangel.findMany({
          where: {
            befund: { parzelleId: parzelle.id },
            ...(nurOffen ? { status: "offen" } : {}),
          },
          include: {
            befund: { include: { runde: { select: { id: true, datum: true } } } },
            fotos: { orderBy: { id: "asc" } },
          },
          orderBy: { id: "desc" },
        })
      : [];

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">
              Mängel · Parzelle {parzelleId}
            </h1>
            {parzelle && (
              <p className="text-base text-stone-500">
                {parzelle.anlage.name} · {parzelle.nachname} {parzelle.vorname}
              </p>
            )}
          </div>
          <Link href="/maengel" className="shrink-0 text-base text-emerald-700 hover:underline">
            ← Parzellen
          </Link>
        </div>

        <div className="flex gap-2 text-sm">
          <Link href={`/maengel?parzelle=${parzelleId}`} className={`rounded-full px-3 py-1 ${nurOffen ? "bg-emerald-700 text-white" : "border border-stone-300"}`}>Nur offene</Link>
          <Link href={`/maengel?parzelle=${parzelleId}&status=alle`} className={`rounded-full px-3 py-1 ${!nurOffen ? "bg-emerald-700 text-white" : "border border-stone-300"}`}>Alle</Link>
        </div>

        {maengel.length === 0 ? (
          <p className="text-base text-stone-400">Keine Mängel.</p>
        ) : (
          <ul className="space-y-2">
            {maengel.map((m) => {
              const ueb = istUeberfaellig(m);
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs uppercase tracking-wide text-stone-400">{m.bereich}</span>
                    <p className="text-base font-medium">{m.punkt || "(ohne Bezeichnung)"}</p>
                    {m.notiz && (
                      <p className="whitespace-pre-line text-base text-stone-700">{m.notiz}</p>
                    )}
                    {m.diktatNachgereicht.trim() !== "" && (
                      <p className="whitespace-pre-line text-sm text-amber-800">
                        🎤 {m.diktatNachgereicht}
                      </p>
                    )}
                    <p className="text-sm text-stone-400">
                      <Link
                        href={`/begehung/ansicht/${m.befund.runde.id}/${parzelleId}`}
                        className="text-emerald-700 hover:underline"
                      >
                        Begehung {new Date(m.befund.runde.datum).toLocaleDateString("de-DE")}
                      </Link>
                      {m.frist ? ` · Frist ${new Date(m.frist).toLocaleDateString("de-DE")}` : ""}
                      {ueb ? " · überfällig" : ""}
                      {m.status === "behoben" && m.behobenAm ? ` · behoben ${new Date(m.behobenAm).toLocaleDateString("de-DE")}` : ""}
                    </p>
                    {m.fotos.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {m.fotos.map((f) => (
                          <Thumb key={f.id} src={`/api/datei/${f.dateipfad}`} />
                        ))}
                      </div>
                    )}
                  </div>
                  <form action={toggleBehoben.bind(null, m.id)} className="shrink-0">
                    <button className={`rounded px-3 py-1.5 text-sm font-medium ${m.status === "behoben" ? "border border-stone-300 text-stone-600 hover:bg-stone-50" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}>
                      {m.status === "behoben" ? "↩ offen" : "✓ behoben"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // --- Auswahlliste: Parzellen mit Mängeln ---
  const offeneMaengel = await prisma.mangel.findMany({
    where: { status: "offen" },
    select: { frist: true, status: true, befund: { select: { parzelle: { select: { parzelleId: true, nachname: true, vorname: true, anlage: { select: { name: true } } } } } } },
  });
  type Eintrag = { parzelleId: string; name: string; anlage: string; offen: number; ueberfaellig: number };
  const proParzelle = new Map<string, Eintrag>();
  for (const m of offeneMaengel) {
    const pid = m.befund.parzelle.parzelleId;
    let e = proParzelle.get(pid);
    if (!e) {
      e = {
        parzelleId: pid,
        name: `${m.befund.parzelle.nachname} ${m.befund.parzelle.vorname}`.trim(),
        anlage: m.befund.parzelle.anlage.name,
        offen: 0,
        ueberfaellig: 0,
      };
      proParzelle.set(pid, e);
    }
    e.offen++;
    if (istUeberfaellig(m)) e.ueberfaellig++;
  }
  const liste = [...proParzelle.values()].sort(
    (a, b) => b.ueberfaellig - a.ueberfaellig || a.parzelleId.localeCompare(b.parzelleId)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Mängel-Nachverfolgung</h1>
          <p className="text-base text-stone-500">
            {liste.length} Parzellen mit offenen Mängeln · Parzelle wählen:
          </p>
        </div>
        <Link href="/" className="shrink-0 text-base text-emerald-700 hover:underline">Start</Link>
      </div>

      {liste.length === 0 ? (
        <p className="text-base text-stone-400">Keine offenen Mängel.</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((e) => (
            <li key={e.parzelleId}>
              <Link
                href={`/maengel?parzelle=${e.parzelleId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:border-emerald-400"
              >
                <div className="min-w-0">
                  <span className="text-lg font-medium">{e.parzelleId}</span>
                  <span className="ml-2 text-sm text-stone-500">{e.anlage} · {e.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  {e.ueberfaellig > 0 && (
                    <span className="rounded bg-red-50 px-2 py-0.5 font-medium text-red-600">{e.ueberfaellig} überfällig</span>
                  )}
                  <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{e.offen} offen</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { Mic } from "lucide-react";
import { prisma } from "@/lib/db";
import { toggleBehoben } from "./actions";
import { Thumb } from "@/components/Thumb";
import { FotoWaehlenKnopf } from "@/components/FotoWaehlenKnopf";
import { AutoSaveForm } from "@/components/AutoSaveForm";
import {
  aktualisiereBeet,
  beetAnlegen,
  fotosNachtraeglich,
} from "@/app/begehung/ansicht/[rundeId]/[parzelleId]/actions";

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
    // Gemüsebeet-Stand der NEUESTEN Begehung: IST vs. SOLL (1/6) + Beet-Fotos.
    // Direkt hier korrigierbar (andere Größe erfassen, Beet anlegen, Fotos
    // hochladen) — z. B. um die Behebung von "zu wenig Anbaufläche" zu belegen.
    const beetBefund = parzelle
      ? await prisma.befund.findFirst({
          where: { parzelleId: parzelle.id },
          include: {
            runde: { select: { id: true, datum: true } },
            beete: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
          },
          orderBy: { runde: { datum: "desc" } },
        })
      : null;
    const beetIst = beetBefund?.beete.reduce((s, b) => s + b.flaecheM2, 0) ?? 0;
    const beetSoll = parzelle?.groesseM2 ? parzelle.groesseM2 / 6 : null;
    const beetRatio = beetBefund && beetSoll ? beetIst / beetSoll : null;
    const komp = beetBefund?.kompensationAusreichend ?? false;
    const beetFarbe =
      beetRatio === null
        ? "text-stone-500"
        : komp || beetRatio > 0.8
          ? "text-emerald-700"
          : beetRatio >= 0.6
            ? "text-amber-800"
            : "text-red-700";
    const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
    const pfadHier = "/maengel";

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

        {/* Gemüsebeete: Stand der neuesten Begehung, hier direkt korrigierbar
            (neue Größe erfassen, Beet anlegen, Belegfotos hochladen) */}
        {beetBefund && (
          <section className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-medium text-stone-600">
                Gemüsebeete{" "}
                <span className="text-sm font-normal text-stone-500">
                  (Stand{" "}
                  <Link
                    href={`/begehung/ansicht/${beetBefund.runde.id}/${parzelleId}`}
                    className="text-emerald-700 hover:underline"
                  >
                    Begehung {new Date(beetBefund.runde.datum).toLocaleDateString("de-DE")}
                  </Link>
                  )
                </span>
              </h2>
              <span className={`text-base font-semibold ${beetFarbe}`}>
                {beetIst === 0 && !komp ? (
                  <span className="font-normal text-stone-600">nicht erfasst</span>
                ) : (
                  <>IST {m2(beetIst)} m²{komp ? " · kompensiert" : ""}</>
                )}
                {beetSoll !== null ? ` / SOLL ${m2(beetSoll)} m²` : ""}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {beetBefund.beete.map((b) => (
                <div key={b.id} className="rounded border border-stone-100 p-2">
                  <AutoSaveForm
                    action={aktualisiereBeet.bind(null, b.id, pfadHier)}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <input
                      type="text"
                      name="bezeichnung"
                      defaultValue={b.bezeichnung}
                      placeholder="Bezeichnung"
                      className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      name="flaeche"
                      defaultValue={b.flaecheM2 ? String(b.flaecheM2).replace(".", ",") : ""}
                      placeholder="m²"
                      className="w-20 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </AutoSaveForm>
                  {b.fotos.length > 0 && (
                    <div className="mt-1 grid grid-cols-3 gap-1">
                      {b.fotos.map((f) => (
                        <Thumb key={f.id} src={`/api/datei/${f.dateipfad}`} />
                      ))}
                    </div>
                  )}
                  <form
                    action={fotosNachtraeglich.bind(
                      null,
                      beetBefund.id,
                      { beetId: b.id, kontext: "beet" },
                      pfadHier
                    )}
                    className="mt-1"
                  >
                    <FotoWaehlenKnopf />
                  </form>
                </div>
              ))}
            </div>
            <form
              action={beetAnlegen.bind(null, beetBefund.id, pfadHier)}
              className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-2"
            >
              <input
                type="text"
                name="bezeichnung"
                placeholder="Neues Beet"
                className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                inputMode="decimal"
                name="flaeche"
                placeholder="m²"
                className="w-20 rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
              <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                + Beet
              </button>
            </form>
          </section>
        )}

        {maengel.length === 0 ? (
          <p className="text-base text-stone-600">Keine Mängel.</p>
        ) : (
          <ul className="space-y-2">
            {maengel.map((m) => {
              const ueb = istUeberfaellig(m);
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs uppercase tracking-wide text-stone-600">{m.bereich}</span>
                    <p className="text-base font-medium">{m.punkt || "(ohne Bezeichnung)"}</p>
                    {m.notiz && (
                      <p className="whitespace-pre-line text-base text-stone-700">{m.notiz}</p>
                    )}
                    {m.diktatNachgereicht.trim() !== "" && (
                      <p className="whitespace-pre-line text-sm text-amber-800">
                        <Mic className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-label="Diktat" />
                        {m.diktatNachgereicht}
                      </p>
                    )}
                    <p className="text-sm text-stone-500">
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
                    <button
                      className={
                        m.status === "behoben"
                          ? "rounded border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
                          : "rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                      }
                    >
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
        <p className="text-base text-stone-600">Keine offenen Mängel.</p>
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

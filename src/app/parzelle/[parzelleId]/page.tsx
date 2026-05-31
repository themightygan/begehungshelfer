import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAktiveRundeId } from "@/lib/runde";
import { FotoUpload } from "./FotoUpload";
import { BefundForm } from "./BefundForm";
import {
  ensureBefund,
  speichereBefund,
  speichernUndWeiter,
  uploadUebersichtFotos,
  addMangel,
  addFreierMangel,
  updateMangel,
  removeMangel,
  uploadMangelFotos,
  loescheFoto,
  addBeet,
  updateBeet,
  removeBeet,
  uploadDokument,
  removeDokument,
} from "./actions";
import { DOKUMENT_TYP } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Gemeinsame, großzügig dimensionierte UI-Klassen (gut treffbar auf iPad/iPhone).
const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const INP = "rounded border border-stone-300 px-3 py-2 text-base";
const BTN =
  "rounded bg-emerald-700 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-800";
const BTN_SEC =
  "rounded border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-50";

type FotoZeile = { id: number; dateipfad: string; kontext?: string };

// Fotokacheln mit (immer sichtbarer, touch-tauglicher) Lösch-Möglichkeit.
function FotoGitter({ fotos, parzelleId }: { fotos: FotoZeile[]; parzelleId: string }) {
  if (fotos.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {fotos.map((f) => (
        <div key={f.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/datei/${f.dateipfad}`}
            alt="Foto"
            className="aspect-square w-full rounded object-cover"
          />
          <form action={loescheFoto.bind(null, parzelleId, f.id)}>
            <button
              className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-sm text-white"
              title="Foto löschen"
            >
              ✕
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}

// Read-only Fotokacheln (Vorjahr).
function FotoGitterRO({ fotos }: { fotos: FotoZeile[] }) {
  if (fotos.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {fotos.map((f) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={f.id}
          src={`/api/datei/${f.dateipfad}`}
          alt="Foto (Vorjahr)"
          className="aspect-square w-full rounded object-cover opacity-90"
        />
      ))}
    </div>
  );
}

export default async function ParzelleSeite({
  params,
}: {
  params: Promise<{ parzelleId: string }>;
}) {
  const { parzelleId } = await params;

  // Erfassung nur innerhalb einer aktiven Begehung.
  const rundeId = await getAktiveRundeId();
  if (!rundeId) redirect("/");

  const parzelle = await prisma.parzelle.findUnique({
    where: { parzelleId },
    include: { anlage: true },
  });
  if (!parzelle) notFound();

  const befundId = await ensureBefund(parzelleId);
  const befund = await prisma.befund.findUniqueOrThrow({
    where: { id: befundId },
    include: {
      maengel: {
        orderBy: { id: "asc" },
        include: { katalog: true, fotos: { orderBy: { id: "asc" } } },
      },
      beete: { orderBy: { id: "asc" } },
    },
  });

  // Gemüse: IST = Summe der Beete; SOLL = 1/6 der Parzellenfläche (UPV §12).
  // Ampel: rot < 70 % vom Soll, gelb 70–90 %, grün ≥ 90 %.
  const beetIst = befund.beete.reduce((s, b) => s + b.flaecheM2, 0);
  const beetSoll = parzelle.groesseM2 ? parzelle.groesseM2 / 6 : null;
  const beetRatio = beetSoll ? beetIst / beetSoll : null;
  const beetFarbe =
    beetRatio === null
      ? "text-stone-500"
      : beetRatio >= 0.9
        ? "text-emerald-700"
        : beetRatio >= 0.7
          ? "text-amber-600"
          : "text-red-600";
  const beetStatus =
    beetRatio === null
      ? ""
      : beetRatio >= 0.9
        ? "erfüllt"
        : beetRatio >= 0.7
          ? "knapp"
          : "zu wenig";

  const uebersichtFotos = await prisma.foto.findMany({
    where: { befundId, mangelId: null },
    orderBy: { id: "asc" },
  });
  const dokumente = await prisma.dokument.findMany({
    where: { parzelleId: parzelle.id },
    orderBy: { datum: "desc" },
  });
  const katalog = await prisma.katalog.findMany({
    where: { aktiv: true },
    orderBy: { sortierung: "asc" },
  });

  // Letzte Begehung derselben Parzelle (andere Runde) für den Vergleich.
  const vorBefund = await prisma.befund.findFirst({
    where: { parzelleId: parzelle.id, rundeId: { not: rundeId } },
    orderBy: { runde: { datum: "desc" } },
    include: {
      runde: { select: { datum: true } },
      maengel: { include: { fotos: { orderBy: { id: "asc" } } } },
    },
  });
  type VorMangel = NonNullable<typeof vorBefund>["maengel"][number];
  const vorByKatalog = new Map<number, VorMangel>();
  const vorByPunkt = new Map<string, VorMangel>();
  for (const m of vorBefund?.maengel ?? []) {
    if (m.katalogId != null) vorByKatalog.set(m.katalogId, m);
    else if (m.punkt) vorByPunkt.set(m.punkt, m);
  }
  const vorFuer = (m: { katalogId: number | null; punkt: string }) =>
    m.katalogId != null ? vorByKatalog.get(m.katalogId) : vorByPunkt.get(m.punkt);
  const vorDatum = vorBefund?.runde?.datum
    ? new Date(vorBefund.runde.datum).toLocaleDateString("de-DE")
    : null;

  const gewaehlt = new Set(befund.maengel.map((m) => m.katalogId).filter(Boolean));

  const bereiche: { name: string; punkte: typeof katalog }[] = [];
  for (const k of katalog) {
    let g = bereiche.find((b) => b.name === k.bereich);
    if (!g) bereiche.push((g = { name: k.bereich, punkte: [] }));
    g.punkte.push(k);
  }

  // Vor/Zurück innerhalb der Anlage (stabile Sortierung).
  const alle = await prisma.parzelle.findMany({
    where: { anlageId: parzelle.anlageId },
    orderBy: [{ nummer: "asc" }, { index: "asc" }],
    select: { parzelleId: true },
  });
  const idx = alle.findIndex((p) => p.parzelleId === parzelleId);
  const prev = idx > 0 ? alle[idx - 1].parzelleId : null;
  const next = idx < alle.length - 1 ? alle[idx + 1].parzelleId : null;

  const fristWert = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 10) : "";
  const fristAnzeige = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("de-DE") : "—";

  return (
    <div className="space-y-5 pb-16">
      {/* Kopf */}
      <div>
        <h1 className="text-2xl font-semibold">Parzelle {parzelle.parzelleId}</h1>
        <p className="text-base text-stone-500">
          {parzelle.anlage.name} · {parzelle.nachname} {parzelle.vorname}
          {parzelle.groesseM2 ? ` · ${parzelle.groesseM2} m²` : ""}
        </p>
      </div>

      {/* Navigation: vorige | zurück zum Plan | nächste */}
      <div className="flex items-center justify-between gap-2">
        {prev ? (
          <Link href={`/parzelle/${prev}`} className={BTN_SEC}>
            ← {prev}
          </Link>
        ) : (
          <span className="px-4 py-2.5 text-stone-300">←</span>
        )}
        <Link
          href="/begehung"
          className="rounded bg-stone-200 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-300"
        >
          ↑ zurück zum Plan
        </Link>
        {next ? (
          <Link href={`/parzelle/${next}`} className={BTN_SEC}>
            {next} →
          </Link>
        ) : (
          <span className="px-4 py-2.5 text-stone-300">→</span>
        )}
      </div>

      {/* Obere Reihe: Gesamtansicht | Gemüsebeete */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Gesamtansicht-Fotos */}
        <section className={CARD}>
          <h2 className="text-base font-medium text-stone-600">Gesamtansicht</h2>
          <p className="text-sm text-stone-400">
            Garten-Übersicht ohne konkreten Mangel — steht im PDF vorne zur Orientierung.
          </p>
          <FotoUpload
            action={uploadUebersichtFotos.bind(null, parzelleId)}
            label="📷 Übersichtsfoto hinzufügen"
          />
          <FotoGitter fotos={uebersichtFotos} parzelleId={parzelleId} />
        </section>

        {/* Gemüsebeete: IST vs. SOLL 1/6 mit Ampel */}
        <section className={CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-medium text-stone-600">Gemüsebeete</h2>
            <span className={`text-base font-semibold ${beetFarbe}`}>
              IST {beetIst.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²
              {beetSoll !== null && (
                <>
                  {" / SOLL "}
                  {beetSoll.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²
                  {beetStatus && ` · ${beetStatus}`}
                </>
              )}
            </span>
          </div>
          <p className="text-sm text-stone-400">
            {beetSoll !== null
              ? `SOLL = 1/6 der Parzellenfläche (${parzelle.groesseM2} m²). Ampel: rot < 70 %, gelb 70–90 %, grün ≥ 90 %.`
              : "Keine Parzellenfläche hinterlegt — SOLL nicht berechenbar."}{" "}
            Max. 5 Beete.
          </p>

          <div className="mt-3 space-y-2">
            {befund.beete.map((b) => (
              <form
                key={b.id}
                action={updateBeet.bind(null, parzelleId, b.id)}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="text"
                  name="bezeichnung"
                  defaultValue={b.bezeichnung}
                  placeholder="Bezeichnung (z. B. Beet 1)"
                  className={`min-w-0 flex-1 ${INP}`}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  name="flaeche"
                  defaultValue={b.flaecheM2 ? String(b.flaecheM2).replace(".", ",") : ""}
                  placeholder="m²"
                  className={`w-24 ${INP}`}
                />
                <button className="rounded bg-stone-700 px-3.5 py-2.5 text-base text-white hover:bg-stone-800">
                  ✓
                </button>
                <button
                  formAction={removeBeet.bind(null, parzelleId, b.id)}
                  className="rounded px-3 py-2.5 text-base text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </form>
            ))}
          </div>

          {befund.beete.length < 5 && (
            <form
              action={addBeet.bind(null, parzelleId)}
              className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3"
            >
              <input
                type="text"
                name="bezeichnung"
                placeholder="Neues Beet"
                className={`min-w-0 flex-1 ${INP}`}
              />
              <input
                type="text"
                inputMode="decimal"
                name="flaeche"
                placeholder="m²"
                className={`w-24 ${INP}`}
              />
              <button className={BTN}>+ Beet</button>
            </form>
          )}
        </section>
      </div>

      {/* Mängel-Menü — volle Breite */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Mangel hinzufügen</h2>
        <p className="text-sm text-stone-400">
          Antippen wählt den Punkt aus.
          {vorDatum && (
            <>
              {" "}
              Punkte mit <span className="text-amber-700">⚠</span> waren bei der
              letzten Begehung ({vorDatum}) beanstandet.
            </>
          )}
        </p>
        <form className="mt-3 space-y-3">
          {bereiche.map((b) => (
            <div key={b.name}>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">
                {b.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {b.punkte.map((k) => {
                  if (gewaehlt.has(k.id))
                    return (
                      <span
                        key={k.id}
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm text-emerald-800"
                      >
                        ✓ {k.punkt}
                      </span>
                    );
                  const war = vorByKatalog.has(k.id);
                  return (
                    <button
                      key={k.id}
                      formAction={addMangel.bind(null, parzelleId, k.id)}
                      title={k.hinweis || undefined}
                      className={
                        war
                          ? "rounded-full border border-amber-400 bg-amber-50 px-3.5 py-2 text-sm text-amber-800 hover:bg-amber-100"
                          : "rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm hover:border-emerald-400 hover:bg-emerald-50"
                      }
                    >
                      {war ? "⚠ " : ""}
                      {k.punkt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            formAction={addFreierMangel.bind(null, parzelleId)}
            className="rounded-full border border-dashed border-stone-400 px-3.5 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            + Sonstiger Punkt (Freitext)
          </button>
        </form>
      </section>

      {/* Erfasste Mängel — volle Breite, je Mangel links aktuell / rechts zuletzt */}
      {befund.maengel.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-600">
            Festgestellte Mängel ({befund.maengel.length})
          </h2>
          {befund.maengel.map((m) => {
            const freitext = m.katalogId === null;
            const vor = vorFuer(m);
            return (
              <div key={m.id} className={CARD}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-stone-400">
                      {m.bereich}
                    </span>
                    <h3 className="text-lg font-medium">
                      {m.punkt || (freitext ? "(Freitext-Mangel)" : "")}
                      {m.fotos.length === 0 && (
                        <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                          ⚠ Foto fehlt
                        </span>
                      )}
                    </h3>
                    {m.katalog?.referenz && (
                      <p className="text-sm text-stone-400">{m.katalog.referenz}</p>
                    )}
                    {m.katalog?.hinweis && (
                      <p className="text-sm text-stone-400">{m.katalog.hinweis}</p>
                    )}
                  </div>
                  <form action={removeMangel.bind(null, parzelleId, m.id)}>
                    <button
                      className="shrink-0 rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      title="Mangel entfernen"
                    >
                      entfernen
                    </button>
                  </form>
                </div>

                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {/* Aktuell */}
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
                      Aktuell
                    </p>
                    <form
                      action={updateMangel.bind(null, parzelleId, m.id)}
                      className="space-y-2"
                    >
                      {freitext && (
                        <input
                          type="text"
                          name="punkt"
                          defaultValue={m.punkt}
                          placeholder="Bezeichnung des Mangels"
                          className={`block w-full ${INP}`}
                        />
                      )}
                      <textarea
                        name="notiz"
                        defaultValue={m.notiz}
                        rows={2}
                        placeholder="Maßnahme / Beschreibung (z. B. Wildlinge mit Wurzel entfernen)"
                        className={`block w-full ${INP}`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-base text-stone-600">
                          Frist
                          <input
                            type="date"
                            name="frist"
                            defaultValue={fristWert(m.frist)}
                            className={`ml-2 ${INP}`}
                          />
                        </label>
                        <button className={BTN_SEC}>Text/Frist speichern</button>
                      </div>
                    </form>
                    <FotoUpload
                      action={uploadMangelFotos.bind(null, parzelleId, m.id)}
                      label="📷 Foto zum Mangel"
                    />
                    <FotoGitter fotos={m.fotos} parzelleId={parzelleId} />
                  </div>

                  {/* Zuletzt (Vorjahr) */}
                  {vor && (
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
                        Zuletzt{vorDatum ? ` (${vorDatum})` : ""}
                      </p>
                      <p className="whitespace-pre-line text-base text-stone-700">
                        {vor.notiz || "—"}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        Frist damals: {fristAnzeige(vor.frist)}
                        {vor.status === "behoben" ? " · war behoben" : ""}
                      </p>
                      <FotoGitterRO fotos={vor.fotos} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Befund (Stufe + Bemerkung + Plakette) + Speichern & weiter */}
      <BefundForm
        action={speichereBefund.bind(null, parzelleId)}
        weiterAction={speichernUndWeiter.bind(null, parzelleId)}
        stufe={befund.stufe}
        notiz={befund.notiz}
        gutGemacht={befund.gutGemacht}
        plakettenNotiz={befund.plakettenNotiz}
      />

      {/* Akte: Dokument-Anhänge — volle Breite, am Ende */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Akte / Dokumente</h2>
        {dokumente.length > 0 && (
          <ul className="mt-2 space-y-1">
            {dokumente.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-base">
                <a
                  href={`/api/datei/${d.dateipfad}`}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 truncate text-emerald-700 hover:underline"
                >
                  {DOKUMENT_TYP.find((t) => t.wert === d.typ)?.label ?? d.typ}
                  {d.notiz ? ` — ${d.notiz}` : ""} (
                  {new Date(d.datum).toLocaleDateString("de-DE")})
                </a>
                <form action={removeDokument.bind(null, parzelleId, d.id)}>
                  <button className="shrink-0 rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                    löschen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form
          action={uploadDokument.bind(null, parzelleId)}
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3"
        >
          <select name="typ" defaultValue="schreiben" className={INP}>
            {DOKUMENT_TYP.map((t) => (
              <option key={t.wert} value={t.wert}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="notiz"
            placeholder="Notiz (optional)"
            className={`min-w-0 flex-1 ${INP}`}
          />
          <input type="file" name="datei" className="text-base" />
          <button className={BTN}>Hochladen</button>
        </form>
      </section>
    </div>
  );
}

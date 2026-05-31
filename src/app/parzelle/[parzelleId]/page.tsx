import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { FotoUpload } from "./FotoUpload";
import { BefundForm } from "./BefundForm";
import {
  ensureBefund,
  speichereBefund,
  uploadUebersichtFotos,
  addMangel,
  addFreierMangel,
  updateMangel,
  removeMangel,
  uploadMangelFotos,
  loescheFoto,
} from "./actions";

export const dynamic = "force-dynamic";

type FotoZeile = { id: number; dateipfad: string; kontext: string };

// Fotokacheln mit Lösch-Möglichkeit.
function FotoGitter({
  fotos,
  parzelleId,
}: {
  fotos: FotoZeile[];
  parzelleId: string;
}) {
  if (fotos.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {fotos.map((f) => (
        <div key={f.id} className="group relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/datei/${f.dateipfad}`}
            alt="Foto"
            className="aspect-square w-full rounded object-cover"
          />
          <form action={loescheFoto.bind(null, parzelleId, f.id)}>
            <button
              className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white opacity-0 group-hover:opacity-100"
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

export default async function ParzelleSeite({
  params,
}: {
  params: Promise<{ parzelleId: string }>;
}) {
  const { parzelleId } = await params;

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
    },
  });
  const uebersichtFotos = await prisma.foto.findMany({
    where: { befundId, mangelId: null },
    orderBy: { id: "asc" },
  });
  const katalog = await prisma.katalog.findMany({
    where: { aktiv: true },
    orderBy: { sortierung: "asc" },
  });

  // Bereits gewählte Katalogpunkte (für ✓-Markierung im Menü).
  const gewaehlt = new Set(befund.maengel.map((m) => m.katalogId).filter(Boolean));

  // Katalog nach Bereich gruppieren (Reihenfolge wie im Formular).
  const bereiche: { name: string; punkte: typeof katalog }[] = [];
  for (const k of katalog) {
    let g = bereiche.find((b) => b.name === k.bereich);
    if (!g) bereiche.push((g = { name: k.bereich, punkte: [] }));
    g.punkte.push(k);
  }

  // Vor/Zurück über alle Parzellen (anlagenübergreifend, stabile Sortierung).
  const alle = await prisma.parzelle.findMany({
    orderBy: [{ anlageId: "asc" }, { nummer: "asc" }, { index: "asc" }],
    select: { parzelleId: true },
  });
  const idx = alle.findIndex((p) => p.parzelleId === parzelleId);
  const prev = idx > 0 ? alle[idx - 1].parzelleId : null;
  const next = idx < alle.length - 1 ? alle[idx + 1].parzelleId : null;

  const fristWert = (d: Date | null) =>
    d ? new Date(d).toISOString().slice(0, 10) : "";

  return (
    <div className="space-y-6 pb-12">
      {/* Kopf + Navigation */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Parzelle {parzelle.parzelleId}</h1>
          <p className="text-sm text-stone-500">
            {parzelle.anlage.name} · {parzelle.nachname} {parzelle.vorname}
            {parzelle.groesseM2 ? ` · ${parzelle.groesseM2} m²` : ""}
          </p>
        </div>
        <Link href="/" className="shrink-0 text-sm text-emerald-700 hover:underline">
          Liste
        </Link>
      </div>
      <div className="flex items-center justify-between text-sm">
        {prev ? (
          <Link href={`/parzelle/${prev}`} className="text-emerald-700 hover:underline">
            ← {prev}
          </Link>
        ) : (
          <span className="text-stone-300">←</span>
        )}
        <span className="text-stone-400">
          {idx + 1} / {alle.length}
        </span>
        {next ? (
          <Link href={`/parzelle/${next}`} className="text-emerald-700 hover:underline">
            {next} →
          </Link>
        ) : (
          <span className="text-stone-300">→</span>
        )}
      </div>

      {/* Befund: Stufe + allgemeine Bemerkung */}
      <BefundForm
        action={speichereBefund.bind(null, parzelleId)}
        stufe={befund.stufe}
        notiz={befund.notiz}
      />

      {/* Gesamtansicht-Fotos (Orientierung) */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-medium text-stone-600">Gesamtansicht</h2>
        <p className="text-xs text-stone-400">
          Garten-Übersicht ohne konkreten Mangel — steht im PDF vorne zur Orientierung.
        </p>
        <FotoUpload
          action={uploadUebersichtFotos.bind(null, parzelleId)}
          label="📷 Übersichtsfoto hinzufügen"
        />
        <FotoGitter fotos={uebersichtFotos} parzelleId={parzelleId} />
      </section>

      {/* Mängel-Menü */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-medium text-stone-600">Mangel hinzufügen</h2>
        <p className="text-xs text-stone-400">Antippen wählt den Punkt aus.</p>
        <form className="mt-2 space-y-3">
          {bereiche.map((b) => (
            <div key={b.name}>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">
                {b.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {b.punkte.map((k) =>
                  gewaehlt.has(k.id) ? (
                    <span
                      key={k.id}
                      className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800"
                    >
                      ✓ {k.punkt}
                    </span>
                  ) : (
                    <button
                      key={k.id}
                      formAction={addMangel.bind(null, parzelleId, k.id)}
                      title={k.hinweis || undefined}
                      className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs hover:border-emerald-400 hover:bg-emerald-50"
                    >
                      {k.punkt}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
          <button
            formAction={addFreierMangel.bind(null, parzelleId)}
            className="rounded-full border border-dashed border-stone-400 px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100"
          >
            + Sonstiger Punkt (Freitext)
          </button>
        </form>
      </section>

      {/* Erfasste Mängel */}
      {befund.maengel.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-stone-600">
            Festgestellte Mängel ({befund.maengel.length})
          </h2>
          {befund.maengel.map((m) => {
            const freitext = m.katalogId === null;
            return (
              <div
                key={m.id}
                className="rounded-lg border border-stone-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-stone-400">
                      {m.bereich}
                    </span>
                    <h3 className="font-medium">
                      {m.punkt || (freitext ? "(Freitext-Mangel)" : "")}
                    </h3>
                    {m.katalog?.referenz && (
                      <p className="text-xs text-stone-400">{m.katalog.referenz}</p>
                    )}
                    {m.katalog?.hinweis && (
                      <p className="text-xs text-stone-400">{m.katalog.hinweis}</p>
                    )}
                  </div>
                  <form action={removeMangel.bind(null, parzelleId, m.id)}>
                    <button
                      className="shrink-0 text-xs text-red-600 hover:underline"
                      title="Mangel entfernen"
                    >
                      entfernen
                    </button>
                  </form>
                </div>

                <form
                  action={updateMangel.bind(null, parzelleId, m.id)}
                  className="mt-3 space-y-2"
                >
                  {freitext && (
                    <input
                      type="text"
                      name="punkt"
                      defaultValue={m.punkt}
                      placeholder="Bezeichnung des Mangels"
                      className="block w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  )}
                  <textarea
                    name="notiz"
                    defaultValue={m.notiz}
                    rows={2}
                    placeholder="Maßnahme / Beschreibung (z. B. Wildlinge mit Wurzel entfernen)"
                    className="block w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-stone-600">
                      Frist
                      <input
                        type="date"
                        name="frist"
                        defaultValue={fristWert(m.frist)}
                        className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <button className="rounded bg-stone-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-stone-800">
                      Text/Frist speichern
                    </button>
                  </div>
                </form>

                <FotoUpload
                  action={uploadMangelFotos.bind(null, parzelleId, m.id)}
                  label="📷 Foto zum Mangel"
                />
                <FotoGitter fotos={m.fotos} parzelleId={parzelleId} />
              </div>
            );
          })}
        </section>
      )}

      <div>
        <a
          href={`/api/parzelle/${parzelle.parzelleId}/pdf`}
          target="_blank"
          rel="noopener"
          className="inline-block rounded border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          📄 Bericht-PDF erzeugen
        </a>
      </div>
    </div>
  );
}

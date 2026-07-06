import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  PARZELLE_STATUS,
  PARZELLE_ANREDE,
  ANREDE_STIL,
  STUFE_LABEL,
  STUFE_SYMBOL,
  AENDERUNG_LABEL,
  AENDERUNG_ART,
  DOKUMENT_TYP,
} from "@/lib/constants";
import {
  updateStammdaten,
  paechterwechsel,
  ereignisHinzufuegen,
  ereignisLoeschen,
  uploadDokument,
  removeDokument,
} from "../actions";
import { Thumb } from "@/components/Thumb";

export const dynamic = "force-dynamic";

const INP = "rounded border border-stone-300 px-3 py-2 text-base";
const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const dstr = (d: Date) => new Date(d).toLocaleDateString("de-DE");

export default async function ParzelleVerwaltung({
  params,
}: {
  params: Promise<{ parzelleId: string }>;
}) {
  const { parzelleId } = await params;
  const p = await prisma.parzelle.findUnique({
    where: { parzelleId },
    include: {
      anlage: true,
      aenderungen: { orderBy: { datum: "desc" } },
      dokumente: { orderBy: { datum: "desc" } },
      befunde: {
        orderBy: { runde: { datum: "desc" } },
        include: {
          runde: { select: { id: true, datum: true, bezeichnung: true } },
          beete: { select: { flaecheM2: true } },
          _count: { select: { maengel: true, fotos: true } },
        },
      },
    },
  });
  if (!p) notFound();
  const soll = p.groesseM2 ? p.groesseM2 / 6 : null;
  // Archiv-Fotos früherer Begehungen, gruppiert nach Datum (neueste zuerst).
  const archivFotos = await prisma.archivFoto.findMany({
    where: { parzelleId: p.id },
    orderBy: { datum: "desc" },
  });
  const archivGruppen: { datum: string; quelle: string; fotos: typeof archivFotos }[] = [];
  for (const f of archivFotos) {
    const datum = dstr(f.datum);
    let g = archivGruppen.find((x) => x.datum === datum);
    if (!g) archivGruppen.push((g = { datum, quelle: f.quelle, fotos: [] }));
    g.fotos.push(f);
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Parzelle {p.parzelleId}</h1>
          <p className="text-base text-stone-500">{p.anlage.name}</p>
        </div>
        <Link href="/parzellen" className="shrink-0 text-base text-emerald-700 hover:underline">
          ← Liste
        </Link>
      </div>

      {/* Stammdaten bearbeiten */}
      <form action={updateStammdaten.bind(null, parzelleId)} className={`${CARD} space-y-3`}>
        <h2 className="text-base font-medium text-stone-600">Stammdaten</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Nachname<input name="nachname" defaultValue={p.nachname} className={`mt-1 block w-full ${INP}`} /></label>
          <label className="text-sm">Vorname<input name="vorname" defaultValue={p.vorname} className={`mt-1 block w-full ${INP}`} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Anrede (Briefe)
              <select name="anrede" defaultValue={p.anrede} className={`mt-1 block w-full ${INP}`}>
                {PARZELLE_ANREDE.map((a) => <option key={a.wert} value={a.wert}>{a.label}</option>)}
              </select>
            </label>
            <label className="text-sm">Anrede-Stil
              <select name="anredeStil" defaultValue={p.anredeStil} className={`mt-1 block w-full ${INP}`}>
                {ANREDE_STIL.map((a) => <option key={a.wert} value={a.wert}>{a.label}</option>)}
              </select>
            </label>
          </div>
          <label className="text-sm">E-Mail<input name="email" defaultValue={p.email} className={`mt-1 block w-full ${INP}`} /></label>
          <label className="text-sm">Telefon<input name="telefon" defaultValue={p.telefon} className={`mt-1 block w-full ${INP}`} /></label>
          <label className="text-sm">Straße<input name="strasse" defaultValue={p.strasse} className={`mt-1 block w-full ${INP}`} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">PLZ<input name="plz" defaultValue={p.plz} className={`mt-1 block w-full ${INP}`} /></label>
            <label className="text-sm">Ort<input name="ort" defaultValue={p.ort} className={`mt-1 block w-full ${INP}`} /></label>
          </div>
          <label className="text-sm">Eintritt<input name="eintritt" defaultValue={p.eintritt} placeholder="z. B. 2018-04-01" className={`mt-1 block w-full ${INP}`} /></label>
          <label className="text-sm">Fläche (m²)<input name="groesseM2" type="number" defaultValue={p.groesseM2 ?? ""} className={`mt-1 block w-full ${INP}`} /></label>
          <label className="text-sm">Status
            <select name="status" defaultValue={p.status} className={`mt-1 block w-full ${INP}`}>
              {PARZELLE_STATUS.map((s) => <option key={s.wert} value={s.wert}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <button className="rounded bg-emerald-700 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-800">
          Stammdaten speichern
        </button>
      </form>

      {/* Pächterwechsel */}
      <details className={CARD}>
        <summary className="cursor-pointer text-base font-medium text-stone-600">Pächterwechsel erfassen</summary>
        <form action={paechterwechsel.bind(null, parzelleId)} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">Neuer Nachname<input name="nachname" className={`mt-1 block ${INP}`} required /></label>
          <label className="text-sm">Vorname<input name="vorname" className={`mt-1 block ${INP}`} /></label>
          <label className="text-sm">Datum<input name="datum" type="date" className={`mt-1 block ${INP}`} /></label>
          <button className="rounded bg-amber-700 px-4 py-2.5 text-base font-medium text-white hover:bg-amber-800">
            Pächterwechsel speichern
          </button>
        </form>
        <p className="mt-2 text-xs text-stone-600">Setzt neuen Pächter, leert Kontaktdaten, hält den Wechsel mit Datum in der Historie fest.</p>
      </details>

      {/* Änderungs-Historie + Ereignis hinzufügen */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Verwaltungs-Historie</h2>
        {p.aenderungen.length === 0 ? (
          <p className="mt-1 text-sm text-stone-600">Noch keine Einträge.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {p.aenderungen.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 text-base">
                <span>
                  <span className="text-stone-500">{dstr(a.datum)}</span> ·{" "}
                  <span className="font-medium">{AENDERUNG_LABEL[a.art] ?? a.art}</span>
                  {a.notiz ? ` — ${a.notiz}` : ""}
                </span>
                <form action={ereignisLoeschen.bind(null, parzelleId, a.id)}>
                  <button className="shrink-0 text-xs text-red-600 hover:underline">löschen</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={ereignisHinzufuegen.bind(null, parzelleId)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
          <label className="text-sm">Art
            <select name="art" className={`mt-1 block ${INP}`}>
              {AENDERUNG_ART.filter((a) => a.wert !== "stammdaten").map((a) => (
                <option key={a.wert} value={a.wert}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">Datum<input name="datum" type="date" className={`mt-1 block ${INP}`} /></label>
          <input name="notiz" placeholder="Notiz" className={`min-w-0 flex-1 ${INP}`} />
          <button className="rounded bg-stone-700 px-3 py-2.5 text-base font-medium text-white hover:bg-stone-800">+ Ereignis</button>
        </form>
      </section>

      {/* Begehungs-Timeline */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Begehungen (chronologisch)</h2>
        {p.befunde.length === 0 ? (
          <p className="mt-1 text-sm text-stone-600">Noch keine Begehungsdaten.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {p.befunde.map((b) => {
              const ist = b.beete.reduce((s, x) => s + x.flaecheM2, 0);
              return (
                <li key={b.id} className="flex items-start justify-between gap-3 border-t border-stone-100 pt-2">
                  <div className="min-w-0 text-base">
                    <span className="font-medium">{dstr(b.runde.datum)}</span>
                    <span className="ml-2 text-sm text-stone-500">
                      {STUFE_SYMBOL[b.stufe]} {STUFE_LABEL[b.stufe] ?? b.stufe}
                      {b.gutGemacht ? " · Plakette" : ""}
                      {` · Beet ${m2(ist)}${soll !== null ? `/${m2(soll)}` : ""} m²`}
                      {b.kompensationAusreichend ? " · kompensiert" : ""}
                      {b._count.maengel > 0 ? ` · ${b._count.maengel} ${b._count.maengel === 1 ? "Mangel" : "Mängel"}` : ""}
                      {b._count.fotos > 0 ? ` · ${b._count.fotos} ${b._count.fotos === 1 ? "Foto" : "Fotos"}` : ""}
                    </span>
                  </div>
                  <Link
                    href={`/begehung/ansicht/${b.runde.id}/${p.parzelleId}`}
                    className="shrink-0 text-sm text-emerald-700 hover:underline"
                  >
                    Details
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Akte: Dokument-Anhänge + Archiv-Fotos (aus dem Workspace hierher verlinkt) */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Akte / Dokumente</h2>
        {p.dokumente.length > 0 && (
          <ul className="mt-2 space-y-1">
            {p.dokumente.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-base">
                <a
                  href={`/api/datei/${d.dateipfad}`}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 truncate text-emerald-700 hover:underline"
                >
                  {DOKUMENT_TYP.find((t) => t.wert === d.typ)?.label ?? d.typ}
                  {d.notiz ? ` — ${d.notiz}` : ""} ({dstr(d.datum)})
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
        {archivGruppen.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-stone-100 pt-3">
            <p className="text-sm font-medium text-stone-500">Fotos früherer Begehungen</p>
            {archivGruppen.map((g) => (
              <details key={g.datum} className="text-base">
                <summary className="cursor-pointer text-emerald-700">
                  <Camera className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden />
                  Fotos {g.datum} ({g.fotos.length})
                  {g.quelle ? ` — ${g.quelle}` : ""}
                </summary>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {g.fotos.map((f) => (
                    <Thumb key={f.id} src={`/api/datei/${f.dateipfad}`} alt={`Foto ${g.datum}`} />
                  ))}
                </div>
              </details>
            ))}
          </div>
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
          <input name="notiz" placeholder="Notiz (optional)" className={`min-w-0 flex-1 ${INP}`} />
          <label className="text-sm text-stone-600">
            Datum
            <input type="date" name="datum" title="Original-Datum alter Schreiben (leer = heute)" className={`ml-2 ${INP}`} />
          </label>
          <input type="file" name="datei" className="text-base" />
          <button className="rounded bg-emerald-700 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-800">
            Hochladen
          </button>
        </form>
      </section>
    </div>
  );
}

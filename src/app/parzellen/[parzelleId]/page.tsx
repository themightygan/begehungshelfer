import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  PARZELLE_STATUS,
  STUFE_LABEL,
  STUFE_SYMBOL,
  AENDERUNG_LABEL,
  AENDERUNG_ART,
} from "@/lib/constants";
import {
  updateStammdaten,
  paechterwechsel,
  ereignisHinzufuegen,
  ereignisLoeschen,
} from "../actions";

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
        <p className="mt-2 text-xs text-stone-400">Setzt neuen Pächter, leert Kontaktdaten, hält den Wechsel mit Datum in der Historie fest.</p>
      </details>

      {/* Änderungs-Historie + Ereignis hinzufügen */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Verwaltungs-Historie</h2>
        {p.aenderungen.length === 0 ? (
          <p className="mt-1 text-sm text-stone-400">Noch keine Einträge.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {p.aenderungen.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 text-base">
                <span>
                  <span className="text-stone-400">{dstr(a.datum)}</span> ·{" "}
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
          <p className="mt-1 text-sm text-stone-400">Noch keine Begehungsdaten.</p>
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
                      {b.gutGemacht ? " · 👍 Plakette" : ""}
                      {` · Beet ${m2(ist)}${soll !== null ? `/${m2(soll)}` : ""} m²`}
                      {b.kompensationAusreichend ? " · kompensiert" : ""}
                      {b._count.maengel > 0 ? ` · ${b._count.maengel} Mangel` : ""}
                      {b._count.fotos > 0 ? ` · ${b._count.fotos} Foto` : ""}
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
    </div>
  );
}

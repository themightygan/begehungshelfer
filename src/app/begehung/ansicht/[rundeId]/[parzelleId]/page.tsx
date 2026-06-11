import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STUFEN } from "@/lib/constants";
import {
  aktualisiereBefund,
  aktualisiereKompensation,
  aktualisiereMangel,
  aktualisiereBeet,
  fotosNachtraeglich,
} from "./actions";
import { FotoZone } from "./FotoZone";
import { FotoWaehlenKnopf } from "./FotoWaehlenKnopf";

export const dynamic = "force-dynamic";

// Volle Daten einer (auch abgeschlossenen) Begehung je Parzelle — EDITIERBAR
// (Entscheidung 2026-06-11: Texte korrigierbar, Fotos löschbar/ergänzbar).
// Erreichbar aus Parzellenverwaltung (Begehungs-Timeline), Auswertung, Berichten.

const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const INP = "rounded border border-stone-300 px-3 py-2 text-base";
const BTN_SEC =
  "rounded border border-stone-300 px-4 py-2 text-base font-medium text-stone-700 hover:bg-stone-50";
const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

function FotoNachreichen({
  befundId,
  mangelId,
  beetId,
  kontext,
  pfad,
}: {
  befundId: number;
  mangelId?: number;
  beetId?: number;
  kontext: string;
  pfad: string;
}) {
  return (
    <form
      action={fotosNachtraeglich.bind(null, befundId, { mangelId, beetId, kontext }, pfad)}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <FotoWaehlenKnopf />
    </form>
  );
}

export default async function AnsichtSeite({
  params,
}: {
  params: Promise<{ rundeId: string; parzelleId: string }>;
}) {
  const { rundeId: rundeIdStr, parzelleId } = await params;
  const rundeId = Number(rundeIdStr);
  const pfad = `/begehung/ansicht/${rundeId}/${parzelleId}`;
  const parzelle = await prisma.parzelle.findUnique({
    where: { parzelleId },
    include: { anlage: true },
  });
  if (!parzelle) notFound();
  const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
  const befund = await prisma.befund.findUnique({
    where: { rundeId_parzelleId: { rundeId, parzelleId: parzelle.id } },
    include: {
      maengel: { orderBy: { id: "asc" }, include: { katalog: true, fotos: { orderBy: { id: "asc" } } } },
      beete: { orderBy: { id: "asc" }, include: { fotos: { orderBy: { id: "asc" } } } },
      fotos: { where: { mangelId: null, beetId: null }, orderBy: { id: "asc" } },
    },
  });
  if (!runde || !befund) notFound();

  const zustandFotos = befund.fotos.filter((f) => f.kontext === "zustand");
  const kompFotos = befund.fotos.filter((f) => f.kontext === "kompensation");
  const ist = befund.beete.reduce((s, b) => s + b.flaecheM2, 0);
  const soll = parzelle.groesseM2 ? parzelle.groesseM2 / 6 : null;
  const fristWert = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

  return (
    <div className="space-y-5 pb-12">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Parzelle {parzelle.parzelleId}</h1>
          <p className="text-base text-stone-500">
            {parzelle.anlage.name} · {parzelle.nachname} {parzelle.vorname}
            {parzelle.groesseM2 ? ` · ${parzelle.groesseM2} m²` : ""}
          </p>
          <p className="text-sm text-stone-400">
            {runde.bezeichnung} · {new Date(runde.datum).toLocaleDateString("de-DE")} ·
            nachträglich bearbeitbar · Fotos per Ziehen zwischen Bereichen verschiebbar
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-base">
          <Link href={`/parzellen/${parzelle.parzelleId}`} className="text-emerald-700 hover:underline">
            ← Parzellen-Akte
          </Link>
          <Link href={`/auswertung?rundeId=${rundeId}`} className="text-emerald-700 hover:underline">
            ← Auswertung
          </Link>
        </div>
      </div>

      {/* Befund (editierbar) */}
      <form action={aktualisiereBefund.bind(null, befund.id, pfad)} className={`${CARD} space-y-3`}>
        <h2 className="text-base font-medium text-stone-600">Befund</h2>
        <label className="block text-base">
          <span className="text-stone-600">Eskalationsstufe</span>
          <select name="stufe" defaultValue={befund.stufe} className={`mt-1 block w-full ${INP}`}>
            {STUFEN.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-base">
          <span className="text-stone-600">Allgemeine Bemerkung</span>
          <textarea name="notiz" defaultValue={befund.notiz} rows={3} className={`mt-1 block w-full ${INP}`} />
        </label>
        {befund.diktatNachgereicht.trim() !== "" && (
          <label className="block text-base">
            <span className="text-amber-800">Nachgereichte Diktate (korrigierbar)</span>
            <textarea
              name="diktatNachgereicht"
              defaultValue={befund.diktatNachgereicht}
              rows={2}
              className={`mt-1 block w-full border-amber-300 ${INP}`}
            />
          </label>
        )}
        {befund.diktatNachgereicht.trim() === "" && (
          <input type="hidden" name="diktatNachgereicht" value="" />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-base font-medium text-emerald-800">
            <input type="checkbox" name="gutGemacht" value="1" defaultChecked={befund.gutGemacht} className="h-5 w-5" />
            👍 Plakette
          </label>
          <input
            type="text"
            name="plakettenNotiz"
            defaultValue={befund.plakettenNotiz}
            placeholder="Lob / Begründung"
            className={`min-w-0 flex-1 ${INP}`}
          />
        </div>
        <button className={BTN_SEC}>Befund speichern</button>
      </form>

      {/* Gesamtansicht */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Gesamtansicht</h2>
        <FotoZone fotos={zustandFotos} ziel={{ kontext: "zustand" }} pfad={pfad} />
        <FotoNachreichen befundId={befund.id} kontext="zustand" pfad={pfad} />
      </section>

      {/* Gemüsebeete + Kompensation */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Gemüsebeete</h2>
        <p className="text-base">
          IST {m2(ist)} m²{soll !== null ? ` · SOLL (1/6) ${m2(soll)} m²` : ""}
        </p>
        {befund.beete.map((b) => (
          <div key={b.id} className="mt-2 rounded border border-stone-100 p-2">
            <form action={aktualisiereBeet.bind(null, b.id, pfad)} className="flex flex-wrap items-center gap-2">
              <input type="text" name="bezeichnung" defaultValue={b.bezeichnung} placeholder="Bezeichnung" className={`min-w-0 flex-1 ${INP}`} />
              <input type="text" inputMode="decimal" name="flaeche" defaultValue={b.flaecheM2 ? String(b.flaecheM2).replace(".", ",") : ""} placeholder="m²" className={`w-24 ${INP}`} />
              <button className="rounded bg-stone-700 px-3.5 py-2 text-base text-white hover:bg-stone-800">✓</button>
            </form>
            <FotoZone fotos={b.fotos} ziel={{ beetId: b.id, kontext: "beet" }} pfad={pfad} />
            <FotoNachreichen befundId={befund.id} beetId={b.id} kontext="beet" pfad={pfad} />
          </div>
        ))}

        <form action={aktualisiereKompensation.bind(null, befund.id, pfad)} className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-sm">
          <p className="font-medium text-stone-600">Weitere Anbaunutzung / Kompensation</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-stone-600">Obstbäume</span>
              Anzahl
              <input name="obstAnzahl" type="number" min="0" defaultValue={befund.kompObstAnzahl || ""} className={`w-20 ${INP}`} />
              Fläche
              <input name="obstFlaeche" inputMode="decimal" defaultValue={befund.kompObstFlaecheM2 ? String(befund.kompObstFlaecheM2).replace(".", ",") : ""} className={`w-24 ${INP}`} /> m²
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-stone-600">Beeren / Spalierobst</span>
              Anzahl
              <input name="beerenAnzahl" type="number" min="0" defaultValue={befund.kompBeerenAnzahl || ""} className={`w-20 ${INP}`} />
              Fläche
              <input name="beerenFlaeche" inputMode="decimal" defaultValue={befund.kompBeerenFlaecheM2 ? String(befund.kompBeerenFlaecheM2).replace(".", ",") : ""} className={`w-24 ${INP}`} /> m²
            </div>
          </div>
          <textarea name="kompNotiz" defaultValue={befund.kompensationNotiz} rows={2} placeholder="Kommentar" className={`block w-full ${INP}`} />
          <label className="flex items-start gap-2 font-medium text-emerald-800">
            <input type="checkbox" name="ausreichend" value="1" defaultChecked={befund.kompensationAusreichend} className="mt-1 h-5 w-5" />
            Ausreichende kleingärtnerische Nutzung (Anbau gesamt ≥ 1/3)
          </label>
          <button className={BTN_SEC}>Kompensation speichern</button>
        </form>
        <FotoZone fotos={kompFotos} ziel={{ kontext: "kompensation" }} pfad={pfad} />
        <FotoNachreichen befundId={befund.id} kontext="kompensation" pfad={pfad} />
      </section>

      {/* Mängel (editierbar) */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">
          Festgestellte Mängel ({befund.maengel.length})
        </h2>
        {befund.maengel.length === 0 ? (
          <p className="mt-1 text-base text-stone-400">Keine Mängel erfasst.</p>
        ) : (
          <ul className="mt-2 space-y-4">
            {befund.maengel.map((m) => (
              <li key={m.id} className="border-t border-stone-100 pt-3">
                <p className="text-xs uppercase tracking-wide text-stone-400">{m.bereich}</p>
                <p className="text-base font-medium">
                  {m.punkt || "(Freitext-Mangel)"}
                  <span className="ml-2 text-sm font-normal text-stone-400">
                    Status: {m.status}
                  </span>
                </p>
                {m.katalog?.referenz && <p className="text-sm text-stone-400">{m.katalog.referenz}</p>}
                <form action={aktualisiereMangel.bind(null, m.id, pfad)} className="mt-2 space-y-2">
                  {m.katalogId === null && (
                    <input type="text" name="punkt" defaultValue={m.punkt} placeholder="Bezeichnung des Mangels" className={`block w-full ${INP}`} />
                  )}
                  <textarea name="notiz" defaultValue={m.notiz} rows={2} placeholder="Maßnahme / Beschreibung" className={`block w-full ${INP}`} />
                  {m.diktatNachgereicht.trim() !== "" ? (
                    <label className="block text-sm">
                      <span className="text-amber-800">Nachgereichte Diktate (korrigierbar)</span>
                      <textarea name="diktatNachgereicht" defaultValue={m.diktatNachgereicht} rows={2} className={`mt-1 block w-full border-amber-300 ${INP}`} />
                    </label>
                  ) : (
                    <input type="hidden" name="diktatNachgereicht" value="" />
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-base text-stone-600">
                      Frist
                      <input type="date" name="frist" defaultValue={fristWert(m.frist)} className={`ml-2 ${INP}`} />
                    </label>
                    <button className={BTN_SEC}>Speichern</button>
                  </div>
                </form>
                <FotoZone fotos={m.fotos} ziel={{ mangelId: m.id, kontext: "mangel" }} pfad={pfad} />
                <FotoNachreichen befundId={befund.id} mangelId={m.id} kontext="mangel" pfad={pfad} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <a
        href={`/api/parzelle/${parzelle.parzelleId}/pdf?rundeId=${rundeId}`}
        target="_blank"
        rel="noopener"
        className="inline-block rounded border border-emerald-700 px-4 py-2 text-base font-medium text-emerald-700 hover:bg-emerald-50"
      >
        📄 Bericht-PDF
      </a>
    </div>
  );
}

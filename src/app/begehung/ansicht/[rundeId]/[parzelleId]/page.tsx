import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ThumbsUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { STUFEN, STUFE_LABEL, STUFE_SYMBOL, BEFUND_STATUS, BEFUND_STATUS_LABEL } from "@/lib/constants";
import { hatDaten } from "@/lib/auswertung";
import { istNeupaechter } from "@/lib/paechter";
import { NeupaechterTag } from "@/components/NeupaechterTag";
import { BeetZelle } from "@/components/BeetZelle";
import {
  aktualisiereBefund,
  aktualisiereKompensation,
  aktualisiereMangel,
  aktualisiereBeet,
  fotosNachtraeglich,
  setzeFristAlle,
  loescheMangel,
  mangelHinzufuegenNachtraeglich,
  schreibenErstellen,
} from "./actions";
import { SchreibenErstellen } from "./SchreibenErstellen";
import { historieVorschlag } from "@/lib/schreibenErzeugen";
import { mailKonfig } from "@/lib/mail";
import { FotoZone } from "./FotoZone";
import { FristAlle } from "./FristAlle";
import { FotoWaehlenKnopf } from "@/components/FotoWaehlenKnopf";
import { AutoSaveForm } from "@/components/AutoSaveForm";
import { ConfirmButton } from "@/app/begehung/ConfirmButton";

export const dynamic = "force-dynamic";

// Volle Daten einer (auch abgeschlossenen) Begehung je Parzelle — EDITIERBAR
// (Entscheidung 2026-06-11: Texte korrigierbar, Fotos löschbar/ergänzbar).
// Erreichbar aus Parzellenverwaltung (Begehungs-Timeline), Auswertung, Berichten.

const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const INP = "rounded border border-stone-300 px-3 py-2 text-base";
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
  searchParams,
}: {
  params: Promise<{ rundeId: string; parzelleId: string }>;
  searchParams: Promise<{ von?: string }>;
}) {
  const { rundeId: rundeIdStr, parzelleId } = await params;
  const rundeId = Number(rundeIdStr);
  const pfad = `/begehung/ansicht/${rundeId}/${parzelleId}`;
  // Herkunft (kombinierte Jahres-Ansicht): nur die eine erlaubte Form
  // durchlassen, sonst Standard-Rücksprung zur Runden-Tabelle.
  const vonRaw = (await searchParams).von ?? "";
  const von = /^jahr=\d{4}&anlage=[A-Za-z]+$/.test(vonRaw) ? vonRaw : null;
  const vonSuffix = von ? `?von=${encodeURIComponent(von)}` : "";
  const zurueck = von
    ? `/auswertung?${von}#p-${parzelleId}`
    : `/auswertung?rundeId=${rundeId}#p-${parzelleId}`;
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

  // Mail-Konfiguration (Verein-Tab); string = Hinweistext statt Buttons.
  const konfig = await mailKonfig();

  // Dokumenten-Akte für den Historie-Vorschlag der 2. Abmahnung.
  const dokumente = await prisma.dokument.findMany({
    where: { parzelleId: parzelle.id },
    orderBy: { datum: "asc" },
    select: { typ: true, datum: true, notiz: true },
  });
  // Schreiben zu DIESER Begehung schon in der Akte? (Gesendet-Abgleich bzw.
  // manueller Upload ab dem Begehungstag) -> Hinweis statt Doppelversand.
  const begehungsTag = new Date(runde.datum);
  begehungsTag.setHours(0, 0, 0, 0);
  const bereitsInAkte =
    dokumente.find(
      (d) => (d.typ === "schreiben" || d.typ === "email") && d.datum >= begehungsTag
    )?.datum.toLocaleDateString("de-DE") ?? null;

  // Katalog fürs nachträgliche Ergänzen von Mängeln.
  const katalog = await prisma.katalog.findMany({
    where: { aktiv: true },
    orderBy: { sortierung: "asc" },
  });
  const katalogBereiche = new Map<string, typeof katalog>();
  for (const k of katalog) {
    let arr = katalogBereiche.get(k.bereich);
    if (!arr) katalogBereiche.set(k.bereich, (arr = []));
    arr.push(k);
  }

  // Andere Begehungen dieser Parzelle (mit Daten) — zum schnellen Hineinspringen.
  const andereBefunde = (
    await prisma.befund.findMany({
      where: { parzelleId: parzelle.id, NOT: { rundeId } },
      include: {
        runde: { select: { id: true, datum: true } },
        beete: { select: { flaecheM2: true } },
        _count: { select: { maengel: true, fotos: true } },
      },
      orderBy: { runde: { datum: "desc" } },
    })
  ).filter(hatDaten);

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
            {istNeupaechter(parzelle.eintritt, parzelle.status) && (
              <span className="ml-1.5"><NeupaechterTag /></span>
            )}
            {parzelle.groesseM2 ? ` · ${parzelle.groesseM2} m²` : ""}
          </p>
          <p className="text-sm text-stone-600">
            {runde.bezeichnung} · {new Date(runde.datum).toLocaleDateString("de-DE")} ·
            speichert automatisch beim Verlassen eines Felds · Fotos per Ziehen verschiebbar
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-base">
          <Link href={`/parzellen/${parzelle.parzelleId}`} className="text-emerald-700 hover:underline">
            ← Parzellen-Akte
          </Link>
          <Link href={zurueck} className="text-emerald-700 hover:underline">
            ← Auswertung
          </Link>
        </div>
      </div>

      {/* Befund (editierbar, Auto-Save) */}
      <AutoSaveForm action={aktualisiereBefund.bind(null, befund.id, pfad)} className={`${CARD} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-stone-600">Befund</h2>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            Bearbeitung
            <select name="status" defaultValue={befund.status} className={INP}>
              {BEFUND_STATUS.map((s) => (
                <option key={s.wert} value={s.wert}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
            <ThumbsUp className="h-4 w-4 shrink-0" aria-hidden /> Plakette
          </label>
          <input
            type="text"
            name="plakettenNotiz"
            defaultValue={befund.plakettenNotiz}
            placeholder="Lob / Begründung"
            className={`min-w-0 flex-1 ${INP}`}
          />
        </div>
      </AutoSaveForm>

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
            <AutoSaveForm action={aktualisiereBeet.bind(null, b.id, pfad)} className="flex flex-wrap items-center gap-2">
              <input type="text" name="bezeichnung" defaultValue={b.bezeichnung} placeholder="Bezeichnung" className={`min-w-0 flex-1 ${INP}`} />
              <input type="text" inputMode="decimal" name="flaeche" defaultValue={b.flaecheM2 ? String(b.flaecheM2).replace(".", ",") : ""} placeholder="m²" className={`w-24 ${INP}`} />
            </AutoSaveForm>
            <FotoZone fotos={b.fotos} ziel={{ beetId: b.id, kontext: "beet" }} pfad={pfad} />
            <FotoNachreichen befundId={befund.id} beetId={b.id} kontext="beet" pfad={pfad} />
          </div>
        ))}

        <AutoSaveForm action={aktualisiereKompensation.bind(null, befund.id, pfad)} className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-sm">
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
        </AutoSaveForm>
        <FotoZone fotos={kompFotos} ziel={{ kontext: "kompensation" }} pfad={pfad} />
        <FotoNachreichen befundId={befund.id} kontext="kompensation" pfad={pfad} />
      </section>

      {/* Mängel (editierbar) */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium text-stone-600">
            Festgestellte Mängel ({befund.maengel.length})
          </h2>
          {befund.maengel.length > 0 && (
            <FristAlle
              hatFristen={befund.maengel.some((m) => m.frist !== null)}
              action={setzeFristAlle.bind(null, befund.id, pfad)}
            />
          )}
        </div>
        {befund.maengel.length === 0 ? (
          <p className="mt-1 text-base text-stone-600">Keine Mängel erfasst.</p>
        ) : (
          <ul className="mt-2 space-y-4">
            {befund.maengel.map((m) => (
              <li key={m.id} className="border-t border-stone-100 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-stone-600">{m.bereich}</p>
                  {/* Eigenes Formular (Geschwister der AutoSaveForm — die würde
                      einen Submit abfangen und stattdessen speichern). */}
                  <form action={loescheMangel.bind(null, m.id, pfad)}>
                    <ConfirmButton
                      message="Diesen Mangel wirklich löschen? Notiz, Frist und Fotos des Mangels werden entfernt."
                      className="rounded px-2 py-0.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      Mangel löschen
                    </ConfirmButton>
                  </form>
                </div>
                <p className="text-base font-medium">
                  {m.punkt || "(Freitext-Mangel)"}
                  <span className="ml-2 text-sm font-normal text-stone-600">
                    Status: {m.status}
                  </span>
                </p>
                {m.katalog?.referenz && <p className="text-sm text-stone-600">{m.katalog.referenz}</p>}
                <AutoSaveForm action={aktualisiereMangel.bind(null, m.id, pfad)} className="mt-2 space-y-2">
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
                      {/* key = Serverwert: remountet das (uncontrolled) Feld nach
                          router.refresh, damit die zentrale Frist sichtbar wird */}
                      <input key={fristWert(m.frist)} type="date" name="frist" defaultValue={fristWert(m.frist)} className={`ml-2 ${INP}`} />
                    </label>
                  </div>
                </AutoSaveForm>
                <FotoZone fotos={m.fotos} ziel={{ mangelId: m.id, kontext: "mangel" }} pfad={pfad} />
                <FotoNachreichen befundId={befund.id} mangelId={m.id} kontext="mangel" pfad={pfad} />
              </li>
            ))}
          </ul>
        )}

        {/* Mangel nachträglich ergänzen (EIN Submit; bewusst kein FotoWaehlenKnopf —
            der schickt das Formular schon bei der Dateiauswahl ab). */}
        <form
          action={mangelHinzufuegenNachtraeglich.bind(null, befund.id, pfad)}
          className="mt-4 space-y-2 border-t border-stone-200 pt-3"
        >
          <p className="text-sm font-medium text-stone-600">Mangel hinzufügen</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select name="katalogId" defaultValue="" className={INP}>
              <option value="">Freitext…</option>
              {[...katalogBereiche.entries()].map(([bereich, punkte]) => (
                <optgroup key={bereich} label={bereich}>
                  {punkte.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.punkt}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              type="text"
              name="punkt"
              placeholder="Bezeichnung (nur bei Freitext)"
              className={INP}
            />
          </div>
          <textarea name="notiz" rows={2} placeholder="Maßnahme / Beschreibung" className={`block w-full ${INP}`} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-base text-stone-600">
              Frist
              <input type="date" name="frist" className={`ml-2 ${INP}`} />
            </label>
            <input type="file" name="fotos" accept="image/*" multiple className="text-sm" />
          </div>
          <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
            + Mangel hinzufügen
          </button>
        </form>
      </section>

      <a
        href={`/api/parzelle/${parzelle.parzelleId}/pdf?rundeId=${rundeId}`}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 rounded border border-emerald-700 px-4 py-2 text-base font-medium text-emerald-700 hover:bg-emerald-50"
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden /> Bericht-PDF
      </a>

      {/* Schreiben erstellen: voller Prozess (docx aus Vorlagen + Bausteinen,
          Versand als Entwurf) — Typ aus der Befund-Stufe vorbelegt. */}
      <section className={CARD}>
        <h2 className="mb-2 text-base font-medium">Schreiben erstellen</h2>
        {typeof konfig === "string" ? (
          <p className="text-sm text-stone-600">
            {konfig}{" "}
            <Link href="/einstellungen?tab=verein" className="text-emerald-700 hover:underline">
              Zu den Einstellungen
            </Link>
          </p>
        ) : (
          <SchreibenErstellen
            action={schreibenErstellen.bind(null, rundeId, parzelle.parzelleId)}
            stufe={befund.stufe}
            anredeFehlt={parzelle.anrede !== "herr" && parzelle.anrede !== "frau"}
            historieVorschlag={historieVorschlag(dokumente)}
            paechterEmail={parzelle.email}
            bvEmail={konfig.bezirksverband}
            bereitsInAkte={bereitsInAkte}
          />
        )}
      </section>

      {/* Andere Begehungen dieser Parzelle (Kurzzeile + Sprunglink) */}
      {andereBefunde.length > 0 && (
        <section className={CARD}>
          <h2 className="text-base font-medium text-stone-600">
            Weitere Begehungen dieser Parzelle
          </h2>
          <ul className="mt-2 space-y-1">
            {andereBefunde.map((b) => (
              <li key={b.id} className="border-t border-stone-100">
                <Link
                  href={`/begehung/ansicht/${b.rundeId}/${parzelle.parzelleId}${vonSuffix}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:bg-stone-50"
                >
                  <span className="font-medium text-emerald-700">
                    {new Date(b.runde.datum).toLocaleDateString("de-DE")}
                  </span>
                  <span>
                    Beet <BeetZelle
                      ist={b.beete.reduce((s, x) => s + x.flaecheM2, 0)}
                      soll={soll}
                      komp={b.kompensationAusreichend}
                    />
                  </span>
                  <span>{STUFE_SYMBOL[b.stufe]} {STUFE_LABEL[b.stufe] ?? b.stufe}</span>
                  <span>Plakette: {b.gutGemacht ? "ja" : "nein"}</span>
                  <span>{b._count.maengel === 1 ? "1 Mangel" : `${b._count.maengel} Mängel`}</span>
                  <span className="text-stone-500">
                    {BEFUND_STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

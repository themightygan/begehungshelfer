"use client";

import { useState } from "react";
import Link from "next/link";
import { Thumb } from "@/components/Thumb";
import { NeupaechterTag } from "@/components/NeupaechterTag";
import { STUFEN, STUFE_LABEL, STUFE_SYMBOL, normalisiereStufe } from "@/lib/constants";
import type { SnapKatalog, SnapParzelle, SnapVorMangel } from "@/lib/workspaceTypes";
import {
  speichereBefund,
  speichereKompensation,
  mangelHinzufuegen,
  mangelAendern,
  mangelEntfernen,
  beetHinzufuegen,
  beetAendern,
  beetEntfernen,
  behobenSetzen,
} from "@/lib/workspaceStore";
import { FotoBereich } from "./FotoBereich";
import { DiktatTextarea } from "./DiktatTextarea";

// Parzellen-Erfassung im Offline-Workspace. Alles speichert AUTOMATISCH lokal
// (onBlur/onChange -> Op in die Outbox) und synchronisiert im Hintergrund —
// es gibt bewusst keine Speichern-Knöpfe mehr, die offline scheitern könnten.

const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const INP = "rounded border border-stone-300 px-3 py-2 text-base";
const BTN = "rounded bg-emerald-700 px-4 py-2.5 text-base font-medium text-white hover:bg-emerald-800";
const BTN_SEC = "rounded border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-50";

const m2 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const parseFlaeche = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const parseGanz = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const fristAnzeige = (f: string | null) =>
  f ? new Date(f + "T00:00:00").toLocaleDateString("de-DE") : "—";

function FotoGitterRO({ fotos }: { fotos: { id: number; pfad: string }[] }) {
  if (fotos.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {fotos.map((f) => (
        <Thumb key={f.id} src={`/api/datei/${f.pfad}`} alt="Foto (Vorjahr)" />
      ))}
    </div>
  );
}

export function ParzelleAnsicht({
  p,
  katalog,
  rundeId,
  prev,
  next,
  onNavigate,
}: {
  p: SnapParzelle;
  katalog: SnapKatalog[];
  rundeId: number;
  prev: string | null;
  next: string | null;
  onNavigate: (pid: string | null) => void;
}) {
  const pid = p.parzelleId;
  const b = p.befund;
  const [lob, setLob] = useState(b?.gutGemacht ?? false);
  const [neuBeetName, setNeuBeetName] = useState("");
  const [neuBeetFlaeche, setNeuBeetFlaeche] = useState("");

  // Gemüse: IST = Summe der Beete; SOLL = 1/6 der Parzellenfläche (UPV §12).
  const beete = b?.beete ?? [];
  const maengel = b?.maengel ?? [];
  const beetIst = beete.reduce((s, x) => s + x.flaecheM2, 0);
  const beetSoll = p.groesseM2 ? p.groesseM2 / 6 : null;
  const beetRatio = beetSoll ? beetIst / beetSoll : null;
  const beetFarbe =
    beetRatio === null
      ? "text-stone-500"
      : beetRatio > 0.8
        ? "text-emerald-700"
        : beetRatio >= 0.6
          ? "text-amber-600"
          : "text-red-600";
  const beetStatus =
    beetRatio === null ? "" : beetRatio > 0.8 ? "erfüllt" : beetRatio >= 0.6 ? "knapp" : "zu wenig";
  const beetUnterSoll = beetRatio !== null && beetRatio <= 0.8;
  const kompAktiv = (b?.kompensationAusreichend ?? false) && beetUnterSoll;
  const kompFlaeche = (b?.kompObstFlaecheM2 ?? 0) + (b?.kompBeerenFlaecheM2 ?? 0);
  const anbauGesamt = beetIst + kompFlaeche;
  const anbauSoll = p.groesseM2 ? p.groesseM2 / 3 : null;

  // Vorjahr: Vergleich je Katalogpunkt / Freitext-Punkt.
  const vorByKatalog = new Map<number, SnapVorMangel>();
  const vorByPunkt = new Map<string, SnapVorMangel>();
  for (const m of p.vorjahr?.maengel ?? []) {
    if (m.katalogId != null) vorByKatalog.set(m.katalogId, m);
    else if (m.punkt) vorByPunkt.set(m.punkt, m);
  }
  const vorFuer = (m: { katalogId: number | null; punkt: string }) =>
    m.katalogId != null ? vorByKatalog.get(m.katalogId) : vorByPunkt.get(m.punkt);

  const gewaehlt = new Set(maengel.map((m) => m.katalogId).filter(Boolean));
  const bereiche: { name: string; punkte: SnapKatalog[] }[] = [];
  for (const k of katalog) {
    let g = bereiche.find((x) => x.name === k.bereich);
    if (!g) bereiche.push((g = { name: k.bereich, punkte: [] }));
    g.punkte.push(k);
  }

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-5 pb-16">
      {/* Kopf */}
      <div>
        <h1 className="text-2xl font-semibold">Parzelle {pid}</h1>
        <p className="text-base text-stone-500">
          {p.paechter}
          {p.neupaechter && (
            <span className="ml-1.5"><NeupaechterTag /></span>
          )}
          {p.groesseM2 ? ` · ${p.groesseM2} m²` : ""}
          <span className="ml-2 text-sm text-stone-400">
            · speichert automatisch
          </span>
        </p>
      </div>

      {/* Navigation: vorige | zurück zum Plan | nächste */}
      <div className="flex items-center justify-between gap-2">
        {prev ? (
          <button onClick={() => onNavigate(prev)} className={BTN_SEC}>
            ← {prev}
          </button>
        ) : (
          <span className="px-4 py-2.5 text-stone-300">←</span>
        )}
        <button
          onClick={() => onNavigate(null)}
          className="rounded bg-stone-200 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-300"
        >
          ↑ zurück zum Plan
        </button>
        {next ? (
          <button onClick={() => onNavigate(next)} className={BTN_SEC}>
            {next} →
          </button>
        ) : (
          <span className="px-4 py-2.5 text-stone-300">→</span>
        )}
      </div>

      {/* Details der letzten Begehung */}
      {p.vorjahr &&
        (p.vorjahr.notiz.trim() !== "" ||
          p.plakettenJahre.length > 0 ||
          p.vorjahr.stufe !== "neutral") && (
          <details className="rounded-lg border border-stone-200 bg-white p-3 text-base">
            <summary className="cursor-pointer font-medium text-stone-600">
              📋 Letzte Begehung ({p.vorjahr.datum}) — Details
            </summary>
            <div className="mt-2 space-y-1 text-stone-700">
              {p.vorjahr.stufe !== "neutral" && (
                <p>
                  {STUFE_SYMBOL[p.vorjahr.stufe]} Eskalationsstufe:{" "}
                  {STUFE_LABEL[p.vorjahr.stufe] ?? p.vorjahr.stufe}
                </p>
              )}
              {p.plakettenJahre.length > 0 && (
                <p className="font-medium text-emerald-700">
                  👍 Plakette erteilt: {p.plakettenJahre.join(", ")}
                </p>
              )}
              {p.vorjahr.notiz.trim() !== "" && (
                <p className="whitespace-pre-line">{p.vorjahr.notiz}</p>
              )}
            </div>
          </details>
        )}

      {/* Offene Mängel aus früheren Begehungen — abhaken (Nachverfolgung) */}
      {p.offeneFruehere.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-4">
          <h2 className="text-base font-medium text-amber-900">
            Offene Mängel aus früheren Begehungen ({p.offeneFruehere.filter((m) => !m.behoben).length})
          </h2>
          <ul className="mt-2 space-y-2">
            {p.offeneFruehere.map((m) => {
              const ueb = m.frist && new Date(m.frist + "T00:00:00") < heute;
              return (
                <li
                  key={m.uid}
                  className="flex items-start justify-between gap-3 rounded border border-amber-200 bg-white p-2"
                >
                  <div className={`min-w-0 ${m.behoben ? "opacity-50" : ""}`}>
                    <p className={`text-base font-medium ${m.behoben ? "line-through" : ""}`}>
                      {m.punkt || "(ohne Bezeichnung)"}
                    </p>
                    {m.notiz && <p className="text-sm text-stone-500">{m.notiz}</p>}
                    <p className={`text-sm ${ueb && !m.behoben ? "font-medium text-red-600" : "text-stone-400"}`}>
                      Begehung {m.rundeDatum}
                      {m.frist ? ` · Frist ${fristAnzeige(m.frist)}` : ""}
                      {ueb && !m.behoben ? " · überfällig" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => behobenSetzen(pid, m.uid, !m.behoben)}
                    className={
                      m.behoben
                        ? "shrink-0 rounded border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50"
                        : "shrink-0 rounded bg-emerald-700 px-3 py-2 text-base font-medium text-white hover:bg-emerald-800"
                    }
                  >
                    {m.behoben ? "rückgängig" : "✓ behoben"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Obere Reihe: Gesamtansicht | Gemüsebeete */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-base font-medium text-stone-600">Gesamtansicht</h2>
          <FotoBereich
            rundeId={rundeId}
            parzelleId={pid}
            fotos={b?.zustandFotos ?? []}
            kontext="zustand"
          />
        </section>

        {/* Gemüsebeete: IST vs. SOLL 1/6 mit Ampel */}
        <section className={CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-medium text-stone-600">Gemüsebeete</h2>
            <span className={`text-base font-semibold ${kompAktiv ? "text-emerald-700" : beetFarbe}`}>
              IST {m2(beetIst)} m²
              {beetSoll !== null && (
                <>
                  {" / SOLL "}
                  {m2(beetSoll)} m²
                  {(kompAktiv ? "kompensiert (dokumentiert)" : beetStatus) &&
                    ` · ${kompAktiv ? "kompensiert (dokumentiert)" : beetStatus}`}
                </>
              )}
            </span>
          </div>

          {p.messHistorie.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-stone-600">
                <span className="font-medium">
                  Zuletzt gemessen: {m2(p.messHistorie[0].summe)} m² ({p.messHistorie[0].datum}) ·{" "}
                </span>
                <span className="text-emerald-700">Historie ({p.messHistorie.length})</span>
              </summary>
              <ul className="mt-2 space-y-2">
                {p.messHistorie.map((h) => (
                  <li key={h.datum} className="border-t border-stone-100 pt-2">
                    <p className="font-medium">
                      {h.datum}: {m2(h.summe)} m²
                    </p>
                    <p className="text-stone-500">
                      {h.beete.map((x) => `${x.bezeichnung || "Beet"}: ${x.flaecheM2} m²`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-3 space-y-3">
            {beete.map((beet) => (
              <div key={beet.uid} className="rounded border border-stone-100 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    defaultValue={beet.bezeichnung}
                    placeholder="Bezeichnung (z. B. Beet 1)"
                    onBlur={(e) => {
                      if (e.target.value !== beet.bezeichnung)
                        beetAendern(pid, beet.uid, { bezeichnung: e.target.value });
                    }}
                    className={`min-w-0 flex-1 ${INP}`}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={beet.flaecheM2 ? String(beet.flaecheM2).replace(".", ",") : ""}
                    placeholder="m²"
                    onBlur={(e) => {
                      const wert = parseFlaeche(e.target.value);
                      if (wert !== beet.flaecheM2) beetAendern(pid, beet.uid, { flaecheM2: wert });
                    }}
                    className={`w-24 ${INP}`}
                  />
                  <button
                    onClick={() => {
                      if (window.confirm("Beet entfernen?")) beetEntfernen(pid, beet.uid);
                    }}
                    className="rounded px-3 py-2.5 text-base text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
                <FotoBereich
                  rundeId={rundeId}
                  parzelleId={pid}
                  fotos={beet.fotos}
                  kontext="beet"
                  beetUid={beet.uid}
                />
              </div>
            ))}
          </div>

          {beete.length < 5 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
              <input
                type="text"
                value={neuBeetName}
                onChange={(e) => setNeuBeetName(e.target.value)}
                placeholder="Neues Beet"
                className={`min-w-0 flex-1 ${INP}`}
              />
              <input
                type="text"
                inputMode="decimal"
                value={neuBeetFlaeche}
                onChange={(e) => setNeuBeetFlaeche(e.target.value)}
                placeholder="m²"
                className={`w-24 ${INP}`}
              />
              <button
                onClick={() => {
                  beetHinzufuegen(pid, {
                    bezeichnung: neuBeetName,
                    flaecheM2: parseFlaeche(neuBeetFlaeche),
                  });
                  setNeuBeetName("");
                  setNeuBeetFlaeche("");
                }}
                className={BTN}
              >
                + Beet
              </button>
            </div>
          )}

          {/* Kompensation: sonstiger Anbau gleicht geringe Gemüsefläche aus */}
          <details className="mt-3 border-t border-stone-100 pt-3 text-sm" open={kompAktiv}>
            <summary className="cursor-pointer font-medium text-stone-600">
              Weitere Anbaunutzung / Kompensation{b?.kompensationAusreichend ? " ✓" : ""}
            </summary>
            {anbauSoll !== null && (
              <p className="mt-1 text-sm text-stone-500">
                Anbau gesamt (Gemüse {m2(beetIst)} + Kompensation {m2(kompFlaeche)}) ={" "}
                <span
                  className={
                    anbauGesamt >= anbauSoll
                      ? "font-medium text-emerald-700"
                      : "font-medium text-amber-600"
                  }
                >
                  {m2(anbauGesamt)} m²
                </span>{" "}
                / 1/3-SOLL {m2(anbauSoll)} m²
              </p>
            )}
            <div className="mt-2 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-40 text-stone-600">Obstbäume</span>
                  Anzahl
                  <input
                    type="number"
                    min="0"
                    defaultValue={b?.kompObstAnzahl || ""}
                    onBlur={(e) => speichereKompensation(pid, { obstAnzahl: parseGanz(e.target.value) })}
                    className={`w-20 ${INP}`}
                  />
                  Fläche
                  <input
                    inputMode="decimal"
                    defaultValue={b?.kompObstFlaecheM2 ? String(b.kompObstFlaecheM2).replace(".", ",") : ""}
                    onBlur={(e) => speichereKompensation(pid, { obstFlaecheM2: parseFlaeche(e.target.value) })}
                    className={`w-24 ${INP}`}
                  />{" "}
                  m²
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-40 text-stone-600">Beeren / Spalierobst</span>
                  Anzahl
                  <input
                    type="number"
                    min="0"
                    defaultValue={b?.kompBeerenAnzahl || ""}
                    onBlur={(e) => speichereKompensation(pid, { beerenAnzahl: parseGanz(e.target.value) })}
                    className={`w-20 ${INP}`}
                  />
                  Fläche
                  <input
                    inputMode="decimal"
                    defaultValue={b?.kompBeerenFlaecheM2 ? String(b.kompBeerenFlaecheM2).replace(".", ",") : ""}
                    onBlur={(e) => speichereKompensation(pid, { beerenFlaecheM2: parseFlaeche(e.target.value) })}
                    className={`w-24 ${INP}`}
                  />{" "}
                  m²
                </div>
              </div>
              <DiktatTextarea
                defaultValue={b?.kompensationNotiz}
                rows={2}
                placeholder="Kommentar (z. B. großer Obstbaumbestand, Beerenanlage). Zierpflanzen zählen nicht zum Anbau."
                className={`block w-full ${INP}`}
                rundeId={rundeId}
                parzelleId={pid}
                onCommit={(text) => speichereKompensation(pid, { notiz: text })}
              />
              <label className="flex items-start gap-2 font-medium text-emerald-800">
                <input
                  type="checkbox"
                  defaultChecked={b?.kompensationAusreichend ?? false}
                  onChange={(e) => speichereKompensation(pid, { ausreichend: e.target.checked })}
                  className="mt-1 h-5 w-5"
                />
                Ausreichende kleingärtnerische Nutzung trotz geringer Gemüsefläche (Anbau gesamt ≥ 1/3)
              </label>
            </div>
            <FotoBereich
              rundeId={rundeId}
              parzelleId={pid}
              fotos={b?.kompFotos ?? []}
              kontext="kompensation"
            />
          </details>
        </section>
      </div>

      {/* Mängel-Menü */}
      <section className={CARD}>
        <h2 className="text-base font-medium text-stone-600">Mangel hinzufügen</h2>
        <p className="text-sm text-stone-400">
          Antippen wählt den Punkt aus.
          {p.vorjahr && (
            <>
              {" "}
              Punkte mit <span className="text-amber-700">⚠</span> waren bei der letzten Begehung (
              {p.vorjahr.datum}) beanstandet.
            </>
          )}
        </p>
        <div className="mt-3 space-y-3">
          {bereiche.map((g) => (
            <div key={g.name}>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">
                {g.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {g.punkte.map((k) => {
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
                      onClick={() => mangelHinzufuegen(pid, k)}
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
            onClick={() => mangelHinzufuegen(pid, null)}
            className="rounded-full border border-dashed border-stone-400 px-3.5 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            + Sonstiger Punkt (Freitext)
          </button>
        </div>
      </section>

      {/* Erfasste Mängel */}
      {maengel.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-medium text-stone-600">
            Festgestellte Mängel ({maengel.length})
          </h2>
          {maengel.map((m) => {
            const freitext = m.katalogId === null;
            const vor = vorFuer(m);
            const katEintrag = m.katalogId != null ? katalog.find((k) => k.id === m.katalogId) : undefined;
            return (
              <div key={m.uid} className={CARD}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-stone-400">{m.bereich}</span>
                    <h3 className="text-lg font-medium">
                      {m.punkt || (freitext ? "(Freitext-Mangel)" : "")}
                      {m.fotos.length === 0 && (
                        <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                          ⚠ Foto fehlt
                        </span>
                      )}
                    </h3>
                    {katEintrag?.referenz && (
                      <p className="text-sm text-stone-400">{katEintrag.referenz}</p>
                    )}
                    {katEintrag?.hinweis && (
                      <p className="text-sm text-stone-400">{katEintrag.hinweis}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm("Mangel entfernen (inkl. Fotos)?")) mangelEntfernen(pid, m.uid);
                    }}
                    className="shrink-0 rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    entfernen
                  </button>
                </div>

                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {/* Aktuell */}
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
                      Aktuell
                    </p>
                    <div className="space-y-2">
                      {freitext && (
                        <input
                          type="text"
                          defaultValue={m.punkt}
                          placeholder="Bezeichnung des Mangels"
                          onBlur={(e) => {
                            if (e.target.value !== m.punkt)
                              mangelAendern(pid, m.uid, { punkt: e.target.value });
                          }}
                          className={`block w-full ${INP}`}
                        />
                      )}
                      <DiktatTextarea
                        defaultValue={m.notiz}
                        rows={2}
                        placeholder="Maßnahme / Beschreibung (z. B. Wildlinge mit Wurzel entfernen)"
                        className={`block w-full ${INP}`}
                        rundeId={rundeId}
                        parzelleId={pid}
                        mangelUid={m.uid}
                        onCommit={(text) => mangelAendern(pid, m.uid, { notiz: text })}
                      />
                      <label className="text-base text-stone-600">
                        Frist
                        <input
                          type="date"
                          defaultValue={m.frist ?? ""}
                          onChange={(e) =>
                            mangelAendern(pid, m.uid, { frist: e.target.value || null })
                          }
                          className={`ml-2 ${INP}`}
                        />
                      </label>
                    </div>
                    {m.diktatNachgereicht.trim() !== "" && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 p-2 text-sm">
                        <p className="font-medium text-amber-800">Nachgereichte Diktate (offline)</p>
                        <p className="whitespace-pre-line text-stone-700">{m.diktatNachgereicht}</p>
                      </div>
                    )}
                    <FotoBereich
                      rundeId={rundeId}
                      parzelleId={pid}
                      fotos={m.fotos}
                      kontext="mangel"
                      mangelUid={m.uid}
                    />
                  </div>

                  {/* Zuletzt (Vorjahr) */}
                  {vor && (
                    <div className="rounded-lg bg-stone-50 p-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
                        Zuletzt{p.vorjahr ? ` (${p.vorjahr.datum})` : ""}
                      </p>
                      <p className="whitespace-pre-line text-base text-stone-700">{vor.notiz || "—"}</p>
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

      {/* Befund (Stufe + Bemerkung + Plakette) */}
      <section className={`${CARD} space-y-3`}>
        <h2 className="text-base font-medium text-stone-600">Befund</h2>
        <label className="block text-base">
          <span className="text-stone-600">Eskalationsstufe</span>
          <select
            // normalisieren: alter lokaler Snapshot kann noch "hinweis" enthalten —
            // ohne Abbildung matcht keine Option und ein Edit würde "neutral" speichern.
            defaultValue={normalisiereStufe(b?.stufe ?? "neutral")}
            onChange={(e) => speichereBefund(pid, { stufe: e.target.value })}
            className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-base"
          >
            {STUFEN.map((s) => (
              <option key={s.wert} value={s.wert}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="block text-base">
          <span className="text-stone-600">Allgemeine Bemerkung</span>
          <DiktatTextarea
            defaultValue={b?.notiz}
            rows={2}
            className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-base"
            rundeId={rundeId}
            parzelleId={pid}
            onCommit={(text) => speichereBefund(pid, { notiz: text })}
          />
          {(b?.diktatNachgereicht ?? "").trim() !== "" && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50/60 p-2 text-sm">
              <p className="font-medium text-amber-800">Nachgereichte Diktate (offline)</p>
              <p className="whitespace-pre-line text-stone-700">{b!.diktatNachgereicht}</p>
            </div>
          )}
        </div>

        {/* "Gut gemacht"-Plakette */}
        <div className="rounded border border-emerald-200 bg-emerald-50/60 p-3">
          <label className="flex items-center gap-2 text-base font-medium text-emerald-800">
            <input
              type="checkbox"
              checked={lob}
              onChange={(e) => {
                setLob(e.target.checked);
                speichereBefund(pid, { gutGemacht: e.target.checked });
              }}
              className="h-5 w-5"
            />
            👍 „Gut gemacht"-Plakette
          </label>
          {lob && (
            <input
              type="text"
              defaultValue={b?.plakettenNotiz}
              onBlur={(e) => speichereBefund(pid, { plakettenNotiz: e.target.value })}
              placeholder="Lob / Begründung (optional)"
              className="mt-2 block w-full rounded border border-emerald-300 px-3 py-2 text-base"
            />
          )}
        </div>

        <button onClick={() => onNavigate(null)} className={`${BTN} px-5 font-semibold`}>
          ✓ Fertig — zurück zum Plan
        </button>
      </section>

      {/* Akte (Dokumente/Archiv) ist Schreibtischarbeit -> Verwaltung (online) */}
      <p className="text-sm text-stone-400">
        📁{" "}
        <Link href={`/parzellen/${pid}`} className="text-emerald-700 hover:underline">
          Akte & Dokumente (Verwaltung, online)
        </Link>
      </p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  subscribe,
  getZustand,
  ladeWorkspace,
  aktualisiereVomServer,
  type WorkspaceZustand,
} from "@/lib/workspaceStore";
import {
  subscribe as queueSubscribe,
  getItems as queueItems,
  type QueueItem,
} from "@/lib/uploadQueue";
import {
  begehungAbschliessen,
  begehungVerlassen,
  begehungAbbrechen,
  teilnehmerAendern,
} from "../actions";
import { AbschlussButton } from "../AbschlussButton";
import { ConfirmButton } from "../ConfirmButton";
import { ParzelleAnsicht } from "./ParzelleAnsicht";

// Offline-first Begehungsmodus (Stufe 2): EINE Client-Seite für Plan-Raster und
// Parzellen-Erfassung. Daten kommen aus dem lokalen Workspace-Store (IndexedDB-
// Snapshot ⊕ ausstehende Ops) — Navigation und Erfassung funktionieren dadurch
// komplett ohne Netz; der Sync läuft im Hintergrund (MediaSync).
// Parzellen-Auswahl über den URL-Hash (#p/K12): Zurück-Geste funktioniert,
// und ein Offline-Reload (Service-Worker-Shell) landet wieder an der Stelle.

const INITIAL: WorkspaceZustand = { status: "laden", sicht: null, stand: null, veraltet: false };

const AKTUALISIERE_MS = 5 * 60 * 1000; // Abgleich für Mehr-Geräte-Betrieb

const KEINE_ITEMS: QueueItem[] = [];

// Sticky Speicher-Status für die Erfassung: bestätigt jede lokale Sicherung
// und zeigt, wie viele Einträge noch auf den Hintergrund-Sync warten.
// Schwebt über der Seite -> darf laut Flach-mit-Rand-Regel Schatten tragen.
function SaveStatus({ online }: { online: boolean }) {
  const items = useSyncExternalStore(queueSubscribe, queueItems, () => KEINE_ITEMS);
  const n = items.length;
  const ton =
    n === 0 || online
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <div className="pointer-events-none sticky bottom-3 z-10 flex justify-center">
      <span
        aria-live="polite"
        className={`rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${ton}`}
      >
        {n === 0
          ? "✓ gespeichert"
          : `✓ lokal gespeichert · ${n} ${n === 1 ? "Eintrag" : "Einträge"} ${
              online ? "wird synchronisiert…" : "warten auf Verbindung"
            }`}
      </span>
    </div>
  );
}

function hashPid(): string | null {
  if (typeof location === "undefined") return null;
  const h = decodeURIComponent(location.hash);
  return h.startsWith("#p/") ? h.slice(3) : null;
}

// Teilnehmerzeile mit Inline-Bearbeitung (jemand kommt dazu / geht) — ändert
// die laufende Runde, ohne sie zu beenden. Braucht Verbindung (Server-Aktion).
function TeilnehmerZeile({
  rundeId,
  teilnehmende,
  online,
}: {
  rundeId: number;
  teilnehmende: string;
  online: boolean;
}) {
  const [bearbeite, setBearbeite] = useState(false);
  const [wert, setWert] = useState(teilnehmende);
  const [speichert, setSpeichert] = useState(false);

  if (!bearbeite) {
    return (
      <p className="text-sm text-stone-600">
        Teilnehmer: {teilnehmende || "—"}{" "}
        <button
          onClick={() => {
            if (!online) {
              alert("Teilnehmer ändern braucht Verbindung — bitte bei Empfang erneut.");
              return;
            }
            setWert(teilnehmende);
            setBearbeite(true);
          }}
          className="ml-1 rounded px-2.5 py-1.5 text-emerald-700 hover:bg-emerald-50"
          title="Teilnehmer ändern"
        >
          ✎ ändern
        </button>
      </p>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <input
        type="text"
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        placeholder="Namen, durch Komma getrennt"
        className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
      />
      <button
        disabled={speichert}
        onClick={async () => {
          setSpeichert(true);
          try {
            await teilnehmerAendern(rundeId, wert);
            await aktualisiereVomServer(); // lokalen Snapshot nachziehen
            setBearbeite(false);
          } catch {
            alert("Speichern fehlgeschlagen — Verbindung prüfen.");
          } finally {
            setSpeichert(false);
          }
        }}
        className="rounded bg-emerald-700 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {speichert ? "…" : "✓"}
      </button>
      <button
        onClick={() => setBearbeite(false)}
        className="rounded border border-stone-300 px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
      >
        ✕
      </button>
    </span>
  );
}

export function Workspace() {
  const zustand = useSyncExternalStore(subscribe, getZustand, () => INITIAL);
  const [pid, setPid] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    ladeWorkspace();
    setPid(hashPid());
    setOnline(navigator.onLine);
    // Zurück/Vor-Geste des Browsers: hashchange UND popstate abdecken
    // (je nach Browser/History-Eintrag feuert nur eines zuverlässig).
    const onHash = () => {
      setPid(hashPid());
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onHash);
    const onOnline = () => {
      setOnline(true);
      aktualisiereVomServer();
    };
    const onOffline = () => setOnline(false);
    const onSichtbar = () => {
      if (document.visibilityState === "visible" && navigator.onLine) aktualisiereVomServer();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onSichtbar);
    const iv = setInterval(() => {
      if (navigator.onLine) aktualisiereVomServer();
    }, AKTUALISIERE_MS);
    return () => {
      window.removeEventListener("popstate", onHash);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onSichtbar);
      clearInterval(iv);
    };
  }, []);

  // Programmatische Navigation: URL setzen UND den State direkt umschalten —
  // nicht auf das hashchange-Event verlassen (das blieb beim Wechsel zurück
  // zum Plan, also auf den LEEREN Hash, in der Praxis teils aus -> die Knöpfe
  // „zurück zum Plan"/„Fertig" wirkten tot).
  const navigiere = useCallback((ziel: string | null) => {
    const url = ziel
      ? `${location.pathname}${location.search}#p/${encodeURIComponent(ziel)}`
      : `${location.pathname}${location.search}`;
    history.pushState(null, "", url);
    setPid(ziel);
    window.scrollTo(0, 0);
  }, []);

  const { status, sicht, veraltet } = zustand;

  if (status === "laden") {
    return <p className="text-base text-stone-500">Begehungsdaten werden geladen…</p>;
  }
  if (status === "loginNoetig" && !sicht) {
    return (
      <p className="text-base text-stone-600">
        Anmeldung abgelaufen —{" "}
        <Link href="/login" className="text-emerald-700 underline">
          neu anmelden
        </Link>
        .
      </p>
    );
  }
  if (status === "keineRunde") {
    return (
      <p className="text-base text-stone-600">
        Keine aktive Begehung.{" "}
        <Link href="/" className="text-emerald-700 underline">
          Zur Startseite
        </Link>{" "}
        — dort eine Begehung starten oder einer beitreten.
      </p>
    );
  }
  if (!sicht) {
    return (
      <p className="text-base text-stone-600">
        Auf diesem Gerät sind noch keine Begehungsdaten gespeichert. Bitte die Seite
        einmal MIT Empfang öffnen — danach funktioniert die Erfassung auch offline.
      </p>
    );
  }

  const offlineBanner = (!online || veraltet) && (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      📡 {online ? "Server nicht erreichbar" : "Offline"} — Eingaben werden lokal
      gespeichert und automatisch synchronisiert.
      {sicht.stand && (
        <span className="text-amber-800">
          {" "}
          Serverdaten zuletzt geladen: {new Date(sicht.stand).toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );

  // --- Parzellen-Ansicht ---
  if (pid) {
    const idx = sicht.parzellen.findIndex((p) => p.parzelleId === pid);
    const p = idx >= 0 ? sicht.parzellen[idx] : undefined;
    if (!p) {
      return (
        <div className="space-y-3">
          {offlineBanner}
          <p className="text-base text-stone-600">Parzelle „{pid}" nicht gefunden.</p>
          <button onClick={() => navigiere(null)} className="text-emerald-700 underline">
            Zurück zum Plan
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {offlineBanner}
        <ParzelleAnsicht
          key={pid}
          p={p}
          katalog={sicht.katalog}
          rundeId={sicht.runde.id}
          prev={idx > 0 ? sicht.parzellen[idx - 1].parzelleId : null}
          next={idx < sicht.parzellen.length - 1 ? sicht.parzellen[idx + 1].parzelleId : null}
          onNavigate={navigiere}
        />
        <SaveStatus online={online} />
      </div>
    );
  }

  // --- Plan / Raster ---
  const istNach = sicht.runde.art === "nachbegehung";
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const bearbeitet = sicht.parzellen.filter(
    (p) =>
      p.befund &&
      (p.befund.stufe !== "neutral" ||
        p.befund.maengel.length > 0 ||
        p.befund.notiz.trim() !== "" ||
        p.befund.gutGemacht)
  ).length;

  return (
    <div className="space-y-5">
      {offlineBanner}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{sicht.runde.bezeichnung}</h1>
          <p className="text-sm text-stone-600">
            {sicht.parzellen.length} Parzellen · {bearbeitet} bearbeitet
          </p>
          <TeilnehmerZeile
            rundeId={sicht.runde.id}
            teilnehmende={sicht.runde.teilnehmende}
            online={online}
          />
        </div>
        <Link href="/" className="shrink-0 text-sm text-emerald-700 hover:underline">
          Start
        </Link>
      </div>

      {/* Karte der Anlage (statisches Orientierungsbild) */}
      {sicht.runde.planBild ? (
        <details className="rounded-lg border border-stone-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-600">
            🗺️ Karte der Anlage anzeigen
          </summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sicht.runde.planBild}
            alt={`Plan ${sicht.runde.anlageName}`}
            className="mt-2 w-full rounded border border-stone-200"
          />
        </details>
      ) : (
        <p className="text-xs text-stone-600">
          Für {sicht.runde.anlageName} ist kein Plan hinterlegt.
        </p>
      )}

      {/* Parzellen-Raster */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-stone-600">Parzellen</h2>
        {istNach && (
          <p className="mb-2 text-sm text-stone-600">
            Nachbegehung: <span className="font-medium text-red-700">rot (!)</span> = überfällige
            Mängel, <span className="font-medium text-amber-800">gelb</span> = offene Mängel.
          </p>
        )}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {sicht.parzellen.map((p) => {
            const b = p.befund;
            const offen = p.offeneFruehere.filter((m) => !m.behoben);
            const ueberfaellig = offen.filter(
              (m) => m.frist && new Date(m.frist + "T00:00:00") < heute
            ).length;
            let farbe: string;
            if (istNach) {
              farbe = ueberfaellig
                ? "border-red-400 bg-red-50"
                : offen.length
                  ? "border-amber-400 bg-amber-50"
                  : b
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-stone-200 bg-white";
            } else {
              const aktiv = b && (b.stufe !== "neutral" || b.maengel.length > 0);
              farbe = aktiv
                ? "border-emerald-400 bg-emerald-50"
                : b
                  ? "border-stone-300 bg-stone-50"
                  : "border-stone-200 bg-white";
            }
            return (
              <button
                key={p.parzelleId}
                onClick={() => navigiere(p.parzelleId)}
                className={`rounded border px-2 py-3 text-center text-base font-medium ${farbe} hover:border-emerald-400`}
                title={istNach && offen.length ? `${offen.length} offen, ${ueberfaellig} überfällig` : undefined}
              >
                {p.parzelleId}
                {istNach && offen.length ? (
                  // "!" markiert Überfälliges zusätzlich zur Farbe (Ampel-Regel).
                  <span className={`ml-1 text-xs font-semibold ${ueberfaellig ? "text-red-700" : "text-amber-800"}`}>
                    {offen.length}
                    {ueberfaellig ? "!" : ""}
                  </span>
                ) : b && b.maengel.length > 0 ? (
                  <span className="ml-1 text-xs font-semibold text-red-700">{b.maengel.length}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Abschluss / Verlassen — brauchen Verbindung (Server-Aktionen) */}
      <div className="space-y-3 border-t border-stone-200 pt-4">
        {!online && (
          <p className="text-sm text-stone-600">
            Abschließen/Abbrechen braucht Verbindung — Erfassung funktioniert offline weiter.
          </p>
        )}
        <Link
          href={`/begehung/korrektur/${sicht.runde.id}`}
          className="inline-block rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
        >
          🪄 KI-Textkorrektur (Diktatfehler) — vor dem Abschluss empfohlen
        </Link>
        <details className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-900">
            ✔ Begehung abschließen
          </summary>
          <p className="mt-2 text-xs text-amber-800">
            Die Erfassung wird beendet und die Berichte werden erzeugt. Text-Korrekturen
            und Foto-Löschungen sind danach weiter über die Parzellenverwaltung möglich.
          </p>
          <form action={begehungAbschliessen} className="mt-2">
            <AbschlussButton rundeId={sicht.runde.id} />
          </form>
        </details>
        {/* Pausieren + Abbrechen als vollwertige Touch-Ziele (min. 44px) mit
            deutlichem Abstand — Abbrechen ist der gefährlichste Klick der App. */}
        <form action={begehungVerlassen}>
          <button className="min-h-11 rounded border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
            Begehung pausieren (zurück zum Start, ohne Abschluss)
          </button>
        </form>
        <form action={begehungAbbrechen.bind(null, sicht.runde.id)} className="pt-3">
          <ConfirmButton
            message="Begehung wirklich ABBRECHEN? Alle in dieser Begehung erfassten Daten (Befunde, Mängel, Fotos, Beete) werden gelöscht. Archiv und frühere Begehungen bleiben erhalten."
            className="min-h-11 rounded border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Begehung abbrechen (Daten verwerfen)
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}

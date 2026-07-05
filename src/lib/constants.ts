// EINZIGE Quelle der Wahrheit für erlaubte Werte der String-Auswahlfelder.
// Audit-Entscheidung: Schema-Kommentare spiegeln nur DIESE Werte.
// SQLite kennt keine Enums -> Werte als String, hier zentral mit Labels.

export const STUFEN = [
  { wert: "neutral", label: "—" },
  { wert: "ok", label: "OK / nichts zu beanstanden" },
  { wert: "gespraech", label: "Mündliches Gespräch" },
  { wert: "mitteilung", label: "Mitteilung" },
  { wert: "abmahnung_1", label: "1. Abmahnung" },
  { wert: "abmahnung_2", label: "2. Abmahnung" },
  { wert: "kuendigung", label: "Kündigung" },
] as const;
export type StufeWert = (typeof STUFEN)[number]["wert"];
export const STUFE_LABEL: Record<string, string> = {
  ...Object.fromEntries(STUFEN.map((s) => [s.wert, s.label])),
  // Alt-Wert vor Migration 2026-07 (hinweis -> mitteilung): kann noch in alten
  // IndexedDB-Snapshots offline-Clients stecken — nur Anzeige, nie speichern.
  hinweis: "Mitteilung",
};

// Alt-Wert "hinweis" auf den heutigen Wert abbilden (Migration 2026-07).
// Anwenden überall dort, wo Client-Eingaben in die DB geschrieben werden.
export const normalisiereStufe = (s: string) => (s === "hinweis" ? "mitteilung" : s);

// Symbol je Eskalationsstufe (zur schnellen visuellen Einordnung).
export const STUFE_SYMBOL: Record<string, string> = {
  neutral: "",
  ok: "✅",
  gespraech: "💬",
  mitteilung: "ℹ️",
  hinweis: "ℹ️", // Alt-Wert, s. STUFE_LABEL
  abmahnung_1: "⚠️",
  abmahnung_2: "⛔",
  kuendigung: "🛑",
};

// Nachbearbeitungs-Status je Befund (was ist nach der Begehung erfolgt?).
// Wird am Schreibtisch gepflegt — NICHT Teil der Offline-Erfassung/des Sync.
export const BEFUND_STATUS = [
  { wert: "offen", label: "offen" },
  { wert: "muendlich", label: "Mündlicher Hinweis gegeben" },
  { wert: "hinweis_versendet", label: "Hinweis versendet" },
  { wert: "abmahnung_versendet", label: "Abmahnung versendet" },
  { wert: "abmahnung_bv", label: "Abmahnung durch BV" },
  { wert: "kuendigung_paechter", label: "Kündigung durch Pächter" },
  { wert: "kuendigung_bv", label: "Kündigung durch BV" },
] as const;
export const BEFUND_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  BEFUND_STATUS.map((s) => [s.wert, s.label])
);

export const MANGEL_STATUS = [
  { wert: "offen", label: "offen" },
  { wert: "behoben", label: "behoben" },
] as const;

export const FOTO_KONTEXT = [
  { wert: "mangel", label: "Mangel" },
  { wert: "zustand", label: "Zustand" },
  { wert: "beet", label: "Beet" },
  { wert: "kompensation", label: "Kompensation" },
] as const;

// Kompensationsfaktoren: Anbau, der geringe Gemüsefläche ausgleicht (zählt zum
// 1/3-Anbau nach BKleingG). Zierpflanzen zählen NICHT (nur im Kommentar dokumentiert).
export const KOMPENSATION_FAKTOREN = [
  { wert: "obstbaeume", label: "Obstbäume" },
  { wert: "beerenobst", label: "Beerensträucher / Spalierobst" },
  { wert: "sonstiger_anbau", label: "Sonstiger Anbau (Kräuter, Hochbeete …)" },
] as const;
export type FotoKontext = (typeof FOTO_KONTEXT)[number]["wert"];

export const PARZELLE_STATUS = [
  { wert: "verpachtet", label: "verpachtet" },
  { wert: "neupaechter", label: "Neupächter" },
  { wert: "gekuendigt", label: "gekündigt" },
  { wert: "nicht_verpachtet", label: "nicht verpachtet" },
] as const;

export const RUNDE_STATUS = [
  { wert: "offen", label: "offen" },
  { wert: "abgeschlossen", label: "abgeschlossen" },
] as const;

export const DOKUMENT_TYP = [
  { wert: "schreiben", label: "Schreiben" },
  { wert: "email", label: "E-Mail" },
  { wert: "wertermittlung", label: "Wertermittlung" },
  { wert: "sonstiges", label: "Sonstiges" },
] as const;

// Teilnehmende einer Begehung: seit 2026-07 im Vorstand-Modell (DB, via
// /einstellungen pflegbar) — keine Konstante mehr.

// Arten von Verwaltungs-Ereignissen je Parzelle (Historie).
export const AENDERUNG_ART = [
  { wert: "paechterwechsel", label: "Pächterwechsel" },
  { wert: "umzug", label: "Umzug / Adresse" },
  { wert: "kontakt", label: "Kontakt geändert" },
  { wert: "status", label: "Status geändert" },
  { wert: "stammdaten", label: "Stammdaten aktualisiert" },
  { wert: "sonstiges", label: "Sonstiges" },
] as const;
export const AENDERUNG_LABEL = Object.fromEntries(
  AENDERUNG_ART.map((a) => [a.wert, a.label])
);

// Foto-Pipeline (Audit-Pflicht beim Upload)
export const FOTO_MAX_KANTE = 1600; // px (längste Kante)
export const FOTO_JPEG_QUALITAET = 75;
export const FOTO_MAX_PRO_BEFUND = 24; // Treiber: bis 24 Fotos/Parzelle

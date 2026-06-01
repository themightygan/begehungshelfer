// EINZIGE Quelle der Wahrheit für erlaubte Werte der String-Auswahlfelder.
// Audit-Entscheidung: Schema-Kommentare spiegeln nur DIESE Werte.
// SQLite kennt keine Enums -> Werte als String, hier zentral mit Labels.

export const STUFEN = [
  { wert: "neutral", label: "—" },
  { wert: "ok", label: "OK / nichts zu beanstanden" },
  { wert: "hinweis", label: "Hinweis" },
  { wert: "abmahnung_1", label: "1. Abmahnung" },
  { wert: "abmahnung_2", label: "2. Abmahnung" },
  { wert: "kuendigung", label: "Kündigung" },
] as const;
export type StufeWert = (typeof STUFEN)[number]["wert"];
export const STUFE_LABEL = Object.fromEntries(STUFEN.map((s) => [s.wert, s.label]));

// Symbol je Eskalationsstufe (zur schnellen visuellen Einordnung).
export const STUFE_SYMBOL: Record<string, string> = {
  neutral: "",
  ok: "✅",
  hinweis: "ℹ️",
  abmahnung_1: "⚠️",
  abmahnung_2: "⛔",
  kuendigung: "🛑",
};

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

// Teilnehmende einer Begehung (Vorstand, Reihenfolge = Vereinsnummerierung 1–9).
export const TEILNEHMER = [
  "Sabine Metzger",
  "Dr. Sascha Theißen",
  "Sonja Theißen",
  "Nicole Boine",
  "Erika Strack",
  "Adrian Jörissen",
  "Sadullah Ödes",
  "Günter Lorenz",
  "Dr. Ralf Riekers",
] as const;

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

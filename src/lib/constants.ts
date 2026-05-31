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

export const MANGEL_STATUS = [
  { wert: "offen", label: "offen" },
  { wert: "behoben", label: "behoben" },
] as const;

export const FOTO_KONTEXT = [
  { wert: "mangel", label: "Mangel" },
  { wert: "zustand", label: "Zustand" },
  { wert: "beet", label: "Beet" },
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

// Foto-Pipeline (Audit-Pflicht beim Upload)
export const FOTO_MAX_KANTE = 1600; // px (längste Kante)
export const FOTO_JPEG_QUALITAET = 75;
export const FOTO_MAX_PRO_BEFUND = 24; // Treiber: bis 24 Fotos/Parzelle

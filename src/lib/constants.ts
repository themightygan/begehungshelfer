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

// Text-Tinte je Eskalationsstufe (Ampel-Farbfamilien, s. DESIGN.md):
// Grün = in Ordnung, Amber = Handlungsbedarf, Rot = Kündigung.
export const STUFE_TEXTFARBE: Record<string, string> = {
  neutral: "text-stone-600",
  ok: "text-emerald-700",
  gespraech: "text-stone-700",
  mitteilung: "text-amber-800",
  hinweis: "text-amber-800", // Alt-Wert, s. STUFE_LABEL
  abmahnung_1: "text-amber-800",
  abmahnung_2: "text-amber-800",
  kuendigung: "text-red-700",
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

// Rang der Nachbearbeitungs-Status — für den "nur hochstufen"-Guard beim
// automatischen Setzen durch den Postfach-Abgleich (nie herabstufen, damit eine
// manuelle Höherstufung nicht überschrieben wird).
export const BEFUND_STATUS_RANG: Record<string, number> = {
  offen: 0,
  muendlich: 1,
  hinweis_versendet: 2,
  abmahnung_versendet: 3,
  abmahnung_bv: 4,
  kuendigung_paechter: 5,
  kuendigung_bv: 5,
};

// Klassifiziert ein Akte-Dokument (aus Notiz/Betreff/Dateiname) als versandtes
// Schreiben. Nur eindeutige Schlüsselwörter zählen -> beliebige Akte-Uploads
// (z. B. „Pachtvertrag.pdf") lösen KEINEN „versandt"-Marker am Garten aus.
// Kündigung wird optisch wie eine Abmahnung geführt (rot).
export function schreibenArt(text: string): "mitteilung" | "abmahnung" | null {
  if (/abmah|kündig|kuendig/i.test(text)) return "abmahnung";
  if (/mitteilung/i.test(text)) return "mitteilung";
  return null;
}
export const SCHREIBEN_ART_LABEL: Record<"mitteilung" | "abmahnung", string> = {
  mitteilung: "Mitteilung versandt",
  abmahnung: "Abmahnung versandt",
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

// Brief-Anrede des Pächters ("" = unbekannt -> vor Schreiben-Erstellung nachfragen)
export const PARZELLE_ANREDE = [
  { wert: "", label: "— unbekannt —" },
  { wert: "herr", label: "Herr" },
  { wert: "frau", label: "Frau" },
] as const;

// Anrede-Stil für Mitteilungen (Abmahnungen sind immer förmlich "Sie")
export const ANREDE_STIL = [
  { wert: "sie", label: "Sie (förmlich)" },
  { wert: "du", label: "Du (persönlich)" },
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

// Beet-Ampel (Gemüseanbaufläche IST/SOLL, Sascha 2026-07-11):
//   < 2/3 vom Soll  -> rot,   gilt als "zu klein" (Mitteilung/Abmahnung mahnen es an)
//   2/3 .. < 90 %   -> orange, gilt als ausreichend (kein Schreiben)
//   >= 90 %         -> grün,  ausreichend
export const BEET_AUSREICHEND = 2 / 3; // ab hier ausreichend (nicht mehr "zu klein")
export const BEET_GUT = 0.9; // ab hier grün

// Gemüse-SOLL = 1/6 der Parzellenfläche (UPV § 1/§ 12).
export const GEMUESE_ANTEIL = 1 / 6;
export const beetSoll = (groesseM2: number | null | undefined) =>
  groesseM2 ? groesseM2 * GEMUESE_ANTEIL : null;

// Wertung einer Beetfläche gegen ein SOLL — EINE Quelle für alle Anzeigen
// (Auswertung, Berichte, Workspace, Begehungsansicht).
// komp = ausdrücklich dokumentierte Kompensation durch Obst/Beeren.
// label = Anhang in der kompakten Zelle, kurz = Kurzform in Klammern,
// wort = ausgeschriebene Wertung (Erfassung/Mängelliste).
export type BeetWertung = { farbe: string; label: string; kurz: string; wort: string };
export function beetWertung(
  ist: number,
  soll: number | null,
  komp = false,
): BeetWertung {
  const ratio = soll ? ist / soll : null;
  if (komp || (ratio !== null && ratio >= BEET_GUT))
    return { farbe: "text-emerald-700", label: " ✓", kurz: "✓", wort: "erfüllt" };
  if (ratio !== null && ratio >= BEET_AUSREICHEND)
    return { farbe: "text-amber-800", label: " · ausreichend", kurz: "ausreichend", wort: "ausreichend" };
  if (ratio !== null)
    return { farbe: "text-red-700", label: " · zu klein", kurz: "zu klein", wort: "zu klein" };
  return { farbe: "text-stone-700", label: "", kurz: "", wort: "" }; // keine Fläche -> keine Wertung
}

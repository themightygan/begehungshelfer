import { STUFEN } from "@/lib/constants";

// Geteilte Auswertungs-Helfer (Auswertung + Berichte).

export type BefundLite = {
  stufe: string;
  notiz: string;
  gutGemacht: boolean;
  _count: { maengel: number; fotos: number };
  beete: unknown[];
};

// "Begutachtet" = Befund hat tatsächlich Inhalt (nicht bloß geöffnet).
export function hatDaten(b: BefundLite) {
  return (
    b.stufe !== "neutral" ||
    b._count.maengel > 0 ||
    b.beete.length > 0 ||
    b.gutGemacht ||
    b._count.fotos > 0 ||
    b.notiz.trim() !== ""
  );
}

export function summary(befunde: BefundLite[]) {
  let begutachtet = 0,
    mitMaengel = 0,
    ohneMaengel = 0,
    plaketten = 0;
  for (const b of befunde) {
    if (!hatDaten(b)) continue;
    begutachtet++;
    if (b._count.maengel > 0) mitMaengel++;
    else ohneMaengel++;
    if (b.gutGemacht) plaketten++;
  }
  return { begutachtet, mitMaengel, ohneMaengel, plaketten };
}

// Eskalations-Rang (Sortierung): Index in STUFEN; unbekannte Alt-Werte ans Ende
// der bekannten Reihenfolge ihrer Bedeutung nach ist hier egal — kommt nicht vor.
export function stufeRang(stufe: string): number {
  return STUFEN.findIndex((s) => s.wert === stufe);
}

// Merge-Regel der kombinierten Jahres-Ansicht: eine Zeile je Parzelle, der
// NEUESTE Befund MIT Daten gewinnt (älterer Befund mit Daten schlägt neueren
// leeren). Erwartet Runden absteigend nach Datum (Tiebreak id desc) sortiert.
export function neuesteBefundeJeParzelle<
  B extends BefundLite & { parzelle: { parzelleId: string } },
>(runden: { id: number; befunde: B[] }[]): { befund: B; rundeId: number }[] {
  const proParzelle = new Map<string, { befund: B; rundeId: number }>();
  for (const r of runden) {
    for (const b of r.befunde) {
      if (!hatDaten(b)) continue;
      if (!proParzelle.has(b.parzelle.parzelleId)) {
        proParzelle.set(b.parzelle.parzelleId, { befund: b, rundeId: r.id });
      }
    }
  }
  return [...proParzelle.values()];
}

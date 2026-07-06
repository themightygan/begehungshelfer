"use server";

// Sammel-Schreiben aus der Auswertung: je Parzelle der volle Prozess
// (Typ aus der Befund-Stufe, Historie-Vorschlag aus der Akte) — der Client
// ruft die Action sequenziell je ausgewählter Zeile auf (Fortschritt sichtbar,
// kein Timeout-Risiko eines Riesen-Batches). Zugriffsschutz: Middleware
// (alle Routen außer /login), wie bei allen Server Actions der App.
import type { SchreibenErgebnis } from "@/lib/schreibenErzeugen";

export async function sammelSchreiben(
  rundeId: number,
  parzelleId: string
): Promise<SchreibenErgebnis> {
  const { erzeugeUndSendeSchreiben } = await import("@/lib/schreibenErzeugen");
  return erzeugeUndSendeSchreiben({ rundeId, parzelleId });
}

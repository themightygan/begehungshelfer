// Befund je (Runde + Parzelle) sicherstellen (inkl. eingefrorenem Snapshot) und
// die befundId zurückgeben. Plain Helper (KEIN "use server"): nutzbar sowohl in
// Server Actions als auch in Route-Handlern (/api/foto, /api/notiz-append).
import { prisma } from "./db";

// Nimmt eine Runde offline nachgereichte Medien/Diktate noch an?
// Offen: ja. Abgeschlossen: 48 h Gnadenfrist ab Abschluss — die Daten sind
// während der Runde entstanden (z. B. Puffer eines zweiten Geräts im Funkloch).
// Danach bzw. Runde gelöscht: dauerhaft nein (Routen antworten 410, der Client
// legt das Item ins „hängt"-Panel statt ewig zu pollen).
const NACHREICH_FRIST_MS = 48 * 60 * 60 * 1000;
export function nimmtNachzueglerAn(runde: {
  status: string;
  abgeschlossenAm: Date | null;
}): boolean {
  if (runde.status === "offen") return true;
  return (
    runde.abgeschlossenAm !== null &&
    Date.now() - runde.abgeschlossenAm.getTime() < NACHREICH_FRIST_MS
  );
}

export async function ensureBefundFuerRunde(rundeId: number, parzelleId: string) {
  const parzelle = await prisma.parzelle.findUniqueOrThrow({ where: { parzelleId } });

  const adresse = [
    parzelle.strasse,
    [parzelle.plz, parzelle.ort].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const paechter = [parzelle.nachname, parzelle.vorname].filter(Boolean).join(" ");

  const befund = await prisma.befund.upsert({
    where: { rundeId_parzelleId: { rundeId, parzelleId: parzelle.id } },
    update: {},
    create: {
      rundeId,
      parzelleId: parzelle.id,
      snapParzelleId: parzelle.parzelleId,
      snapPaechter: paechter,
      snapAdresse: adresse,
    },
  });

  return befund.id;
}

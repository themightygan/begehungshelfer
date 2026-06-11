// Befund je (Runde + Parzelle) sicherstellen (inkl. eingefrorenem Snapshot) und
// die befundId zurückgeben. Plain Helper (KEIN "use server"): nutzbar sowohl in
// Server Actions als auch in Route-Handlern (/api/foto, /api/notiz-append).
import { prisma } from "./db";

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

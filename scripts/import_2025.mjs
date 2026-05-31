// Importiert die 2025-Begehung (aus /tmp/begehung2025.json) als abgeschlossene
// Runde je Anlage: Befund je Parzelle mit Transkript als Bemerkung + geparste
// Beetflächen (geschätzt). Idempotent (upsert Befund, Beete ersetzt).
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const rows = JSON.parse(await readFile("/tmp/begehung2025.json", "utf8"));

const anlagen = await prisma.anlage.findMany();
const anlageByKuerzel = new Map(anlagen.map((a) => [a.kuerzel, a]));
const rundeCache = new Map(); // kuerzel -> runde

let ok = 0, skip = 0;
const unbekannt = [];
for (const r of rows) {
  const kuerzel = r.parzelle[0];
  const anlage = anlageByKuerzel.get(kuerzel);
  const parzelle = await prisma.parzelle.findUnique({ where: { parzelleId: r.parzelle } });
  if (!anlage || !parzelle) { unbekannt.push(r.parzelle); continue; }

  let runde = rundeCache.get(kuerzel);
  if (!runde) {
    const bez = `Begehung 2025 – ${anlage.name}`;
    runde = await prisma.begehungsrunde.findFirst({ where: { anlageId: anlage.id, bezeichnung: bez } });
    if (!runde) {
      runde = await prisma.begehungsrunde.create({
        data: { anlageId: anlage.id, datum: new Date(r.datum), bezeichnung: bez, status: "abgeschlossen", art: "begehung" },
      });
    }
    rundeCache.set(kuerzel, runde);
  }

  const adresse = [parzelle.strasse, [parzelle.plz, parzelle.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const befund = await prisma.befund.upsert({
    where: { rundeId_parzelleId: { rundeId: runde.id, parzelleId: parzelle.id } },
    update: { notiz: r.notiz },
    create: {
      rundeId: runde.id, parzelleId: parzelle.id, notiz: r.notiz, stufe: "neutral",
      snapParzelleId: parzelle.parzelleId,
      snapPaechter: `${parzelle.nachname} ${parzelle.vorname}`.trim(),
      snapAdresse: adresse,
    },
  });
  // Beete ersetzen (idempotent)
  await prisma.beet.deleteMany({ where: { befundId: befund.id } });
  if (r.beete.length) {
    await prisma.beet.createMany({
      data: r.beete.map((m2, i) => ({ befundId: befund.id, bezeichnung: `Beet ${i + 1} (Transkript 2025)`, flaecheM2: m2 })),
    });
  }
  ok++;
}
console.log(`Fertig: ${ok} Parzellen-Befunde (2025) importiert.`);
if (unbekannt.length) console.log("Unbekannte Parzellen:", unbekannt.join(", "));
console.log("Runden:", [...rundeCache.values()].map((r) => r.bezeichnung).join(", "));
await prisma.$disconnect();

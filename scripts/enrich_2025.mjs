// Wertet die 2025-Transkripte je Parzelle per lokalem LLM (Ollama) aus:
// erkennt Plakette + ob Beanstandungen/Mängel vorlagen, und erfasst das
// (gutGemacht-Flag + ggf. ein Freitext-Mangel "Beanstandung 2025"). Idempotent.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const MODELL = "qwen2.5-coder:7b";

const runden = await prisma.begehungsrunde.findMany({ where: { bezeichnung: { contains: "Begehung 2025" } } });
const befunde = await prisma.befund.findMany({
  where: { rundeId: { in: runden.map((r) => r.id) } },
  include: { parzelle: { select: { parzelleId: true } }, _count: { select: { maengel: true } } },
});
console.log(`${befunde.length} Befunde (2025) zu analysieren…`);

async function klassifiziere(notiz) {
  const prompt =
    "Analysiere diese Notiz einer Gartenbegehung und antworte NUR als JSON mit den Feldern: " +
    '"plakette" (true wenn eine Plakette/Lob/"gut gemacht"/vorbildlich erteilt/erwähnt wurde, sonst false), ' +
    '"maengel" (true wenn Beanstandungen, Mängel oder Maßnahmen genannt sind; false wenn alles in Ordnung oder "keine Maßnahme"), ' +
    '"kurz" (kurze deutsche Zusammenfassung der Beanstandungen, max. ein Satz; leer wenn keine).\n\nNotiz:\n' + notiz;
  const r = await fetch("http://localhost:11434/api/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODELL, prompt, stream: false, format: "json", options: { temperature: 0 } }),
  });
  const j = await r.json();
  try { return JSON.parse(j.response); } catch { return { plakette: false, maengel: false, kurz: "" }; }
}

let plak = 0, mit = 0;
for (const b of befunde) {
  if (!b.notiz.trim()) continue;
  const c = await klassifiziere(b.notiz);
  await prisma.befund.update({
    where: { id: b.id },
    data: { gutGemacht: !!c.plakette, plakettenNotiz: c.plakette ? String(c.kurz || "").slice(0, 200) : "" },
  });
  if (c.plakette) plak++;
  if (c.maengel) {
    mit++;
    if (b._count.maengel === 0) {
      await prisma.mangel.create({
        data: {
          befundId: b.id, katalogId: null, bereich: "Sonstiges",
          punkt: "Beanstandung 2025 (aus Transkript)",
          notiz: String(c.kurz || "").slice(0, 500), status: "offen",
        },
      });
    }
  }
  console.log(`${b.parzelle.parzelleId}: Plakette=${!!c.plakette} Mängel=${!!c.maengel} ${c.kurz ? "– " + String(c.kurz).slice(0, 60) : ""}`);
}
console.log(`\nFertig: ${plak} Plaketten, ${mit} mit Mängeln (von ${befunde.length}).`);
await prisma.$disconnect();

// Wertet die 2025-Transkripte je Parzelle per lokalem LLM (Ollama) aus:
// erkennt Plakette + ob Beanstandungen/Mängel vorlagen, und erfasst das
// (gutGemacht-Flag + ggf. ein Freitext-Mangel "Beanstandung 2025"). Idempotent
// (setzt vorherige Anreicherung zurück und klassifiziert neu).
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const MODELL = "qwen2.5:7b-instruct";
const MANGEL_PUNKT = "Beanstandung 2025 (aus Transkript)";

const runden = await prisma.begehungsrunde.findMany({ where: { bezeichnung: { contains: "Begehung 2025" } } });
const rundeIds = runden.map((r) => r.id);

// Reset vorheriger Anreicherung
await prisma.mangel.deleteMany({ where: { befund: { rundeId: { in: rundeIds } }, punkt: MANGEL_PUNKT } });
await prisma.befund.updateMany({ where: { rundeId: { in: rundeIds } }, data: { gutGemacht: false, plakettenNotiz: "" } });

const befunde = await prisma.befund.findMany({
  where: { rundeId: { in: rundeIds } },
  include: { parzelle: { select: { parzelleId: true } }, _count: { select: { maengel: true } } },
});
console.log(`${befunde.length} Befunde (2025) – Modell ${MODELL}…`);

async function klassifiziere(notiz) {
  const prompt =
    "Du bewertest die Notiz einer Gartenbegehung. Definitionen:\n" +
    "- MANGEL = eine Beanstandung oder Auflage, die der Pächter umsetzen MUSS " +
    "(z. B. 'zu entfernen', 'Rückschnitt erforderlich', 'Hecke zu hoch', 'unzulässig', " +
    "'verunkrautet', 'Gespräch/Hinweis wegen ...'). Eine reine Beschreibung, ein Lob oder " +
    "'keine besonderen Feststellungen' / 'keine Maßnahme' ist KEIN Mangel.\n" +
    "- PLAKETTE = nur wenn ausdrücklich eine Plakette, 'gut gemacht', 'vorbildlich' oder Lob erwähnt wird.\n" +
    'Antworte NUR als JSON: {"plakette": true/false, "maengel": true/false, "kurz": "kurze Zusammenfassung der Beanstandungen, leer wenn keine"}.\n\nNotiz:\n' +
    notiz;
  const r = await fetch("http://localhost:11434/api/generate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODELL, prompt, stream: false, format: "json", options: { temperature: 0 } }),
  });
  const j = await r.json();
  try { return JSON.parse(j.response); } catch { return { plakette: false, maengel: false, kurz: "" }; }
}

// Sicherheits-Heuristik: klar korrektive Formulierungen = Mangel (gegen
// Untererfassen durch das LLM). Greift nur, wenn nicht ausdrücklich "ohne/keine
// Beanstandung" und keine reine Empfehlung ("könnte/wäre schön").
const KORREKTIV = /(erforderlich|zu entfernen|zu beseitigen|r(ü|ue)ckschnitt|fachgerechter? schnitt|schnitt fehlt|verunkraut|vernachl(ä|ae)ssigt|zu hoch|unzul(ä|ae)ssig|mangelhaft|aufgefordert|abmahnung|nicht gestattet|nicht zul(ä|ae)ssig)/i;
const KEINE = /(ohne beanstandung|keine beanstandung|keine besonderen feststellungen|nichts zu beanstanden|in ordnung)/i;

let plak = 0, mit = 0, override = 0;
for (const b of befunde) {
  if (!b.notiz.trim()) continue;
  const c = await klassifiziere(b.notiz);
  if (!c.maengel && KORREKTIV.test(b.notiz) && !KEINE.test(b.notiz)) {
    c.maengel = true;
    if (!c.kurz) c.kurz = "Korrektive Maßnahme laut Transkript (bitte prüfen)";
    override++;
  }
  await prisma.befund.update({
    where: { id: b.id },
    data: { gutGemacht: !!c.plakette, plakettenNotiz: c.plakette ? String(c.kurz || "").slice(0, 200) : "" },
  });
  if (c.plakette) plak++;
  if (c.maengel) {
    mit++;
    await prisma.mangel.create({
      data: { befundId: b.id, katalogId: null, bereich: "Sonstiges", punkt: MANGEL_PUNKT, notiz: String(c.kurz || "").slice(0, 500), status: "offen" },
    });
  }
  console.log(`${b.parzelle.parzelleId}: Plakette=${!!c.plakette} Mängel=${!!c.maengel} ${c.kurz ? "– " + String(c.kurz).slice(0, 70) : ""}`);
}
console.log(`\nFertig: ${plak} Plaketten, ${mit} mit Mängeln (von ${befunde.length}); davon ${override} per Heuristik-Override ergänzt.`);
await prisma.$disconnect();

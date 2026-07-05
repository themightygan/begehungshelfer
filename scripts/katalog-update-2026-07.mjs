// Katalog-Anpassung Juli 2026 (Vorstandsbeschluss):
//  - "Gemüseanbaufläche" -> "Gemüseanbau: Unzureichender Anbau einjähriger Gemüsekulturen"
//  - "Nicht eingehaltener Sitzplatz-Grenzabstand / Anpflanzung entgegen GO" aufgetrennt in
//    "Nicht eingehaltener Sitzplatz-Grenzabstand" + NEU "Anpflanzung entgegen GO"
//  - NEU "Mangelnde Zaunfreiheit" (Garten; GO-Ziffer noch nachzutragen)
//  - NEU "Unfallgefahr" (Sonstiges)
//  - "Laube – unerlaubte bauliche Veränderung" -> "Laube – unerlaubter Bau / bauliche Veränderung"
// Bei 1:1-Umbenennungen ziehen auch die punkt-Snapshots bestehender Mängel mit
// (Sascha 2026-07-05: alte Einträge sollen die neue Bezeichnung zeigen — gleiche
// Bedeutung, nur klarere Formulierung).
// Idempotent: Renames matchen den Alt-Text, Inserts prüfen auf Existenz,
// sortierung wird aus der kanonischen Liste komplett neu vergeben.
// Ausführen: node --env-file=.env scripts/katalog-update-2026-07.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RENAMES = [
  ["Gemüseanbaufläche", "Gemüseanbau: Unzureichender Anbau einjähriger Gemüsekulturen"],
  ["Nicht eingehaltener Sitzplatz-Grenzabstand / Anpflanzung entgegen GO", "Nicht eingehaltener Sitzplatz-Grenzabstand"],
  ["Laube – unerlaubte bauliche Veränderung", "Laube – unerlaubter Bau / bauliche Veränderung"],
];

const NEUE = [
  ["Garten", "Anpflanzung entgegen GO", "", "UPV §4.2 / GO 1.2"],
  ["Garten", "Mangelnde Zaunfreiheit", "", ""],
  ["Sonstiges", "Unfallgefahr", "", "UPV §4.1 / GO 14.1"],
];

// Kanonische Reihenfolge nach dem Update (Quelle: prisma/seed.mjs KATALOG).
const REIHENFOLGE = [
  "Gemüseanbau: Unzureichender Anbau einjähriger Gemüsekulturen",
  "Staudenrabatten",
  "Nicht eingehaltener Grenzabstand (Anpflanzung)",
  "Nicht eingehaltener Sitzplatz-Grenzabstand",
  "Anpflanzung entgegen GO",
  "Mangelnde Zaunfreiheit",
  "Vernachlässigter Pflegezustand",
  "Obstbaum-Bestand vernachlässigt",
  "Beerenobst vernachlässigt",
  "Ziergehölze vernachlässigt",
  "Wildlinge / großkronige Laubbäume entgegen GO",
  "Nadelgehölze entgegen GO",
  "Formhecken entgegen GO",
  "Nicht eingehaltener Grenzabstand",
  "Laube – falsche Farbe",
  "Laube – unerlaubter Bau / bauliche Veränderung",
  "Laube – Unfallgefahr",
  "Überschreitung zulässige Terrassen-/Sitzplatzfläche",
  "Gerätekiste",
  "Pergola",
  "Beton-Stellplatten / -Pflanzsteine",
  "Grill",
  "Kompostplatz / -behälter",
  "Hochbeet",
  "Tomatenüberdachung / Foliengewächshaus",
  "Müll auf der Parzelle gelagert",
  "Zustand anteilig zu betreuender Gemeinschaftswege / Außenrand",
  "Fehlende Umsetzung der Zusätze aus Pachtvertrag / Wertermittlung",
  "Wasserschächte in schlechtem Zustand",
  "Gartenteiche",
  "Unfallgefahr",
];

for (const [alt, neu] of RENAMES) {
  const r = await prisma.katalog.updateMany({ where: { punkt: alt }, data: { punkt: neu } });
  console.log(r.count ? `✎ umbenannt: "${alt}" → "${neu}"` : `· schon aktuell: "${neu}"`);
  // Snapshots bestehender Mängel mitziehen (nur exakter Alt-Text).
  const m = await prisma.mangel.updateMany({ where: { punkt: alt }, data: { punkt: neu } });
  if (m.count) console.log(`  ↳ ${m.count} Mangel-Snapshots aktualisiert`);
}

for (const [bereich, punkt, hinweis, referenz] of NEUE) {
  const exists = await prisma.katalog.findFirst({ where: { punkt } });
  if (exists) { console.log(`· existiert schon: "${punkt}"`); continue; }
  await prisma.katalog.create({ data: { bereich, punkt, hinweis, referenz } });
  console.log(`+ angelegt: "${punkt}" (${bereich})`);
}

// sortierung neu vergeben: kanonische Punkte nach Liste, unbekannte (später manuell
// angelegte) dahinter in bisheriger Reihenfolge.
const alle = await prisma.katalog.findMany({ orderBy: [{ sortierung: "asc" }, { id: "asc" }] });
const rang = new Map(REIHENFOLGE.map((p, i) => [p, i]));
const sortiert = [...alle].sort((a, b) => {
  const ra = rang.get(a.punkt) ?? REIHENFOLGE.length + alle.indexOf(a);
  const rb = rang.get(b.punkt) ?? REIHENFOLGE.length + alle.indexOf(b);
  return ra - rb;
});
for (let i = 0; i < sortiert.length; i++) {
  if (sortiert[i].sortierung !== i) {
    await prisma.katalog.update({ where: { id: sortiert[i].id }, data: { sortierung: i } });
  }
}
const unbekannt = alle.filter((k) => !rang.has(k.punkt)).map((k) => k.punkt);
if (unbekannt.length) console.log(`⚠ nicht in kanonischer Liste (ans Ende sortiert): ${unbekannt.join(" · ")}`);
console.log(`Katalog: ${alle.length} Punkte, Sortierung neu vergeben.`);

await prisma.$disconnect();

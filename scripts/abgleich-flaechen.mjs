// Abgleich Parzellenflächen: DB (Parzelle.groesseM2) gegen die offizielle Liste
// _quelldaten/PArzellenfläche.xlsx (Sheet "JR 2024-2025", Spalte "parzellengroesse",
// Fallback "Parzellenfläche" in ar × 100). Schlüssel: Anl. + Ga-Nr + Ind.
// Ohne Flag: Dry-Run (nur Report). Mit --fix: schreibt die Excel-Werte in die DB.
// Ausführen: node --env-file=.env scripts/abgleich-flaechen.mjs [--fix]
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const XLSX = join(__dirname, "..", "_quelldaten", "PArzellenfläche.xlsx");
const SHEET = "JR 2024-2025";
const ANLAGEN = ["K", "S"]; // nur echte Anlagen (MK u. a. ignorieren)
const fix = process.argv.includes("--fix");

const prisma = new PrismaClient();

// exceljs liefert für Formelzellen { formula, result } — Wert vereinheitlichen.
function zellwert(cell) {
  const v = cell?.value;
  if (v && typeof v === "object" && "result" in v) return v.result;
  return v;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.getWorksheet(SHEET);
if (!ws) throw new Error(`Sheet "${SHEET}" nicht gefunden.`);

// Spalten per Header-Zeile suchen (nicht hartkodieren).
const header = ws.getRow(1);
const spalte = {};
header.eachCell((cell, col) => {
  const h = String(zellwert(cell) ?? "").trim().toLowerCase();
  if (h === "anl.") spalte.anl = col;
  else if (h === "ga-nr") spalte.nr = col;
  else if (h === "ind.") spalte.ind = col;
  else if (h === "parzellengroesse") spalte.m2 = col;
  else if (h === "parzellenfläche") spalte.ar = col;
});
for (const k of ["anl", "nr", "ind", "m2"]) {
  if (!spalte[k]) throw new Error(`Spalte "${k}" nicht im Header gefunden.`);
}

// Excel einlesen: parzelleId -> m2
const excel = new Map();
ws.eachRow((row, nr) => {
  if (nr === 1) return;
  const anl = String(zellwert(row.getCell(spalte.anl)) ?? "").trim().toUpperCase();
  const gaNr = zellwert(row.getCell(spalte.nr));
  if (!ANLAGEN.includes(anl) || gaNr == null || gaNr === "") return;
  const nummer = parseInt(gaNr, 10);
  if (!Number.isInteger(nummer)) return;
  let ind = String(zellwert(row.getCell(spalte.ind)) ?? "").trim().toLowerCase();
  if (ind === "none" || ind === "-") ind = "";
  const id = `${anl}${nummer}${ind}`;

  let m2 = zellwert(row.getCell(spalte.m2));
  if (m2 == null || m2 === "") {
    const ar = zellwert(row.getCell(spalte.ar));
    m2 = ar == null || ar === "" ? null : Math.round(Number(ar) * 100);
  } else {
    m2 = Math.round(Number(m2));
  }
  if (m2 != null && Number.isNaN(m2)) m2 = null;
  if (excel.has(id)) console.warn(`⚠ Duplikat-Schlüssel in Excel: ${id} (Zeile ${nr})`);
  excel.set(id, m2);
});

// DB einlesen und vergleichen
const parzellen = await prisma.parzelle.findMany({
  select: { parzelleId: true, groesseM2: true },
  orderBy: { parzelleId: "asc" },
});
const db = new Map(parzellen.map((p) => [p.parzelleId, p.groesseM2]));

const diffs = [];       // in beiden, Wert weicht ab
const gleich = [];      // in beiden, Wert identisch
const nurDb = [];       // Parzelle nur in DB
const nurExcel = [];    // Parzelle nur in Excel
const ohneWert = [];    // Excel-Zeile ohne verwertbare Fläche

for (const [id, m2] of excel) {
  if (!db.has(id)) { nurExcel.push(id); continue; }
  if (m2 == null) { ohneWert.push(id); continue; }
  if (db.get(id) === m2) gleich.push(id);
  else diffs.push({ id, db: db.get(id), excel: m2 });
}
for (const id of db.keys()) if (!excel.has(id)) nurDb.push(id);

console.log(`Excel: ${excel.size} Parzellen · DB: ${db.size} Parzellen`);
console.log(`✓ identisch: ${gleich.length}`);
console.log(`✗ abweichend: ${diffs.length}`);
for (const d of diffs) console.log(`   ${d.id}: DB ${d.db ?? "—"} m² → Excel ${d.excel} m²`);
console.log(`nur in DB (kein Excel-Eintrag): ${nurDb.length}${nurDb.length ? " → " + nurDb.join(", ") : ""}`);
console.log(`nur in Excel (keine DB-Parzelle): ${nurExcel.length}${nurExcel.length ? " → " + nurExcel.join(", ") : ""}`);
if (ohneWert.length) console.log(`⚠ Excel ohne Flächenwert: ${ohneWert.join(", ")}`);

if (fix && diffs.length) {
  for (const d of diffs) {
    await prisma.parzelle.update({ where: { parzelleId: d.id }, data: { groesseM2: d.excel } });
  }
  console.log(`\n--fix: ${diffs.length} Parzellen aktualisiert.`);
} else if (fix) {
  console.log("\n--fix: nichts zu tun — DB entspricht bereits der Excel-Liste.");
} else if (diffs.length) {
  console.log("\nDry-Run — Übernehmen mit: node --env-file=.env scripts/abgleich-flaechen.mjs --fix");
}

await prisma.$disconnect();

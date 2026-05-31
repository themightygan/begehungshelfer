// Importiert Archivfotos früherer Begehungen als ArchivFoto (verarbeitet:
// HEIC->JPEG, resize ~1600px, EXIF/Geo-Strip). Idempotent je (Parzelle, Datum).
//
// Aufruf:
//   node --env-file=.env scripts/import_archivfotos.mjs kuehwasen "/Pfad/Kühwasen"
//   node --env-file=.env scripts/import_archivfotos.mjs silberwald "/Pfad/Silberwald" 2024-07-26
//
// kuehwasen: <Basis>/<DD.MM.YYYY ...>/<K-Parzelle>/<fotos>
// silberwald: <Basis>/<Nummer>/<fotos>  (Datum als 3. Argument, ISO)
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
// @ts-expect-error -- keine Typen
import heicConvert from "heic-convert";
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const STORAGE = resolve(process.env.STORAGE_DIR ?? "./storage");
const [, , modus, basis, fixDatum] = process.argv;
const BILD = /\.(jpe?g|png|heic|heif)$/i;

function istHeic(buf) {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  return ["heic", "heix", "heif", "hevc", "mif1", "msf1"].includes(
    buf.toString("ascii", 8, 12).toLowerCase()
  );
}
async function verarbeite(buf) {
  let e = buf;
  if (istHeic(buf)) e = Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 0.9 }));
  return sharp(e).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true }).toBuffer();
}
const normNum = (s) => String(parseInt(s, 10)); // "05" -> "5", "08" -> "8"

// gültige Parzellen-IDs
const valid = new Set((await prisma.parzelle.findMany({ select: { parzelleId: true } })).map((p) => p.parzelleId));

// Aufgaben sammeln: { parzelleId, datum(Date), quelle, dir }
const tasks = [];
if (modus === "kuehwasen") {
  for (const datumOrdner of await readdir(basis)) {
    const m = datumOrdner.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!m) continue;
    const datum = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const dpath = join(basis, datumOrdner);
    if (!(await stat(dpath)).isDirectory()) continue;
    for (const pOrdner of await readdir(dpath)) {
      const pm = pOrdner.match(/^([KS])\s*0*(\d+)([a-z]?)/i);
      if (!pm) continue;
      const pid = `${pm[1].toUpperCase()}${normNum(pm[2])}${(pm[3] || "").toLowerCase()}`;
      tasks.push({ parzelleId: pid, datum, quelle: `Begehung ${datumOrdner.replace(/\s*Begehung.*/i, "")}`.trim(), dir: join(dpath, pOrdner) });
    }
  }
} else if (modus === "silberwald") {
  // Datum = Dateidatum (mtime) der Fotos; je Parzellen-Ordner aus erstem Foto.
  for (const pOrdner of await readdir(basis)) {
    if (!/^\d+[a-z]?$/i.test(pOrdner)) continue; // nur numerische Parzellen-Ordner
    const pm = pOrdner.match(/^0*(\d+)([a-z]?)/i);
    const pid = `S${normNum(pm[1])}${(pm[2] || "").toLowerCase()}`;
    const dir = join(basis, pOrdner);
    let files;
    try { files = (await readdir(dir)).filter((f) => BILD.test(f)); } catch { continue; }
    if (!files.length) continue;
    const datum = new Date((await stat(join(dir, files[0]))).mtime);
    datum.setHours(0, 0, 0, 0);
    tasks.push({ parzelleId: pid, datum, quelle: "Begehung (Foto-Datum)", dir });
  }
} else {
  console.error("Modus: kuehwasen | silberwald"); process.exit(1);
}

let importiert = 0, ueberspr = 0, unbekannt = new Set();
for (const t of tasks) {
  if (!valid.has(t.parzelleId)) { unbekannt.add(t.parzelleId); continue; }
  const parz = await prisma.parzelle.findUnique({ where: { parzelleId: t.parzelleId }, select: { id: true } });
  // idempotent: schon Fotos für diese Parzelle+Datum?
  const exist = await prisma.archivFoto.count({ where: { parzelleId: parz.id, datum: t.datum } });
  if (exist > 0) { ueberspr++; continue; }
  let files;
  try { files = (await readdir(t.dir)).filter((f) => BILD.test(f)); } catch { continue; }
  const relDir = join("archiv", t.parzelleId);
  await mkdir(join(STORAGE, relDir), { recursive: true });
  for (const f of files) {
    try {
      const buf = await readFile(join(t.dir, f));
      const jpeg = await verarbeite(buf);
      const rel = join(relDir, `${randomUUID()}.jpg`);
      await writeFile(join(STORAGE, rel), jpeg);
      await prisma.archivFoto.create({ data: { parzelleId: parz.id, datum: t.datum, quelle: t.quelle, dateipfad: rel } });
      importiert++;
    } catch (e) { console.error(`Fehler ${join(t.dir, f)}: ${e.message}`); }
  }
  console.log(`✓ ${t.parzelleId} ${t.datum.toLocaleDateString("de-DE")}: ${files.length} Fotos`);
}
console.log(`\nFertig: ${importiert} Fotos importiert, ${ueberspr} Gruppen übersprungen (schon vorhanden).`);
if (unbekannt.size) console.log("Unbekannte Parzellen (übersprungen):", [...unbekannt].join(", "));
await prisma.$disconnect();

// Import nachgereichter Begehungsfotos (HEIC-Ordner je Parzelle) in eine Runde.
// Zuordnungsdatei (JSON) bestimmt je Bild das Ziel: Mangel / Beet / Gesamtansicht.
// Pipeline wie App-Upload: HEIC->JPEG, rotate, resize 1600px, q75, EXIF/Geo-Strip.
//
// Aufruf: node scripts/import-begehungsbilder.mjs <rundeId> <zuordnung.json> <quellordner>
// Zuordnung: { "K38": [ { "datei": "IMG_0001", "ziel": "mangel"|"beet"|"zustand", "id": 123 } ] }
//   (datei ohne Endung; "id" = mangelId bzw. beetId, bei "zustand" weglassen)
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import heicConvert from "heic-convert";

const [rundeIdArg, zuordnungPfad, quelle] = process.argv.slice(2);
const rundeId = Number(rundeIdArg);
if (!Number.isFinite(rundeId) || !zuordnungPfad || !quelle) {
  console.error("Aufruf: node scripts/import-begehungsbilder.mjs <rundeId> <zuordnung.json> <quellordner>");
  process.exit(1);
}
const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? "./storage");
const prisma = new PrismaClient();
const zuordnung = JSON.parse(readFileSync(zuordnungPfad, "utf8"));

function istHeic(buf) {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  return ["heic", "heix", "heif", "hevc", "mif1", "msf1"].includes(
    buf.toString("ascii", 8, 12).toLowerCase()
  );
}

async function verarbeite(befundId, roh) {
  const relDir = join("fotos", String(befundId));
  await mkdir(join(STORAGE_DIR, relDir), { recursive: true });
  let eingabe = roh;
  if (istHeic(roh)) {
    eingabe = Buffer.from(await heicConvert({ buffer: roh, format: "JPEG", quality: 0.92 }));
  }
  const name = `${randomUUID()}.jpg`;
  const out = await sharp(eingabe)
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
  await writeFile(join(STORAGE_DIR, relDir, name), out);
  return join(relDir, name);
}

let importiert = 0, fehler = 0;
const statistik = {};
for (const [pid, bilder] of Object.entries(zuordnung)) {
  const parzelle = await prisma.parzelle.findUnique({ where: { parzelleId: pid } });
  if (!parzelle) { console.error(`${pid}: Parzelle unbekannt`); fehler++; continue; }
  const befund = await prisma.befund.findUnique({
    where: { rundeId_parzelleId: { rundeId, parzelleId: parzelle.id } },
  });
  if (!befund) { console.error(`${pid}: kein Befund in Runde ${rundeId}`); fehler++; continue; }

  // Quelldateien (Name ohne Endung -> tatsächliche Datei)
  const dateien = readdirSync(join(quelle, pid)).filter((f) => !f.startsWith("."));
  const findeDatei = (basis) => dateien.find((f) => f.replace(/\.[^.]+$/, "") === basis);

  const stat = { mangel: 0, beet: 0, zustand: 0 };
  for (const b of bilder) {
    const datei = findeDatei(b.datei);
    if (!datei) { console.error(`${pid}/${b.datei}: Quelldatei fehlt`); fehler++; continue; }
    try {
      const roh = readFileSync(join(quelle, pid, datei));
      const pfad = await verarbeite(befund.id, roh);
      const mangelId = b.ziel === "mangel" ? Number(b.id) : null;
      const beetId = b.ziel === "beet" ? Number(b.id) : null;
      // Ziel-Validierung: Mangel/Beet muss zu DIESEM Befund gehören, sonst zustand.
      let kontext = b.ziel === "mangel" ? "mangel" : b.ziel === "beet" ? "beet" : "zustand";
      let zielMangel = null, zielBeet = null;
      if (mangelId) {
        const m = await prisma.mangel.findUnique({ where: { id: mangelId } });
        if (m && m.befundId === befund.id) zielMangel = m.id;
        else kontext = "zustand";
      }
      if (beetId) {
        const beet = await prisma.beet.findUnique({ where: { id: beetId } });
        if (beet && beet.befundId === befund.id) zielBeet = beet.id;
        else if (!zielMangel) kontext = "zustand";
      }
      await prisma.foto.create({
        data: { befundId: befund.id, mangelId: zielMangel, beetId: zielBeet, kontext, dateipfad: pfad },
      });
      stat[kontext]++;
      importiert++;
    } catch (e) {
      console.error(`${pid}/${datei}: ${String(e).slice(0, 100)}`);
      fehler++;
    }
  }
  statistik[pid] = stat;
  const gesamt = stat.mangel + stat.beet + stat.zustand;
  if (gesamt > 24) console.warn(`${pid}: ${gesamt} Fotos (über Richtwert 24)`);
  console.log(`${pid}: ${gesamt} importiert (Mangel ${stat.mangel}, Beet ${stat.beet}, Übersicht ${stat.zustand})`);
}
console.log(`\nGesamt: ${importiert} importiert, ${fehler} Fehler`);
await prisma.$disconnect();
process.exit(fehler > 0 ? 1 : 0);

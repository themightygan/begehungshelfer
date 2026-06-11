import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBefundFuerRunde, nimmtNachzueglerAn } from "@/lib/befund";
import { fotoVerarbeitenUndSpeichern } from "@/lib/storage";
import { FOTO_MAX_PRO_BEFUND } from "@/lib/constants";

// Nicht-blockierender Foto-Upload (statt Server Action): wird vom In-Page-Sync
// (MediaSync) aus dem IndexedDB-Puffer gefüttert. Verarbeitet GENAU EIN Foto je
// Request (HEIC→JPEG, resize ~1600px, EXIF/Geo-Strip via fotoVerarbeitenUndSpeichern).
//
// Antwortlogik (vom Client ausgewertet, siehe bewerte() in MediaSync):
//   2xx ok        -> Item erledigt, aus Queue entfernen
//   410           -> dauerhaft unzustellbar (Runde gelöscht / Gnadenfrist vorbei)
//                    -> Client legt das Item ins „hängt"-Panel (sichern/verwerfen)
//   5xx           -> Serverfehler -> Item bleibt gepuffert (mit Backoff/Cap im Client)
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const rundeId = Number(fd.get("rundeId"));
    const parzelleId = String(fd.get("parzelleId") ?? "");
    const kontext = String(fd.get("kontext") ?? "zustand");
    const mangelId = fd.get("mangelId") ? Number(fd.get("mangelId")) : null;
    const beetId = fd.get("beetId") ? Number(fd.get("beetId")) : null;
    // Stufe 2: Referenz über Client-UUID (auch für offline angelegte Mängel/Beete)
    const mangelUid = fd.get("mangelUid") ? String(fd.get("mangelUid")) : null;
    const beetUid = fd.get("beetUid") ? String(fd.get("beetUid")) : null;
    const foto = fd.get("foto");

    if (!Number.isFinite(rundeId) || !parzelleId || !(foto instanceof File) || foto.size === 0) {
      return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }

    // Das Foto gehört zur Runde aus dem Enqueue-Zeitpunkt — nie (falsch) einer
    // anderen Begehung zuordnen. Offen oder innerhalb der 48-h-Gnadenfrist: ok.
    const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
    if (!runde || !nimmtNachzueglerAn(runde)) {
      return Response.json({ error: "Begehung nicht (mehr) verfügbar" }, { status: 410 });
    }

    const befundId = await ensureBefundFuerRunde(rundeId, parzelleId);

    // Ziel-Mangel/-Beet auflösen (uid bevorzugt, Server-ID für Alt-Items) —
    // kann inzwischen gelöscht sein (z. B. durch zweiten Nutzer): Foto NICHT
    // verlieren, sondern als Gesamtansicht am Befund ablegen.
    let zielMangelId = mangelId;
    let zielBeetId = beetId;
    let zielKontext = kontext;
    if (mangelUid) {
      const m = await prisma.mangel.findUnique({ where: { uid: mangelUid } });
      zielMangelId = m?.id ?? null;
    } else if (zielMangelId != null && !(await prisma.mangel.findUnique({ where: { id: zielMangelId } }))) {
      zielMangelId = null;
    }
    if (beetUid) {
      const beet = await prisma.beet.findUnique({ where: { uid: beetUid } });
      zielBeetId = beet?.id ?? null;
    } else if (zielBeetId != null && !(await prisma.beet.findUnique({ where: { id: zielBeetId } }))) {
      zielBeetId = null;
    }
    if ((mangelUid || mangelId) && zielMangelId === null) zielKontext = "zustand";
    if ((beetUid || beetId) && zielBeetId === null) zielKontext = "zustand";

    // Foto-Limit je Befund (Audit). Erreicht -> als erledigt quittieren (kein
    // endloses Retry); 24 ist großzügig.
    const vorhanden = await prisma.foto.count({ where: { befundId } });
    if (vorhanden >= FOTO_MAX_PRO_BEFUND) {
      return Response.json({ skipped: true, grund: "Foto-Limit erreicht" });
    }

    const buf = Buffer.from(await foto.arrayBuffer());
    const pfad = await fotoVerarbeitenUndSpeichern(befundId, buf);
    const created = await prisma.foto.create({
      data: { befundId, mangelId: zielMangelId, beetId: zielBeetId, kontext: zielKontext, dateipfad: pfad },
    });

    // kontext zurückmelden: bei „gerettetem" Foto (Ziel gelöscht -> zustand)
    // sortiert der Client es lokal in die richtige Liste ein.
    return Response.json({ id: created.id, dateipfad: pfad, kontext: zielKontext });
  } catch (e) {
    return Response.json({ error: "Verarbeitung fehlgeschlagen", detail: String(e) }, { status: 500 });
  }
}

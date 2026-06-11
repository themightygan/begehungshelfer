import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBefundFuerRunde } from "@/lib/befund";
import { fotoVerarbeitenUndSpeichern } from "@/lib/storage";
import { FOTO_MAX_PRO_BEFUND } from "@/lib/constants";

// Nicht-blockierender Foto-Upload (statt Server Action): wird vom In-Page-Sync
// (MediaSync) aus dem IndexedDB-Puffer gefüttert. Verarbeitet GENAU EIN Foto je
// Request (HEIC→JPEG, resize ~1600px, EXIF/Geo-Strip via fotoVerarbeitenUndSpeichern).
//
// Antwortlogik (vom Client ausgewertet):
//   2xx ok        -> Item erledigt, aus Queue entfernen
//   409           -> Begehung nicht (mehr) offen -> Item bleibt gepuffert
//   5xx           -> Serverfehler -> Item bleibt gepuffert (mit Backoff/Cap im Client)
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const rundeId = Number(fd.get("rundeId"));
    const parzelleId = String(fd.get("parzelleId") ?? "");
    const kontext = String(fd.get("kontext") ?? "zustand");
    const mangelId = fd.get("mangelId") ? Number(fd.get("mangelId")) : null;
    const beetId = fd.get("beetId") ? Number(fd.get("beetId")) : null;
    const foto = fd.get("foto");

    if (!Number.isFinite(rundeId) || !parzelleId || !(foto instanceof File) || foto.size === 0) {
      return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }

    // Die Runde aus dem Enqueue-Zeitpunkt muss noch OFFEN sein — sonst NICHT
    // (falsch) einer inzwischen anderen/aktuellen Begehung zuordnen.
    const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
    if (!runde || runde.status !== "offen") {
      return Response.json({ error: "Begehung nicht offen" }, { status: 409 });
    }

    const befundId = await ensureBefundFuerRunde(rundeId, parzelleId);

    // Foto-Limit je Befund (Audit). Erreicht -> als erledigt quittieren (kein
    // endloses Retry); 24 ist großzügig.
    const vorhanden = await prisma.foto.count({ where: { befundId } });
    if (vorhanden >= FOTO_MAX_PRO_BEFUND) {
      return Response.json({ skipped: true, grund: "Foto-Limit erreicht" });
    }

    const buf = Buffer.from(await foto.arrayBuffer());
    const pfad = await fotoVerarbeitenUndSpeichern(befundId, buf);
    const created = await prisma.foto.create({
      data: { befundId, mangelId, beetId, kontext, dateipfad: pfad },
    });

    return Response.json({ id: created.id, dateipfad: pfad });
  } catch (e) {
    return Response.json({ error: "Verarbeitung fehlgeschlagen", detail: String(e) }, { status: 500 });
  }
}

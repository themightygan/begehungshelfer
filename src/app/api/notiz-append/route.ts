import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBefundFuerRunde, nimmtNachzueglerAn } from "@/lib/befund";

// Hängt einen offline nachgereichten (transkribierten) Diktat-Text an das
// append-only Feld `diktatNachgereicht` an — am Mangel (mangelId) oder sonst am
// Befund. Dieses Feld wird vom normalen Speichern NIE überschrieben (kein Clobber);
// die Seite zeigt es read-only unter „Nachgereichte Diktate".
//
// Der Append passiert ATOMAR in SQL (kein Read-Modify-Write) — zwei Geräte, die
// gleichzeitig Diktate für dieselbe Stelle nachreichen, verlieren so nichts.
//
// Antwortlogik wie /api/foto: 2xx erledigt; 410 dauerhaft unzustellbar (Runde
// gelöscht / 48-h-Gnadenfrist vorbei); 5xx -> Client puffert weiter.

async function appendMangel(mangelId: number, text: string) {
  await prisma.$executeRaw`
    UPDATE "Mangel"
    SET "diktatNachgereicht" = CASE
      WHEN "diktatNachgereicht" = '' THEN ${text}
      ELSE "diktatNachgereicht" || char(10) || ${text}
    END
    WHERE "id" = ${mangelId}`;
}

async function appendBefund(befundId: number, text: string) {
  await prisma.$executeRaw`
    UPDATE "Befund"
    SET "diktatNachgereicht" = CASE
      WHEN "diktatNachgereicht" = '' THEN ${text}
      ELSE "diktatNachgereicht" || char(10) || ${text}
    END
    WHERE "id" = ${befundId}`;
}

export async function POST(req: NextRequest) {
  try {
    const { rundeId, parzelleId, mangelId, mangelUid, text } = await req.json();
    const t = String(text ?? "").trim();
    if (!t) return Response.json({ ok: true }); // nichts anzuhängen -> erledigt

    if (mangelId != null || mangelUid) {
      const m = await prisma.mangel.findUnique({
        where: mangelUid ? { uid: String(mangelUid) } : { id: Number(mangelId) },
        include: { befund: { include: { runde: true } } },
      });
      if (!m) return Response.json({ ok: true }); // Mangel inzwischen weg -> verwerfen
      if (!nimmtNachzueglerAn(m.befund.runde)) {
        return Response.json({ error: "Begehung nicht (mehr) verfügbar" }, { status: 410 });
      }
      await appendMangel(m.id, t);
      return Response.json({ ok: true });
    }

    if (!Number.isFinite(Number(rundeId)) || !parzelleId) {
      return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    const runde = await prisma.begehungsrunde.findUnique({ where: { id: Number(rundeId) } });
    if (!runde || !nimmtNachzueglerAn(runde)) {
      return Response.json({ error: "Begehung nicht (mehr) verfügbar" }, { status: 410 });
    }
    const befundId = await ensureBefundFuerRunde(Number(rundeId), String(parzelleId));
    await appendBefund(befundId, t);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "Anhängen fehlgeschlagen", detail: String(e) }, { status: 500 });
  }
}

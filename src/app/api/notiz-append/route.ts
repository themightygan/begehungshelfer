import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBefundFuerRunde } from "@/lib/befund";

// Hängt einen offline nachgereichten (transkribierten) Diktat-Text an das
// append-only Feld `diktatNachgereicht` an — am Mangel (mangelId) oder sonst am
// Befund. Dieses Feld wird vom normalen Speichern NIE überschrieben (kein Clobber);
// die Seite zeigt es read-only unter „Nachgereichte Diktate".
export async function POST(req: NextRequest) {
  try {
    const { rundeId, parzelleId, mangelId, text } = await req.json();
    const t = String(text ?? "").trim();
    if (!t) return Response.json({ ok: true }); // nichts anzuhängen -> erledigt

    if (mangelId != null) {
      const m = await prisma.mangel.findUnique({ where: { id: Number(mangelId) } });
      if (!m) return Response.json({ ok: true }); // Mangel inzwischen weg -> verwerfen
      await prisma.mangel.update({
        where: { id: m.id },
        data: { diktatNachgereicht: m.diktatNachgereicht ? `${m.diktatNachgereicht}\n${t}` : t },
      });
      return Response.json({ ok: true });
    }

    if (!Number.isFinite(Number(rundeId)) || !parzelleId) {
      return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    const runde = await prisma.begehungsrunde.findUnique({ where: { id: Number(rundeId) } });
    if (!runde || runde.status !== "offen") {
      return Response.json({ error: "Begehung nicht offen" }, { status: 409 });
    }
    const befundId = await ensureBefundFuerRunde(Number(rundeId), String(parzelleId));
    const b = await prisma.befund.findUniqueOrThrow({ where: { id: befundId } });
    await prisma.befund.update({
      where: { id: befundId },
      data: { diktatNachgereicht: b.diktatNachgereicht ? `${b.diktatNachgereicht}\n${t}` : t },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "Anhängen fehlgeschlagen", detail: String(e) }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBefundFuerRunde, nimmtNachzueglerAn } from "@/lib/befund";
import { normalisiereStufe } from "@/lib/constants";
import type { SyncOp } from "@/lib/workspaceTypes";

// Wendet GENAU EINE Änderungs-Op aus der Offline-Outbox an (Stufe 2).
// Alle Ops sind idempotent (Upsert/DeleteMany über Client-UUID, absolute Werte
// statt Toggles) — Wiederholungen nach Netzabbrüchen sind dadurch harmlos.
//
// Antwortlogik wie /api/foto: 2xx erledigt; 410 dauerhaft unzustellbar (Runde
// gelöscht / 48-h-Gnadenfrist vorbei); 5xx -> Client puffert weiter.
//
// Ausnahme behobenToggle: wirkt bewusst auf Mängel ALTER Runden
// (Nachverfolgung beim Abgehen) — dafür gilt der Runden-Check nicht.

const zahl = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export async function POST(req: NextRequest) {
  try {
    const { rundeId, parzelleId, op } = (await req.json()) as {
      rundeId: number;
      parzelleId: string;
      op: SyncOp;
    };
    if (!op?.art) return Response.json({ error: "Ungültige Op" }, { status: 400 });

    // --- Ops ohne Runden-Bindung ---
    if (op.art === "behobenToggle") {
      await prisma.mangel.updateMany({
        where: { uid: String(op.uid) },
        data: op.behoben
          ? { status: "behoben", behobenAm: new Date() }
          : { status: "offen", behobenAm: null },
      });
      return Response.json({ ok: true });
    }

    if (op.art === "fotoLoeschen") {
      const f = await prisma.foto.findUnique({
        where: { id: Number(op.fotoId) },
        include: { befund: { include: { runde: true } } },
      });
      if (!f) return Response.json({ ok: true }); // schon weg -> idempotent
      if (!nimmtNachzueglerAn(f.befund.runde)) {
        return Response.json({ error: "Begehung nicht (mehr) verfügbar" }, { status: 410 });
      }
      await prisma.foto.delete({ where: { id: f.id } });
      return Response.json({ ok: true });
    }

    // --- Runden-gebundene Ops ---
    if (!Number.isFinite(Number(rundeId)) || !parzelleId) {
      return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    const runde = await prisma.begehungsrunde.findUnique({ where: { id: Number(rundeId) } });
    if (!runde || !nimmtNachzueglerAn(runde)) {
      return Response.json({ error: "Begehung nicht (mehr) verfügbar" }, { status: 410 });
    }
    const befundId = await ensureBefundFuerRunde(Number(rundeId), String(parzelleId));

    switch (op.art) {
      case "befund":
        await prisma.befund.update({
          where: { id: befundId },
          data: {
            // normalisieren: Altclients (Snapshot/Queue vor Migration 2026-07)
            // können noch "hinweis" senden.
            stufe: normalisiereStufe(String(op.stufe || "neutral")),
            notiz: String(op.notiz ?? ""),
            gutGemacht: Boolean(op.gutGemacht),
            plakettenNotiz: op.gutGemacht ? String(op.plakettenNotiz ?? "") : "",
          },
        });
        break;

      case "kompensation":
        await prisma.befund.update({
          where: { id: befundId },
          data: {
            kompObstAnzahl: Math.round(zahl(op.obstAnzahl)),
            kompObstFlaecheM2: zahl(op.obstFlaecheM2),
            kompBeerenAnzahl: Math.round(zahl(op.beerenAnzahl)),
            kompBeerenFlaecheM2: zahl(op.beerenFlaecheM2),
            kompensationNotiz: String(op.notiz ?? ""),
            kompensationAusreichend: Boolean(op.ausreichend),
          },
        });
        break;

      case "mangelUpsert": {
        // Katalogpunkt kann inzwischen entfallen sein -> Freitext-Snapshot
        // (bereich/punkt) trägt die Information weiter.
        let katalogId = op.katalogId != null ? Number(op.katalogId) : null;
        if (katalogId != null) {
          const k = await prisma.katalog.findUnique({ where: { id: katalogId } });
          if (!k) katalogId = null;
        }
        const daten = {
          punkt: String(op.punkt ?? ""),
          notiz: String(op.notiz ?? ""),
          frist: op.frist ? new Date(String(op.frist)) : null,
        };
        await prisma.mangel.upsert({
          where: { uid: String(op.uid) },
          update: daten,
          create: {
            uid: String(op.uid),
            befundId,
            katalogId,
            bereich: String(op.bereich ?? "Sonstiges"),
            ...daten,
          },
        });
        break;
      }

      case "mangelLoeschen":
        await prisma.mangel.deleteMany({ where: { uid: String(op.uid) } });
        break;

      case "beetUpsert": {
        const daten = {
          bezeichnung: String(op.bezeichnung ?? ""),
          flaecheM2: zahl(op.flaecheM2),
        };
        await prisma.beet.upsert({
          where: { uid: String(op.uid) },
          update: daten,
          create: { uid: String(op.uid), befundId, ...daten },
        });
        break;
      }

      case "beetLoeschen":
        await prisma.beet.deleteMany({ where: { uid: String(op.uid) } });
        break;

      default:
        return Response.json({ error: "Unbekannte Op" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "Sync fehlgeschlagen", detail: String(e) }, { status: 500 });
  }
}

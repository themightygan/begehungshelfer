import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  bemerkungPruefen,
  findingAlsMangel,
  markiereGeprueft,
  sammleBemerkungsBefunde,
} from "@/lib/bemerkung";

// Bemerkungs-Prüfung (Review-Workflow, Cloudflare-Timeout-sicher):
//   GET  ?rundeId=58[&nur=ungeprueft]        -> prüfbare Befunde (mit Bemerkung)
//   POST {aktion:"pruefen", befundId, notiz, vorhandeneMaengel} -> KI-Findings
//   POST {aktion:"anwenden", befundId, baustein, text}          -> Mangel anlegen
//   POST {aktion:"geprueft", befundId}                          -> als geprüft markieren
// Der Client orchestriert Befund für Befund — kein langer Request, Fortschritt sichtbar.

export async function GET(req: NextRequest) {
  const rundeId = Number(req.nextUrl.searchParams.get("rundeId"));
  if (!Number.isFinite(rundeId)) {
    return Response.json({ error: "rundeId fehlt" }, { status: 400 });
  }
  const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
  if (!runde) return Response.json({ error: "Runde nicht gefunden" }, { status: 404 });
  const nurUngeprueft = req.nextUrl.searchParams.get("nur") === "ungeprueft";
  const befunde = await sammleBemerkungsBefunde(rundeId, nurUngeprueft);
  return Response.json({ runde: { id: runde.id, bezeichnung: runde.bezeichnung }, befunde });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { aktion } = body;
    if (aktion === "pruefen") {
      const findings = await bemerkungPruefen(
        String(body.notiz ?? ""),
        Array.isArray(body.vorhandeneMaengel) ? body.vorhandeneMaengel.map(String) : []
      );
      return Response.json({ findings });
    }
    if (aktion === "anwenden") {
      const befundId = Number(body.befundId);
      if (!Number.isFinite(befundId)) {
        return Response.json({ error: "befundId fehlt" }, { status: 400 });
      }
      const r = await findingAlsMangel(
        befundId,
        String(body.baustein ?? "FREITEXT"),
        String(body.text ?? "")
      );
      return r.ok
        ? Response.json({ ok: true, mangelId: r.mangelId })
        : Response.json({ error: "Befund nicht gefunden" }, { status: 400 });
    }
    if (aktion === "geprueft") {
      const befundId = Number(body.befundId);
      if (!Number.isFinite(befundId)) {
        return Response.json({ error: "befundId fehlt" }, { status: 400 });
      }
      await markiereGeprueft(befundId);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: "Prüfung fehlgeschlagen", detail: String(e) }, { status: 500 });
  }
}

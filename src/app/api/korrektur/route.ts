import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { korrigiereText, sammleKorrekturFelder, wendeKorrekturAn } from "@/lib/korrektur";

// KI-Textkorrektur (Review-Workflow, Cloudflare-Timeout-sicher):
//   GET  ?rundeId=58                  -> Liste der korrigierbaren Felder
//   POST {aktion:"pruefen",  text}    -> EIN Ollama-Vorschlag (kurzer Request)
//   POST {aktion:"anwenden", schluessel, text} -> Feld schreiben (vom Menschen bestätigt)
// Der Client orchestriert Feld für Feld — kein langer Request, Fortschritt sichtbar.

export async function GET(req: NextRequest) {
  const rundeId = Number(req.nextUrl.searchParams.get("rundeId"));
  if (!Number.isFinite(rundeId)) {
    return Response.json({ error: "rundeId fehlt" }, { status: 400 });
  }
  const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
  if (!runde) return Response.json({ error: "Runde nicht gefunden" }, { status: 404 });
  const felder = await sammleKorrekturFelder(rundeId);
  return Response.json({ runde: { id: runde.id, bezeichnung: runde.bezeichnung }, felder });
}

export async function POST(req: NextRequest) {
  try {
    const { aktion, text, schluessel } = await req.json();
    if (aktion === "pruefen") {
      const vorschlag = await korrigiereText(String(text ?? ""));
      return Response.json({ vorschlag });
    }
    if (aktion === "anwenden") {
      const ok = await wendeKorrekturAn(String(schluessel ?? ""), String(text ?? ""));
      return ok
        ? Response.json({ ok: true })
        : Response.json({ error: "Unbekanntes Feld" }, { status: 400 });
    }
    return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: "Korrektur fehlgeschlagen", detail: String(e) }, { status: 500 });
  }
}

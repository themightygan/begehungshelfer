// Bemerkungs-Prüfung: die allgemeine Freitext-Bemerkung eines Befunds
// (Befund.notiz) per lokalem Ollama (qwen3:14b) auf enthaltene ECHTE Mängel
// prüfen. Ergebnis sind Vorschläge (Baustein-Zuordnung bzw. Freitext), die im
// HITL-Review freigegeben und dann zu Mangel-Zeilen werden. Nichts wird ohne
// Bestätigung geschrieben. Muster wie bausteinZuordnen (schreibenErzeugen.ts),
// aber MEHRERE Findings. Rechtliches bleibt Code — die KI ordnet nur zu.
import { prisma } from "./db";
import { BAUSTEINE, KATALOG_ZU_BAUSTEIN } from "./bausteine";

// Baustein-Bereich (1/2/3) -> Snapshot-String (Mangel.bereich, kein DB-Default).
export const BEREICH_TEXT: Record<number, string> = {
  1: "Garten",
  2: "Baulichkeiten und Nebenanlagen",
  3: "Sonstiges",
};

export type BemerkungFinding = {
  baustein: string; // Baustein-ID oder "FREITEXT"
  text: string; // kurze Beschreibung des Mangels (editierbar im Review)
};

// Eine Bemerkung analysieren. Bereits erfasste Mängel (punkt-Snapshots) werden
// mitgegeben, damit die KI sie nicht erneut vorschlägt. Fehler/Timeout -> [].
export async function bemerkungPruefen(
  notiz: string,
  vorhandeneMaengel: string[] = []
): Promise<BemerkungFinding[]> {
  const text = notiz.trim();
  if (text.length < 8) return [];

  const katalog = BAUSTEINE.map((b) => `${b.id} ${b.label}`).join("\n");
  const bereitsErfasst = vorhandeneMaengel.filter((m) => m.trim()).length
    ? `\nBEREITS ERFASSTE MÄNGEL (NICHT erneut vorschlagen):\n${vorhandeneMaengel
        .filter((m) => m.trim())
        .map((m) => `- ${m.trim()}`)
        .join("\n")}\n`
    : "";

  const prompt = `Du prüfst eine Freitext-Bemerkung aus einer Kleingarten-Begehung darauf, ob darin ECHTE Beanstandungen (Mängel/Verstöße) stecken, die als Mangel-Position erfasst werden sollten.

KATALOG (mögliche Bausteine):
${katalog}
FREITEXT falls kein Baustein fachlich passt
${bereitsErfasst}
REGELN:
- Extrahiere NUR echte Beanstandungen (Verstöße gegen Unterpachtvertrag/Gartenordnung, Pflegemängel, unzulässige Baulichkeiten, Müll, Gefahren o. ä.).
- IGNORIERE Lob, neutrale/positive Zustandsbeschreibungen ("gepflegt", "in Ordnung", "schön"), bereits erledigte Punkte und reine Verwaltungsnotizen.
- IGNORIERE Punkte, die bereits als Mangel erfasst sind (siehe Liste oben).
- Im Zweifel WEGLASSEN (lieber zu wenig als zu viel).
- Ordne jeder Beanstandung die fachlich beste Baustein-ID zu; passt keine, nimm "FREITEXT".
- "text" ist eine kurze, sachliche Beschreibung des konkreten Befunds (aus der Bemerkung), keine Aufforderung.

Antworte NUR mit JSON:
{"findings": [{"baustein": "G06", "text": "..."}]}
Leeres Array {"findings": []} ist zulässig.

BEMERKUNG: ${text}
JSON:`;

  try {
    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:14b",
        prompt,
        stream: false,
        format: "json",
        think: false,
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { response?: string };
    const parsed = JSON.parse(j.response ?? "{}") as { findings?: unknown };
    if (!Array.isArray(parsed.findings)) return [];

    const out: BemerkungFinding[] = [];
    for (const f of parsed.findings) {
      if (!f || typeof f !== "object") continue;
      const rohText = String((f as { text?: unknown }).text ?? "").trim();
      if (!rohText) continue;
      const rohId = String((f as { baustein?: unknown }).baustein ?? "").trim().slice(0, 4);
      const gueltig = BAUSTEINE.some((b) => b.id === rohId);
      out.push({ baustein: gueltig ? rohId : "FREITEXT", text: rohText });
    }
    return out;
  } catch {
    return []; // Ollama nicht erreichbar/zu langsam
  }
}

// Katalogpunkt-Name für eine Baustein-ID (umgekehrtes KATALOG_ZU_BAUSTEIN);
// null, wenn der Baustein keinen aktiven Katalogpunkt hat (dann Freitext-Mangel).
function katalogPunktZuBaustein(bausteinId: string): string | null {
  for (const [punkt, id] of Object.entries(KATALOG_ZU_BAUSTEIN)) {
    if (id === bausteinId) return punkt;
  }
  return null;
}

// Ein freigegebenes Finding zu einer Mangel-Zeile machen. bereich ist PFLICHT
// (kein DB-Default) -> immer aus Katalog bzw. Baustein-Bereich setzen.
// Muster: mangelHinzufuegenNachtraeglich. uid NICHT setzen (Prisma @default(uuid())).
export async function findingAlsMangel(
  befundId: number,
  bausteinId: string,
  text: string
): Promise<{ ok: boolean; mangelId?: number }> {
  const befund = await prisma.befund.findUnique({ where: { id: befundId } });
  if (!befund) return { ok: false };

  const baustein = BAUSTEINE.find((b) => b.id === bausteinId) ?? null;
  const punktName = baustein ? katalogPunktZuBaustein(baustein.id) : null;
  const katalog = punktName
    ? await prisma.katalog.findFirst({ where: { punkt: punktName, aktiv: true } })
    : null;

  const bereich = katalog?.bereich ?? (baustein ? BEREICH_TEXT[baustein.bereich] : "Sonstiges");
  const punkt = katalog?.punkt ?? (baustein ? baustein.label : text.slice(0, 120));

  const mangel = await prisma.mangel.create({
    data: {
      befundId,
      katalogId: katalog?.id ?? null,
      bereich,
      punkt,
      notiz: text,
    },
  });
  return { ok: true, mangelId: mangel.id };
}

// --- Prüfbare Befunde einer Runde (für die Review-Seite) ---

export type BemerkungBefund = {
  befundId: number;
  parzelleId: string;
  notiz: string;
  geprueft: boolean;
  vorhandeneMaengel: string[]; // punkt-Snapshots (für Prompt)
  vorhandeneBausteine: string[]; // Baustein-IDs bereits erfasster Mängel (Dubletten-Marker)
};

export async function sammleBemerkungsBefunde(
  rundeId: number,
  nurUngeprueft = false
): Promise<BemerkungBefund[]> {
  const befunde = await prisma.befund.findMany({
    where: { rundeId },
    include: {
      parzelle: { select: { parzelleId: true } },
      maengel: { orderBy: { id: "asc" } },
    },
    orderBy: { parzelle: { nummer: "asc" } },
  });

  return befunde
    .filter((b) => b.notiz.trim().length >= 8)
    .filter((b) => (nurUngeprueft ? !b.bemerkungGeprueft : true))
    .map((b) => ({
      befundId: b.id,
      parzelleId: b.parzelle.parzelleId,
      notiz: b.notiz,
      geprueft: b.bemerkungGeprueft,
      vorhandeneMaengel: b.maengel.map((m) => m.punkt).filter(Boolean),
      vorhandeneBausteine: [
        ...new Set(
          b.maengel.map((m) => KATALOG_ZU_BAUSTEIN[m.punkt]).filter((id): id is string => !!id)
        ),
      ],
    }));
}

// Befund als „Bemerkung geprüft" markieren.
export async function markiereGeprueft(befundId: number): Promise<boolean> {
  await prisma.befund.updateMany({
    where: { id: befundId },
    data: { bemerkungGeprueft: true },
  });
  return true;
}

// KI-Korrektur diktierter Texte (lokales Ollama, Datensouveränität).
// Korrigiert NUR Spracherkennungsfehler + Zeichensetzung — niemals Inhalt.
// Mehrstufige Absicherung:
//  1. strenger Few-Shot-Prompt mit Kleingarten-Fachvokabular,
//  2. harte Guards (Zahlen/Daten müssen identisch bleiben, keine Kürzung),
//  3. menschliches Diff-Review in der UI (nichts wird ungefragt geschrieben).
import { prisma } from "./db";

// 14b liefert deutlich präzisere Korrekturen; 7b als Fallback (Transkript-Glättung).
const MODELLE = ["qwen3:14b", "qwen2.5:7b-instruct"];

const PROMPT_KOPF = `Du korrigierst Spracherkennungsfehler (Diktat) in Notizen einer Kleingarten-Begehung.
REGELN:
1. Ersetze NUR offensichtlich falsch erkannte Wörter durch das im Kontext gemeinte Wort (klingt ähnlich!).
2. Korrigiere Zeichensetzung und Groß-/Kleinschreibung.
3. ÄNDERE SONST NICHTS: kein Umformulieren, kein Ersetzen korrekter Wörter durch Synonyme, keine Ergänzungen, keine Kürzungen. Maße, Daten, Fristen, Namen von Pflanzen bleiben exakt.
4. Im Zweifel: Wort UNVERÄNDERT lassen.
5. Gib NUR den Text aus, ohne Anführungszeichen oder Kommentar.
Typisches Fachvokabular: Beerenobst, Spalierobst, Wiesenteil, Gemüsebeet, Gemüsekulturen, kleingärtnerische Nutzung, Hinweis geben, Laube, Parzelle, Hecke, Kompost, Zierpflanzen, Obstgehölze, Wertermittlung, Unterpachtvertrag, Gartenordnung, Abstandsfläche, Pergola, Nachbegehung.

BEISPIELE:
Eingabe: Im hinteren Bereich wird Bärenobst angebaut.
Ausgabe: Im hinteren Bereich wird Beerenobst angebaut.
Eingabe: Die Hecke ist circa 1,80 m hoch und vor allem zu breit.
Ausgabe: Die Hecke ist circa 1,80 m hoch und vor allem zu breit.
Eingabe: Hinaus geben, dass die Fläche zu vergrößern ist.
Ausgabe: Hinweis geben, dass die Fläche zu vergrößern ist.
Eingabe: Der Rasen ist gepflegt, die Beete ordentlich.
Ausgabe: Der Rasen ist gepflegt, die Beete ordentlich.

Eingabe: `;

// Ziffernfolgen als Multiset — Maße/Daten/Fristen dürfen sich NIE ändern.
const ziffern = (s: string) => (s.match(/\d+/g) ?? []).sort().join(",");

async function ollamaGenerate(model: string, prompt: string): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      model,
      prompt,
      stream: false,
      options: { temperature: 0 },
    };
    if (model.startsWith("qwen3")) body.think = false; // Denkmodus aus (Latenz)
    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { response?: string };
    // Defensive: eventuelle <think>-Blöcke entfernen.
    return (j.response ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
  } catch {
    return null; // Ollama nicht erreichbar
  }
}

// Korrekturvorschlag für einen Text. null = kein (sicherer) Vorschlag.
export async function korrigiereText(text: string): Promise<string | null> {
  const eingabe = text.trim();
  if (eingabe.length < 8) return null; // zu kurz, nichts zu holen

  let raus: string | null = null;
  for (const m of MODELLE) {
    raus = await ollamaGenerate(m, PROMPT_KOPF + eingabe + "\nAusgabe:");
    if (raus) break;
  }
  if (!raus || raus === eingabe) return null;

  // Guards: keine Zahlenänderung, keine Kürzung/Aufblähung -> Vorschlag verwerfen.
  if (ziffern(raus) !== ziffern(eingabe)) return null;
  const ratio = raus.length / eingabe.length;
  if (ratio < 0.8 || ratio > 1.3) return null;

  return raus;
}

// --- Korrigierbare Textfelder einer Runde (für die Review-Seite) ---

export type KorrekturFeld = {
  schluessel: string; // "befund:<id>:<feld>" | "mangel:<id>:<feld>"
  parzelleId: string;
  label: string;
  text: string;
};

const BEFUND_FELDER = ["notiz", "kompensationNotiz", "plakettenNotiz", "diktatNachgereicht"] as const;
const MANGEL_FELDER = ["notiz", "diktatNachgereicht", "punkt"] as const;

const BEFUND_LABEL: Record<string, string> = {
  notiz: "Allgemeine Bemerkung",
  kompensationNotiz: "Kompensations-Kommentar",
  plakettenNotiz: "Plaketten-Begründung",
  diktatNachgereicht: "Nachgereichte Diktate",
};

export async function sammleKorrekturFelder(rundeId: number): Promise<KorrekturFeld[]> {
  const befunde = await prisma.befund.findMany({
    where: { rundeId },
    include: {
      parzelle: { select: { parzelleId: true } },
      maengel: { orderBy: { id: "asc" } },
    },
    orderBy: { parzelle: { nummer: "asc" } },
  });

  const felder: KorrekturFeld[] = [];
  for (const b of befunde) {
    for (const f of BEFUND_FELDER) {
      if (b[f].trim().length >= 8) {
        felder.push({
          schluessel: `befund:${b.id}:${f}`,
          parzelleId: b.parzelle.parzelleId,
          label: BEFUND_LABEL[f],
          text: b[f],
        });
      }
    }
    for (const m of b.maengel) {
      for (const f of MANGEL_FELDER) {
        if (f === "punkt" && m.katalogId !== null) continue; // Katalog-Snapshot nicht anfassen
        if (m[f].trim().length >= 8) {
          felder.push({
            schluessel: `mangel:${m.id}:${f}`,
            parzelleId: b.parzelle.parzelleId,
            label:
              f === "punkt"
                ? "Freitext-Mangel (Bezeichnung)"
                : `Mangel „${m.punkt || "Freitext"}" — ${f === "notiz" ? "Maßnahme" : "Nachgereichte Diktate"}`,
            text: m[f],
          });
        }
      }
    }
  }
  return felder;
}

// Korrigierten Text in das adressierte Feld schreiben (Whitelist!).
export async function wendeKorrekturAn(schluessel: string, text: string): Promise<boolean> {
  const [typ, idStr, feld] = schluessel.split(":");
  const id = Number(idStr);
  if (!Number.isFinite(id)) return false;
  // updateMany: wirft nicht, wenn der Datensatz inzwischen gelöscht wurde
  // (Mängel sind seit 2026-07 in der Ansicht löschbar — offener Korrektur-
  // Review darf dann nicht hart abbrechen).
  if (typ === "befund" && (BEFUND_FELDER as readonly string[]).includes(feld)) {
    await prisma.befund.updateMany({ where: { id }, data: { [feld]: text } });
    return true;
  }
  if (typ === "mangel" && (MANGEL_FELDER as readonly string[]).includes(feld)) {
    await prisma.mangel.updateMany({ where: { id }, data: { [feld]: text } });
    return true;
  }
  return false;
}

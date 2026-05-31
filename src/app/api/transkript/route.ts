import { NextRequest } from "next/server";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
// Lokale KI auf dem Mac Mini (Datensouveränität): faster-whisper + Ollama.
const PY = "/Users/macmini/Code/begehungshelfer/data/.venv/bin/python3";
const SCRIPT = "/Users/macmini/Code/begehungshelfer/scripts/transcribe.py";
const OLLAMA_MODELL = "qwen2.5-coder:7b";

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const audio = fd.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: "Kein Audio" }, { status: 400 });
  }
  const t = audio.type;
  const ext = t.includes("mp4") || t.includes("m4a")
    ? "mp4"
    : t.includes("ogg")
      ? "ogg"
      : "webm";
  const dir = await mkdtemp(join(tmpdir(), "diktat-"));
  const pfad = join(dir, `a.${ext}`);
  await writeFile(pfad, Buffer.from(await audio.arrayBuffer()));

  // 1) Transkription (Whisper, Deutsch)
  let raw = "";
  try {
    const { stdout } = await exec(PY, [SCRIPT, pfad], {
      timeout: 90000,
      maxBuffer: 1 << 20,
    });
    raw = stdout.trim();
  } catch (e) {
    return Response.json(
      { error: "Transkription fehlgeschlagen", detail: String(e) },
      { status: 500 }
    );
  } finally {
    await unlink(pfad).catch(() => {});
  }
  if (!raw) return Response.json({ raw: "", text: "" });

  // 2) Glättung (Ollama). Fällt bei Fehler auf den Rohtext zurück.
  let text = raw;
  try {
    const prompt =
      "Du bist eine Korrekturhilfe für diktierte Notizen einer Gartenbegehung. " +
      "Korrigiere NUR Zeichensetzung, Groß-/Kleinschreibung und offensichtliche " +
      "Erkennungsfehler. KÜRZE NICHTS und lasse KEINE Angaben, Bewertungen, Adjektive, " +
      "Maße oder Mängel weg; füge nichts Neues hinzu; ändere die Wortwahl nicht. " +
      "Gib ausschließlich den korrigierten deutschen Text aus, ohne Anführungszeichen " +
      "oder Einleitung.\n\nText:\n" + raw;
    const r = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODELL,
        prompt,
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (r.ok) {
      const j = (await r.json()) as { response?: string };
      if (j.response?.trim()) text = j.response.trim();
    }
  } catch {
    /* Ollama nicht erreichbar -> Rohtext */
  }

  return Response.json({ raw, text });
}

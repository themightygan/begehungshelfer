import { NextRequest } from "next/server";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { korrigiereText } from "@/lib/korrektur";

const exec = promisify(execFile);
// Lokale KI auf dem Mac Mini (Datensouveränität): faster-whisper + Ollama.
const PY = "/Users/macmini/Code/begehungshelfer/data/.venv/bin/python3";
const SCRIPT = "/Users/macmini/Code/begehungshelfer/scripts/transcribe.py";

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

  // 2) Glättung über die zentrale Korrektur (Few-Shot + Garten-Vokabular +
  //    Guards gegen Kürzung/Zahlenänderung). Fällt bei Fehler auf Rohtext zurück.
  const text = (await korrigiereText(raw)) ?? raw;

  return Response.json({ raw, text });
}

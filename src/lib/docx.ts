// docx-Rendering (Mitteilungen/Abmahnungen) über scripts/render_docx.py
// (docxtpl — die Word-Vorlagen in vorlagen/ sind Jinja2-Templates mit
// InlineImage-Platzhaltern; dafür gibt es kein Node-Pendant).
// Muster wie /api/transkript: venv-Python absolut (launchd-PATH!), Job als
// tmp-Datei, Timeout. Vorlagen-Herkunft: Muster_*.docx Stand 2026-07-05
// (juristisch abgestimmt — nicht neu bauen, nur befüllen).
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const WURZEL = "/Users/macmini/Code/begehungshelfer";
const PY = `${WURZEL}/data/.venv/bin/python3`;
const SCRIPT = `${WURZEL}/scripts/render_docx.py`;

export const VORLAGEN = {
  mitteilung: `${WURZEL}/vorlagen/mitteilung.docx`,
  abmahnung_verein: `${WURZEL}/vorlagen/abmahnung_verein.docx`,
  abmahnung_bv: `${WURZEL}/vorlagen/abmahnung_bv.docx`,
} as const;

// Eine Position der Beanstandungsliste. bilder = absolute Bildpfade
// (werden vom Skript re-encodiert + 55 mm breit eingebettet).
export type Beanstandung = {
  text: string;
  foto?: string | null;
  frist?: string | null;
  bilder?: string[];
};

// Kontext = Platzhalter der Vorlage (siehe render_docx.py, OPTIONAL-Liste).
// logo = absoluter Bildpfad; fehlende Pflicht-Platzhalter => Fehler mit Liste.
export async function rendereDocx(
  vorlage: (typeof VORLAGEN)[keyof typeof VORLAGEN],
  ausgabe: string,
  kontext: Record<string, unknown> & { beanstandungen: Beanstandung[] }
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "docx-"));
  const jobPfad = join(dir, "job.json");
  try {
    await writeFile(jobPfad, JSON.stringify({ vorlage, ausgabe, kontext }));
    await exec(PY, [SCRIPT, jobPfad], { timeout: 60000, maxBuffer: 1 << 20 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

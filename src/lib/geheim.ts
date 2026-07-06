// Verschlüsselung für Geheimnisse, die die App im Klartext BENUTZEN muss
// (z. B. das Mail-Passwort — Hashing scheidet aus). AES-256-GCM; der
// Schlüssel (MAIL_GEHEIM_SCHLUESSEL) liegt in .env, also getrennt von der
// DB-Datei: Backups/Kopien von dev.db enthalten nur noch Chiffretext.
// Format: enc:v1:<iv b64>:<authTag b64>:<cipher b64>
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function schluessel(): Buffer | null {
  const s = process.env.MAIL_GEHEIM_SCHLUESSEL;
  if (!s) return null;
  // Beliebige Passphrase -> 32 Byte (deterministisch)
  return createHash("sha256").update(s).digest();
}

export function verschluesseln(klartext: string): string {
  const key = schluessel();
  if (!key) throw new Error("MAIL_GEHEIM_SCHLUESSEL fehlt in .env — Passwort kann nicht gespeichert werden.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(":");
}

// null = nicht entschlüsselbar (Schlüssel fehlt/geändert, Wert manipuliert).
// Werte ohne Präfix sind Alt-Klartext (vor der Härtung) und gehen durch.
export function entschluesseln(wert: string): string | null {
  if (!wert.startsWith(PREFIX)) return wert;
  const key = schluessel();
  if (!key) return null;
  try {
    const [ivB64, tagB64, encB64] = wert.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

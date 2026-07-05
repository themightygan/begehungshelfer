// Passwort-Hashing für Vorstand-Logins: scrypt aus node:crypto (kein Paket).
// Vergleich konstantzeit via timingSafeEqual (Hash-Länge ist fix 64 Byte).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function passwortHashen(passwort: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(passwort, salt, 64).toString("hex");
  return { hash, salt };
}

export function passwortPruefen(passwort: string, hash: string, salt: string): boolean {
  const erwartet = Buffer.from(hash, "hex");
  const berechnet = scryptSync(passwort, salt, 64);
  return erwartet.length === berechnet.length && timingSafeEqual(erwartet, berechnet);
}

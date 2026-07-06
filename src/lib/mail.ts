// E-Mail-Anbindung (Verein-Postfach, Konfiguration aus dem Verein-Datensatz).
//
// HITL-Garantie (Anforderung 2026-07-06): Die App versendet NIE an Pächter
// oder fremde Adressen. Es gibt genau zwei Wege nach draußen:
//  1. entwurfInPostfach() — legt eine E-Mail als ENTWURF (\Draft) per IMAP
//     ins Postfach; versendet wird sie erst von einem Menschen im Mail-Client.
//  2. mailSenden(ziel) — SMTP-Versand ausschließlich an die eigene Vereins-
//     adresse oder die Bezirksverbands-Adresse; beide werden serverseitig aus
//     der DB aufgelöst (kein Adress-Parameter), müssen exakt EINE Adresse sein
//     (kein Komma/Semikolon — nodemailer würde Listen sonst auffächern) und
//     werden zusätzlich im SMTP-Envelope gepinnt.
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/db";

export type MailAnhang = { dateiname: string; inhalt: Buffer };
export type MailZiel = "vorstand" | "bezirksverband";

// Genau EINE Mail-Adresse — kein Whitespace, kein Trennzeichen, keine <>,
// kein zweites @ und kein : (Quasi-Source-Routes).
const ADRESSE_RE = /^[^\s,;<>@:]+@[^\s,;<>@:]+\.[^\s,;<>@:]+$/;

export function istEinzelAdresse(s: string): boolean {
  return ADRESSE_RE.test(s);
}

// Header-nahe Strings dürfen keine Zeilenumbrüche tragen (Injection-Schutz;
// nodemailer encodiert zwar, aber Defense-in-Depth kostet eine Zeile).
function kopfzeile(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

type Konfig = {
  imapHost: string; imapPort: number;
  smtpHost: string; smtpPort: number;
  user: string; pass: string;
  absender: string; // = Verein.email
  bezirksverband: string;
};

function hostPort(s: string, standardPort: number): { host: string; port: number } {
  const [host, portStr] = s.split(":");
  const port = parseInt(portStr ?? "", 10);
  return { host: host.trim(), port: Number.isInteger(port) ? port : standardPort };
}

// Konfiguration aus dem Verein-Singleton; string = menschenlesbarer Fehler.
export async function mailKonfig(): Promise<Konfig | string> {
  const v = await prisma.verein.findUnique({ where: { id: 1 } });
  if (!v) return "Vereinsdaten fehlen — bitte in den Einstellungen (Tab Verein) pflegen.";
  const fehlt: string[] = [];
  if (!v.email) fehlt.push("E-Mail des Vereins");
  if (!v.emailPasswort) fehlt.push("Passwort");
  if (!v.imapServer) fehlt.push("IMAP-Server");
  if (!v.smtpServer) fehlt.push("SMTP-Server");
  if (fehlt.length) return `Mail-Zugang unvollständig: ${fehlt.join(", ")} fehlt (Einstellungen → Verein).`;
  if (!istEinzelAdresse(v.email)) return "E-Mail des Vereins ist keine einzelne gültige Adresse.";
  const imap = hostPort(v.imapServer, 993);
  const smtp = hostPort(v.smtpServer, 465);
  return {
    imapHost: imap.host, imapPort: imap.port,
    smtpHost: smtp.host, smtpPort: smtp.port,
    user: v.emailBenutzer || v.email,
    pass: v.emailPasswort,
    absender: v.email,
    bezirksverband: v.bezirksverbandEmail,
  };
}

// Timeouts knapp halten: Server Actions laufen hinter Cloudflare (~100 s);
// ein nicht erreichbarer Host darf die UI nicht minutenlang blockieren.
function smtpTransport(k: Konfig) {
  return nodemailer.createTransport({
    host: k.smtpHost,
    port: k.smtpPort,
    secure: k.smtpPort === 465,
    requireTLS: k.smtpPort !== 465, // 587/25: STARTTLS erzwingen, kein Downgrade
    auth: { user: k.user, pass: k.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000, // Versand mit PDF-Anhang (Base64, mehrere MB)
  });
}

function imapClient(k: Konfig) {
  return new ImapFlow({
    host: k.imapHost,
    port: k.imapPort,
    secure: k.imapPort === 993,
    auth: { user: k.user, pass: k.pass },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
  });
}

// Verbindungstest für den Einstellungen-Knopf: prüft SMTP-Login und
// IMAP-Login getrennt und liefert je Kanal ok/Fehlertext.
export async function verbindungTesten(): Promise<{ ok: boolean; bericht: string }> {
  const k = await mailKonfig();
  if (typeof k === "string") return { ok: false, bericht: k };

  let smtp = "SMTP ✓";
  try {
    await smtpTransport(k).verify();
  } catch (e) {
    smtp = `SMTP-Fehler (${k.smtpHost}:${k.smtpPort}): ${e instanceof Error ? e.message : String(e)}`;
  }

  let imap = "IMAP ✓";
  const client = imapClient(k);
  try {
    await client.connect();
    await client.logout();
  } catch (e) {
    imap = `IMAP-Fehler (${k.imapHost}:${k.imapPort}): ${e instanceof Error ? e.message : String(e)}`;
  }

  return { ok: smtp === "SMTP ✓" && imap === "IMAP ✓", bericht: `${smtp} · ${imap}` };
}

// Entwürfe-Ordner finden: SPECIAL-USE \Drafts, sonst übliche Namen.
const ENTWURF_NAMEN = ["drafts", "entwürfe", "inbox.drafts", "inbox.entwürfe", "inbox/drafts", "inbox/entwürfe"];

// E-Mail als Entwurf ins Postfach legen (wird NICHT versendet). `an` ist nur
// der vorbefüllte Empfänger des Entwurfs (Pächter) — senden tut ein Mensch.
// Rückgabe: null = ok, sonst Fehlertext.
export async function entwurfInPostfach(nachricht: {
  an: string;
  betreff: string;
  text: string;
  anhang?: MailAnhang;
}): Promise<string | null> {
  const k = await mailKonfig();
  if (typeof k === "string") return k;

  // MIME-Nachricht bauen ohne zu senden (Stream-Transport puffert nur).
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "\r\n" });
  const gebaut = await composer.sendMail({
    from: k.absender,
    to: nachricht.an && istEinzelAdresse(nachricht.an) ? { name: "", address: nachricht.an } : undefined,
    subject: kopfzeile(nachricht.betreff),
    text: nachricht.text,
    attachments: nachricht.anhang
      ? [{ filename: nachricht.anhang.dateiname, content: nachricht.anhang.inhalt, contentType: "application/pdf" }]
      : [],
  });

  const client = imapClient(k);
  try {
    await client.connect();
    const ordner = await client.list();
    const ziel =
      ordner.find((o) => o.specialUse === "\\Drafts")?.path ??
      ordner.find((o) => ENTWURF_NAMEN.includes(o.path.toLowerCase()))?.path ??
      "Drafts";
    // \Seen dazu: sonst zählt der eigene Entwurf im Client als "ungelesen".
    await client.append(ziel, gebaut.message as Buffer, ["\\Draft", "\\Seen"]);
    await client.logout();
    return null;
  } catch (e) {
    try { await client.logout(); } catch { /* Verbindung eh tot */ }
    return `Entwurf konnte nicht abgelegt werden: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// SMTP-Versand — AUSSCHLIESSLICH an die zwei erlaubten, aus der DB
// aufgelösten Ziele. Empfänger wird validiert (genau eine Adresse) und im
// Envelope gepinnt. Bei Versand an den Bezirksverband geht immer eine Kopie
// (CC) an die Vereinsadresse — sonst gäbe es keinen Nachweis im Postfach.
// Rückgabe: null = ok, sonst Fehlertext.
export async function mailSenden(
  ziel: MailZiel,
  nachricht: { betreff: string; text: string; anhang?: MailAnhang }
): Promise<string | null> {
  const k = await mailKonfig();
  if (typeof k === "string") return k;

  const empfaenger = ziel === "vorstand" ? k.absender : k.bezirksverband;
  if (!empfaenger) return "Bezirksverbands-E-Mail fehlt (Einstellungen → Verein).";
  if (!istEinzelAdresse(empfaenger)) {
    return `Empfänger „${empfaenger}" ist keine einzelne gültige Adresse — Versand abgebrochen.`;
  }
  const kopie = ziel === "bezirksverband" ? k.absender : null;

  try {
    await smtpTransport(k).sendMail({
      from: k.absender,
      to: { name: "", address: empfaenger },
      ...(kopie ? { cc: { name: "", address: kopie } } : {}),
      subject: kopfzeile(nachricht.betreff),
      text: nachricht.text,
      attachments: nachricht.anhang
        ? [{ filename: nachricht.anhang.dateiname, content: nachricht.anhang.inhalt, contentType: "application/pdf" }]
        : [],
      // Envelope explizit pinnen: RCPT TO ist die Wahrheit, nicht der Header.
      envelope: { from: k.absender, to: kopie ? [empfaenger, kopie] : [empfaenger] },
    });
    return null;
  } catch (e) {
    return `Versand fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
  }
}

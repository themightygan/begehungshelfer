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
import { entschluesseln } from "@/lib/geheim";

// contentType optional — Standard PDF; Schreiben-Entwürfe hängen docx an.
export type MailAnhang = { dateiname: string; inhalt: Buffer; contentType?: string };
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
  // Passwort liegt AES-verschlüsselt in der DB (Schlüssel in .env).
  const pass = entschluesseln(v.emailPasswort);
  if (pass === null) {
    return "Mail-Passwort kann nicht entschlüsselt werden (MAIL_GEHEIM_SCHLUESSEL fehlt oder wurde geändert) — bitte in den Einstellungen neu eintragen.";
  }
  const imap = hostPort(v.imapServer, 993);
  const smtp = hostPort(v.smtpServer, 465);
  return {
    imapHost: imap.host, imapPort: imap.port,
    smtpHost: smtp.host, smtpPort: smtp.port,
    user: v.emailBenutzer || v.email,
    pass,
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
// `ordner`: eigener Zielordner (z. B. "Entwürfe Mitteilungen") — wird auf
// Ebene des Entwürfe-Ordners angelegt und ABONNIERT (sonst blenden andere
// IMAP-Clients ihn aus — Ursache des "Entwurf fehlt am anderen Rechner").
// Rückgabe: null = ok, sonst Fehlertext.
export async function entwurfInPostfach(nachricht: {
  an: string;
  betreff: string;
  text: string;
  anhaenge?: MailAnhang[];
  ordner?: string;
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
    attachments: (nachricht.anhaenge ?? []).map((a) => ({
      filename: a.dateiname,
      content: a.inhalt,
      contentType: a.contentType ?? "application/pdf",
    })),
  });

  const client = imapClient(k);
  try {
    await client.connect();
    const liste = await client.list();
    const drafts =
      liste.find((o) => o.specialUse === "\\Drafts") ??
      liste.find((o) => ENTWURF_NAMEN.includes(o.path.toLowerCase()));
    let ziel = drafts?.path ?? "Drafts";
    if (nachricht.ordner) {
      // UNTERORDNER des Entwürfe-Ordners ("Entwürfe > Mitteilungen").
      // Delimiter-Zeichen im Namen entschärfen: bei Strato ist "." der
      // Hierarchie-Trenner — "Entwürfe 2. Abmahnungen" wurde sonst zu
      // "Entwürfe 2" mit Unterordner "Abmahnungen" (Vorfall 2026-07-06).
      const delim = drafts?.delimiter ?? ".";
      const name = nachricht.ordner.split(delim).join(" ").replace(/\s+/g, " ").trim();
      ziel = `${drafts?.path ?? "Drafts"}${delim}${name}`;
      try { await client.mailboxCreate(ziel); } catch { /* existiert schon */ }
      // Immer abonnieren (idempotent) — sonst fehlt der Ordner in Clients,
      // die nur abonnierte Ordner anzeigen.
      try { await client.mailboxSubscribe(ziel); } catch { /* Server ohne SUBSCRIBE */ }
    }
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
        ? [{ filename: nachricht.anhang.dateiname, content: nachricht.anhang.inhalt, contentType: nachricht.anhang.contentType ?? "application/pdf" }]
        : [],
      // Envelope explizit pinnen: RCPT TO ist die Wahrheit, nicht der Header.
      envelope: { from: k.absender, to: kopie ? [empfaenger, kopie] : [empfaenger] },
    });
    return null;
  } catch (e) {
    return `Versand fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// --- Postfach-Abgleich: versandte/empfangene Schreiben automatisch in die Akte ---
// Durchsucht Gesendet-Ordner UND Posteingang (90 Tage) nach PDF-Anhängen, die
// sich einer Parzelle zuordnen lassen:
//   1. Anhang-DATEINAME beginnt mit der Parzellen-ID ("K52 Ludwig ....pdf") —
//      so kommen auch Sammel-Mails mit mehreren BV-Abmahnungen richtig an, oder
//   2. BETREFF enthält "Parzelle <ID>" (App-Mitteilungen; alle PDFs der Mail).
// Typ: "Abmah…" im Dateinamen/Betreff (tippfehlertolerant) -> schreiben, sonst
// email. App-eigene ENTWURF-Mails werden übersprungen; Dedupe je Anhang über
// Message-ID + Part in der Dokument-Notiz.
const GESENDET_NAMEN = ["sent", "sent items", "gesendet", "gesendete objekte", "gesendete elemente", "inbox.sent", "inbox.gesendet"];

export type AbgleichTreffer = { parzelleId: string; rundeId: number | null; datei: string };

export async function gesendetAbgleich(): Promise<{ ok: boolean; bericht: string; neue: AbgleichTreffer[] }> {
  const k = await mailKonfig();
  if (typeof k === "string") return { ok: false, bericht: k, neue: [] };
  const { dokumentSpeichern } = await import("@/lib/storage");

  const kuerzel = (await prisma.anlage.findMany({ select: { kuerzel: true } })).map((a) => a.kuerzel);
  const dateiRe = new RegExp(`^\\s*(${kuerzel.join("|")})\\s*(\\d+)\\s*([a-z])?\\b`, "i");
  const betreffRe = new RegExp(`Parzelle\\s+(${kuerzel.join("|")})\\s*(\\d+)\\s*([a-z])?\\b`, "i");

  const client = imapClient(k);
  const neue: AbgleichTreffer[] = [];
  let gesehen = 0;
  try {
    await client.connect();
    const liste = await client.list();
    const quellen = [
      liste.find((o) => o.specialUse === "\\Sent")?.path ??
        liste.find((o) => GESENDET_NAMEN.includes(o.path.toLowerCase()))?.path,
      "INBOX",
    ].filter((q): q is string => !!q);

    type Teil = { part?: string; type?: string; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: Teil[] };
    for (const quelle of quellen) {
      const lock = await client.getMailboxLock(quelle);
      try {
        const seit = new Date(Date.now() - 90 * 86400000);
        // Erst sammeln, dann laden — download() WÄHREND des fetch-Iterators
        // blockiert die IMAP-Pipeline (Socket-Timeout).
        const jobs: { uid: number; part: string; name: string; betreff: string; messageId: string; datum: Date }[] = [];
        for await (const msg of client.fetch({ since: seit }, { envelope: true, bodyStructure: true, uid: true })) {
          const betreff = msg.envelope?.subject ?? "";
          if (/^\s*(ENTWURF|Fwd?:\s*ENTWURF)/i.test(betreff)) continue; // App-Entwürfe
          const teile: Teil[] = [];
          const sammle = (t?: Teil) => {
            if (!t) return;
            if (t.type === "application/pdf" && t.part) teile.push(t);
            (t.childNodes ?? []).forEach(sammle);
          };
          sammle(msg.bodyStructure as Teil);
          if (!teile.length) continue;
          gesehen++;
          for (const t of teile) {
            jobs.push({
              uid: msg.uid,
              part: t.part!,
              name: t.dispositionParameters?.filename ?? t.parameters?.name ?? "anhang.pdf",
              betreff,
              messageId: msg.envelope?.messageId ?? `uid:${msg.uid}`,
              datum: msg.envelope?.date ?? new Date(),
            });
          }
        }

        for (const j of jobs) {
          const m = j.name.match(dateiRe) ?? j.betreff.match(betreffRe);
          if (!m) continue;
          const pid = `${m[1].toUpperCase()}${Number(m[2])}${(m[3] ?? "").toLowerCase()}`;
          const parzelle = await prisma.parzelle.findUnique({ where: { parzelleId: pid } });
          if (!parzelle) continue;
          const marke = `[Mail ${j.messageId}#${j.part}]`;
          // Dedupe: gleicher Anhang derselben Mail ODER gleicher Dateiname
          // bereits übernommen (dieselbe Datei steckt oft in mehreren Mails —
          // gesendet + Eingang; Vorfall K49 doppelt, 2026-07-06).
          const schonDa = await prisma.dokument.findFirst({
            where: {
              parzelleId: parzelle.id,
              OR: [
                { notiz: { contains: marke } },
                { notiz: { startsWith: `${j.name} — aus Postfach übernommen` } },
              ],
            },
          });
          if (schonDa) continue;

          const dl = await client.download(String(j.uid), j.part, { uid: true });
          const stuecke: Buffer[] = [];
          for await (const chunk of dl.content) stuecke.push(chunk as Buffer);
          const typ = /abmah/i.test(j.name) || /abmah/i.test(j.betreff)
            ? "schreiben"
            : /endstand|wertermittl/i.test(j.name)
              ? "wertermittlung"
              : "email";
          const pfad = await dokumentSpeichern(pid, Buffer.concat(stuecke), j.name);
          await prisma.dokument.create({
            data: {
              parzelleId: parzelle.id,
              typ,
              dateipfad: pfad,
              datum: j.datum,
              notiz: `${j.name} — aus Postfach übernommen („${kopfzeile(j.betreff)}") ${marke}`,
            },
          });
          const befund = await prisma.befund.findFirst({
            where: { parzelleId: parzelle.id },
            orderBy: { runde: { datum: "desc" } },
            select: { rundeId: true },
          });
          neue.push({ parzelleId: pid, rundeId: befund?.rundeId ?? null, datei: j.name });
        }
      } finally {
        lock.release();
      }
    }
    await client.logout();
    return {
      ok: true,
      neue,
      bericht: `Abgleich: ${gesehen} Mails mit PDF geprüft, ${neue.length} Dokument${neue.length === 1 ? "" : "e"} neu abgelegt${neue.length ? ` (${neue.map((n) => n.parzelleId).join(", ")})` : ""}.`,
    };
  } catch (e) {
    try { await client.logout(); } catch { /* Verbindung eh tot */ }
    return { ok: false, bericht: `Abgleich fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, neue };
  }
}

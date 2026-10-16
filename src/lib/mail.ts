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
import { BEFUND_STATUS_RANG, schreibenArt } from "@/lib/constants";

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
    // Bewusst OHNE \Seen: neu erzeugte Entwürfe sollen als UNGELESEN erscheinen,
    // damit der Vorstand sofort sieht, welche neu und noch unbearbeitet sind
    // (Wunsch Sascha 2026-07-12). Beim Öffnen/Bearbeiten markiert das Mail-
    // Programm sie selbst als gelesen.
    await client.append(ziel, gebaut.message as Buffer, ["\\Draft"]);
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

// Parzellen-Token aus beliebigem Text (Dateiname/Betreff) ziehen. Ersetzt das
// frühere `\b`-Muster, das vor `_` scheiterte (S80_WOLFF matchte nicht) und beim
// case-insensitiven Index-Buchstaben Namensinitialen verschluckte
// (K52 Ludwig -> "K52l"). Regeln:
//  - Token muss an einer Nicht-Buchstaben-Grenze beginnen (kein "eS12").
//  - führende Nullen schlucken (S09 -> S9).
//  - Index-Buchstabe nur direkt an der Zahl (S59a), NICHT nach Leerzeichen.
//  - danach kein Buchstabe/Ziffer/Unterstrich -> "K3 Kühwasen" bleibt K3.
function parzelleToken(kuerzel: string[], text: string): string | null {
  const re = new RegExp(`(?:^|[^A-Za-z])(${kuerzel.join("|")})\\s*0*(\\d{1,3})([a-z])?(?![A-Za-z0-9])`, "i");
  const m = text.match(re);
  return m ? `${m[1].toUpperCase()}${Number(m[2])}${(m[3] ?? "").toLowerCase()}` : null;
}
// Explizites "Parzelle <ID>" (App-Mitteilungen/BV-Weiterleitungen) — maßgeblich.
function parzelleAusBetreff(kuerzel: string[], betreff: string): string | null {
  const re = new RegExp(`Parzelle\\s+(${kuerzel.join("|")})\\s*0*(\\d{1,3})([a-z])?(?![A-Za-z0-9])`, "i");
  const m = betreff.match(re);
  return m ? `${m[1].toUpperCase()}${Number(m[2])}${(m[3] ?? "").toLowerCase()}` : null;
}

// Nachnamen-Fallback: manche Vorstands-Schreiben tragen im Dateinamen/Betreff
// NUR den Pächter-Nachnamen, kein Parzellen-Kürzel („2. Abmahnung Morczinski",
// „Abmahn Eitle"). Greift NUR, wenn genau EINE aktive Parzelle diesen Nachnamen
// trägt (Namensgleichheit/Schreibvarianten -> kein Match, lieber der Mensch).
// Nachname muss als ganzes Wort (Nicht-Buchstaben-Grenze) vorkommen, damit kurze
// Namen nicht mitten in anderen Wörtern matchen. Rückgabe: PID + gematchter Name.
type NachnameEintrag = { parzelleId: string; nachname: string };
function parzelleAusNachname(
  liste: NachnameEintrag[],
  text: string
): { pid: string; nachname: string } | null {
  const low = text.toLowerCase();
  const buchstabe = /\p{L}/u;
  const treffer = new Set<string>();
  let name = "";
  for (const e of liste) {
    const nn = e.nachname.trim().toLowerCase();
    if (nn.length < 3) continue; // zu kurz -> zu unspezifisch
    let von = low.indexOf(nn);
    while (von !== -1) {
      const davor = von > 0 ? low[von - 1] : "";
      const danach = von + nn.length < low.length ? low[von + nn.length] : "";
      if (!buchstabe.test(davor) && !buchstabe.test(danach)) {
        treffer.add(e.parzelleId);
        name = e.nachname;
        break;
      }
      von = low.indexOf(nn, von + 1);
    }
  }
  return treffer.size === 1 ? { pid: [...treffer][0], nachname: name } : null;
}

export type AbgleichTreffer = { parzelleId: string; rundeId: number | null; datei: string; art: "mitteilung" | "abmahnung" | "sonstiges" };

// Nachbearbeitungs-Status des passenden Befunds automatisch mitsetzen (nur
// hochstufen). Zielbefund = neuester Befund der Parzelle mit Begehungsdatum <=
// Versanddatum (fällt sonst auf den neuesten Befund überhaupt zurück). Kein
// Zielbefund -> nichts tun (Schreiben ohne zugehörige Begehung).
async function statusAusSchreiben(
  parzelleDbId: number,
  versandDatum: Date,
  zielStatus: string
): Promise<void> {
  const befund =
    (await prisma.befund.findFirst({
      where: { parzelleId: parzelleDbId, runde: { datum: { lte: versandDatum } } },
      orderBy: { runde: { datum: "desc" } },
      select: { id: true, status: true },
    })) ??
    (await prisma.befund.findFirst({
      where: { parzelleId: parzelleDbId },
      orderBy: { runde: { datum: "desc" } },
      select: { id: true, status: true },
    }));
  if (!befund) return;
  const neu = BEFUND_STATUS_RANG[zielStatus] ?? 0;
  const alt = BEFUND_STATUS_RANG[befund.status] ?? 0;
  if (neu > alt) {
    await prisma.befund.update({ where: { id: befund.id }, data: { status: zielStatus } });
  }
}

// In-Process-Lock: der Abgleich ist über zwei Wege auslösbar (stündlicher
// Scheduler in instrumentation.ts UND der Knopf im Verein-Tab). Ohne Lock
// könnten zwei überlappende Läufe dasselbe PDF doppelt ablegen und den Status
// doppelt hochstufen (kein DB-Unique auf der Marke).
let abgleichLaeuft = false;

export async function gesendetAbgleich(): Promise<{ ok: boolean; bericht: string; neue: AbgleichTreffer[] }> {
  if (abgleichLaeuft) return { ok: true, bericht: "Abgleich läuft bereits — übersprungen.", neue: [] };
  const k = await mailKonfig();
  if (typeof k === "string") return { ok: false, bericht: k, neue: [] };
  abgleichLaeuft = true;
  const { dokumentSpeichern } = await import("@/lib/storage");

  const kuerzel = (await prisma.anlage.findMany({ select: { kuerzel: true } })).map((a) => a.kuerzel);
  // Nachnamen aller Parzellen für den Fallback (Schreiben ohne Parzellen-Kürzel).
  const nachnamen: NachnameEintrag[] = (
    await prisma.parzelle.findMany({ select: { parzelleId: true, nachname: true } })
  ).filter((p) => p.nachname.trim() !== "");
  const selbst = k.absender.toLowerCase(); // Vereinsadresse = "Selbst"
  const bvAdr = (k.bezirksverband ?? "").toLowerCase();
  const adressen = (arr?: { address?: string }[]) =>
    (arr ?? []).map((a) => (a.address ?? "").toLowerCase()).filter(Boolean);

  const client = imapClient(k);
  const neue: AbgleichTreffer[] = [];
  let gesehen = 0;
  try {
    await client.connect();
    const liste = await client.list();
    const gesendetPfad =
      liste.find((o) => o.specialUse === "\\Sent")?.path ??
      liste.find((o) => GESENDET_NAMEN.includes(o.path.toLowerCase()))?.path;
    const quellen = [gesendetPfad, "INBOX"].filter((q): q is string => !!q);

    type Teil = { part?: string; type?: string; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: Teil[] };
    for (const quelle of quellen) {
      const istGesendet = quelle === gesendetPfad;
      const lock = await client.getMailboxLock(quelle);
      try {
        const seit = new Date(Date.now() - 90 * 86400000);
        // Erst sammeln, dann laden — download() WÄHREND des fetch-Iterators
        // blockiert die IMAP-Pipeline (Socket-Timeout).
        const jobs: {
          uid: number; part: string; name: string; betreff: string; messageId: string;
          datum: Date; empfaenger: string[]; absender: string[];
        }[] = [];
        for await (const msg of client.fetch({ since: seit }, { envelope: true, bodyStructure: true, uid: true })) {
          const betreff = msg.envelope?.subject ?? "";
          if (/^\s*(ENTWURF|Fwd?:\s*ENTWURF)/i.test(betreff)) continue; // App-Entwürfe
          const empfaenger = [...adressen(msg.envelope?.to), ...adressen(msg.envelope?.cc)];
          const absender = adressen(msg.envelope?.from);
          // Nur ECHTER externer Vorgang zählt (Entscheidung 2026-07-20):
          //  - Gesendet: mind. EIN externer Empfänger (Pächter/BV). Reine
          //    Selbst-Mails (Berichte/Entwurfskopien an die Vereinsadresse)
          //    werden NICHT übernommen.
          //  - Posteingang: nur echte Eingänge VOM Bezirksverband (Abmahnung/
          //    Kündigung/Zustimmung). Interne Vorstands-/Selbst-Mails (Berichte,
          //    Protokolle, Entwürfe) haben hier nichts zu suchen.
          if (istGesendet) {
            if (!empfaenger.some((a) => a !== selbst)) continue;
          } else {
            if (!bvAdr || !absender.includes(bvAdr)) continue;
          }
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
              empfaenger,
              absender,
            });
          }
        }

        for (const j of jobs) {
          const klass = `${j.name} ${j.betreff}`;
          const art = schreibenArt(klass); // mitteilung | abmahnung | null
          // Zuordnung: explizites "Parzelle <ID>" im Betreff (App/BV) hat Vorrang,
          // dann Dateiname-Token, dann allgemeines Betreff-Token. Der Dateiname
          // ist unzuverlässig (Vorstand benennt um; Vorfall S76->S74 / S70->S78).
          const betreffPid = parzelleAusBetreff(kuerzel, j.betreff);
          const dateiPid = parzelleToken(kuerzel, j.name);
          const tokenPid = betreffPid ?? dateiPid ?? parzelleToken(kuerzel, j.betreff);
          // Fallback über den Nachnamen — NUR für erkannte Mitteilungen/Abmahnungen
          // (kein Kürzel gefunden). Bei "sonstigen" PDFs (kein Marker) bewusst nicht,
          // um Fehlzuordnungen beliebiger Anhänge zu vermeiden. Dateiname VOR Betreff:
          // bei diesen manuellen Vorstands-Schreiben ist der Dateiname der bewusst
          // gesetzte Identifier („2. Abmahnung BV Smykalova.pdf"), der Betreff oft
          // beiläufig/fehlerhaft (Copy-Paste-Vorfall: Smykalova-Mail trug „Morczinski"
          // im Betreff -> kombiniert nicht eindeutig).
          const nameTreffer =
            !tokenPid && art
              ? parzelleAusNachname(nachnamen, j.name) ?? parzelleAusNachname(nachnamen, j.betreff)
              : null;
          const pid = tokenPid ?? nameTreffer?.pid ?? null;
          if (!pid) continue;
          const parzelle = await prisma.parzelle.findUnique({ where: { parzelleId: pid } });
          if (!parzelle) continue;
          const konflikt = betreffPid && dateiPid && betreffPid !== dateiPid ? dateiPid : null;
          const marke = `[Mail ${j.messageId}#${j.part}]`;
          // Dedupe GLOBAL über die eindeutige Message-ID+Part — unabhängig von der
          // Parzelle. (Wichtig, seit der Betreff Vorrang hat: die aufgelöste
          // Parzelle eines Dokuments kann sich sonst ändern und ein Re-Import
          // unter anderer Parzelle entstehen.) Zusätzlich Dateiname-Fallback für
          // Alt-Dokumente (dieselbe Datei steckt oft in mehreren Mails).
          const schonDa = await prisma.dokument.findFirst({
            where: {
              OR: [
                { notiz: { contains: marke } },
                { parzelleId: parzelle.id, notiz: { startsWith: `${j.name} — aus Postfach übernommen` } },
              ],
            },
          });
          if (schonDa) continue;

          const dl = await client.download(String(j.uid), j.part, { uid: true });
          const stuecke: Buffer[] = [];
          for await (const chunk of dl.content) stuecke.push(chunk as Buffer);
          const typ = art === "abmahnung"
            ? "schreiben"
            : /endstand|wertermittl/i.test(klass)
              ? "wertermittlung"
              : "email";
          const gegenpartei = istGesendet ? j.empfaenger : j.absender;
          const istBv = !!bvAdr && (gegenpartei.includes(bvAdr) || j.empfaenger.includes(bvAdr));
          const pfad = await dokumentSpeichern(pid, Buffer.concat(stuecke), j.name);
          const konfliktNote = konflikt
            ? ` (Dateiname nannte ${konflikt})`
            : nameTreffer
              ? ` (per Nachname „${nameTreffer.nachname}" zugeordnet)`
              : "";
          const richtung = istGesendet ? `an: ${j.empfaenger[0] ?? "?"}` : `von: ${j.absender[0] ?? "?"}`;
          await prisma.dokument.create({
            data: {
              parzelleId: parzelle.id,
              typ,
              dateipfad: pfad,
              datum: j.datum,
              notiz: `${j.name} — aus Postfach übernommen („${kopfzeile(j.betreff)}"${konfliktNote}) [${richtung}] ${marke}`,
            },
          });
          // Befund-Status automatisch hochstufen (nur bei erkannter Mitteilung/
          // Abmahnung). Kündigung bleibt bewusst manuell (kuendigung_paechter vs
          // kuendigung_bv ist eine rechtliche Einordnung).
          if (art === "mitteilung") {
            await statusAusSchreiben(parzelle.id, j.datum, "hinweis_versendet");
          } else if (art === "abmahnung") {
            await statusAusSchreiben(parzelle.id, j.datum, istBv ? "abmahnung_bv" : "abmahnung_versendet");
          }
          const befund = await prisma.befund.findFirst({
            where: { parzelleId: parzelle.id },
            orderBy: { runde: { datum: "desc" } },
            select: { rundeId: true },
          });
          neue.push({ parzelleId: pid, rundeId: befund?.rundeId ?? null, datei: j.name, art: art ?? "sonstiges" });
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
  } finally {
    abgleichLaeuft = false;
  }
}

import Link from "next/link";
import { Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { AktionsForm } from "./AktionsForm";
import { AnlageLoeschen } from "./AnlageLoeschen";
import { VorstandLoeschen } from "./VorstandLoeschen";
import { VerbindungsTest } from "./VerbindungsTest";
import {
  anlageAnlegen,
  anlageUmbenennen,
  anlageLoeschen,
  parzelleAnlegen,
  vorstandAnlegen,
  vorstandAktualisieren,
  vorstandLoeschen,
  vereinSpeichern,
  vereinLogoHochladen,
  vereinLogoEntfernen,
  mailVerbindungTesten,
  postfachAbgleich,
  textbausteinSpeichern,
  textbausteinZuruecksetzen,
} from "./actions";
import { BAUSTEINE } from "@/lib/bausteine";

export const dynamic = "force-dynamic";

// Einstellungen: Parzellen (Anlagen + Parzellen anlegen/löschen), Vorstand
// (Teilnehmerliste + optionale Logins) und Vereins-Stammdaten (Briefkopf,
// Mail-Zugang, Logo). Zugriff nur eingeloggt (Middleware).

const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const INP = "rounded border border-stone-300 px-3 py-1.5 text-sm";

export default async function EinstellungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tabParam = (await searchParams).tab;
  const tab =
    tabParam === "vorstand" || tabParam === "verein" || tabParam === "textbausteine"
      ? tabParam
      : "parzellen";
  const tabKlasse = (aktiv: boolean) =>
    `rounded px-3 py-1.5 text-sm font-medium ${
      aktiv ? "bg-emerald-700 text-white" : "border border-stone-300 hover:bg-stone-100"
    }`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Settings className="h-6 w-6 shrink-0" aria-hidden /> Einstellungen</h1>
        <Link href="/" className="shrink-0 text-base text-emerald-700 hover:underline">Start</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/einstellungen" className={tabKlasse(tab === "parzellen")}>Parzellen</Link>
        <Link href="/einstellungen?tab=vorstand" className={tabKlasse(tab === "vorstand")}>Vorstand</Link>
        <Link href="/einstellungen?tab=verein" className={tabKlasse(tab === "verein")}>Verein</Link>
        <Link href="/einstellungen?tab=textbausteine" className={tabKlasse(tab === "textbausteine")}>Textbausteine</Link>
      </div>

      {tab === "parzellen" ? (
        <ParzellenTab />
      ) : tab === "vorstand" ? (
        <VorstandTab />
      ) : tab === "verein" ? (
        <VereinTab />
      ) : (
        <TextbausteineTab />
      )}
    </div>
  );
}

async function ParzellenTab() {
  const anlagen = await prisma.anlage.findMany({
    orderBy: { kuerzel: "asc" },
    include: { _count: { select: { parzellen: true } } },
  });

  return (
    <div className="space-y-4">
      {anlagen.map((a) => (
        <section key={a.id} className={`${CARD} space-y-3`}>
          <h2 className="text-base font-medium">
            {a.name} <span className="text-stone-500">· Kürzel {a.kuerzel} (fest — steckt in allen Parzellen-Nummern) · {a._count.parzellen} Parzellen</span>
          </h2>
          <AktionsForm
            action={anlageUmbenennen.bind(null, a.id)}
            className="flex flex-wrap items-center gap-2"
            submitLabel="Umbenennen"
          >
            <input type="text" name="name" defaultValue={a.name} className={INP} />
          </AktionsForm>
          <AktionsForm
            action={parzelleAnlegen.bind(null, a.id)}
            className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3"
            submitLabel="+ Parzelle anlegen"
          >
            <span className="text-sm text-stone-600">{a.kuerzel}</span>
            <input type="number" name="nummer" min="1" placeholder="Nummer" required className={`w-24 ${INP}`} />
            <input type="text" name="index" placeholder="Zusatz (a)" maxLength={2} className={`w-24 ${INP}`} />
            <span className="text-xs text-stone-600">startet unverpachtet — Pächter in der Akte pflegen</span>
          </AktionsForm>
          <div className="border-t border-stone-100 pt-3">
            <AnlageLoeschen
              action={anlageLoeschen.bind(null, a.id)}
              name={a.name}
              parzellen={a._count.parzellen}
            />
          </div>
        </section>
      ))}

      <section className={`${CARD} space-y-2`}>
        <h2 className="text-base font-medium">Anlage hinzufügen</h2>
        <AktionsForm
          action={anlageAnlegen}
          className="flex flex-wrap items-center gap-2"
          submitLabel="+ Anlage anlegen"
        >
          <input type="text" name="kuerzel" placeholder="Kürzel (z. B. K)" maxLength={3} required className={`w-32 ${INP}`} />
          <input type="text" name="name" placeholder="Name" required className={INP} />
        </AktionsForm>
      </section>
    </div>
  );
}

async function VorstandTab() {
  const vorstand = await prisma.vorstand.findMany({ orderBy: { sortierung: "asc" } });

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-1`}>
        <h2 className="text-base font-medium">Vorstand</h2>
        <p className="text-sm text-stone-500">
          Aktive Mitglieder erscheinen als Teilnehmer beim Begehung-Starten. Mit E-Mail
          und Passwort ist zusätzlich die Anmeldung an der App möglich.
        </p>
        <ul className="mt-2 space-y-3">
          {vorstand.map((v) => (
            <li key={v.id} className="border-t border-stone-100 pt-3">
              <AktionsForm
                action={vorstandAktualisieren.bind(null, v.id)}
                className="space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input type="text" name="name" defaultValue={v.name} className={`w-52 ${INP}`} />
                  <input
                    type="email"
                    name="email"
                    defaultValue={v.email ?? ""}
                    placeholder="E-Mail (für Login)"
                    className={`w-72 ${INP}`}
                  />
                  <label className="flex items-center gap-1.5 text-sm text-stone-600">
                    <input type="checkbox" name="aktiv" value="1" defaultChecked={v.aktiv} />
                    aktiv
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    name="passwortNeu"
                    placeholder="neues Passwort (leer = unverändert)"
                    autoComplete="new-password"
                    className={`w-72 ${INP}`}
                  />
                  <span className="text-xs text-stone-600">
                    {v.passwortHash ? "🔑 Login eingerichtet" : "kein Login"}
                  </span>
                  {v.passwortHash && (
                    <label className="flex items-center gap-1.5 text-sm text-red-600">
                      <input type="checkbox" name="loginEntfernen" value="1" />
                      Login entfernen
                    </label>
                  )}
                </div>
              </AktionsForm>
              <div className="mt-2">
                <VorstandLoeschen
                  action={vorstandLoeschen.bind(null, v.id)}
                  name={v.name}
                  hatLogin={Boolean(v.passwortHash)}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${CARD} space-y-2`}>
        <h2 className="text-base font-medium">Mitglied hinzufügen</h2>
        <AktionsForm
          action={vorstandAnlegen}
          className="flex flex-wrap items-center gap-2"
          submitLabel="+ Mitglied anlegen"
        >
          <input type="text" name="name" placeholder="Name" required className={`w-64 ${INP}`} />
        </AktionsForm>
      </section>
    </div>
  );
}

async function VereinTab() {
  const verein = await prisma.verein.findUnique({ where: { id: 1 } });
  const FELD = "block text-sm";
  const LABEL = "mb-1 block text-sm text-stone-600";

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-1`}>
        <h2 className="text-base font-medium">Vereins-Stammdaten</h2>
        <p className="text-sm text-stone-500">
          Für Briefkopf, Berichte und späteren E-Mail-Versand aus der App.
        </p>
        <AktionsForm action={vereinSpeichern} className="mt-2 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={FELD}>
              <span className={LABEL}>Name des Vereins</span>
              <input type="text" name="name" defaultValue={verein?.name ?? ""} className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>1. Vorsitzende/r</span>
              <input type="text" name="vorsitzender" defaultValue={verein?.vorsitzender ?? ""} className={`w-full ${INP}`} />
            </label>
          </div>
          <label className={FELD}>
            <span className={LABEL}>Adresse (mehrzeilig)</span>
            <textarea name="adresse" rows={3} defaultValue={verein?.adresse ?? ""} className={`w-full ${INP}`} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={FELD}>
              <span className={LABEL}>E-Mail des Vereins</span>
              <input type="email" name="email" defaultValue={verein?.email ?? ""} className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>E-Mail des Bezirksverbands</span>
              <input type="email" name="bezirksverbandEmail" defaultValue={verein?.bezirksverbandEmail ?? ""} className={`w-full ${INP}`} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={FELD}>
              <span className={LABEL}>Telefon (Briefkopf)</span>
              <input type="text" name="telefon" defaultValue={verein?.telefon ?? ""} className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>Ort (Datumszeile, z. B. „Stuttgart")</span>
              <input type="text" name="ort" defaultValue={verein?.ort ?? ""} className={`w-full ${INP}`} />
            </label>
          </div>

          <h3 className="border-t border-stone-100 pt-3 text-sm font-medium">Bezirksverband (Verpächter — für Abmahnungen)</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`${FELD} sm:col-span-2`}>
              <span className={LABEL}>Name des Bezirksverbands</span>
              <input type="text" name="bvName" defaultValue={verein?.bvName ?? ""} className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>Straße</span>
              <input type="text" name="bvStrasse" defaultValue={verein?.bvStrasse ?? ""} className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>PLZ und Ort</span>
              <input type="text" name="bvPlzOrt" defaultValue={verein?.bvPlzOrt ?? ""} className={`w-full ${INP}`} />
            </label>
          </div>

          <h3 className="border-t border-stone-100 pt-3 text-sm font-medium">Mail-Zugang (IMAP/SMTP)</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={FELD}>
              <span className={LABEL}>IMAP-Server (Host oder Host:Port)</span>
              <input type="text" name="imapServer" defaultValue={verein?.imapServer ?? ""} placeholder="z. B. imap.example.de:993" className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>SMTP-Server (Host oder Host:Port)</span>
              <input type="text" name="smtpServer" defaultValue={verein?.smtpServer ?? ""} placeholder="z. B. smtp.example.de:587" className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>Benutzername (leer = E-Mail des Vereins)</span>
              <input type="text" name="emailBenutzer" defaultValue={verein?.emailBenutzer ?? ""} autoComplete="off" className={`w-full ${INP}`} />
            </label>
            <label className={FELD}>
              <span className={LABEL}>
                Passwort {verein?.emailPasswort ? "(gesetzt — leer lassen = unverändert)" : "(nicht gesetzt)"}
              </span>
              <input type="password" name="passwortNeu" autoComplete="new-password" className={`w-full ${INP}`} />
            </label>
          </div>
          {verein?.emailPasswort ? (
            <label className="flex items-center gap-1.5 text-sm text-red-600">
              <input type="checkbox" name="passwortEntfernen" value="1" />
              Passwort entfernen
            </label>
          ) : null}
        </AktionsForm>
        <div className="flex flex-wrap gap-4 border-t border-stone-100 pt-3">
          <VerbindungsTest action={mailVerbindungTesten} />
          <VerbindungsTest
            action={postfachAbgleich}
            label="Gesendet-Abgleich (Mitteilungen in Akten ablegen)"
            pendingLabel="gleiche ab…"
          />
        </div>
      </section>

      <section className={`${CARD} space-y-2`}>
        <h2 className="text-base font-medium">Vereinslogo</h2>
        {verein?.logoPfad ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/datei/${verein.logoPfad}`}
              alt="Aktuelles Vereinslogo"
              className="max-h-24 rounded border border-stone-200 bg-white p-1"
            />
            <AktionsForm action={vereinLogoEntfernen} submitLabel="Logo entfernen">
              {null}
            </AktionsForm>
          </div>
        ) : (
          <p className="text-sm text-stone-500">Noch kein Logo hochgeladen.</p>
        )}
        <AktionsForm
          action={vereinLogoHochladen}
          className="flex flex-wrap items-center gap-2"
          submitLabel="Logo hochladen"
        >
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="text-sm" />
          <span className="text-xs text-stone-600">PNG, JPEG oder WebP, max. 2 MB</span>
        </AktionsForm>
      </section>
    </div>
  );
}

async function TextbausteineTab() {
  const overrides = await prisma.textbausteinOverride.findMany();
  const overrideMap = new Map(overrides.map((o) => [o.id, o]));
  const BEREICHE: { nr: 1 | 2 | 3; titel: string }[] = [
    { nr: 1, titel: "Garten" },
    { nr: 2, titel: "Baulichkeiten und Nebenanlagen" },
    { nr: 3, titel: "Sonstiges" },
  ];

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-1`}>
        <h2 className="text-base font-medium">Textbausteine für Schreiben</h2>
        <p className="text-sm text-stone-600">
          Feststellung, Aufforderung und Normzitat je Mangel-Baustein — verwendet in
          Mitteilungen und Abmahnungen. <code className="rounded bg-stone-100 px-1">{"{befund}"}</code>{" "}
          ist der Platzhalter für den konkreten Befund; ohne Befund wird das Segment
          automatisch weggelassen. Die Standardtexte sind juristisch geprüft —
          Änderungen wirken auf alle künftigen Schreiben.
        </p>
        <p className="text-sm text-stone-500">
          Die Gemüse-Texte (SOLL/IST, § 12/§ 1-Weiche) werden aus den Beet-Daten
          gebaut und sind hier nicht editierbar.
        </p>
      </section>

      {BEREICHE.map((bereich) => (
        <section key={bereich.nr} className={`${CARD} space-y-4`}>
          <h2 className="text-base font-medium">{bereich.titel}</h2>
          {BAUSTEINE.filter((b) => b.bereich === bereich.nr).map((b) => {
            const o = overrideMap.get(b.id);
            const angepasst = !!o && !!(o.feststellung || o.aufforderung || o.norm);
            return (
              <div key={b.id} className="border-t border-stone-100 pt-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium">{b.id} · {b.label}</span>
                  {angepasst && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">angepasst</span>
                  )}
                </div>
                <AktionsForm action={textbausteinSpeichern} className="space-y-2">
                  <input type="hidden" name="id" value={b.id} />
                  <label className="block text-sm">
                    <span className="text-stone-600">Feststellung</span>
                    <textarea
                      name="feststellung"
                      rows={2}
                      defaultValue={o?.feststellung || b.feststellung}
                      className={`mt-1 w-full ${INP}`}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-stone-600">Aufforderung</span>
                    <textarea
                      name="aufforderung"
                      rows={2}
                      defaultValue={o?.aufforderung || b.aufforderung}
                      className={`mt-1 w-full ${INP}`}
                    />
                  </label>
                  <label className="block text-sm sm:max-w-md">
                    <span className="text-stone-600">Normzitat</span>
                    <input
                      type="text"
                      name="norm"
                      defaultValue={o?.norm || b.norm}
                      className={`mt-1 w-full ${INP}`}
                    />
                  </label>
                </AktionsForm>
                {angepasst && (
                  <AktionsForm
                    action={textbausteinZuruecksetzen}
                    submitLabel="Auf Standard zurücksetzen"
                    className="mt-2"
                  >
                    <input type="hidden" name="id" value={b.id} />
                  </AktionsForm>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

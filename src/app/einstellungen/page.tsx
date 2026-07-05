import Link from "next/link";
import { Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { AktionsForm } from "./AktionsForm";
import {
  anlageAnlegen,
  anlageUmbenennen,
  parzelleAnlegen,
  vorstandAnlegen,
  vorstandAktualisieren,
} from "./actions";

export const dynamic = "force-dynamic";

// Einstellungen: Parzellen (Anlagen + Parzellen anlegen) und Vorstand
// (Teilnehmerliste + optionale Logins). Zugriff nur eingeloggt (Middleware).

const CARD = "rounded-lg border border-stone-200 bg-white p-4";
const INP = "rounded border border-stone-300 px-3 py-1.5 text-sm";

export default async function EinstellungenSeite({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = (await searchParams).tab === "vorstand" ? "vorstand" : "parzellen";
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

      <div className="flex gap-2">
        <Link href="/einstellungen" className={tabKlasse(tab === "parzellen")}>Parzellen</Link>
        <Link href="/einstellungen?tab=vorstand" className={tabKlasse(tab === "vorstand")}>Vorstand</Link>
      </div>

      {tab === "parzellen" ? <ParzellenTab /> : <VorstandTab />}
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

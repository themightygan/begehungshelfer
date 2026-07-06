"use client";

import { useActionState } from "react";
import { Mail, Send } from "lucide-react";
import type { MailErgebnis } from "./actions";

type MailAction = (prev: MailErgebnis, formData: FormData) => Promise<MailErgebnis>;

// E-Mail-Karte der Begehungsansicht. HITL: Mitteilungen werden nur als
// ENTWURF ins Postfach gelegt; Abmahnungs-Entwürfe gehen ausschließlich an
// die Vereinsadresse selbst oder den Bezirksverband (Adressen aus der DB,
// serverseitig erzwungen — hier stehen sie nur zur Anzeige).
function MailKnopf({
  action,
  label,
  icon,
  bestaetigung,
}: {
  action: MailAction;
  label: string;
  icon: React.ReactNode;
  bestaetigung?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (bestaetigung && !window.confirm(bestaetigung)) e.preventDefault();
      }}
      className="space-y-1"
    >
      <button
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      >
        {icon} {pending ? "wird verarbeitet…" : label}
      </button>
      {state.ok && <p className="text-sm text-emerald-700">✓ {state.ok}</p>}
      {state.fehler && <p className="text-sm text-red-700">{state.fehler}</p>}
    </form>
  );
}

export function MailAktionen({
  mitteilungAction,
  vorstandAction,
  bezirksverbandAction,
  paechterEmail,
  vereinEmail,
  bezirksverbandEmail,
}: {
  mitteilungAction: MailAction;
  vorstandAction: MailAction;
  bezirksverbandAction: MailAction;
  paechterEmail: string;
  vereinEmail: string;
  bezirksverbandEmail: string;
}) {
  return (
    <div className="space-y-3">
      <MailKnopf
        action={mitteilungAction}
        label="Mitteilungs-Entwurf ins Postfach"
        icon={<Mail className="h-4 w-4 shrink-0" aria-hidden />}
      />
      <p className="text-sm text-stone-600">
        Legt eine E-Mail mit Bericht-PDF als Entwurf ins Vereinspostfach
        {paechterEmail ? (
          <> (An: {paechterEmail})</>
        ) : (
          <> — <span className="text-amber-800">keine Pächter-E-Mail hinterlegt</span></>
        )}
        . Gesendet wird erst von dir im Mail-Programm.
      </p>
      <div className="flex flex-wrap items-start gap-3 border-t border-stone-100 pt-3">
        <MailKnopf
          action={vorstandAction}
          label="Abmahnungs-Entwurf an Vorstand"
          icon={<Send className="h-4 w-4 shrink-0" aria-hidden />}
        />
        <MailKnopf
          action={bezirksverbandAction}
          label="Abmahnungs-Entwurf an Bezirksverband"
          icon={<Send className="h-4 w-4 shrink-0" aria-hidden />}
          bestaetigung={`Wirklich an den Bezirksverband (${bezirksverbandEmail}) senden?\nEine Kopie geht an ${vereinEmail}.`}
        />
      </div>
      <p className="text-sm text-stone-600">
        Versand nur an die eigene Vereinsadresse ({vereinEmail}) bzw. den
        Bezirksverband ({bezirksverbandEmail || "nicht hinterlegt"}) — nie an andere Adressen.
      </p>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { PlugZap } from "lucide-react";
import type { TestErgebnis } from "./actions";

// Knopf für Postfach-Aktionen mit Ergebnis-Zeile (Verbindungstest, Abgleich).
export function VerbindungsTest({
  action,
  label = "Verbindung testen",
  pendingLabel = "teste…",
}: {
  action: (prev: TestErgebnis, formData: FormData) => Promise<TestErgebnis>;
  label?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-50"
      >
        <PlugZap className="h-4 w-4 shrink-0" aria-hidden />
        {pending ? pendingLabel : label}
      </button>
      {state.bericht && (
        <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
          {state.bericht}
        </span>
      )}
      {!!state.links?.length && (
        <span className="flex flex-wrap gap-2 text-sm">
          {state.links.map((l) => (
            <a key={l.href + l.label} href={l.href} className="text-emerald-700 underline hover:text-emerald-800">
              {l.label}
            </a>
          ))}
        </span>
      )}
    </form>
  );
}

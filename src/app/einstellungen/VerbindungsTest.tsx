"use client";

import { useActionState } from "react";
import { PlugZap } from "lucide-react";
import type { TestErgebnis } from "./actions";

// Testet den Mail-Zugang (SMTP + IMAP) und zeigt das Ergebnis je Kanal.
export function VerbindungsTest({
  action,
}: {
  action: (prev: TestErgebnis, formData: FormData) => Promise<TestErgebnis>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-50"
      >
        <PlugZap className="h-4 w-4 shrink-0" aria-hidden />
        {pending ? "teste…" : "Verbindung testen"}
      </button>
      {state.bericht && (
        <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
          {state.bericht}
        </span>
      )}
    </form>
  );
}

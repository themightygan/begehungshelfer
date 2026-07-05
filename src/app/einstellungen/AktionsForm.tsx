"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

// Kleines Formular mit Fehleranzeige (useActionState) — die Eingabefelder
// kommen server-gerendert als children.
export function AktionsForm({
  action,
  children,
  className,
  submitLabel = "Speichern",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {state.fehler && <span className="text-sm text-red-600">{state.fehler}</span>}
        {state.ok && !pending && <span className="text-sm text-emerald-700">✓ gespeichert</span>}
      </div>
    </form>
  );
}

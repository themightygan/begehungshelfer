"use client";

import { useState, useTransition } from "react";

// Freitext-Mangel anlegen mit kurzer Rückmeldung "✓ +1 erstellt" (der neue
// Eintrag erscheint unten; der Button bleibt wählbar, da mehrfach möglich).
export function FreitextMangelButton({
  action,
}: {
  action: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await action();
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        })
      }
      className={`rounded-full border border-dashed px-3.5 py-2 text-sm disabled:opacity-60 ${
        done
          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
          : "border-stone-400 text-stone-600 hover:bg-stone-100"
      }`}
    >
      {pending ? "wird erstellt…" : done ? "✓ +1 erstellt" : "+ Sonstiger Punkt (Freitext)"}
    </button>
  );
}

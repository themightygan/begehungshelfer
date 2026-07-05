"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

// Formular mit Auto-Save: speichert bei jeder committeten Feldänderung
// (Text: beim Verlassen des Felds; Select/Checkbox/Datum: sofort) über die
// übergebene Server-Action — OHNE React-Form-Submit. Dadurch gibt es keinen
// React-19-Form-Reset (Felder sprangen sonst nach dem Speichern auf den
// alten Wert zurück) und keine Speichern-Knöpfe mehr.
export function AutoSaveForm({
  action,
  className,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<"" | "speichert" | "ok" | "fehler">("");
  const [, startTransition] = useTransition();

  function speichere() {
    const form = ref.current;
    if (!form) return;
    const fd = new FormData(form);
    setStatus("speichert");
    startTransition(async () => {
      try {
        await action(fd);
        setStatus("ok");
        router.refresh();
        setTimeout(() => setStatus(""), 2500);
      } catch {
        setStatus("fehler");
      }
    });
  }

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        speichere();
      }}
      onChange={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(speichere, 600); // Mehrfach-Änderungen bündeln
      }}
    >
      {children}
      <span
        className={`text-xs ${
          status === "fehler" ? "font-medium text-red-600" : "text-stone-600"
        }`}
        aria-live="polite"
      >
        {status === "speichert" && "speichert…"}
        {status === "ok" && "✓ gespeichert"}
        {status === "fehler" && (
          <>
            <TriangleAlert className="mr-1 inline h-3 w-3 align-text-bottom" aria-hidden />
            nicht gespeichert — Verbindung prüfen
          </>
        )}
      </span>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";

// Tabellenzeile, die als Ganzes klickbar ist (Links lassen sich nicht um <tr>
// legen). Klicks auf Links/Buttons INNERHALB der Zeile (z. B. Pächter- oder
// PDF-Link) behalten ihr eigenes Ziel und lösen die Zeile nicht aus.
export function KlickZeile({
  href,
  id,
  className,
  children,
}: {
  href: string;
  id?: string; // Anker-Ziel für Rücksprung aus der Ansicht (#p-<parzelleId>)
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      id={id}
      className={`${className ?? ""} cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-700`}
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        // Modifier-Klicks nicht kapern: Cmd/Ctrl/Shift-Klick soll auf den
        // Links in der Zeile das normale Browser-Verhalten behalten.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if ((e.target as HTMLElement).closest("a,button,input,select")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

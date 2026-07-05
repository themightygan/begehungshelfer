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
      className={`${className ?? ""} cursor-pointer`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

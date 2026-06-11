"use client";

import { useEffect } from "react";

// Registriert den Service Worker (Offline-Shell für den Begehungsmodus).
// Nur eingebunden, wenn eingeloggt (Layout) — die Login-Seite braucht ihn nicht.
export function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

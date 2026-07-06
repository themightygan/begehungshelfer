"use client";

import { useEffect, useState } from "react";
import { ZoomIn } from "lucide-react";

// Zoom/Textgröße für die ganze App: skaliert die Root-Schriftgröße (rem-Basis
// von Tailwind) statt CSS-zoom — zoom auf <body> rendert auf iOS-Safari
// fehlerhaft (Texte überlappen Nachbarelemente, Vorfall 2026-07-06).
const STUFEN = [75, 100, 125, 150];

function anwenden(v: number) {
  document.documentElement.style.fontSize = v === 100 ? "" : `${v}%`;
  document.body.style.zoom = ""; // Altlast vom früheren zoom-Ansatz entfernen
}

export function ZoomControl() {
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const gespeichert = Number(localStorage.getItem("zoom")) || 100;
    setZoom(gespeichert);
    anwenden(gespeichert);
  }, []);

  function aendern(v: number) {
    setZoom(v);
    localStorage.setItem("zoom", String(v));
    anwenden(v);
  }

  return (
    <label className="flex items-center gap-1 text-sm text-stone-500" title="Zoom / Textgröße">
      <ZoomIn className="h-4 w-4" aria-hidden />
      <select
        value={zoom}
        onChange={(e) => aendern(Number(e.target.value))}
        className="rounded border border-stone-300 px-2 py-1 text-sm"
      >
        {STUFEN.map((s) => (
          <option key={s} value={s}>
            {s}%
          </option>
        ))}
      </select>
    </label>
  );
}

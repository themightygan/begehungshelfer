"use client";

import { useEffect, useState } from "react";

// Zoom/Textgröße für die ganze App (per CSS-zoom auf <body>), in localStorage gemerkt.
const STUFEN = [75, 100, 125, 150];

export function ZoomControl() {
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const gespeichert = Number(localStorage.getItem("zoom")) || 100;
    setZoom(gespeichert);
    document.body.style.zoom = String(gespeichert / 100);
  }, []);

  function aendern(v: number) {
    setZoom(v);
    localStorage.setItem("zoom", String(v));
    document.body.style.zoom = String(v / 100);
  }

  return (
    <label className="flex items-center gap-1 text-sm text-stone-500" title="Zoom / Textgröße">
      🔍
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

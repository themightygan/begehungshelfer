"use client";

import { useState } from "react";

// Foto-Vorschau: Klick öffnet ein Vollbild-Overlay (Lightbox), Klick schließt es.
// Schnelles Ansehen ohne neuen Tab.
export function Thumb({
  src,
  alt = "Foto",
  className = "aspect-square w-full rounded object-cover",
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        className={`${className} cursor-zoom-in`}
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded shadow-lg" />
          <button
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-lg font-bold text-stone-800"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

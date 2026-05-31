"use client";

import { useRef, useState } from "react";

// Textarea mit Diktat-Knopf: nimmt Audio auf, schickt es an /api/transkript
// (Whisper + Ollama-Glättung) und hängt den geglätteten Text an.
export function DiktatTextarea({
  name,
  defaultValue,
  placeholder,
  rows = 2,
  className,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [status, setStatus] = useState<"idle" | "rec" | "busy">("idle");

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("busy");
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "diktat");
        try {
          const res = await fetch("/api/transkript", { method: "POST", body: fd });
          const j = await res.json();
          if (j.text && taRef.current) {
            const cur = taRef.current.value.replace(/\s*$/, "");
            taRef.current.value = cur ? `${cur} ${j.text}` : j.text;
          }
        } catch {
          /* ignore */
        }
        setStatus("idle");
      };
      mrRef.current = mr;
      mr.start();
      setStatus("rec");
    } catch {
      alert("Mikrofon nicht verfügbar oder Zugriff verweigert.");
    }
  }

  return (
    <div>
      <textarea
        ref={taRef}
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      <button
        type="button"
        onClick={() => (status === "rec" ? mrRef.current?.stop() : start())}
        disabled={status === "busy"}
        className={`mt-1 rounded px-3 py-1.5 text-sm font-medium ${
          status === "rec"
            ? "bg-red-600 text-white hover:bg-red-700"
            : status === "busy"
              ? "bg-stone-300 text-stone-600"
              : "border border-stone-300 text-stone-700 hover:bg-stone-50"
        }`}
      >
        {status === "rec" ? "⏹ Stoppen & einfügen" : status === "busy" ? "⏳ Transkribiere…" : "🎤 Diktat"}
      </button>
    </div>
  );
}

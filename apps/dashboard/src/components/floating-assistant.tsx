"use client";

import { useState } from "react";
import AssistantPanel from "@/components/assistant-panel";

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
      {open ? (
        <div className="w-[min(92vw,420px)]">
          <AssistantPanel className="shadow-[0_18px_60px_rgba(0,0,0,0.45)]" />
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Ocultar asistente ALFA" : "Abrir asistente ALFA"}
        title={open ? "Oculta el asistente ALFA." : "Abre el asistente ALFA en esta vista."}
        onClick={() => setOpen((current) => !current)}
        className="h-11 rounded-md border border-cyan-400/35 bg-cyan-500/20 px-4 text-sm font-semibold text-cyan-50 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:bg-cyan-500/30"
      >
        {open ? "Cerrar ALFA" : "Asistente ALFA"}
      </button>
    </div>
  );
}

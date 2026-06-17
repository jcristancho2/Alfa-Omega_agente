"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import DashboardAutoRefresh from "@/components/dashboard-auto-refresh";
import DashboardNav from "@/components/dashboard-nav";
import FloatingAssistant from "@/components/floating-assistant";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <main className="min-h-screen bg-[#030a13] text-slate-100">
      <DashboardAutoRefresh />
      <button
        type="button"
        aria-controls="application-sidebar"
        aria-expanded={open}
        aria-label={open ? "Ocultar menú lateral" : "Mostrar menú lateral"}
        title={open ? "Oculta el menú lateral." : "Muestra el menú lateral."}
        onClick={() => setOpen((current) => !current)}
        className="fixed left-3 top-3 z-50 rounded-md border border-cyan-400/30 bg-[#07111f]/95 px-3 py-2 text-sm font-semibold text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur transition hover:bg-sky-500/20"
      >
        {open ? "Cerrar" : "Menú"}
      </button>

      <div
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        id="application-sidebar"
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(86vw,280px)] flex-col overflow-y-auto border-r border-sky-500/15 bg-[#06101d] px-4 pb-5 pt-16 shadow-[12px_0_36px_rgba(0,0,0,0.4)] transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-7 flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded bg-cyan-400/10 text-xl font-bold text-cyan-300 ring-1 ring-cyan-400/30">A</div>
          <div>
            <p className="text-xl font-bold tracking-wide">ALFA-OMEGA</p>
            <p className="text-xs font-medium uppercase text-slate-500">Trading Console</p>
          </div>
        </div>
        <DashboardNav onNavigate={() => setOpen(false)} />
        <div className="mt-auto rounded-md border border-sky-400/15 bg-[#081727] p-4">
          <p className="text-xs text-slate-500">Entorno activo</p>
          <p className="mt-1 text-sm font-semibold text-emerald-300">Paper trading local</p>
          <p className="mt-4 text-xs text-slate-500">El menú se oculta automáticamente al navegar.</p>
        </div>
      </aside>

      <div className="min-w-0 pt-14 sm:pt-12">{children}</div>
      <FloatingAssistant />
    </main>
  );
}

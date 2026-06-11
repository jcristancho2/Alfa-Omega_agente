import type { ReactNode } from "react";
import DashboardAutoRefresh from "@/components/dashboard-auto-refresh";
import DashboardNav from "@/components/dashboard-nav";

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#030a13] text-slate-100">
      <DashboardAutoRefresh />
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="border-b border-sky-500/15 bg-[#06101d] px-3 py-3 shadow-[inset_-1px_0_0_rgba(56,189,248,0.08)] sm:px-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:py-5">
          <div className="mb-3 flex items-center gap-3 lg:mb-8">
            <div className="grid size-9 shrink-0 place-items-center rounded bg-cyan-400/10 text-lg font-bold text-cyan-300 ring-1 ring-cyan-400/30 lg:size-10 lg:text-xl">A</div>
            <div>
              <p className="font-bold tracking-wide lg:text-xl">ALFA-OMEGA</p>
              <p className="text-[10px] font-medium uppercase text-slate-500 lg:text-xs">Trading Console</p>
            </div>
          </div>
          <DashboardNav />
          <div className="mt-auto hidden rounded-md border border-sky-400/15 bg-[#081727] p-4 lg:block">
            <p className="text-xs text-slate-500">Entorno activo</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">Paper trading local</p>
            <p className="mt-4 text-xs text-slate-500">Cada vista explica sus datos y acciones.</p>
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}

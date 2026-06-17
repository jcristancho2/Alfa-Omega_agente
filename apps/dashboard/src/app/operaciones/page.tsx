import HistoryTabs from "@/components/history-tabs";
import PageHeading from "@/components/page-heading";
import { loadDashboardData } from "@/lib/dashboard-data";

export default async function OperationsPage() {
  const data = await loadDashboardData();
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Estado e historial de operaciones" description="Consulta únicamente datos reportados por el broker: órdenes abiertas, ejecuciones confirmadas y posiciones actuales. La vista refresca por polling y Supabase Realtime cuando está disponible." /><section className="grid gap-3 sm:grid-cols-3">{[["Órdenes en curso", data.brokerRows.length, "Órdenes abiertas reportadas por IBKR que todavía pueden aceptar cancelación."], ["Ejecuciones confirmadas", data.executionRows.length, "Operaciones ejecutadas y confirmadas por el broker en la sesión disponible."], ["Posiciones abiertas", data.positionRows.length, "Exposición actual y PnL reportado por el broker."]].map(([label, value, help]) => <article key={String(label)} className="rounded-md border border-sky-400/15 bg-[#07111f] p-4"><p className="text-xs text-slate-500">{String(label)}</p><p className="mt-1 text-2xl font-bold text-sky-100">{String(value)}</p><p className="mt-2 text-[11px] leading-4 text-slate-500">{String(help)}</p></article>)}</section><HistoryTabs brokerRows={data.brokerRows} executionRows={data.executionRows} positionRows={data.positionRows} /></div>;
}

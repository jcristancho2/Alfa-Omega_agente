import HistoryTabs from "@/components/history-tabs";
import PageHeading from "@/components/page-heading";
import { asNumber, asText, loadDashboardData, money } from "@/lib/dashboard-data";

export default async function Home() {
  const data = await loadDashboardData();
  const latestSignal = data.signals[0];

  return (
    <>
      <section className="grid grid-cols-2 gap-px border-b border-sky-500/15 bg-sky-500/10 lg:grid-cols-4">
        <StatusCell label="Estado del bot" value={asText(data.status?.status, "offline")} tone={asText(data.status?.status) === "active" ? "text-emerald-300" : "text-rose-300"} />
        <StatusCell label="Modo de trading" value={asText(data.status?.trading_mode, "simulated")} tone="text-sky-300" />
        <StatusCell label="Hora del servidor" value={new Date().toLocaleTimeString("es-CO")} tone="text-slate-100" />
        <StatusCell label="Broker" value={data.brokerOnline ? `Online · ${data.availableBrokers.length} adaptadores` : "Gateway offline"} tone={data.brokerOnline ? "text-emerald-300" : "text-rose-300"} />
      </section>
      <div className="space-y-4 p-3 sm:p-4 lg:p-5">
        <PageHeading eyebrow="Centro operativo" title="Inicio" description="Resumen del estado operativo. Las acciones de bot, órdenes paper IBKR, automatización e historial viven en vistas separadas del menú." />
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Capital local" value={money(asNumber(data.status?.capital))} detail="Capital informado por el motor" />
          <MetricCard label="PnL diario" value={money(asNumber(data.status?.daily_pnl))} detail="Resultado acumulado del día" />
          <MetricCard label="Órdenes broker" value={String(data.brokerRows.length)} detail="Órdenes abiertas reportadas" />
          <MetricCard label="Posiciones" value={String(data.positionRows.length)} detail="Posiciones activas del broker" />
          <MetricCard label="Señales" value={String(data.signals.length)} detail={`Última: ${asText(latestSignal?.symbol)}`} />
        </section>
        <HistoryTabs brokerRows={data.brokerRows} executionRows={data.executionRows} positionRows={data.positionRows} />
      </div>
    </>
  );
}

function StatusCell({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className="min-w-0 bg-[#07111f] px-3 py-3 sm:px-5"><p className="text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p><p className={`mt-1 truncate text-xs font-semibold uppercase sm:text-sm ${tone}`} title={value}>{value}</p></div>;
}

function MetricCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return <div className="min-w-0 rounded-md border border-sky-400/15 bg-[#07111f] p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-50">{value}</p><p className="mt-1 text-[11px] leading-4 text-slate-400">{detail}</p></div>;
}

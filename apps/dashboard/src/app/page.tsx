import AssistantPanel from "@/components/assistant-panel";
import ControlPanel from "@/components/control-panel";
import HistoryTabs from "@/components/history-tabs";
import PageHeading from "@/components/page-heading";
import TradingAutomationPanel from "@/components/trading-automation-panel";
import { asNumber, asText, loadDashboardData, money } from "@/lib/dashboard-data";

export default async function Home() {
  const data = await loadDashboardData();
  const latestSignal = data.signals[0];
  const closedTrades = data.trades.filter((trade) => asText(trade.status) === "closed");
  const winRate = closedTrades.length
    ? (closedTrades.filter((trade) => asNumber(trade.pnl) > 0).length / closedTrades.length) * 100
    : 0;
  const signalRows = data.signals.slice(0, 8).map((signal) => [
    asText(signal.created_at).slice(11, 16),
    asText(signal.symbol),
    asText(signal.direction),
    `${asNumber(signal.score) || "-"}/13`,
    asText(signal.strategy),
    asText(signal.status)
  ]);
  const tradeRows = data.trades.slice(0, 8).map((trade) => [
    asText(trade.symbol),
    asText(trade.direction),
    String(trade.entry_price ?? "-"),
    String(trade.exit_price ?? "-"),
    money(asNumber(trade.pnl)),
    asText(trade.status)
  ]);

  return (
    <>
      <section className="grid grid-cols-2 gap-px border-b border-sky-500/15 bg-sky-500/10 lg:grid-cols-4">
        <StatusCell label="Estado del bot" value={asText(data.status?.status, "offline")} tone={asText(data.status?.status) === "active" ? "text-emerald-300" : "text-rose-300"} />
        <StatusCell label="Modo de trading" value={asText(data.status?.trading_mode, "simulated")} tone="text-sky-300" />
        <StatusCell label="Hora del servidor" value={new Date().toLocaleTimeString("es-CO")} tone="text-slate-100" />
        <StatusCell label="Broker" value={data.brokerOnline ? `Online · ${data.availableBrokers.length} adaptadores` : "Gateway offline"} tone={data.brokerOnline ? "text-emerald-300" : "text-rose-300"} />
      </section>
      <div className="space-y-4 p-3 sm:p-4 lg:p-5">
        <PageHeading eyebrow="Centro de control" title="Dashboard" description="Resumen del estado operativo. Usa las vistas del menú para profundizar en señales, operaciones, riesgo, brokers, notificaciones y logs." />
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard label="Capital local" value={money(asNumber(data.status?.capital))} detail="Capital informado por el motor" />
          <MetricCard label="PnL diario" value={money(asNumber(data.status?.daily_pnl))} detail="Resultado acumulado del día" />
          <MetricCard label="Órdenes broker" value={String(data.brokerRows.length)} detail="Órdenes abiertas reportadas" />
          <MetricCard label="Posiciones" value={String(data.positionRows.length)} detail="Posiciones activas del broker" />
          <MetricCard label="Señales" value={String(data.signals.length)} detail={`Última: ${asText(latestSignal?.symbol)}`} />
          <MetricCard label="Operaciones locales" value={String(data.trades.length)} detail={`Win rate cerrado: ${winRate.toFixed(0)}%`} />
        </section>
        <section className="grid items-start gap-4 2xl:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]">
          <div className="min-w-0 space-y-4">
            <ControlPanel />
            <TradingAutomationPanel />
          </div>
          <AssistantPanel />
        </section>
        <HistoryTabs brokerRows={data.brokerRows} executionRows={data.executionRows} positionRows={data.positionRows} signalRows={signalRows} tradeRows={tradeRows} />
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

import HistoryTabs from "@/components/history-tabs";
import { DataTable, ViewSection } from "@/components/operational-views";
import PageHeading from "@/components/page-heading";
import { loadDashboardData } from "@/lib/dashboard-data";

export default async function OperationsPage() {
  const data = await loadDashboardData();
  const signalRows = data.signals.slice(0, 30).map((row) => [String(row.created_at ?? "-").slice(11, 16), String(row.symbol ?? "-"), String(row.direction ?? "-"), String(row.score ?? "-"), String(row.strategy ?? "-"), String(row.status ?? "-")]);
  const tradeRows = data.trades.slice(0, 30).map((row) => [String(row.symbol ?? "-"), String(row.direction ?? "-"), String(row.entry_price ?? "-"), String(row.exit_price ?? "-"), String(row.pnl ?? "-"), String(row.status ?? "-")]);
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Operaciones" description="Vista consolidada para seguir órdenes del broker, posiciones, ejecuciones confirmadas y operaciones registradas por el motor local." /><HistoryTabs brokerRows={data.brokerRows} executionRows={data.executionRows} positionRows={data.positionRows} signalRows={signalRows} tradeRows={tradeRows} /><ViewSection title="Operaciones locales" description="Estas operaciones pertenecen al registro local. Una orden enviada al broker solo se considera ejecutada cuando aparece confirmada como fill."><DataTable rows={data.trades} columns={[["symbol", "Instrumento"], ["direction", "Dirección"], ["entry_price", "Entrada"], ["exit_price", "Salida"], ["pnl", "PnL"], ["status", "Estado"]]} /></ViewSection></div>;
}

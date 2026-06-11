import { DataTable, ViewSection, stringRows } from "@/components/operational-views";
import PageHeading from "@/components/page-heading";
import { loadDashboardData } from "@/lib/dashboard-data";

export default async function BrokersPage() {
  const data = await loadDashboardData();
  const brokerRows = stringRows(data.brokerRows, ["orderId", "symbol", "side", "quantity", "limit", "status", "remaining"]);
  const positions = stringRows(data.positionRows, ["symbol", "quantity", "marketPrice", "averageCost", "unrealizedPnl", "realizedPnl"]);
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Brokers" description="Comprueba la disponibilidad de adaptadores y revisa las órdenes y posiciones que reporta el broker. Esta vista no habilita trading live." /><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.availableBrokers.map((broker) => <article key={broker.id} className="rounded-md border border-emerald-400/20 bg-[#07111f] p-4"><p className="font-semibold">{broker.name}</p><p className="mt-1 text-xs text-emerald-300">Adaptador disponible · paper</p><p className="mt-2 text-xs text-slate-500">ID: {broker.id}</p></article>)}</section><ViewSection title="Órdenes abiertas" description="Órdenes todavía activas en el broker. El estado Submitted no significa que ya fueron ejecutadas."><DataTable rows={brokerRows} columns={[["orderId", "Order ID"], ["symbol", "Instrumento"], ["side", "Dirección"], ["quantity", "Cantidad"], ["limit", "Límite"], ["status", "Estado"], ["remaining", "Restante"]]} /></ViewSection><ViewSection title="Posiciones" description="Exposición actual reportada por el broker y su resultado no realizado."><DataTable rows={positions} columns={[["symbol", "Instrumento"], ["quantity", "Posición"], ["marketPrice", "Precio"], ["averageCost", "Costo"], ["unrealizedPnl", "PnL no realizado"], ["realizedPnl", "PnL realizado"]]} /></ViewSection></div>;
}

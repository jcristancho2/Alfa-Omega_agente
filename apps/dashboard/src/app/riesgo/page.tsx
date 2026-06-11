import PageHeading from "@/components/page-heading";
import RiskSettingsPanel from "@/components/risk-settings-panel";
import { loadDashboardData } from "@/lib/dashboard-data";

export default async function RiskPage() {
  const { risk, riskSettings } = await loadDashboardData();
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Riesgo" description="Configura las barreras que se validan antes de cada preview y envío. Los cambios afectan las próximas órdenes y quedan registrados en logs." /><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Operaciones abiertas", risk?.open_trades], ["Máximo abiertas", risk?.max_open_trades], ["Riesgo diario usado", risk?.daily_risk_used], ["Riesgo restante", risk?.remaining_daily_risk]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-sky-400/15 bg-[#07111f] p-4"><p className="text-xs text-slate-500">{String(label)}</p><p className="mt-1 text-xl font-bold text-sky-100">{String(value ?? "-")}</p></div>)}</section><RiskSettingsPanel initial={riskSettings} /></div>;
}

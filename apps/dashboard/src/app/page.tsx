import DashboardAutoRefresh from "@/components/dashboard-auto-refresh";
import AssistantPanel from "@/components/assistant-panel";
import ControlPanel from "@/components/control-panel";

type ApiResult<T> = { ok: boolean; data: T };

type BotStatus = {
  status: string;
  trading_mode: string;
  capital: number;
  daily_pnl: number;
};

type RiskSnapshot = {
  open_trades: number;
  max_open_trades: number;
  daily_risk_used: number;
  daily_risk_limit: number;
  remaining_daily_risk: number;
};

type SignalRow = Record<string, unknown>;
type TradeRow = Record<string, unknown>;

async function getJson<T>(path: string): Promise<T | null> {
  const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
  try {
    const res = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResult<T>;
    return json.data;
  } catch {
    return null;
  }
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asText(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function numberValue(value: unknown) {
  const numeric = asNumber(value, Number.NaN);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(numeric)
    : "-";
}

function statusTone(value: string) {
  if (value === "active" || value === "processed" || value === "closed") {
    return "text-emerald-300";
  }
  if (value === "risk_locked" || value === "rejected") return "text-rose-300";
  if (value === "pending" || value === "open") return "text-sky-300";
  return "text-slate-300";
}

function directionTone(value: string) {
  if (value === "BUY") return "text-emerald-300";
  if (value === "SELL") return "text-rose-300";
  return "text-slate-300";
}

export default async function Home() {
  const status = await getJson<BotStatus>("/status");
  const signals = (await getJson<SignalRow[]>("/signals")) ?? [];
  const trades = (await getJson<TradeRow[]>("/trades")) ?? [];
  const risk = await getJson<RiskSnapshot>("/risk");

  const latestSignal = signals[0];
  const latestScore = asNumber(latestSignal?.score);
  const closedTrades = trades.filter((trade) => asText(trade.status) === "closed");
  const winTrades = closedTrades.filter((trade) => asNumber(trade.pnl) > 0);
  const winRate = closedTrades.length ? (winTrades.length / closedTrades.length) * 100 : 0;
  const currentCapital = status?.capital ?? 0;
  const dailyPnl = status?.daily_pnl ?? 0;
  const dailyRiskUsed = risk?.daily_risk_used ?? 0;
  const dailyRiskLimit = risk?.daily_risk_limit ?? 0;
  const riskPct = dailyRiskLimit > 0 ? (dailyRiskUsed / dailyRiskLimit) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#030a13] text-slate-100">
      <DashboardAutoRefresh />
      <div className="grid min-h-screen lg:grid-cols-[256px_1fr]">
        <aside className="border-b border-sky-500/15 bg-[#06101d] px-4 py-5 shadow-[inset_-1px_0_0_rgba(56,189,248,0.08)] lg:border-b-0">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded bg-cyan-400/10 text-xl font-bold text-cyan-300 ring-1 ring-cyan-400/30">
              A
            </div>
            <div>
              <p className="text-xl font-bold tracking-wide">ALFA-OMEGA</p>
              <p className="text-xs font-medium uppercase text-slate-500">Trading Console</p>
            </div>
          </div>

          <nav className="space-y-2 text-sm font-medium text-slate-300">
            <div className="rounded-md border border-sky-400/25 bg-sky-500/15 px-3 py-2.5 text-sky-100 shadow-[0_0_18px_rgba(14,165,233,0.12)]">
              Dashboard
            </div>
            {["Señales", "Operaciones", "Riesgo", "Backtesting", "Brokers", "Notificaciones", "Logs"].map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="block w-full cursor-not-allowed rounded-md px-3 py-2.5 text-left text-slate-600 opacity-70"
                  title="Módulo pendiente de crear"
                >
                  <span className="flex items-center justify-between">
                    {item}
                    <span className="font-mono text-[10px] uppercase text-slate-700">off</span>
                  </span>
                </button>
              )
            )}
          </nav>

          <div className="mt-8 rounded-md border border-sky-400/15 bg-[#081727] p-4">
            <p className="text-xs text-slate-500">Entorno activo</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">Producción local</p>
            <p className="mt-5 text-xs text-slate-500">Versión</p>
            <p className="mt-1 font-mono text-sm text-slate-300">v0.1.0</p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="grid gap-px border-b border-sky-500/15 bg-sky-500/10 md:grid-cols-4">
            <StatusCell label="Estado del bot" value={status?.status ?? "offline"} tone={statusTone(status?.status ?? "")} />
            <StatusCell label="Modo de trading" value={status?.trading_mode ?? "simulated"} tone="text-sky-300" />
            <StatusCell label="Hora del servidor" value={new Date().toLocaleTimeString("es-CO")} tone="text-slate-100" />
            <StatusCell label="Entorno" value="LIVE DATA LOCAL" tone="text-emerald-300" />
          </header>

          <div className="space-y-4 p-4 lg:p-5">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Capital actual" value={money(currentCapital)} detail="Equidad simulada" />
              <MetricCard
                label="PnL del día"
                value={money(dailyPnl)}
                detail={dailyPnl >= 0 ? "Sesión positiva" : "Sesión negativa"}
                valueClass={dailyPnl >= 0 ? "text-emerald-300" : "text-rose-300"}
              />
              <MetricCard
                label="Riesgo usado"
                value={`${riskPct.toFixed(1)}%`}
                detail={`${money(dailyRiskUsed)} / ${money(dailyRiskLimit)}`}
                valueClass={riskPct > 80 ? "text-rose-300" : "text-sky-300"}
              />
              <MetricCard label="Operaciones hoy" value={String(trades.length)} detail={`Ganadoras: ${winTrades.length} (${winRate.toFixed(0)}%)`} />
              <MetricCard label="Señales activas" value={String(signals.length)} detail="Monitoreo local" />
              <MetricCard label="Trades abiertos" value={`${risk?.open_trades ?? 0}/${risk?.max_open_trades ?? 0}`} detail="Límite operativo" />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-md border border-sky-400/15 bg-[#07111f] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold">Señal actual</h2>
                    <span className="rounded bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                      ACTIVA
                    </span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-center gap-4">
                    <div className="grid aspect-square place-items-center rounded-full bg-[conic-gradient(#34d399_0_70%,rgba(15,23,42,0.9)_70%)] p-2">
                      <div className="grid size-full place-items-center rounded-full bg-[#07111f]">
                        <div className="text-center">
                          <p className="text-3xl font-bold">{latestScore ? latestScore.toFixed(1) : "-"}</p>
                          <p className="text-xs text-slate-500">/13</p>
                        </div>
                      </div>
                    </div>
                    <dl className="space-y-2 text-sm">
                      <InfoRow label="Dirección" value={asText(latestSignal?.direction)} valueClass={directionTone(asText(latestSignal?.direction))} />
                      <InfoRow label="Estrategia" value={asText(latestSignal?.strategy)} />
                      <InfoRow label="Instrumento" value={asText(latestSignal?.symbol)} />
                      <InfoRow label="Estado" value={asText(latestSignal?.status)} valueClass={statusTone(asText(latestSignal?.status))} />
                    </dl>
                  </div>
                </div>

                <div className="rounded-md border border-sky-400/15 bg-[#07111f] p-4">
                  <h2 className="mb-3 text-base font-semibold">Gestión de riesgo</h2>
                  <dl className="space-y-2 text-sm">
                    <InfoRow label="Riesgo usado" value={money(dailyRiskUsed)} />
                    <InfoRow label="Límite diario" value={money(dailyRiskLimit)} />
                    <InfoRow label="Restante" value={money(risk?.remaining_daily_risk ?? 0)} valueClass="text-emerald-300" />
                    <InfoRow label="Modo" value={status?.trading_mode ?? "simulated"} valueClass="text-sky-300" />
                  </dl>
                </div>
              </div>

              <div className="space-y-4">
                <ControlPanel />
                <AssistantPanel />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <DataPanel title="Últimas señales">
                <DenseTable
                  headers={["Hora", "Instrumento", "Dirección", "Score", "Estrategia", "Estado"]}
                  rows={signals.slice(0, 8).map((signal) => [
                    asText(signal.created_at).slice(11, 16),
                    asText(signal.symbol),
                    asText(signal.direction),
                    `${numberValue(signal.score)}/13`,
                    asText(signal.strategy),
                    asText(signal.status)
                  ])}
                />
              </DataPanel>

              <DataPanel title="Operaciones recientes">
                <DenseTable
                  headers={["Instrumento", "Dirección", "Entrada", "Salida", "PnL", "Estado"]}
                  rows={trades.slice(0, 8).map((trade) => [
                    asText(trade.symbol),
                    asText(trade.direction),
                    numberValue(trade.entry_price),
                    numberValue(trade.exit_price),
                    money(asNumber(trade.pnl)),
                    asText(trade.status)
                  ])}
                />
              </DataPanel>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCell({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="bg-[#07111f] px-5 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-semibold uppercase ${tone}`}>{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  valueClass = "text-slate-50"
}: {
  label: string;
  value: string;
  detail: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-sky-400/15 bg-[#07111f] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.24)]">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-2 text-xs font-medium text-slate-400">{detail}</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueClass = "text-slate-100"
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-sky-400/10 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-semibold ${valueClass}`}>{value}</dd>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-sky-400/15 bg-[#07111f]">
      <div className="border-b border-sky-400/10 px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DenseTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-xs">
        <thead className="bg-slate-950/70 text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={`${row.join("-")}-${rowIndex}`} className="border-t border-sky-400/10">
                {row.map((cell, index) => (
                  <td
                    key={`${cell}-${index}`}
                    className={
                      index === 2
                        ? `px-4 py-3 font-semibold ${directionTone(cell)}`
                        : index === row.length - 1
                          ? `px-4 py-3 font-semibold ${statusTone(cell)}`
                          : "px-4 py-3 text-slate-300"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-4 py-6 text-center text-slate-500">
                Sin datos todavía
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

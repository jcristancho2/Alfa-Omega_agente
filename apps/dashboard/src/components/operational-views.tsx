import RiskSettingsPanel, { type RiskSettings } from "@/components/risk-settings-panel";
import type { ReactNode } from "react";

type Row = Record<string, unknown>;

function value(row: Row, key: string) {
  const item = row[key];
  if (item === null || item === undefined) return "-";
  if (typeof item === "object") return JSON.stringify(item);
  return String(item);
}

export function DataTable({ columns, rows }: { columns: Array<[string, string]>; rows: Row[] }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.length ? rows.slice(0, 30).map((row, index) => (
          <article key={String(row.id ?? index)} className="rounded border border-sky-400/10 bg-slate-950/45 p-3">
            <dl className="space-y-2">
              {columns.map(([key, label]) => (
                <div key={key} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1.2fr)] gap-3 text-xs">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="break-words text-right text-slate-300" title={value(row, key)}>{value(row, key)}</dd>
                </div>
              ))}
            </dl>
          </article>
        )) : <p className="rounded border border-sky-400/10 px-3 py-6 text-center text-xs text-slate-500">Sin datos todavía</p>}
      </div>
      <div className="hidden overflow-x-auto rounded border border-sky-400/10 md:block">
        <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-slate-950/70 text-slate-500"><tr>{columns.map(([key, label]) => <th key={key} className="px-3 py-2">{label}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.slice(0, 30).map((row, index) => <tr key={String(row.id ?? index)} className="border-t border-sky-400/10">{columns.map(([key]) => <td key={key} className="max-w-[360px] truncate px-3 py-2 text-slate-300" title={value(row, key)}>{value(row, key)}</td>)}</tr>) : <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">Sin datos todavía</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}

export function ViewSection({ children, description, id, title }: { children: ReactNode; description: string; id?: string; title: string }) {
  return <section id={id} className="scroll-mt-4 rounded-md border border-sky-400/15 bg-[#07111f] p-3 sm:p-4"><h2 className="text-base font-semibold">{title}</h2><p className="mb-4 mt-1 max-w-3xl text-xs leading-5 text-slate-500">{description}</p>{children}</section>;
}

export function stringRows(rows: string[][], keys: string[]) {
  return rows.map((row, index) => Object.fromEntries([["id", row[0] || index], ...keys.map((key, itemIndex) => [key, row[itemIndex]])]));
}

export default function OperationalViews({
  brokerRows,
  logs,
  notifications,
  positions,
  riskSettings,
  signals,
  trades
}: {
  brokerRows: string[][];
  logs: Row[];
  notifications: Row[];
  positions: string[][];
  riskSettings: RiskSettings;
  signals: Row[];
  trades: Row[];
}) {
  const brokerObjects = brokerRows.map((row, index) => ({ id: row[0] || index, symbol: row[1], side: row[2], quantity: row[3], limit: row[4], status: row[5], remaining: row[6] }));
  const positionObjects = positions.map((row, index) => ({ id: index, symbol: row[0], quantity: row[1], marketPrice: row[2], averageCost: row[3], unrealizedPnl: row[4], realizedPnl: row[5] }));
  return (
    <div className="space-y-4">
      <ViewSection id="operaciones" title="Operaciones" description="Operaciones locales abiertas, cerradas y canceladas.">
        <DataTable rows={trades} columns={[["symbol", "Instrumento"], ["direction", "Dirección"], ["entry_price", "Entrada"], ["exit_price", "Salida"], ["pnl", "PnL"], ["status", "Estado"]]} />
      </ViewSection>
      <ViewSection id="senales" title="Señales" description="Señales recibidas, procesadas o rechazadas por el motor.">
        <DataTable rows={signals} columns={[["created_at", "Fecha"], ["symbol", "Instrumento"], ["direction", "Dirección"], ["score", "Score"], ["strategy", "Estrategia"], ["status", "Estado"], ["reason", "Motivo"]]} />
      </ViewSection>
      <ViewSection id="riesgo" title="Riesgo" description="Configura los límites que protegen todas las órdenes manuales y automáticas.">
        <RiskSettingsPanel initial={riskSettings} />
      </ViewSection>
      <ViewSection id="brokers" title="Brokers y posiciones" description="Órdenes abiertas y posiciones reportadas por el broker.">
        <div className="space-y-3"><DataTable rows={brokerObjects} columns={[["id", "Order ID"], ["symbol", "Instrumento"], ["side", "Dirección"], ["quantity", "Cantidad"], ["limit", "Límite"], ["status", "Estado"]]} /><DataTable rows={positionObjects} columns={[["symbol", "Instrumento"], ["quantity", "Posición"], ["marketPrice", "Precio"], ["averageCost", "Costo"], ["unrealizedPnl", "PnL no realizado"]]} /></div>
      </ViewSection>
      <ViewSection id="notificaciones" title="Notificaciones" description="Mensajes pendientes y enviados por los workers.">
        <DataTable rows={notifications} columns={[["created_at", "Fecha"], ["channel", "Canal"], ["event_type", "Evento"], ["message", "Mensaje"], ["status", "Estado"]]} />
      </ViewSection>
      <ViewSection id="logs" title="Logs" description="Auditoría de acciones, cambios de riesgo y respuestas operativas.">
        <DataTable rows={logs} columns={[["created_at", "Fecha"], ["level", "Nivel"], ["message", "Evento"], ["metadata", "Metadata"]]} />
      </ViewSection>
    </div>
  );
}

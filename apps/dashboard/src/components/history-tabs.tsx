"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

interface HistoryTabsProps {
  brokerRows: string[][];
  executionRows: string[][];
  positionRows: string[][];
  signalRows: string[][];
  tradeRows: string[][];
}

const brokerHeaders = ["Order ID", "Instrumento", "Dirección", "Cantidad", "Límite", "Estado", "Restante"];
const brokerHeadersWithActions = [...brokerHeaders, ""];
const executionHeaders = ["Hora", "Instrumento", "Dirección", "Cantidad", "Precio", "Exchange"];
const positionHeaders = ["Instrumento", "Posición", "Precio mercado", "Costo prom.", "PnL no realizado", "PnL realizado"];
const signalHeaders = ["Hora", "Instrumento", "Dirección", "Score", "Estrategia", "Estado"];
const tradeHeaders = ["Instrumento", "Dirección", "Entrada", "Salida", "PnL", "Estado"];
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function directionTone(value: string) {
  if (value === "BUY") return "text-emerald-300";
  if (value === "SELL") return "text-rose-300";
  return "text-slate-300";
}

function statusTone(value: string) {
  if (value === "active" || value === "processed" || value === "closed" || value === "Filled") {
    return "text-emerald-300";
  }
  if (value === "risk_locked" || value === "rejected" || value === "Cancelled") {
    return "text-rose-300";
  }
  if (value === "pending" || value === "open" || value === "Submitted" || value === "PreSubmitted") {
    return "text-sky-300";
  }
  return "text-slate-300";
}

function DenseTable({
  directionIndex,
  headers,
  rows,
  statusIndex
}: {
  directionIndex?: number;
  headers: string[];
  rows: string[][];
  statusIndex?: number;
}) {
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
                      index === directionIndex
                        ? `px-4 py-3 font-semibold ${directionTone(cell)}`
                        : index === (statusIndex ?? row.length - 1)
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

function BrokerOrdersTable({
  cancellingOrderId,
  onCancel,
  rows
}: {
  cancellingOrderId: string | null;
  onCancel: (orderId: string) => void;
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-slate-950/70 text-slate-500">
          <tr>
            {brokerHeadersWithActions.map((header) => (
              <th key={header || "actions"} className="px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => {
              const orderId = row[0];
              const status = row[5];
              const canCancel = status === "Submitted" || status === "PreSubmitted";
              return (
                <tr key={`${row.join("-")}-${rowIndex}`} className="border-t border-sky-400/10">
                  {row.map((cell, index) => (
                    <td
                      key={`${cell}-${index}`}
                      className={
                        index === 2
                          ? `px-4 py-3 font-semibold ${directionTone(cell)}`
                          : index === 5
                            ? `px-4 py-3 font-semibold ${statusTone(cell)}`
                            : "px-4 py-3 text-slate-300"
                      }
                    >
                      {cell}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Cancelar orden ${orderId}`}
                      title={
                        canCancel
                          ? `Cancela la orden abierta ${orderId} en IBKR.`
                          : "Solo se pueden cancelar órdenes Submitted o PreSubmitted."
                      }
                      disabled={!canCancel || cancellingOrderId === orderId}
                      onClick={() => onCancel(orderId)}
                      className="rounded border border-rose-400/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/50 disabled:text-slate-600"
                    >
                      {cancellingOrderId === orderId ? "Cancelando" : "Cancelar"}
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={brokerHeadersWithActions.length} className="px-4 py-6 text-center text-slate-500">
                Sin datos todavía
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoryTabs({
  brokerRows,
  executionRows,
  positionRows,
  signalRows,
  tradeRows
}: HistoryTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "broker" | "executions" | "positions" | "signals" | "trades"
  >("broker");
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const tabs = [
    { id: "broker" as const, label: "IBKR Paper", count: brokerRows.length },
    { id: "positions" as const, label: "Posiciones", count: positionRows.length },
    { id: "executions" as const, label: "Ejecuciones", count: executionRows.length },
    { id: "signals" as const, label: "Señales", count: signalRows.length },
    { id: "trades" as const, label: "Operaciones", count: tradeRows.length }
  ];

  async function cancelOrder(orderId: string) {
    if (!orderId || orderId === "-") return;
    setCancellingOrderId(orderId);
    setCancelMessage("");
    try {
      const res = await fetch(`${apiBaseUrl}/api/trading/orders/${orderId}`, {
        headers: await operatorHeaders(),
        method: "DELETE"
      });
      const json = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "cancel failed");
      setCancelMessage(`Cancelada ${orderId}`);
      router.refresh();
    } catch (error) {
      setCancelMessage(error instanceof Error ? error.message : "cancel failed");
    } finally {
      setCancellingOrderId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-md border border-sky-400/15 bg-[#07111f]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-400/10 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Histórico</h2>
          <p className="min-h-4 font-mono text-[11px] text-slate-500">{cancelMessage}</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded border border-sky-400/15 bg-slate-950/70 p-1 sm:grid-cols-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-label={`Mostrar ${tab.label}`}
              title={`Muestra la tabla de ${tab.label.toLowerCase()}.`}
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "rounded bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100"
                  : "rounded px-3 py-1.5 text-xs font-semibold text-slate-500"
              }
            >
              {tab.label}
              <span className="ml-2 font-mono text-[10px]">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>
      {activeTab === "broker" ? (
        <BrokerOrdersTable
          cancellingOrderId={cancellingOrderId}
          onCancel={cancelOrder}
          rows={brokerRows}
        />
      ) : null}
      {activeTab === "positions" ? (
        <DenseTable headers={positionHeaders} rows={positionRows} />
      ) : null}
      {activeTab === "executions" ? (
        <DenseTable directionIndex={2} headers={executionHeaders} rows={executionRows} statusIndex={-1} />
      ) : null}
      {activeTab === "signals" ? (
        <DenseTable directionIndex={2} headers={signalHeaders} rows={signalRows} />
      ) : null}
      {activeTab === "trades" ? (
        <DenseTable directionIndex={1} headers={tradeHeaders} rows={tradeRows} />
      ) : null}
    </section>
  );
}

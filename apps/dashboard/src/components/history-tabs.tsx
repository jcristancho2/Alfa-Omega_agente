"use client";

import { useState } from "react";

interface HistoryTabsProps {
  brokerRows: string[][];
  executionRows: string[][];
  positionRows: string[][];
  signalRows: string[][];
  tradeRows: string[][];
}

const brokerHeaders = ["Order ID", "Instrumento", "Dirección", "Cantidad", "Límite", "Estado", "Restante"];
const executionHeaders = ["Hora", "Instrumento", "Dirección", "Cantidad", "Precio", "Exchange"];
const positionHeaders = ["Instrumento", "Posición", "Precio mercado", "Costo prom.", "PnL no realizado", "PnL realizado"];
const signalHeaders = ["Hora", "Instrumento", "Dirección", "Score", "Estrategia", "Estado"];
const tradeHeaders = ["Instrumento", "Dirección", "Entrada", "Salida", "PnL", "Estado"];

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

export default function HistoryTabs({
  brokerRows,
  executionRows,
  positionRows,
  signalRows,
  tradeRows
}: HistoryTabsProps) {
  const [activeTab, setActiveTab] = useState<
    "broker" | "executions" | "positions" | "signals" | "trades"
  >("broker");
  const tabs = [
    { id: "broker" as const, label: "IBKR Paper", count: brokerRows.length },
    { id: "positions" as const, label: "Posiciones", count: positionRows.length },
    { id: "executions" as const, label: "Ejecuciones", count: executionRows.length },
    { id: "signals" as const, label: "Señales", count: signalRows.length },
    { id: "trades" as const, label: "Operaciones", count: tradeRows.length }
  ];

  return (
    <section className="overflow-hidden rounded-md border border-sky-400/15 bg-[#07111f]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-400/10 px-4 py-3">
        <h2 className="text-base font-semibold">Histórico</h2>
        <div className="grid grid-cols-2 gap-1 rounded border border-sky-400/15 bg-slate-950/70 p-1 sm:grid-cols-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
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
        <DenseTable directionIndex={2} headers={brokerHeaders} rows={brokerRows} statusIndex={5} />
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

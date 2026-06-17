"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

type Row = Record<string, unknown>;

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const cancellableStatuses = new Set(["created", "submitted", "partially_filled"]);

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function canCancelOrder(row: Row) {
  return cancellableStatuses.has(text(row.normalized_status)) && text(row.broker_order_id) !== "-";
}

export default function ConsolidatedOrdersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function cancel(row: Row) {
    const id = text(row.id);
    if (!window.confirm(`¿Cancelar la orden ${text(row.symbol)} (${id})?`)) return;
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/orders/${encodeURIComponent(id)}`, {
        headers: await operatorHeaders(),
        method: "DELETE"
      });
      const result = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) throw new Error(String(result.error ?? "No se pudo cancelar"));
      setMessage(`Cancelación confirmada para ${text(row.symbol)}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cancelar");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="mb-3 min-h-4 font-mono text-[11px] text-slate-400">{message}</p>
      <div className="space-y-2 md:hidden">
        {rows.length ? rows.map((row) => {
          const id = text(row.id);
          const canCancel = canCancelOrder(row);
          return <article key={id} className="rounded border border-sky-400/10 bg-slate-950/45 p-3">
            <div className="flex items-start justify-between gap-3"><strong>{text(row.symbol)} · {text(row.side)}</strong><span className="text-xs text-sky-300">{text(row.normalized_status)}</span></div>
            <p className="mt-2 text-xs text-slate-400">{text(row.broker)} · {text(row.account_mode)} · {text(row.origin)}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-500">Broker ID: {text(row.broker_order_id)}</p>
            <button type="button" disabled={!canCancel || busyId === id} onClick={() => cancel(row)} title={canCancel ? "Solicita y confirma la cancelación con el broker." : "Solo puede cancelarse cuando existe un ID de orden del broker y el estado sigue activo."} className="mt-3 h-10 w-full rounded border border-rose-400/30 bg-rose-500/10 text-xs font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-40">{busyId === id ? "Cancelando..." : "Cancelar"}</button>
          </article>;
        }) : <p className="py-5 text-center text-xs text-slate-500">Sin órdenes persistidas todavía.</p>}
      </div>
      <div className="hidden overflow-x-auto rounded border border-sky-400/10 md:block">
        <table className="w-full min-w-[1000px] text-left text-xs">
          <thead className="bg-slate-950/70 text-slate-500"><tr>{["Fecha", "Símbolo", "Lado", "Cantidad", "Broker", "Modo", "Origen", "Broker ID", "Estado", ""].map((header) => <th key={header || "action"} className="px-3 py-2">{header}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map((row) => {
            const id = text(row.id);
            const canCancel = canCancelOrder(row);
            return <tr key={id} className="border-t border-sky-400/10">
              {[text(row.created_at).slice(0, 19), text(row.symbol), text(row.side), text(row.quantity), text(row.broker), text(row.account_mode), text(row.origin), text(row.broker_order_id), text(row.normalized_status)].map((cell, index) => <td key={`${id}-${index}`} className="px-3 py-2 text-slate-300">{cell}</td>)}
              <td className="px-3 py-2 text-right"><button type="button" disabled={!canCancel || busyId === id} onClick={() => cancel(row)} title={canCancel ? "Solicita y confirma la cancelación con el broker." : "Solo puede cancelarse cuando existe un ID de orden del broker y el estado sigue activo."} className="rounded border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-40">{busyId === id ? "Cancelando" : "Cancelar"}</button></td>
            </tr>;
          }) : <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-500">Sin órdenes persistidas todavía</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

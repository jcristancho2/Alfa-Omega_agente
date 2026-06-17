"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

type Status = "idle" | "loading" | "done" | "error";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function getResponseMessage(json: Record<string, unknown>) {
  const risk = json.risk as { reason?: unknown; rule?: unknown } | undefined;
  const broker = json.broker as { error?: unknown; risk?: { reason?: unknown; rule?: unknown } } | undefined;
  const error = json.error;

  if (typeof error === "string") return error;
  if (risk?.reason) return `${risk.reason}${risk.rule ? ` (${risk.rule})` : ""}`;
  if (broker?.risk?.reason) {
    return `${broker.risk.reason}${broker.risk.rule ? ` (${broker.risk.rule})` : ""}`;
  }
  if (broker?.error) return String(broker.error);
  return "request failed";
}

export default function ControlPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const busy = status === "loading";

  async function run(path: string, body?: Record<string, unknown>) {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await operatorHeaders()) },
        body: body ? JSON.stringify(body) : undefined
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(getResponseMessage(json));
      setStatus("done");
      setMessage(
        json?.orderId
          ? `${String(json.status || "ok")} ${String(json.orderId)}`
          : String(json?.response || json?.status || "ok")
      );
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "error");
    }
  }

  return (
    <section className="rounded-md border border-sky-400/15 bg-[#07111f] p-4">
      <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Controles del bot</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Acciones manuales para administrar el motor, simular datos y cerrar operaciones locales.</p>
        </div>
        <span
          className={
            status === "error"
              ? "rounded bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-300"
              : "rounded bg-sky-400/10 px-2 py-1 text-xs font-semibold text-sky-300"
          }
        >
          {status === "loading" ? "Procesando" : status === "error" ? "Error" : "Listo"}
        </span>
      </div>

      <p className="mb-2 text-xs text-slate-500">Estado del motor: pausa, reanuda o retira un bloqueo de riesgo después de revisarlo.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          aria-label="Pausar el procesamiento automático del bot"
          title="Pausa el bot para impedir que procese nuevas señales."
          disabled={busy}
          onClick={() => run("/pause")}
          className="rounded border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pausar
        </button>
        <button
          type="button"
          aria-label="Reanudar el procesamiento automático del bot"
          title="Reanuda el bot si no está bloqueado por riesgo."
          disabled={busy}
          onClick={() => run("/resume")}
          className="rounded border border-sky-400/40 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reanudar
        </button>
        <button
          type="button"
          aria-label="Desbloquear manualmente el control de riesgo"
          title="Quita el bloqueo de riesgo y deja el bot pausado para revisión."
          disabled={busy}
          onClick={() => run("/risk/unlock")}
          className="rounded border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unlock
        </button>
      </div>

      {status === "loading" || message ? (
        <p className="mt-3 min-h-5 font-mono text-xs text-slate-500">
          {status === "loading" ? "Procesando..." : message}
        </p>
      ) : null}
    </section>
  );
}

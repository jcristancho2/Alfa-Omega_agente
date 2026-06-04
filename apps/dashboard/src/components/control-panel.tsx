"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export default function ControlPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [command, setCommand] = useState("estado");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [price, setPrice] = useState("65000");
  const [tradeId, setTradeId] = useState("");
  const [exitPrice, setExitPrice] = useState("");

  async function run(path: string, body?: Record<string, unknown>) {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ? JSON.stringify(json.error) : "request failed");
      setStatus("done");
      setMessage(json?.response || json?.status || "ok");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "error");
    }
  }

  return (
    <section className="rounded-md border border-sky-400/15 bg-[#07111f] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Controles del bot</h2>
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

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => run("/pause")}
          className="rounded border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200"
        >
          Pausar
        </button>
        <button
          type="button"
          onClick={() => run("/resume")}
          className="rounded border border-sky-400/40 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100"
        >
          Reanudar
        </button>
        <button
          type="button"
          onClick={() => run("/risk/unlock")}
          className="rounded border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100"
        >
          Unlock
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <select
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
        >
          <option value="estado">estado</option>
          <option value="pausar">pausar</option>
          <option value="reanudar">reanudar</option>
          <option value="ultima_senal">ultima_senal</option>
          <option value="operaciones_hoy">operaciones_hoy</option>
          <option value="capital">capital</option>
          <option value="riesgo">riesgo</option>
        </select>
        <button
          type="button"
          onClick={() => run("/kapso-webhook", { command })}
          className="h-10 rounded border border-cyan-400/35 bg-cyan-500/15 px-3 text-sm font-semibold text-cyan-100"
        >
          Kapso mock
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Símbolo"
        />
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Precio"
        />
        <button
          type="button"
          onClick={() => run("/market/price", { symbol, price: Number(price) })}
          className="h-10 rounded border border-emerald-400/35 bg-emerald-500/15 px-3 text-sm font-semibold text-emerald-100"
        >
          Precio mock
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={tradeId}
          onChange={(event) => setTradeId(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Trade ID"
        />
        <input
          value={exitPrice}
          onChange={(event) => setExitPrice(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Exit price"
        />
        <button
          type="button"
          onClick={() =>
            run(`/trades/${tradeId}/close`, {
              reason: "manual_dashboard",
              exit_price: exitPrice ? Number(exitPrice) : undefined
            })
          }
          className="h-10 rounded border border-fuchsia-400/35 bg-fuchsia-500/15 px-3 text-sm font-semibold text-fuchsia-100"
        >
          Cerrar
        </button>
      </div>

      <p className="mt-3 min-h-5 font-mono text-xs text-slate-500">
        {status === "loading" ? "Procesando..." : message || "Sistema listo"}
      </p>
    </section>
  );
}

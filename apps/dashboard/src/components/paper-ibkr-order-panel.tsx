"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

type Status = "idle" | "loading" | "done" | "error";
type OrderType = "LMT" | "MKT";
type TimeInForce = "DAY" | "GTC" | "IOC";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function getResponseMessage(json: Record<string, unknown>) {
  const risk = json.risk as { reason?: unknown; rule?: unknown } | undefined;
  const limits = json.limits as { reason?: unknown; rule?: unknown } | undefined;
  const broker = json.broker as { error?: unknown; risk?: { reason?: unknown; rule?: unknown } } | undefined;
  const error = json.error;

  if (typeof error === "string") return error;
  if (limits?.reason) return `${limits.reason}${limits.rule ? ` (${limits.rule})` : ""}`;
  if (risk?.reason) return `${risk.reason}${risk.rule ? ` (${risk.rule})` : ""}`;
  if (broker?.risk?.reason) return `${broker.risk.reason}${broker.risk.rule ? ` (${broker.risk.rule})` : ""}`;
  if (broker?.error) return String(broker.error);
  return "request failed";
}

export default function PaperIbkrOrderPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [orderSymbol, setOrderSymbol] = useState("AAPL");
  const [orderConid, setOrderConid] = useState("265598");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderLimitPrice, setOrderLimitPrice] = useState("100");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("LMT");
  const [orderTif, setOrderTif] = useState<TimeInForce>("DAY");
  const busy = status === "loading";
  const validTicker = /^[A-Z0-9._-]+$/.test(orderSymbol.trim());
  const validOrder =
    validTicker &&
    Number.isInteger(Number(orderConid)) &&
    Number(orderConid) > 0 &&
    Number(orderQuantity) > 0 &&
    (orderType !== "LMT" || Number(orderLimitPrice) > 0);

  function orderPayload() {
    const payload: Record<string, unknown> = {
      accountMode: "paper",
      conid: Number(orderConid),
      orderType,
      quantity: Number(orderQuantity),
      side: orderSide,
      symbol: orderSymbol,
      tif: orderTif
    };

    if (orderType === "LMT") payload.limitPrice = Number(orderLimitPrice);

    return {
      ...payload,
      signal: {
        assetClass: "STK",
        confidence: 1,
        payload: { source: "dashboard_paper_ibkr" },
        side: orderSide,
        source: "dashboard",
        strategyId: "manual_dashboard",
        symbol: orderSymbol,
        timeframe: "manual"
      }
    };
  }

  async function run(path: string) {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await operatorHeaders()) },
        body: JSON.stringify(orderPayload())
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(getResponseMessage(json));
      setStatus("done");
      setMessage(
        json?.orderId
          ? `${String(json.status || "ok")} · ${String(json.orderId)}`
          : String(json?.response || json?.status || "ok")
      );
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "error");
    }
  }

  return (
    <section className="rounded-md border border-emerald-400/15 bg-[#07111f] p-4">
      <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Orden paper IBKR</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Lanza operaciones paper por el flujo API, límites operativos, executor y broker. El historial se actualiza con el ID local y el ID del broker.
          </p>
        </div>
        <span className="rounded bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">
          {orderType} x{orderQuantity || "-"} {orderTif}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Símbolo" help="Ticker exacto sin espacios, por ejemplo AAPL o SPY.">
          <input aria-label="Símbolo de orden IBKR" title="Símbolo del instrumento que se enviará a IBKR." value={orderSymbol} onChange={(event) => setOrderSymbol(event.target.value.toUpperCase())} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none" placeholder="AAPL" />
        </Field>
        <Field label="Conid" help="Identificador único del contrato negociable en IBKR.">
          <input aria-label="Identificador de contrato IBKR" title="Conid único del contrato negociable en IBKR." value={orderConid} onChange={(event) => setOrderConid(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none" placeholder="265598" />
        </Field>
        <Field label="Dirección" help="BUY compra unidades; SELL vende unidades disponibles.">
          <select aria-label="Dirección de orden IBKR" title="Selecciona BUY para comprar o SELL para vender." value={orderSide} onChange={(event) => setOrderSide(event.target.value as "BUY" | "SELL")} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"><option value="BUY">BUY</option><option value="SELL">SELL</option></select>
        </Field>
        <Field label="Tipo de orden" help="LMT exige un precio límite; MKT entra al mercado disponible.">
          <select aria-label="Tipo de orden IBKR" title="LMT usa un precio límite; MKT entra al mercado disponible." value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"><option value="LMT">LMT</option><option value="MKT">MKT</option></select>
        </Field>
        <Field label="Cantidad" help="Unidades que se enviarán. Debe respetar los límites operativos.">
          <input aria-label="Cantidad de orden IBKR" title="Número de unidades que intentará operar la orden." value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none" min="0" placeholder="Cantidad" step="1" type="number" />
        </Field>
        <Field label="Vigencia" help="DAY vence al cierre; GTC permanece; IOC cancela lo no ejecutado.">
          <select aria-label="Vigencia de orden IBKR" title="DAY vence al cierre, GTC permanece activa e IOC cancela lo no ejecutado." value={orderTif} onChange={(event) => setOrderTif(event.target.value as TimeInForce)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"><option value="DAY">DAY</option><option value="GTC">GTC</option><option value="IOC">IOC</option></select>
        </Field>
        <Field label="Precio límite" help="Máximo de compra o mínimo de venta usado por una orden LMT.">
          <input aria-label="Precio límite de orden IBKR" title="Precio máximo de compra o mínimo de venta para una orden LMT." value={orderLimitPrice} onChange={(event) => setOrderLimitPrice(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none disabled:cursor-not-allowed disabled:opacity-50" disabled={orderType === "MKT"} placeholder="Limit price" />
        </Field>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" aria-label="Previsualizar orden IBKR" title={validOrder ? "Valida límites operativos y solicita una previsualización sin enviar la orden." : "Completa símbolo, conid, cantidad y precio límite válidos."} disabled={busy || !validOrder} onClick={() => run("/api/trading/orders/preview")} className="h-10 rounded border border-emerald-400/35 bg-emerald-500/15 px-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">Preview</button>
        <button type="button" aria-label="Enviar orden paper a IBKR" title={validOrder ? "Envía la orden a la cuenta paper después de validar límites operativos." : "Completa símbolo, conid, cantidad y precio límite válidos."} disabled={busy || !validOrder} onClick={() => run("/api/trading/orders/submit")} className="h-10 rounded border border-amber-400/35 bg-amber-500/15 px-3 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50">Enviar paper</button>
      </div>

      <p className="mt-3 min-h-5 font-mono text-xs text-slate-500">
        {status === "loading" ? "Procesando..." : message || "Sistema listo"}
      </p>
    </section>
  );
}

function Field({ children, help, label }: { children: React.ReactNode; help: string; label: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">{label}</span><span className="mb-2 block min-h-8 text-[11px] leading-4 text-slate-500">{help}</span>{children}</label>;
}

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
  const [command, setCommand] = useState("estado");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [price, setPrice] = useState("65000");
  const [tradeId, setTradeId] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [orderSymbol, setOrderSymbol] = useState("AAPL");
  const [orderConid, setOrderConid] = useState("265598");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderLimitPrice, setOrderLimitPrice] = useState("100");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("LMT");
  const [orderTif, setOrderTif] = useState<TimeInForce>("DAY");
  const busy = status === "loading";
  const validMockPrice = Boolean(symbol.trim()) && Number(price) > 0;
  const validTicker = /^[A-Z0-9._-]+$/.test(orderSymbol.trim());
  const validOrder =
    validTicker &&
    Number.isInteger(Number(orderConid)) &&
    Number(orderConid) > 0 &&
    Number(orderQuantity) > 0 &&
    (orderType !== "LMT" || Number(orderLimitPrice) > 0);

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
        payload: { source: "dashboard_simulation" },
        side: orderSide,
        source: "dashboard",
        strategyId: "manual_dashboard",
        symbol: orderSymbol,
        timeframe: "manual"
      }
    };
  }

  return (
    <section className="rounded-md border border-sky-400/15 bg-[#07111f] p-4">
      <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Controles del bot</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Acciones manuales para administrar el motor, simular datos y validar órdenes paper.</p>
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

      <p className="mb-2 mt-4 text-xs text-slate-500">Comando Kapso: simula una consulta operativa como si llegara desde el canal de mensajería.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select
          aria-label="Comando de prueba Kapso"
          title="Selecciona un comando operativo para simularlo mediante Kapso."
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
          aria-label="Ejecutar comando Kapso simulado"
          title="Envía el comando seleccionado al webhook simulado de Kapso."
          disabled={busy}
          onClick={() => run("/kapso-webhook", { command })}
          className="h-10 rounded border border-cyan-400/35 bg-cyan-500/15 px-3 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Kapso mock
        </button>
      </div>

      <p className="mb-2 mt-4 text-xs text-slate-500">Precio mock: actualiza un precio local para probar señales y cierres sin depender del mercado real.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          aria-label="Símbolo para precio simulado"
          title="Símbolo cuyo precio simulado quieres actualizar."
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Símbolo"
        />
        <input
          aria-label="Precio simulado"
          title="Nuevo precio de mercado simulado para el símbolo."
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Precio"
        />
        <button
          type="button"
          aria-label="Guardar precio simulado"
          title="Guarda el precio simulado y permite evaluar cierres y señales locales."
          disabled={busy || !validMockPrice}
          onClick={() => run("/market/price", { symbol, price: Number(price) })}
          className="h-10 rounded border border-emerald-400/35 bg-emerald-500/15 px-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Precio mock
        </button>
      </div>

      <p className="mb-2 mt-4 text-xs text-slate-500">Cierre local: finaliza una operación registrada por su ID y opcionalmente fija el precio de salida.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          aria-label="Identificador de operación local"
          title="ID de la operación local abierta que quieres cerrar."
          value={tradeId}
          onChange={(event) => setTradeId(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Trade ID"
        />
        <input
          aria-label="Precio de salida de operación"
          title="Precio de salida manual; si queda vacío se usa el precio disponible."
          value={exitPrice}
          onChange={(event) => setExitPrice(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"
          placeholder="Exit price"
        />
        <button
          type="button"
          aria-label="Cerrar operación local"
          title="Cierra manualmente la operación local indicada."
          disabled={busy || !tradeId.trim()}
          onClick={() =>
            run(`/trades/${tradeId}/close`, {
              reason: "manual_dashboard",
              exit_price: exitPrice ? Number(exitPrice) : undefined
            })
          }
          className="h-10 rounded border border-fuchsia-400/35 bg-fuchsia-500/15 px-3 text-sm font-semibold text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 rounded border border-emerald-400/15 bg-emerald-500/5 p-3">
        <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-emerald-100">Orden paper IBKR</h3>
          <span className="rounded bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">
            {orderType} x{orderQuantity || "-"} {orderTif}
          </span>
        </div>
        <p className="mb-3 text-xs leading-5 text-slate-500">Define contrato, dirección, tipo, cantidad, vigencia y precio. Preview solo valida; Enviar paper transmite la orden después del control de riesgo.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Símbolo" help="Ticker exacto sin espacios, por ejemplo AAPL o SPY. Para índices usa el buscador de Automatización, que vincula símbolo y conid.">
            <input aria-label="Símbolo de orden IBKR" title="Símbolo del instrumento que se enviará a IBKR." value={orderSymbol} onChange={(event) => setOrderSymbol(event.target.value.toUpperCase())} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none" placeholder="AAPL" />
          </Field>
          <Field label="Conid" help="Identificador único del contrato negociable en IBKR.">
            <input aria-label="Identificador de contrato IBKR" title="Conid único del contrato negociable en IBKR." value={orderConid} onChange={(event) => setOrderConid(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none" placeholder="265598" />
          </Field>
          <Field label="Dirección" help="BUY compra unidades; SELL vende unidades disponibles.">
            <select aria-label="Dirección de orden IBKR" title="Selecciona BUY para comprar o SELL para vender." value={orderSide} onChange={(event) => setOrderSide(event.target.value as "BUY" | "SELL")} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"><option value="BUY">BUY</option><option value="SELL">SELL</option></select>
          </Field>
          <Field label="Tipo de orden" help="LMT exige un precio límite; MKT usa el precio disponible.">
            <select aria-label="Tipo de orden IBKR" title="LMT usa un precio límite; MKT está bloqueada por las reglas actuales." value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"><option value="LMT">LMT</option><option value="MKT">MKT</option></select>
          </Field>
          <Field label="Cantidad de la orden" help="Número de unidades que se enviarán. Debe ser menor o igual al límite configurado en Riesgo.">
            <input aria-label="Cantidad de orden IBKR" title="Número de unidades que intentará operar la orden." value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none" min="0" placeholder="Cantidad" step="1" type="number" />
          </Field>
          <Field label="Vigencia" help="DAY vence al cierre; GTC permanece; IOC cancela lo no ejecutado.">
            <select aria-label="Vigencia de orden IBKR" title="DAY vence al cierre, GTC permanece activa e IOC cancela lo no ejecutado." value={orderTif} onChange={(event) => setOrderTif(event.target.value as TimeInForce)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none"><option value="DAY">DAY</option><option value="GTC">GTC</option><option value="IOC">IOC</option></select>
          </Field>
          <Field label="Precio límite" help="Máximo de compra o mínimo de venta usado por una orden LMT.">
            <input aria-label="Precio límite de orden IBKR" title="Precio máximo de compra o mínimo de venta para una orden LMT." value={orderLimitPrice} onChange={(event) => setOrderLimitPrice(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none disabled:cursor-not-allowed disabled:opacity-50" disabled={orderType === "MKT"} placeholder="Limit price" />
          </Field>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button type="button" aria-label="Previsualizar orden IBKR" title={validOrder ? "Valida riesgo y solicita una previsualización sin enviar la orden." : "Usa un ticker exacto sin espacios y completa conid, cantidad y precio límite válidos."} disabled={busy || !validOrder} onClick={() => run("/api/trading/orders/preview", orderPayload())} className="h-10 rounded border border-emerald-400/35 bg-emerald-500/15 px-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">Preview</button>
          <button type="button" aria-label="Enviar orden paper a IBKR" title={validOrder ? "Envía la orden a la cuenta paper después de validar el riesgo." : "Usa un ticker exacto sin espacios y completa conid, cantidad y precio límite válidos."} disabled={busy || !validOrder} onClick={() => run("/api/trading/orders/submit", orderPayload())} className="h-10 rounded border border-amber-400/35 bg-amber-500/15 px-3 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50">Enviar paper</button>
        </div>
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

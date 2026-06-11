"use client";

import { useEffect, useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

type Broker = { id: "ibkr" | "simulated"; name: string };
type Account = { accountId: string; displayName: string };
type Instrument = { assetClass: string; instrumentId: string; name: string; symbol: string; exchange: string; currency: string; tradable?: boolean };
type Row = { id: string; status: string; symbol: string; next_run_at?: string; timeframe?: string };
type Capabilities = { automationEnabled: boolean; operatorAuthRequired: boolean; persistence: string };
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

async function api(path: string, init?: RequestInit) {
  const authHeaders = await operatorHeaders();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...authHeaders, ...(init?.headers ?? {}) }
  });
  const json = await response.json().catch(() => ({})) as {
    broker?: { error?: unknown };
    data?: unknown;
    error?: unknown;
    risk?: { reason?: string };
  };
  if (!response.ok) throw new Error(String(json.error ?? json.risk?.reason ?? json.broker?.error ?? "request failed"));
  return json.data ?? json;
}

export default function TradingAutomationPanel() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [broker, setBroker] = useState<Broker["id"]>("simulated");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [query, setQuery] = useState("AAPL");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("100");
  const [stopLoss, setStopLoss] = useState("95");
  const [takeProfit, setTakeProfit] = useState("110");
  const [message, setMessage] = useState("");
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [strategies, setStrategies] = useState<Row[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [busy, setBusy] = useState(false);
  const numericValuesValid = [quantity, limitPrice, stopLoss, takeProfit].every((value) => Number(value) > 0);
  const bracketPricesValid = side === "BUY"
    ? Number(stopLoss) < Number(limitPrice) && Number(takeProfit) > Number(limitPrice)
    : Number(stopLoss) > Number(limitPrice) && Number(takeProfit) < Number(limitPrice);
  const instrumentTradable = instrument?.tradable !== false && instrument?.assetClass !== "IND";
  const orderReady = Boolean(instrument && accountId && instrumentTradable) && numericValuesValid && bracketPricesValid;

  async function loadConfiguration() {
    try {
      const [brokerRows, capabilityRows, scheduleRows, strategyRows] = await Promise.all([
        api("/api/brokers") as Promise<Broker[]>,
        api("/api/runtime/capabilities") as Promise<Capabilities>,
        api("/api/schedules").catch(() => []) as Promise<Row[]>,
        api("/api/strategies").catch(() => []) as Promise<Row[]>
      ]);
      setBrokers(brokerRows);
      setCapabilities(capabilityRows);
      setSchedules(scheduleRows);
      setStrategies(strategyRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "configuration failed");
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadConfiguration(), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const rows = await api(`/api/brokers/${broker}/accounts`) as Account[];
        setAccounts(rows);
        setAccountId(rows[0]?.accountId ?? "");
        setInstrument(null);
        setInstruments([]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "accounts failed");
      }
    })();
  }, [broker]);

  async function search() {
    if (!query.trim() || busy) return;
    setBusy(true);
    try {
      setInstruments(await api(`/api/brokers/${broker}/instruments/search?q=${encodeURIComponent(query)}`) as Instrument[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "search failed");
    } finally {
      setBusy(false);
    }
  }

  async function searchPreset(value: string) {
    setQuery(value);
    if (busy) return;
    setBusy(true);
    try {
      setInstruments(await api(`/api/brokers/${broker}/instruments/search?q=${encodeURIComponent(value)}`) as Instrument[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "search failed");
    } finally {
      setBusy(false);
    }
  }

  function orderPayload() {
    if (!instrument || !accountId) throw new Error("Selecciona cuenta e instrumento");
    return {
      accountId, accountMode: "paper", assetClass: instrument.assetClass, brokerId: broker,
      conid: Number(instrument.instrumentId), currency: instrument.currency, exchange: instrument.exchange,
      instrumentId: instrument.instrumentId, limitPrice: Number(limitPrice), orderType: "LMT",
      quantity: Number(quantity), side, stopLoss: Number(stopLoss), symbol: instrument.symbol,
      takeProfit: Number(takeProfit), tif: "DAY"
    };
  }

  async function send(path: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("Procesando...");
    try {
      await api(path, { body: JSON.stringify(body), method: "POST" });
      setMessage("Operación registrada");
      await loadConfiguration();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  async function createSchedule() {
    await safely(async () => {
      if (!capabilities?.automationEnabled) throw new Error("Recurrencias requieren configurar Supabase");
      const order = orderPayload();
      await send("/api/schedules", {
        amount: order.quantity, amountType: "quantity", broker, brokerAccountId: accountId,
        instrumentId: order.instrumentId, intervalCount: 1, intervalUnit: "day",
        nextRunAt: new Date(Date.now() + 60_000).toISOString(), scheduleKind: "interval", side,
        stopLoss: order.stopLoss, symbol: order.symbol, takeProfit: order.takeProfit, timezone: "America/Bogota"
      });
    });
  }

  async function createStrategy() {
    await safely(async () => {
      if (!capabilities?.automationEnabled) throw new Error("Estrategias EMA requieren configurar Supabase");
      const order = orderPayload();
      await send("/api/strategies", {
        amount: order.quantity, amountType: "quantity", broker, brokerAccountId: accountId,
        fastPeriod: 9, instrumentId: order.instrumentId, slowPeriod: 21,
        stopLossPercent: 2, symbol: order.symbol, takeProfitPercent: 4, timeframe: "1h"
      });
    });
  }

  async function safely(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "request failed");
    }
  }

  return (
    <section className="rounded-md border border-cyan-400/20 bg-[#07111f] p-4">
      <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold">Automatización multi-broker</h2><p className="mt-1 text-xs leading-5 text-slate-500">Selecciona el activo y protege la entrada paper con stop loss y take profit.</p></div>
        <span className="max-w-full break-words font-mono text-xs text-cyan-300">{message || "Listo"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Broker" help="Adaptador que buscará el activo y ejecutará la orden.">
        <select aria-label="Broker para la operación" title="Selecciona el broker que buscará instrumentos y ejecutará la orden." value={broker} onChange={(event) => setBroker(event.target.value as Broker["id"])} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm">
          {brokers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        </Field>
        <Field label="Cuenta paper" help="Cuenta del broker que recibirá la operación.">
        <select aria-label="Cuenta paper del broker" title="Selecciona la cuenta paper donde se ejecutará la orden." value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm">
          {accounts.map((item) => <option key={item.accountId} value={item.accountId}>{item.displayName}</option>)}
        </select>
        </Field>
        <Field label="Instrumento o índice" help="Busca por símbolo o nombre: SPX, S&P 500, Nasdaq, Dow Jones, DAX, Nikkei o sus ETFs/futuros.">
        <input aria-label="Texto de búsqueda de instrumento o índice" title="Escribe un símbolo o nombre de acción, ETF, futuro o índice bursátil." value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ejemplo: S&P 500, SPX, DAX" className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm" />
        </Field>
        <Field label="Buscar activos" help="Consulta los activos disponibles en el broker elegido.">
        <button type="button" aria-label="Buscar instrumentos en el broker" title={query.trim() ? "Consulta instrumentos negociables disponibles en el broker seleccionado." : "Escribe un símbolo o nombre antes de buscar."} disabled={busy || !query.trim()} onClick={search} className="h-10 w-full rounded border border-cyan-400/35 bg-cyan-500/15 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50">Buscar</button>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["S&P 500", "Nasdaq 100", "Dow Jones", "Russell 2000", "DAX", "FTSE 100", "Nikkei 225"].map((preset) => <button key={preset} type="button" disabled={busy} onClick={() => void searchPreset(preset)} title={`Busca ${preset} y los instrumentos relacionados disponibles en el broker.`} className="rounded border border-sky-400/20 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-50">{preset}</button>)}
      </div>
      {instruments.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{instruments.slice(0, 25).map((item) => {
        const tradable = item.tradable !== false && item.assetClass !== "IND";
        return <button type="button" aria-label={`Seleccionar ${item.symbol}`} title={tradable ? `Selecciona ${item.symbol} (${item.name}) para configurar la operación.` : `${item.symbol} es un índice de referencia no negociable directamente. Selecciona un ETF, futuro u opción relacionada.`} disabled={busy} key={item.instrumentId} onClick={() => setInstrument(item)} className={`rounded border px-3 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${instrument?.instrumentId === item.instrumentId ? "border-emerald-400/50 bg-emerald-500/10" : "border-sky-400/15 bg-slate-950/50"}`}><span className="flex items-start justify-between gap-2"><strong>{item.symbol}</strong><span className={tradable ? "text-emerald-300" : "text-amber-300"}>{item.assetClass || "N/D"} · {tradable ? "operable" : "referencia"}</span></span><span className="mt-1 block text-slate-300">{item.name}</span><span className="text-slate-500">{item.exchange} · {item.currency} · {item.instrumentId}</span></button>;
      })}</div> : null}
      {instrument && !instrumentTradable ? <p className="mt-3 rounded border border-amber-400/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">El índice {instrument.symbol} sirve como referencia y para consultar velas, pero no puede comprarse directamente. Busca y selecciona un ETF, futuro u opción que replique ese índice.</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Dirección" help="BUY abre una compra; SELL abre una venta.">
        <select aria-label="Dirección de la orden bracket" title="BUY abre una compra; SELL abre una venta." value={side} onChange={(event) => setSide(event.target.value as "BUY" | "SELL")} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm"><option>BUY</option><option>SELL</option></select>
        </Field>
        {[
          ["Cantidad", quantity, setQuantity, "Número de unidades que operará la orden."],
          ["Límite", limitPrice, setLimitPrice, "Precio límite de entrada para la orden."],
          ["Stop loss", stopLoss, setStopLoss, "Precio que limita la pérdida y cierra la posición."],
          ["Take profit", takeProfit, setTakeProfit, "Precio objetivo que toma la ganancia."]
        ].map(([label, value, setter, help]) => <label key={label as string} className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">{label as string}</span><span className="mb-2 block min-h-8 text-[11px] leading-4 text-slate-500">{help as string}</span><input aria-label={label as string} title={help as string} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} placeholder={label as string} type="number" className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm" /></label>)}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Acciones: primero usa Preview bracket para validar precios y riesgo. Enviar transmite la orden paper; programar y EMA requieren persistencia Supabase.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" aria-label="Previsualizar orden bracket" title={orderReady ? "Valida entrada, stop loss, take profit y riesgo sin enviar la orden." : !instrumentTradable ? "El índice seleccionado es solo referencia; selecciona un ETF, futuro u opción operable." : "Selecciona cuenta e instrumento y configura precios bracket coherentes."} disabled={busy || !orderReady} onClick={() => safely(() => send("/api/trading/v2/orders/preview", orderPayload()))} className="h-10 rounded border border-emerald-400/35 bg-emerald-500/15 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">Preview bracket</button>
        <button type="button" aria-label="Enviar orden bracket paper" title={orderReady ? "Envía una entrada paper protegida con stop loss y take profit." : "Selecciona cuenta e instrumento y configura precios bracket coherentes."} disabled={busy || !orderReady} onClick={() => safely(() => send("/api/trading/v2/orders/submit", orderPayload()))} className="h-10 rounded border border-amber-400/35 bg-amber-500/15 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">Enviar bracket paper</button>
        <button type="button" aria-label="Crear programación diaria" title={!capabilities?.automationEnabled ? "Requiere configurar Supabase para guardar y ejecutar recurrencias." : orderReady ? "Programa esta orden para ejecutarse diariamente." : "Completa una orden válida antes de programarla."} onClick={createSchedule} className="h-10 rounded border border-sky-400/35 bg-sky-500/15 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !capabilities?.automationEnabled || !orderReady}>Programar diario</button>
        <button type="button" aria-label="Crear estrategia EMA 9 21 de una hora" title={!capabilities?.automationEnabled ? "Requiere configurar Supabase para guardar y evaluar estrategias." : orderReady ? "Crea una estrategia que opera cruces EMA 9/21 en velas de una hora." : "Completa una orden válida antes de crear la estrategia."} onClick={createStrategy} className="h-10 rounded border border-fuchsia-400/35 bg-fuchsia-500/15 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !capabilities?.automationEnabled || !orderReady}>Crear EMA 9/21 · 1h</button>
      </div>
      {!capabilities?.automationEnabled ? <p className="mt-2 text-xs text-amber-300">Recurrencias y estrategias están desactivadas hasta configurar Supabase; búsqueda y órdenes bracket funcionan en modo local.</p> : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <MiniList title="Recurrencias" rows={schedules} detail="next_run_at" />
        <MiniList title="Estrategias EMA" rows={strategies} detail="timeframe" />
      </div>
    </section>
  );
}

function MiniList({ detail, rows, title }: { detail: "next_run_at" | "timeframe"; rows: Row[]; title: string }) {
  return <div className="rounded border border-sky-400/10 bg-slate-950/40 p-3"><h3 className="mb-2 text-sm font-semibold">{title}</h3>{rows.length ? rows.slice(0, 5).map((row) => <div key={row.id} className="flex flex-col gap-1 border-t border-sky-400/10 py-2 text-xs sm:flex-row sm:justify-between"><span>{row.symbol} · {row.status}</span><span className="break-all text-slate-500">{String(row[detail] ?? "-").slice(0, 19)}</span></div>) : <p className="text-xs text-slate-500">Sin configuraciones</p>}</div>;
}

function Field({ children, help, label }: { children: React.ReactNode; help: string; label: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">{label}</span><span className="mb-2 block min-h-8 text-[11px] leading-4 text-slate-500">{help}</span>{children}</label>;
}

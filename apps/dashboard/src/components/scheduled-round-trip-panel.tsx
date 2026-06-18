"use client";

import { useCallback, useEffect, useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

type Broker = { id: "ibkr" | "simulated"; name: string };
type Account = { accountId: string; displayName: string };
type Instrument = { assetClass: string; currency: string; exchange: string; instrumentId: string; name: string; symbol: string; tradable?: boolean };
type ScheduleRow = {
  amount?: number | string;
  amount_type?: "quantity" | "usd";
  id: string;
  next_run_at?: string;
  side: "BUY" | "SELL";
  status: string;
  symbol: string;
  weekly_days?: number[];
  weekly_time?: string;
};
type Status = "idle" | "loading" | "done" | "error";
type ScheduleEdit = { amount: string; amountType: "quantity" | "usd"; nextRunAt: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const days = [
  ["Dom", 0],
  ["Lun", 1],
  ["Mar", 2],
  ["Mié", 3],
  ["Jue", 4],
  ["Vie", 5],
  ["Sáb", 6]
] as const;

function localDateTimeValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextMinuteValue() {
  const date = new Date(Date.now() + 60_000);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(await operatorHeaders()), ...(init?.headers ?? {}) }
  });
  const json = await response.json().catch(() => ({})) as { data?: unknown; error?: unknown };
  if (!response.ok) throw new Error(String(json.error ?? "request failed"));
  return json.data ?? json;
}

export default function ScheduledRoundTripPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Listo");
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [broker, setBroker] = useState<Broker["id"]>("ibkr");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [query, setQuery] = useState("AAPL");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [entrySide, setEntrySide] = useState<"BUY" | "SELL">("BUY");
  const [entryTime, setEntryTime] = useState("09:35");
  const [exitTime, setExitTime] = useState("15:45");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [amountType, setAmountType] = useState<"quantity" | "usd">("quantity");
  const [amount, setAmount] = useState("1");
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [editing, setEditing] = useState<Record<string, ScheduleEdit>>({});
  const busy = status === "loading";
  const exitSide = entrySide === "BUY" ? "SELL" : "BUY";
  const ready = Boolean(accountId && instrument && selectedDays.length && entryTime !== exitTime && Number(amount) > 0);

  const loadBase = useCallback(async () => {
    try {
      const [brokerRows, scheduleRows] = await Promise.all([
        api("/api/brokers") as Promise<Broker[]>,
        api("/api/schedules").catch(() => []) as Promise<ScheduleRow[]>
      ]);
      setBrokers(brokerRows);
      setSchedules(scheduleRows);
      if (!brokerRows.some((row) => row.id === broker) && brokerRows[0]) setBroker(brokerRows[0].id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar configuración");
      setStatus("error");
    }
  }, [broker]);

  const loadAccounts = useCallback(async (nextBroker = broker) => {
    try {
      const rows = await api(`/api/brokers/${nextBroker}/accounts`) as Account[];
      setAccounts(rows);
      setAccountId(rows[0]?.accountId ?? "");
      setInstrument(null);
      setInstruments([]);
    } catch (error) {
      setAccounts([]);
      setAccountId("");
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar cuentas");
    }
  }, [broker]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadBase(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadBase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAccounts(broker), 0);
    return () => window.clearTimeout(timeout);
  }, [broker, loadAccounts]);

  async function search() {
    if (!query.trim() || busy) return;
    setStatus("loading");
    setMessage("Buscando instrumento...");
    try {
      const params = new URLSearchParams({ limit: "25", page: "1", q: query.trim(), tradable: "true" });
      const rows = await api(`/api/brokers/${broker}/instruments/search?${params.toString()}`) as Instrument[];
      setInstruments(rows);
      setMessage(rows.length ? "Selecciona un instrumento" : "Sin resultados operables");
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Búsqueda fallida");
    }
  }

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()
    );
  }

  async function createPair() {
    if (!instrument || !ready || busy) return;
    setStatus("loading");
    setMessage("Creando calendario...");
    try {
      const rows = await api("/api/schedules/paired-weekly", {
        body: JSON.stringify({
          amount: Number(amount),
          amountType,
          broker,
          brokerAccountId: accountId,
          entrySide,
          entryTime,
          exitTime,
          instrumentId: instrument.instrumentId,
          symbol: instrument.symbol,
          timezone: "America/Bogota",
          weeklyDays: selectedDays
        }),
        method: "POST"
      }) as ScheduleRow[];
      setStatus("done");
      setMessage(`Calendario activo: ${rows.map((row) => `${row.side} ${row.weekly_time}`).join(" · ")}`);
      await loadBase();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear calendario");
    }
  }

  async function manageSchedule(id: string, action: "pause" | "resume" | "cancel") {
    if (busy) return;
    setStatus("loading");
    try {
      await api(`/api/schedules/${encodeURIComponent(id)}/${action}`, { body: "{}", method: "PATCH" });
      setStatus("done");
      setMessage(`Recurrencia ${action === "pause" ? "pausada" : action === "resume" ? "reactivada" : "cancelada"}`);
      await loadBase();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar recurrencia");
    }
  }

  function startEdit(row: ScheduleRow) {
    setEditing((current) => ({
      ...current,
      [row.id]: {
        amount: String(row.amount ?? "1"),
        amountType: row.amount_type ?? "quantity",
        nextRunAt: localDateTimeValue(row.next_run_at) || nextMinuteValue()
      }
    }));
  }

  async function saveSchedule(id: string) {
    const draft = editing[id];
    if (!draft || busy || Number(draft.amount) <= 0 || !draft.nextRunAt) return;
    setStatus("loading");
    setMessage("Guardando recurrencia...");
    try {
      const row = await api(`/api/schedules/${encodeURIComponent(id)}`, {
        body: JSON.stringify({
          amount: Number(draft.amount),
          amountType: draft.amountType,
          nextRunAt: new Date(draft.nextRunAt).toISOString(),
          status: "active"
        }),
        method: "PATCH"
      }) as ScheduleRow;
      setStatus("done");
      setMessage(`${row.symbol} ${row.side} actualizada`);
      setEditing((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await loadBase();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo guardar recurrencia");
    }
  }

  return (
    <section className="rounded-md border border-cyan-400/20 bg-[#07111f] p-4">
      <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Controles del calendario</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Programa una operación y su contrario en días y horas fijas. Queda activa hasta pausarla o cancelarla.</p>
        </div>
        <span className={status === "error" ? "rounded bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-300" : "rounded bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-200"}>
          {busy ? "Procesando" : status === "error" ? "Error" : "Listo"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Broker" help="Broker que ejecutará ambas operaciones.">
          <select value={broker} onChange={(event) => setBroker(event.target.value as Broker["id"])} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm">
            {brokers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Cuenta" help="Cuenta paper donde se lanzarán entrada y salida.">
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm">
            {accounts.map((item) => <option key={item.accountId} value={item.accountId}>{item.displayName}</option>)}
          </select>
        </Field>
        <Field label="Buscar activo" help="Busca el instrumento que se usará en ambas operaciones.">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AAPL, SPY, QQQ" className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm" />
        </Field>
        <Field label="Consulta broker" help="Trae instrumentos operables del broker elegido.">
          <button type="button" disabled={busy || !query.trim()} onClick={search} className="h-10 w-full rounded border border-cyan-400/35 bg-cyan-500/15 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50">Buscar</button>
        </Field>
      </div>

      {instruments.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {instruments.slice(0, 12).map((item) => (
          <button type="button" key={item.instrumentId} onClick={() => setInstrument(item)} className={`rounded border px-3 py-2 text-left text-xs ${instrument?.instrumentId === item.instrumentId ? "border-emerald-400/50 bg-emerald-500/10" : "border-sky-400/15 bg-slate-950/50"}`}>
            <span className="flex justify-between gap-2"><strong>{item.symbol}</strong><span className="text-emerald-300">{item.assetClass}</span></span>
            <span className="mt-1 block text-slate-300">{item.name}</span>
            <span className="text-slate-500">{item.exchange} · {item.currency} · {item.instrumentId}</span>
          </button>
        ))}
      </div> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Operación inicial" help="La operación contraria se calcula automáticamente.">
          <select value={entrySide} onChange={(event) => setEntrySide(event.target.value as "BUY" | "SELL")} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm"><option value="BUY">Comprar primero</option><option value="SELL">Vender primero</option></select>
        </Field>
        <Field label="Hora inicial" help={`Hora ${entrySide} en America/Bogota.`}>
          <input type="time" value={entryTime} onChange={(event) => setEntryTime(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm" />
        </Field>
        <Field label={`Hora ${exitSide}`} help="Hora de la operación contraria en el mismo calendario.">
          <input type="time" value={exitTime} onChange={(event) => setExitTime(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm" />
        </Field>
        <Field label="Tipo de monto" help="Cantidad opera unidades; USD calcula unidades por precio al ejecutar.">
          <select value={amountType} onChange={(event) => setAmountType(event.target.value as "quantity" | "usd")} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm"><option value="quantity">Cantidad</option><option value="usd">Monto USD</option></select>
        </Field>
        <Field label="Monto" help="Unidades o monto USD que se usará en cada ejecución.">
          <input type="number" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm" />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-slate-300">Días activos</p>
        <div className="flex flex-wrap gap-2">
          {days.map(([label, value]) => (
            <button key={value} type="button" onClick={() => toggleDay(value)} className={selectedDays.includes(value) ? "rounded border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100" : "rounded border border-sky-400/15 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-400"}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <button type="button" disabled={busy || !ready} onClick={createPair} className="mt-4 h-10 rounded border border-emerald-400/35 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
        Activar calendario
      </button>
      <p className="mt-3 min-h-5 font-mono text-xs text-slate-500">{message}</p>

      <div className="mt-4 rounded border border-sky-400/10 bg-slate-950/40 p-3">
        <h3 className="text-sm font-semibold">Recurrencias activas y pausadas</h3>
        <div className="mt-2 space-y-2">
          {schedules.length ? schedules.slice(0, 12).map((row) => (
            <div key={row.id} className="rounded border border-sky-400/10 bg-[#07111f] p-3 text-xs">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold text-slate-200">{row.symbol} · {row.side} · {row.weekly_time ?? "-"}</span>
                <span className="text-slate-500">{row.status} · próxima {String(row.next_run_at ?? "-").slice(0, 16)}</span>
              </div>
              <p className="mt-1 text-slate-500">{row.amount_type === "usd" ? "USD" : "Cantidad"} · {String(row.amount ?? "-")}</p>
              {editing[row.id] ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-slate-400">Tipo de monto</span>
                    <select
                      value={editing[row.id].amountType}
                      onChange={(event) => setEditing((current) => ({ ...current, [row.id]: { ...current[row.id], amountType: event.target.value as "quantity" | "usd" } }))}
                      className="h-9 w-full rounded border border-sky-400/15 bg-slate-950/80 px-2"
                    >
                      <option value="quantity">Cantidad</option>
                      <option value="usd">Monto USD</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-slate-400">Monto</span>
                    <input
                      type="number"
                      min="0.01"
                      value={editing[row.id].amount}
                      onChange={(event) => setEditing((current) => ({ ...current, [row.id]: { ...current[row.id], amount: event.target.value } }))}
                      className="h-9 w-full rounded border border-sky-400/15 bg-slate-950/80 px-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-slate-400">Próxima ejecución</span>
                    <input
                      type="datetime-local"
                      value={editing[row.id].nextRunAt}
                      onChange={(event) => setEditing((current) => ({ ...current, [row.id]: { ...current[row.id], nextRunAt: event.target.value } }))}
                      className="h-9 w-full rounded border border-sky-400/15 bg-slate-950/80 px-2"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-3">
                    <button type="button" disabled={busy || Number(editing[row.id].amount) <= 0 || !editing[row.id].nextRunAt} onClick={() => saveSchedule(row.id)} className="rounded border border-emerald-400/30 px-2 py-1 font-semibold text-emerald-100 disabled:opacity-30">Guardar y activar</button>
                    <button type="button" disabled={busy} onClick={() => setEditing((current) => ({ ...current, [row.id]: { ...current[row.id], nextRunAt: nextMinuteValue() } }))} className="rounded border border-cyan-400/25 px-2 py-1 text-cyan-100 disabled:opacity-30">Reintentar en 1 min</button>
                    <button type="button" disabled={busy} onClick={() => setEditing((current) => { const next = { ...current }; delete next[row.id]; return next; })} className="rounded border border-sky-400/15 px-2 py-1 disabled:opacity-30">Cerrar edición</button>
                  </div>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy || row.status === "cancelled"} onClick={() => startEdit(row)} className="rounded border border-cyan-400/20 px-2 py-1 disabled:opacity-30">Editar</button>
                <button type="button" disabled={row.status !== "active" || busy} onClick={() => manageSchedule(row.id, "pause")} className="rounded border border-amber-400/20 px-2 py-1 disabled:opacity-30">Pausar</button>
                <button type="button" disabled={row.status !== "paused" || busy} onClick={() => manageSchedule(row.id, "resume")} className="rounded border border-emerald-400/20 px-2 py-1 disabled:opacity-30">Reanudar</button>
                <button type="button" disabled={row.status === "cancelled" || busy} onClick={() => manageSchedule(row.id, "cancel")} className="rounded border border-rose-400/20 px-2 py-1 disabled:opacity-30">Cancelar</button>
              </div>
            </div>
          )) : <p className="text-xs text-slate-500">Sin recurrencias todavía.</p>}
        </div>
      </div>
    </section>
  );
}

function Field({ children, help, label }: { children: React.ReactNode; help: string; label: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">{label}</span><span className="mb-2 block min-h-8 text-[11px] leading-4 text-slate-500">{help}</span>{children}</label>;
}

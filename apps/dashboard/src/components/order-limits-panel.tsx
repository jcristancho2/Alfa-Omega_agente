"use client";

import { useEffect, useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

export interface OrderLimits {
  allowedSymbols: string[];
  maxDailyOrders: number;
  maxOrderNotional: number;
  maxOrderQty: number;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

const fields: Array<{
  key: keyof Omit<OrderLimits, "allowedSymbols">;
  label: string;
  help: string;
  step: string;
}> = [
  {
    key: "maxOrderQty",
    label: "Cantidad máxima por orden",
    help: "Máximo de unidades que puede enviar una sola orden.",
    step: "1"
  },
  {
    key: "maxOrderNotional",
    label: "Valor máximo por orden",
    help: "Cantidad por precio límite. Solo se calcula cuando la orden tiene precio límite.",
    step: "1"
  },
  {
    key: "maxDailyOrders",
    label: "Órdenes máximas por día",
    help: "Cantidad máxima de envíos reales al broker permitidos durante el día.",
    step: "1"
  }
];

const fallbackLimits: OrderLimits = {
  allowedSymbols: [],
  maxDailyOrders: 20,
  maxOrderNotional: 5000,
  maxOrderQty: 10
};

export default function OrderLimitsPanel({ initial = fallbackLimits }: { initial?: OrderLimits }) {
  const [limits, setLimits] = useState(initial);
  const [allowedSymbolsText, setAllowedSymbolsText] = useState(initial.allowedSymbols.join(", "));
  const [message, setMessage] = useState("Listo");
  const [saving, setSaving] = useState(false);
  const limitsValid = fields.every((field) => Number(limits[field.key]) > 0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/order-limits`, {
          cache: "no-store",
          headers: await operatorHeaders()
        });
        const result = await response.json().catch(() => ({})) as { data?: OrderLimits; error?: unknown };
        if (!response.ok || !result.data) throw new Error(String(result.error ?? "No se pudieron cargar límites"));
        if (!active) return;
        setLimits(result.data);
        setAllowedSymbolsText(result.data.allowedSymbols.join(", "));
        setMessage("Listo");
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "No se pudieron cargar límites");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    if (saving || !limitsValid) return;
    setSaving(true);
    setMessage("Guardando...");
    try {
      const payload: OrderLimits = {
        ...limits,
        allowedSymbols: [
          ...new Set(
            allowedSymbolsText
              .split(",")
              .map((symbol) => symbol.trim().toUpperCase())
              .filter(Boolean)
          )
        ]
      };
      const response = await fetch(`${apiBaseUrl}/api/order-limits`, {
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json", ...(await operatorHeaders()) },
        method: "POST"
      });
      const result = await response.json().catch(() => ({})) as { data?: OrderLimits; error?: unknown };
      if (!response.ok || !result.data) throw new Error(String(result.error ?? "No se pudo guardar"));
      setLimits(result.data);
      setAllowedSymbolsText(result.data.allowedSymbols.join(", "));
      setMessage("Límites guardados. Se aplican a las próximas órdenes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-cyan-400/20 bg-[#07111f] p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Límites operativos</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Controlan qué órdenes puede enviar ALFA-OMEGA al broker. No son configuración de riesgo: son límites de operación para evitar envíos accidentales.
          </p>
        </div>
        <span className="rounded bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold text-cyan-200">
          Próximas órdenes
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-300">{field.label}</span>
            <span className="mb-2 block min-h-8 text-[11px] leading-4 text-slate-500">{field.help}</span>
            <input
              aria-label={field.label}
              title={field.help}
              type="number"
              min="0.0001"
              step={field.step}
              value={limits[field.key]}
              onChange={(event) => setLimits((current) => ({ ...current, [field.key]: Number(event.target.value) }))}
              className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm outline-none"
            />
          </label>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold text-slate-300">Símbolos permitidos</span>
        <span className="mb-2 block text-[11px] leading-4 text-slate-500">Lista separada por comas. Déjala vacía para permitir cualquier símbolo.</span>
        <textarea
          aria-label="Símbolos permitidos"
          title="Solo estos símbolos podrán enviarse al broker cuando la lista tenga valores."
          value={allowedSymbolsText}
          onChange={(event) => setAllowedSymbolsText(event.target.value)}
          placeholder="AAPL, SPY, QQQ"
          rows={3}
          className="w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 py-2 text-sm uppercase outline-none"
        />
      </label>

      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          aria-label="Guardar límites operativos"
          title={limitsValid ? "Guarda los límites para próximos envíos al broker." : "Todos los límites deben ser mayores que cero."}
          disabled={saving || !limitsValid}
          onClick={save}
          className="h-10 rounded border border-cyan-400/35 bg-cyan-500/15 px-4 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar límites"}
        </button>
        <p className="min-h-5 font-mono text-xs text-slate-500">{message}</p>
      </div>
    </section>
  );
}

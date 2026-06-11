"use client";

import { useState } from "react";
import { operatorHeaders } from "@/lib/operator-api";

export interface RiskSettings {
  allowedSymbols: string[];
  maxDailyRiskPct: number;
  maxDailyTrades: number;
  maxOpenTrades: number;
  maxOrderNotional: number;
  maxOrderQty: number;
  riskPerTradePct: number;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

const fields: Array<{
  key: keyof RiskSettings;
  label: string;
  help: string;
  step: string;
}> = [
  { key: "maxOrderQty", label: "Cantidad máxima por orden", help: "Máximo de unidades permitidas en una sola orden.", step: "1" },
  { key: "maxOrderNotional", label: "Valor máximo por orden (USD)", help: "Máximo valor estimado permitido por orden.", step: "1" },
  { key: "maxDailyTrades", label: "Órdenes máximas por día", help: "Cantidad máxima de órdenes permitidas durante el día.", step: "1" },
  { key: "maxOpenTrades", label: "Operaciones abiertas máximas", help: "Número máximo de operaciones locales abiertas simultáneamente.", step: "1" },
  { key: "riskPerTradePct", label: "Riesgo por operación", help: "Porcentaje del capital que puede arriesgar una operación. Ejemplo: 0.01 = 1%.", step: "0.001" },
  { key: "maxDailyRiskPct", label: "Riesgo diario máximo", help: "Porcentaje máximo del capital que puede estar en riesgo durante el día.", step: "0.001" }
];

export default function RiskSettingsPanel({ initial }: { initial: RiskSettings }) {
  const [settings, setSettings] = useState(initial);
  const [allowedSymbolsText, setAllowedSymbolsText] = useState(initial.allowedSymbols.join(", "));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const settingsValid = fields.every((field) => Number(settings[field.key]) > 0);

  async function save() {
    if (saving || !settingsValid) return;
    setSaving(true);
    setMessage("Guardando...");
    try {
      const response = await fetch(`${apiBaseUrl}/api/risk/settings`, {
        body: JSON.stringify({
          ...settings,
          allowedSymbols: [...new Set(allowedSymbolsText.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
        }),
        headers: { "content-type": "application/json", ...(await operatorHeaders()) },
        method: "POST"
      });
      const result = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) throw new Error(String(result.error ?? "No se pudo guardar"));
      setMessage("Límites actualizados. Se aplican a las próximas órdenes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-rose-400/20 bg-[#07111f] p-4">
      <div className="mb-4">
        <h3 className="font-semibold">Límites modificables</h3>
        <p className="text-xs text-slate-500">Estos valores controlan Preview y Submit. Los cambios quedan registrados en Logs.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
              value={settings[field.key]}
              onChange={(event) => setSettings((current) => ({ ...current, [field.key]: Number(event.target.value) }))}
              className="h-10 w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm"
            />
          </label>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold text-slate-300">Símbolos permitidos</span>
        <span className="mb-2 block text-[11px] leading-4 text-slate-500">Lista separada por comas. Ejemplo: AAPL, MSFT, TSLA. Déjala vacía para permitir cualquier símbolo.</span>
        <textarea
          aria-label="Símbolos permitidos para operar"
          title="Solo los símbolos incluidos podrán superar la validación allowed_symbols."
          value={allowedSymbolsText}
          onChange={(event) => setAllowedSymbolsText(event.target.value)}
          placeholder="AAPL, MSFT, TSLA"
          rows={3}
          className="w-full rounded border border-sky-400/15 bg-slate-950/80 px-3 py-2 text-sm uppercase"
        />
      </label>
      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          aria-label="Guardar límites de riesgo"
          title="Guarda y aplica inmediatamente los límites configurados."
          disabled={saving || !settingsValid}
          onClick={save}
          className="rounded border border-rose-400/35 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar límites"}
        </button>
        <p className="text-xs text-slate-400">{message}</p>
      </div>
    </div>
  );
}

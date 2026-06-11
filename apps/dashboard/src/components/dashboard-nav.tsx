"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", help: "Resumen, controles manuales y estado general." },
  { href: "/automatizacion", label: "Automatización", help: "Busca activos, envía brackets y crea reglas automáticas." },
  { href: "/operaciones", label: "Operaciones", help: "Revisa órdenes, posiciones, ejecuciones y operaciones locales." },
  { href: "/senales", label: "Señales", help: "Consulta las señales recibidas y su estado de procesamiento." },
  { href: "/riesgo", label: "Riesgo", help: "Consulta y modifica los límites de protección." },
  { href: "/brokers", label: "Brokers", help: "Comprueba adaptadores, conexión y actividad del broker." },
  { href: "/notificaciones", label: "Notificaciones", help: "Consulta mensajes operativos pendientes y enviados." },
  { href: "/logs", label: "Logs", help: "Revisa la auditoría y los eventos internos." }
];

export default function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Vistas de la aplicación" className="space-y-2">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.help}
            onClick={onNavigate}
            className={
              active
                ? "block rounded-md border border-sky-400/25 bg-sky-500/15 px-3 py-2.5 text-sm font-medium text-sky-100"
                : "block rounded-md px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-sky-500/10 hover:text-sky-100"
            }
          >
            <span className="flex items-center justify-between gap-3">
              {item.label}
              <span className="font-mono text-[10px] uppercase text-emerald-400">{active ? "aquí" : "ver"}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

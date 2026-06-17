import PageHeading from "@/components/page-heading";

export default function RiskPage() {
  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-5">
      <PageHeading
        title="Riesgo desactivado"
        description="La configuración de riesgo fue retirada del flujo operativo. Las órdenes paper ya no se bloquean por límites de cantidad, notional, símbolos permitidos o kill switch."
      />
      <section className="rounded-md border border-sky-400/15 bg-[#07111f] p-4">
        <p className="text-sm leading-6 text-slate-300">
          Live trading sigue bloqueado salvo que se habilite explícitamente en configuración de entorno.
          Para operar paper usa Orden paper IBKR o el calendario de Control del bot.
        </p>
      </section>
    </div>
  );
}

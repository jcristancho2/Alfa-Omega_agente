import OrderLimitsPanel from "@/components/order-limits-panel";
import PageHeading from "@/components/page-heading";

export default function LimitsPage() {
  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-5">
      <PageHeading
        title="Límites operativos"
        description="Modifica desde la aplicación la cantidad máxima, el valor máximo y el máximo diario de órdenes que ALFA-OMEGA puede enviar al broker."
      />
      <OrderLimitsPanel />
    </div>
  );
}

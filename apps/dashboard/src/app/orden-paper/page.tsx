import PaperIbkrOrderPanel from "@/components/paper-ibkr-order-panel";
import PageHeading from "@/components/page-heading";

export default function PaperOrderPage() {
  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-5">
      <PageHeading
        title="Orden paper IBKR"
        description="Lanza operaciones paper desde ALFA-OMEGA. Cada envío pasa por API, riesgo, executor, broker y queda visible en Estado e historial de operaciones."
      />
      <PaperIbkrOrderPanel />
    </div>
  );
}

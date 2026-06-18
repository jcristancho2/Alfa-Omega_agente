import { DataTable, ViewSection } from "@/components/operational-views";
import PageHeading from "@/components/page-heading";
import { getJson, type Row } from "@/lib/dashboard-data";

export default async function LogsPage() {
  const logs = await getJson<Row[]>("/logs") ?? [];
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Logs" description="Auditoría técnica para entender decisiones del sistema, cambios de riesgo, errores y respuestas de servicios internos." /><ViewSection title="Eventos del sistema" description="Usa nivel, evento y metadata para rastrear el origen de un comportamiento. Los datos complejos se muestran completos al pasar el cursor."><DataTable rows={logs} columns={[["created_at", "Fecha"], ["level", "Nivel"], ["message", "Evento"], ["metadata", "Metadata"]]} /></ViewSection></div>;
}

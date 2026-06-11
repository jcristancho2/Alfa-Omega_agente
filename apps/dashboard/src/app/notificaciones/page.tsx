import { DataTable, ViewSection } from "@/components/operational-views";
import PageHeading from "@/components/page-heading";
import { loadDashboardData } from "@/lib/dashboard-data";

export default async function NotificationsPage() {
  const { notifications } = await loadDashboardData();
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Notificaciones" description="Mensajes generados por los procesos operativos para informar acciones, resultados y situaciones que requieren atención." /><ViewSection title="Registro de notificaciones" description="El estado permite distinguir mensajes pendientes, enviados o fallidos."><DataTable rows={notifications} columns={[["created_at", "Fecha"], ["channel", "Canal"], ["event_type", "Evento"], ["message", "Mensaje"], ["status", "Estado"]]} /></ViewSection></div>;
}

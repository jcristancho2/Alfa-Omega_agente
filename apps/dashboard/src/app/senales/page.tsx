import { DataTable, ViewSection } from "@/components/operational-views";
import PageHeading from "@/components/page-heading";
import { getJson, type Row } from "@/lib/dashboard-data";

export default async function SignalsPage() {
  const signals = await getJson<Row[]>("/signals") ?? [];
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Señales" description="Aquí puedes verificar qué oportunidades recibió el motor, su dirección, estrategia, puntuación y el motivo por el que fueron procesadas o rechazadas." /><ViewSection title="Registro de señales" description="Una señal no representa una ejecución confirmada. Su estado indica si todavía está pendiente, fue procesada o fue rechazada por riesgo."><DataTable rows={signals} columns={[["created_at", "Fecha"], ["symbol", "Instrumento"], ["direction", "Dirección"], ["score", "Score"], ["strategy", "Estrategia"], ["status", "Estado"], ["reason", "Motivo"]]} /></ViewSection></div>;
}

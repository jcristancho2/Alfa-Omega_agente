import PageHeading from "@/components/page-heading";
import ScheduledRoundTripPanel from "@/components/scheduled-round-trip-panel";

export default function ControlPage() {
  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-5">
      <PageHeading
        title="Control del bot"
        description="Programa entradas y salidas automáticas por días y horas específicas. El calendario queda activo hasta pausarlo o cancelarlo."
      />
      <ScheduledRoundTripPanel />
    </div>
  );
}

import PageHeading from "@/components/page-heading";
import TradingAutomationPanel from "@/components/trading-automation-panel";

export default function AutomationPage() {
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Automatización" description="Selecciona broker, cuenta e instrumento para validar o enviar una orden bracket paper, programar una recurrencia o configurar una estrategia EMA." /><TradingAutomationPanel /></div>;
}

import PageHeading from "@/components/page-heading";
import TradingAutomationPanel from "@/components/trading-automation-panel";

export default function AutomationPage() {
  return <div className="space-y-4 p-3 sm:p-4 lg:p-5"><PageHeading title="Automatización multi-broker" description="Selecciona broker, cuenta e instrumento para validar brackets, programar recurrencias o configurar una estrategia EMA en una vista aislada." /><TradingAutomationPanel /></div>;
}

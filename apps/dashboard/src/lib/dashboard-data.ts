import type { RiskSettings } from "@/components/risk-settings-panel";

type ApiResult<T> = { ok: boolean; data: T };
export type Row = Record<string, unknown>;

type BrokerOpenOrder = {
  contract?: Row;
  order?: Row;
  orderStatus?: Row;
};

type BrokerPortfolioItem = {
  account?: string;
  averageCost?: number;
  avgCost?: number;
  contract?: Row;
  marketPrice?: number;
  position?: number;
  realizedPNL?: number;
  unrealizedPNL?: number;
};

type BrokerExecutionItem = {
  contract?: Row;
  execution?: Row;
  time?: string;
};

export type DashboardData = {
  availableBrokers: Array<{ id: string; name: string }>;
  brokerMode: string;
  brokerOnline: boolean;
  brokerRows: string[][];
  executionRows: string[][];
  logs: Row[];
  notifications: Row[];
  operationalOrders: Row[];
  positionRows: string[][];
  risk: Row | null;
  riskSettings: RiskSettings;
  signals: Row[];
  status: Row | null;
  trades: Row[];
};

const defaultRiskSettings: RiskSettings = {
  allowedSymbols: [],
  maxDailyRiskPct: 0.03,
  maxDailyTrades: 20,
  maxOpenTrades: 3,
  maxOrderNotional: 5000,
  maxOrderQty: 10,
  riskPerTradePct: 0.01
};

const dashboardFetchTimeoutMs = Number(process.env.DASHBOARD_FETCH_TIMEOUT_MS ?? 2500);

export async function getJson<T>(path: string): Promise<T | null> {
  const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
  const controller = new AbortController();
  const timeout = Number.isFinite(dashboardFetchTimeoutMs) && dashboardFetchTimeoutMs > 0
    ? setTimeout(() => controller.abort(), dashboardFetchTimeoutMs)
    : null;
  try {
    const res = await fetch(`${baseUrl}${path}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResult<T>;
    return json.data;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asText(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

export function numberValue(value: unknown) {
  const numeric = asNumber(value, Number.NaN);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(numeric)
    : "-";
}

function normalizeBrokerPosition(item: BrokerPortfolioItem | unknown[]) {
  if (Array.isArray(item)) {
    if (item.length >= 8 && item[0] && typeof item[0] === "object") {
      return {
        account: item[7],
        averageCost: item[4],
        contract: item[0] as Row,
        marketPrice: item[2],
        position: item[1],
        realizedPNL: item[6],
        unrealizedPNL: item[5]
      } as BrokerPortfolioItem;
    }
    if (item.length >= 4 && item[1] && typeof item[1] === "object") {
      return {
        account: item[0],
        averageCost: item[3],
        contract: item[1] as Row,
        position: item[2]
      } as BrokerPortfolioItem;
    }
  }
  return item as BrokerPortfolioItem;
}

export async function loadDashboardData(): Promise<DashboardData> {
  const [
    status,
    signals,
    trades,
    risk,
    brokerOrdersData,
    brokerPortfolioData,
    brokerExecutionsData,
    availableBrokers,
    operationalOrders,
    notifications,
    logs,
    riskSettings
  ] = await Promise.all([
    getJson<Row>("/status"),
    getJson<Row[]>("/signals"),
    getJson<Row[]>("/trades"),
    getJson<Row>("/risk"),
    getJson<{ mode?: string; orders?: BrokerOpenOrder[] }>("/api/trading/orders/open"),
    getJson<{ portfolio?: BrokerPortfolioItem[]; positions?: BrokerPortfolioItem[] }>("/api/trading/portfolio"),
    getJson<{ executions?: BrokerExecutionItem[] }>("/api/trading/executions"),
    getJson<Array<{ id: string; name: string }>>("/api/brokers"),
    getJson<Row[]>("/api/orders?limit=100"),
    getJson<Row[]>("/notifications"),
    getJson<Row[]>("/logs"),
    getJson<RiskSettings>("/api/risk/settings")
  ]);

  const brokerOrders = brokerOrdersData?.orders ?? [];
  const positions = brokerPortfolioData?.portfolio?.length
    ? brokerPortfolioData.portfolio
    : (brokerPortfolioData?.positions ?? []);
  const executions = brokerExecutionsData?.executions ?? [];

  return {
    availableBrokers: availableBrokers ?? [],
    brokerMode: brokerOrdersData?.mode ?? "paper",
    brokerOnline: Boolean(brokerOrdersData || availableBrokers?.length),
    brokerRows: brokerOrders.slice(0, 30).map((order) => [
      numberValue(order.order?.orderId),
      asText(order.contract?.symbol),
      asText(order.order?.action),
      numberValue(order.order?.totalQuantity),
      numberValue(order.order?.lmtPrice),
      asText(order.orderStatus?.status),
      numberValue(order.orderStatus?.remaining)
    ]),
    executionRows: executions.slice(0, 30).map((item) => {
      const execution: Row = item.execution ?? (item as unknown as Row);
      return [
        asText(execution.time ?? item.time).slice(0, 19),
        numberValue(execution.orderId ?? execution.order_id),
        asText(item.contract?.symbol ?? execution.symbol),
        asText(execution.side),
        numberValue(execution.shares),
        money(asNumber(execution.price)),
        asText(execution.exchange)
      ];
    }),
    logs: logs ?? [],
    notifications: notifications ?? [],
    operationalOrders: operationalOrders ?? [],
    positionRows: positions.slice(0, 30).map(normalizeBrokerPosition).map((position) => [
      asText(position.contract?.symbol),
      numberValue(position.position),
      money(asNumber(position.marketPrice)),
      money(asNumber(position.averageCost ?? position.avgCost)),
      money(asNumber(position.unrealizedPNL)),
      money(asNumber(position.realizedPNL))
    ]),
    risk,
    riskSettings: riskSettings ?? defaultRiskSettings,
    signals: signals ?? [],
    status,
    trades: trades ?? []
  };
}

Necesito implementar la integración de Atlas-Omega con Interactive Brokers usando IBKR Web API mediante Client Portal Gateway.

Contexto técnico:
- Stack del proyecto: Bun + TypeScript + Supabase + Vercel/VPS.
- No quiero poner Java dentro del código de negocio.
- Java/Client Portal Gateway debe quedar aislado como infraestructura en el VPS.
- El código de la app debe comunicarse con IBKR mediante un servicio propio llamado apps/ibkr-executor.
- La integración debe operar inicialmente SOLO en paper trading.
- Live trading debe quedar bloqueado por defecto.
- No se deben enviar órdenes desde el frontend.
- El frontend debe comunicarse con apps/api.
- apps/api debe guardar señales/órdenes/logs en Supabase y llamar a apps/ibkr-executor.
- apps/ibkr-executor debe ser el único servicio que habla con IBKR Client Portal Gateway en https://localhost:5000/v1/api.

Restricciones oficiales de IBKR a respetar:
- Para clientes retail/individuales, IBKR Web API requiere Client Portal Gateway.
- El Gateway es un programa Java.
- Las llamadas API deben hacerse desde la misma máquina donde el Gateway fue autenticado.
- El Gateway escucha por defecto en localhost:5000.
- La sesión debe mantenerse activa llamando POST /tickle aproximadamente cada 60 segundos.
- Para previsualizar órdenes se usa POST /iserver/account/{accountId}/orders/whatif.
- Para enviar órdenes se usa POST /iserver/account/{accountId}/orders.
- Las advertencias de órdenes pueden devolver un replyId que debe confirmarse con POST /iserver/reply/{replyId}.
- No auto-confirmar warnings por defecto.
- Respetar pacing: máximo global 10 requests/segundo.

Objetivo:
Crear una integración segura, modular y auditable con IBKR Paper Trading.

Arquitectura objetivo:

apps/web
  ↓
apps/api
  ↓
Supabase
  ↓
packages/risk-engine
  ↓
apps/ibkr-executor
  ↓
https://localhost:5000/v1/api
  ↓
IBKR Client Portal Gateway
  ↓
IBKR Paper Account

Tareas de implementación:

1. Crear estructura de carpetas si no existe:
- apps/ibkr-executor/src
- packages/trading-types/src
- packages/risk-engine/src
- infra/vps/systemd
- docs

2. Crear package apps/ibkr-executor:
- Runtime: Bun.
- Framework HTTP: Hono.
- Validación: Zod.
- Endpoints requeridos:
  - GET /health
  - GET /ibkr/auth-status
  - GET /ibkr/accounts
  - POST /ibkr/tickle
  - GET /marketdata/:conid
  - POST /orders/preview
  - POST /orders
  - POST /orders/reply/:replyId
  - GET /orders/open
  - DELETE /orders/:orderId

3. Seguridad del executor:
- Todos los endpoints privados, excepto /health, deben exigir header x-api-key.
- La API key debe venir de EXECUTOR_API_KEY.
- Rechazar cualquier operación live si ALLOW_LIVE_TRADING no es "true".
- Por defecto:
  - IBKR_DRY_RUN=true
  - ALLOW_LIVE_TRADING=false
  - IBKR_AUTO_CONFIRM_WARNINGS=false
  - MAX_ORDER_QTY=1
  - MAX_ORDER_NOTIONAL=500
- Bloquear órdenes MKT durante la primera integración.
- Aceptar solamente órdenes LMT inicialmente.
- No auto-confirmar warnings salvo que IBKR_AUTO_CONFIRM_WARNINGS=true.
- Si IBKR devuelve replyId, responder al cliente que requiere confirmación manual.

4. Variables de entorno para apps/ibkr-executor:
Crear .env.example con:

PORT=8080
EXECUTOR_API_KEY=change_me_internal_secret

IBKR_BASE_URL=https://localhost:5000/v1/api
IBKR_ACCOUNT_ID=DUXXXXXXX

IBKR_DRY_RUN=true
ALLOW_LIVE_TRADING=false
IBKR_AUTO_CONFIRM_WARNINGS=false

MAX_ORDER_QTY=1
MAX_ORDER_NOTIONAL=500
MAX_DAILY_TRADES=20
MAX_DAILY_LOSS=100

5. Crear cliente interno IBKR:
Archivo sugerido:
apps/ibkr-executor/src/lib/ibkr-client.ts

Debe implementar:
- ibkrRequest(method, path, body?)
- getAuthStatus()
- getAccounts()
- tickle()
- getMarketDataSnapshot(conid)
- previewOrder(accountId, order)
- placeOrder(accountId, order)
- replyToOrderWarning(replyId, confirmed)
- getOpenOrders(accountId)
- cancelOrder(accountId, orderId)

Notas:
- IBKR_BASE_URL apunta a https://localhost:5000/v1/api.
- En desarrollo local con certificado self-signed del Gateway, documentar que puede usarse NODE_TLS_REJECT_UNAUTHORIZED=0 solo en entorno controlado/local/VPS privado.
- No exponer nunca el puerto 5000 públicamente.

6. Crear tipos compartidos:
Archivo:
packages/trading-types/src/index.ts

Definir:
- AccountMode = "paper" | "live"
- OrderSide = "BUY" | "SELL"
- OrderType = "LMT" | "MKT" | "STP" | "STOP_LIMIT"
- TimeInForce = "DAY" | "GTC" | "IOC"
- TradingSignal
- TradeOrderRequest
- TradeOrderResponse
- BrokerExecutionLog
- RiskDecision

7. Crear risk engine:
Archivo:
packages/risk-engine/src/index.ts

Implementar función:
validateOrderRisk(input): RiskDecision

Reglas mínimas:
- Rechazar live trading si allowLiveTrading=false.
- Rechazar quantity <= 0.
- Rechazar quantity > maxOrderQty.
- Rechazar orderType MKT.
- Rechazar LMT sin price.
- Rechazar notional > maxOrderNotional.
- Rechazar si killSwitch=true.
- Rechazar si dailyTrades >= maxDailyTrades.
- Permitir solo símbolos autorizados si allowedSymbols viene configurado.
- Retornar objeto con:
  - passed: boolean
  - rule: string
  - reason: string | null
  - metadata?: object

8. Crear migraciones SQL Supabase:
Crear carpeta supabase/migrations si no existe.
Crear migración con tablas:

trading_signals:
- id uuid primary key default gen_random_uuid()
- source text not null
- strategy_id text not null
- symbol text not null
- side text not null
- asset_class text not null
- timeframe text
- confidence numeric
- payload jsonb not null
- status text not null default 'received'
- created_at timestamptz default now()

trade_orders:
- id uuid primary key default gen_random_uuid()
- signal_id uuid references trading_signals(id)
- broker text default 'IBKR'
- account_mode text check in ('paper','live')
- symbol text not null
- conid bigint
- side text check in ('BUY','SELL')
- order_type text not null
- quantity numeric not null
- limit_price numeric
- tif text default 'DAY'
- status text default 'created'
- client_order_id text
- broker_order_id text
- broker_reply_id text
- broker_response jsonb
- error_message text
- created_at timestamptz default now()
- updated_at timestamptz default now()

risk_events:
- id uuid primary key default gen_random_uuid()
- order_id uuid references trade_orders(id)
- signal_id uuid references trading_signals(id)
- rule_name text not null
- passed boolean not null
- reason text
- metadata jsonb
- created_at timestamptz default now()

broker_execution_logs:
- id uuid primary key default gen_random_uuid()
- order_id uuid references trade_orders(id)
- broker text default 'IBKR'
- endpoint text
- request_payload jsonb
- response_payload jsonb
- status_code int
- error_message text
- created_at timestamptz default now()

trading_runtime_state:
- id text primary key
- kill_switch boolean default true
- trading_mode text default 'paper'
- allow_live_trading boolean default false
- updated_at timestamptz default now()

Insert inicial:
id='global', kill_switch=true, trading_mode='paper', allow_live_trading=false

9. Integrar apps/api con executor:
Crear o modificar endpoint:
POST /api/trading/orders/preview
POST /api/trading/orders/submit

Flujo:
- Validar request.
- Leer runtime state desde Supabase.
- Guardar señal si viene signal payload.
- Crear orden en trade_orders con status='created'.
- Ejecutar validateOrderRisk.
- Guardar resultado en risk_events.
- Si riesgo falla:
  - actualizar trade_orders.status='risk_rejected'
  - responder error.
- Si riesgo pasa:
  - llamar apps/ibkr-executor /orders/preview o /orders.
  - guardar broker_execution_logs.
  - actualizar trade_orders.status según respuesta:
    - previewed
    - submitted
    - broker_warning
    - broker_rejected
    - broker_error
- Nunca enviar órdenes directamente desde apps/web.

Variables para apps/api:
IBKR_EXECUTOR_URL=http://localhost:8080
IBKR_EXECUTOR_API_KEY=change_me_internal_secret
TRADING_MODE=paper
ALLOW_LIVE_TRADING=false

10. Crear documentación operativa:
Archivo:
docs/ibkr-web-api-runbook.md

Debe incluir:
- Arquitectura.
- Cómo instalar Java SOLO en VPS.
- Cómo descargar Client Portal Gateway manualmente desde IBKR.
- Cómo ejecutar:
  cd ~/ibkr/clientportal.gw
  bin/run.sh root/conf.yaml
- Cómo abrir túnel SSH:
  ssh -L 5000:localhost:5000 usuario@IP_DEL_VPS
- Cómo login:
  https://localhost:5000
- Cómo validar:
  curl -k https://localhost:5000/v1/api/iserver/auth/status
  curl -k https://localhost:5000/v1/api/iserver/accounts
- Cómo levantar ibkr-executor.
- Cómo probar /orders/preview.
- Cómo probar /orders.
- Cómo confirmar replyId manual.
- Advertencia: no exponer localhost:5000 a internet.
- Advertencia: live trading queda bloqueado por defecto.
- Advertencia: la autenticación del Gateway no debe automatizarse.

11. Crear systemd templates:
infra/vps/systemd/ibkr-gateway.service.example
infra/vps/systemd/ibkr-executor.service.example

ibkr-gateway debe:
- correr desde /opt/ibkr/clientportal.gw
- ejecutar bin/run.sh root/conf.yaml
- restart=always

ibkr-executor debe:
- correr desde /opt/atlas-omega/apps/ibkr-executor
- ejecutar bun run src/index.ts
- cargar EnvironmentFile=/etc/atlas-omega/ibkr-executor.env
- restart=always
- incluir NODE_TLS_REJECT_UNAUTHORIZED=0 solo si está documentado como entorno controlado.

12. Crear scripts útiles:
apps/ibkr-executor/scripts/test-auth.sh
apps/ibkr-executor/scripts/test-accounts.sh
apps/ibkr-executor/scripts/test-preview-aapl.sh
apps/ibkr-executor/scripts/test-submit-aapl-paper.sh

Los scripts deben usar:
- EXECUTOR_API_KEY
- EXECUTOR_URL
- AAPL conid 265598 para prueba
- Orden LMT de 1 acción
- preview por defecto
- submit solo si CONFIRM_SUBMIT=true

13. Pruebas mínimas:
Agregar pruebas unitarias para risk-engine:
- rechaza live si allowLiveTrading=false
- rechaza market order
- rechaza quantity > max
- rechaza LMT sin price
- rechaza notional > max
- acepta LMT válida en paper

14. Criterios de aceptación:
La implementación se considera lista cuando:
- bun install funciona.
- bun test funciona.
- apps/ibkr-executor arranca con bun run src/index.ts.
- GET /health responde.
- Endpoints privados rechazan sin x-api-key.
- /orders/preview no llama IBKR si IBKR_DRY_RUN=true.
- /orders rechaza MKT.
- /orders rechaza live.
- /orders responde requiresManualConfirmation=true si IBKR devuelve id de warning.
- apps/api puede registrar orden, riesgo y log de broker en Supabase.
- Existe runbook operativo completo.
- No hay credenciales reales hardcodeadas.
- El puerto 5000 del Gateway no queda expuesto.

No implementar:
- No activar live trading.
- No auto-confirmar warnings.
- No meter el zip/binario del Client Portal Gateway dentro del repo.
- No exponer IBKR Gateway públicamente.
- No llamar IBKR desde frontend.
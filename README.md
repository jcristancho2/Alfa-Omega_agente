# ALFA-OMEGA

ALFA-OMEGA es un panel operativo de trading con dashboard, API, asistente, gestion de riesgo, Supabase y una integracion modular con Interactive Brokers mediante IBKR Client Portal Gateway.

Flujo principal:

```text
TradingView / senal manual
  -> apps/api
  -> Supabase o data/local-db.json
  -> packages/risk-engine
  -> apps/ibkr-executor
  -> IBKR Client Portal Gateway
  -> IBKR Paper Account
```

El frontend nunca envia ordenes directamente a IBKR. Las ordenes pasan por `apps/api`, se registran en Supabase, se validan con `packages/risk-engine` y solo despues se envian a `apps/ibkr-executor`.

## Stack

- `apps/dashboard`: dashboard Next.js.
- `apps/api`: API Bun + Hono.
- `apps/notification-worker`: worker Bun para notificaciones Kapso/mock.
- `apps/trading-engine`: motor Python para senales/trades simulados.
- `apps/ibkr-executor`: servicio Bun + Hono que habla con IBKR Gateway.
- `apps/broker-gateway`: frontera neutral con adaptadores IBKR y simulado.
- `apps/trading-orchestrator`: scheduler, estrategia EMA y reconciliación.
- `packages/risk-engine`: reglas de riesgo antes de enviar ordenes.
- `packages/trading-types`: tipos compartidos de trading.
- `packages/shared`: DB local y adaptador Supabase.
- `supabase/functions/tradingview-webhook`: Edge Function para senales externas.

## Requisitos

- Bun.
- Python 3.10+.
- Java 17 solo si vas a correr IBKR Client Portal Gateway.
- Supabase CLI si vas a desplegar Edge Functions o migraciones.

Instala dependencias:

```bash
cd /Users/raucrow/Barvaz.dev/alfa-omega
bun install
python3 -m pip install -r apps/trading-engine/requirements.txt
```

Prepara variables:

```bash
cp .env.example .env
```

Para modo local seguro puedes dejar Supabase vacio y usar `LOCAL_DB_PATH=data/local-db.json`.

## Ejecutar En Local

Levanta API, trading engine, notification worker, IBKR executor y dashboard:

```bash
cd /Users/raucrow/Barvaz.dev/alfa-omega
bun run dev
```

Para que IBKR quede conectado, antes abre TWS/IB Gateway Paper y verifica que escuche en `4002`:

```bash
lsof -nP -iTCP:4002 -sTCP:LISTEN
```

URLs:

- Dashboard: `http://localhost:3000`
- API: `http://localhost:4000`
- IBKR executor: `http://localhost:8080`
- DB local: `data/local-db.json`

Si quieres levantar la app sin IBKR executor:

```bash
bun run dev:no-executor
```

Si necesitas cambiar puertos:

```bash
API_PORT=4001 API_BASE_URL=http://localhost:4001 NEXT_PUBLIC_API_BASE_URL=http://localhost:4001 DASHBOARD_PORT=3001 bun run dev
```

Ejecutar por separado:

```bash
bun run dev:api
bun run dev:engine
bun run dev:notification
bun run dev:dashboard
bun run dev:executor
bun run dev:broker
bun run dev:orchestrator
```

## Trading Programado Y Multi-Broker

La ruta operativa nueva usa `apps/api -> packages/risk-engine -> apps/broker-gateway`.
Las órdenes manuales, recurrentes y generadas por EMA pasan por los mismos
controles de riesgo y quedan auditadas en Supabase.

- Búsqueda de instrumentos por broker.
- Órdenes bracket paper con stop loss y take profit.
- Compras y ventas recurrentes por intervalo o calendario semanal.
- Estrategia EMA configurable por temporalidad.
- Reconciliación cada 3 segundos y Supabase Realtime con polling de respaldo.

Aplica `supabase/migrations/004_programmed_multibroker_trading.sql` y
`supabase/migrations/005_operational_order_history.sql`, y consulta
`docs/programmed-multibroker-runbook.md` antes de activar el orchestrator.

## Comandos De Prueba Local

Health API:

```bash
curl http://localhost:4000/health
```

Crear senal manual:

```bash
curl -X POST http://localhost:4000/signals \
  -H "content-type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "strategy": "breakout",
    "direction": "BUY",
    "score": 8,
    "confidence": "medium",
    "entry_price": 65000,
    "stop_loss": 64500,
    "take_profit_1": 66000,
    "take_profit_2": 67000,
    "reason": "Ruptura de rango"
  }'
```

Consultar estado:

```bash
curl http://localhost:4000/signals
curl http://localhost:4000/trades
curl http://localhost:4000/risk
curl http://localhost:4000/notifications
curl http://localhost:4000/logs
```

Control del bot:

```bash
curl -X POST http://localhost:4000/pause
curl -X POST http://localhost:4000/resume
curl -X POST http://localhost:4000/risk/unlock
```

## Ejecutar IBKR Gateway Y Executor

El gateway de IBKR quedo fuera del repo en:

```bash
/Users/raucrow/Barvaz.dev/ibkr/clientportal.gw
```

Arranca Client Portal Gateway:

```bash
cd /Users/raucrow/Barvaz.dev/ibkr/clientportal.gw
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
bin/run.sh root/conf.local.yaml
```

Abre en el navegador:

```text
https://localhost:5050
```

Haz login manual con IBKR Paper. Luego valida:

```bash
curl -k https://localhost:5050/v1/api/iserver/auth/status
curl -k https://localhost:5050/v1/api/iserver/accounts
```

En otra terminal arranca el executor:

```bash
cd /Users/raucrow/Barvaz.dev/alfa-omega
set -a
source .env
set +a
bun run dev:executor
```

Health:

```bash
curl http://localhost:8080/health
```

Probar auth contra IBKR:

```bash
EXECUTOR_URL=http://localhost:8080 EXECUTOR_API_KEY=change_me_internal_secret apps/ibkr-executor/scripts/test-auth.sh
```

Preview de orden paper en modo seguro:

```bash
EXECUTOR_URL=http://localhost:8080 EXECUTOR_API_KEY=change_me_internal_secret apps/ibkr-executor/scripts/test-preview-aapl.sh
```

Mantener `IBKR_DRY_RUN=true` hasta confirmar conexion, cuenta, logs y controles de riesgo.

## Simular Ordenes Desde La App

Para probar el flujo completo local sin enviar ordenes reales:

1. Verifica que IB Gateway Paper/TWS escuche en `4002`:

```bash
lsof -nP -iTCP:4002 -sTCP:LISTEN
```

2. Reemplaza `IBKR_EXECUTOR_API_KEY` y `EXECUTOR_API_KEY` en `.env` por el mismo secreto.

3. Levanta el executor:

```bash
set -a
source .env
set +a
bun run dev:executor
```

4. Levanta la app local:

```bash
bun run dev
```

5. Abre:

```text
http://localhost:3000
```

6. En `Controles del bot`, usa `Orden paper simulada`:

- `AAPL`
- `265598`
- `BUY`
- `100`

7. Primero presiona `Preview`.
8. Luego presiona `Simular submit`.

Con `IBKR_DRY_RUN=true`, esto valida dashboard -> API -> risk-engine -> ibkr-executor -> TWS mode, pero no envia una orden real a IBKR.

## Supabase

Para migracion a Supabase real:

1. Configura en `.env`:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

2. Aplica migraciones en Supabase:

```bash
supabase db push
```

3. Despliega Edge Function de TradingView si aplica:

```bash
supabase functions deploy tradingview-webhook
```

## Asistente Gemini

Para activar Gemini:

```bash
GEMINI_ENABLED=true
GEMINI_API_KEY=TU_API_KEY_DE_GOOGLE_AI_STUDIO
GEMINI_MODEL=gemini-2.5-flash
```

Usa una API key de Google AI Studio, no un OAuth Client Secret.

## Render

Render debe levantar servicios separados:

- API: `bun install` y `bun --cwd apps/api start`.
- Dashboard: `bun install && bun --cwd apps/dashboard build` y `bun --cwd apps/dashboard start`.
- Notification worker: `bun install` y `bun --cwd apps/notification-worker start`.

IBKR Client Portal Gateway no deberia correr en Render; dejalo en VPS o maquina controlada junto al `ibkr-executor`.

## Seguridad

- No commitear `.env`.
- No commitear `clientportal.gw`.
- No exponer el puerto del Gateway IBKR a internet.
- No activar live trading sin revision separada.
- No auto-confirmar warnings de IBKR por defecto.
- Mantener ordenes reales bloqueadas hasta pasar pruebas paper.

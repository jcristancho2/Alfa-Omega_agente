# ALFA-OMEGA (MVP local sin Supabase online)

Este repo queda preparado para validar el flujo MVP en local:

`señal -> evaluación/score -> trade simulado -> notificación mock -> dashboard`

## Stack actual

- `apps/trading-engine` (Python): procesa señales `pending` y abre trades simulados.
- `apps/api` (Bun + Hono): expone estado, señales, trades, logs y control `pause/resume`.
- `apps/notification-worker` (Bun): envía notificaciones mock (`[KAPSO MOCK]`).
- `apps/dashboard` (Next.js): panel operativo consumiendo la API local.
- `data/local-db.json`: almacenamiento temporal local compartido.

## Requisitos

- Bun
- Python 3.10+

Instalar dependencias JS:

```bash
bun install
```

Instalar dependencias Python del engine:

```bash
python3 -m pip install -r apps/trading-engine/requirements.txt
```

## Variables de entorno

Usa `.env.example` como base.

Variables clave en este modo local:

- `TRADING_MODE=simulated`
- `WORKER_POLL_INTERVAL_SECONDS=10`
- `MIN_SIGNAL_SCORE=7` (opcional)
- `API_PORT=4000`
- `API_BASE_URL=http://localhost:4000` (para dashboard)
- `LOCAL_DB_PATH=data/local-db.json` (opcional)

## Ejecutar con un solo comando

Levanta API, trading engine, notification worker y dashboard juntos:

```bash
bun run dev
```

URLs principales:

- API: `http://localhost:4000`
- Dashboard: `http://localhost:3000`
- DB local: `data/local-db.json`

Si un puerto está ocupado:

```bash
API_PORT=4001 API_BASE_URL=http://localhost:4001 NEXT_PUBLIC_API_BASE_URL=http://localhost:4001 DASHBOARD_PORT=3001 bun run dev
```

Para incluir también el broker gateway simulado:

```bash
bun run dev:local:broker
```

Detener todo:

```bash
Ctrl+C
```

## Ejecutar por separado

Terminal 1:

```bash
bun run dev:api
```

Terminal 2:

```bash
bun run dev:engine
```

Terminal 3:

```bash
bun run dev:notification
```

Terminal 4:

```bash
bun run dev:dashboard
```

## Probar el flujo

1) Ver salud API:

```bash
curl http://localhost:4000/health
```

2) Ingresar señal manual:

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

3) Revisar procesamiento:

```bash
curl http://localhost:4000/signals
curl http://localhost:4000/trades
curl http://localhost:4000/notifications
curl http://localhost:4000/logs
curl http://localhost:4000/market/prices
```

4) Control del bot:

```bash
curl -X POST http://localhost:4000/pause
curl -X POST http://localhost:4000/resume
curl -X POST http://localhost:4000/risk/unlock
curl http://localhost:4000/risk
```

5) Probar comando Kapso mock:

```bash
curl -X POST http://localhost:4000/kapso-webhook \
  -H "content-type: application/json" \
  -d '{"command":"estado"}'
```

6) Cierre de trades (manual y por TP/SL):

```bash
# Actualizar precio de mercado mock (el engine usa este precio para cerrar por TP/SL)
curl -X POST http://localhost:4000/market/price \
  -H "content-type: application/json" \
  -d '{"symbol":"BTCUSDT","price":66000}'

# Cerrar manualmente un trade por ID
curl -X POST http://localhost:4000/trades/TU_TRADE_ID/close \
  -H "content-type: application/json" \
  -d '{"reason":"manual_test","exit_price":66100}'
```

## Pendiente (fase siguiente)

- Conectar Supabase Cloud real.
- Activar Edge Functions (`tradingview-webhook`, `kapso-webhook`, `bot-control`).
- Cambiar almacenamiento local por repositorios Supabase.
- Integrar Kapso real y webhook TradingView productivo.

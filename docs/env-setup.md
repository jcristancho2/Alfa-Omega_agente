# Environment Setup

This checklist explains which `.env` values are required for each ALFA-OMEGA feature and how to obtain them.

Do not commit `.env`. Keep real credentials only in local secrets, Render environment variables, Supabase secrets, or VPS environment files.

## Current Status

The local `.env` contains all expected keys from `.env.example`.

Values that still need real external configuration:

- `IBKR_EXECUTOR_API_KEY`
- `EXECUTOR_API_KEY`
- `IBKR_ACCOUNT_ID`
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `TRADINGVIEW_WEBHOOK_SECRET`
- `KAPSO_API_KEY`
- `KAPSO_PHONE_NUMBER_ID`
- `KAPSO_WEBHOOK_SECRET`

## IBKR

Required to preview or submit orders through `apps/ibkr-executor`.

Generate one internal executor API key:

```bash
openssl rand -hex 32
```

Set the same value in both variables:

```bash
EXECUTOR_API_KEY=generated_secret
IBKR_EXECUTOR_API_KEY=generated_secret
```

Purpose:

- `EXECUTOR_API_KEY`: used by `apps/ibkr-executor` to protect private endpoints.
- `IBKR_EXECUTOR_API_KEY`: used by `apps/api` when calling `apps/ibkr-executor`.

Get `IBKR_ACCOUNT_ID`:

1. Start Client Portal Gateway.
2. Log in manually with the IBKR Paper account at `https://localhost:5050`.
3. Run:

```bash
curl -k https://localhost:5050/v1/api/iserver/accounts
```

4. Use the returned paper account ID, usually similar to `DU1234567`.

Safe local values for initial testing:

```bash
IBKR_BASE_URL=https://localhost:5050/v1/api
IBKR_CONNECTION_MODE=tws
IBKR_HOST=127.0.0.1
IBKR_PORT=4002
IBKR_CLIENT_ID=1
IBKR_ACCOUNT_ID=DU1234567
IBKR_DRY_RUN=true
ALLOW_LIVE_TRADING=false
IBKR_AUTO_CONFIRM_WARNINGS=false
MAX_ORDER_QTY=1
MAX_ORDER_NOTIONAL=500
MAX_DAILY_TRADES=20
ALLOWED_SYMBOLS=AAPL
```

Keep `IBKR_DRY_RUN=true` until authentication, account lookup and order preview are confirmed.

## Supabase

Required for external deployment, trading order persistence, Edge Functions and dashboard Supabase reads.

Get values in Supabase:

1. Open Supabase project dashboard.
2. Go to Project Settings -> API.
3. Copy:
   - Project URL -> `SUPABASE_URL`
   - anon public key -> `SUPABASE_ANON_KEY`
   - service_role key -> `SUPABASE_SERVICE_ROLE_KEY`
4. Set dashboard public values:

```bash
NEXT_PUBLIC_SUPABASE_URL=same_as_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=same_as_SUPABASE_ANON_KEY
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend variables.

Apply migrations:

```bash
supabase db push
```

## Gemini

Required only if the assistant should use Gemini instead of deterministic local fallback.

Get the key:

1. Open Google AI Studio.
2. Create or select the Google account/project you want to use.
3. Create an API key.
4. Set:

```bash
GEMINI_ENABLED=true
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

Use a Google AI Studio API key. Do not use an OAuth client secret.

## TradingView Webhook

Required for `supabase/functions/tradingview-webhook`.

Generate a webhook secret:

```bash
openssl rand -hex 32
```

Set:

```bash
TRADINGVIEW_WEBHOOK_SECRET=generated_secret
```

Deploy Supabase Edge Function:

```bash
supabase functions deploy tradingview-webhook
supabase secrets set TRADINGVIEW_WEBHOOK_SECRET=generated_secret
supabase secrets set SUPABASE_URL=your_project_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

TradingView must send the secret in this header:

```text
x-alfa-omega-secret: generated_secret
```

## Kapso

Required only for real WhatsApp/Kapso messages. If `KAPSO_API_KEY` is empty, the worker remains in mock mode.

Get values from Kapso:

1. Open Kapso dashboard.
2. Create or select the WhatsApp integration.
3. Copy the API key -> `KAPSO_API_KEY`.
4. Copy the phone number ID -> `KAPSO_PHONE_NUMBER_ID`.
5. Generate a webhook secret:

```bash
openssl rand -hex 32
```

Set:

```bash
KAPSO_API_KEY=kapso_api_key
KAPSO_PHONE_NUMBER_ID=kapso_phone_number_id
KAPSO_WEBHOOK_SECRET=generated_secret
```

## Local-Only Defaults

These can stay as they are for local simulation:

```bash
APP_ENV=development
TRADING_MODE=simulated
LOCAL_DB_PATH=data/local-db.json
API_PORT=4000
API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
DASHBOARD_PORT=3000
WORKER_POLL_INTERVAL_SECONDS=10
NEXT_PUBLIC_TRADINGVIEW_ENABLED=false
```

Do not set `PORT` in the root `.env` for local development. Render injects `PORT` automatically per service.

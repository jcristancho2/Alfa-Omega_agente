# IBKR Web API Runbook

## Architecture

`apps/web/dashboard -> apps/api -> Supabase -> packages/risk-engine -> apps/ibkr-executor -> https://localhost:5050/v1/api -> IBKR Client Portal Gateway -> IBKR Paper Account`

The frontend never calls IBKR and never submits orders directly. `apps/ibkr-executor` is the only service that talks to IBKR Client Portal Gateway.

## Gateway Rules

- IBKR retail Web API requires Client Portal Gateway.
- The Gateway is Java infrastructure and must stay outside business code.
- API calls must run on the same VPS where the Gateway session was authenticated.
- Gateway default URL is `https://localhost:5000/v1/api`.
- On this macOS workstation, port `5000` is occupied by Control Center, so local development uses `https://localhost:5050/v1/api`.
- Keep the session warm with `POST /tickle` about every 60 seconds.
- Never expose port `5000` publicly.
- Do not automate Gateway authentication.
- Live trading is disabled by default.

## Install Java

Install Java only on the machine that runs Client Portal Gateway.

macOS with Homebrew:

```bash
brew install openjdk@17
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```

Linux VPS:

```bash
sudo apt-get update
sudo apt-get install -y openjdk-17-jre
```

## Install Client Portal Gateway

Download Client Portal Gateway manually from IBKR, then unpack it outside the application repo.

Local workstation path used during development:

```bash
cd /Users/raucrow/Barvaz.dev/ibkr/clientportal.gw
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
bin/run.sh root/conf.local.yaml
```

Production VPS path:

```bash
sudo mkdir -p /opt/ibkr
cd /opt/ibkr/clientportal.gw
bin/run.sh root/conf.yaml
```

Do not place `clientportal.gw` under `docs/` or commit it to Git.

## SSH Tunnel For Login

From your workstation:

```bash
ssh -L 5000:localhost:5000 usuario@IP_DEL_VPS
```

Then open:

```text
https://localhost:5050
```

Authenticate manually with the IBKR Paper account.

## Validate Gateway

```bash
curl -k https://localhost:5050/v1/api/iserver/auth/status
curl -k https://localhost:5050/v1/api/iserver/accounts
```

If `Client login succeeds` but `/iserver/auth/status` returns `authenticated: false`, initialize the brokerage session:

```bash
curl -k -X POST https://localhost:5050/v1/api/iserver/auth/ssodh/init \
  -H "content-type: application/json" \
  -d '{"publish":true,"compete":true}'
```

Then check `/iserver/auth/status` again. Trading and market data endpoints require `authenticated: true`.

If the Gateway uses a self-signed certificate, `NODE_TLS_REJECT_UNAUTHORIZED=0` may be used only inside the controlled local/private VPS environment. Do not use it for public traffic.

## Troubleshooting Brokerage Session

If the browser shows `Client login succeeds` but this command fails:

```bash
curl -k -X POST https://localhost:5050/v1/api/iserver/auth/ssodh/init \
  -H "content-type: application/json" \
  -d '{"publish":true,"compete":true}'
```

with:

```json
{"error":"failed to generate sso dh token"}
```

then the Gateway has a valid Client Portal SSO session, but IBKR has not created the brokerage session required for `/iserver` trading endpoints.

Check:

- The login must use the unique Paper Trading username, not only the live account username.
- Log out of Client Portal, TWS, IBKR Mobile and any other active IBKR session before retrying.
- The IBKR account must be fully approved and not in pending applicant state.
- Secure Login / two-factor authentication should be enabled and completed during Gateway login.
- Download and use the latest Client Portal Gateway from IBKR if the bundled gateway is old.
- Restart the Gateway after each failed brokerage-session attempt.

Healthy target response:

```json
{
  "authenticated": true,
  "connected": true
}
```

Until `/iserver/auth/status` returns `authenticated: true`, do not run order preview or submit tests.

## Start Executor

Create `/etc/atlas-omega/ibkr-executor.env` from `apps/ibkr-executor/.env.example`.

For local paper testing with IB Gateway/TWS socket API, use:

```bash
IBKR_CONNECTION_MODE=tws
IBKR_HOST=127.0.0.1
IBKR_PORT=4002
IBKR_CLIENT_ID=1
IBKR_ACCOUNT_ID=DUQ583510
IBKR_DRY_RUN=true
ALLOW_LIVE_TRADING=false
```

Keep `IBKR_DRY_RUN=true` until preview and risk checks are verified. If IB Gateway reports that the API is read-only, disable read-only API mode in IB Gateway/TWS API settings before attempting real paper submit.

```bash
cd /opt/atlas-omega/apps/ibkr-executor
bun install
bun run start
```

Health:

```bash
curl http://localhost:8080/health
```

Private endpoints require:

```bash
-H "x-api-key: $EXECUTOR_API_KEY"
```

Initialize brokerage session through the executor:

```bash
EXECUTOR_URL=http://localhost:8080 EXECUTOR_API_KEY=$EXECUTOR_API_KEY apps/ibkr-executor/scripts/test-initialize.sh
```

## Local App Simulation

The local API can simulate trading orders without Supabase. If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are empty, `/api/trading/orders/preview` and `/api/trading/orders/submit` use `data/local-db.json` logs and call the executor directly.

Safe simulation requirements:

- `IBKR_CONNECTION_MODE=tws`
- `IBKR_HOST=127.0.0.1`
- `IBKR_PORT=4002`
- `IBKR_ACCOUNT_ID=DUQ583510`
- `IBKR_DRY_RUN=true`
- `ALLOW_LIVE_TRADING=false`
- `MAX_ORDER_NOTIONAL=100`

Dashboard path:

```text
http://localhost:3000 -> Controles del bot -> Orden paper simulada
```

Use `Preview` first, then `Simular submit`.

## Preview Order

Before previewing or submitting an order, confirm:

- Gateway is running at `https://localhost:5050`.
- Browser login shows `Client login succeeds`.
- `/iserver/auth/status` returns `authenticated: true`.
- `/iserver/accounts` returns the expected paper account.
- `IBKR_ACCOUNT_ID` matches the paper account.
- `IBKR_DRY_RUN=true` for first tests.
- Order type is `LMT`; other order types are blocked during initial integration.

```bash
curl -sS -X POST "$EXECUTOR_URL/orders/preview" \
  -H "x-api-key: $EXECUTOR_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "accountMode":"paper",
    "symbol":"AAPL",
    "conid":265598,
    "side":"BUY",
    "orderType":"LMT",
    "quantity":1,
    "limitPrice":100,
    "tif":"DAY"
  }'
```

## Submit Paper Order

Submit remains dry-run unless `IBKR_DRY_RUN=false`. Live mode remains blocked unless both runtime and env explicitly allow it.

Initial paper submit checklist:

1. Preview succeeds with the expected account, symbol, side, quantity and limit price.
2. `IBKR_DRY_RUN=false` is set only for `apps/ibkr-executor`.
3. `ALLOW_LIVE_TRADING=false` remains set.
4. The order is still `accountMode: "paper"`.
5. A human is watching the IBKR UI and executor logs.

```bash
CONFIRM_SUBMIT=true apps/ibkr-executor/scripts/test-submit-aapl-paper.sh
```

## Confirm Warning Reply Manually

If IBKR returns a `replyId`, do not auto-confirm it. Confirm only after human review:

```bash
curl -sS -X POST "$EXECUTOR_URL/orders/reply/$REPLY_ID" \
  -H "x-api-key: $EXECUTOR_API_KEY" \
  -H "content-type: application/json" \
  -d '{"confirmed":true}'
```

`IBKR_AUTO_CONFIRM_WARNINGS=false` blocks confirmation by default.

## Warnings

- Do not expose the Gateway port to the internet.
- Do not commit Gateway binaries or ZIP files.
- Do not store real secrets in the repo.
- Keep `ALLOW_LIVE_TRADING=false` unless a separate production review approves live trading.
- Keep `IBKR_DRY_RUN=true` during first integration tests.

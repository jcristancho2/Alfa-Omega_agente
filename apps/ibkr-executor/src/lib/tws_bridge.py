import json
import math
import os
import sys
from typing import Any, Optional

try:
    from ib_insync import Contract, IB, LimitOrder, StopOrder
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"ib_insync is not installed: {exc}"}))
    sys.exit(0)


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    return json.loads(raw or "{}")


def connect(action: Optional[str] = None) -> IB:
    ib = IB()
    host = os.environ.get("IBKR_HOST") or os.environ.get("IBKR_TWS_HOST", "127.0.0.1")
    port = int(os.environ.get("IBKR_PORT") or os.environ.get("IBKR_TWS_PORT", "4002"))
    client_id = int(os.environ.get("IBKR_CLIENT_ID") or os.environ.get("IBKR_TWS_CLIENT_ID", "1"))
    if action in ("accounts", "authStatus", "executions", "historicalData", "marketdata", "openOrders", "orderStatus", "portfolio", "searchInstruments"):
        client_id = client_id + 10 + (os.getpid() % 1000)
    timeout = float(os.environ.get("IBKR_TWS_TIMEOUT_SECONDS", "8"))
    ib.connect(host, port, clientId=client_id, timeout=timeout)
    return ib


def serialize(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [serialize(item) for item in value]
    if isinstance(value, tuple):
        return [serialize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): serialize(item) for key, item in value.items()}
    if hasattr(value, "dict"):
        return serialize(value.dict())
    if hasattr(value, "__dict__"):
        return {
            str(key): serialize(item)
            for key, item in value.__dict__.items()
            if not str(key).startswith("_")
        }
    return str(value)


def build_contract(payload: dict[str, Any]):
    asset_class = str(payload.get("assetClass") or "STK")
    # IBKR represents ETFs as stock contracts.
    sec_type = "STK" if asset_class == "ETF" else asset_class
    # Route stocks and ETFs through SMART while retaining the qualified
    # contract's primary exchange for identification.
    exchange = "SMART" if sec_type == "STK" else str(payload.get("exchange") or "SMART")
    return Contract(
        conId=int(payload.get("conid") or 0),
        symbol=str(payload.get("symbol") or payload.get("ticker") or ""),
        secType=sec_type,
        exchange=exchange,
        currency=str(payload.get("currency") or "USD"),
    )


def qualify_contract(ib: IB, payload: dict[str, Any]):
    contract = build_contract(payload)
    qualified = ib.qualifyContracts(contract)
    if not qualified:
        label = payload.get("symbol") or payload.get("ticker") or payload.get("conid")
        raise ValueError(
            f"IBKR could not qualify instrument {label}; select a valid instrument from broker search"
        )
    return qualified[0]


def build_order(payload: dict[str, Any], what_if: bool):
    if payload.get("orderType") != "LMT":
        raise ValueError("Only LMT orders are supported in TWS mode")
    account = payload.get("accountId") or os.environ.get("IBKR_ACCOUNT_ID", "")
    order = LimitOrder(
        str(payload["side"]),
        float(payload["quantity"]),
        float(payload["limitPrice"]),
        account=account,
        tif=str(payload.get("tif", "DAY")),
    )
    order.whatIf = what_if
    order.transmit = True
    return order


def order_result(trade) -> dict[str, Any]:
    return {
        "contract": serialize(trade.contract),
        "fills": serialize(trade.fills),
        "log": serialize(trade.log),
        "order": serialize(trade.order),
        "orderState": serialize(getattr(trade, "orderState", None)),
        "orderStatus": serialize(getattr(trade, "orderStatus", None)),
    }


def trade_rejection(trade) -> Optional[str]:
    status = str(getattr(getattr(trade, "orderStatus", None), "status", ""))
    if status not in ("ApiCancelled", "Cancelled", "Inactive"):
        return None
    messages = [
        str(getattr(entry, "message", ""))
        for entry in getattr(trade, "log", [])
        if getattr(entry, "errorCode", 0) and getattr(entry, "message", "")
    ]
    detail = messages[-1] if messages else "IBKR rejected or cancelled the order"
    return f"{detail} (IBKR status: {status})"


def instrument_result(contract) -> dict[str, Any]:
    return {
        "assetClass": getattr(contract, "secType", "STK") or "STK",
        "brokerId": "ibkr",
        "currency": getattr(contract, "currency", "USD") or "USD",
        "exchange": getattr(contract, "primaryExchange", "") or getattr(contract, "exchange", "SMART"),
        "instrumentId": str(getattr(contract, "conId", "")),
        "name": getattr(contract, "description", "") or getattr(contract, "symbol", ""),
        "symbol": getattr(contract, "symbol", ""),
        "tradable": getattr(contract, "secType", "STK") != "IND",
    }


def build_wire_order(payload: dict[str, Any], account: str, what_if: bool):
    order_type = payload.get("orderType")
    if order_type == "STP":
        order = StopOrder(
            str(payload["side"]),
            float(payload["quantity"]),
            float(payload["price"]),
            account=account,
            tif=str(payload.get("tif", "GTC")),
        )
    else:
        order = LimitOrder(
            str(payload["side"]),
            float(payload["quantity"]),
            float(payload["price"]),
            account=account,
            tif=str(payload.get("tif", "DAY")),
        )
    order.whatIf = what_if
    return order


def main() -> None:
    payload = read_payload()
    action = payload.get("action")
    ib = connect(action)
    try:
        if action == "authStatus":
            print(json.dumps({
                "ok": True,
                "connected": ib.isConnected(),
                "mode": "tws",
                "serverVersion": ib.client.serverVersion(),
            }))
            return

        if action == "accounts":
            print(json.dumps({
                "ok": True,
                "accounts": ib.managedAccounts(),
                "mode": "tws",
                "serverVersion": ib.client.serverVersion(),
            }))
            return

        if action == "marketdata":
            print(json.dumps({
                "ok": True,
                "mode": "tws",
                "message": "marketdata preflight is not required for TWS order preview",
                "conid": payload.get("conid"),
            }))
            return

        if action == "searchInstruments":
            query = str(payload.get("query", "")).strip()
            normalized_query = "".join(char for char in query.lower() if char.isalnum())
            aliases = {
                "sp500": ["SPX", "SPY", "ES"],
                "sandp500": ["SPX", "SPY", "ES"],
                "nasdaq100": ["NDX", "QQQ", "NQ"],
                "dowjones": ["DJX", "DIA", "YM"],
                "russell2000": ["RUT", "IWM", "RTY"],
                "dax": ["DAX", "EXS1"],
                "ftse100": ["FTSE", "ISF"],
                "nikkei225": ["N225", "EWJ", "NKD"],
            }
            search_terms = aliases.get(normalized_query, [query])
            matches = []
            seen = set()
            for term in search_terms:
                for match in ib.reqMatchingSymbols(term):
                    conid = getattr(match.contract, "conId", None)
                    if conid in seen:
                        continue
                    seen.add(conid)
                    matches.append(match)
            print(json.dumps({
                "ok": True,
                "mode": "tws",
                "instruments": [instrument_result(match.contract) for match in matches[:50]],
            }))
            return

        if action == "historicalData":
            contract = qualify_contract(ib, payload)
            timeframe = str(payload.get("timeframe", "1h"))
            bars = {
                "1m": "1 min",
                "5m": "5 mins",
                "15m": "15 mins",
                "1h": "1 hour",
                "4h": "4 hours",
                "1d": "1 day",
            }
            duration = "1 D" if timeframe in ("1m", "5m", "15m") else "30 D"
            rows = ib.reqHistoricalData(
                contract,
                endDateTime="",
                durationStr=duration,
                barSizeSetting=bars.get(timeframe, "1 hour"),
                whatToShow="TRADES",
                useRTH=True,
                formatDate=2,
            )
            limit = int(payload.get("limit", 100))
            candles = [{
                "timestamp": str(row.date),
                "open": row.open,
                "high": row.high,
                "low": row.low,
                "close": row.close,
                "volume": row.volume,
            } for row in rows[-limit:]]
            print(json.dumps({"ok": True, "mode": "tws", "candles": serialize(candles)}))
            return

        if action == "openOrders":
            ib.reqAllOpenOrders()
            ib.sleep(1)
            print(json.dumps({"ok": True, "orders": serialize(ib.openTrades()), "mode": "tws"}))
            return

        if action == "orderStatus":
            order_id = int(payload["orderId"])
            ib.reqAllOpenOrders()
            ib.sleep(1)
            trade = next((trade for trade in ib.trades() if trade.order.orderId == order_id), None)
            print(json.dumps({"ok": True, "mode": "tws", "order": order_result(trade) if trade else None}))
            return

        if action == "portfolio":
            account = payload.get("accountId") or os.environ.get("IBKR_ACCOUNT_ID", "")
            pnl = ib.reqPnL(account, "") if account else None
            ib.sleep(2)
            print(json.dumps({
                "ok": True,
                "account": account,
                "accountValues": serialize(ib.accountValues()),
                "mode": "tws",
                "pnl": serialize(pnl),
                "portfolio": serialize(ib.portfolio()),
                "positions": serialize(ib.positions()),
            }))
            if pnl:
                ib.cancelPnL(account, "")
            return

        if action == "executions":
            print(json.dumps({
                "ok": True,
                "executions": serialize(ib.reqExecutions()),
                "mode": "tws",
            }))
            return

        if action in ("preview", "place"):
            contract = qualify_contract(ib, payload)
            trade = ib.placeOrder(contract, build_order(payload, action == "preview"))
            ib.sleep(3)
            rejection = trade_rejection(trade)
            if rejection:
                print(json.dumps({"ok": False, "error": rejection, "rawResponse": order_result(trade)}))
                return
            print(json.dumps({
                "ok": True,
                "dryRun": False,
                "mode": "tws",
                "rawResponse": order_result(trade),
                "requiresManualConfirmation": False,
                "status": "previewed" if action == "preview" else "submitted",
            }))
            return

        if action in ("previewBracket", "placeBracket"):
            raw_orders = payload.get("orders") or []
            if len(raw_orders) != 3:
                raise ValueError("bracket requires entry, stop loss and take profit")
            account = payload.get("accountId") or os.environ.get("IBKR_ACCOUNT_ID", "")
            what_if = action == "previewBracket"
            results = []
            parent_id = ib.client.getReqId()
            for index, raw_order in enumerate(raw_orders):
                contract = qualify_contract(ib, raw_order)
                order = build_wire_order(raw_order, account, what_if)
                order.orderId = parent_id + index
                # What-if orders are validated independently because TWS does not
                # retain a preview parent for the child legs to reference.
                order.parentId = 0 if what_if or index == 0 else parent_id
                order.transmit = True if what_if else index == 2
                trade = ib.placeOrder(contract, order)
                results.append(trade)
            ib.sleep(3)
            rejections = [rejection for trade in results if (rejection := trade_rejection(trade))]
            if rejections:
                print(json.dumps({
                    "ok": False,
                    "error": rejections[-1],
                    "orders": [order_result(trade) for trade in results],
                }))
                return
            print(json.dumps({
                "ok": True,
                "dryRun": False,
                "mode": "tws",
                "orders": [order_result(trade) for trade in results],
                "status": "previewed" if what_if else "submitted",
            }))
            return

        if action == "cancel":
            order_id = int(payload["orderId"])
            ib.reqAllOpenOrders()
            ib.sleep(1)
            for trade in ib.openTrades():
                if trade.order.orderId == order_id:
                    ib.cancelOrder(trade.order)
                    ib.sleep(1)
                    print(json.dumps({"ok": True, "mode": "tws", "rawResponse": order_result(trade)}))
                    return
            print(json.dumps({"ok": False, "error": f"order {order_id} not found"}))
            return

        print(json.dumps({"ok": False, "error": f"unsupported action: {action}"}))
    finally:
        ib.disconnect()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))

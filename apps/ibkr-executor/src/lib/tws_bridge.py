import json
import math
import os
import sys
from typing import Any, Optional

try:
    from ib_insync import IB, LimitOrder, Stock
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
    if action in ("accounts", "authStatus", "executions", "marketdata", "openOrders", "portfolio"):
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
    contract = Stock(str(payload["symbol"]), "SMART", "USD")
    if payload.get("conid"):
        contract.conId = int(payload["conid"])
    return contract


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

        if action == "openOrders":
            ib.reqAllOpenOrders()
            ib.sleep(1)
            print(json.dumps({"ok": True, "orders": serialize(ib.openTrades()), "mode": "tws"}))
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
            contract = build_contract(payload)
            qualified = ib.qualifyContracts(contract)
            contract = qualified[0] if qualified else contract
            trade = ib.placeOrder(contract, build_order(payload, action == "preview"))
            ib.sleep(3)
            print(json.dumps({
                "ok": True,
                "dryRun": False,
                "mode": "tws",
                "rawResponse": order_result(trade),
                "requiresManualConfirmation": False,
                "status": "previewed" if action == "preview" else "submitted",
            }))
            return

        if action == "cancel":
            order_id = int(payload["orderId"])
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

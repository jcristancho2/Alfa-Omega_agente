import json
import os
import time
import uuid
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

TRADING_MODE = os.getenv("TRADING_MODE", "simulated")
POLL_INTERVAL = int(os.getenv("WORKER_POLL_INTERVAL_SECONDS", "10"))
MIN_SCORE = int(os.getenv("MIN_SIGNAL_SCORE", "7"))
RISK_PER_TRADE_PCT = Decimal(os.getenv("RISK_PER_TRADE_PCT", "0.01"))
MAX_DAILY_RISK_PCT = Decimal(os.getenv("MAX_DAILY_RISK_PCT", "0.03"))
MAX_OPEN_TRADES = int(os.getenv("MAX_OPEN_TRADES", "3"))
LOCAL_DB_PATH = Path(os.getenv("LOCAL_DB_PATH", "data/local-db.json"))


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def seed_db():
    return {
        "bot_status": {
            "id": 1,
            "status": "active",
            "trading_mode": "simulated",
            "capital": 10000,
            "daily_pnl": 0,
            "updated_at": now_iso(),
        },
        "signals": [],
        "trades": [],
        "market_prices": {},
        "notifications": [],
        "system_logs": [],
    }


def read_db():
    if not LOCAL_DB_PATH.exists():
        write_db(seed_db())
    with LOCAL_DB_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_db(db):
    LOCAL_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOCAL_DB_PATH.open("w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)


def create_notification(db, event_type, message, metadata=None):
    db["notifications"].append(
        {
            "id": str(uuid.uuid4()),
            "channel": "whatsapp",
            "event_type": event_type,
            "message": message,
            "status": "pending",
            "metadata": metadata or {},
            "created_at": now_iso(),
        }
    )


def create_log(db, level, message, metadata=None):
    db["system_logs"].append(
        {
            "id": str(uuid.uuid4()),
            "level": level,
            "message": message,
            "metadata": metadata or {},
            "created_at": now_iso(),
        }
    )


def build_trade(signal, capital_amount):
    entry = Decimal(str(signal.get("entry_price") or 100))
    stop = Decimal(str(signal.get("stop_loss") or (entry * Decimal("0.99"))))
    capital = Decimal(str(capital_amount))
    risk_amount = capital * RISK_PER_TRADE_PCT
    price_risk = abs(entry - stop)
    if price_risk == 0:
        return None
    position_size = risk_amount / price_risk

    return {
        "id": str(uuid.uuid4()),
        "signal_id": signal["id"],
        "symbol": signal["symbol"],
        "direction": signal["direction"],
        "entry_price": float(entry),
        "stop_loss": float(stop),
        "take_profit_1": float(signal.get("take_profit_1")) if signal.get("take_profit_1") is not None else None,
        "take_profit_2": float(signal.get("take_profit_2")) if signal.get("take_profit_2") is not None else None,
        "position_size": float(position_size),
        "risk_amount": float(risk_amount),
        "status": "open",
        "close_reason": None,
        "exit_price": None,
        "pnl": 0.0,
        "pnl_percentage": 0.0,
        "opened_at": now_iso(),
        "closed_at": None,
    }


def daily_risk_used(db):
    today = now_iso()[:10]
    return sum(
        Decimal(str(t.get("risk_amount", 0)))
        for t in db["trades"]
        if t.get("opened_at", "")[:10] == today and t.get("status") == "open"
    )


def open_trades_count(db):
    return sum(1 for t in db["trades"] if t.get("status") == "open")


def set_risk_locked(db, reason, metadata=None):
    db["bot_status"]["status"] = "risk_locked"
    db["bot_status"]["updated_at"] = now_iso()
    create_log(db, "error", reason, metadata or {})
    create_notification(
        db,
        "risk_locked",
        f"ALFA-OMEGA activó bloqueo de riesgo: {reason}",
        metadata or {},
    )


def close_trade(db, trade, exit_price, reason):
    entry = Decimal(str(trade["entry_price"]))
    exit_value = Decimal(str(exit_price))
    position_size = Decimal(str(trade["position_size"]))

    if trade["direction"] == "BUY":
        pnl = (exit_value - entry) * position_size
    else:
        pnl = (entry - exit_value) * position_size

    pnl_pct = Decimal("0")
    if entry != 0:
        if trade["direction"] == "BUY":
            pnl_pct = ((exit_value - entry) / entry) * Decimal("100")
        else:
            pnl_pct = ((entry - exit_value) / entry) * Decimal("100")

    trade["status"] = "closed"
    trade["close_reason"] = reason
    trade["exit_price"] = float(exit_value)
    trade["pnl"] = float(pnl)
    trade["pnl_percentage"] = float(pnl_pct)
    trade["closed_at"] = now_iso()

    db["bot_status"]["daily_pnl"] = float(Decimal(str(db["bot_status"].get("daily_pnl", 0))) + pnl)
    db["bot_status"]["capital"] = float(Decimal(str(db["bot_status"].get("capital", 10000))) + pnl)
    db["bot_status"]["updated_at"] = now_iso()

    create_log(
        db,
        "info",
        "trade_closed",
        {"trade_id": trade["id"], "reason": reason, "exit_price": float(exit_value), "pnl": float(pnl)},
    )
    create_notification(
        db,
        "trade_closed",
        f"ALFA-OMEGA cerró operación {trade['symbol']} por {reason}. PnL: {float(pnl):.2f}",
        {"trade_id": trade["id"], "reason": reason, "pnl": float(pnl)},
    )


def process_open_trades(db):
    changed = False
    for trade in [t for t in db["trades"] if t.get("status") == "open"]:
        symbol = trade.get("symbol")
        if not symbol:
            continue
        market_price = db.get("market_prices", {}).get(symbol)
        if market_price is None:
            continue

        price = Decimal(str(market_price))
        stop = Decimal(str(trade.get("stop_loss")))
        tp1 = trade.get("take_profit_1")
        tp2 = trade.get("take_profit_2")

        if trade["direction"] == "BUY":
            if price <= stop:
                close_trade(db, trade, price, "stop_loss")
                changed = True
                continue
            if tp2 is not None and price >= Decimal(str(tp2)):
                close_trade(db, trade, price, "take_profit_2")
                changed = True
                continue
            if tp1 is not None and price >= Decimal(str(tp1)):
                close_trade(db, trade, price, "take_profit_1")
                changed = True
                continue
        else:
            if price >= stop:
                close_trade(db, trade, price, "stop_loss")
                changed = True
                continue
            if tp2 is not None and price <= Decimal(str(tp2)):
                close_trade(db, trade, price, "take_profit_2")
                changed = True
                continue
            if tp1 is not None and price <= Decimal(str(tp1)):
                close_trade(db, trade, price, "take_profit_1")
                changed = True
                continue
    return changed


def process_once():
    db = read_db()
    if "market_prices" not in db:
        db["market_prices"] = {}

    trades_changed = process_open_trades(db)
    bot_status = db["bot_status"]["status"]

    if bot_status != "active":
        write_db(db)
        return

    pending = sorted(
        [s for s in db["signals"] if s.get("status") == "pending"],
        key=lambda s: s.get("created_at", ""),
    )
    if not pending:
        if trades_changed:
            write_db(db)
        return

    signal = pending[0]
    score = int(signal.get("score", 0))
    if score < MIN_SCORE:
        signal["status"] = "rejected"
        create_log(
            db,
            "warn",
            "signal_rejected_low_score",
            {"signal_id": signal["id"], "score": score, "min_score": MIN_SCORE},
        )
        write_db(db)
        return

    if open_trades_count(db) >= MAX_OPEN_TRADES:
        signal["status"] = "rejected"
        create_log(
            db,
            "warn",
            "signal_rejected_max_open_trades",
            {"signal_id": signal["id"], "max_open_trades": MAX_OPEN_TRADES},
        )
        write_db(db)
        return

    capital = Decimal(str(db["bot_status"].get("capital", 10000)))

    trade = build_trade(signal, capital)
    if trade is None:
        signal["status"] = "rejected"
        create_log(
            db,
            "warn",
            "signal_rejected_invalid_risk",
            {"signal_id": signal["id"], "reason": "entry_price == stop_loss"},
        )
        write_db(db)
        return

    daily_limit = capital * MAX_DAILY_RISK_PCT
    used = daily_risk_used(db)
    trade_risk = Decimal(str(trade["risk_amount"]))
    if used + trade_risk > daily_limit:
        signal["status"] = "rejected"
        set_risk_locked(
            db,
            "daily_risk_limit_exceeded",
            {
                "signal_id": signal["id"],
                "daily_risk_used": float(used),
                "trade_risk": float(trade_risk),
                "daily_risk_limit": float(daily_limit),
            },
        )
        write_db(db)
        return

    db["trades"].append(trade)
    signal["status"] = "processed"

    create_log(
        db,
        "info",
        "trade_opened",
        {"signal_id": signal["id"], "trade_id": trade["id"], "symbol": signal["symbol"]},
    )
    create_notification(
        db,
        "trade_opened",
        f"ALFA-OMEGA abrió operación simulada: {signal['symbol']} {signal['direction']} score {signal['score']}/13",
        {"signal_id": signal["id"], "trade_id": trade["id"]},
    )
    write_db(db)


def main():
    print("ALFA-OMEGA Trading Engine iniciado (local data mode)")
    print(f"Modo: {TRADING_MODE}")
    if TRADING_MODE == "live":
        raise RuntimeError("Live trading is blocked in MVP")

    while True:
        try:
            process_once()
            time.sleep(POLL_INTERVAL)
        except Exception as error:
            print(f"Error worker: {error}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()

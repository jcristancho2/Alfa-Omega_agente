import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const secret = req.headers.get("x-alfa-omega-secret");
    const expectedSecret = Deno.env.get("TRADINGVIEW_WEBHOOK_SECRET");

    if (!expectedSecret || secret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("signals")
      .insert({
        symbol: payload.symbol ?? "UNKNOWN",
        strategy: payload.strategy ?? "tradingview_alert",
        direction: payload.direction ?? "BUY",
        score: Number(payload.score ?? 5),
        confidence: payload.confidence ?? "medium",
        entry_price: payload.entry_price ?? null,
        stop_loss: payload.stop_loss ?? null,
        take_profit_1: payload.take_profit_1 ?? null,
        take_profit_2: payload.take_profit_2 ?? null,
        source: "tradingview",
        reason: payload.reason ?? "TradingView webhook signal",
        raw_payload: payload
      })
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, signal: data }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});

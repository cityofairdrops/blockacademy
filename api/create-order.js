
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "Server configuration error"
    });
  }

  const {
    email,
    payment_method,
    payment_currency
  } = req.body || {};

  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const allowedCurrencies = {
    crypto: ["BNB", "USDT", "USDC"],
    binance_pay: ["BINANCE_PAY"]
  };

  if (
    !Object.prototype.hasOwnProperty.call(
      allowedCurrencies,
      payment_method
    ) ||
    !allowedCurrencies[payment_method].includes(payment_currency)
  ) {
    return res.status(400).json({
      error: "Invalid payment method or currency."
    });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 30 * 60 * 1000
  ).toISOString();

  try {
    const trackingToken = Array.from(
      crypto.getRandomValues(new Uint8Array(32))
    ).map(byte => byte.toString(16).padStart(2, "0")).join("");

    const response = await fetch(`${baseUrl}/rest/v1/orders`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        product_slug: "trading-guide-weather-markets",
        amount_usd: 0.5,
        payment_method,
        payment_currency,
        status: "awaiting_payment",
        payment_expires_at: expiresAt,
        tracking_token: trackingToken
      })
    });

    if (!response.ok) {
      console.error("Order creation failed:", await response.text());
      return res.status(502).json({
        error: "Unable to create order."
      });
    }

    const orders = await response.json();
    const order = orders[0];

    if (!order) {
      return res.status(500).json({
        error: "Order creation returned no record."
      });
    }

    return res.status(201).json({
      success: true,
      order_id: order.id,
      tracking_token: trackingToken,
      email: order.email,
      amount_usd: order.amount_usd,
      payment_method: order.payment_method,
      payment_currency: order.payment_currency,
      payment_expires_at: order.payment_expires_at
    });

  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({
      error: "Unexpected server error."
    });
  }
}

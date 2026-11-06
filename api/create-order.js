import crypto from "crypto";

const PRODUCTS = {
  "trading-guide-weather-markets": {
    title: "Trading Guide — A Practical Guide to Weather Markets on Polymarket",
    price: 0.50
  }
};

const CURRENCIES = {
  crypto: ["BNB", "USDT", "USDC"],
  binance_pay: ["BINANCE_PAY"]
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      email,
      product_slug,
      payment_method,
      payment_currency
    } = req.body || {};

    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (
      !normalizedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const product = PRODUCTS[product_slug];

    if (!product) {
      return res.status(400).json({ error: "Invalid product." });
    }

    if (!CURRENCIES[payment_method]) {
      return res.status(400).json({ error: "Invalid payment method." });
    }

    if (!CURRENCIES[payment_method].includes(payment_currency)) {
      return res.status(400).json({ error: "Invalid payment currency." });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Payment system configuration is incomplete." });
    }

    const trackingToken = crypto.randomBytes(32).toString("hex");

    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/create_or_reuse_order`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          p_email: normalizedEmail,
          p_product_slug: product_slug,
          p_amount_usd: product.price,
          p_payment_method: payment_method,
          p_payment_currency: payment_currency,
          p_tracking_token: trackingToken
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Create/reuse order error:", result);
      return res.status(500).json({
        error: "Unable to create or restore your order. Please try again."
      });
    }

    const order = Array.isArray(result) ? result[0] : result;

    if (!order || !order.order_id) {
      return res.status(500).json({ error: "Invalid order response." });
    }

    return res.status(200).json({
      success: true,
      reused: order.reused,
      order_id: order.order_id,
      tracking_token: order.tracking_token,
      email: order.email,
      product_slug: order.product_slug,
      product_title: product.title,
      amount_usd: Number(order.amount_usd),
      payment_method: order.payment_method,
      payment_currency: order.payment_currency,
      status: order.status,
      payment_expires_at: order.payment_expires_at
    });

  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
}

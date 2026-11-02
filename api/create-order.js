
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const { email, payment_method } = req.body || {};

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    if (!["crypto", "binance_pay"].includes(payment_method)) {
      return res.status(400).json({ error: "Invalid payment method." });
    }

    // Payment window begins when the server creates the order.
    const minutes = payment_method === "crypto" ? 10 : 15;
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    const response = await fetch(
      `${supabaseUrl}/rest/v1/orders`,
      {
        method: "POST",
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          email: cleanEmail,
          product_slug: "weather-markets-guide",
          amount_usd: 0.50,
          payment_method,
          status: "awaiting_payment",
          payment_expires_at: expiresAt
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !Array.isArray(result) || !result[0]) {
      console.error("Order creation failed:", result);
      return res.status(500).json({ error: "Could not create your order." });
    }

    const order = result[0];

    return res.status(201).json({
      ok: true,
      order_id: order.id,
      tracking_token: order.tracking_token,
      expires_at: order.payment_expires_at,
      amount_usd: order.amount_usd,
      payment_method: order.payment_method
    });

  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

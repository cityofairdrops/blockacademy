export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { order_id } = req.body || {};

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(String(order_id || ""))) {
      return res.status(400).json({ error: "Please enter a valid Order ID." });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Tracking system is not configured." });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}&select=id,product_slug,amount_usd,payment_method,payment_currency,status,payment_expires_at,created_at,approved_at,completed_at`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (!response.ok) {
      throw new Error("Order lookup failed");
    }

    const orders = await response.json();

    if (!orders.length) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orders[0];

    const productTitles = {
      "trading-guide-weather-markets":
        "Trading Guide — A Practical Guide to Weather Markets on Polymarket"
    };

    return res.status(200).json({
      success: true,
      order: {
        order_id: order.id,
        product_slug: order.product_slug,
        product_title: productTitles[order.product_slug] || "Digital product",
        amount_usd: order.amount_usd,
        payment_method: order.payment_method,
        payment_currency: order.payment_currency,
        status: order.status,
        payment_expires_at: order.payment_expires_at,
        created_at: order.created_at,
        approved_at: order.approved_at,
        completed_at: order.completed_at
      }
    });

  } catch (error) {
    console.error("Order tracking error:", error);
    return res.status(500).json({ error: "Unable to track this order right now." });
  }
}

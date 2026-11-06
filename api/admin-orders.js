
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const { tracking_token } = req.body || {};

  if (
    typeof tracking_token !== "string" ||
    !/^[a-f0-9]{64}$/i.test(tracking_token)
  ) {
    return res.status(400).json({ error: "Enter a valid tracking token" });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  };

  try {
    const orderUrl = new URL(`${baseUrl}/rest/v1/orders`);

    orderUrl.searchParams.set("tracking_token", `eq.${tracking_token}`);
    orderUrl.searchParams.set(
      "select",
      "id,email,product_slug,amount_usd,payment_method,payment_currency,status,payment_expires_at,approved_at,completed_at,created_at,updated_at"
    );

    const response = await fetch(orderUrl, { headers });

    if (!response.ok) {
      console.error("Order lookup failed:", await response.text());
      return res.status(502).json({ error: "Unable to retrieve order" });
    }

    const orders = await response.json();
    const order = orders[0];

    if (!order) {
      return res.status(404).json({
        error: "No order found. Check your tracking token."
      });
    }

    const submissionUrl = new URL(
      `${baseUrl}/rest/v1/payment_submissions`
    );

    submissionUrl.searchParams.set("order_id", `eq.${order.id}`);
    submissionUrl.searchParams.set(
      "select",
      "payment_method,transaction_reference,review_status,created_at,reviewed_at"
    );
    submissionUrl.searchParams.set("order", "created_at.desc");
    submissionUrl.searchParams.set("limit", "1");

    const submissionResponse = await fetch(submissionUrl, { headers });

    if (!submissionResponse.ok) {
      console.error(
        "Payment lookup failed:",
        await submissionResponse.text()
      );
      return res.status(502).json({
        error: "Unable to retrieve payment information"
      });
    }

    const submissions = await submissionResponse.json();

    return res.status(200).json({
      success: true,
      order,
      payment_submission: submissions[0] || null
    });
  } catch (error) {
    console.error("Track order error:", error);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}

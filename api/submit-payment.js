
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

  const {
    order_id,
    tracking_token,
    payment_method,
    payment_currency,
    transaction_reference
  } = req.body || {};

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    typeof order_id !== "string" ||
    !uuidPattern.test(order_id) ||
    typeof tracking_token !== "string" ||
    tracking_token.length < 32 ||
    tracking_token.length > 128
  ) {
    return res.status(400).json({ error: "Invalid order details" });
  }

  if (
    payment_method !== "crypto" &&
    payment_method !== "binance_pay"
  ) {
    return res.status(400).json({ error: "Invalid payment method" });
  }

  const allowedCurrencies = ["BNB", "USDT", "USDC"];

  if (
    payment_method === "crypto" &&
    !allowedCurrencies.includes(payment_currency)
  ) {
    return res.status(400).json({ error: "Invalid payment currency" });
  }

  if (
    payment_method === "binance_pay" &&
    payment_currency !== "BINANCE_PAY"
  ) {
    return res.status(400).json({ error: "Invalid payment currency" });
  }

  if (
    typeof transaction_reference !== "string" ||
    transaction_reference.trim().length < 5 ||
    transaction_reference.trim().length > 200
  ) {
    return res.status(400).json({ error: "Enter a valid transaction reference" });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  };

  try {
    const orderUrl = new URL(`${baseUrl}/rest/v1/orders`);
    orderUrl.searchParams.set("id", `eq.${order_id}`);
    orderUrl.searchParams.set("tracking_token", `eq.${tracking_token}`);
    orderUrl.searchParams.set(
      "select",
      "id,status,payment_method,payment_expires_at"
    );

    const orderResponse = await fetch(orderUrl, { headers });

    if (!orderResponse.ok) {
      return res.status(502).json({ error: "Could not verify the order" });
    }

    const orders = await orderResponse.json();
    const order = orders[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "awaiting_payment") {
      return res.status(409).json({
        error: "This order is no longer accepting payment submissions"
      });
    }

    if (order.payment_method !== payment_method) {
      return res.status(400).json({
        error: "Payment method does not match this order"
      });
    }

    if (
      !order.payment_expires_at ||
      new Date(order.payment_expires_at).getTime() <= Date.now()
    ) {
      return res.status(410).json({ error: "Payment window has expired" });
    }

    const submissionResponse = await fetch(
      `${baseUrl}/rest/v1/payment_submissions`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          order_id,
          payment_method,
          transaction_reference: transaction_reference.trim(),
          review_status: "pending"
        })
      }
    );

    if (!submissionResponse.ok) {
      const details = await submissionResponse.text();

      if (submissionResponse.status === 409) {
        return res.status(409).json({
          error: "This transaction reference has already been submitted"
        });
      }

      console.error("Payment submission insert failed:", details);
      return res.status(500).json({ error: "Could not save payment submission" });
    }

    const submissions = await submissionResponse.json();
    const submission = submissions[0];

    const updateUrl = new URL(`${baseUrl}/rest/v1/orders`);
    updateUrl.searchParams.set("id", `eq.${order_id}`);
    updateUrl.searchParams.set("tracking_token", `eq.${tracking_token}`);
    updateUrl.searchParams.set("status", "eq.awaiting_payment");

    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        ...headers,
        Prefer: "return=representation"
      },
      body: JSON.stringify({ status: "payment_submitted" })
    });

    const updatedOrders = updateResponse.ok
      ? await updateResponse.json()
      : [];

    if (!updatedOrders.length) {
      await fetch(
        `${baseUrl}/rest/v1/payment_submissions?id=eq.${submission.id}`,
        {
          method: "DELETE",
          headers
        }
      );

      return res.status(409).json({
        error: "The order changed. Please check your order status."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment submitted successfully. Your payment is awaiting review.",
      status: "payment_submitted"
    });
  } catch (error) {
    console.error("Submit payment error:", error);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}

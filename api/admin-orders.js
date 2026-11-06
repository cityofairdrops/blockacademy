
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !secretKey || !publishableKey) {
    return res.status(500).json({
      error: "Server configuration error"
    });
  }

  const authorization = req.headers.authorization || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");

  try {
    // Verify the logged-in Supabase user.
    const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid or expired session"
      });
    }

    const user = await userResponse.json();

    if (!user.id) {
      return res.status(401).json({
        error: "Unable to verify user"
      });
    }

    // Verify admin membership.
    const adminUrl = new URL(`${baseUrl}/rest/v1/admin_users`);
    adminUrl.searchParams.set("user_id", `eq.${user.id}`);
    adminUrl.searchParams.set("select", "user_id");
    adminUrl.searchParams.set("limit", "1");

    const adminResponse = await fetch(adminUrl, {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`
      }
    });

    if (!adminResponse.ok) {
      console.error("Admin verification failed:", await adminResponse.text());
      return res.status(502).json({
        error: "Unable to verify administrator"
      });
    }

    const admins = await adminResponse.json();

    if (!admins.length) {
      return res.status(403).json({
        error: "Administrator access denied"
      });
    }

    // Retrieve recent orders.
    const ordersUrl = new URL(`${baseUrl}/rest/v1/orders`);
    ordersUrl.searchParams.set(
      "select",
      "id,email,product_slug,amount_usd,payment_method,payment_currency,status,payment_expires_at,approved_at,completed_at,created_at,updated_at"
    );
    ordersUrl.searchParams.set("order", "created_at.desc");
    ordersUrl.searchParams.set("limit", "100");

    const ordersResponse = await fetch(ordersUrl, {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`
      }
    });

    if (!ordersResponse.ok) {
      console.error("Orders retrieval failed:", await ordersResponse.text());
      return res.status(502).json({
        error: "Unable to retrieve orders"
      });
    }

    const orders = await ordersResponse.json();

    // Retrieve payment submissions, newest first.
    const submissionsUrl = new URL(
      `${baseUrl}/rest/v1/payment_submissions`
    );
    submissionsUrl.searchParams.set(
      "select",
      "id,order_id,payment_method,transaction_reference,evidence_path,review_status,admin_note,reviewed_at,created_at"
    );
    submissionsUrl.searchParams.set("order", "created_at.desc");
    submissionsUrl.searchParams.set("limit", "500");

    const submissionsResponse = await fetch(submissionsUrl, {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`
      }
    });

    if (!submissionsResponse.ok) {
      console.error(
        "Payment submissions retrieval failed:",
        await submissionsResponse.text()
      );
      return res.status(502).json({
        error: "Unable to retrieve payment submissions"
      });
    }

    const payment_submissions = await submissionsResponse.json();

    return res.status(200).json({
      orders,
      payment_submissions
    });

  } catch (error) {
    console.error("Admin orders error:", error);
    return res.status(500).json({
      error: "Unexpected server error"
    });
  }
}

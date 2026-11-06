
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

  const authorization = req.headers.authorization || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { submission_id, decision, admin_note } = req.body || {};

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (
    typeof submission_id !== "string" ||
    !uuidPattern.test(submission_id)
  ) {
    return res.status(400).json({ error: "Invalid submission ID" });
  }

  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({
      error: "Decision must be approved or rejected"
    });
  }

  if (
    admin_note !== undefined &&
    (typeof admin_note !== "string" || admin_note.length > 1000)
  ) {
    return res.status(400).json({ error: "Invalid admin note" });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  };

  try {
    // Verify the administrator's Supabase session.
    const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!authResponse.ok) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    const user = await authResponse.json();

    // Check the admin_users table.
    const adminUrl = new URL(`${baseUrl}/rest/v1/admin_users`);
    adminUrl.searchParams.set("user_id", `eq.${user.id}`);
    adminUrl.searchParams.set("select", "user_id");
    adminUrl.searchParams.set("limit", "1");

    const adminResponse = await fetch(adminUrl, { headers });

    if (!adminResponse.ok) {
      return res.status(500).json({ error: "Could not verify admin access" });
    }

    const admins = await adminResponse.json();

    if (!admins.length) {
      return res.status(403).json({ error: "Administrator access denied" });
    }

    // Find the pending payment submission.
    const submissionUrl = new URL(
      `${baseUrl}/rest/v1/payment_submissions`
    );

    submissionUrl.searchParams.set("id", `eq.${submission_id}`);
    submissionUrl.searchParams.set("review_status", "eq.pending");
    submissionUrl.searchParams.set(
      "select",
      "id,order_id,review_status"
    );

    const submissionResponse = await fetch(submissionUrl, { headers });

    if (!submissionResponse.ok) {
      return res.status(502).json({ error: "Could not retrieve submission" });
    }

    const submissions = await submissionResponse.json();
    const submission = submissions[0];

    if (!submission) {
      return res.status(409).json({
        error: "Submission not found or already reviewed"
      });
    }

    const now = new Date().toISOString();

    // Record the admin's decision.
    const reviewUrl = new URL(
      `${baseUrl}/rest/v1/payment_submissions`
    );

    reviewUrl.searchParams.set("id", `eq.${submission_id}`);
    reviewUrl.searchParams.set("review_status", "eq.pending");

    const reviewResponse = await fetch(reviewUrl, {
      method: "PATCH",
      headers: {
        ...headers,
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        review_status: decision,
        admin_note: admin_note?.trim() || null,
        reviewed_at: now
      })
    });

    if (!reviewResponse.ok) {
      return res.status(502).json({ error: "Could not save review decision" });
    }

    const reviewed = await reviewResponse.json();

    if (!reviewed.length) {
      return res.status(409).json({
        error: "This submission has already been reviewed"
      });
    }

    // Update the corresponding order.
    const orderUrl = new URL(`${baseUrl}/rest/v1/orders`);
    orderUrl.searchParams.set("id", `eq.${submission.order_id}`);
    orderUrl.searchParams.set(
      "status",
      "in.(payment_submitted,under_review)"
    );

    const orderUpdate = {
      status: decision
    };

    if (decision === "approved") {
      orderUpdate.approved_at = now;
    }

    const orderResponse = await fetch(orderUrl, {
      method: "PATCH",
      headers: {
        ...headers,
        Prefer: "return=representation"
      },
      body: JSON.stringify(orderUpdate)
    });

    const updatedOrders = orderResponse.ok
      ? await orderResponse.json()
      : [];

    if (!updatedOrders.length) {
      // Revert the submission decision if the order could not be updated.
      await fetch(
        `${baseUrl}/rest/v1/payment_submissions?id=eq.${submission_id}&review_status=eq.${decision}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            review_status: "pending",
            admin_note: null,
            reviewed_at: null
          })
        }
      );

      return res.status(409).json({
        error: "Order status changed. The review was not completed."
      });
    }

    return res.status(200).json({
      success: true,
      decision,
      order_id: submission.order_id,
      message: `Payment ${decision} successfully`
    });
  } catch (error) {
    console.error("Admin payment review error:", error);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}

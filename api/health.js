
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(500).json({
      ok: false,
      message: "Supabase environment variables are missing."
    });
  }

  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        message: "Supabase connection failed.",
        status: response.status
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Block Academy backend is connected to Supabase."
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Unable to connect to Supabase."
    });
  }
}

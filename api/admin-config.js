
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasPublishableKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
    vercelEnvironment: process.env.VERCEL_ENV || "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown"
  });
}

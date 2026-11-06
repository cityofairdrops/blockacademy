
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    secretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
    publishableKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
    branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    environment: process.env.VERCEL_ENV || "unknown"
  });
}

// Loads SUPABASE_URL/SUPABASE_KEY for the LOCAL Supabase stack from a
// gitignored, test-only file — never the hosted `.env`. Absent in CI, where
// the job exports these directly after `supabase start`; that's expected,
// not an error.
try {
  process.loadEnvFile(".env.test.local");
} catch {
  // No .env.test.local — assume CI already exported the vars.
}

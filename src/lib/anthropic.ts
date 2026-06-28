import { Anthropic } from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY } from "astro:env/server";

// Null-safe Anthropic client factory — mirrors `createClient` in
// `@/lib/supabase`. Returns `null` when the key is unset so callers can degrade
// gracefully (consistent with the `config-status` gating pattern) instead of
// throwing at import/construction time.
export function createAnthropic(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from "astro:env/server";

// Null-safe Google Gemini client factory — mirrors `createClient` in
// `@/lib/supabase`. Returns `null` when the key is unset so callers can degrade
// gracefully (consistent with the `config-status` gating pattern) instead of
// throwing at construction time.
export function createGemini(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) {
    return null;
  }
  const client: GoogleGenAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return client;
}

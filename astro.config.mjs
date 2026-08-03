// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // `zod` reaches the browser only through the form islands (the client-side
    // mirror of the server validation in `src/lib/schemas/`), so Vite's dep
    // scanner does not see it when it pre-bundles on startup. Discovering it
    // on the first request to a form page triggers a mid-page re-optimization:
    // the already-loaded React chunk keeps the old `?v=` hash while the island
    // fetches the new one, giving two React copies (null hook dispatcher ->
    // "Cannot read properties of null (reading 'useState')") or a 404 on the
    // not-yet-written dep. Either way the island crashes and its server-rendered
    // markup is torn out of the DOM. Pre-bundling it up front avoids that.
    //
    // `lucide-react` hits the same class of bug on the SSR side: each form
    // island imports a different subset of named icon exports, so the first
    // request to a page using a not-yet-discovered icon (e.g. sign-in's
    // `LogIn`, vs. sign-up's own set) triggers mid-request re-optimization
    // that crashes SSR rendering ("Invalid hook call" inside lucide-react's
    // `useContext`, from a stale SSR module copy) — the page renders without
    // its island ever hydrating. Pre-bundling the whole package avoids
    // per-icon discovery entirely.
    optimizeDeps: {
      include: ["zod", "lucide-react"],
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      GEMINI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});

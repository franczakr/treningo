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
    optimizeDeps: {
      include: ["zod"],
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

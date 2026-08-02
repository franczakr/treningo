import { test, expect } from "@playwright/test";

// Golden-path risk: a new user can sign up, sign in, and have their training
// profile persist — the first three steps of the PRD's primary success
// criterion ("A new user can sign up / log in, fill in their training
// profile ..., receive one workout plan ..., save it, and browse it later").
// Scoped to signup -> profile persistence (no Gemini call): plan generation
// is a server-side LLM call this suite deliberately does not need to pass
// through (see tests/e2e/E2E_RULES.md).
//
// Runs against the LOCAL Supabase stack only — tests/e2e/global-setup.ts
// refuses to run this suite at all unless .dev.vars is confirmed local,
// never the hosted project.
test("profile data persists across a fresh navigation after first save", async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `e2e-${unique}@example.com`;
  const password = "TestPass123!";

  // --- Sign up ---
  await page.goto("/auth/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByLabel("Potwierdź hasło").fill(password);
  await page.getByRole("button", { name: "Załóż konto" }).click();

  await page.waitForURL("**/auth/confirm-email");
  await page.getByRole("link", { name: "Przejdź do logowania" }).click();

  // --- Sign in ---
  await page.waitForURL("**/auth/signin");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();

  await page.waitForURL("**/dashboard");

  // --- Fill and save the training profile (first-ever save) ---
  await page.goto("/training-profile");
  await page.getByLabel("Cel treningowy").selectOption({ label: "Siła" });
  await page.getByLabel("Poziom zaawansowania").selectOption({ label: "Początkujący" });
  await page.getByLabel("Wiek").fill("30");
  await page.getByLabel("Waga (kg)").fill("80");
  await page.getByLabel("Dni treningowe w tygodniu").fill("3");
  await page.getByLabel("Sztanga").check();
  await page.getByRole("button", { name: "Zapisz profil" }).click();

  // First-ever save carries the user straight into plan generation
  // (src/pages/api/profile.ts) — proves the write succeeded.
  await page.waitForURL("**/plan");

  // --- Confirm persistence: navigate away and back, form is pre-filled ---
  await page.goto("/training-profile");
  await expect(page.getByLabel("Cel treningowy")).toHaveValue("strength");
  await expect(page.getByLabel("Poziom zaawansowania")).toHaveValue("beginner");
  await expect(page.getByLabel("Wiek")).toHaveValue("30");
  await expect(page.getByLabel("Waga (kg)")).toHaveValue("80");
  await expect(page.getByLabel("Dni treningowe w tygodniu")).toHaveValue("3");
  await expect(page.getByLabel("Sztanga")).toBeChecked();
});

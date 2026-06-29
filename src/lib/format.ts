// Small formatting helpers shared across views.

// Format a Postgres ISO timestamp as a Polish date (e.g. "29 czerwca 2026").
// Used by the saved-plans list/reopen views to label a plan by its save date.
export function formatPlanDate(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

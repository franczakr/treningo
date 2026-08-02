import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("keeps non-conflicting classes from both arguments", () => {
    expect(cn("text-sm", "font-bold")).toBe("text-sm font-bold");
  });
});

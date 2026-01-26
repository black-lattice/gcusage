import type { Period } from "../../types";

export function normalizePeriod(value: unknown): Period | null {
  if (value === "day" || value === "week" || value === "month" || value === "session") return value;
  return null;
}

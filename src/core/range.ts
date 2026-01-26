import type { Period } from "../types";
import { endOfDay, startOfDay, startOfWeekMonday } from "./utils/time";

export function isPeriodProvided(args: string[]): boolean {
  return args.some((arg) => arg === "--period" || arg.startsWith("--period="));
}

export function resolveRange(
  period: Period,
  periodWasProvided: boolean,
  sinceMs: number | null,
  untilMs: number | null
): { sinceMs: number | null; untilMs: number | null } {
  const now = new Date();

  if (period === "session") {
    const start = startOfDay(now).getTime();
    const end = endOfDay(now).getTime();
    return applyUntilClamp({ sinceMs: start, untilMs: end }, untilMs);
  }

  if (!periodWasProvided && sinceMs === null && untilMs === null) {
    const end = endOfDay(now).getTime();
    const startDate = new Date(now.getTime());
    startDate.setDate(startDate.getDate() - 5);
    const start = startOfDay(startDate).getTime();
    return { sinceMs: start, untilMs: end };
  }

  if (period === "day") {
    if (sinceMs === null && untilMs === null) {
      const start = startOfDay(now).getTime();
      const end = endOfDay(now).getTime();
      return { sinceMs: start, untilMs: end };
    }
    return { sinceMs, untilMs };
  }

  if (period === "week") {
    if (sinceMs !== null) {
      const start = startOfDay(new Date(sinceMs)).getTime();
      const end = endOfDay(new Date(start + 6 * 86400000)).getTime();
      return applyUntilClamp({ sinceMs: start, untilMs: end }, untilMs);
    }
    const start = startOfWeekMonday(now).getTime();
    const end = endOfDay(new Date(start + 6 * 86400000)).getTime();
    return applyUntilClamp({ sinceMs: start, untilMs: end }, untilMs);
  }

  if (period === "month") {
    const base = sinceMs !== null ? new Date(sinceMs) : now;
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return applyUntilClamp({ sinceMs: startOfDay(start).getTime(), untilMs: endOfDay(end).getTime() }, untilMs);
  }

  return { sinceMs, untilMs };
}

export function applyUntilClamp(
  range: { sinceMs: number | null; untilMs: number | null },
  untilMs: number | null
): { sinceMs: number | null; untilMs: number | null } {
  if (untilMs === null) return range;
  if (range.untilMs === null || untilMs < range.untilMs) {
    return { sinceMs: range.sinceMs, untilMs };
  }
  return range;
}

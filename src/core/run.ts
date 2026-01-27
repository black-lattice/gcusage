import os from "os";
import path from "path";
import type { DailyTotals, Period, SessionTotals } from "../types";
import { MESSAGES } from "../messages";
import { aggregateSessionsToDay, buildSessionSummaries, toSessionTotals } from "./aggregate";
import { findLogFiles, parseLogFile } from "./logs";
import { resolveRange } from "./range";

export async function run(
  activePeriod: Period,
  periodWasProvided: boolean,
  rawSince: number | null,
  rawUntil: number | null,
  modelFilter: string | null,
  typeFilter: string | null
): Promise<{ json: unknown[]; table: DailyTotals[] | SessionTotals[]; range: { sinceMs: number | null; untilMs: number | null } }> {
  const logFiles = await findLogFiles();
  if (logFiles.length === 0) {
    const logPath = path.join(os.homedir(), ".gemini", "telemetry.log");
    console.error(`${MESSAGES.NO_LOG_FOUND}${logPath}`);
    return { json: [], table: [], range: { sinceMs: null, untilMs: null } };
  }

  const points = [] as Awaited<ReturnType<typeof parseLogFile>>;
  for (const file of logFiles) {
    const filePoints = await parseLogFile(file);
    points.push(...filePoints);
  }

  const range = resolveRange(activePeriod, periodWasProvided, rawSince, rawUntil);

  const filteredByType = points.filter((p) => {
    if (modelFilter && p.model !== modelFilter) return false;
    if (typeFilter && p.type !== typeFilter) return false;
    return true;
  });

  const summaries = buildSessionSummaries(filteredByType).filter((s) => {
    if (range.sinceMs !== null && s.sessionStartMs < range.sinceMs) return false;
    if (range.untilMs !== null && s.sessionStartMs > range.untilMs) return false;
    return true;
  });

  if (activePeriod === "session") {
    const table = summaries.map((s) => toSessionTotals(s));
    const json = table.map((row) => ({
      date: row.date,
      session: row.sessionId,
      models: Array.from(row.models),
      input: Math.round(row.input),
      output: Math.round(row.output),
      thought: Math.round(row.thought),
      cache: Math.round(row.cache),
      tool: Math.round(row.tool)
    }));
    return { json, table, range };
  }

  const table = aggregateSessionsToDay(summaries);
  const json = table.map((row) => ({
    date: row.date,
    models: Array.from(row.models),
    input: Math.round(row.input),
    output: Math.round(row.output),
    thought: Math.round(row.thought),
    cache: Math.round(row.cache),
    tool: Math.round(row.tool)
  }));
  return { json, table, range };
}

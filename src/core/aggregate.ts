import type { DailyTotals, MetricPoint, SessionSummary, SessionTotals } from "../types";
import { toDateKey } from "./utils/time";

export function buildSessionSummaries(points: MetricPoint[]): SessionSummary[] {
  const sessionMap = new Map<
    string,
    {
      sessionStartMs: number;
      models: Set<string>;
      lastByModelType: Map<string, { timestampMs: number; value: number; type: string }>;
    }
  >();

  for (const p of points) {
    if (!p.sessionId) continue;
    const entry = sessionMap.get(p.sessionId);
    const modelTypeKey = `${p.model}||${p.type}`;
    if (!entry) {
      const map = new Map<string, { timestampMs: number; value: number; type: string }>();
      map.set(modelTypeKey, { timestampMs: p.timestampMs, value: p.value, type: p.type });
      sessionMap.set(p.sessionId, {
        sessionStartMs: p.timestampMs,
        models: new Set<string>([p.model]),
        lastByModelType: map
      });
      continue;
    }

    entry.sessionStartMs = Math.min(entry.sessionStartMs, p.timestampMs);
    entry.models.add(p.model);

    const last = entry.lastByModelType.get(modelTypeKey);
    if (!last || p.timestampMs >= last.timestampMs) {
      entry.lastByModelType.set(modelTypeKey, { timestampMs: p.timestampMs, value: p.value, type: p.type });
    }
  }

  const summaries: SessionSummary[] = [];
  for (const [sessionId, entry] of sessionMap.entries()) {
    const totals = { input: 0, output: 0, thought: 0, cache: 0, tool: 0 };
    for (const item of entry.lastByModelType.values()) {
      addTypeValue(totals, item.type, item.value);
    }
    summaries.push({
      sessionId,
      sessionStartMs: entry.sessionStartMs,
      models: entry.models,
      input: totals.input,
      output: totals.output,
      thought: totals.thought,
      cache: totals.cache,
      tool: totals.tool
    });
  }

  summaries.sort((a, b) => a.sessionStartMs - b.sessionStartMs || a.sessionId.localeCompare(b.sessionId));
  return summaries;
}

export function toSessionTotals(summary: SessionSummary): SessionTotals {
  return {
    date: toDateKey(summary.sessionStartMs),
    sessionId: summary.sessionId,
    models: summary.models,
    input: summary.input,
    output: summary.output,
    thought: summary.thought,
    cache: summary.cache,
    tool: summary.tool
  };
}

export function aggregateSessionsToDay(summaries: SessionSummary[]): DailyTotals[] {
  const map = new Map<string, DailyTotals>();

  for (const s of summaries) {
    const dateKey = toDateKey(s.sessionStartMs);
    let row = map.get(dateKey);
    if (!row) {
      row = {
        date: dateKey,
        models: new Set<string>(),
        input: 0,
        output: 0,
        thought: 0,
        cache: 0,
        tool: 0
      };
      map.set(dateKey, row);
    }
    for (const m of s.models) row.models.add(m);
    row.input += s.input;
    row.output += s.output;
    row.thought += s.thought;
    row.cache += s.cache;
    row.tool += s.tool;
  }

  const rows = Array.from(map.values());
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export function aggregateByDay(points: MetricPoint[]): DailyTotals[] {
  const map = new Map<string, DailyTotals>();

  for (const p of points) {
    const dateKey = toDateKey(p.timestampMs);
    let row = map.get(dateKey);
    if (!row) {
      row = {
        date: dateKey,
        models: new Set<string>(),
        input: 0,
        output: 0,
        thought: 0,
        cache: 0,
        tool: 0
      };
      map.set(dateKey, row);
    }
    row.models.add(p.model);
    addTypeValue(row, p.type, p.value);
  }

  const rows = Array.from(map.values());
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export function aggregateBySession(points: MetricPoint[]): SessionTotals[] {
  const map = new Map<string, SessionTotals>();

  for (const p of points) {
    if (!p.sessionId) continue;
    const dateKey = toDateKey(p.timestampMs);
    const key = `${dateKey}||${p.sessionId}`;
    let row = map.get(key);
    if (!row) {
      row = {
        date: dateKey,
        sessionId: p.sessionId,
        models: new Set<string>(),
        input: 0,
        output: 0,
        thought: 0,
        cache: 0,
        tool: 0
      };
      map.set(key, row);
    }
    row.models.add(p.model);
    addTypeValue(row, p.type, p.value);
  }

  const rows = Array.from(map.values());
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.sessionId.localeCompare(b.sessionId);
  });
  return rows;
}

export function addTypeValue(target: { input: number; output: number; thought: number; cache: number; tool: number }, type: string, value: number): void {
  if (type === "input") target.input += value;
  else if (type === "output") target.output += value;
  else if (type === "thought") target.thought += value;
  else if (type === "cache") target.cache += value;
  else if (type === "tool") target.tool += value;
}

export function sumAll(row: { input: number; output: number; thought: number; cache: number; tool: number }): number {
  return row.input + row.output + row.thought + row.cache + row.tool;
}

export function sumTotals(totals: { input: number; output: number; thought: number; cache: number; tool: number }): number {
  return totals.input + totals.output + totals.thought + totals.cache + totals.tool;
}

#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { Command } from "commander";

type Period = "day" | "week" | "month" | "session";

type MetricPoint = {
  timestampMs: number;
  model: string;
  type: string;
  sessionId: string | null;
  value: number;
};

type DailyTotals = {
  date: string;
  models: Set<string>;
  input: number;
  output: number;
  thought: number;
  cache: number;
  tool: number;
};

type SessionTotals = {
  date: string;
  sessionId: string;
  models: Set<string>;
  input: number;
  output: number;
  thought: number;
  cache: number;
  tool: number;
};

type SessionSummary = {
  sessionId: string;
  sessionStartMs: number;
  models: Set<string>;
  input: number;
  output: number;
  thought: number;
  cache: number;
  tool: number;
};

const program = new Command();
let didRunSubcommand = false;

program
  .name("gcusage")
  .description("统计 Gemini CLI token 使用情况")
  .option("--since <time>", "开始时间，支持相对时间")
  .option("--until <time>", "结束时间，支持相对时间")
  .option("--period <period>", "聚合周期：day|week|month|session", "day")
  .option("--model <model>", "按模型过滤")
  .option("--type <type>", "按类型过滤")
  .option("--json", "输出 JSON")
  .action(async (opts) => {
    const periodValue = normalizePeriod(opts.period);
    if (!periodValue) {
      console.error("非法的 --period 参数，仅支持 day|week|month|session");
      process.exit(1);
    }
    const period: Period = periodValue;

    const sinceMs = parseTimeSpec(opts.since, "since");
    const untilMs = parseTimeSpec(opts.until, "until");
    const periodProvided = isPeriodProvided(process.argv);

    if (sinceMs !== null && untilMs !== null && sinceMs > untilMs) {
      console.error("--since 不能晚于 --until");
      process.exit(1);
    }

    const modelFilter = typeof opts.model === "string" ? opts.model : null;
    const typeFilter = typeof opts.type === "string" ? opts.type : null;
    const outputJson = Boolean(opts.json);

    const result = await run(period, periodProvided, sinceMs, untilMs, modelFilter, typeFilter);
    if (outputJson) {
      process.stdout.write(JSON.stringify(result.json, null, 2));
      process.stdout.write("\n");
      return;
    }

    renderTable(result, period);
  });

program
  .command("trim")
  .description("瘦身 telemetry.log，仅保留 token 使用数据")
  .action(async () => {
    didRunSubcommand = true;
    await runTrim();
  });

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
  if (didRunSubcommand) return;
}

async function run(
  activePeriod: Period,
  periodWasProvided: boolean,
  rawSince: number | null,
  rawUntil: number | null,
  modelFilter: string | null,
  typeFilter: string | null
): Promise<{ json: unknown[]; table: DailyTotals[] | SessionTotals[]; range: { sinceMs: number | null; untilMs: number | null } }> {
  const logFiles = await findLogFiles();
  if (logFiles.length === 0) {
    console.error("未找到任何日志文件：~/.gemini/telemetry.log");
    return { json: [], table: [], range: { sinceMs: null, untilMs: null } };
  }

  const points: MetricPoint[] = [];
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

async function runTrim(): Promise<void> {
  const logPath = path.join(os.homedir(), ".gemini", "telemetry.log");
  const backupPath = path.join(os.homedir(), ".gemini", "telemetry.log.bak");

  try {
    const stat = await fs.promises.stat(logPath);
    if (!stat.isFile()) {
      console.error("未找到 telemetry.log");
      process.exit(1);
    }
  } catch {
    console.error("未找到 telemetry.log");
    process.exit(1);
  }

  await fs.promises.copyFile(logPath, backupPath);
  const content = await fs.promises.readFile(logPath, "utf8");
  const objects = splitJsonObjects(content);
  const lastPoints = new Map<string, { timestampMs: number; dataPoint: Record<string, unknown> }>();

  for (const objText of objects) {
    let obj: unknown;
    try {
      obj = JSON.parse(objText);
    } catch {
      continue;
    }
    const points = extractTokenUsageDataPoints(obj);
    for (const dp of points) {
      const sessionId = readSessionId(dp) || "no-session";
      const model = readAttributeValueFromDataPoint(dp, "model") || "unknown";
      const type = readAttributeValueFromDataPoint(dp, "type") || "unknown";
      const time = readTimestampMs(dp);
      if (time === null) continue;
      const key = `${sessionId}||${model}||${type}`;
      const prev = lastPoints.get(key);
      if (!prev || time >= prev.timestampMs) {
        lastPoints.set(key, { timestampMs: time, dataPoint: dp });
      }
    }
  }

  const dataPoints = Array.from(lastPoints.values()).map((v) => v.dataPoint);
  const minimalBlock = {
    descriptor: { name: "gemini_cli.token.usage" },
    dataPoints
  };
  const outputText = JSON.stringify(minimalBlock);
  await fs.promises.writeFile(logPath, outputText, "utf8");
  await fs.promises.unlink(backupPath);
  console.log("瘦身完成：telemetry.log 已仅保留 token 使用数据");
}

async function findLogFiles(): Promise<string[]> {
  const logPath = path.join(os.homedir(), ".gemini", "telemetry.log");
  try {
    const stat = await fs.promises.stat(logPath);
    if (stat.isFile()) return [logPath];
  } catch {
    return [];
  }
  return [];
}

async function parseLogFile(filePath: string): Promise<MetricPoint[]> {
  const points: MetricPoint[] = [];

  const content = await fs.promises.readFile(filePath, "utf8");
  const objects = splitJsonObjects(content);

  for (const objText of objects) {
    let obj: unknown;
    try {
      obj = JSON.parse(objText);
    } catch {
      continue;
    }

    const extracted = extractMetricPoints(obj);
    if (extracted.length > 0) {
      points.push(...extracted);
    }
  }

  return points;
}

function splitJsonObjects(input: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let start = -1;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === "\\\\") {
        escapeNext = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const chunk = input.slice(start, i + 1).trim();
          if (chunk) results.push(chunk);
          start = -1;
        }
      }
    }
  }

  return results;
}

function extractMetricPoints(root: unknown): MetricPoint[] {
  const points: MetricPoint[] = [];
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }

    if (typeof node !== "object") continue;

    const obj = node as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : null;
    const descriptorName =
      obj.descriptor && typeof obj.descriptor === "object"
        ? typeof (obj.descriptor as Record<string, unknown>).name === "string"
          ? (obj.descriptor as Record<string, unknown>).name
          : null
        : null;

    if (name === "gemini_cli.token.usage" || descriptorName === "gemini_cli.token.usage") {
      const dataPoints = obj.dataPoints;
      if (Array.isArray(dataPoints)) {
        for (const dp of dataPoints) {
          const metric = buildPointFromDataPoint(dp);
          if (metric) points.push(metric);
        }
      }
    }

    for (const value of Object.values(obj)) {
      stack.push(value);
    }
  }

  return points;
}

function buildSessionSummaries(points: MetricPoint[]): SessionSummary[] {
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

function toSessionTotals(summary: SessionSummary): SessionTotals {
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

function aggregateSessionsToDay(summaries: SessionSummary[]): DailyTotals[] {
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

function extractTokenMetricBlocks(root: unknown): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }

    if (typeof node !== "object") continue;

    const obj = node as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : null;
    const descriptorName =
      obj.descriptor && typeof obj.descriptor === "object"
        ? typeof (obj.descriptor as Record<string, unknown>).name === "string"
          ? (obj.descriptor as Record<string, unknown>).name
          : null
        : null;

    if (name === "gemini_cli.token.usage" || descriptorName === "gemini_cli.token.usage") {
      const dataPoints = obj.dataPoints;
      if (Array.isArray(dataPoints)) {
        blocks.push({
          descriptor: { name: "gemini_cli.token.usage" },
          dataPoints
        });
      }
    }

    for (const value of Object.values(obj)) {
      stack.push(value);
    }
  }

  return blocks;
}

function extractTokenUsageDataPoints(root: unknown): Array<Record<string, unknown>> {
  const points: Array<Record<string, unknown>> = [];
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }

    if (typeof node !== "object") continue;

    const obj = node as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : null;
    const descriptorName =
      obj.descriptor && typeof obj.descriptor === "object"
        ? typeof (obj.descriptor as Record<string, unknown>).name === "string"
          ? (obj.descriptor as Record<string, unknown>).name
          : null
        : null;

    if (name === "gemini_cli.token.usage" || descriptorName === "gemini_cli.token.usage") {
      const dataPoints = obj.dataPoints;
      if (Array.isArray(dataPoints)) {
        for (const dp of dataPoints) {
          if (dp && typeof dp === "object") points.push(dp as Record<string, unknown>);
        }
      }
    }

    for (const value of Object.values(obj)) {
      stack.push(value);
    }
  }

  return points;
}

function readAttributeValueFromDataPoint(dp: Record<string, unknown>, key: string): string | null {
  const attrs = readAttributes(dp.attributes);
  return attrs[key] || null;
}

function readSessionId(dp: Record<string, unknown>): string | null {
  const attrs = readAttributes(dp.attributes);
  return attrs["session.id"] || attrs["session_id"] || null;
}
function buildPointFromDataPoint(dataPoint: unknown): MetricPoint | null {
  if (!dataPoint || typeof dataPoint !== "object") return null;
  const dp = dataPoint as Record<string, unknown>;

  const value = readNumberValue(dp);
  if (value === null) return null;

  const timestampMs = readTimestampMs(dp);
  if (timestampMs === null) return null;

  const attrs = readAttributes(dp.attributes);
  const model = attrs.model || attrs["model"] || "unknown";
  const type = attrs.type || attrs["type"] || "unknown";
  const sessionId = attrs["session.id"] || attrs["session_id"] || null;

  return {
    timestampMs,
    model,
    type,
    sessionId,
    value
  };
}

function readNumberValue(dp: Record<string, unknown>): number | null {
  const asInt = dp.asInt;
  const asDouble = dp.asDouble;
  const value = dp.value;

  if (typeof asInt === "number") return asInt;
  if (typeof asDouble === "number") return asDouble;
  if (typeof value === "number") return value;

  if (typeof asInt === "string") {
    const n = Number(asInt);
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

function readTimestampMs(dp: Record<string, unknown>): number | null {
  const timeUnixNano = dp.timeUnixNano;
  const endTimeUnixNano = dp.endTimeUnixNano;
  const timeUnix = dp.timeUnix;
  const time = dp.time;
  const endTime = dp.endTime;
  const startTime = dp.startTime;

  if (Array.isArray(endTime) && endTime.length >= 2) {
    const sec = Number(endTime[0]);
    const nsec = Number(endTime[1]);
    if (!Number.isNaN(sec) && !Number.isNaN(nsec)) {
      return sec * 1000 + Math.floor(nsec / 1e6);
    }
  }

  if (Array.isArray(startTime) && startTime.length >= 2) {
    const sec = Number(startTime[0]);
    const nsec = Number(startTime[1]);
    if (!Number.isNaN(sec) && !Number.isNaN(nsec)) {
      return sec * 1000 + Math.floor(nsec / 1e6);
    }
  }

  const candidate =
    typeof timeUnixNano === "string" || typeof timeUnixNano === "number"
      ? timeUnixNano
      : typeof endTimeUnixNano === "string" || typeof endTimeUnixNano === "number"
        ? endTimeUnixNano
        : typeof timeUnix === "string" || typeof timeUnix === "number"
          ? timeUnix
          : typeof time === "string" || typeof time === "number"
            ? time
            : null;

  if (candidate === null) return null;

  const num = Number(candidate);
  if (Number.isNaN(num)) return null;

  if (num > 1e15) {
    return Math.floor(num / 1e6);
  }

  if (num > 1e12) {
    return Math.floor(num / 1e3);
  }

  return Math.floor(num);
}

function readAttributes(attrs: unknown): Record<string, string> {
  if (!attrs) return {};

  if (Array.isArray(attrs)) {
    const result: Record<string, string> = {};
    for (const item of attrs) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const key = typeof obj.key === "string" ? obj.key : null;
      if (!key) continue;
      const value = obj.value;
      const strValue = readAttributeValue(value);
      if (strValue !== null) result[key] = strValue;
    }
    return result;
  }

  if (typeof attrs === "object") {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
      const strValue = readAttributeValue(value);
      if (strValue !== null) result[key] = strValue;
    }
    return result;
  }

  return {};
}

function readAttributeValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  const stringValue = obj.stringValue;
  if (typeof stringValue === "string") return stringValue;

  const intValue = obj.intValue;
  if (typeof intValue === "string" || typeof intValue === "number") {
    return String(intValue);
  }

  const doubleValue = obj.doubleValue;
  if (typeof doubleValue === "string" || typeof doubleValue === "number") {
    return String(doubleValue);
  }

  return null;
}

function aggregateByDay(points: MetricPoint[]): DailyTotals[] {
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

function aggregateBySession(points: MetricPoint[]): SessionTotals[] {
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

function addTypeValue(target: { input: number; output: number; thought: number; cache: number; tool: number }, type: string, value: number): void {
  if (type === "input") target.input += value;
  else if (type === "output") target.output += value;
  else if (type === "thought") target.thought += value;
  else if (type === "cache") target.cache += value;
  else if (type === "tool") target.tool += value;
}

function toDateKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function normalizePeriod(value: unknown): Period | null {
  if (value === "day" || value === "week" || value === "month" || value === "session") return value;
  return null;
}

function parseTimeSpec(input: unknown, kind: "since" | "until"): number | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  const now = new Date();

  if (raw === "today") {
    return kind === "since" ? startOfDay(now).getTime() : endOfDay(now).getTime();
  }

  if (raw === "yesterday") {
    const d = new Date(now.getTime() - 86400000);
    return kind === "since" ? startOfDay(d).getTime() : endOfDay(d).getTime();
  }

  const relMatch = raw.match(/^(\d+)([dh])$/);
  if (relMatch) {
    const amount = Number(relMatch[1]);
    const unit = relMatch[2];
    if (!Number.isNaN(amount)) {
      const delta = unit === "d" ? amount * 86400000 : amount * 3600000;
      return now.getTime() - delta;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return kind === "since" ? startOfDay(parsed).getTime() : endOfDay(parsed).getTime();
    }
    return parsed.getTime();
  }

  console.error(`无法解析时间参数：${input}`);
  process.exit(1);
}

function startOfDay(d: Date): Date {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  return tmp;
}

function endOfDay(d: Date): Date {
  const tmp = new Date(d.getTime());
  tmp.setHours(23, 59, 59, 999);
  return tmp;
}

function renderTable(
  result: { json: unknown[]; table: DailyTotals[] | SessionTotals[]; range: { sinceMs: number | null; untilMs: number | null } },
  period: Period
): void {
  if (result.table.length === 0) {
    console.log("无匹配数据");
    return;
  }

  if (period === "session") {
    const rows = result.table as SessionTotals[];
    renderSessionTable(rows, result.range);
    return;
  }

  const rows = result.table as DailyTotals[];
  renderDailyTable(rows, result.range);
}

function renderDailyTable(rows: DailyTotals[], range: { sinceMs: number | null; untilMs: number | null }): void {
  const headers = ["Date", "Models", "Input", "Output", "Thought", "Cache", "Tool", "Total Tokens"];
  const widths = headers.map((h) => h.length);
  const totals = { input: 0, output: 0, thought: 0, cache: 0, tool: 0 };

  for (const row of rows) {
    const modelsText = Array.from(row.models);
    widths[0] = Math.max(widths[0], row.date.length);
    widths[1] = Math.max(widths[1], maxLineWidth(modelsText));
    widths[2] = Math.max(widths[2], formatNumber(row.input).length);
    widths[3] = Math.max(widths[3], formatNumber(row.output).length);
    widths[4] = Math.max(widths[4], formatNumber(row.thought).length);
    widths[5] = Math.max(widths[5], formatNumber(row.cache).length);
    widths[6] = Math.max(widths[6], formatNumber(row.tool).length);
    widths[7] = Math.max(widths[7], formatNumber(sumAll(row)).length);

    totals.input += row.input;
    totals.output += row.output;
    totals.thought += row.thought;
    totals.cache += row.cache;
    totals.tool += row.tool;
  }

  const lines: string[] = [];
  lines.push(...renderTitleBlock(rows, range));
  lines.push(colorize(headers, "header", widths));
  lines.push("");

  for (const row of rows) {
    const modelLines = Array.from(row.models);
    lines.push(
      ...formatRowMulti(
        [
          [row.date],
          modelLines.length > 0 ? modelLines : [""],
          [formatNumber(row.input)],
          [formatNumber(row.output)],
          [formatNumber(row.thought)],
          [formatNumber(row.cache)],
          [formatNumber(row.tool)],
          [formatNumber(sumAll(row))]
        ],
        widths,
        [false, false, true, true, true, true, true, true]
      )
    );
    lines.push("");
  }

  const totalCells = [
    ["Total"],
    [""],
    [formatCompact(totals.input)],
    [formatCompact(totals.output)],
    [formatCompact(totals.thought)],
    [formatCompact(totals.cache)],
    [formatCompact(totals.tool)],
    [formatCompact(sumTotals(totals))]
  ];
  const totalLines = formatRowMulti(totalCells, widths, [false, false, true, true, true, true, true, true]);
  lines.push(colorizeLines(totalLines, "total"));
  lines.push("");

  console.log(lines.join("\n"));
}

function renderSessionTable(rows: SessionTotals[], range: { sinceMs: number | null; untilMs: number | null }): void {
  const headers = ["Date", "Session", "Models", "Input", "Output", "Thought", "Cache", "Tool", "Total Tokens"];
  const widths = headers.map((h) => h.length);
  const totals = { input: 0, output: 0, thought: 0, cache: 0, tool: 0 };

  for (const row of rows) {
    const modelsText = Array.from(row.models);
    widths[0] = Math.max(widths[0], row.date.length);
    widths[1] = Math.max(widths[1], row.sessionId.length);
    widths[2] = Math.max(widths[2], maxLineWidth(modelsText));
    widths[3] = Math.max(widths[3], formatNumber(row.input).length);
    widths[4] = Math.max(widths[4], formatNumber(row.output).length);
    widths[5] = Math.max(widths[5], formatNumber(row.thought).length);
    widths[6] = Math.max(widths[6], formatNumber(row.cache).length);
    widths[7] = Math.max(widths[7], formatNumber(row.tool).length);
    widths[8] = Math.max(widths[8], formatNumber(sumAll(row)).length);

    totals.input += row.input;
    totals.output += row.output;
    totals.thought += row.thought;
    totals.cache += row.cache;
    totals.tool += row.tool;
  }

  const lines: string[] = [];
  lines.push(...renderTitleBlock(rows, range));
  lines.push(colorize(headers, "header", widths));
  lines.push("");

  for (const row of rows) {
    const modelLines = Array.from(row.models);
    lines.push(
      ...formatRowMulti(
        [
          [row.date],
          [row.sessionId],
          modelLines.length > 0 ? modelLines : [""],
          [formatNumber(row.input)],
          [formatNumber(row.output)],
          [formatNumber(row.thought)],
          [formatNumber(row.cache)],
          [formatNumber(row.tool)],
          [formatNumber(sumAll(row))]
        ],
        widths,
        [false, false, false, true, true, true, true, true, true]
      )
    );
    lines.push("");
  }

  const totalCells = [
    ["Total"],
    [""],
    [""],
    [formatCompact(totals.input)],
    [formatCompact(totals.output)],
    [formatCompact(totals.thought)],
    [formatCompact(totals.cache)],
    [formatCompact(totals.tool)],
    [formatCompact(sumTotals(totals))]
  ];
  const totalLines = formatRowMulti(totalCells, widths, [false, false, false, true, true, true, true, true, true]);
  lines.push(colorizeLines(totalLines, "total"));
  lines.push("");

  console.log(lines.join("\n"));
}

function formatRow(cells: string[], widths: number[], align?: boolean[]): string {
  return cells
    .map((cell, i) => {
      const width = widths[i];
      if (align && align[i]) {
        return cell.padStart(width);
      }
      return cell.padEnd(width);
    })
    .join("  ");
}

function formatRowMulti(cells: string[][], widths: number[], align?: boolean[]): string[] {
  const height = cells.reduce((max, col) => Math.max(max, col.length), 1);
  const lines: string[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const rowCells = cells.map((col) => (rowIndex < col.length ? col[rowIndex] : ""));
    lines.push(formatRow(rowCells, widths, align));
  }
  return lines;
}

function maxLineWidth(lines: string[]): number {
  if (lines.length === 0) return 0;
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
  return formatNumber(value);
}

function sumAll(row: { input: number; output: number; thought: number; cache: number; tool: number }): number {
  return row.input + row.output + row.thought + row.cache + row.tool;
}

function sumTotals(totals: { input: number; output: number; thought: number; cache: number; tool: number }): number {
  return totals.input + totals.output + totals.thought + totals.cache + totals.tool;
}

function colorize(headers: string[], kind: "header", widths: number[]): string {
  const raw = formatRow(headers, widths);
  return applyColor(raw, kind);
}

function colorizeLines(lines: string[], kind: "total"): string {
  return applyColor(lines.join("\n"), kind);
}

function applyColor(text: string, kind: "header" | "total"): string {
  const code = kind === "header" ? "\u001b[36m" : "\u001b[33m";
  const reset = "\u001b[0m";
  return `${code}${text}${reset}`;
}

function renderTitleBlock(
  rows: Array<DailyTotals | SessionTotals>,
  range: { sinceMs: number | null; untilMs: number | null }
): string[] {
  const rangeText = buildRangeText(rows, range);
  const title = rangeText ? `Gemini-cli Usage Report - ${rangeText}` : "Gemini-cli Usage Report";
  const border = `+${"-".repeat(title.length + 2)}+`;
  const line = `| ${title} |`;
  return ["", applyColor(border, "header"), applyColor(line, "header"), applyColor(border, "header"), ""];
}

function buildRangeText(
  rows: Array<DailyTotals | SessionTotals>,
  range: { sinceMs: number | null; untilMs: number | null }
): string {
  const [start, end] = resolveDateRange(rows, range);
  if (!start || !end) return "";
  return start === end ? start : `${start} ～ ${end}`;
}

function resolveDateRange(
  rows: Array<DailyTotals | SessionTotals>,
  range: { sinceMs: number | null; untilMs: number | null }
): [string | null, string | null] {
  if (range.sinceMs !== null && range.untilMs !== null) {
    const start = toDateKey(range.sinceMs);
    const end = toDateKey(range.untilMs);
    return [start, end];
  }
  const dates = rows.map((r) => r.date).sort();
  if (dates.length === 0) return [null, null];
  return [dates[0], dates[dates.length - 1]];
}

function isPeriodProvided(args: string[]): boolean {
  return args.some((arg) => arg === "--period" || arg.startsWith("--period="));
}

function resolveRange(
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

function applyUntilClamp(
  range: { sinceMs: number | null; untilMs: number | null },
  untilMs: number | null
): { sinceMs: number | null; untilMs: number | null } {
  if (untilMs === null) return range;
  if (range.untilMs === null || untilMs < range.untilMs) {
    return { sinceMs: range.sinceMs, untilMs };
  }
  return range;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getTime());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

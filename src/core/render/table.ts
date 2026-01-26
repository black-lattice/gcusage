import type { DailyTotals, Period, SessionTotals } from "../../types";
import { MESSAGES } from "../../messages";
import { formatCompact, formatNumber, formatRow, formatRowMulti, maxLineWidth } from "../utils/format";
import { sumAll, sumTotals } from "../aggregate";
import { toDateKey } from "../utils/time";

export function renderTable(
  result: { json: unknown[]; table: DailyTotals[] | SessionTotals[]; range: { sinceMs: number | null; untilMs: number | null } },
  period: Period
): void {
  if (result.table.length === 0) {
    console.log(MESSAGES.NO_MATCHING);
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

export function renderDailyTable(rows: DailyTotals[], range: { sinceMs: number | null; untilMs: number | null }): void {
  const headers = [
    MESSAGES.HEADER_DATE,
    MESSAGES.HEADER_MODELS,
    MESSAGES.HEADER_INPUT,
    MESSAGES.HEADER_OUTPUT,
    MESSAGES.HEADER_THOUGHT,
    MESSAGES.HEADER_CACHE,
    MESSAGES.HEADER_TOOL,
    MESSAGES.HEADER_TOTAL_TOKENS
  ];
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
    [MESSAGES.TOTAL_LABEL],
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

export function renderSessionTable(rows: SessionTotals[], range: { sinceMs: number | null; untilMs: number | null }): void {
  const headers = [
    MESSAGES.HEADER_DATE,
    MESSAGES.HEADER_SESSION,
    MESSAGES.HEADER_MODELS,
    MESSAGES.HEADER_INPUT,
    MESSAGES.HEADER_OUTPUT,
    MESSAGES.HEADER_THOUGHT,
    MESSAGES.HEADER_CACHE,
    MESSAGES.HEADER_TOOL,
    MESSAGES.HEADER_TOTAL_TOKENS
  ];
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
    [MESSAGES.TOTAL_LABEL],
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

export function colorize(headers: string[], kind: "header", widths: number[]): string {
  const raw = formatRow(headers, widths);
  return applyColor(raw, kind);
}

export function colorizeLines(lines: string[], kind: "total"): string {
  return applyColor(lines.join("\n"), kind);
}

export function applyColor(text: string, kind: "header" | "total"): string {
  const code = kind === "header" ? "\u001b[36m" : "\u001b[33m";
  const reset = "\u001b[0m";
  return `${code}${text}${reset}`;
}

export function renderTitleBlock(
  rows: Array<DailyTotals | SessionTotals>,
  range: { sinceMs: number | null; untilMs: number | null }
): string[] {
  const rangeText = buildRangeText(rows, range);
  const title = rangeText ? `${MESSAGES.REPORT_TITLE} - ${rangeText}` : MESSAGES.REPORT_TITLE;
  const border = `+${"-".repeat(title.length + 2)}+`;
  const line = `| ${title} |`;
  return ["", applyColor(border, "header"), applyColor(line, "header"), applyColor(border, "header"), ""];
}

export function buildRangeText(
  rows: Array<DailyTotals | SessionTotals>,
  range: { sinceMs: number | null; untilMs: number | null }
): string {
  const [start, end] = resolveDateRange(rows, range);
  if (!start || !end) return "";
  return start === end ? start : `${start}${MESSAGES.RANGE_SEP}${end}`;
}

export function resolveDateRange(
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

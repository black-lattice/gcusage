import type { MetricPoint } from "../../types";

const METRIC_NAME = "gemini_cli.token.usage";

export function extractMetricPoints(root: unknown): MetricPoint[] {
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

    if (name === METRIC_NAME || descriptorName === METRIC_NAME) {
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

export function extractTokenMetricBlocks(root: unknown): Array<Record<string, unknown>> {
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

    if (name === METRIC_NAME || descriptorName === METRIC_NAME) {
      const dataPoints = obj.dataPoints;
      if (Array.isArray(dataPoints)) {
        blocks.push({
          descriptor: { name: METRIC_NAME },
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

export function extractTokenUsageDataPoints(root: unknown): Array<Record<string, unknown>> {
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

    if (name === METRIC_NAME || descriptorName === METRIC_NAME) {
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

export function readAttributeValueFromDataPoint(dp: Record<string, unknown>, key: string): string | null {
  const attrs = readAttributes(dp.attributes);
  return attrs[key] || null;
}

export function readSessionId(dp: Record<string, unknown>): string | null {
  const attrs = readAttributes(dp.attributes);
  return attrs["session.id"] || attrs["session_id"] || null;
}

export function buildPointFromDataPoint(dataPoint: unknown): MetricPoint | null {
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

export function readNumberValue(dp: Record<string, unknown>): number | null {
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

export function readTimestampMs(dp: Record<string, unknown>): number | null {
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

export function readAttributes(attrs: unknown): Record<string, string> {
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

export function readAttributeValue(value: unknown): string | null {
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

import fs from "fs";
import os from "os";
import path from "path";
import type { MetricPoint } from "../../types";
import { extractMetricPoints } from "../metrics";
import { splitJsonObjects } from "./split";

export async function findLogFiles(): Promise<string[]> {
  const logPath = path.join(os.homedir(), ".gemini", "telemetry.log");
  try {
    const stat = await fs.promises.stat(logPath);
    if (stat.isFile()) return [logPath];
  } catch {
    return [];
  }
  return [];
}

export async function parseLogFile(filePath: string): Promise<MetricPoint[]> {
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

import fs from "fs";
import os from "os";
import path from "path";
import { MESSAGES } from "../../messages";
import { splitJsonObjects } from "../logs/split";
import { extractTokenUsageDataPoints, readAttributeValueFromDataPoint, readSessionId, readTimestampMs } from "../metrics";

export async function runTrim(): Promise<void> {
  const logPath = path.join(os.homedir(), ".gemini", "telemetry.log");
  const backupPath = path.join(os.homedir(), ".gemini", "telemetry.log.bak");

  try {
    const stat = await fs.promises.stat(logPath);
    if (!stat.isFile()) {
      console.error(MESSAGES.NO_TELEMETRY);
      process.exit(1);
    }
  } catch {
    console.error(MESSAGES.NO_TELEMETRY);
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
  console.log(MESSAGES.TRIM_DONE);
}

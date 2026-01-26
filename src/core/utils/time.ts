import { buildInvalidTimeMessage } from "../../messages";

export function parseTimeSpec(input: unknown, kind: "since" | "until"): number | null {
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

  console.error(buildInvalidTimeMessage(input));
  process.exit(1);
}

export function startOfDay(d: Date): Date {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  return tmp;
}

export function endOfDay(d: Date): Date {
  const tmp = new Date(d.getTime());
  tmp.setHours(23, 59, 59, 999);
  return tmp;
}

export function toDateKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getTime());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

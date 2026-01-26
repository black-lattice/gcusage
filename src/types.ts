export type Period = "day" | "week" | "month" | "session";

export type MetricPoint = {
  timestampMs: number;
  model: string;
  type: string;
  sessionId: string | null;
  value: number;
};

export type DailyTotals = {
  date: string;
  models: Set<string>;
  input: number;
  output: number;
  thought: number;
  cache: number;
  tool: number;
};

export type SessionTotals = {
  date: string;
  sessionId: string;
  models: Set<string>;
  input: number;
  output: number;
  thought: number;
  cache: number;
  tool: number;
};

export type SessionSummary = {
  sessionId: string;
  sessionStartMs: number;
  models: Set<string>;
  input: number;
  output: number;
  thought: number;
  cache: number;
  tool: number;
};

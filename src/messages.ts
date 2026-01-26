export const MESSAGES = {
  CLI_NAME: "gcusage",
  CLI_DESC: "统计 Gemini CLI token 使用情况",
  OPTION_SINCE: "开始时间，支持相对时间",
  OPTION_UNTIL: "结束时间，支持相对时间",
  OPTION_PERIOD: "聚合周期：day|week|month|session",
  OPTION_MODEL: "按模型过滤",
  OPTION_TYPE: "按类型过滤",
  OPTION_JSON: "输出 JSON",
  PERIOD_INVALID: "非法的 --period 参数，仅支持 day|week|month|session",
  SINCE_AFTER_UNTIL: "--since 不能晚于 --until",
  NO_LOG_FOUND: "未找到任何日志文件：~/.gemini/telemetry.log",
  NO_TELEMETRY: "未找到 telemetry.log",
  TRIM_DONE: "瘦身完成：telemetry.log 已仅保留 token 使用数据",
  TRIM_DESC: "瘦身 telemetry.log，仅保留 token 使用数据",
  NO_MATCHING: "无匹配数据",
  REPORT_TITLE: "Gemini-cli Usage Report",
  RANGE_SEP: " ～ ",
  TOTAL_LABEL: "Total",
  HEADER_DATE: "Date",
  HEADER_MODELS: "Models",
  HEADER_INPUT: "Input",
  HEADER_OUTPUT: "Output",
  HEADER_THOUGHT: "Thought",
  HEADER_CACHE: "Cache",
  HEADER_TOOL: "Tool",
  HEADER_TOTAL_TOKENS: "Total Tokens",
  HEADER_SESSION: "Session"
} as const;

export function buildInvalidTimeMessage(input: unknown): string {
  return `无法解析时间参数：${String(input)}`;
}

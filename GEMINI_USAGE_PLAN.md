# Gemini CLI 用量统计方案（草案）

## 一、背景与来源
- 参考项目：ccusage（Codex 版本）
- 参考文档：
  - https://ccusage.com/guide/codex/
  - https://github.com/ryoppippi/ccusage
  - https://google-gemini.github.io/gemini-cli/docs/cli/telemetry.html
  - https://geminicli.com/docs/cli/telemetry

## 二、目标范围
- 统计维度：日、周、月、会话
- 支持自定义时间范围（since/until）
- 输出形式：终端表格 + JSON（可选）
- 费用估算：后置功能（可选）

## 三、ccusage 原理要点（Codex 版）
- 数据来源：读取本地 Codex 会话 JSONL 日志，按日/月/会话聚合
- 计数方式：基于 `token_count` 累计事件，使用相邻事件差值计算增量
- 模型识别：通过 `turn_context` 获取模型信息，缺失时跳过以避免误计
- 费用估算：模型别名解析到 LiteLLM 价格表后进行计费统计

## 四、Gemini CLI 用量统计原理
- 数据来源：Gemini CLI OpenTelemetry 日志与指标
- 关键指标：`gemini_cli.token.usage`
- 维度字段：model + type（input/output/thought/cache/tool）
- 本地日志位置：`~/.gemini/tmp/<projectHash>/otel/collector*.log`

## 五、实施方案
1. 数据采集
   - 启用 Gemini CLI 的 OpenTelemetry 输出
   - 读取本地 `collector*.log` 作为统计输入

2. 解析与聚合
   - 解析 `gemini_cli.token.usage` 指标
   - 按时间戳聚合为：日 / 周 / 月（默认日统计，使用本地时区）
   - 按会话聚合（优先使用 session.id，缺失则跳过）

3. 输出与 CLI 设计
   - 命令：`npx gcusage`
   - 参数：
     - `--since` / `--until`（支持相对时间）
     - `--period day|week|month|session`（默认 day）
     - `--model` / `--type`
     - `--json`
   - 输出：表格逐行列出 model + type

4. 费用估算（后置）
   - 需要 Gemini 模型价格表与计费口径
   - 输入/输出/缓存分别计价（具体规则另行确认）

## 六、已确认结论
1. 统计时区：使用本地时区
2. 会话定义：以 `session.id` 为唯一会话，缺失则跳过
3. 默认周期：日统计
4. CLI 包名与命令名：gcusage（`npx gcusage`）
5. 输出格式：表格逐行列出 model + type
6. 时间范围：`--since/--until` 支持相对时间

## 七、后续扩展
- 支持价格表版本选择
- 支持多项目/多日志目录聚合
- 支持导出 CSV

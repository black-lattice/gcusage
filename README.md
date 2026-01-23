# gcusage

Gemini CLI 用量统计工具 / Usage report for Gemini CLI

## 简介 / Overview

- 读取 `~/.gemini/telemetry.log`，统计 token 使用量
- 仅统计每个 session 的最终累计值
- 支持 day/week/month/session 视图
- 支持日志瘦身（只保留 token 相关数据）

## 前置配置 / Prerequisites

在 `~/.gemini/settings.json` 启用 telemetry 并写入**绝对路径**：

```json
{
	"telemetry": {
		"enabled": true,
		"target": "local",
		"otlpEndpoint": "",
    "outfile": "/Users/<yourname>/.gemini/telemetry.log",
		"logPrompts": false
	}
}
```

说明：
- 必须开启 telemetry 并指定 `outfile`，否则不会生成 `telemetry.log`
- 使用绝对路径可避免 `~` 或相对路径导致写入失败
- `outfile` 路径必须与 `gcusage` 读取路径一致（默认读取 `~/.gemini/telemetry.log`）
- 日志包含完整响应内容，建议使用 `trim` 进行瘦身

## 使用方式 / Usage

已发布版本：`gcusage@0.1.0`
npm 包地址： https://www.npmjs.com/package/gcusage

## 系统支持 / Platform

- 支持：macOS / Linux
- 暂不支持：Windows（路径与终端输出兼容性尚未处理）

默认输出最近 6 天（含今天）的日统计：

```bash
npx gcusage
```

输出：每天一行，展示 Models 列（多模型换行）与各类型 token 总量。

按 session 输出（当天每个 session 一行）：

```bash
npx gcusage --period session
```

输出：当天每个 session 的最终累计值。

按周（显示该周内每天数据）：

```bash
npx gcusage --period week
```

输出：当前周（周一开始）内每日数据。

按月（显示该月内每天数据）：

```bash
npx gcusage --period month
```

输出：当前月内每日数据。

从指定日期开始统计一周：

```bash
npx gcusage --period week --since 2026-01-01
```

输出：从 2026-01-01 开始的 7 天数据。

指定范围（覆盖 week/month 计算范围）：

```bash
npx gcusage --period month --since 2026-01-01 --until 2026-01-15
```

输出：2026-01-01 到 2026-01-15 的每日数据。

过滤模型或类型：

```bash
npx gcusage --model gemini-2.5-flash-lite --type input
```

输出：只统计指定模型与类型的数据。

## 输出样式 / Output Format

表头：

```
Date | Models | Input | Output | Thought | Cache | Tool | Total Tokens
```

说明：

- Models 多模型换行显示
- 数字使用千分位
- Total 行使用 k/M/B 两位小数缩写
- 表头与标题为青蓝色，Total 行为金黄色
- 表格上方显示标题与日期范围

## 日志瘦身 / Log Trim

仅保留 token 相关数据（覆盖原文件）：

```bash
npx gcusage trim
```

输出：`telemetry.log` 体积显著减小，统计不受影响。

说明：

- 会先备份 `telemetry.log.bak`，成功后删除备份
- 只保留每个 session+model+type 的最后一次累计值

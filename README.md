# gcusage

Usage report for Gemini CLI

## Overview

- Reads `~/.gemini/telemetry.log` and summarizes token usage
- Only counts the final cumulative value for each session
- Supports day/week/month/session views
- Supports log trimming (keep only token-related data)

## Prerequisites

Enable telemetry in `~/.gemini/settings.json` and set an **absolute path**:

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

Notes:
- Telemetry must be enabled and `outfile` set, otherwise `telemetry.log` will not be created
- Use an absolute path to avoid failures caused by `~` or relative paths
- `outfile` must match the path `gcusage` reads (default `~/.gemini/telemetry.log`)
- The log contains full response content; use `trim` to shrink it
- Windows example path: `C:\\Users\\<yourname>\\.gemini\\telemetry.log`

## Usage

Published version: `gcusage@0.1.4`
npm package page: https://www.npmjs.com/package/gcusage

## Platform

- Supported: macOS / Linux / Windows

Default output shows daily stats for the last 6 days (including today):

```bash
npx gcusage
```

Output: one line per day, showing the Models column (wraps for multiple models) and totals by token type.

Per-session output (one line per session for today):

```bash
npx gcusage --period session
```

Output: final cumulative value for each session for today.

Weekly view (shows each day in the week):

```bash
npx gcusage --period week
```

Output: daily data for the current week (week starts on Monday).

Monthly view (shows each day in the month):

```bash
npx gcusage --period month
```

Output: daily data for the current month.

Start a week from a specific date:

```bash
npx gcusage --period week --since 2026-01-01
```

Output: 7 days starting from 2026-01-01.

Specify a custom range (overrides week/month ranges):

```bash
npx gcusage --period month --since 2026-01-01 --until 2026-01-15
```

Output: daily data from 2026-01-01 to 2026-01-15.

Filter by model or type:

```bash
npx gcusage --model gemini-2.5-flash-lite --type input
```

Output: only counts the specified model and token type.

## Output Format

Header:

```
Date | Models | Input | Output | Thought | Cache | Tool | Total Tokens
```

Notes:
- Multiple models are shown on separate lines
- Numbers use thousands separators
- Total row uses k/M/B abbreviations with two decimals
- Header/title in cyan-blue; Total row in gold
- Title and date range shown above the table

## Log Trim

Keep only token-related data (overwrites original file):

```bash
npx gcusage trim
```

Output: `telemetry.log` becomes much smaller; statistics are unchanged.

Notes:
- Backs up to `telemetry.log.bak`, then removes the backup on success
- Keeps only the last cumulative value per session+model+type

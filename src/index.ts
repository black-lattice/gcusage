#!/usr/bin/env node

import { Command } from "commander";
import { MESSAGES } from "./messages";
import type { Period } from "./types";
import { run } from "./core/run";
import { runTrim } from "./core/commands/trim";
import { isPeriodProvided } from "./core/range";
import { renderTable } from "./core/render/table";
import { normalizePeriod } from "./core/utils/period";
import { parseTimeSpec } from "./core/utils/time";

const program = new Command();
let didRunSubcommand = false;

program
  .name(MESSAGES.CLI_NAME)
  .description(MESSAGES.CLI_DESC)
  .option("--since <time>", MESSAGES.OPTION_SINCE)
  .option("--until <time>", MESSAGES.OPTION_UNTIL)
  .option("--period <period>", MESSAGES.OPTION_PERIOD, "day")
  .option("--model <model>", MESSAGES.OPTION_MODEL)
  .option("--type <type>", MESSAGES.OPTION_TYPE)
  .option("--json", MESSAGES.OPTION_JSON)
  .action(async (opts) => {
    const periodValue = normalizePeriod(opts.period);
    if (!periodValue) {
      console.error(MESSAGES.PERIOD_INVALID);
      process.exit(1);
    }
    const period: Period = periodValue;

    const sinceMs = parseTimeSpec(opts.since, "since");
    const untilMs = parseTimeSpec(opts.until, "until");
    const periodProvided = isPeriodProvided(process.argv);

    if (sinceMs !== null && untilMs !== null && sinceMs > untilMs) {
      console.error(MESSAGES.SINCE_AFTER_UNTIL);
      process.exit(1);
    }

    const modelFilter = typeof opts.model === "string" ? opts.model : null;
    const typeFilter = typeof opts.type === "string" ? opts.type : null;
    const outputJson = Boolean(opts.json);

    const result = await run(period, periodProvided, sinceMs, untilMs, modelFilter, typeFilter);
    if (outputJson) {
      process.stdout.write(JSON.stringify(result.json, null, 2));
      process.stdout.write("\n");
      return;
    }

    renderTable(result, period);
  });

program
  .command("trim")
  .description(MESSAGES.TRIM_DESC)
  .action(async () => {
    didRunSubcommand = true;
    await runTrim();
  });

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
  if (didRunSubcommand) return;
}

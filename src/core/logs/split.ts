export function splitJsonObjects(input: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let start = -1;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        escapeNext = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const chunk = input.slice(start, i + 1).trim();
          if (chunk) results.push(chunk);
          start = -1;
        }
      }
    }
  }

  return results;
}

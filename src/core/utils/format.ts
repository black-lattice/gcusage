export function formatRow(cells: string[], widths: number[], align?: boolean[]): string {
  return cells
    .map((cell, i) => {
      const width = widths[i];
      if (align && align[i]) {
        return cell.padStart(width);
      }
      return cell.padEnd(width);
    })
    .join("  ");
}

export function formatRowMulti(cells: string[][], widths: number[], align?: boolean[]): string[] {
  const height = cells.reduce((max, col) => Math.max(max, col.length), 1);
  const lines: string[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const rowCells = cells.map((col) => (rowIndex < col.length ? col[rowIndex] : ""));
    lines.push(formatRow(rowCells, widths, align));
  }
  return lines;
}

export function maxLineWidth(lines: string[]): number {
  if (lines.length === 0) return 0;
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
  return formatNumber(value);
}

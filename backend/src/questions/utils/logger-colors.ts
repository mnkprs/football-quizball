const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  boldWhite: '\x1b[1;37m',
} as const;

export function colorize(text: string, color: string): string {
  return `${color}${text}${ANSI.reset}`;
}

export function colorRawScore(raw: number): string {
  if (raw < 0.36) return colorize(raw.toFixed(2), ANSI.green);
  if (raw < 0.62) return colorize(raw.toFixed(2), ANSI.yellow);
  return colorize(raw.toFixed(2), ANSI.red);
}

export function colorRawScoreOrNa(raw: number | undefined): string {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return colorize('n/a', ANSI.magenta);
  }
  return colorRawScore(raw);
}

export { ANSI };

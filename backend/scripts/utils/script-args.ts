/**
 * Tiny argv helpers shared across pool-ops scripts. Keeps CLI parsing
 * declarative in each script while avoiding the copy-paste of the same
 * `indexOf(flag) + 1` pattern three times.
 */

export interface ArgReader {
  has(flag: string): boolean;
  get(flag: string): string | undefined;
  getNumber(flag: string, fallback: number): number;
  getNumberOrNull(flag: string): number | null;
}

export function readArgs(argv: string[] = process.argv.slice(2)): ArgReader {
  return {
    has: (flag) => argv.includes(flag),
    get: (flag) => {
      const i = argv.indexOf(flag);
      return i >= 0 ? argv[i + 1] : undefined;
    },
    getNumber: (flag, fallback) => {
      const i = argv.indexOf(flag);
      if (i < 0) return fallback;
      const n = Number(argv[i + 1]);
      return Number.isFinite(n) ? n : fallback;
    },
    getNumberOrNull: (flag) => {
      const i = argv.indexOf(flag);
      if (i < 0) return null;
      const n = Number(argv[i + 1]);
      return Number.isFinite(n) ? n : null;
    },
  };
}

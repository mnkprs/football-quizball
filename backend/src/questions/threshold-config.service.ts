import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  RAW_THRESHOLD_EASY,
  RAW_THRESHOLD_MEDIUM,
  BOUNDARY_TOLERANCE,
} from './config/difficulty-scoring.config';

export interface ScoreThresholds {
  rawThresholdEasy: number;
  rawThresholdMedium: number;
  boundaryTolerance: number;
}

const DEFAULT_THRESHOLDS: ScoreThresholds = {
  rawThresholdEasy: RAW_THRESHOLD_EASY,
  rawThresholdMedium: RAW_THRESHOLD_MEDIUM,
  boundaryTolerance: BOUNDARY_TOLERANCE,
};

function clampThresholds(t: Partial<ScoreThresholds>): ScoreThresholds {
  return {
    rawThresholdEasy: Math.max(0, Math.min(1, t.rawThresholdEasy ?? DEFAULT_THRESHOLDS.rawThresholdEasy)),
    rawThresholdMedium: Math.max(0, Math.min(1, t.rawThresholdMedium ?? DEFAULT_THRESHOLDS.rawThresholdMedium)),
    boundaryTolerance: Math.max(0, Math.min(0.2, t.boundaryTolerance ?? DEFAULT_THRESHOLDS.boundaryTolerance)),
  };
}

@Injectable()
export class ThresholdConfigService {
  private readonly logger = new Logger(ThresholdConfigService.name);
  private cached: ScoreThresholds | null = null;

  constructor(private configService: ConfigService) {}

  private getConfigPath(): string {
    const root = process.cwd();
    return path.join(root, 'config', 'score-thresholds.json');
  }

  private loadFromFile(): ScoreThresholds | null {
    try {
      const p = this.getConfigPath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ScoreThresholds>;
        return clampThresholds(parsed);
      }
    } catch (err) {
      this.logger.warn(`Could not load score-thresholds.json: ${err}`);
    }
    return null;
  }

  private loadFromEnv(): ScoreThresholds {
    const easy = this.configService.get<string>('RAW_THRESHOLD_EASY');
    const medium = this.configService.get<string>('RAW_THRESHOLD_MEDIUM');
    const tolerance = this.configService.get<string>('BOUNDARY_TOLERANCE');
    const t: Partial<ScoreThresholds> = {};
    if (easy != null) t.rawThresholdEasy = parseFloat(easy);
    if (medium != null) t.rawThresholdMedium = parseFloat(medium);
    if (tolerance != null) t.boundaryTolerance = parseFloat(tolerance);
    return clampThresholds({ ...DEFAULT_THRESHOLDS, ...t });
  }

  getThresholds(): ScoreThresholds {
    if (this.cached) return this.cached;
    const fromFile = this.loadFromFile();
    if (fromFile) {
      this.cached = fromFile;
      return fromFile;
    }
    const fromEnv = this.loadFromEnv();
    this.cached = fromEnv;
    return fromEnv;
  }

  /** Reload from file/env (e.g. after update). */
  invalidateCache(): void {
    this.cached = null;
  }

  /** Persist thresholds to config file. Returns updated thresholds. */
  async updateThresholds(updates: Partial<ScoreThresholds>): Promise<ScoreThresholds> {
    const current = this.getThresholds();
    const next = clampThresholds({ ...current, ...updates });
    const dir = path.dirname(this.getConfigPath());
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.getConfigPath(),
        JSON.stringify(next, null, 2),
        'utf-8',
      );
      this.invalidateCache();
      this.logger.log(`Updated thresholds: easy=${next.rawThresholdEasy}, medium=${next.rawThresholdMedium}, tolerance=${next.boundaryTolerance}`);
      return this.getThresholds();
    } catch (err) {
      this.logger.error(`Failed to write score-thresholds.json: ${err}`);
      throw err;
    }
  }
}

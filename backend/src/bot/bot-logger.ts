// backend/src/bot/bot-logger.ts
import { Logger } from '@nestjs/common';

const BOT_LOG_LEVEL = (process.env.BOT_LOG_LEVEL ?? 'warn').toLowerCase();

/**
 * Logger wrapper for bot services.
 * Prefixes all messages with [BOT:<context>] and suppresses debug()
 * when BOT_LOG_LEVEL is 'warn' (default).
 */
export class BotLogger {
  private readonly inner: Logger;
  private readonly debugEnabled: boolean;

  constructor(context: string) {
    this.inner = new Logger(`BOT:${context}`);
    this.debugEnabled = BOT_LOG_LEVEL === 'debug';
  }

  debug(message: string): void {
    if (this.debugEnabled) {
      this.inner.debug(message);
    }
  }

  warn(message: string): void {
    this.inner.warn(message);
  }

  error(message: string, trace?: string): void {
    this.inner.error(message, trace);
  }
}

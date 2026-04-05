import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface ModifierRow {
  answer_type: string;
  modifier: number;
  category: string | null;
}

function normalizeAnswerType(s: string): string {
  return String(s ?? '').trim().toLowerCase();
}

@Injectable()
export class AnswerTypeModifierService implements OnModuleInit {
  private readonly logger = new Logger(AnswerTypeModifierService.name);
  /** Cache: key = normalized answer_type, or "category:answer_type" for category-specific. Value = modifier. */
  private cache = new Map<string, number>();

  constructor(private readonly supabaseService: SupabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  /**
   * Returns the modifier for the given answer type. Sync lookup from cache.
   * Prefers category-specific row if category given; else global (category IS NULL).
   * Returns 0 if not found.
   */
  getModifier(answerType: string, category?: string): number {
    const key = normalizeAnswerType(answerType);
    if (!key) return 0;

    if (category) {
      const catKey = `${category}:${key}`;
      const catMod = this.cache.get(catKey);
      if (catMod !== undefined) return catMod;
    }

    const globalMod = this.cache.get(key);
    return globalMod !== undefined ? globalMod : 0;
  }

  /**
   * If the answer type is not in the DB, inserts it with modifier 0 and source 'llm_extracted'.
   * Refreshes cache after insert.
   */
  async ensureAnswerType(answerType: string, category?: string): Promise<void> {
    const key = normalizeAnswerType(answerType);
    if (!key) return;

    if (category && this.cache.has(`${category}:${key}`)) return;
    if (this.cache.has(key)) return;

    const { error } = await this.supabaseService.client
      .from('answer_type_modifiers')
      .upsert(
        {
          answer_type: key,
          modifier: 0,
          category: category ?? null,
          source: 'llm_extracted',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'answer_type', ignoreDuplicates: true },
      );

    if (error) {
      if (error.code === '23505') {
        // Unique violation - another process inserted; refresh cache
        await this.refreshCache();
        return;
      }
      this.logger.warn(`[ensureAnswerType] Insert failed for "${key}": ${error.message}`);
      return;
    }

    await this.refreshCache();
    this.logger.log(`[ensureAnswerType] Added "${key}" with modifier 0`);
  }

  private async refreshCache(): Promise<void> {
    const { data, error } = await this.supabaseService.client
      .from('answer_type_modifiers')
      .select('answer_type, modifier, category');

    if (error) {
      this.logger.error(`[refreshCache] Failed to load modifiers: ${error.message}`);
      return;
    }

    this.cache.clear();
    for (const row of (data ?? []) as ModifierRow[]) {
      const key = normalizeAnswerType(row.answer_type);
      if (!key) continue;
      if (row.category) {
        this.cache.set(`${row.category}:${key}`, row.modifier);
      } else {
        this.cache.set(key, row.modifier);
      }
    }
    this.logger.debug(`[refreshCache] Loaded ${this.cache.size} answer type modifiers`);
  }
}

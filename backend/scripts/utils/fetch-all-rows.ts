/**
 * Fetch all rows from a Supabase table with pagination.
 * Supabase defaults to 1000 rows per request; this loops until the full table is fetched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  client: SupabaseClient,
  table: string,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

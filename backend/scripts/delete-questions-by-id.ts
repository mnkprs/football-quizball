#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Delete specific questions from question_pool by ID.
 * Usage: npm run pool:delete-by-id -- 629400fe-60f5-495d-b2ba-41c3d6e5c7a1 9918dcdf-6a2e-410a-86b6-e1f723409d4e
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^[0-9a-f-]{36}$/i.test(a));
  if (ids.length === 0) {
    console.error('Usage: npm run pool:delete-by-id -- <uuid1> [uuid2] ...');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);

  const { error } = await supabase.client.from('question_pool').delete().in('id', ids);

  await app.close();

  if (error) {
    console.error('Delete error:', error.message);
    process.exit(1);
  }
  console.log(`Deleted ${ids.length} question(s): ${ids.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

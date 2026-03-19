#!/usr/bin/env bun

const run = async (label: string, script: string) => {
  console.log(`\n→ ${label}`);
  await Bun.$`bun run ${script}`;
};

try {
  await run('Fetch models', 'src/fetch-models.ts');
  await run('Scrape speed metrics', 'src/scrape-speed.ts');
  await run('Consolidate snapshots', 'src/consolidate.ts');
  console.log('\n✅ Refresh complete');
} catch (error) {
  console.error('\n❌ Refresh failed', error);
  process.exit(1);
}

#!/usr/bin/env bun

import {
  describeFirecrawlCredentialSource,
  resolveFirecrawlApiKey,
  resolveModelPickerConfigPath,
} from '@model-picker/domain';
import {
  parseSpeedEnrichmentSubset,
  resolveSpeedEnrichmentSubset,
} from './sync-subset';

const run = async (label: string, script: string) => {
  console.log(`\n→ ${label}`);
  await Bun.$`bun run ${script}`;
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

try {
  const subset = process.argv[2] === '--subset'
    ? parseSpeedEnrichmentSubset(process.argv[3])
    : resolveSpeedEnrichmentSubset();

  await run('Fetch full OpenRouter catalog', 'src/fetch-models.ts');

  Bun.env.MP_SYNC_SUBSET = subset;
  console.log(`\nSpeed enrichment subset: ${subset}`);

  const firecrawlApiKey = await resolveFirecrawlApiKey();
  if (firecrawlApiKey) {
    Bun.env.FIRECRAWL_API_KEY = firecrawlApiKey;
    const credentialSource = await describeFirecrawlCredentialSource();
    console.log('\nNote: speed enrichment can take a while on the first full sync.');
    console.log(
      `Using Firecrawl fallback credentials from ${credentialSource === 'config' ? resolveModelPickerConfigPath() : 'FIRECRAWL_API_KEY'}.`,
    );
  } else {
    console.log(
      `\nNo Firecrawl fallback configured. Sync will use OpenRouter frontend data only (optional fallback key path: ${resolveModelPickerConfigPath()}).`,
    );
  }

  try {
    await run('Enrich speed metrics', 'src/scrape-speed.ts');
  } catch (error) {
    console.warn(`\nWarning: speed enrichment failed. Continuing with the existing speed cache.\n${formatError(error)}`);
  }

  await run('Consolidate snapshots', 'src/consolidate.ts');
  console.log('\nSync complete');
} catch (error) {
  console.error('\nSync failed');
  console.error(formatError(error));
  process.exit(1);
}

#!/usr/bin/env bun

import { API_MODELS_FILE } from './paths';
import type { OpenRouterModel } from '@model-picker/domain';
import { assertCoverage, buildCoverageSummary } from './coverage';

const API_URL = 'https://openrouter.ai/api/v1/models';

interface ApiResponse {
  data: OpenRouterModel[];
}

function providerFromModelId(modelId: string): string {
  const provider = modelId.split('/')[0]?.trim().toLowerCase();
  return provider && provider.length > 0 ? provider : 'unknown';
}

function sortModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    const providerDiff = providerFromModelId(a.id).localeCompare(providerFromModelId(b.id));
    if (providerDiff !== 0) {
      return providerDiff;
    }

    return a.id.localeCompare(b.id);
  });
}

async function fetchModels(): Promise<void> {
  console.log('Fetching models from OpenRouter API...');

  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = (await response.json()) as ApiResponse;
  const allModels = sortModels(data.data);
  const coverage = buildCoverageSummary(allModels);
  assertCoverage(coverage);

  await Bun.write(
    API_MODELS_FILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        count: allModels.length,
        coverage,
        models: allModels,
      },
      null,
      2,
    ),
  );

  const providers = new Set(allModels.map((model) => providerFromModelId(model.id)));
  console.log(
    `Saved ${allModels.length} models across ${providers.size} providers to ${API_MODELS_FILE}`,
  );
}

await fetchModels();

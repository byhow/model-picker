export const SPEED_ENRICHMENT_SUBSETS = ['full', 'top-providers-10'] as const;

export type SpeedEnrichmentSubset = (typeof SPEED_ENRICHMENT_SUBSETS)[number];

export function providerFromModelId(modelId: string): string {
  const provider = modelId.split('/')[0]?.trim().toLowerCase();
  return provider && provider.length > 0 ? provider : 'unknown';
}

export function parseSpeedEnrichmentSubset(value: string | undefined): SpeedEnrichmentSubset {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'full') {
    return 'full';
  }

  if (normalized === 'top-providers-10') {
    return 'top-providers-10';
  }

  throw new Error(
    `Invalid sync subset: ${value}. Use one of ${SPEED_ENRICHMENT_SUBSETS.join(', ')}.`,
  );
}

export function resolveSpeedEnrichmentSubset(): SpeedEnrichmentSubset {
  return parseSpeedEnrichmentSubset(process.env.MP_SYNC_SUBSET);
}

export function topProvidersByCount(
  models: { id: string }[],
  limit = 10,
): string[] {
  const counts = new Map<string, number>();

  for (const model of models) {
    const provider = providerFromModelId(model.id);
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([provider]) => provider);
}

export function selectModelsForSpeedEnrichment(
  models: { id: string }[],
  subset: SpeedEnrichmentSubset,
): {
  models: { id: string }[];
  providers: string[];
} {
  if (subset === 'full') {
    return {
      models,
      providers: [],
    };
  }

  const providers = topProvidersByCount(models, 10);
  const providerSet = new Set(providers);
  return {
    models: models.filter((model) => providerSet.has(providerFromModelId(model.id))),
    providers,
  };
}

import {
  rankModels,
  type CompactSnapshot,
  type ModelRecord,
  type ModelSnapshot,
  type OpenRouterModel,
} from '@model-picker/domain';

export interface SpeedData {
  modelId: string;
  providers: {
    name: string;
    throughput: number | null;
    latency: number | null;
    e2eLatency: number | null;
  }[];
}

export function formatPrice(priceStr: string): number {
  const price = Number.parseFloat(priceStr);
  if (Number.isNaN(price)) {
    return 0;
  }

  return price * 1_000_000;
}

function normalizeThroughput(value: number | null): number | null {
  if (value === null || Number.isNaN(value) || value <= 0) {
    return null;
  }

  return value;
}

export function toModelRecord(
  model: OpenRouterModel,
  speedInfo?: SpeedData,
): ModelRecord {
  const providers = speedInfo?.providers ?? [];
  const throughputs = providers
    .map((provider) => normalizeThroughput(provider.throughput))
    .filter((value): value is number => value !== null);

  const bestThroughput = throughputs.length > 0 ? Math.max(...throughputs) : null;
  const avgThroughput =
    throughputs.length > 0
      ? throughputs.reduce((sum, item) => sum + item, 0) / throughputs.length
      : null;

  return {
    id: model.id,
    name: model.name,
    description: model.description,
    contextLength: model.context_length,
    pricing: {
      inputPerMillion: formatPrice(model.pricing.prompt),
      outputPerMillion: formatPrice(model.pricing.completion),
    },
    topProvider: {
      contextLength: model.top_provider.context_length,
      maxCompletionTokens: model.top_provider.max_completion_tokens,
      isModerated: model.top_provider.is_moderated,
    },
    architecture: {
      modality: model.architecture.modality,
      inputModalities: model.architecture.input_modalities,
      outputModalities: model.architecture.output_modalities,
    },
    speed: {
      providers: providers.map((provider) => ({
        name: provider.name,
        throughput: normalizeThroughput(provider.throughput),
        latency: provider.latency,
      })),
      bestThroughput,
      avgThroughput,
    },
    rank: {
      bySpeed: 0,
      byPrice: 0,
      byContext: 0,
    },
  };
}

export function toCompactSnapshot(full: ModelSnapshot): CompactSnapshot {
  return {
    generatedAt: full.generatedAt,
    count: full.count,
    models: full.models.map((model) => ({
      id: model.id,
      name: model.name,
      contextLength: model.contextLength,
      outputPerMillion: model.pricing.outputPerMillion,
      bestThroughput: model.speed.bestThroughput,
      rank: model.rank,
    })),
  };
}

export function buildSnapshots(
  apiModels: OpenRouterModel[],
  speedModels: SpeedData[],
  generatedAt = new Date().toISOString(),
): {
  fullSnapshot: ModelSnapshot;
  compactSnapshot: CompactSnapshot;
} {
  const speedByModelId = new Map(speedModels.map((model) => [model.modelId, model]));
  const rankedModels = rankModels(
    apiModels.map((model) => toModelRecord(model, speedByModelId.get(model.id))),
  );

  const fullSnapshot: ModelSnapshot = {
    generatedAt,
    count: rankedModels.length,
    models: rankedModels,
  };

  return {
    fullSnapshot,
    compactSnapshot: toCompactSnapshot(fullSnapshot),
  };
}

import type { ModelRecord, SupportedAgent } from '@model-picker/domain';

export const MODEL_SELECTION_CONTRACT = 'model-picker.selection' as const;
export const MODEL_SELECTION_VERSION = 1 as const;

export interface ModelSelectionRequest {
  task: string | null;
  agent: SupportedAgent | null;
  filter: string | null;
  limit: number;
}

export interface ModelSelectionChoice {
  id: string;
  name: string;
  score: number;
  reasons: string[];
  contextWindow: number;
  outputPerMillion: number;
  bestThroughput: number | null;
}

export interface ModelSelectionEnvelope {
  contract: typeof MODEL_SELECTION_CONTRACT;
  version: typeof MODEL_SELECTION_VERSION;
  source: 'snapshot';
  request: ModelSelectionRequest;
  count: number;
  choices: ModelSelectionChoice[];
}

export interface RankedModelChoice {
  model: ModelRecord;
  score: number;
  reasons: string[];
}

/** Stable, narrow projection consumed by harness adapters. */
export function buildModelSelectionEnvelope(
  picks: RankedModelChoice[],
  request: ModelSelectionRequest,
): ModelSelectionEnvelope {
  return {
    contract: MODEL_SELECTION_CONTRACT,
    version: MODEL_SELECTION_VERSION,
    source: 'snapshot',
    request,
    count: picks.length,
    choices: picks.map(({ model, score, reasons }) => ({
      id: model.id,
      name: model.name,
      score,
      reasons: [...reasons],
      contextWindow: model.contextLength,
      outputPerMillion: model.pricing.outputPerMillion,
      bestThroughput: model.speed.bestThroughput,
    })),
  };
}

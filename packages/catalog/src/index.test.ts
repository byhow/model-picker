import { describe, expect, test } from 'bun:test';
import {
  filterModels,
  pickModelsFromRecords,
  sortModels,
  type PickModelsOptions,
} from './index';
import type { ModelRecord } from '@model-picker/domain';

function createModel(partial: Partial<ModelRecord>): ModelRecord {
  return {
    id: partial.id ?? 'provider/model',
    name: partial.name ?? 'Model',
    description: partial.description ?? 'General model',
    contextLength: partial.contextLength ?? 32_000,
    pricing: {
      inputPerMillion: partial.pricing?.inputPerMillion ?? 1,
      outputPerMillion: partial.pricing?.outputPerMillion ?? 2,
    },
    topProvider: {
      contextLength: partial.topProvider?.contextLength ?? 32_000,
      maxCompletionTokens: partial.topProvider?.maxCompletionTokens ?? null,
      isModerated: partial.topProvider?.isModerated ?? false,
    },
    architecture: {
      modality: partial.architecture?.modality ?? 'text',
      inputModalities: partial.architecture?.inputModalities ?? ['text'],
      outputModalities: partial.architecture?.outputModalities ?? ['text'],
    },
    speed: {
      providers: partial.speed?.providers ?? [],
      bestThroughput: partial.speed?.bestThroughput ?? 20,
      avgThroughput: partial.speed?.avgThroughput ?? 20,
    },
    rank: {
      bySpeed: partial.rank?.bySpeed ?? 1,
      byPrice: partial.rank?.byPrice ?? 1,
      byContext: partial.rank?.byContext ?? 1,
    },
  };
}

const models: ModelRecord[] = [
  createModel({
    id: 'openai/code-fast',
    name: 'Code Fast',
    description: 'Great for code generation',
    pricing: { inputPerMillion: 2, outputPerMillion: 3 },
    speed: { providers: [], bestThroughput: 90, avgThroughput: 70 },
    contextLength: 128_000,
    architecture: {
      modality: 'text+code',
      inputModalities: ['text'],
      outputModalities: ['text'],
    },
  }),
  createModel({
    id: 'google/vision-budget',
    name: 'Vision Budget',
    description: 'Budget-friendly vision model',
    pricing: { inputPerMillion: 0.2, outputPerMillion: 0.9 },
    speed: { providers: [], bestThroughput: 35, avgThroughput: 30 },
    contextLength: 1_000_000,
    architecture: {
      modality: 'multimodal',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    },
  }),
  createModel({
    id: 'anthropic/long-context',
    name: 'Long Context',
    description: 'Context-heavy assistant',
    pricing: { inputPerMillion: 1.5, outputPerMillion: 8 },
    speed: { providers: [], bestThroughput: 18, avgThroughput: 17 },
    contextLength: 2_000_000,
    topProvider: {
      contextLength: 2_000_000,
      maxCompletionTokens: null,
      isModerated: true,
    },
  }),
];

describe('catalog filtering', () => {
  test('supports quick filters and numeric filters', () => {
    expect(filterModels(models, 'fast').map((model) => model.id)).toEqual([
      'openai/code-fast',
    ]);
    expect(filterModels(models, 'budget').map((model) => model.id)).toEqual([
      'google/vision-budget',
    ]);
    expect(filterModels(models, 'vision,price<1').map((model) => model.id)).toEqual([
      'google/vision-budget',
    ]);
    expect(
      filterModels(models, 'provider=anthropic,moderated').map((model) => model.id),
    ).toEqual(['anthropic/long-context']);
  });
});

describe('catalog sorting', () => {
  test('sorts by price ascending and speed descending', () => {
    const byPrice = sortModels(models, 'price').map((model) => model.id);
    const bySpeed = sortModels(models, 'speed').map((model) => model.id);

    expect(byPrice[0]).toBe('google/vision-budget');
    expect(bySpeed[0]).toBe('openai/code-fast');
  });
});

describe('pickModelsFromRecords', () => {
  test('honors task bonuses and custom weights', () => {
    const options: PickModelsOptions = {
      task: 'coding',
      weights: {
        speed: 0.7,
        price: 0.2,
        context: 0.1,
      },
      limit: 2,
    };

    const picks = pickModelsFromRecords(models, options);
    expect(picks).toHaveLength(2);
    expect(picks[0]?.model.id).toBe('openai/code-fast');
    expect(picks[0]?.reasons.some((reason) => reason.includes('coding'))).toBe(
      true,
    );
  });
});

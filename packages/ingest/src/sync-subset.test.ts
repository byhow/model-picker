import { describe, expect, test } from 'bun:test';
import {
  parseSpeedEnrichmentSubset,
  selectModelsForSpeedEnrichment,
  topProvidersByCount,
} from './sync-subset';

describe('sync subset helpers', () => {
  const models = [
    ...Array.from({ length: 12 }, (_, index) => ({ id: `openai/model-${index}` })),
    ...Array.from({ length: 11 }, (_, index) => ({ id: `qwen/model-${index}` })),
    ...Array.from({ length: 10 }, (_, index) => ({ id: `google/model-${index}` })),
    ...Array.from({ length: 9 }, (_, index) => ({ id: `mistralai/model-${index}` })),
    ...Array.from({ length: 8 }, (_, index) => ({ id: `anthropic/model-${index}` })),
    ...Array.from({ length: 7 }, (_, index) => ({ id: `deepseek/model-${index}` })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: `nvidia/model-${index}` })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `x-ai/model-${index}` })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `meta-llama/model-${index}` })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `z-ai/model-${index}` })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `minimax/model-${index}` })),
  ];

  test('parses supported subset values', () => {
    expect(parseSpeedEnrichmentSubset(undefined)).toBe('full');
    expect(parseSpeedEnrichmentSubset('top-providers-10')).toBe('top-providers-10');
    expect(() => parseSpeedEnrichmentSubset('other')).toThrow('Invalid sync subset');
  });

  test('returns the most common providers in descending order', () => {
    expect(topProvidersByCount(models, 3)).toEqual(['openai', 'qwen', 'google']);
  });

  test('selects only models from the top 10 providers', () => {
    const selection = selectModelsForSpeedEnrichment(models, 'top-providers-10');

    expect(selection.providers).toEqual([
      'openai',
      'qwen',
      'google',
      'mistralai',
      'anthropic',
      'deepseek',
      'nvidia',
      'x-ai',
      'meta-llama',
      'z-ai',
    ]);
    expect(selection.models.some((model) => model.id.startsWith('minimax/'))).toBe(false);
    expect(selection.models.length).toBe(models.length - 2);
  });
});

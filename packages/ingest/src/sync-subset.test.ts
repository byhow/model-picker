import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  parseSpeedEnrichmentSubset,
  providerFromModelId,
  resolveSpeedEnrichmentSubset,
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
    expect(parseSpeedEnrichmentSubset('full')).toBe('full');
    expect(parseSpeedEnrichmentSubset('FULL')).toBe('full');
    expect(parseSpeedEnrichmentSubset('  top-providers-10  ')).toBe('top-providers-10');
    expect(() => parseSpeedEnrichmentSubset('other')).toThrow('Invalid sync subset');
  });

  test('empty string returns full subset', () => {
    expect(parseSpeedEnrichmentSubset('')).toBe('full');
  });

  test('returns the most common providers in descending order', () => {
    expect(topProvidersByCount(models, 3)).toEqual(['openai', 'qwen', 'google']);
  });

  test('returns top providers with default limit of 10', () => {
    const providers = topProvidersByCount(models);
    expect(providers).toHaveLength(10);
    expect(providers[0]).toBe('openai');
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

  test('selects all models for full subset', () => {
    const selection = selectModelsForSpeedEnrichment(models, 'full');
    expect(selection.models).toEqual(models);
    expect(selection.providers).toEqual([]);
  });
});

describe('providerFromModelId', () => {
  test('extracts provider from model id', () => {
    expect(providerFromModelId('openai/gpt-4')).toBe('openai');
    expect(providerFromModelId('anthropic/claude-3')).toBe('anthropic');
    expect(providerFromModelId('google/gemini-pro')).toBe('google');
  });

  test('handles provider names with special characters', () => {
    expect(providerFromModelId('meta-llama/llama-3')).toBe('meta-llama');
    expect(providerFromModelId('x-ai/grok-1')).toBe('x-ai');
  });

  test('returns unknown for invalid model ids', () => {
    expect(providerFromModelId('')).toBe('unknown');
    expect(providerFromModelId('/model')).toBe('unknown');
  });

  test('normalizes to lowercase', () => {
    expect(providerFromModelId('OPENAI/gpt-4')).toBe('openai');
    expect(providerFromModelId('Google/Gemini')).toBe('google');
  });
});

describe('resolveSpeedEnrichmentSubset', () => {
  const originalValue = process.env.MP_SYNC_SUBSET;

  afterEach(() => {
    if (originalValue !== undefined) {
      process.env.MP_SYNC_SUBSET = originalValue;
    } else {
      delete process.env.MP_SYNC_SUBSET;
    }
  });

  test('returns full when env var is not set', () => {
    delete process.env.MP_SYNC_SUBSET;
    expect(resolveSpeedEnrichmentSubset()).toBe('full');
  });

  test('returns full when env var is empty', () => {
    process.env.MP_SYNC_SUBSET = '';
    expect(resolveSpeedEnrichmentSubset()).toBe('full');
  });

  test('returns top-providers-10 when env var is set', () => {
    process.env.MP_SYNC_SUBSET = 'top-providers-10';
    expect(resolveSpeedEnrichmentSubset()).toBe('top-providers-10');
  });

  test('handles whitespace in env var', () => {
    process.env.MP_SYNC_SUBSET = '  top-providers-10  ';
    expect(resolveSpeedEnrichmentSubset()).toBe('top-providers-10');
  });
});

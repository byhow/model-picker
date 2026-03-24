import { describe, expect, test } from 'bun:test';
import {
  filterModels,
  pickModelsFromRecords,
  sortModels,
  loadSnapshot,
  searchModels,
  topModels,
  getModelById,
  compareModels,
  listModels,
  pickModels,
  type PickModelsOptions,
  DEFAULT_WEIGHTS,
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

  test('task=agent prefers coding-agent-friendly metadata', () => {
    const picks = pickModelsFromRecords(models, {
      task: 'agent',
      weights: {
        speed: 0.5,
        price: 0.2,
        context: 0.3,
      },
      limit: 2,
    });

    expect(picks).toHaveLength(2);
    expect(picks[0]?.model.id).toBe('openai/code-fast');
    expect(
      picks[0]?.reasons.some(
        (reason) => reason.includes('coding agents') || reason.includes('text output support'),
      ),
    ).toBe(true);
  });

  test('task=review boosts moderated long-context models', () => {
    const picks = pickModelsFromRecords(models, {
      task: 'review',
      weights: {
        speed: 0.1,
        price: 0.1,
        context: 0.8,
      },
      limit: 3,
    });

    expect(picks).toHaveLength(3);
    expect(picks[0]?.model.id).toBe('anthropic/long-context');
    expect(picks[0]?.reasons).toContain('moderated provider');
    expect(picks[0]?.reasons).toContain('long context window');
  });

  test('does not fabricate speed scores when speed data is unavailable', () => {
    const noSpeedModels = models.map((model) => ({
      ...model,
      speed: {
        providers: [],
        bestThroughput: null,
        avgThroughput: null,
      },
    }));

    const picks = pickModelsFromRecords(noSpeedModels, {
      task: 'coding',
      limit: 2,
    });

    expect(picks).toHaveLength(2);
    expect(picks[0]?.reasons).toContain('speed unavailable');
    expect(picks[0]?.reasons.some((reason) => reason.includes('speed 100%'))).toBe(
      false,
    );
  });

  test('treats unknown negative prices as unavailable instead of cheapest', () => {
    const withUnknownPrice = [
      ...models,
      createModel({
        id: 'openrouter/auto',
        name: 'Auto',
        pricing: { inputPerMillion: -1_000_000, outputPerMillion: -1_000_000 },
        speed: { providers: [], bestThroughput: 10, avgThroughput: 10 },
      }),
    ];

    const picks = pickModelsFromRecords(withUnknownPrice, {
      task: 'budget',
      weights: {
        speed: 0,
        price: 1,
        context: 0,
      },
      limit: 4,
    });

    expect(picks[0]?.model.id).not.toBe('openrouter/auto');
    const autoPick = picks.find((entry) => entry.model.id === 'openrouter/auto');
    expect(autoPick?.reasons).toContain('price unavailable');
  });

  test('returns empty array for empty models input', () => {
    expect(pickModelsFromRecords([])).toEqual([]);
  });

  test('returns empty array when filter excludes all models', () => {
    const picks = pickModelsFromRecords(models, { filter: 'nonexistent-model-xyz' });
    expect(picks).toEqual([]);
  });

  test('task=vision boosts models with image input', () => {
    const picks = pickModelsFromRecords(models, {
      task: 'vision',
      limit: 3,
    });

    const visionPick = picks.find((entry) => entry.model.id === 'google/vision-budget');
    expect(visionPick?.reasons).toContain('vision input support');
  });

  test('task=fast boosts high-throughput models', () => {
    const picks = pickModelsFromRecords(models, {
      task: 'fast',
      limit: 3,
    });

    const fastPick = picks.find((entry) => entry.model.id === 'openai/code-fast');
    expect(fastPick?.reasons).toContain('high token throughput');
  });

  test('task=long-context boosts models with high context window', () => {
    const picks = pickModelsFromRecords(models, {
      task: 'long-context',
      limit: 3,
    });

    const longContextPick = picks.find((entry) => entry.model.id === 'anthropic/long-context');
    expect(longContextPick?.reasons).toContain('high context window');
  });

  test('normalizes weights when total is zero', () => {
    const picks = pickModelsFromRecords(models, {
      weights: { speed: 0, price: 0, context: 0 },
      limit: 1,
    });

    expect(picks.length).toBeGreaterThan(0);
  });

  test('handles models with null throughput', () => {
    const modelsWithNullSpeed = [
      createModel({
        id: 'test/model',
        speed: { providers: [], bestThroughput: null, avgThroughput: null },
      }),
      createModel({
        id: 'test/model-2',
        speed: { providers: [], bestThroughput: null, avgThroughput: null },
      }),
    ];

    const picks = pickModelsFromRecords(modelsWithNullSpeed, { limit: 1 });
    expect(picks).toHaveLength(1);
    expect(picks[0]).toBeDefined();
  });
});

describe('catalog filtering advanced', () => {
  test('filters by id= prefix', () => {
    expect(filterModels(models, 'id=code').map((model) => model.id)).toEqual([
      'openai/code-fast',
    ]);
  });

  test('filters by provider= prefix', () => {
    expect(filterModels(models, 'provider=google').map((model) => model.id)).toEqual([
      'google/vision-budget',
    ]);
  });

  test('filters by unmoderated quick filter', () => {
    expect(filterModels(models, 'unmoderated').map((model) => model.id)).toEqual([
      'openai/code-fast',
      'google/vision-budget',
    ]);
  });

  test('filters by code quick filter', () => {
    const codeModels = filterModels(models, 'code');
    expect(codeModels.map((model) => model.id)).toContain('openai/code-fast');
  });

  test('filters by cheap alias', () => {
    expect(filterModels(models, 'cheap').map((model) => model.id)).toEqual([
      'google/vision-budget',
    ]);
  });

  test('filters by numeric price comparison', () => {
    expect(filterModels(models, 'price>5').map((model) => model.id)).toEqual([
      'anthropic/long-context',
    ]);
    expect(filterModels(models, 'price<=3').map((model) => model.id)).toEqual([
      'openai/code-fast',
      'google/vision-budget',
    ]);
    expect(filterModels(models, 'price=0.9').map((model) => model.id)).toEqual([
      'google/vision-budget',
    ]);
  });

  test('filters by numeric speed comparison', () => {
    expect(filterModels(models, 'speed>=90').map((model) => model.id)).toEqual([
      'openai/code-fast',
    ]);
    expect(filterModels(models, 'speed<20').map((model) => model.id)).toEqual([
      'anthropic/long-context',
    ]);
  });

  test('filters by numeric context comparison', () => {
    expect(filterModels(models, 'context>=1000000').map((model) => model.id)).toEqual([
      'google/vision-budget',
      'anthropic/long-context',
    ]);
    expect(filterModels(models, 'context<100000').length).toBe(0);
  });

  test('returns all models for empty filter', () => {
    expect(filterModels(models, '').length).toBe(3);
    expect(filterModels(models, '   ').length).toBe(3);
    expect(filterModels(models, undefined).length).toBe(3);
  });

  test('combines multiple filters with AND logic', () => {
    expect(filterModels(models, 'vision,price<1,fast').length).toBe(0);
    expect(filterModels(models, 'vision,price<5').map((model) => model.id)).toEqual([
      'google/vision-budget',
    ]);
  });

  test('handles whitespace in filter tokens', () => {
    expect(filterModels(models, '  vision  ,  budget  ').map((model) => model.id)).toEqual([
      'google/vision-budget',
    ]);
  });

  test('filters by text search in description', () => {
    expect(filterModels(models, 'assistant').map((model) => model.id)).toEqual([
      'anthropic/long-context',
    ]);
  });

  test('filters by text search in name', () => {
    expect(filterModels(models, 'Context').map((model) => model.id)).toEqual([
      'anthropic/long-context',
    ]);
  });
});

describe('catalog sorting advanced', () => {
  test('sorts by context length descending', () => {
    const byContext = sortModels(models, 'context').map((model) => model.id);
    expect(byContext).toEqual([
      'anthropic/long-context',
      'google/vision-budget',
      'openai/code-fast',
    ]);
  });

  test('sorts by name alphabetically', () => {
    const byName = sortModels(models, 'name').map((model) => model.id);
    expect(byName).toEqual([
      'openai/code-fast',
      'anthropic/long-context',
      'google/vision-budget',
    ]);
  });

  test('handles models with infinite price (unknown)', () => {
    const modelsWithInfinitePrice = [
      ...models,
      createModel({
        id: 'unknown/pricing',
        pricing: { inputPerMillion: Number.POSITIVE_INFINITY, outputPerMillion: Number.POSITIVE_INFINITY },
      }),
    ];

    const byPrice = sortModels(modelsWithInfinitePrice, 'price');
    expect(byPrice[byPrice.length - 1]?.id).toBe('unknown/pricing');
  });

  test('sorts by long-context quick filter', () => {
    const byContext = sortModels(
      filterModels(models, 'long-context'),
      'context',
    ).map((model) => model.id);
    expect(byContext).toEqual([
      'anthropic/long-context',
      'google/vision-budget',
      'openai/code-fast',
    ]);
  });
});

describe('catalog filtering context equality', () => {
  test('filters by context= exact equality', () => {
    expect(filterModels(models, 'context=128000').map((model) => model.id)).toEqual([
      'openai/code-fast',
    ]);
  });
});

describe('pickModelsFromRecords review task', () => {
  test('task=review boosts large max completion window', () => {
    const reviewModels = [
      createModel({
        id: 'test/large-completion',
        contextLength: 200_000,
        topProvider: {
          contextLength: 200_000,
          maxCompletionTokens: 32_000,
          isModerated: true,
        },
      }),
      createModel({
        id: 'test/small-completion',
        contextLength: 200_000,
        topProvider: {
          contextLength: 200_000,
          maxCompletionTokens: 4_000,
          isModerated: false,
        },
      }),
    ];

    const picks = pickModelsFromRecords(reviewModels, {
      task: 'review',
      weights: { speed: 0, price: 0, context: 1 },
      limit: 2,
    });

    const largeCompletionPick = picks.find((p) => p.model.id === 'test/large-completion');
    expect(largeCompletionPick?.reasons).toContain('large max completion window');
    expect(largeCompletionPick?.reasons).toContain('moderated provider');
  });
});

describe('pickModelsFromRecords empty tokens', () => {
  test('returns all models when filter has only whitespace tokens', () => {
    const picks = pickModelsFromRecords(models, { filter: ' , , ' });
    expect(picks.length).toBe(3);
  });
});

// --- Async wrapper tests ---
// These tests exercise loadSnapshot and the async functions that wrap it.
// loadSnapshot discovers snapshot files from multiple candidate paths;
// in this workspace it finds apps/web/src/data/models.json.

describe('loadSnapshot', () => {
  test('loads snapshot with models array', async () => {
    const snapshot = await loadSnapshot();
    expect(snapshot).toBeDefined();
    expect(Array.isArray(snapshot.models)).toBe(true);
    expect(snapshot.models.length).toBeGreaterThan(0);
    expect(snapshot.generatedAt).toBeDefined();
    expect(snapshot.count).toBeGreaterThanOrEqual(0);
  });

  test('every loaded model has required fields', async () => {
    const snapshot = await loadSnapshot();
    for (const model of snapshot.models.slice(0, 5)) {
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
      expect(typeof model.contextLength).toBe('number');
    }
  });
});

describe('searchModels', () => {
  test('searches by model ID substring', async () => {
    const snapshot = await loadSnapshot();
    const firstModel = snapshot.models[0]!;
    const idFragment = firstModel.id.split('/')[1]!.slice(0, 5);

    const results = await searchModels(idFragment);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((m) => m.id === firstModel.id)).toBe(true);
  });

  test('searches by name', async () => {
    const snapshot = await loadSnapshot();
    const firstModel = snapshot.models[0]!;

    const results = await searchModels(firstModel.name);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((m) => m.id === firstModel.id)).toBe(true);
  });

  test('empty query returns all models', async () => {
    const snapshot = await loadSnapshot();
    const results = await searchModels('');
    expect(results).toHaveLength(snapshot.models.length);
  });

  test('whitespace query returns all models', async () => {
    const snapshot = await loadSnapshot();
    const results = await searchModels('   ');
    expect(results).toHaveLength(snapshot.models.length);
  });

  test('non-matching query returns empty', async () => {
    const results = await searchModels('zzz_nonexistent_xyz_12345');
    expect(results).toHaveLength(0);
  });
});

describe('topModels', () => {
  test('returns limited models sorted by speed', async () => {
    const results = await topModels('speed', 3);
    expect(results).toHaveLength(3);
    // Verify descending speed order
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]!.speed.bestThroughput ?? 0).toBeGreaterThanOrEqual(
        results[i + 1]!.speed.bestThroughput ?? 0,
      );
    }
  });

  test('applies filter', async () => {
    const results = await topModels('price', 5, 'vision');
    expect(results.length).toBeGreaterThan(0);
    for (const model of results) {
      expect(
        model.architecture.inputModalities.some((m) => m.toLowerCase() === 'image'),
      ).toBe(true);
    }
  });
});

describe('getModelById', () => {
  test('finds by exact id', async () => {
    const snapshot = await loadSnapshot();
    const firstModel = snapshot.models[0]!;

    const model = await getModelById(firstModel.id);
    expect(model?.id).toBe(firstModel.id);
  });

  test('finds by name (case-insensitive)', async () => {
    const snapshot = await loadSnapshot();
    const firstModel = snapshot.models[0]!;

    const model = await getModelById(firstModel.name.toLowerCase());
    expect(model?.id).toBe(firstModel.id);
  });

  test('returns null for non-existent model', async () => {
    const model = await getModelById('nonexistent/model-xyz-99999');
    expect(model).toBeNull();
  });
});

describe('compareModels', () => {
  test('returns matching models by ID', async () => {
    const snapshot = await loadSnapshot();
    const ids = snapshot.models.slice(0, 2).map((m) => m.id);

    const results = await compareModels(ids);
    expect(results).toHaveLength(2);
    expect(results.map((m) => m.id).sort()).toEqual([...ids].sort());
  });

  test('returns empty for non-matching IDs', async () => {
    const results = await compareModels(['nonexistent/model-xyz-99999']);
    expect(results).toHaveLength(0);
  });
});

describe('listModels', () => {
  test('returns all models sorted by speed by default', async () => {
    const results = await listModels();
    expect(results.length).toBeGreaterThan(0);
    // Verify descending speed order
    for (let i = 0; i < Math.min(results.length - 1, 5); i++) {
      expect(results[i]!.speed.bestThroughput ?? 0).toBeGreaterThanOrEqual(
        results[i + 1]!.speed.bestThroughput ?? 0,
      );
    }
  });

  test('respects limit option', async () => {
    const results = await listModels({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  test('applies filter option', async () => {
    const results = await listModels({ filter: 'vision' });
    expect(results.length).toBeGreaterThan(0);
    for (const model of results) {
      expect(
        model.architecture.inputModalities.some((m) => m.toLowerCase() === 'image'),
      ).toBe(true);
    }
  });

  test('returns all when no limit specified', async () => {
    const snapshot = await loadSnapshot();
    const results = await listModels();
    expect(results).toHaveLength(snapshot.models.length);
  });
});

describe('pickModels', () => {
  test('delegates to pickModelsFromRecords with snapshot data', async () => {
    const picks = await pickModels({ limit: 2 });
    expect(picks).toHaveLength(2);
    expect(picks[0]?.model).toBeDefined();
    expect(typeof picks[0]?.score).toBe('number');
    expect(Array.isArray(picks[0]?.reasons)).toBe(true);
  });

  test('applies task option', async () => {
    const picks = await pickModels({ task: 'coding', limit: 3 });
    expect(picks).toHaveLength(3);
    expect(picks[0]?.model).toBeDefined();
  });
});

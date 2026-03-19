import { describe, expect, test } from 'bun:test';
import type { OpenRouterModel } from '@model-picker/domain';
import {
  buildSnapshots,
  formatPrice,
  toModelRecord,
  type SpeedData,
} from './consolidate-lib';

function createApiModel(partial: Partial<OpenRouterModel>): OpenRouterModel {
  return {
    id: partial.id ?? 'provider/model',
    name: partial.name ?? 'Model',
    description: partial.description ?? 'General model',
    context_length: partial.context_length ?? 128_000,
    pricing: {
      prompt: partial.pricing?.prompt ?? '0.000001',
      completion: partial.pricing?.completion ?? '0.000002',
      image: partial.pricing?.image,
      request: partial.pricing?.request,
    },
    top_provider: {
      context_length: partial.top_provider?.context_length ?? 128_000,
      max_completion_tokens:
        partial.top_provider?.max_completion_tokens ?? 8_192,
      is_moderated: partial.top_provider?.is_moderated ?? false,
    },
    architecture: {
      modality: partial.architecture?.modality ?? 'text',
      input_modalities: partial.architecture?.input_modalities ?? ['text'],
      output_modalities: partial.architecture?.output_modalities ?? ['text'],
    },
  };
}

describe('consolidate-lib', () => {
  test('normalizes prices defensively', () => {
    expect(formatPrice('0.000002')).toBe(2);
    expect(formatPrice('not-a-number')).toBe(0);
  });

  test('computes throughput metrics and ignores invalid throughput values', () => {
    const model = createApiModel({ id: 'x/model-a' });
    const speedData: SpeedData = {
      modelId: model.id,
      providers: [
        { name: 'A', throughput: 50, latency: 0.2, e2eLatency: 0.4 },
        { name: 'B', throughput: null, latency: 0.4, e2eLatency: 0.8 },
        { name: 'C', throughput: Number.NaN, latency: 0.5, e2eLatency: 0.9 },
        { name: 'D', throughput: 0, latency: 0.6, e2eLatency: 1.0 },
        { name: 'E', throughput: 80, latency: 0.3, e2eLatency: 0.7 },
      ],
    };

    const record = toModelRecord(model, speedData);
    expect(record.speed.bestThroughput).toBe(80);
    expect(record.speed.avgThroughput).toBe(65);
    expect(record.speed.providers.map((provider) => provider.throughput)).toEqual([
      50,
      null,
      null,
      null,
      80,
    ]);
  });

  test('builds full and compact snapshots with stable ranking fields', () => {
    const apiModels = [
      createApiModel({
        id: 'provider/slow-cheap',
        name: 'Slow Cheap',
        context_length: 200_000,
        pricing: { prompt: '0.0000002', completion: '0.0000004' },
      }),
      createApiModel({
        id: 'provider/fast-expensive',
        name: 'Fast Expensive',
        context_length: 64_000,
        pricing: { prompt: '0.000002', completion: '0.00001' },
      }),
    ];

    const speedModels: SpeedData[] = [
      {
        modelId: 'provider/slow-cheap',
        providers: [
          { name: 'A', throughput: 20, latency: 0.5, e2eLatency: 0.9 },
        ],
      },
      {
        modelId: 'provider/fast-expensive',
        providers: [
          { name: 'A', throughput: 120, latency: 0.2, e2eLatency: 0.4 },
        ],
      },
    ];

    const { fullSnapshot, compactSnapshot } = buildSnapshots(
      apiModels,
      speedModels,
      '2026-03-17T09:00:00.000Z',
    );

    expect(fullSnapshot.generatedAt).toBe('2026-03-17T09:00:00.000Z');
    expect(fullSnapshot.count).toBe(2);
    expect(compactSnapshot.count).toBe(2);
    expect(compactSnapshot.models[0]?.id).toBe(fullSnapshot.models[0]?.id);

    const fast = fullSnapshot.models.find(
      (model) => model.id === 'provider/fast-expensive',
    );
    const cheap = fullSnapshot.models.find(
      (model) => model.id === 'provider/slow-cheap',
    );

    expect(fast?.rank.bySpeed).toBe(1);
    expect(cheap?.rank.byPrice).toBe(1);
    expect(cheap?.rank.byContext).toBe(1);
  });
});

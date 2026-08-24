import { describe, expect, test } from 'bun:test';
import type { ModelRecord } from '@model-picker/domain';
import { buildModelSelectionEnvelope } from './selection-contract';

const model: ModelRecord = {
  id: 'provider/model',
  name: 'Model',
  description: 'Private implementation detail',
  contextLength: 128_000,
  pricing: { inputPerMillion: 1, outputPerMillion: 2 },
  topProvider: {
    contextLength: 128_000,
    maxCompletionTokens: 16_000,
    isModerated: true,
  },
  architecture: {
    modality: 'text',
    inputModalities: ['text'],
    outputModalities: ['text'],
  },
  speed: { providers: [], bestThroughput: 42, avgThroughput: 40 },
  rank: { bySpeed: 1, byPrice: 1, byContext: 1 },
};

describe('buildModelSelectionEnvelope', () => {
  test('emits a versioned narrow DTO without the source model description', () => {
    const result = buildModelSelectionEnvelope(
      [{ model, score: 0.75, reasons: ['balanced'] }],
      { task: 'agent', agent: null, filter: null, limit: 1 },
    );
    expect(result).toEqual({
      contract: 'model-picker.selection',
      version: 1,
      source: 'snapshot',
      request: { task: 'agent', agent: null, filter: null, limit: 1 },
      count: 1,
      choices: [
        {
          id: 'provider/model',
          name: 'Model',
          score: 0.75,
          reasons: ['balanced'],
          contextWindow: 128_000,
          outputPerMillion: 2,
          bestThroughput: 42,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Private implementation detail');
  });
});

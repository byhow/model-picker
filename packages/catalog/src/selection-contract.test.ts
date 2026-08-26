import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ModelRecord } from '@model-picker/domain';
import {
  buildModelSelectionEnvelope,
  isModelSelectionEnvelope,
} from './selection-contract';

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

const weights = { speed: 0.4, price: 0.35, context: 0.25 };

describe('buildModelSelectionEnvelope', () => {
  test('emits a versioned narrow DTO without the source model description', () => {
    const result = buildModelSelectionEnvelope(
      [{ model, score: 0.75, reasons: ['balanced'] }],
      { task: 'agent', agent: null, filter: null, limit: 1, weights },
    );
    expect(result).toEqual({
      contract: 'model-picker.selection',
      version: 1,
      source: 'snapshot',
      request: { task: 'agent', agent: null, filter: null, limit: 1, weights },
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

  test('represents unavailable output pricing as null', () => {
    const result = buildModelSelectionEnvelope(
      [
        {
          model: {
            ...model,
            pricing: { ...model.pricing, outputPerMillion: -1_000_000 },
          },
          score: 0.25,
          reasons: ['routing'],
        },
      ],
      { task: 'agent', agent: null, filter: null, limit: 1, weights },
    );
    expect(result.choices[0]?.outputPerMillion).toBeNull();
  });

  test('accepts the canonical packaged fixture', async () => {
    const fixture = JSON.parse(
      await readFile(
        resolve(import.meta.dir, '../../../contracts/model-picker.selection.v1.fixture.json'),
        'utf8',
      ),
    );
    expect(isModelSelectionEnvelope(fixture)).toBe(true);
  });

  test('rejects producer output outside contract bounds', () => {
    expect(() =>
      buildModelSelectionEnvelope(
        [{ model, score: 0.75, reasons: ['balanced'] }],
        {
          task: 'x'.repeat(65),
          agent: null,
          filter: null,
          limit: 1,
          weights,
        },
      ),
    ).toThrow('version-1 contract bounds');
  });
});

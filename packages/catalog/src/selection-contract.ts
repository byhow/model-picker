import type { ModelRecord } from '@model-picker/domain';
import { type Static, Type } from 'typebox';
import { Value } from 'typebox/value';

export const MODEL_SELECTION_CONTRACT = 'model-picker.selection' as const;
export const MODEL_SELECTION_VERSION = 1 as const;

const nullableBoundedString = Type.Union([
  Type.Null(),
  Type.String({ minLength: 1, maxLength: 256 }),
]);

export const MODEL_SELECTION_SCHEMA = Type.Object(
  {
    contract: Type.Literal(MODEL_SELECTION_CONTRACT),
    version: Type.Literal(MODEL_SELECTION_VERSION),
    source: Type.Literal('snapshot'),
    request: Type.Object(
      {
        task: Type.Union([
          Type.Null(),
          Type.String({ minLength: 1, maxLength: 64 }),
        ]),
        agent: Type.Union([
          Type.Null(),
          Type.Literal('amp'),
          Type.Literal('opencode'),
          Type.Literal('claude-code'),
          Type.Literal('codex'),
          Type.Literal('cursor'),
        ]),
        filter: nullableBoundedString,
        limit: Type.Integer({ minimum: 1, maximum: 100 }),
        weights: Type.Object(
          {
            speed: Type.Number({ minimum: 0, maximum: 1 }),
            price: Type.Number({ minimum: 0, maximum: 1 }),
            context: Type.Number({ minimum: 0, maximum: 1 }),
          },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
    count: Type.Integer({ minimum: 0, maximum: 100 }),
    choices: Type.Array(
      Type.Object(
        {
          id: Type.String({ minLength: 1, maxLength: 256 }),
          name: Type.String({ minLength: 1, maxLength: 256 }),
          score: Type.Number(),
          reasons: Type.Array(
            Type.String({ minLength: 1, maxLength: 256 }),
            { maxItems: 32 },
          ),
          contextWindow: Type.Integer({ minimum: 1 }),
          outputPerMillion: Type.Union([
            Type.Null(),
            Type.Number({ minimum: 0 }),
          ]),
          bestThroughput: Type.Union([Type.Null(), Type.Number({ minimum: 0 })]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 100 },
    ),
  },
  {
    $id: 'https://model-picker.dev/contracts/model-picker.selection.v1.schema.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false,
  },
);

export type ModelSelectionEnvelope = Static<typeof MODEL_SELECTION_SCHEMA>;
export type ModelSelectionRequest = ModelSelectionEnvelope['request'];
export type ModelSelectionChoice = ModelSelectionEnvelope['choices'][number];

export interface RankedModelChoice {
  model: ModelRecord;
  score: number;
  reasons: string[];
}

export function isModelSelectionEnvelope(
  value: unknown,
): value is ModelSelectionEnvelope {
  return Value.Check(MODEL_SELECTION_SCHEMA, value);
}

/** Stable, narrow projection consumed by harness adapters. */
export function buildModelSelectionEnvelope(
  picks: RankedModelChoice[],
  request: ModelSelectionRequest,
): ModelSelectionEnvelope {
  const envelope = {
    contract: MODEL_SELECTION_CONTRACT,
    version: MODEL_SELECTION_VERSION,
    source: 'snapshot' as const,
    request,
    count: picks.length,
    choices: picks.map(({ model, score, reasons }) => ({
      id: model.id,
      name: model.name,
      score,
      reasons: [...reasons],
      contextWindow: model.contextLength,
      outputPerMillion:
        model.pricing.outputPerMillion >= 0
          ? model.pricing.outputPerMillion
          : null,
      bestThroughput: model.speed.bestThroughput,
    })),
  };
  if (!isModelSelectionEnvelope(envelope)) {
    throw new Error('Model selection exceeded the version-1 contract bounds');
  }
  return envelope;
}

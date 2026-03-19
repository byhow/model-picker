import { resolve } from 'node:path';
import type { ModelRecord, ModelSnapshot } from '@model-picker/domain';

const FULL_SNAPSHOT_PATH = resolve(
  import.meta.dir,
  '../../../data/snapshots/latest.full.json',
);
const FALLBACK_SNAPSHOT_PATH = resolve(
  import.meta.dir,
  '../../../apps/web/src/data/models.json',
);

async function readSnapshotFile(path: string): Promise<ModelSnapshot | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }

  const data = (await file.json()) as ModelSnapshot;
  if (!Array.isArray(data.models)) {
    return null;
  }

  return data;
}

export type SortBy = 'speed' | 'price' | 'context' | 'name';

export interface ListModelsOptions {
  filter?: string;
  sortBy?: SortBy;
  limit?: number;
}

export interface ScoreWeights {
  speed: number;
  price: number;
  context: number;
}

export interface PickModelsOptions extends ListModelsOptions {
  task?: string;
  weights?: Partial<ScoreWeights>;
}

export interface PickedModel {
  model: ModelRecord;
  score: number;
  reasons: string[];
}

const DEFAULT_LIMIT = 10;
const FAST_THRESHOLD = 50;
const BUDGET_THRESHOLD = 2;
const LONG_CONTEXT_THRESHOLD = 100_000;

export const DEFAULT_WEIGHTS: ScoreWeights = {
  speed: 0.4,
  price: 0.35,
  context: 0.25,
};

function withDefaultWeights(weights?: Partial<ScoreWeights>): ScoreWeights {
  return {
    speed: weights?.speed ?? DEFAULT_WEIGHTS.speed,
    price: weights?.price ?? DEFAULT_WEIGHTS.price,
    context: weights?.context ?? DEFAULT_WEIGHTS.context,
  };
}

function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const total = weights.speed + weights.price + weights.context;
  if (total <= 0) {
    return DEFAULT_WEIGHTS;
  }

  return {
    speed: weights.speed / total,
    price: weights.price / total,
    context: weights.context / total,
  };
}

function parseFilterTokens(filter: string): string[] {
  return filter
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function modelMatchesToken(model: ModelRecord, token: string): boolean {
  const numericMatch = token.match(/^(price|speed|context)(<=|>=|=|<|>)(\d+(?:\.\d+)?)$/);
  if (numericMatch) {
    const [, metric, operator, rawValue] = numericMatch;
    const value = Number.parseFloat(rawValue ?? '0');
    const current =
      metric === 'price'
        ? model.pricing.outputPerMillion
        : metric === 'speed'
          ? model.speed.bestThroughput ?? 0
          : model.contextLength;

    switch (operator) {
      case '<':
        return current < value;
      case '<=':
        return current <= value;
      case '>':
        return current > value;
      case '>=':
        return current >= value;
      case '=':
      default:
        return current === value;
    }
  }

  if (token.startsWith('provider=')) {
    const provider = token.replace('provider=', '');
    return model.id.toLowerCase().startsWith(`${provider}/`);
  }

  if (token.startsWith('id=')) {
    const id = token.replace('id=', '');
    return model.id.toLowerCase().includes(id);
  }

  const asQuickFilter = token.replace(/\s+/g, '-');
  switch (asQuickFilter) {
    case 'fast':
      return (model.speed.bestThroughput ?? 0) >= FAST_THRESHOLD;
    case 'budget':
    case 'cheap':
      return model.pricing.outputPerMillion <= BUDGET_THRESHOLD;
    case 'long-context':
      return model.contextLength >= LONG_CONTEXT_THRESHOLD;
    case 'vision':
      return model.architecture.inputModalities.some(
        (modality) => modality.toLowerCase() === 'image',
      );
    case 'code': {
      const haystack = `${model.architecture.modality} ${model.description} ${model.id}`.toLowerCase();
      return haystack.includes('code') || haystack.includes('program');
    }
    case 'moderated':
      return model.topProvider.isModerated;
    case 'unmoderated':
      return !model.topProvider.isModerated;
    default: {
      const haystack = [
        model.id,
        model.name,
        model.description,
        model.architecture.modality,
        ...model.architecture.inputModalities,
        ...model.architecture.outputModalities,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(token);
    }
  }
}

export function filterModels(models: ModelRecord[], filter?: string): ModelRecord[] {
  if (!filter?.trim()) {
    return models;
  }

  const tokens = parseFilterTokens(filter);
  if (tokens.length === 0) {
    return models;
  }

  return models.filter((model) =>
    tokens.every((token) => modelMatchesToken(model, token)),
  );
}

export function sortModels(models: ModelRecord[], sortBy: SortBy = 'speed'): ModelRecord[] {
  const sorted = [...models];

  switch (sortBy) {
    case 'price':
      sorted.sort(
        (a, b) => a.pricing.outputPerMillion - b.pricing.outputPerMillion,
      );
      break;
    case 'context':
      sorted.sort((a, b) => b.contextLength - a.contextLength);
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'speed':
    default:
      sorted.sort(
        (a, b) => (b.speed.bestThroughput || 0) - (a.speed.bestThroughput || 0),
      );
      break;
  }

  return sorted;
}

function clampBetweenZeroAndOne(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) {
    return 1;
  }

  return clampBetweenZeroAndOne((value - min) / (max - min));
}

function normalizeInverseValue(value: number, min: number, max: number): number {
  if (max === min) {
    return 1;
  }

  return clampBetweenZeroAndOne((max - value) / (max - min));
}

function taskBonus(model: ModelRecord, task?: string): { bonus: number; reasons: string[] } {
  const normalizedTask = task?.trim().toLowerCase();
  if (!normalizedTask) {
    return { bonus: 0, reasons: [] };
  }

  const reasons: string[] = [];
  let bonus = 0;

  const description = `${model.description} ${model.architecture.modality} ${model.id}`.toLowerCase();
  const supportsVision = model.architecture.inputModalities
    .map((modality) => modality.toLowerCase())
    .includes('image');
  const isFast = (model.speed.bestThroughput ?? 0) >= FAST_THRESHOLD;
  const isBudget = model.pricing.outputPerMillion <= BUDGET_THRESHOLD;
  const hasLongContext = model.contextLength >= LONG_CONTEXT_THRESHOLD;

  if (normalizedTask === 'coding' || normalizedTask === 'code') {
    if (description.includes('code') || description.includes('program')) {
      bonus += 0.15;
      reasons.push('coding-oriented metadata');
    }
    if (isFast) {
      bonus += 0.05;
      reasons.push('fast throughput');
    }
  }

  if (normalizedTask === 'vision' && supportsVision) {
    bonus += 0.2;
    reasons.push('vision input support');
  }

  if (normalizedTask === 'budget' && isBudget) {
    bonus += 0.2;
    reasons.push('low output pricing');
  }

  if (normalizedTask === 'long-context' && hasLongContext) {
    bonus += 0.2;
    reasons.push('high context window');
  }

  if (normalizedTask === 'fast' && isFast) {
    bonus += 0.2;
    reasons.push('high token throughput');
  }

  return { bonus, reasons };
}

export function pickModelsFromRecords(
  models: ModelRecord[],
  options: PickModelsOptions = {},
): PickedModel[] {
  if (models.length === 0) {
    return [];
  }

  const weights = normalizeWeights(withDefaultWeights(options.weights));
  const candidates = filterModels(models, options.filter);
  if (candidates.length === 0) {
    return [];
  }

  const prices = candidates.map((model) => model.pricing.outputPerMillion);
  const speeds = candidates.map((model) => model.speed.bestThroughput ?? 0);
  const contexts = candidates.map((model) => model.contextLength);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const minContext = Math.min(...contexts);
  const maxContext = Math.max(...contexts);

  const scored = candidates.map((model) => {
    const speedScore = normalizeValue(
      model.speed.bestThroughput ?? 0,
      minSpeed,
      maxSpeed,
    );
    const priceScore = normalizeInverseValue(
      model.pricing.outputPerMillion,
      minPrice,
      maxPrice,
    );
    const contextScore = normalizeValue(model.contextLength, minContext, maxContext);

    const weighted =
      speedScore * weights.speed +
      priceScore * weights.price +
      contextScore * weights.context;

    const task = taskBonus(model, options.task);
    const reasons = [
      `speed ${(speedScore * 100).toFixed(0)}%`,
      `price ${(priceScore * 100).toFixed(0)}%`,
      `context ${(contextScore * 100).toFixed(0)}%`,
      ...task.reasons,
    ];

    return {
      model,
      score: weighted + task.bonus,
      reasons,
    } satisfies PickedModel;
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  const limit = options.limit ?? DEFAULT_LIMIT;
  return sorted.slice(0, Math.max(1, limit));
}

export async function loadSnapshot(): Promise<ModelSnapshot> {
  const primary = await readSnapshotFile(FULL_SNAPSHOT_PATH);
  if (primary) {
    return primary;
  }

  const fallback = await readSnapshotFile(FALLBACK_SNAPSHOT_PATH);
  if (fallback) {
    return fallback;
  }

  return {
    generatedAt: new Date().toISOString(),
    count: 0,
    models: [],
  };
}

export async function searchModels(query: string): Promise<ModelRecord[]> {
  const snapshot = await loadSnapshot();
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) {
    return snapshot.models;
  }

  return snapshot.models.filter((model) => {
    const haystack = [
      model.id,
      model.name,
      model.description,
      model.architecture.modality,
      ...model.architecture.inputModalities,
      ...model.architecture.outputModalities,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export async function topModels(
  sortBy: SortBy,
  limit = DEFAULT_LIMIT,
  filter?: string,
): Promise<ModelRecord[]> {
  const snapshot = await loadSnapshot();
  return sortModels(filterModels(snapshot.models, filter), sortBy).slice(0, limit);
}

export async function getModelById(idOrName: string): Promise<ModelRecord | null> {
  const snapshot = await loadSnapshot();
  const target = idOrName.toLowerCase();

  return (
    snapshot.models.find((model) => model.id.toLowerCase() === target) ||
    snapshot.models.find((model) => model.name.toLowerCase() === target) ||
    null
  );
}

export async function compareModels(ids: string[]): Promise<ModelRecord[]> {
  const snapshot = await loadSnapshot();
  const normalized = ids.map((id) => id.toLowerCase());
  return snapshot.models.filter((model) => normalized.includes(model.id.toLowerCase()));
}

export async function listModels(
  options: ListModelsOptions = {},
): Promise<ModelRecord[]> {
  const snapshot = await loadSnapshot();
  const filtered = filterModels(snapshot.models, options.filter);
  const sorted = sortModels(filtered, options.sortBy ?? 'speed');
  if (!options.limit) {
    return sorted;
  }

  return sorted.slice(0, Math.max(1, options.limit));
}

export async function pickModels(
  options: PickModelsOptions = {},
): Promise<PickedModel[]> {
  const snapshot = await loadSnapshot();
  return pickModelsFromRecords(snapshot.models, options);
}

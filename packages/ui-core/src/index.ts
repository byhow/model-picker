import type { ModelRecord } from '@model-picker/domain';
import {
  createEffect,
  createMemo,
  createSignal,
  type Accessor,
} from 'solid-js';

export type QuickFilter =
  | 'all'
  | 'fast'
  | 'budget'
  | 'long-context'
  | 'vision'
  | 'code';

export type SortBy = 'speed' | 'price' | 'context' | 'name';

export const SORT_ORDER: SortBy[] = ['speed', 'price', 'context', 'name'];
export const QUICK_FILTERS: QuickFilter[] = [
  'all',
  'fast',
  'budget',
  'long-context',
  'vision',
  'code',
];

export const QUICK_FILTER_QUERY: Record<QuickFilter, string | undefined> = {
  all: undefined,
  fast: 'fast',
  budget: 'budget',
  'long-context': 'long-context',
  vision: 'vision',
  code: 'code',
};

export interface CreateModelBrowserStateOptions {
  initialSortBy?: SortBy;
  initialQuickFilter?: QuickFilter;
  initialSearchQuery?: string;
  maxCompareItems?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function cycleIndex(index: number, step: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  const next = (index + step) % length;
  return next < 0 ? next + length : next;
}

function matchesSearch(model: ModelRecord, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

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

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function matchesQuickFilter(model: ModelRecord, quickFilter: QuickFilter): boolean {
  switch (quickFilter) {
    case 'all':
      return true;
    case 'fast':
      return (model.speed.bestThroughput ?? 0) >= 50;
    case 'budget':
      return model.pricing.outputPerMillion <= 2;
    case 'long-context':
      return model.contextLength >= 100_000;
    case 'vision':
      return model.architecture.inputModalities.some(
        (modality) => modality.toLowerCase() === 'image',
      );
    case 'code': {
      const haystack = `${model.id} ${model.description} ${model.architecture.modality}`.toLowerCase();
      return haystack.includes('code') || haystack.includes('program');
    }
    default:
      return true;
  }
}

function sortModelRecords(models: ModelRecord[], sortBy: SortBy): ModelRecord[] {
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
        (a, b) => (b.speed.bestThroughput ?? 0) - (a.speed.bestThroughput ?? 0),
      );
      break;
  }

  return sorted;
}

function resolveModelsAccessor(
  models: Accessor<ModelRecord[]> | ModelRecord[],
): Accessor<ModelRecord[]> {
  if (typeof models === 'function') {
    return models as Accessor<ModelRecord[]>;
  }

  return () => models;
}

export function toOpenRouterUrl(modelId: string): string {
  return `https://openrouter.ai/${modelId}`;
}

export function createModelBrowserState(
  models: Accessor<ModelRecord[]> | ModelRecord[],
  options: CreateModelBrowserStateOptions = {},
) {
  const getModels = resolveModelsAccessor(models);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [sortBy, setSortBy] = createSignal<SortBy>(
    options.initialSortBy ?? 'speed',
  );
  const [quickFilter, setQuickFilter] = createSignal<QuickFilter>(
    options.initialQuickFilter ?? 'all',
  );
  const [searchQuery, setSearchQueryState] = createSignal(
    options.initialSearchQuery ?? '',
  );
  const [compareIds, setCompareIds] = createSignal<string[]>([]);
  const [compareCursor, setCompareCursor] = createSignal(0);
  const maxCompareItems = Math.max(1, options.maxCompareItems ?? 6);

  const visibleModels = createMemo(() => {
    const filteredByQuickFilter = getModels().filter((model) =>
      matchesQuickFilter(model, quickFilter()),
    );
    const filtered = filteredByQuickFilter.filter((model) =>
      matchesSearch(model, searchQuery()),
    );
    return sortModelRecords(filtered, sortBy());
  });

  createEffect(() => {
    const maxIndex = Math.max(0, visibleModels().length - 1);
    setSelectedIndex((index) => clamp(index, 0, maxIndex));
  });

  const selectedModel = createMemo(() => {
    const modelsList = visibleModels();
    if (modelsList.length === 0) {
      return null;
    }

    return modelsList[selectedIndex()] ?? null;
  });

  const comparedModels = createMemo(() => {
    if (compareIds().length === 0) {
      return [] as ModelRecord[];
    }

    const byId = new Map(getModels().map((model) => [model.id, model]));
    return compareIds()
      .map((id) => byId.get(id))
      .filter((model): model is ModelRecord => Boolean(model));
  });

  const activeCompareIndex = createMemo(() => {
    const length = comparedModels().length;
    if (length === 0) {
      return -1;
    }

    return clamp(compareCursor(), 0, length - 1);
  });

  const activeCompareModel = createMemo(() => {
    const index = activeCompareIndex();
    if (index < 0) {
      return null;
    }

    return comparedModels()[index] ?? null;
  });

  function updateCompareState(nextIds: string[], preferredCursor?: number): void {
    setCompareIds(nextIds);

    if (nextIds.length === 0) {
      setCompareCursor(0);
      return;
    }

    if (preferredCursor !== undefined) {
      setCompareCursor(clamp(preferredCursor, 0, nextIds.length - 1));
      return;
    }

    setCompareCursor((cursor) => clamp(cursor, 0, nextIds.length - 1));
  }

  function setSearchQuery(query: string): void {
    setSearchQueryState(query);
    setSelectedIndex(0);
  }

  function cycleSort(step = 1): void {
    const current = SORT_ORDER.indexOf(sortBy());
    const next = cycleIndex(current, step, SORT_ORDER.length);
    setSortBy(SORT_ORDER[next] ?? 'speed');
    setSelectedIndex(0);
  }

  function cycleQuickFilter(step = 1): void {
    const current = QUICK_FILTERS.indexOf(quickFilter());
    const next = cycleIndex(current, step, QUICK_FILTERS.length);
    setQuickFilter(QUICK_FILTERS[next] ?? 'all');
    setSelectedIndex(0);
  }

  function moveSelection(delta: number): void {
    const maxIndex = Math.max(0, visibleModels().length - 1);
    setSelectedIndex((index) => clamp(index + delta, 0, maxIndex));
  }

  function selectFirst(): void {
    setSelectedIndex(0);
  }

  function selectLast(): void {
    setSelectedIndex(Math.max(0, visibleModels().length - 1));
  }

  function jumpToModelId(id: string): boolean {
    const index = visibleModels().findIndex((model) => model.id === id);
    if (index < 0) {
      return false;
    }

    setSelectedIndex(index);
    return true;
  }

  function toggleCompare(id?: string): void {
    const candidateId = id ?? selectedModel()?.id;
    if (!candidateId) {
      return;
    }

    const current = compareIds();
    if (current.includes(candidateId)) {
      const next = current.filter((item) => item !== candidateId);
      updateCompareState(next);
      return;
    }

    const next = [...current, candidateId].slice(-maxCompareItems);
    const cursor = next.findIndex((item) => item === candidateId);
    updateCompareState(next, cursor >= 0 ? cursor : undefined);
  }

  function removeCompare(id: string): void {
    const next = compareIds().filter((item) => item !== id);
    updateCompareState(next);
  }

  function clearCompare(): void {
    updateCompareState([]);
  }

  function cycleCompare(step = 1): void {
    const length = comparedModels().length;
    if (length === 0) {
      return;
    }

    setCompareCursor((cursor) => cycleIndex(cursor, step, length));
  }

  function jumpToActiveCompare(): boolean {
    const model = activeCompareModel();
    if (!model) {
      return false;
    }

    return jumpToModelId(model.id);
  }

  return {
    sortBy,
    setSortBy,
    cycleSort,
    quickFilter,
    setQuickFilter,
    cycleQuickFilter,
    searchQuery,
    setSearchQuery,
    selectedIndex,
    selectedModel,
    visibleModels,
    moveSelection,
    selectFirst,
    selectLast,
    jumpToModelId,
    compareIds,
    comparedModels,
    activeCompareIndex,
    activeCompareModel,
    toggleCompare,
    removeCompare,
    clearCompare,
    cycleCompare,
    jumpToActiveCompare,
  };
}

export type ModelBrowserState = ReturnType<typeof createModelBrowserState>;

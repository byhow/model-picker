import type { ModelRecord } from '@model-picker/domain';
import {
  QUICK_FILTERS,
  createModelBrowserState,
  toOpenRouterUrl,
} from '@model-picker/ui-core';
import { For, Show, createMemo } from 'solid-js';

interface ModelExplorerProps {
  models: ModelRecord[];
}

const QUICK_FILTER_LABELS: Record<(typeof QUICK_FILTERS)[number], string> = {
  all: 'All',
  fast: 'Fast',
  budget: 'Budget',
  'long-context': 'Long Context',
  vision: 'Vision',
  code: 'Code',
};

function formatPrice(price: number): string {
  if (price === 0) {
    return 'Free';
  }

  return `$${price.toFixed(2)}`;
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }

  return `${Math.round(tokens / 1_000)}K`;
}

function formatSpeed(tokensPerSecond: number | null): string {
  if (!tokensPerSecond) {
    return 'N/A';
  }

  return `${tokensPerSecond.toFixed(0)} tok/s`;
}

export default function ModelExplorer(props: ModelExplorerProps) {
  const browser = createModelBrowserState(() => props.models, {
    maxCompareItems: 6,
  });

  const activeCompareId = createMemo(() => browser.activeCompareModel()?.id ?? null);

  return (
    <section class="space-y-6">
      <div class="bg-white rounded-lg shadow p-4 space-y-4">
        <div class="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search by id, provider, or modality"
            value={browser.searchQuery()}
            onInput={(event) => browser.setSearchQuery(event.currentTarget.value)}
            class="w-full md:flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
          />

          <select
            value={browser.sortBy()}
            onChange={(event) => browser.setSortBy(event.currentTarget.value as 'speed' | 'price' | 'context' | 'name')}
            class="w-full md:w-56 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="speed">Sort: Speed</option>
            <option value="price">Sort: Price</option>
            <option value="context">Sort: Context</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <For each={QUICK_FILTERS}>
            {(filter) => (
              <button
                type="button"
                onClick={() => browser.setQuickFilter(filter)}
                class={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  browser.quickFilter() === filter
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {QUICK_FILTER_LABELS[filter]}
              </button>
            )}
          </For>
          <span class="ml-auto text-sm text-gray-500">
            Showing {browser.visibleModels().length} models
          </span>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Speed</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Output Price</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Context</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={browser.visibleModels()}>
                {(model) => {
                  const isSelected = createMemo(() => browser.selectedModel()?.id === model.id);
                  const isCompared = createMemo(() => browser.compareIds().includes(model.id));

                  return (
                    <tr
                      class={`transition-colors ${isSelected() ? 'bg-cyan-50' : 'hover:bg-gray-50'}`}
                      onClick={() => browser.jumpToModelId(model.id)}
                    >
                      <td class="px-4 py-3">
                        <p class="text-sm font-semibold text-gray-900">{model.name}</p>
                        <p class="text-xs text-gray-500">{model.id}</p>
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-700">{formatSpeed(model.speed.bestThroughput)}</td>
                      <td class="px-4 py-3 text-sm text-gray-700">{formatPrice(model.pricing.outputPerMillion)}/M</td>
                      <td class="px-4 py-3 text-sm text-gray-700">{formatContext(model.contextLength)}</td>
                      <td class="px-4 py-3">
                        <div class="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              browser.toggleCompare(model.id);
                            }}
                            class={`text-xs px-2 py-1 rounded border ${
                              isCompared()
                                ? 'bg-yellow-100 text-yellow-900 border-yellow-300'
                                : 'bg-white text-gray-700 border-gray-300'
                            }`}
                          >
                            {isCompared() ? 'Compared' : 'Compare'}
                          </button>

                          <a
                            href={toOpenRouterUrl(model.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-xs px-2 py-1 rounded border border-gray-300 bg-white text-gray-700"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-lg shadow p-4">
          <h3 class="text-sm font-semibold uppercase text-gray-500 mb-3">Selected Model</h3>
          <Show when={browser.selectedModel()} fallback={<p class="text-sm text-gray-500">No model selected.</p>}>
            {(model) => (
              <div class="space-y-2">
                <p class="text-lg font-semibold text-gray-900">{model().name}</p>
                <p class="text-sm text-gray-500">{model().id}</p>
                <p class="text-sm text-gray-700">{model().description}</p>
                <p class="text-sm text-gray-700">Speed: {formatSpeed(model().speed.bestThroughput)}</p>
                <p class="text-sm text-gray-700">Output: {formatPrice(model().pricing.outputPerMillion)}/M</p>
                <p class="text-sm text-gray-700">Context: {model().contextLength.toLocaleString()} tokens</p>
              </div>
            )}
          </Show>
        </div>

        <div class="bg-white rounded-lg shadow p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold uppercase text-gray-500">Compare Queue</h3>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => browser.cycleCompare(-1)}
                class="text-xs px-2 py-1 rounded border border-gray-300"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => browser.cycleCompare(1)}
                class="text-xs px-2 py-1 rounded border border-gray-300"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => browser.jumpToActiveCompare()}
                class="text-xs px-2 py-1 rounded border border-gray-300"
              >
                Jump
              </button>
            </div>
          </div>

          <Show
            when={browser.comparedModels().length > 0}
            fallback={<p class="text-sm text-gray-500">No compared models yet.</p>}
          >
            <ul class="space-y-2">
              <For each={browser.comparedModels()}>
                {(model) => (
                  <li
                    class={`flex items-center justify-between rounded border px-3 py-2 ${
                      activeCompareId() === model.id
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => browser.jumpToModelId(model.id)}
                      class="text-left text-sm text-gray-800"
                    >
                      {model.id}
                    </button>
                    <button
                      type="button"
                      onClick={() => browser.removeCompare(model.id)}
                      class="text-xs text-red-600"
                    >
                      Remove
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </section>
  );
}

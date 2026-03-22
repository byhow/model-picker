const OPENROUTER_FRONTEND_MODELS_URL = 'https://openrouter.ai/api/frontend/models/find';
const OPENROUTER_FRONTEND_ENDPOINT_STATS_URL =
  'https://openrouter.ai/api/frontend/stats/endpoint';

export interface OpenRouterFrontendQueryOptions {
  order?: string;
  q?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  categories?: string[];
  maxPrice?: number;
  zdr?: boolean;
  fmt?: 'cards';
}

export interface OpenRouterFrontendEndpoint {
  context_length: number;
  max_completion_tokens: number | null;
  moderation_required: boolean;
  pricing: {
    prompt?: string;
    completion?: string;
    image?: string;
    request?: string;
  };
  provider_name?: string;
  provider_slug?: string;
  data_policy?: {
    retainsPrompts?: boolean;
  } | null;
}

export interface OpenRouterFrontendModel {
  slug: string;
  permaslug: string;
  name: string;
  description: string;
  created_at?: string;
  context_length: number;
  input_modalities?: string[] | null;
  output_modalities?: string[] | null;
  endpoint?: OpenRouterFrontendEndpoint | null;
}

export interface OpenRouterFrontendCategoryEntry {
  category: string;
  rank: number;
}

export interface OpenRouterFrontendModelsData {
  models: OpenRouterFrontendModel[];
  analytics: Record<string, unknown>;
  categories: Record<string, OpenRouterFrontendCategoryEntry[]>;
}

interface OpenRouterFrontendModelsResponse {
  data?: OpenRouterFrontendModelsData;
}

export interface OpenRouterFrontendEndpointStats {
  request_count?: number | null;
  window_minutes?: number | null;
  p50_throughput?: number | null;
  p75_throughput?: number | null;
  p90_throughput?: number | null;
  p95_throughput?: number | null;
  p99_throughput?: number | null;
  p50_latency?: number | null;
  p75_latency?: number | null;
  p90_latency?: number | null;
  p95_latency?: number | null;
  p99_latency?: number | null;
}

export interface OpenRouterFrontendStatsEntry {
  provider_name: string;
  provider_slug?: string;
  stats?: OpenRouterFrontendEndpointStats | null;
}

interface OpenRouterFrontendEndpointStatsResponse {
  data?: OpenRouterFrontendStatsEntry[];
}

function requestHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; model-picker/0.1)',
  };
}

function appendJoined(
  params: URLSearchParams,
  name: string,
  values: string[] | undefined,
): void {
  if (!values || values.length === 0) {
    return;
  }

  params.set(name, values.join(','));
}

export function buildOpenRouterFrontendModelsUrl(
  options: OpenRouterFrontendQueryOptions = {},
): string {
  const url = new URL(OPENROUTER_FRONTEND_MODELS_URL);
  const params = url.searchParams;

  params.set('fmt', options.fmt ?? 'cards');
  params.set('order', options.order ?? 'most-popular');
  appendJoined(params, 'categories', options.categories);
  appendJoined(params, 'input_modalities', options.inputModalities);
  appendJoined(params, 'output_modalities', options.outputModalities);
  if (typeof options.maxPrice === 'number' && Number.isFinite(options.maxPrice)) {
    params.set('max_price', `${options.maxPrice}`);
  }
  if (options.q?.trim()) {
    params.set('q', options.q.trim());
  }
  if (options.zdr) {
    params.set('zdr', 'true');
  }

  return url.toString();
}

export function buildOpenRouterEndpointStatsUrl(
  permaslug: string,
  variant = 'standard',
): string {
  const url = new URL(OPENROUTER_FRONTEND_ENDPOINT_STATS_URL);
  url.searchParams.set('permaslug', permaslug);
  url.searchParams.set('variant', variant);
  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: requestHeaders() });
  if (!response.ok) {
    throw new Error(`OpenRouter frontend request failed: ${response.status} ${url}`);
  }

  return (await response.json()) as T;
}

export async function fetchOpenRouterFrontendModels(
  options: OpenRouterFrontendQueryOptions = {},
): Promise<OpenRouterFrontendModelsData> {
  const payload = await fetchJson<OpenRouterFrontendModelsResponse>(
    buildOpenRouterFrontendModelsUrl(options),
  );

  return payload.data ?? {
    models: [],
    analytics: {},
    categories: {},
  };
}

export async function fetchOpenRouterEndpointStats(
  permaslug: string,
  variant = 'standard',
): Promise<OpenRouterFrontendStatsEntry[]> {
  const payload = await fetchJson<OpenRouterFrontendEndpointStatsResponse>(
    buildOpenRouterEndpointStatsUrl(permaslug, variant),
  );

  return payload.data ?? [];
}

function titleCaseSegment(segment: string): string {
  return segment
    .split('-')
    .map((part) => (part ? `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}` : part))
    .join('-');
}

function formatCategoryLabel(category: string): string {
  return category
    .split('/')
    .map((segment) => titleCaseSegment(segment))
    .join('/');
}

export function extractOpenRouterCategoryLabels(
  entries: OpenRouterFrontendCategoryEntry[] | undefined,
): string[] {
  if (!entries || entries.length === 0) {
    return [];
  }

  const unique = new Map<string, number>();
  for (const entry of entries) {
    const category = entry.category?.trim();
    if (!category) {
      continue;
    }

    const label = formatCategoryLabel(category);
    const previousRank = unique.get(label);
    if (previousRank === undefined || entry.rank < previousRank) {
      unique.set(label, entry.rank);
    }
  }

  return [...unique.entries()]
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .map(([label]) => label);
}

import { readFile } from 'node:fs/promises';
import Firecrawl from '@mendable/firecrawl-js';
import {
  buildOpenRouterFrontendModelsUrl,
  extractOpenRouterCategoryLabels,
  fetchOpenRouterFrontendModels,
  type ModelRecord,
  type OpenRouterFrontendModel,
  type OpenRouterModel,
} from '@model-picker/domain';
import {
  describeFirecrawlCredentialSource,
  resolveFirecrawlApiKey,
} from './user-config';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/models';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

const OPENROUTER_API_FIXTURE = 'MODEL_PICKER_OPENROUTER_API_FIXTURE';
const OPENROUTER_FRONTEND_MODELS_FIXTURE = 'MODEL_PICKER_OPENROUTER_FRONTEND_MODELS_FIXTURE';
const OPENROUTER_MODELS_FIXTURE = 'MODEL_PICKER_OPENROUTER_MODELS_FIXTURE';
const OPENROUTER_SEARCH_FIXTURE = 'MODEL_PICKER_OPENROUTER_SEARCH_FIXTURE';
const OPENROUTER_MODEL_FIXTURE = 'MODEL_PICKER_OPENROUTER_MODEL_FIXTURE';
const OPENROUTER_MODEL_DELAY_MS = 'MODEL_PICKER_OPENROUTER_MODEL_DELAY_MS';
const OPENROUTER_DISABLE_FRONTEND = 'MODEL_PICKER_DISABLE_OPENROUTER_FRONTEND';

export const MISSING_FIRECRAWL_CREDENTIALS_ERROR =
  'OpenRouter frontend data is unavailable and Firecrawl fallback is not configured. Set FIRECRAWL_API_KEY or run `model-picker onboard`.';

export const OPENROUTER_ORDERS = ['most-popular', 'top-weekly', 'newest'] as const;

export type OpenRouterOrder = (typeof OPENROUTER_ORDERS)[number];

interface OpenRouterApiModel extends OpenRouterModel {
  created?: number;
}

interface OpenRouterApiResponse {
  data: OpenRouterApiModel[];
}

export interface OpenRouterQueryOptions {
  order?: OpenRouterOrder;
  q?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  categories?: string[];
  maxPrice?: number;
  zdr?: boolean;
  limit?: number;
}

export interface OpenRouterLiveResult {
  sourceUrl: string;
  matchedCount: number | null;
  models: ModelRecord[];
}

export interface OpenRouterLiveModel {
  sourceUrl: string;
  model: ModelRecord;
  createdAt: string | null;
  categories: string[];
}

let apiModelsPromise: Promise<OpenRouterApiModel[]> | null = null;

function parsePricePerMillion(value: string | undefined): number {
  const numeric = Number.parseFloat(value ?? '0');
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return numeric * 1_000_000;
}

function normalizeModalities(value: string[] | null | undefined): string[] {
  return value && value.length > 0 ? value : ['text'];
}

function inferModality(inputModalities: string[], outputModalities: string[]): string {
  return `${inputModalities.join('+')}->${outputModalities.join('+')}`;
}

function toApiModelRecord(model: OpenRouterApiModel): ModelRecord {
  const topProviderContextLength = model.top_provider.context_length ?? model.context_length;

  return {
    id: model.id,
    name: model.name,
    description: model.description,
    contextLength: model.context_length,
    pricing: {
      inputPerMillion: parsePricePerMillion(model.pricing.prompt),
      outputPerMillion: parsePricePerMillion(model.pricing.completion),
    },
    topProvider: {
      contextLength: topProviderContextLength,
      maxCompletionTokens: model.top_provider.max_completion_tokens,
      isModerated: model.top_provider.is_moderated,
    },
    architecture: {
      modality: model.architecture.modality,
      inputModalities: model.architecture.input_modalities,
      outputModalities: model.architecture.output_modalities,
    },
    speed: {
      providers: [],
      bestThroughput: null,
      avgThroughput: null,
    },
    rank: {
      bySpeed: 0,
      byPrice: 0,
      byContext: 0,
    },
  };
}

function toFrontendModelRecord(model: OpenRouterFrontendModel): ModelRecord {
  const inputModalities = normalizeModalities(model.input_modalities);
  const outputModalities = normalizeModalities(model.output_modalities);
  const topProviderContextLength = model.endpoint?.context_length ?? model.context_length;

  return {
    id: model.slug,
    name: model.name,
    description: model.description,
    contextLength: model.context_length,
    pricing: {
      inputPerMillion: parsePricePerMillion(model.endpoint?.pricing.prompt),
      outputPerMillion: parsePricePerMillion(model.endpoint?.pricing.completion),
    },
    topProvider: {
      contextLength: topProviderContextLength,
      maxCompletionTokens: model.endpoint?.max_completion_tokens ?? null,
      isModerated: model.endpoint?.moderation_required ?? false,
    },
    architecture: {
      modality: inferModality(inputModalities, outputModalities),
      inputModalities,
      outputModalities,
    },
    speed: {
      providers: [],
      bestThroughput: null,
      avgThroughput: null,
    },
    rank: {
      bySpeed: 0,
      byPrice: 0,
      byContext: 0,
    },
  };
}

function loadFixturePath(envName: string): string | null {
  const value = process.env[envName]?.trim();
  return value ? value : null;
}

function loadDelayMs(envName: string): number {
  const value = process.env[envName]?.trim();
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function frontendDisabled(): boolean {
  return process.env[OPENROUTER_DISABLE_FRONTEND] === '1';
}

function hasFixtureAccess(): boolean {
  return Boolean(
    loadFixturePath(OPENROUTER_FRONTEND_MODELS_FIXTURE) ||
      loadFixturePath(OPENROUTER_MODELS_FIXTURE) ||
      loadFixturePath(OPENROUTER_SEARCH_FIXTURE) ||
      loadFixturePath(OPENROUTER_MODEL_FIXTURE),
  );
}

async function accessMode(): Promise<'fixtures' | 'frontend-api' | 'env' | 'config' | 'missing'> {
  if (hasFixtureAccess()) {
    return 'fixtures';
  }

  if (!frontendDisabled()) {
    return 'frontend-api';
  }

  return describeFirecrawlCredentialSource();
}

export async function describeOpenRouterFirecrawlFallbackMode(): Promise<string> {
  const source = await describeFirecrawlCredentialSource();
  switch (source) {
    case 'env':
      return 'FIRECRAWL_API_KEY';
    case 'config':
      return 'config file';
    case 'missing':
    default:
      return 'missing';
  }
}

export async function describeOpenRouterAccessMode(): Promise<string> {
  if (
    loadFixturePath(OPENROUTER_FRONTEND_MODELS_FIXTURE) ||
    loadFixturePath(OPENROUTER_MODELS_FIXTURE) ||
    loadFixturePath(OPENROUTER_SEARCH_FIXTURE)
  ) {
    return 'fixtures';
  }

  const mode = await accessMode();
  switch (mode) {
    case 'fixtures':
      return 'fixtures';
    case 'frontend-api':
      return 'frontend api';
    case 'env':
      return 'firecrawl (FIRECRAWL_API_KEY)';
    case 'config':
      return 'firecrawl (config file)';
    case 'missing':
    default:
      return 'missing';
  }
}

export function isMissingFirecrawlCredentialsError(error: unknown): boolean {
  return error instanceof Error && error.message === MISSING_FIRECRAWL_CREDENTIALS_ERROR;
}

async function getFirecrawlClient(): Promise<Firecrawl> {
  const apiKey = await resolveFirecrawlApiKey();
  if (!apiKey) {
    throw new Error(MISSING_FIRECRAWL_CREDENTIALS_ERROR);
  }

  return new Firecrawl({ apiKey });
}

async function scrapeMarkdown(url: string): Promise<string> {
  const firecrawl = await getFirecrawlClient();
  const document = await firecrawl.scrape(url, {
    formats: ['markdown'],
    onlyMainContent: true,
  });

  if (!document.markdown?.trim()) {
    throw new Error(`Firecrawl returned no markdown for ${url}`);
  }

  return document.markdown;
}

function buildCardsFixturePath(options: OpenRouterQueryOptions): string | null {
  if (options.q?.trim()) {
    return loadFixturePath(OPENROUTER_SEARCH_FIXTURE);
  }

  return loadFixturePath(OPENROUTER_MODELS_FIXTURE);
}

async function loadCardsMarkdown(options: OpenRouterQueryOptions): Promise<string> {
  const fixture = buildCardsFixturePath(options);
  if (fixture) {
    return readFile(fixture, 'utf8');
  }

  return scrapeMarkdown(buildOpenRouterModelsUrl(options));
}

async function loadModelMarkdown(modelId: string): Promise<string | null> {
  await sleep(loadDelayMs(OPENROUTER_MODEL_DELAY_MS));

  const fixture = loadFixturePath(OPENROUTER_MODEL_FIXTURE);
  if (fixture) {
    return readFile(fixture, 'utf8');
  }

  if ((await accessMode()) === 'missing') {
    return null;
  }

  return scrapeMarkdown(buildOpenRouterModelUrl(modelId));
}

async function fetchApiModels(): Promise<OpenRouterApiModel[]> {
  const fixture = loadFixturePath(OPENROUTER_API_FIXTURE);
  if (fixture) {
    const response = JSON.parse(await readFile(fixture, 'utf8')) as OpenRouterApiResponse;
    return response.data ?? [];
  }

  if (!apiModelsPromise) {
    apiModelsPromise = (async () => {
      const response = await fetch(OPENROUTER_API_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch OpenRouter models API: ${response.status}`);
      }

      const payload = (await response.json()) as OpenRouterApiResponse;
      return payload.data ?? [];
    })();
  }

  return apiModelsPromise;
}

function normalizeQueryValue(value: string): string {
  return value.trim().toLowerCase();
}

function filterFixtureFrontendModels(
  models: OpenRouterFrontendModel[],
  categoriesByPermaslug: Record<string, { category: string }[]>,
  options: OpenRouterQueryOptions,
): OpenRouterFrontendModel[] {
  let filtered = [...models];

  if (options.q?.trim()) {
    const query = normalizeQueryValue(options.q);
    filtered = filtered.filter((model) => {
      return [model.slug, model.name, model.description]
        .filter(Boolean)
        .some((value) => normalizeQueryValue(String(value)).includes(query));
    });
  }

  if (options.inputModalities?.length) {
    filtered = filtered.filter((model) => {
      const inputModalities = normalizeModalities(model.input_modalities);
      return options.inputModalities?.every((modality) => inputModalities.includes(modality)) ?? true;
    });
  }

  if (options.outputModalities?.length) {
    filtered = filtered.filter((model) => {
      const outputModalities = normalizeModalities(model.output_modalities);
      return options.outputModalities?.every((modality) => outputModalities.includes(modality)) ?? true;
    });
  }

  if (options.categories?.length) {
    const requiredCategories = new Set(options.categories.map((category) => category.toLowerCase()));
    filtered = filtered.filter((model) => {
      const categories = categoriesByPermaslug[model.permaslug] ?? [];
      return categories.some((entry) => requiredCategories.has(entry.category.toLowerCase()));
    });
  }

  if (typeof options.maxPrice === 'number' && Number.isFinite(options.maxPrice)) {
    filtered = filtered.filter((model) => {
      const inputPrice = parsePricePerMillion(model.endpoint?.pricing.prompt);
      return inputPrice <= options.maxPrice!;
    });
  }

  if (options.zdr) {
    filtered = filtered.filter(
      (model) => model.endpoint?.data_policy?.retainsPrompts === false,
    );
  }

  if (options.order === 'newest') {
    filtered.sort((left, right) => {
      const leftCreatedAt = Date.parse(left.created_at ?? '1970-01-01T00:00:00.000Z');
      const rightCreatedAt = Date.parse(right.created_at ?? '1970-01-01T00:00:00.000Z');
      return rightCreatedAt - leftCreatedAt;
    });
  }

  return filtered;
}

async function loadFrontendModelsData(
  options: OpenRouterQueryOptions = {},
): Promise<{
  models: OpenRouterFrontendModel[];
  categories: Record<string, { category: string; rank: number }[]>;
}> {
  const fixture = loadFixturePath(OPENROUTER_FRONTEND_MODELS_FIXTURE);
  if (fixture) {
    const response = JSON.parse(await readFile(fixture, 'utf8')) as {
      data?: {
        models?: OpenRouterFrontendModel[];
        categories?: Record<string, { category: string; rank: number }[]>;
      };
    };

    const models = response.data?.models ?? [];
    const categories = response.data?.categories ?? {};
    return {
      models: filterFixtureFrontendModels(models, categories, options),
      categories,
    };
  }

  const data = await fetchOpenRouterFrontendModels({
    ...options,
    fmt: 'cards',
  });

  return {
    models: data.models,
    categories: data.categories,
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

export function buildOpenRouterModelsUrl(options: OpenRouterQueryOptions = {}): string {
  const url = new URL(OPENROUTER_MODELS_URL);
  const params = url.searchParams;

  appendJoined(params, 'categories', options.categories);
  params.set('fmt', 'cards');
  appendJoined(params, 'input_modalities', options.inputModalities);
  if (typeof options.maxPrice === 'number' && Number.isFinite(options.maxPrice)) {
    params.set('max_price', `${options.maxPrice}`);
  }
  params.set('order', options.order ?? 'most-popular');
  appendJoined(params, 'output_modalities', options.outputModalities);
  if (options.q?.trim()) {
    params.set('q', options.q.trim());
  }
  if (options.zdr) {
    params.set('zdr', 'true');
  }

  return url.toString();
}

export function buildOpenRouterModelUrl(modelId: string): string {
  return `https://openrouter.ai/${modelId}`;
}

export function normalizeCsvList(value: string | string[] | undefined): string[] {
  const inputs = Array.isArray(value) ? value : [value];
  const unique = new Set<string>();

  for (const input of inputs) {
    if (typeof input !== 'string' || !input.trim()) {
      continue;
    }

    for (const item of input.split(',')) {
      const normalized = item.trim().toLowerCase();
      if (normalized) {
        unique.add(normalized);
      }
    }
  }

  return [...unique];
}

export function extractOrderedModelIds(
  markdown: string,
  validIds: Set<string>,
): string[] {
  const pattern = /https:\/\/openrouter\.ai\/([A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+)/g;
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const match of markdown.matchAll(pattern)) {
    const modelId = match[1];
    if (!modelId || !validIds.has(modelId) || seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    ordered.push(modelId);
  }

  return ordered;
}

export function extractMatchedModelCount(markdown: string): number | null {
  const match = markdown.match(/\b([\d,]+)\s+models\b/i);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1].replaceAll(',', ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractCategoryLabels(markdown: string): string[] {
  const prefix = markdown.split(/\nStandard\b/)[0] ?? markdown;
  const labels = new Set<string>();
  const pattern = /^([A-Z][A-Za-z0-9 &'/.+-]+) \(#\d+\)$/gm;

  for (const match of prefix.matchAll(pattern)) {
    const label = match[1]?.trim();
    if (label) {
      labels.add(label);
    }
  }

  return [...labels];
}

function createdAtLabel(created?: number | string): string | null {
  if (!created) {
    return null;
  }

  if (typeof created === 'string') {
    const parsed = Date.parse(created);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  if (!Number.isFinite(created)) {
    return null;
  }

  return new Date(created * 1000).toISOString();
}

async function queryOpenRouterModelsViaFirecrawl(
  options: OpenRouterQueryOptions = {},
): Promise<OpenRouterLiveResult> {
  const [markdown, apiModels] = await Promise.all([
    loadCardsMarkdown(options),
    fetchApiModels(),
  ]);

  const validIds = new Set(apiModels.map((model) => model.id));
  const orderedIds = extractOrderedModelIds(markdown, validIds);
  const apiById = new Map(apiModels.map((model) => [model.id, model]));
  const models = orderedIds
    .map((id) => apiById.get(id))
    .filter((model): model is OpenRouterApiModel => Boolean(model))
    .map(toApiModelRecord);

  const limit = options.limit ?? models.length;

  return {
    sourceUrl: buildOpenRouterModelsUrl(options),
    matchedCount: extractMatchedModelCount(markdown),
    models: models.slice(0, Math.max(1, limit)),
  };
}

async function getOpenRouterModelViaFirecrawl(
  idOrName: string,
): Promise<OpenRouterLiveModel | null> {
  const apiModels = await fetchApiModels();
  const target = idOrName.toLowerCase();
  const matched =
    apiModels.find((model) => model.id.toLowerCase() === target) ||
    apiModels.find((model) => model.name.toLowerCase() === target);

  if (!matched) {
    return null;
  }

  const markdown = await loadModelMarkdown(matched.id);

  return {
    sourceUrl: buildOpenRouterModelUrl(matched.id),
    model: toApiModelRecord(matched),
    createdAt: createdAtLabel(matched.created),
    categories: markdown ? extractCategoryLabels(markdown) : [],
  };
}

export async function queryOpenRouterModels(
  options: OpenRouterQueryOptions = {},
): Promise<OpenRouterLiveResult> {
  if (!frontendDisabled()) {
    try {
      const data = await loadFrontendModelsData(options);
      const models = data.models.map(toFrontendModelRecord);
      const limit = options.limit ?? models.length;

      return {
        sourceUrl: buildOpenRouterModelsUrl(options),
        matchedCount: data.models.length,
        models: models.slice(0, Math.max(1, limit)),
      };
    } catch {
      // Fall through to the legacy Firecrawl path below.
    }
  }

  return queryOpenRouterModelsViaFirecrawl(options);
}

export async function getOpenRouterModel(
  idOrName: string,
): Promise<OpenRouterLiveModel | null> {
  await sleep(loadDelayMs(OPENROUTER_MODEL_DELAY_MS));

  if (!frontendDisabled()) {
    try {
      const data = await loadFrontendModelsData({ q: idOrName });
      const target = idOrName.toLowerCase();
      const matched =
        data.models.find((model) => model.slug.toLowerCase() === target) ||
        data.models.find((model) => model.name.toLowerCase() === target);

      if (matched) {
        return {
          sourceUrl: buildOpenRouterModelUrl(matched.slug),
          model: toFrontendModelRecord(matched),
          createdAt: createdAtLabel(matched.created_at),
          categories: extractOpenRouterCategoryLabels(data.categories[matched.permaslug]),
        };
      }
    } catch {
      // Fall through to the legacy Firecrawl path below.
    }
  }

  return getOpenRouterModelViaFirecrawl(idOrName);
}

export function resetOpenRouterApiCache(): void {
  apiModelsPromise = null;
}

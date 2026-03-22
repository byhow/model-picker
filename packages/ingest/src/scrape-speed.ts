#!/usr/bin/env bun

import { $ } from 'bun';
import {
  fetchOpenRouterEndpointStats,
  fetchOpenRouterFrontendModels,
  resolveFirecrawlApiKey,
  type OpenRouterFrontendModel,
  type OpenRouterFrontendStatsEntry,
} from '@model-picker/domain';
import { buildSpeedMarkdownFromEndpointStats } from './openrouter-stats';
import { API_MODELS_FILE, FIRECRAWL_DIR, SPEED_MODELS_FILE } from './paths';
import {
  resolveSpeedEnrichmentSubset,
  selectModelsForSpeedEnrichment,
  type SpeedEnrichmentSubset,
} from './sync-subset';
import { hasParsedSpeedMetrics, parseSpeedData, type SpeedData } from './speed-parser';

interface SpeedDataFile {
  scrapedAt: string;
  count: number;
  models: SpeedData[];
}

type SpeedLoadSource = 'cache' | 'frontend-api' | 'firecrawl' | 'missing';

const OPENROUTER_FRONTEND_MODELS_FIXTURE = 'MODEL_PICKER_OPENROUTER_FRONTEND_MODELS_FIXTURE';
const OPENROUTER_FRONTEND_STATS_FIXTURE = 'MODEL_PICKER_OPENROUTER_FRONTEND_STATS_FIXTURE';

function speedOutputPath(modelId: string): string {
  return `${FIRECRAWL_DIR}/${modelId.replace(/\//g, '-')}.md`;
}

async function loadExistingSpeedData(): Promise<SpeedDataFile> {
  if (!(await Bun.file(SPEED_MODELS_FILE).exists())) {
    return {
      scrapedAt: new Date(0).toISOString(),
      count: 0,
      models: [],
    };
  }

  return (await Bun.file(SPEED_MODELS_FILE).json()) as SpeedDataFile;
}

function sortSpeedModels(models: SpeedData[], orderedIds: string[]): SpeedData[] {
  const order = new Map(orderedIds.map((id, index) => [id, index]));

  return [...models].sort((left, right) => {
    const leftIndex = order.get(left.modelId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.modelId) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.modelId.localeCompare(right.modelId);
  });
}

function hasBrokenSpeedCache(existing: SpeedDataFile): boolean {
  return existing.models.length > 0 && existing.models.every((model) => !hasParsedSpeedMetrics(model));
}

function loadFixturePath(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

async function loadFrontendModelMap(): Promise<Map<string, OpenRouterFrontendModel>> {
  const fixture = loadFixturePath(OPENROUTER_FRONTEND_MODELS_FIXTURE);
  if (fixture) {
    const response = JSON.parse(await Bun.file(fixture).text()) as {
      data?: { models?: OpenRouterFrontendModel[] };
    };

    return new Map((response.data?.models ?? []).map((model) => [model.slug, model]));
  }

  const data = await fetchOpenRouterFrontendModels({ fmt: 'cards' });
  return new Map(data.models.map((model) => [model.slug, model]));
}

async function loadFrontendStats(permaslug: string): Promise<OpenRouterFrontendStatsEntry[]> {
  const fixture = loadFixturePath(OPENROUTER_FRONTEND_STATS_FIXTURE);
  if (fixture) {
    const response = JSON.parse(await Bun.file(fixture).text()) as Record<string, OpenRouterFrontendStatsEntry[]>;
    return response[permaslug] ?? [];
  }

  return fetchOpenRouterEndpointStats(permaslug);
}

async function scrapeWithFirecrawl(url: string, outputFile: string): Promise<boolean> {
  const firecrawlApiKey = await resolveFirecrawlApiKey();
  if (!firecrawlApiKey) {
    return false;
  }

  Bun.env.FIRECRAWL_API_KEY = firecrawlApiKey;

  try {
    await $`firecrawl scrape ${url} --only-main-content -o ${outputFile}`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function loadModelPage(
  modelId: string,
  frontendModel: OpenRouterFrontendModel | null,
  forceRefresh = false,
): Promise<{ speed: SpeedData | null; fromCache: boolean; source: SpeedLoadSource }> {
  const outputFile = speedOutputPath(modelId);
  const url = `https://openrouter.ai/${modelId}`;

  if (!forceRefresh && (await Bun.file(outputFile).exists())) {
    const content = await Bun.file(outputFile).text();
    return {
      speed: parseSpeedData(content, modelId),
      fromCache: true,
      source: 'cache',
    };
  }

  if (frontendModel?.permaslug) {
    try {
      const stats = await loadFrontendStats(frontendModel.permaslug);
      const markdown = buildSpeedMarkdownFromEndpointStats(frontendModel.name, stats);
      if (markdown) {
        await Bun.write(outputFile, markdown);
        return {
          speed: parseSpeedData(markdown, modelId),
          fromCache: false,
          source: 'frontend-api',
        };
      }
    } catch {
      // Fall through to Firecrawl below.
    }
  }

  if (await scrapeWithFirecrawl(url, outputFile)) {
    const content = await Bun.file(outputFile).text();
    return {
      speed: parseSpeedData(content, modelId),
      fromCache: false,
      source: 'firecrawl',
    };
  }

  return {
    speed: null,
    fromCache: false,
    source: 'missing',
  };
}

function logSubsetSummary(
  subset: SpeedEnrichmentSubset,
  selectedModels: { id: string }[],
  totalModels: number,
  providers: string[],
): void {
  if (subset === 'full') {
    return;
  }

  console.log(
    `Subset: ${subset} (${selectedModels.length}/${totalModels} models across ${providers.length} providers: ${providers.join(', ')})`,
  );
}

async function scrapeSpeeds(): Promise<void> {
  const modelsData = (await Bun.file(API_MODELS_FILE).json()) as {
    models: { id: string }[];
  };
  const subset = resolveSpeedEnrichmentSubset();
  const selection = selectModelsForSpeedEnrichment(modelsData.models, subset);
  const frontendModels = await loadFrontendModelMap();
  const existing = await loadExistingSpeedData();
  const existingById = new Map(existing.models.map((model) => [model.modelId, model]));
  const shouldRescrapeAll = Bun.env.MP_SPEED_RESCRAPE_ALL === '1';
  const shouldRepairBrokenCache = !shouldRescrapeAll && hasBrokenSpeedCache(existing);
  const pendingModels = shouldRescrapeAll || shouldRepairBrokenCache
    ? selection.models
    : selection.models.filter((model) => !existingById.has(model.id));

  await $`mkdir -p ${FIRECRAWL_DIR}`;

  if (shouldRepairBrokenCache) {
    console.log(
      `Detected a stale speed cache with parsed metrics for 0/${existing.models.length} models. Reparsing cached markdown...`,
    );
  }

  if (!shouldRescrapeAll && existing.models.length > 0) {
    console.log(
      `Reusing ${existing.models.length} cached speed entries, processing ${pendingModels.length} missing or stale models...`,
    );
  }

  logSubsetSummary(subset, selection.models, modelsData.models.length, selection.providers);

  const sourceCounts: Record<SpeedLoadSource, number> = {
    cache: 0,
    'frontend-api': 0,
    firecrawl: 0,
    missing: 0,
  };

  for (const [index, model] of pendingModels.entries()) {
    console.log(`[${index + 1}/${pendingModels.length}] ${model.id}`);

    const frontendModel = frontendModels.get(model.id) ?? null;
    const { speed, fromCache, source } = await loadModelPage(
      model.id,
      frontendModel,
      shouldRescrapeAll,
    );
    sourceCounts[source] += 1;

    if (speed) {
      existingById.set(model.id, speed);
    }

    if (!fromCache) {
      await new Promise((resolve) => setTimeout(resolve, source === 'frontend-api' ? 150 : 500));
    }
  }

  const models = sortSpeedModels([...existingById.values()], modelsData.models.map((model) => model.id));

  await Bun.write(
    SPEED_MODELS_FILE,
    JSON.stringify(
      {
        scrapedAt: new Date().toISOString(),
        count: models.length,
        models,
      },
      null,
      2,
    ),
  );

  console.log(
    `Speed sources: frontend-api ${sourceCounts['frontend-api']}, firecrawl ${sourceCounts.firecrawl}, cache ${sourceCounts.cache}, missing ${sourceCounts.missing}`,
  );
  console.log(`Saved speed data to ${SPEED_MODELS_FILE}`);
}

await scrapeSpeeds();

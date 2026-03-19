#!/usr/bin/env bun

import { $ } from 'bun';
import { API_MODELS_FILE, FIRECRAWL_DIR, SPEED_MODELS_FILE } from './paths';

interface SpeedData {
  modelId: string;
  providers: {
    name: string;
    throughput: number | null;
    latency: number | null;
    e2eLatency: number | null;
  }[];
}

function parseSpeedData(content: string, modelId: string): SpeedData {
  const providers: SpeedData['providers'] = [];
  const perfMatch = content.match(/## Performance[\s\S]*?(?=## |$)/);
  if (!perfMatch) {
    return { modelId, providers: [] };
  }

  const perfSection = perfMatch[0];
  const throughputMatches = perfSection.matchAll(/(\d+(?:\.\d+)?)\s*tok\/s/g);
  const latencyMatches = perfSection.matchAll(/(\d+(?:\.\d+)?)\s*s\s*(?![\w])/g);

  const throughputs = Array.from(throughputMatches, (match) =>
    Number.parseFloat(match[1] ?? '0'),
  );
  const latencies = Array.from(latencyMatches, (match) =>
    Number.parseFloat(match[1] ?? '0'),
  );

  const providerNames = [
    'OpenAI',
    'Anthropic',
    'Google',
    'DeepSeek',
    'Mistral AI',
    'Cohere',
    'Meta',
    'xAI',
    'Together',
    'Fireworks',
  ];

  for (const name of providerNames) {
    if (!perfSection.includes(name)) {
      continue;
    }

    const idx = providers.length;
    providers.push({
      name,
      throughput: throughputs[idx] ?? null,
      latency: latencies[idx * 2] ?? null,
      e2eLatency: latencies[idx * 2 + 1] ?? null,
    });
  }

  if (providers.length === 0 && (throughputs.length > 0 || latencies.length > 0)) {
    providers.push({
      name: 'Default',
      throughput: throughputs[0] ?? null,
      latency: latencies[0] ?? null,
      e2eLatency: latencies[1] ?? null,
    });
  }

  return { modelId, providers };
}

async function scrapeModelPage(modelId: string): Promise<SpeedData | null> {
  const url = `https://openrouter.ai/${modelId}`;
  const outputFile = `${FIRECRAWL_DIR}/${modelId.replace(/\//g, '-')}.md`;

  try {
    await $`firecrawl scrape ${url} --only-main-content -o ${outputFile}`.quiet();
    const content = await Bun.file(outputFile).text();
    return parseSpeedData(content, modelId);
  } catch {
    return null;
  }
}

async function scrapeSpeeds(): Promise<void> {
  const modelsData = (await Bun.file(API_MODELS_FILE).json()) as {
    models: { id: string }[];
  };

  await $`mkdir -p ${FIRECRAWL_DIR}`;

  const models: SpeedData[] = [];
  for (const [index, model] of modelsData.models.entries()) {
    console.log(`[${index + 1}/${modelsData.models.length}] ${model.id}`);

    const speed = await scrapeModelPage(model.id);
    if (speed) {
      models.push(speed);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

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

  console.log(`Saved speed data to ${SPEED_MODELS_FILE}`);
}

await scrapeSpeeds();

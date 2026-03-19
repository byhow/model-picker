#!/usr/bin/env bun

import { API_MODELS_FILE } from './paths';
import type { OpenRouterModel } from '@model-picker/domain';

const API_URL = 'https://openrouter.ai/api/v1/models';

interface ApiResponse {
  data: OpenRouterModel[];
}

const FLAGSHIP_PATTERNS = [
  /^openai\/gpt-5/i,
  /^openai\/o[1-9]/i,
  /^anthropic\/claude-3[.-]5/i,
  /^anthropic\/claude-4/i,
  /^google\/gemini-2[.-]5/i,
  /^google\/gemini-2[.-]0/i,
  /^x-ai\/grok-4/i,
  /^deepseek\/deepseek-r1/i,
  /^deepseek\/deepseek-v3/i,
  /^meta-llama\/llama-3[.-]3/i,
  /^meta-llama\/llama-4/i,
  /^mistralai\/mistral-large/i,
  /^mistralai\/pixtral-large/i,
  /^cohere\/command-a/i,
  /^cohere\/command-r-plus/i,
  /^z-ai\/glm-5/i,
  /^qwen\/qwen[23]/i,
  /^alibaba\/qwen/i,
];

function isFlagshipModel(modelId: string): boolean {
  return FLAGSHIP_PATTERNS.some((pattern) => pattern.test(modelId));
}

function sortByCapability(models: OpenRouterModel[]): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    const contextDiff = b.context_length - a.context_length;
    if (contextDiff !== 0) return contextDiff;

    const priceA = parseFloat(a.pricing.completion) || 0;
    const priceB = parseFloat(b.pricing.completion) || 0;
    return priceB - priceA;
  });
}

async function fetchModels(): Promise<void> {
  console.log('Fetching models from OpenRouter API...');

  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = (await response.json()) as ApiResponse;
  const flagshipModels = sortByCapability(
    data.data.filter((model) => isFlagshipModel(model.id)),
  ).slice(0, 20);

  await Bun.write(
    API_MODELS_FILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        count: flagshipModels.length,
        models: flagshipModels,
      },
      null,
      2,
    ),
  );

  console.log(`Saved ${flagshipModels.length} models to ${API_MODELS_FILE}`);
}

await fetchModels();

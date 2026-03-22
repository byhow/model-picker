import { describe, expect, test } from 'bun:test';
import {
  buildOpenRouterModelsUrl,
  extractCategoryLabels,
  extractMatchedModelCount,
  extractOrderedModelIds,
  getOpenRouterModel,
  queryOpenRouterModels,
  resetOpenRouterApiCache,
} from './openrouter-live';
import { withOpenRouterFixtures } from './cli-test-lib';

function withEnv<T>(
  values: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetOpenRouterApiCache();
  });
}

describe('openrouter live helpers', () => {
  test('builds OpenRouter models URL with page-compatible query params', () => {
    const url = buildOpenRouterModelsUrl({
      order: 'most-popular',
      q: 'claude',
      inputModalities: ['text', 'image'],
      outputModalities: ['image'],
      categories: ['programming'],
      maxPrice: 0.5,
      zdr: true,
    });

    expect(url).toBe(
      'https://openrouter.ai/models?categories=programming&fmt=cards&input_modalities=text%2Cimage&max_price=0.5&order=most-popular&output_modalities=image&q=claude&zdr=true',
    );
  });

  test('extracts ordered model ids and matched counts from Firecrawl markdown', () => {
    const markdown = `# Models\n\n653 models\n\n- [OpenAI: GPT-5.4GPT-5.4](https://openrouter.ai/openai/gpt-5.4)\n\n[OpenAI: GPT-5.4](https://openrouter.ai/openai/gpt-5.4)\n\n- [Claude](https://openrouter.ai/anthropic/claude-opus-4.6)\n\n- [Docs](https://openrouter.ai/docs/use-cases)`;
    const ids = extractOrderedModelIds(
      markdown,
      new Set(['openai/gpt-5.4', 'anthropic/claude-opus-4.6']),
    );

    expect(ids).toEqual(['openai/gpt-5.4', 'anthropic/claude-opus-4.6']);
    expect(extractMatchedModelCount(markdown)).toBe(653);
  });

  test('extracts top-level category labels from a model page', () => {
    const markdown = `# OpenAI: GPT-5.4\n\nAcademia (#41)\nFinance (#21)\nLegal (#39)\n\nStandard\n\nMore content`;

    expect(extractCategoryLabels(markdown)).toEqual([
      'Academia',
      'Finance',
      'Legal',
    ]);
  });

  test('queries fixture-backed live models and live model details', async () => {
    await withOpenRouterFixtures(async ({ env }) => {
      await withEnv(env, async () => {
        const top = await queryOpenRouterModels({
          order: 'most-popular',
          limit: 2,
        });

        expect(top.sourceUrl).toBe(
          'https://openrouter.ai/models?fmt=cards&order=most-popular',
        );
        expect(top.matchedCount).toBe(4);
        expect(top.models.map((model) => model.id)).toEqual([
          'openai/gpt-5.4',
          'anthropic/claude-opus-4.6',
        ]);

        const search = await queryOpenRouterModels({ q: 'claude', limit: 5 });
        expect(search.models.map((model) => model.id)).toEqual([
          'anthropic/claude-opus-4.6',
          'anthropic/claude-sonnet-4.5',
        ]);

        const model = await getOpenRouterModel('openai/gpt-5.4');
        expect(model?.sourceUrl).toBe('https://openrouter.ai/openai/gpt-5.4');
        expect(model?.createdAt).toBe('2026-03-05T18:12:32.000Z');
        expect(model?.categories).toEqual([
          'Programming',
          'Finance',
          'Marketing',
          'Legal',
          'Academia',
        ]);
      });
    });
  });
});

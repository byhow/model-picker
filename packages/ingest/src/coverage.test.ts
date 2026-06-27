import { describe, expect, test } from 'bun:test';
import type { OpenRouterModel } from '@model-picker/domain';
import { assertCoverage, buildCoverageSummary } from './coverage';

function createModel(id: string): OpenRouterModel {
  return {
    id,
    name: id,
    description: id,
    context_length: 128_000,
    pricing: {
      prompt: '0.000001',
      completion: '0.000002',
    },
    top_provider: {
      context_length: 128_000,
      max_completion_tokens: 8_192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
  };
}

const sufficientModels = [
  'openai/gpt-5.4',
  'openai/gpt-5.4-pro',
  'openai/o3',
  'openai/gpt-4.1',
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-pro-preview',
  'google/gemini-3.1-pro-preview',
  'x-ai/grok-4.3',
  'x-ai/grok-4-fast',
  'x-ai/grok-4.20-beta',
  'deepseek/deepseek-r1-0528',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-v3.2-exp',
  'moonshotai/kimi-k2.5',
  'moonshotai/kimi-k2',
  'minimax/minimax-m2.5',
  'minimax/minimax-m2',
  'qwen/qwen3-coder-plus',
  'qwen/qwen3-max',
  'alibaba/qwen-plus',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-3.3-70b',
  'mistralai/mistral-large',
  'mistralai/pixtral-large',
  'cohere/command-a',
  'cohere/command-r-plus',
  'z-ai/glm-5',
].map(createModel);

describe('coverage', () => {
  test('accepts broad frontier coverage', () => {
    const summary = buildCoverageSummary(sufficientModels);
    expect(summary.missingRules).toEqual([]);
    expect(summary.missingRequiredModelIds).toEqual([]);
    expect(() => assertCoverage(summary)).not.toThrow();
  });

  test('fails when required models are missing', () => {
    const summary = buildCoverageSummary(sufficientModels.filter((model) => model.id !== 'moonshotai/kimi-k2.5'));

    expect(summary.missingRequiredModelIds).toContain('moonshotai/kimi-k2.5');
    expect(() => assertCoverage(summary)).toThrow(/required models missing/);
  });
});

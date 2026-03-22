import type { OpenRouterModel } from '@model-picker/domain';

export interface ModelCoverageRule {
  name: string;
  pattern: RegExp;
  minimum: number;
}

export const COVERAGE_RULES: ModelCoverageRule[] = [
  { name: 'openai', pattern: /^openai\//i, minimum: 4 },
  { name: 'anthropic', pattern: /^anthropic\//i, minimum: 3 },
  { name: 'google', pattern: /^google\/gemini/i, minimum: 3 },
  { name: 'x-ai', pattern: /^x-ai\/grok/i, minimum: 3 },
  { name: 'deepseek', pattern: /^deepseek\//i, minimum: 3 },
  { name: 'moonshotai', pattern: /^moonshotai\/kimi/i, minimum: 2 },
  { name: 'minimax', pattern: /^minimax\//i, minimum: 2 },
  { name: 'qwen', pattern: /^(qwen|alibaba)\//i, minimum: 3 },
  { name: 'meta-llama', pattern: /^meta-llama\//i, minimum: 2 },
  { name: 'mistralai', pattern: /^mistralai\//i, minimum: 2 },
  { name: 'cohere', pattern: /^cohere\//i, minimum: 2 },
  { name: 'z-ai', pattern: /^z-ai\/glm/i, minimum: 1 },
];

export const REQUIRED_MODEL_IDS = [
  'openai/gpt-5.4',
  'anthropic/claude-opus-4.6',
  'google/gemini-2.5-pro',
  'x-ai/grok-4',
  'deepseek/deepseek-r1-0528',
  'moonshotai/kimi-k2.5',
  'minimax/minimax-m2.5',
  'qwen/qwen3-coder-plus',
] as const;

export interface CoverageSummary {
  countsByRule: Record<string, number>;
  missingRules: string[];
  missingRequiredModelIds: string[];
}

export function buildCoverageSummary(models: OpenRouterModel[]): CoverageSummary {
  const countsByRule = Object.fromEntries(
    COVERAGE_RULES.map((rule) => [
      rule.name,
      models.filter((model) => rule.pattern.test(model.id)).length,
    ]),
  );

  return {
    countsByRule,
    missingRules: COVERAGE_RULES.filter(
      (rule) => (countsByRule[rule.name] ?? 0) < rule.minimum,
    ).map((rule) => `${rule.name}:${rule.minimum}`),
    missingRequiredModelIds: REQUIRED_MODEL_IDS.filter(
      (id) => !models.some((model) => model.id.toLowerCase() === id.toLowerCase()),
    ),
  };
}

export function assertCoverage(summary: CoverageSummary): void {
  if (
    summary.missingRules.length === 0 &&
    summary.missingRequiredModelIds.length === 0
  ) {
    return;
  }

  const parts: string[] = [];
  if (summary.missingRules.length > 0) {
    parts.push(`provider coverage failed (${summary.missingRules.join(', ')})`);
  }
  if (summary.missingRequiredModelIds.length > 0) {
    parts.push(
      `required models missing (${summary.missingRequiredModelIds.join(', ')})`,
    );
  }

  throw new Error(parts.join('; '));
}

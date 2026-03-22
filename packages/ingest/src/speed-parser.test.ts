import { describe, expect, test } from 'bun:test';
import { hasParsedSpeedMetrics, parseSpeedData } from './speed-parser';

const MULTI_PROVIDER_MARKDOWN = `## Performance for Claude Haiku 4.5

### Compare different providers across OpenRouter

All locations

### Throughput

Google Vertex

Avg84 tok/s

Anthropic

Avg65 tok/s

Amazon Bedrock

Avg45 tok/s

### Latency

Google Vertex

Avg0.61 s

Anthropic

Avg0.79 s

Amazon Bedrock

Avg1.26 s

### E2E Latency

Google Vertex

Avg1.49 s

Anthropic

Avg1.66 s

Amazon Bedrock

Avg2.38 s

## Effective Pricing for Claude Haiku 4.5
`;

const SINGLE_PROVIDER_MARKDOWN = `## Performance for o3 Mini

### Compare different providers across OpenRouter

All locations

### Throughput

OpenAI

Avg218 tok/s

### Latency

OpenAI

Avg6.53 s

### E2E Latency

OpenAI

Avg15.50 s

## Tool Call Error Rate
`;

describe('speed-parser', () => {
  test('parses multi-provider throughput, latency, and e2e latency', () => {
    const parsed = parseSpeedData(MULTI_PROVIDER_MARKDOWN, 'anthropic/claude-haiku-4.5');

    expect(parsed.providers).toEqual([
      {
        name: 'Google Vertex',
        throughput: 84,
        latency: 0.61,
        e2eLatency: 1.49,
      },
      {
        name: 'Anthropic',
        throughput: 65,
        latency: 0.79,
        e2eLatency: 1.66,
      },
      {
        name: 'Amazon Bedrock',
        throughput: 45,
        latency: 1.26,
        e2eLatency: 2.38,
      },
    ]);
    expect(hasParsedSpeedMetrics(parsed)).toBe(true);
  });

  test('parses single-provider sections without losing the provider name', () => {
    const parsed = parseSpeedData(SINGLE_PROVIDER_MARKDOWN, 'openai/o3-mini');

    expect(parsed.providers).toEqual([
      {
        name: 'OpenAI',
        throughput: 218,
        latency: 6.53,
        e2eLatency: 15.5,
      },
    ]);
    expect(hasParsedSpeedMetrics(parsed)).toBe(true);
  });

  test('returns an empty provider list when no performance section exists', () => {
    const parsed = parseSpeedData('# Model\n\nNo performance data here.', 'provider/model');

    expect(parsed.providers).toEqual([]);
    expect(hasParsedSpeedMetrics(parsed)).toBe(false);
  });
});

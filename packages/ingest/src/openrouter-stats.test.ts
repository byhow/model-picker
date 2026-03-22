import { describe, expect, test } from 'bun:test';
import { buildSpeedMarkdownFromEndpointStats } from './openrouter-stats';
import { parseSpeedData } from './speed-parser';

describe('openrouter stats markdown adapter', () => {
  test('converts endpoint stats into parseable speed markdown', () => {
    const markdown = buildSpeedMarkdownFromEndpointStats('OpenAI: GPT-5.4', [
      {
        provider_name: 'OpenAI',
        stats: {
          p50_throughput: 45,
          p50_latency: 714,
        },
      },
      {
        provider_name: 'Azure',
        stats: {
          p50_throughput: 29,
          p50_latency: 1985,
        },
      },
    ]);

    expect(markdown).toContain('## Performance for OpenAI: GPT-5.4');

    const parsed = parseSpeedData(markdown!, 'openai/gpt-5.4');
    expect(parsed.providers).toEqual([
      {
        name: 'OpenAI',
        throughput: 45,
        latency: 0.71,
        e2eLatency: null,
      },
      {
        name: 'Azure',
        throughput: 29,
        latency: 1.99,
        e2eLatency: null,
      },
    ]);
  });

  test('returns null when no usable stats are present', () => {
    const markdown = buildSpeedMarkdownFromEndpointStats('OpenAI: GPT-5.4', [
      {
        provider_name: 'OpenAI',
        stats: {},
      },
    ]);

    expect(markdown).toBeNull();
  });
});

import type { OpenRouterFrontendStatsEntry } from '@model-picker/domain';

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function appendMetricSection(
  lines: string[],
  heading: string,
  entries: OpenRouterFrontendStatsEntry[],
  getValue: (entry: OpenRouterFrontendStatsEntry) => number | null | undefined,
  suffix: string,
): void {
  const rows = entries
    .map((entry) => ({
      provider: entry.provider_name,
      value: getValue(entry),
    }))
    .filter(
      (row): row is { provider: string; value: number } =>
        typeof row.provider === 'string' && row.provider.trim().length > 0 &&
        typeof row.value === 'number' && Number.isFinite(row.value),
    );

  if (rows.length === 0) {
    return;
  }

  lines.push(`### ${heading}`, '');
  for (const row of rows) {
    lines.push(row.provider, '', `Avg${formatNumber(row.value)} ${suffix}`, '');
  }
}

export function buildSpeedMarkdownFromEndpointStats(
  modelName: string,
  entries: OpenRouterFrontendStatsEntry[],
): string | null {
  const lines = [
    `## Performance for ${modelName}`,
    '',
    '### Compare different providers across OpenRouter',
    '',
    'All locations',
    '',
  ];

  appendMetricSection(lines, 'Throughput', entries, (entry) => entry.stats?.p50_throughput, 'tok/s');
  appendMetricSection(
    lines,
    'Latency',
    entries,
    (entry) => {
      const latencyMs = entry.stats?.p50_latency;
      return typeof latencyMs === 'number' && Number.isFinite(latencyMs)
        ? latencyMs / 1000
        : null;
    },
    's',
  );

  if (lines.length <= 6) {
    return null;
  }

  lines.push(`## Effective Pricing for ${modelName}`);
  return lines.join('\n');
}

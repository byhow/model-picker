export interface SpeedData {
  modelId: string;
  providers: {
    name: string;
    throughput: number | null;
    latency: number | null;
    e2eLatency: number | null;
  }[];
}

function extractPerformanceLines(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.startsWith('## Performance'));
  if (startIndex < 0) {
    return [];
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index]?.startsWith('## ')) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex);
}

function parseMetricSection(
  performanceLines: string[],
  heading: string,
  pattern: RegExp,
): Map<string, number> {
  const startIndex = performanceLines.findIndex((line) => line.startsWith(`### ${heading}`));
  if (startIndex < 0) {
    return new Map();
  }

  let endIndex = performanceLines.length;
  for (let index = startIndex + 1; index < performanceLines.length; index += 1) {
    const line = performanceLines[index] ?? '';
    if (line.startsWith('### ') || line.startsWith('## ')) {
      endIndex = index;
      break;
    }
  }

  const sectionLines = performanceLines
    .slice(startIndex + 1, endIndex)
    .map((line) => line.trim())
    .filter(Boolean);

  const values = new Map<string, number>();
  let currentProvider: string | null = null;

  for (const line of sectionLines) {
    const match = line.match(pattern);
    if (match?.[1]) {
      const value = Number.parseFloat(match[1]);
      if (Number.isFinite(value)) {
        values.set(currentProvider ?? 'Default', value);
      }
      currentProvider = null;
      continue;
    }

    currentProvider = line;
  }

  return values;
}

export function hasParsedSpeedMetrics(speedData: SpeedData): boolean {
  return speedData.providers.some(
    (provider) =>
      provider.throughput !== null ||
      provider.latency !== null ||
      provider.e2eLatency !== null,
  );
}

export function parseSpeedData(content: string, modelId: string): SpeedData {
  const performanceLines = extractPerformanceLines(content);
  if (performanceLines.length === 0) {
    return { modelId, providers: [] };
  }

  const throughput = parseMetricSection(
    performanceLines,
    'Throughput',
    /^Avg\s*(\d+(?:\.\d+)?)\s*tok\/s$/,
  );
  const latency = parseMetricSection(
    performanceLines,
    'Latency',
    /^Avg\s*(\d+(?:\.\d+)?)\s*s$/,
  );
  const e2eLatency = parseMetricSection(
    performanceLines,
    'E2E Latency',
    /^Avg\s*(\d+(?:\.\d+)?)\s*s$/,
  );

  const providerOrder = [
    ...throughput.keys(),
    ...latency.keys(),
    ...e2eLatency.keys(),
  ].filter((provider, index, providers) => providers.indexOf(provider) === index);

  return {
    modelId,
    providers: providerOrder.map((name) => ({
      name,
      throughput: throughput.get(name) ?? null,
      latency: latency.get(name) ?? null,
      e2eLatency: e2eLatency.get(name) ?? null,
    })),
  };
}

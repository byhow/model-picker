#!/usr/bin/env bun

import { isCancel, multiselect, text } from '@clack/prompts';
import { cac } from 'cac';
import {
  compareModels,
  getModelById,
  listModels,
  loadSnapshot,
  pickModels,
  searchModels,
  sortModels,
  topModels,
  type ScoreWeights,
  type SortBy,
} from '@model-picker/catalog';
import type { ModelRecord } from '@model-picker/domain';
import { formatModelSummary, toModelRow } from '@model-picker/presenters';

const cli = cac('mp');

type ExportFormat = 'json' | 'ndjson' | 'csv' | 'markdown';

function printRows(rows: ReturnType<typeof toModelRow>[]): void {
  if (rows.length === 0) {
    console.log('No matching models found.');
    return;
  }

  console.log('ID\tPRICE\tSPEED\tCONTEXT\tNAME');
  rows.forEach((row) => {
    console.log(
      `${row.id}\t${row.outputPrice}\t${row.speed}\t${row.context}\t${row.name}`,
    );
  });
}

function parseSort(sort: string): SortBy {
  return ['speed', 'price', 'context', 'name'].includes(sort)
    ? (sort as SortBy)
    : 'speed';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseExportFormat(format: string | undefined): ExportFormat {
  const normalized = format?.toLowerCase().trim();
  switch (normalized) {
    case 'json':
    case 'ndjson':
    case 'csv':
    case 'markdown':
      return normalized;
    default:
      return 'json';
  }
}

function defaultExportPath(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return './data/snapshots/export.csv';
    case 'ndjson':
      return './data/snapshots/export.ndjson';
    case 'markdown':
      return './data/snapshots/export.md';
    case 'json':
    default:
      return './data/snapshots/export.json';
  }
}

function modelToExportRow(model: ModelRecord) {
  return {
    id: model.id,
    name: model.name,
    outputPerMillion: model.pricing.outputPerMillion,
    inputPerMillion: model.pricing.inputPerMillion,
    bestThroughput: model.speed.bestThroughput,
    contextLength: model.contextLength,
    provider: model.id.split('/')[0] ?? 'unknown',
    modality: model.architecture.modality,
    moderated: model.topProvider.isModerated,
  };
}

function toCsv(rows: ReturnType<typeof modelToExportRow>[]): string {
  const header = [
    'id',
    'name',
    'outputPerMillion',
    'inputPerMillion',
    'bestThroughput',
    'contextLength',
    'provider',
    'modality',
    'moderated',
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.name,
      row.outputPerMillion,
      row.inputPerMillion,
      row.bestThroughput ?? '',
      row.contextLength,
      row.provider,
      row.modality,
      row.moderated,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  );

  return [header.join(','), ...lines].join('\n');
}

function toMarkdown(rows: ReturnType<typeof modelToExportRow>[]): string {
  const header =
    '| ID | Name | Output /M | Speed | Context | Provider | Modality | Moderated |';
  const divider =
    '| --- | --- | ---: | ---: | ---: | --- | --- | --- |';
  const body = rows.map(
    (row) =>
      `| ${row.id} | ${row.name} | ${row.outputPerMillion.toFixed(2)} | ${row.bestThroughput?.toFixed(0) ?? 'N/A'} | ${row.contextLength.toLocaleString()} | ${row.provider} | ${row.modality} | ${row.moderated ? 'yes' : 'no'} |`,
  );

  return [header, divider, ...body].join('\n');
}

function compareSummary(models: ModelRecord[]): void {
  if (models.length < 2) {
    return;
  }

  const fastest = [...models].sort(
    (a, b) => (b.speed.bestThroughput ?? 0) - (a.speed.bestThroughput ?? 0),
  )[0];
  const cheapest = [...models].sort(
    (a, b) => a.pricing.outputPerMillion - b.pricing.outputPerMillion,
  )[0];
  const longest = [...models].sort((a, b) => b.contextLength - a.contextLength)[0];

  console.log('\nSummary');
  console.log(`- Fastest: ${fastest?.id ?? 'N/A'} (${fastest?.speed.bestThroughput?.toFixed(0) ?? 'N/A'} tok/s)`);
  console.log(`- Cheapest: ${cheapest?.id ?? 'N/A'} ($${cheapest?.pricing.outputPerMillion.toFixed(2) ?? 'N/A'}/M)`);
  console.log(`- Longest context: ${longest?.id ?? 'N/A'} (${longest?.contextLength.toLocaleString() ?? 'N/A'} tokens)`);
}

function formatChoiceLabel(model: ModelRecord): string {
  return `${model.name} · ${model.id} · ${model.speed.bestThroughput?.toFixed(0) ?? 'N/A'} tok/s · $${model.pricing.outputPerMillion.toFixed(2)}/M`;
}

async function promptCompareIds(
  filter: string | undefined,
  sort: SortBy,
  limit: number,
): Promise<string[] | null> {
  const baseModels = await listModels({
    filter,
    sortBy: sort,
    limit,
  });

  if (baseModels.length === 0) {
    console.log('No models available for interactive compare.');
    return [];
  }

  const query = await text({
    message: 'Optional search query before selecting models',
    placeholder: 'press enter to skip',
  });

  if (isCancel(query)) {
    return null;
  }

  const normalizedQuery = String(query || '').trim().toLowerCase();
  const candidates = normalizedQuery
    ? baseModels.filter((model) =>
        `${model.id} ${model.name} ${model.description}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : baseModels;

  if (candidates.length === 0) {
    console.log('No models matched that query.');
    return [];
  }

  const selected = await multiselect({
    message: 'Select models to compare',
    options: candidates.map((model) => ({
      label: formatChoiceLabel(model),
      value: model.id,
    })),
    required: true,
    maxItems: 6,
  });

  if (isCancel(selected)) {
    return null;
  }

  return selected as string[];
}

function parseWeights(input?: string): Partial<ScoreWeights> {
  if (!input?.trim()) {
    return {};
  }

  const parsed: Partial<ScoreWeights> = {};
  for (const pair of input.split(',')) {
    const [key, value] = pair.split('=').map((part) => part.trim());
    const numericValue = Number.parseFloat(value || '');
    if (!Number.isFinite(numericValue)) {
      continue;
    }

    if (key === 'speed' || key === 'price' || key === 'context') {
      parsed[key] = numericValue;
    }
  }

  return parsed;
}

cli
  .command('top', 'List top models by speed, price, or context')
  .option('--sort <sort>', 'speed|price|context|name', {
    default: 'speed',
  })
  .option('--filter <filter>', 'Filter expression (e.g. fast,budget,price<2)')
  .option('--limit <limit>', 'Limit rows', {
    default: '10',
  })
  .action(async (options) => {
    const sort = parseSort(options.sort);
    const limit = Number.parseInt(options.limit, 10) || 10;

    const models = await topModels(sort, limit, options.filter);
    printRows(models.map(toModelRow));
  });

cli.command('get <id>', 'Show one model').action(async (id) => {
  const model = await getModelById(id);
  if (!model) {
    console.error(`Model not found: ${id}`);
    process.exit(1);
  }

  console.log(formatModelSummary(model));
});

cli
  .command('search <query>', 'Search models')
  .option('--sort <sort>', 'speed|price|context|name', {
    default: 'speed',
  })
  .option('--limit <limit>', 'Limit rows', {
    default: '20',
  })
  .action(async (query, options) => {
    const models = await searchModels(query);
    const limit = parsePositiveInt(options.limit, 20);
    const sorted = sortModels(models, parseSort(options.sort)).slice(0, limit);
    printRows(sorted.map(toModelRow));
  });

cli
  .command('compare [...ids]', 'Compare multiple models')
  .option('--interactive', 'Prompt for model selection')
  .option('--filter <filter>', 'Filter expression before selection')
  .option('--sort <sort>', 'speed|price|context|name', {
    default: 'speed',
  })
  .option('--limit <limit>', 'Selection pool size', {
    default: '25',
  })
  .action(async (ids: string[] = [], options) => {
    let targetIds = ids;

    if (targetIds.length === 0 || options.interactive) {
      const prompted = await promptCompareIds(
        options.filter,
        parseSort(options.sort),
        parsePositiveInt(options.limit, 25),
      );

      if (prompted === null) {
        console.log('Compare canceled.');
        return;
      }

      targetIds = prompted;
    }

    if (targetIds.length === 0) {
      console.log('No models selected for compare.');
      return;
    }

    targetIds = [...new Set(targetIds)];
    const models = await compareModels(targetIds);
    if (models.length === 0) {
      console.log('No matching models found for compare.');
      return;
    }

    printRows(models.map(toModelRow));
    compareSummary(models);
  });

cli
  .command('pick', 'Recommend best-fit models by weighted score')
  .option('--task <task>', 'coding|vision|budget|long-context|fast')
  .option('--weights <weights>', 'speed=0.5,price=0.3,context=0.2')
  .option('--filter <filter>', 'Filter expression before scoring')
  .option('--limit <limit>', 'Limit recommendations', {
    default: '5',
  })
  .action(async (options) => {
    const picks = await pickModels({
      task: options.task,
      filter: options.filter,
      limit: Number.parseInt(options.limit, 10) || 5,
      weights: parseWeights(options.weights),
    });

    if (picks.length === 0) {
      console.log('No models matched your pick criteria.');
      return;
    }

    console.log('SCORE\tID\tPRICE\tSPEED\tCONTEXT\tREASONS');
    picks.forEach((entry) => {
      const row = toModelRow(entry.model);
      console.log(
        `${entry.score.toFixed(3)}\t${row.id}\t${row.outputPrice}\t${row.speed}\t${row.context}\t${entry.reasons.join('; ')}`,
      );
    });
  });

cli
  .command('export', 'Export current snapshot to JSON')
  .option('--output <output>', 'Output file path')
  .option('--format <format>', 'json|ndjson|csv|markdown', {
    default: 'json',
  })
  .option('--sort <sort>', 'speed|price|context|name', {
    default: 'speed',
  })
  .option('--filter <filter>', 'Filter expression before export')
  .option('--limit <limit>', 'Limit rows exported')
  .option('--compact', 'Only export flattened row fields')
  .action(async (options) => {
    const format = parseExportFormat(options.format);
    const outputPath = options.output || defaultExportPath(format);
    const models = await listModels({
      filter: options.filter,
      sortBy: parseSort(options.sort),
      limit: options.limit ? parsePositiveInt(options.limit, 25) : undefined,
    });

    const rows = models.map(modelToExportRow);
    const snapshot = await loadSnapshot();
    let payload = '';

    if (format === 'json') {
      payload = JSON.stringify(
        options.compact
          ? rows
          : {
              generatedAt: snapshot.generatedAt,
              count: rows.length,
              models,
            },
        null,
        2,
      );
    }

    if (format === 'ndjson') {
      payload = rows.map((row) => JSON.stringify(row)).join('\n');
    }

    if (format === 'csv') {
      payload = toCsv(rows);
    }

    if (format === 'markdown') {
      payload = toMarkdown(rows);
    }

    await Bun.write(outputPath, payload);
    console.log(`Exported ${rows.length} models to ${outputPath} (${format})`);
  });

cli.command('refresh', 'Refresh snapshot data').action(async () => {
  await Bun.$`bun run --filter @model-picker/ingest refresh`;
});

cli.command('tui', 'Launch the TUI').action(async () => {
  await Bun.$`bun run --filter @model-picker/tui dev`;
});

cli.command('doctor', 'Check local snapshot health').action(async () => {
  const snapshot = await loadSnapshot();
  console.log(`Snapshot generated at: ${snapshot.generatedAt}`);
  console.log(`Tracked models: ${snapshot.count}`);
});

cli.help();
cli.parse();

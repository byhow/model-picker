#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isCancel, multiselect, text } from '@clack/prompts';
import { cac } from 'cac';
import packageJson from '../package.json';
import {
  compareModels,
  listModels,
  loadSnapshot,
  pickModels,
  type ScoreWeights,
  type SortBy,
} from '@model-picker/catalog';
import type { ModelRecord } from '@model-picker/domain';
import { toModelRow } from '@model-picker/presenters';
import {
  buildOpenRouterModelUrl,
  describeOpenRouterAccessMode,
  describeOpenRouterFirecrawlFallbackMode,
  getOpenRouterModel,
  isMissingFirecrawlCredentialsError,
  normalizeCsvList,
  OPENROUTER_ORDERS,
  queryOpenRouterModels,
  type OpenRouterOrder,
} from './openrouter-live';
import {
  firecrawlSetupHint,
  runOnboarding,
} from './onboarding';
import { renderTable } from './table-output';
import { resolveModelPickerConfigPath } from './user-config';

const cli = cac('model-picker');
cli.version(packageJson.version);
cli.usage('<command> [options]');
cli.example('model-picker doctor');
cli.example('model-picker top --limit 15');
cli.example('model-picker get claude');
cli.example('model-picker get openai/gpt-5.4');
cli.example('model-picker get openai/gpt-5.4 --details --timeout 20');
cli.example('model-picker get openai/gpt-5.4 --json');
cli.example('model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4');

type ExportFormat = 'json' | 'ndjson' | 'csv' | 'markdown';

const SNAPSHOT_SORTS = ['speed', 'price', 'context', 'name'] as const;
const EXPORT_FORMATS = ['json', 'ndjson', 'csv', 'markdown'] as const;
const SYNC_SUBSETS = ['full', 'top-providers-10'] as const;
const WEIGHT_KEYS = ['speed', 'price', 'context'] as const;
const INPUT_MODALITIES = ['text', 'image', 'file', 'audio', 'video'] as const;
const OUTPUT_MODALITIES = ['text', 'image', 'audio'] as const;
const LEGACY_COMMAND_ALIASES = new Map<string, string>([
  ['search', 'get'],
  ['refresh', 'sync'],
]);
const PUBLIC_COMMANDS = [
  'top',
  'get',
  'compare',
  'pick',
  'export',
  'sync',
  'tui',
  'doctor',
  'onboard',
  'configure',
];

class CliUsageError extends Error {
  constructor(
    message: string,
    readonly helpScope: 'command' | 'global' = 'command',
    readonly suggestions: string[] = [],
  ) {
    super(message);
    this.name = 'CliUsageError';
  }
}

class LiveFetchTimeoutError extends Error {
  constructor(readonly timeoutSeconds: number) {
    super(`Live request timed out after ${timeoutSeconds}s.`);
    this.name = 'LiveFetchTimeoutError';
  }
}

function emitJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function isKnownPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function localQueryHaystack(model: ModelRecord): string {
  return [
    model.id,
    model.name,
    model.description,
    model.architecture.modality,
    ...model.architecture.inputModalities,
    ...model.architecture.outputModalities,
  ]
    .join(' ')
    .toLowerCase();
}

function isExactLocalMatch(model: ModelRecord, query: string): boolean {
  const normalizedQuery = normalizeCliText(query);
  return (
    normalizeCliText(model.id) === normalizedQuery ||
    normalizeCliText(model.name) === normalizedQuery
  );
}

function localCandidateScore(model: ModelRecord, query: string): number {
  const normalizedQuery = normalizeCliText(query);
  const normalizedId = normalizeCliText(model.id);
  const normalizedName = normalizeCliText(model.name);
  const haystack = localQueryHaystack(model);

  let score = 0;
  if (normalizedId === normalizedQuery) score += 1000;
  else if (normalizedName === normalizedQuery) score += 950;
  else if (normalizedId.startsWith(normalizedQuery)) score += 900;
  else if (normalizedName.startsWith(normalizedQuery)) score += 850;
  else if (normalizedId.includes(normalizedQuery)) score += 700;
  else if (normalizedName.includes(normalizedQuery)) score += 650;
  else if (haystack.includes(normalizedQuery)) score += 400;

  score += Math.min(model.speed.bestThroughput ?? 0, 5000) / 100;
  score += model.contextLength / 1_000_000;
  score -= isKnownPrice(model.pricing.outputPerMillion)
    ? model.pricing.outputPerMillion / 1000
    : 100;

  return score;
}

function rankLocalMatches(models: ModelRecord[], query: string): ModelRecord[] {
  return [...models].sort((left, right) => {
    const scoreDiff = localCandidateScore(right, query) - localCandidateScore(left, query);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const speedDiff = (right.speed.bestThroughput ?? 0) - (left.speed.bestThroughput ?? 0);
    if (speedDiff !== 0) {
      return speedDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

function formatSnapshotSource(snapshotGeneratedAt: string): string {
  return `local snapshot (${snapshotGeneratedAt})`;
}

function formatSnapshotModelSummary(
  model: ModelRecord,
  snapshotGeneratedAt: string,
): string {
  return [
    `${model.name} (${model.id})`,
    `Source: ${formatSnapshotSource(snapshotGeneratedAt)}`,
    `OpenRouter: ${buildOpenRouterModelUrl(model.id)}`,
    `Input: ${formatPricePerMillion(model.pricing.inputPerMillion)}`,
    `Output: ${formatPricePerMillion(model.pricing.outputPerMillion)}`,
    `Speed: ${model.speed.bestThroughput ? `${model.speed.bestThroughput.toFixed(1)} tok/s` : 'N/A'}`,
    `Context: ${model.contextLength.toLocaleString()} tokens`,
    `Input modalities: ${model.architecture.inputModalities.join(', ') || 'N/A'}`,
    `Output modalities: ${model.architecture.outputModalities.join(', ') || 'N/A'}`,
    `Moderated: ${model.topProvider.isModerated ? 'Yes' : 'No'}`,
  ].join('\n');
}

async function withTimeout<T>(promise: Promise<T>, timeoutSeconds: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LiveFetchTimeoutError(timeoutSeconds));
    }, timeoutSeconds * 1000);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function printRows(rows: ReturnType<typeof toModelRow>[]): void {
  if (rows.length === 0) {
    console.log('No matching models found.');
    return;
  }

  console.log(
    renderTable(rows, [
      {
        header: 'ID',
        getValue: (row) => row.id,
        minWidth: 20,
        maxWidth: 28,
        shrinkPriority: 4,
      },
      {
        header: 'PRICE',
        align: 'right',
        getValue: (row) => row.outputPrice,
        minWidth: 8,
        maxWidth: 10,
      },
      {
        header: 'SPEED',
        align: 'right',
        getValue: (row) => row.speed,
        minWidth: 8,
        maxWidth: 10,
      },
      {
        header: 'CONTEXT',
        align: 'right',
        getValue: (row) => row.context,
        minWidth: 7,
        maxWidth: 7,
      },
      {
        header: 'NAME',
        getValue: (row) => row.name,
        minWidth: 16,
        maxWidth: 42,
        shrinkPriority: 5,
      },
    ]),
  );
}

function formatPricePerMillion(value: number): string {
  return Number.isFinite(value) && value >= 0 ? `$${value.toFixed(2)}/M` : 'N/A';
}

function formatContextLength(value: number): string {
  return value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : `${Math.round(value / 1_000)}K`;
}

function printLiveRows(models: ModelRecord[]): void {
  if (models.length === 0) {
    console.log('No matching models found.');
    return;
  }

  console.log(
    renderTable(models, [
      {
        header: 'ID',
        getValue: (model) => model.id,
        minWidth: 20,
        maxWidth: 28,
        shrinkPriority: 4,
      },
      {
        header: 'INPUT',
        align: 'right',
        getValue: (model) => formatPricePerMillion(model.pricing.inputPerMillion),
        minWidth: 10,
        maxWidth: 10,
      },
      {
        header: 'OUTPUT',
        align: 'right',
        getValue: (model) => formatPricePerMillion(model.pricing.outputPerMillion),
        minWidth: 10,
        maxWidth: 10,
      },
      {
        header: 'CONTEXT',
        align: 'right',
        getValue: (model) => formatContextLength(model.contextLength),
        minWidth: 7,
        maxWidth: 7,
      },
      {
        header: 'NAME',
        getValue: (model) => model.name,
        minWidth: 16,
        maxWidth: 42,
        shrinkPriority: 5,
      },
    ]),
  );
}

function printPickRows(picks: Awaited<ReturnType<typeof pickModels>>): void {
  console.log(
    renderTable(picks, [
      {
        header: 'SCORE',
        align: 'right',
        getValue: (entry) => entry.score.toFixed(3),
        minWidth: 5,
        maxWidth: 5,
      },
      {
        header: 'ID',
        getValue: (entry) => entry.model.id,
        minWidth: 20,
        maxWidth: 28,
        shrinkPriority: 4,
      },
      {
        header: 'PRICE',
        align: 'right',
        getValue: (entry) => toModelRow(entry.model).outputPrice,
        minWidth: 8,
        maxWidth: 10,
      },
      {
        header: 'SPEED',
        align: 'right',
        getValue: (entry) => toModelRow(entry.model).speed,
        minWidth: 8,
        maxWidth: 10,
      },
      {
        header: 'CONTEXT',
        align: 'right',
        getValue: (entry) => toModelRow(entry.model).context,
        minWidth: 7,
        maxWidth: 7,
      },
      {
        header: 'REASONS',
        getValue: (entry) => entry.reasons.join('; '),
        minWidth: 18,
        maxWidth: 44,
        shrinkPriority: 5,
      },
    ]),
  );
}

function parseSort(sort: string | undefined, fallback: SortBy = 'speed'): SortBy {
  const normalized = sort?.trim();
  if (!normalized) {
    return fallback;
  }

  if (SNAPSHOT_SORTS.includes(normalized as SortBy)) {
    return normalized as SortBy;
  }

  throw new CliUsageError(
    `Invalid --sort value: ${normalized}. Use one of ${SNAPSHOT_SORTS.join(', ')}.`,
  );
}

function parseSyncSubset(value: string | undefined): (typeof SYNC_SUBSETS)[number] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return 'full';
  }

  if (SYNC_SUBSETS.includes(normalized as (typeof SYNC_SUBSETS)[number])) {
    return normalized as (typeof SYNC_SUBSETS)[number];
  }

  throw new CliUsageError(
    `Invalid --subset value: ${normalized}. Use one of ${SYNC_SUBSETS.join(', ')}.`,
  );
}

function parseOpenRouterOrder(order: string | undefined): OpenRouterOrder {
  const normalized = order?.trim();
  if (!normalized) {
    return 'most-popular';
  }

  if (OPENROUTER_ORDERS.includes(normalized as OpenRouterOrder)) {
    return normalized as OpenRouterOrder;
  }

  throw new CliUsageError(
    `Invalid --order value: ${normalized}. Use one of ${OPENROUTER_ORDERS.join(', ')}.`,
  );
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliUsageError(`Invalid numeric value: ${value}. Use a positive integer.`);
  }

  return parsed;
}

function parseOptionalFloat(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliUsageError(`Invalid numeric value: ${value}. Use a non-negative number.`);
  }

  return parsed;
}

function parseExportFormat(format: string | undefined): ExportFormat {
  const normalized = format?.toLowerCase().trim();
  if (!normalized) {
    return 'json';
  }

  if (EXPORT_FORMATS.includes(normalized as ExportFormat)) {
    return normalized as ExportFormat;
  }

  throw new CliUsageError(
    `Invalid --format value: ${normalized}. Use one of ${EXPORT_FORMATS.join(', ')}.`,
  );
}

function defaultExportPath(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return resolve(process.cwd(), 'model-picker-export.csv');
    case 'ndjson':
      return resolve(process.cwd(), 'model-picker-export.ndjson');
    case 'markdown':
      return resolve(process.cwd(), 'model-picker-export.md');
    case 'json':
    default:
      return resolve(process.cwd(), 'model-picker-export.json');
  }
}

async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function findSourceWorkspaceRoot(startDir = process.cwd()): Promise<string | null> {
  let current = startDir;

  while (true) {
    try {
      await access(resolve(current, 'apps/cli/package.json'));
      await access(resolve(current, 'apps/tui/package.json'));
      await access(resolve(current, 'packages/ingest/package.json'));
      return current;
    } catch {
      const parent = resolve(current, '..');
      if (parent === current) {
        return null;
      }

      current = parent;
    }
  }
}

async function runWorkspaceCommand(
  label: 'sync' | 'tui',
  script: 'sync' | 'dev:tui',
  options: { args?: string[]; env?: Record<string, string> } = {},
): Promise<void> {
  const workspaceRoot = await findSourceWorkspaceRoot();
  if (!workspaceRoot) {
    console.error(
      `The ${label} command is only available from a model-picker source checkout. Clone https://github.com/byhow/model-picker and run bun install first.`,
    );
    process.exit(1);
  }

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('bun', ['run', script, ...(options.args ?? [])], {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...options.env,
      },
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`bun run ${script} exited with code ${code ?? 1}`));
    });
  });
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

  const hasSpeedData = models.some((model) => (model.speed.bestThroughput ?? 0) > 0);
  const fastest = [...models].sort(
    (a, b) => (b.speed.bestThroughput ?? 0) - (a.speed.bestThroughput ?? 0),
  )[0];
  const cheapest = [...models]
    .filter((model) => Number.isFinite(model.pricing.outputPerMillion) && model.pricing.outputPerMillion >= 0)
    .sort((a, b) => a.pricing.outputPerMillion - b.pricing.outputPerMillion)[0];
  const longest = [...models].sort((a, b) => b.contextLength - a.contextLength)[0];

  console.log('\nSummary');
  console.log(
    hasSpeedData
      ? `- Fastest: ${fastest?.id ?? 'N/A'} (${fastest?.speed.bestThroughput?.toFixed(0) ?? 'N/A'} tok/s)`
      : '- Fastest: N/A (speed data unavailable)',
  );
  console.log(`- Cheapest: ${cheapest?.id ?? 'N/A'} (${cheapest ? formatPricePerMillion(cheapest.pricing.outputPerMillion) : 'N/A'})`);
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
    if (!key || !value) {
      throw new CliUsageError(
        'Invalid --weights value. Use speed=0.5,price=0.3,context=0.2.',
      );
    }

    if (!WEIGHT_KEYS.includes(key as (typeof WEIGHT_KEYS)[number])) {
      throw new CliUsageError(
        `Unknown weight key: ${key}. Use one of ${WEIGHT_KEYS.join(', ')}.`,
      );
    }

    const numericValue = Number.parseFloat(value || '');
    if (!Number.isFinite(numericValue)) {
      throw new CliUsageError(
        'Invalid --weights value. Use speed=0.5,price=0.3,context=0.2.',
      );
    }

    parsed[key as keyof ScoreWeights] = numericValue;
  }

  return parsed;
}

function normalizeCliText(value: string): string {
  return value.trim().toLowerCase();
}

function parseModalities(
  value: string | string[] | undefined,
  kind: 'input' | 'output',
): string[] {
  const normalized = normalizeCsvList(value);
  const allowed: string[] =
    kind === 'input' ? [...INPUT_MODALITIES] : [...OUTPUT_MODALITIES];
  const invalid = normalized.filter((entry) => !allowed.includes(entry));

  if (invalid.length > 0) {
    throw new CliUsageError(
      `Unsupported ${kind} modality: ${invalid.join(', ')}. Use one of ${allowed.join(', ')}.`,
    );
  }

  return normalized;
}

function hasGetFilters(options: {
  inputModalities?: string | string[];
  outputModalities?: string | string[];
  categories?: string | string[];
  maxPrice?: unknown;
  zdr?: boolean;
}): boolean {
  return Boolean(
    normalizeCsvList(options.inputModalities).length ||
      normalizeCsvList(options.outputModalities).length ||
      normalizeCsvList(options.categories).length ||
      options.maxPrice !== undefined ||
      options.zdr,
  );
}

function findExactLocalModel(models: ModelRecord[], query: string): ModelRecord | null {
  return models.find((model) => isExactLocalMatch(model, query)) ?? null;
}

function findLocalMatches(models: ModelRecord[], query: string): ModelRecord[] {
  const normalizedQuery = normalizeCliText(query);
  if (!normalizedQuery) {
    return [];
  }

  return models.filter((model) => localQueryHaystack(model).includes(normalizedQuery));
}

function normalizeLegacyArgs(argv: string[]): { argv: string[]; warnings: string[] } {
  const normalized = [...argv];
  const warnings: string[] = [];
  const command = normalized[2];

  if (!command) {
    return { argv: normalized, warnings };
  }

  const replacement = LEGACY_COMMAND_ALIASES.get(command);
  if (replacement) {
    normalized[2] = replacement;
    warnings.push(`\`${command}\` is deprecated. Use \`${replacement}\` instead.`);
  }

  return { argv: normalized, warnings };
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);

  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let previous = rows[0] ?? 0;
    rows[0] = rightIndex;

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = rows[leftIndex] ?? 0;
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      rows[leftIndex] = Math.min(
        (rows[leftIndex] ?? 0) + 1,
        (rows[leftIndex - 1] ?? 0) + 1,
        previous + substitutionCost,
      );
      previous = current;
    }
  }

  return rows[left.length] ?? right.length;
}

function suggestClosestMatch(input: string, candidates: string[]): string[] {
  const normalizedInput = normalizeCliText(input);

  return candidates
    .map((candidate) => {
      const normalizedCandidate = normalizeCliText(candidate);
      const startsWith = normalizedCandidate.startsWith(normalizedInput);
      const includes = normalizedCandidate.includes(normalizedInput);
      const distance = levenshteinDistance(normalizedInput, normalizedCandidate);

      return {
        candidate,
        score: startsWith ? 0 : includes ? 1 : distance + 2,
        distance,
      };
    })
    .filter(
      (entry) =>
        entry.distance <= Math.max(3, Math.floor(normalizedInput.length / 2)) ||
        entry.score <= 1,
    )
    .sort((left, right) => left.score - right.score || left.distance - right.distance)
    .slice(0, 3)
    .map((entry) => entry.candidate);
}

function collectOptionNames(): string[] {
  const globalOptions = cli.globalCommand.options ?? [];
  const commandOptions = cli.matchedCommand?.options ?? [];
  const names = new Set<string>();

  for (const option of [...globalOptions, ...commandOptions]) {
    for (const match of option.rawName.matchAll(/--[A-Za-z0-9-]+/g)) {
      names.add(match[0]);
    }
  }

  return [...names];
}

function printSuggestions(suggestions: string[]): void {
  if (suggestions.length === 0) {
    return;
  }

  console.error(`Try: ${suggestions.join(' or ')}`);
}

function printScopedHelp(scope: 'command' | 'global'): void {
  console.error('');
  if (scope === 'command' && cli.matchedCommand) {
    cli.outputHelp();
    return;
  }

  cli.outputHelp();
}

function handleCliActionError(error: unknown): never {
  if (error instanceof CliUsageError) {
    console.error(`Error: ${error.message}`);
    printSuggestions(error.suggestions);
    printScopedHelp(error.helpScope);
    process.exit(1);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}

function isCacError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'CACError';
}

function handleParseError(error: unknown): never {
  if (error instanceof CliUsageError) {
    handleCliActionError(error);
  }

  if (!isCacError(error)) {
    handleCliActionError(error);
  }

  const message = error.message;
  const unknownOption = message.match(/Unknown option `([^`]+)`/);
  if (unknownOption?.[1]) {
    const suggestions = suggestClosestMatch(unknownOption[1], collectOptionNames());
    handleCliActionError(
      new CliUsageError(
        `Unknown option ${unknownOption[1]}.`,
        cli.matchedCommand ? 'command' : 'global',
        suggestions,
      ),
    );
  }

  if (message.includes('required args')) {
    handleCliActionError(new CliUsageError('Missing required command arguments.'));
  }

  if (message.includes('option value is missing')) {
    handleCliActionError(new CliUsageError('Missing a value for one of the provided options.'));
  }

  handleCliActionError(new CliUsageError(message, cli.matchedCommand ? 'command' : 'global'));
}

async function withLiveCredentials<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (!isMissingFirecrawlCredentialsError(error)) {
      throw error;
    }

    throw new Error(firecrawlSetupHint());
  }
}

function formatLiveModelSummary(entry: Awaited<ReturnType<typeof getOpenRouterModel>>): string {
  if (!entry) {
    return '';
  }

  const { model } = entry;
  return [
    `${model.name} (${model.id})`,
    `Source: ${entry.sourceUrl}`,
    `Created: ${entry.createdAt ?? 'N/A'}`,
    `Input: ${formatPricePerMillion(model.pricing.inputPerMillion)}`,
    `Output: ${formatPricePerMillion(model.pricing.outputPerMillion)}`,
    `Context: ${model.contextLength.toLocaleString()} tokens`,
    `Input modalities: ${model.architecture.inputModalities.join(', ') || 'N/A'}`,
    `Output modalities: ${model.architecture.outputModalities.join(', ') || 'N/A'}`,
    `Categories: ${entry.categories.join(', ') || 'N/A'}`,
    `Moderated: ${model.topProvider.isModerated ? 'Yes' : 'No'}`,
  ].join('\n');
}

async function resolveLocalGetState(query: string, limit: number): Promise<{
  snapshotGeneratedAt: string;
  exactModel: ModelRecord | null;
  matches: ModelRecord[];
}> {
  const snapshot = await loadSnapshot();
  const exactModel = findExactLocalModel(snapshot.models, query);
  const matches = exactModel
    ? [exactModel]
    : rankLocalMatches(findLocalMatches(snapshot.models, query), query).slice(
        0,
        Math.max(1, limit),
      );

  return {
    snapshotGeneratedAt: snapshot.generatedAt,
    exactModel,
    matches,
  };
}

function printLocalGetMatches(
  query: string,
  snapshotGeneratedAt: string,
  matches: ModelRecord[],
): void {
  if (matches.length === 0) {
    console.log(`No local snapshot models matched "${query}".`);
    console.log('Try `model-picker top --limit 20` or rerun with broader terms.');
    return;
  }

  console.log(`Source: ${formatSnapshotSource(snapshotGeneratedAt)}`);
  console.log(`Candidates for "${query}":`);
  printRows(matches.map(toModelRow));
  console.log('Tip: rerun `model-picker get <full-id> --details` for live metadata.');
}

function toLocalGetJsonPayload(
  query: string,
  snapshotGeneratedAt: string,
  exactModel: ModelRecord | null,
  matches: ModelRecord[],
): Record<string, unknown> {
  if (exactModel) {
    return {
      mode: 'snapshot-summary',
      source: 'snapshot',
      query,
      snapshotGeneratedAt,
      sourceUrl: buildOpenRouterModelUrl(exactModel.id),
      model: exactModel,
    };
  }

  return {
    mode: 'snapshot-search',
    source: 'snapshot',
    query,
    snapshotGeneratedAt,
    matchedCount: matches.length,
    models: matches,
  };
}

function toLiveGetJsonPayload(
  query: string,
  entry: NonNullable<Awaited<ReturnType<typeof getOpenRouterModel>>>,
): Record<string, unknown> {
  return {
    mode: 'live-detail',
    source: 'live',
    query,
    sourceUrl: entry.sourceUrl,
    createdAt: entry.createdAt,
    categories: entry.categories,
    model: entry.model,
  };
}

function toSnapshotFallbackJsonPayload(
  query: string,
  snapshotGeneratedAt: string,
  model: ModelRecord,
  timeoutSeconds: number,
): Record<string, unknown> {
  return {
    mode: 'snapshot-fallback',
    source: 'snapshot',
    query,
    snapshotGeneratedAt,
    sourceUrl: buildOpenRouterModelUrl(model.id),
    model,
    fallback: {
      reason: 'timeout',
      timeoutSeconds,
    },
  };
}

async function runCli(): Promise<void> {
  const { argv, warnings } = normalizeLegacyArgs(process.argv);

  for (const warning of warnings) {
    console.warn(`Deprecated: ${warning}`);
  }

  if (argv.length <= 2) {
    cli.outputHelp();
    return;
  }

  try {
    const parsed = cli.parse(argv, { run: false });

    if (parsed.options.help || parsed.options.version) {
      return;
    }

    if (!cli.matchedCommand && parsed.args[0]) {
      const command = String(parsed.args[0]);
      throw new CliUsageError(
        `Unknown command: ${command}.`,
        'global',
        suggestClosestMatch(command, PUBLIC_COMMANDS),
      );
    }

    await cli.runMatchedCommand();
  } catch (error) {
    handleParseError(error);
  }
}

cli
  .command('top', 'List live OpenRouter models')
  .option('--order <order>', 'most-popular|top-weekly|newest', {
    default: 'most-popular',
  })
  .option('--input-modalities <modalities>', 'Comma-separated input modalities')
  .option('--output-modalities <modalities>', 'Comma-separated output modalities')
  .option('--categories <categories>', 'Comma-separated categories')
  .option('--max-price <price>', 'Max prompt/input price per million')
  .option('--zdr', 'Only include zero-data-retention models')
  .option('--limit <limit>', 'Limit rows', {
    default: '10',
  })
  .example('model-picker top --order top-weekly --limit 20')
  .example('model-picker top --categories programming --input-modalities text,image')
  .action(async (options) => {
    try {
      const result = await withLiveCredentials(() =>
        queryOpenRouterModels({
          order: parseOpenRouterOrder(options.order),
          inputModalities: parseModalities(options.inputModalities, 'input'),
          outputModalities: parseModalities(options.outputModalities, 'output'),
          categories: normalizeCsvList(options.categories),
          maxPrice: parseOptionalFloat(options.maxPrice),
          zdr: Boolean(options.zdr),
          limit: parsePositiveInt(options.limit, 10),
        }),
      );

      console.log(`Source: ${result.sourceUrl}`);
      if (result.matchedCount !== null) {
        console.log(`Matched: ${result.matchedCount} models`);
      }
      printLiveRows(result.models);
    } catch (error) {
      handleCliActionError(error);
    }
  });

cli
  .command('onboard', 'Set up Firecrawl credentials for fallback scraping')
  .option('--firecrawl-api-key <key>', 'Save Firecrawl API key non-interactively')
  .example('model-picker onboard')
  .example('model-picker onboard --firecrawl-api-key fc-your-key')
  .action(async (options) => {
    try {
      const result = await runOnboarding({
        firecrawlApiKey:
          typeof options.firecrawlApiKey === 'string'
            ? options.firecrawlApiKey
            : undefined,
      });

      console.log(`Saved Firecrawl config to ${result.configPath}`);
    } catch (error) {
      handleCliActionError(error);
    }
  });

cli
  .command('configure', 'Alias for onboard')
  .option('--firecrawl-api-key <key>', 'Save Firecrawl API key non-interactively')
  .action(async (options) => {
    try {
      const result = await runOnboarding({
        firecrawlApiKey:
          typeof options.firecrawlApiKey === 'string'
            ? options.firecrawlApiKey
            : undefined,
      });

      console.log(`Saved Firecrawl config to ${result.configPath}`);
    } catch (error) {
      handleCliActionError(error);
    }
  });

cli
  .command('get [query]', 'Find models or show one model')
  .option('--order <order>', 'most-popular|top-weekly|newest', {
    default: 'most-popular',
  })
  .option('--input-modalities <modalities>', 'Comma-separated input modalities')
  .option('--output-modalities <modalities>', 'Comma-separated output modalities')
  .option('--categories <categories>', 'Comma-separated categories')
  .option('--max-price <price>', 'Max prompt/input price per million')
  .option('--zdr', 'Only include zero-data-retention models')
  .option('--details', 'Fetch live details for an exact model id or name')
  .option('--json', 'Return machine-readable JSON')
  .option('--timeout <seconds>', 'Timeout for live detail/discovery fetches', {
    default: '20',
  })
  .option('--limit <limit>', 'Limit rows', {
    default: '8',
  })
  .example('model-picker get openai/gpt-5.4')
  .example('model-picker get claude')
  .example('model-picker get openai/gpt-5.4 --details --timeout 20')
  .example('model-picker get openai/gpt-5.4 --json')
  .example('model-picker get coding --categories programming --max-price 5 --timeout 20')
  .action(async (query, options) => {
    try {
      const normalizedQuery = typeof query === 'string' ? query.trim() : '';
      if (!normalizedQuery) {
        throw new CliUsageError('Provide a model id or search query.', 'command', [
          'model-picker get claude',
          'model-picker get openai/gpt-5.4',
          'model-picker get openai/gpt-5.4 --details',
        ]);
      }

      const wantsDetails = Boolean(options.details);
      const wantsJson = Boolean(options.json);
      const timeoutSeconds = parsePositiveInt(options.timeout, 20);
      const limit = parsePositiveInt(options.limit, 8);
      const hasLiveFilters = hasGetFilters(options);
      const localState = await resolveLocalGetState(normalizedQuery, limit);

      if (wantsDetails && hasLiveFilters) {
        throw new CliUsageError(
          '`--details` cannot be combined with discovery filters. Use an exact model id or name only.',
          'command',
          [
            'model-picker get openai/gpt-5.4 --details',
            'model-picker get claude',
            'model-picker get coding --categories programming',
          ],
        );
      }

      if (!wantsDetails && !hasLiveFilters) {
        if (wantsJson) {
          emitJson(
            toLocalGetJsonPayload(
              normalizedQuery,
              localState.snapshotGeneratedAt,
              localState.exactModel,
              localState.matches,
            ),
          );
          return;
        }

        if (localState.exactModel) {
          console.log(
            formatSnapshotModelSummary(
              localState.exactModel,
              localState.snapshotGeneratedAt,
            ),
          );
          return;
        }

        printLocalGetMatches(
          normalizedQuery,
          localState.snapshotGeneratedAt,
          localState.matches,
        );
        return;
      }

      if (wantsDetails) {
        if (!localState.exactModel) {
          throw new CliUsageError(
            '`--details` requires an exact model id or exact model name from the local snapshot.',
            'command',
            [
              'model-picker get claude',
              'model-picker get openai/gpt-5.4 --details',
              'model-picker get openai/gpt-5.4 --details --json',
            ],
          );
        }

        console.error(
          `Fetching live details for ${localState.exactModel.id} (timeout ${timeoutSeconds}s)...`,
        );

        try {
          const model = await withTimeout(
            withLiveCredentials(() => getOpenRouterModel(localState.exactModel!.id)),
            timeoutSeconds,
          );

          if (!model) {
            throw new CliUsageError(`Model not found: ${localState.exactModel.id}.`);
          }

          if (wantsJson) {
            emitJson(toLiveGetJsonPayload(normalizedQuery, model));
            return;
          }

          console.log(formatLiveModelSummary(model));
          return;
        } catch (error) {
          if (error instanceof LiveFetchTimeoutError) {
            console.error(
              `Live details timed out after ${timeoutSeconds}s. Falling back to ${formatSnapshotSource(localState.snapshotGeneratedAt)}.`,
            );

            if (wantsJson) {
              emitJson(
                toSnapshotFallbackJsonPayload(
                  normalizedQuery,
                  localState.snapshotGeneratedAt,
                  localState.exactModel,
                  timeoutSeconds,
                ),
              );
              return;
            }

            console.log(
              formatSnapshotModelSummary(
                localState.exactModel,
                localState.snapshotGeneratedAt,
              ),
            );
            return;
          }

          throw error;
        }
      }

      console.error(
        `Fetching live candidates for "${normalizedQuery}" (timeout ${timeoutSeconds}s)...`,
      );

      const result = await withTimeout(
        withLiveCredentials(() =>
          queryOpenRouterModels({
            order: parseOpenRouterOrder(options.order),
            q: normalizedQuery,
            inputModalities: parseModalities(options.inputModalities, 'input'),
            outputModalities: parseModalities(options.outputModalities, 'output'),
            categories: normalizeCsvList(options.categories),
            maxPrice: parseOptionalFloat(options.maxPrice),
            zdr: Boolean(options.zdr),
            limit,
          }),
        ),
        timeoutSeconds,
      );

      if (result.models.length === 0) {
        console.log(`No models matched "${normalizedQuery}".`);
        console.log('Try `model-picker top --limit 20` or broaden your filters.');
        return;
      }

      if (wantsJson) {
        emitJson({
          mode: 'live-search',
          source: 'live',
          query: normalizedQuery,
          sourceUrl: result.sourceUrl,
          matchedCount: result.matchedCount,
          models: result.models,
        });
        return;
      }

      console.log(`Source: ${result.sourceUrl}`);
      if (result.matchedCount !== null) {
        console.log(`Matched: ${result.matchedCount} models`);
      }
      console.log(`Candidates for "${normalizedQuery}":`);
      printLiveRows(result.models);
      console.log('Tip: rerun `model-picker get <full-id> --details` to fetch live metadata.');
    } catch (error) {
      if (error instanceof LiveFetchTimeoutError) {
        handleCliActionError(
          new CliUsageError(
            `Live discovery timed out after ${error.timeoutSeconds}s. Retry with a higher --timeout or rerun without live filters to use the local snapshot.`,
            'command',
            [
              `model-picker get ${typeof query === 'string' ? query.trim() : ''}`.trim(),
              `model-picker get ${typeof query === 'string' ? query.trim() : ''} --timeout ${error.timeoutSeconds * 2}`.trim(),
              'model-picker top --limit 20',
            ],
          ),
        );
      }

      handleCliActionError(error);
    }
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
  .example('model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4')
  .example('model-picker compare --interactive --sort price')
  .action(async (ids: string[] = [], options) => {
    try {
      let targetIds = ids;

      if (options.interactive) {
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
        throw new CliUsageError(
          'Provide model ids to compare, or rerun with --interactive.',
          'command',
          [
            'model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4',
            'model-picker compare --interactive --sort price',
          ],
        );
      }

      targetIds = [...new Set(targetIds)];
      const models = await compareModels(targetIds);
      if (models.length === 0) {
        console.log('No matching models found for compare.');
        return;
      }

      printRows(models.map(toModelRow));
      compareSummary(models);
    } catch (error) {
      handleCliActionError(error);
    }
  });

cli
  .command('pick', 'Recommend best-fit models by weighted score')
  .option('--task <task>', 'coding|vision|budget|long-context|fast')
  .option('--weights <weights>', 'speed=0.5,price=0.3,context=0.2')
  .option('--filter <filter>', 'Filter expression before scoring')
  .option('--limit <limit>', 'Limit recommendations', {
    default: '5',
  })
  .example('model-picker pick --task coding --limit 5')
  .example('model-picker pick --weights speed=0.5,price=0.3,context=0.2')
  .action(async (options) => {
    try {
      const picks = await pickModels({
        task: options.task,
        filter: options.filter,
        limit: parsePositiveInt(options.limit, 5),
        weights: parseWeights(options.weights),
      });

      if (picks.length === 0) {
        console.log('No models matched your pick criteria.');
        return;
      }

      printPickRows(picks);
    } catch (error) {
      handleCliActionError(error);
    }
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
  .example('model-picker export --format markdown --limit 25')
  .example('model-picker export --format json --output ./models.json')
  .action(async (options) => {
    try {
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

      await ensureParentDirectory(outputPath);
      await writeFile(outputPath, payload, 'utf8');
      console.log(`Exported ${rows.length} models to ${outputPath} (${format})`);
    } catch (error) {
      handleCliActionError(error);
    }
  });

cli
  .command('sync', 'Repo-only: sync the local full-catalog snapshot')
  .option('--subset <subset>', 'full|top-providers-10', {
    default: 'full',
  })
  .example('model-picker sync')
  .example('model-picker sync --subset top-providers-10')
  .action(async (options) => {
    try {
      const subset = parseSyncSubset(options.subset);
      await runWorkspaceCommand('sync', 'sync', {
        env: {
          MP_SYNC_SUBSET: subset,
        },
      });
    } catch (error) {
      handleCliActionError(error);
    }
  });

cli.command('tui', 'Repo-only: launch the source TUI').example('model-picker tui').action(async () => {
  try {
    await runWorkspaceCommand('tui', 'dev:tui');
  } catch (error) {
    handleCliActionError(error);
  }
});

cli.command('doctor', 'Check local snapshot health').action(async () => {
  const snapshot = await loadSnapshot();
  const modelsWithSpeed = snapshot.models.filter(
    (model) => (model.speed.bestThroughput ?? 0) > 0,
  ).length;
  const liveAccessMode = await describeOpenRouterAccessMode();
  const firecrawlFallbackMode = await describeOpenRouterFirecrawlFallbackMode();
  console.log(`Snapshot generated at: ${snapshot.generatedAt}`);
  console.log(`Tracked models: ${snapshot.count}`);
  console.log(
    `Snapshot scope: ${snapshot.count >= 200 ? 'full catalog' : 'legacy frontier subset'}`,
  );
  console.log(`Models with speed data: ${modelsWithSpeed}`);
  console.log(`Live OpenRouter access: ${liveAccessMode}`);
  console.log(`Firecrawl fallback: ${firecrawlFallbackMode}`);
  console.log(`Config path: ${resolveModelPickerConfigPath()}`);
  if (modelsWithSpeed === 0) {
    console.log('Warning: speed metrics are unavailable in the current snapshot.');
  }
  if (snapshot.count < 200) {
    console.log('Tip: run `model-picker sync` from a source checkout to cache the full catalog locally.');
  }
  if (firecrawlFallbackMode === 'missing') {
    console.log('Optional: run `model-picker onboard` to configure Firecrawl as a fallback source.');
  }
});

cli.help();
await runCli();

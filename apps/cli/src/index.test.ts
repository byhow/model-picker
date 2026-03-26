import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCli, withOpenRouterFixtures, withTempDir } from './cli-test-lib';

const LIVE_HEADER = /ID\s+INPUT\s+OUTPUT\s+CONTEXT\s+NAME/;
const SNAPSHOT_HEADER = /ID\s+PRICE\s+SPEED\s+CONTEXT\s+NAME/;
const PICK_HEADER = /SCORE\s+ID\s+PRICE\s+SPEED\s+CONTEXT\s+REASONS/;

describe('cli smoke tests', () => {
  test('supports version output', async () => {
    const result = await runCli(['--version']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('model-picker/0.1.0');
  });

  test('shows help and examples when invoked without a command', async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('model-picker doctor');
    expect(result.stdout).toContain('model-picker get claude');
    expect(result.stdout).toContain('model-picker get openai/gpt-5.4 --details --timeout 20');
  });

  test('shows friendly help for unknown commands and mistyped options', async () => {
    const unknownCommand = await runCli(['toop']);
    const unknownOption = await runCli(['top', '--limt', '1']);

    expect(unknownCommand.exitCode).toBe(1);
    expect(unknownCommand.stderr).toContain('Unknown command: toop.');
    expect(unknownCommand.stderr).toContain('Try: top');
    expect(unknownCommand.stdout).toContain('Commands:');

    expect(unknownOption.exitCode).toBe(1);
    expect(unknownOption.stderr).toContain('Unknown option --limt.');
    expect(unknownOption.stderr).toContain('--limit');
    expect(unknownOption.stdout).toContain('top');
  });

  test('doctor reports snapshot metadata', async () => {
    const result = await runCli(['doctor']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Snapshot generated at:');
    expect(result.stdout).toContain('Tracked models:');
    expect(result.stdout).toContain('Snapshot scope:');
    expect(result.stdout).toContain('Live OpenRouter access:');
    expect(result.stdout).toContain('Firecrawl fallback:');
    expect(result.stdout).toContain('Preferred agents:');
    expect(result.stdout).toContain('Config path:');
  });

  test('doctor supports machine-readable json output', async () => {
    const result = await runCli(['doctor', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      snapshotGeneratedAt: expect.any(String),
      trackedModels: expect.any(Number),
      projectSkillDirs: expect.objectContaining({
        amp: expect.any(String),
      }),
      globalSkillDirs: expect.objectContaining({
        opencode: expect.any(String),
      }),
    });
  });

  test('onboard saves config and doctor detects config-based access', async () => {
    await withTempDir(async (tempDir) => {
      const configDir = join(tempDir, 'config');
      const configPath = join(configDir, 'config.json');
      const env = {
        MODEL_PICKER_CONFIG_DIR: configDir,
      };

      const onboard = await runCli(
        ['onboard', '--firecrawl-api-key', 'fc-test-key'],
        { env },
      );
      const doctor = await runCli(['doctor'], { env });

      expect(onboard.exitCode).toBe(0);
      expect(onboard.stdout).toContain(configPath);
      expect(doctor.exitCode).toBe(0);
      expect(doctor.stdout).toContain('Live OpenRouter access: frontend api');
      expect(doctor.stdout).toContain('Firecrawl fallback: config file');
      expect(doctor.stdout).toContain(`Config path: ${configPath}`);
    });
  });

  test('onboard skips replacement when FIRECRAWL_API_KEY is already set non-interactively', async () => {
    await withTempDir(async (tempDir) => {
      const configDir = join(tempDir, 'config');
      const configPath = join(configDir, 'config.json');
      const env = {
        MODEL_PICKER_CONFIG_DIR: configDir,
        FIRECRAWL_API_KEY: 'fc-env-key',
      };

      const onboard = await runCli(['onboard'], { env });
      const doctor = await runCli(['doctor'], { env });

      expect(onboard.exitCode).toBe(0);
      expect(onboard.stdout).toContain(configPath);
      expect(doctor.exitCode).toBe(0);
      expect(doctor.stdout).toContain('Live OpenRouter access: frontend api');
      expect(doctor.stdout).toContain('Firecrawl fallback: FIRECRAWL_API_KEY');
    });
  });

  test('top remains live while get defaults to local snapshot discovery', async () => {
    await withOpenRouterFixtures(async ({ env }) => {
      const top = await runCli(
        [
          'top',
          '--order',
          'most-popular',
          '--input-modalities',
          'text,image',
          '--output-modalities',
          'image',
          '--categories',
          'programming',
          '--max-price',
          '0.5',
          '--zdr',
          '--limit',
          '5',
        ],
        { env },
      );
      const get = await runCli(['get', 'claude', '--limit', '5'], { env });
      const searchAlias = await runCli(['search', 'claude', '--limit', '5'], { env });

      expect(top.exitCode).toBe(0);
      expect(top.stdout).toContain('Source: https://openrouter.ai/models?categories=programming');
      expect(top.stdout).toMatch(LIVE_HEADER);
      expect(top.stdout).not.toContain('\t');
      expect(get.exitCode).toBe(0);
      expect(get.stdout).toContain('Source: local snapshot');
      expect(get.stdout).toContain('Candidates for "claude":');
      expect(get.stdout).toMatch(SNAPSHOT_HEADER);
      expect(get.stdout).not.toContain('\t');
      expect(get.stdout).toContain('anthropic/claude-opus-4.6');
      expect(get.stdout).toContain('anthropic/claude-sonnet-4.5');
      expect(get.stdout).not.toContain('q=claude');

      expect(searchAlias.exitCode).toBe(0);
      expect(searchAlias.stderr).toContain('Deprecated: `search` is deprecated. Use `get` instead.');
      expect(searchAlias.stdout).toContain('Candidates for "claude":');
    });
  });

  test('get summary, get details, compare, and pick succeed for known models', async () => {
    await withOpenRouterFixtures(async ({ env }) => {
      const get = await runCli(['get', 'openai/gpt-5.4'], { env });
      const getDetails = await runCli(['get', 'openai/gpt-5.4', '--details'], { env });
      const compare = await runCli([
        'compare',
        'anthropic/claude-opus-4.6',
        'openai/gpt-5.4',
      ]);
      const pick = await runCli(['pick', '--task', 'coding', '--limit', '3']);

      expect(get.exitCode).toBe(0);
      expect(get.stdout).toContain('Source: local snapshot');
      expect(get.stdout).toContain('OpenRouter: https://openrouter.ai/openai/gpt-5.4');
      expect(getDetails.exitCode).toBe(0);
      expect(getDetails.stderr).toContain('Fetching live details for openai/gpt-5.4');
      expect(getDetails.stdout).toContain('Source: https://openrouter.ai/openai/gpt-5.4');
      expect(getDetails.stdout).toContain('Categories: Programming, Finance, Marketing, Legal, Academia');
      expect(compare.exitCode).toBe(0);
      expect(compare.stdout).toMatch(SNAPSHOT_HEADER);
      expect(compare.stdout).not.toContain('\t');
      expect(compare.stdout).toContain('Summary');
      expect(pick.exitCode).toBe(0);
      expect(pick.stdout).toMatch(PICK_HEADER);
      expect(pick.stdout).not.toContain('\t');
    });
  });

  test('pick supports agent presets and json payloads', async () => {
    await withOpenRouterFixtures(async ({ env }) => {
      const result = await runCli(
        ['pick', '--agent', 'opencode', '--limit', '2', '--json'],
        { env },
      );

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        mode: 'pick',
        source: 'snapshot',
        task: 'agent',
        agent: 'opencode',
        count: 2,
      });
    });
  });

  test('get supports machine-readable json output and timeout fallback', async () => {
    await withOpenRouterFixtures(async ({ env }) => {
      const jsonSummary = await runCli(['get', 'openai/gpt-5.4', '--json'], { env });
      const timeoutFallback = await runCli(
        ['get', 'openai/gpt-5.4', '--details', '--timeout', '1', '--json'],
        {
          env: {
            ...env,
            MODEL_PICKER_OPENROUTER_MODEL_DELAY_MS: '1500',
          },
        },
      );

      expect(jsonSummary.exitCode).toBe(0);
      expect(JSON.parse(jsonSummary.stdout)).toMatchObject({
        mode: 'snapshot-summary',
        source: 'snapshot',
        model: { id: 'openai/gpt-5.4' },
      });

      expect(timeoutFallback.exitCode).toBe(0);
      expect(timeoutFallback.stderr).toContain('Fetching live details for openai/gpt-5.4');
      expect(timeoutFallback.stderr).toContain('Live details timed out after 1s');
      expect(JSON.parse(timeoutFallback.stdout)).toMatchObject({
        mode: 'snapshot-fallback',
        source: 'snapshot',
        model: { id: 'openai/gpt-5.4' },
        fallback: { reason: 'timeout', timeoutSeconds: 1 },
      });
    });
  });

  test('get without a query shows command help instead of a stack trace', async () => {
    const result = await runCli(['get']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Provide a model id or search query.');
    expect(result.stdout).toContain('model-picker get openai/gpt-5.4');
  });

  test('compare without ids returns an error plus examples instead of prompting', async () => {
    const result = await runCli(['compare']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Provide model ids to compare, or rerun with --interactive.');
    expect(result.stdout).toContain('model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4');
  });

  test('sync is repo-only outside a source checkout', async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(['sync'], { cwd: tempDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('only available from a source checkout');
    });
  });

  test('live commands still work without Firecrawl because frontend data is primary', async () => {
    await withOpenRouterFixtures(async ({ env }) => {
      await withTempDir(async (tempDir) => {
        const result = await runCli(['top', '--limit', '1'], {
          env: {
            ...env,
            MODEL_PICKER_OPENROUTER_API_FIXTURE:
              env.MODEL_PICKER_OPENROUTER_API_FIXTURE!,
            MODEL_PICKER_CONFIG_DIR: join(tempDir, 'empty-config'),
            FIRECRAWL_API_KEY: '',
          },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Source: https://openrouter.ai/models?fmt=cards&order=most-popular');
      });
    });
  });

  test('export writes files outside the repo cwd', async () => {
    await withTempDir(async (tempDir) => {
      const output = join(tempDir, 'models.md');
      const result = await runCli(
        ['export', '--format', 'markdown', '--limit', '3', '--output', output],
        { cwd: tempDir },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(output);

      const content = await readFile(output, 'utf8');
      expect(content).toContain('| ID | Name | Output /M |');
    });
  });
});

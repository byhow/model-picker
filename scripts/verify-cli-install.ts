#!/usr/bin/env bun

import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const cliDir = resolve(root, 'apps/cli');

async function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const pathEnv = process.env.PATH ?? '';
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      MODEL_PICKER_TERM_WIDTH: env.MODEL_PICKER_TERM_WIDTH ?? '120',
      ...env,
      PATH: `${join(cwd, 'node_modules/.bin')}:${pathEnv}`,
    },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${cmd.join(' ')} failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  return { stdout, stderr };
}

async function createOpenRouterFixtures(baseDir: string): Promise<Record<string, string>> {
  const apiFixture = join(baseDir, 'openrouter-api.json');
  const frontendModelsFixture = join(baseDir, 'openrouter-frontend-models.json');
  const modelsFixture = join(baseDir, 'openrouter-models.md');
  const searchFixture = join(baseDir, 'openrouter-search.md');
  const modelFixture = join(baseDir, 'openrouter-model-page.md');

  await writeFile(
    apiFixture,
    JSON.stringify(
      {
        data: [
          {
            id: 'openai/gpt-5.4',
            name: 'OpenAI: GPT-5.4',
            description: 'GPT-5.4 is OpenAI’s latest frontier model for coding and multimodal analysis.',
            created: 1772734366,
            context_length: 1050000,
            pricing: {
              prompt: '0.0000025',
              completion: '0.000015',
            },
            top_provider: {
              context_length: 1050000,
              max_completion_tokens: 128000,
              is_moderated: true,
            },
            architecture: {
              modality: 'text+image->text',
              input_modalities: ['text', 'image'],
              output_modalities: ['text'],
            },
          },
          {
            id: 'anthropic/claude-opus-4.6',
            name: 'Anthropic: Claude Opus 4.6',
            description: 'Anthropic’s strongest model for coding and long-running professional tasks.',
            created: 1769875200,
            context_length: 1000000,
            pricing: {
              prompt: '0.000005',
              completion: '0.000025',
            },
            top_provider: {
              context_length: 1000000,
              max_completion_tokens: 32000,
              is_moderated: true,
            },
            architecture: {
              modality: 'text+image->text',
              input_modalities: ['text', 'image'],
              output_modalities: ['text'],
            },
          },
          {
            id: 'anthropic/claude-sonnet-4.5',
            name: 'Anthropic: Claude Sonnet 4.5',
            description: 'Anthropic’s balanced model for coding, research, and everyday agent workflows.',
            created: 1767225600,
            context_length: 1000000,
            pricing: {
              prompt: '0.000003',
              completion: '0.000015',
            },
            top_provider: {
              context_length: 1000000,
              max_completion_tokens: 32000,
              is_moderated: true,
            },
            architecture: {
              modality: 'text+image->text',
              input_modalities: ['text', 'image'],
              output_modalities: ['text'],
            },
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  await writeFile(
    frontendModelsFixture,
    JSON.stringify(
      {
        data: {
          models: [
            {
              slug: 'openai/gpt-5.4',
              permaslug: 'openai/gpt-5.4-20260305',
              name: 'OpenAI: GPT-5.4',
              description: 'GPT-5.4 is OpenAI’s latest frontier model for coding and multimodal analysis.',
              created_at: '2026-03-05T18:12:32+00:00',
              context_length: 1050000,
              input_modalities: ['text', 'image', 'file'],
              output_modalities: ['text'],
              endpoint: {
                context_length: 1050000,
                max_completion_tokens: 128000,
                moderation_required: true,
                provider_name: 'OpenAI',
                provider_slug: 'openai',
                data_policy: { retainsPrompts: true },
                pricing: { prompt: '0.0000025', completion: '0.000015' },
              },
            },
            {
              slug: 'anthropic/claude-opus-4.6',
              permaslug: 'anthropic/claude-opus-4.6-20260201',
              name: 'Anthropic: Claude Opus 4.6',
              description: 'Anthropic’s strongest model for coding and long-running professional tasks.',
              created_at: '2026-02-01T00:00:00+00:00',
              context_length: 1000000,
              input_modalities: ['text', 'image'],
              output_modalities: ['text'],
              endpoint: {
                context_length: 1000000,
                max_completion_tokens: 32000,
                moderation_required: true,
                provider_name: 'Anthropic',
                provider_slug: 'anthropic',
                data_policy: { retainsPrompts: true },
                pricing: { prompt: '0.000005', completion: '0.000025' },
              },
            },
            {
              slug: 'anthropic/claude-sonnet-4.5',
              permaslug: 'anthropic/claude-sonnet-4.5-20260101',
              name: 'Anthropic: Claude Sonnet 4.5',
              description: 'Anthropic’s balanced model for coding, research, and everyday agent workflows.',
              created_at: '2026-01-01T00:00:00+00:00',
              context_length: 1000000,
              input_modalities: ['text', 'image'],
              output_modalities: ['text'],
              endpoint: {
                context_length: 1000000,
                max_completion_tokens: 32000,
                moderation_required: true,
                provider_name: 'Anthropic',
                provider_slug: 'anthropic',
                data_policy: { retainsPrompts: true },
                pricing: { prompt: '0.000003', completion: '0.000015' },
              },
            },
          ],
          analytics: {},
          categories: {
            'openai/gpt-5.4-20260305': [
              { category: 'academia', rank: 41 },
              { category: 'finance', rank: 21 },
              { category: 'legal', rank: 39 },
              { category: 'marketing', rank: 27 },
            ],
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  await writeFile(
    modelsFixture,
    `# Models

653 models

- [OpenAI: GPT-5.4GPT-5.4](https://openrouter.ai/openai/gpt-5.4)

[GPT-5.4 is OpenAI’s latest frontier model.](https://openrouter.ai/openai/gpt-5.4)

- [Anthropic: Claude Opus 4.6Claude Opus 4.6](https://openrouter.ai/anthropic/claude-opus-4.6)

[Opus 4.6 is Anthropic’s strongest coding model.](https://openrouter.ai/anthropic/claude-opus-4.6)
`,
    'utf8',
  );

  await writeFile(
    searchFixture,
    `# Models

2 models

- [Anthropic: Claude Opus 4.6Claude Opus 4.6](https://openrouter.ai/anthropic/claude-opus-4.6)

[Opus 4.6 is Anthropic’s strongest coding model.](https://openrouter.ai/anthropic/claude-opus-4.6)

- [Anthropic: Claude Sonnet 4.5Claude Sonnet 4.5](https://openrouter.ai/anthropic/claude-sonnet-4.5)

[Sonnet 4.5 is Anthropic’s balanced coding model.](https://openrouter.ai/anthropic/claude-sonnet-4.5)
`,
    'utf8',
  );

  await writeFile(
    modelFixture,
    `# OpenAI: GPT-5.4

Academia (#41)

Finance (#21)

Legal (#39)

Marketing (#27)

Standard
`,
    'utf8',
  );

  return {
    MODEL_PICKER_OPENROUTER_API_FIXTURE: apiFixture,
    MODEL_PICKER_OPENROUTER_FRONTEND_MODELS_FIXTURE: frontendModelsFixture,
    MODEL_PICKER_OPENROUTER_MODELS_FIXTURE: modelsFixture,
    MODEL_PICKER_OPENROUTER_SEARCH_FIXTURE: searchFixture,
    MODEL_PICKER_OPENROUTER_MODEL_FIXTURE: modelFixture,
  };
}

const tempDir = await mkdtemp(join(tmpdir(), 'model-picker-install-'));

try {
  const liveEnv = await createOpenRouterFixtures(tempDir);
  await run(['bun', 'install'], root);
  await run(['bun', 'run', 'build'], root);
  await run(['bun', 'run', 'prepare:cli-package'], root);
  const packed = await run(['npm', 'pack'], cliDir);
  const tarball = packed.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!tarball) {
    throw new Error('npm pack did not produce a tarball name');
  }

  const tarballPath = resolve(cliDir, tarball);
  await run(['npm', 'init', '-y'], tempDir);
  await run(['npm', 'install', tarballPath], tempDir);
  const npxDoctor = await run(['npx', 'model-picker', 'doctor'], tempDir);
  if (npxDoctor.stdout.includes('Tracked models: 0')) {
    throw new Error('npx model-picker doctor reported zero tracked models');
  }

  await run(['model-picker', '--version'], tempDir);
  const aliasDoctor = await run(['mp', 'doctor'], tempDir);
  if (aliasDoctor.stdout.includes('Tracked models: 0')) {
    throw new Error('mp doctor reported zero tracked models');
  }

  const topResult = await run(['model-picker', 'top', '--limit', '3'], tempDir, liveEnv);
  if (!/ID\s+INPUT\s+OUTPUT\s+CONTEXT\s+NAME/.test(topResult.stdout)) {
    throw new Error('model-picker top did not print the expected table header');
  }
  if (topResult.stdout.includes('\t')) {
    throw new Error('model-picker top still printed a tab-separated table');
  }

  const configDir = join(tempDir, 'config');
  const configEnv = {
    MODEL_PICKER_CONFIG_DIR: configDir,
  };
  const onboardResult = await run(
    ['model-picker', 'onboard', '--firecrawl-api-key', 'fc-install-test'],
    tempDir,
    configEnv,
  );
  if (!onboardResult.stdout.includes(join(configDir, 'config.json'))) {
    throw new Error('model-picker onboard did not report the saved config path');
  }
  const configDoctor = await run(['model-picker', 'doctor'], tempDir, configEnv);
  if (!configDoctor.stdout.includes('Live OpenRouter access: frontend api')) {
    throw new Error('doctor did not report frontend api as the primary live source');
  }
  if (!configDoctor.stdout.includes('Firecrawl fallback: config file')) {
    throw new Error('doctor did not detect config-based Firecrawl setup');
  }

  const getResult = await run(['model-picker', 'get', 'claude', '--limit', '2'], tempDir, liveEnv);
  if (!getResult.stdout.toLowerCase().includes('claude')) {
    throw new Error('model-picker get did not return expected local discovery results');
  }
  if (!getResult.stdout.includes('Source: local snapshot')) {
    throw new Error('model-picker get did not use the local snapshot by default');
  }

  const exactGetResult = await run(['model-picker', 'get', 'openai/gpt-5.4', '--details'], tempDir, liveEnv);
  if (!exactGetResult.stdout.includes('Source: https://openrouter.ai/openai/gpt-5.4')) {
    throw new Error('model-picker get --details did not return expected live details');
  }


  const globalNpmDir = join(tempDir, 'npm-global');
  await run(['npm', 'install', '-g', tarballPath, '--prefix', globalNpmDir], tempDir);
  await access(join(globalNpmDir, 'bin', 'model-picker'));
  await access(join(globalNpmDir, 'bin', 'mp'));

  const installedEntrypoint = join(
    globalNpmDir,
    'lib/node_modules/model-picker/dist/index.js',
  );
  const globalDoctor = await run(['node', installedEntrypoint, 'doctor'], tempDir);
  if (globalDoctor.stdout.includes('Tracked models: 0')) {
    throw new Error('global model-picker doctor reported zero tracked models');
  }

  const exportPath = join(tempDir, 'export.json');
  await run(
    ['model-picker', 'export', '--format', 'json', '--limit', '2', '--output', exportPath],
    tempDir,
  );
  const content = await readFile(exportPath, 'utf8');
  if (!content.includes('generatedAt')) {
    throw new Error('export output did not contain generatedAt');
  }

  const nodeDoctor = await run(['node', resolve(root, 'apps/cli/dist/index.js'), 'doctor'], tempDir);
  if (nodeDoctor.stdout.includes('Tracked models: 0')) {
    throw new Error('node dist/index.js doctor reported zero tracked models');
  }

  await run(['bun', 'run', 'build:cli-bin'], root);
  const binaryDoctor = await run([resolve(root, 'apps/cli/dist/model-picker'), 'doctor'], tempDir);
  if (binaryDoctor.stdout.includes('Tracked models: 0')) {
    throw new Error('compiled model-picker binary reported zero tracked models');
  }

  console.log('CLI install verification passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

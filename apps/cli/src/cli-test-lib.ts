import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const CLI_ENTRY = resolve(fileURLToPath(new URL('./index.ts', import.meta.url)));

function resolveBunBin(): string {
  const candidates = [
    Bun.which('bun'),
    process.execPath,
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, 'bin', 'bun') : null,
  ].filter((p): p is string => p !== null);

  for (const candidate of candidates) {
    try {
      return realpathSync(candidate);
    } catch {
      // candidate doesn't exist or can't be resolved, try next
    }
  }

  return candidates[0] ?? 'bun';
}

const BUN_BIN = resolveBunBin();
const BUN_DIR = resolve(BUN_BIN, '..');

export async function runCli(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<CommandResult> {
  const env = {
    ...process.env,
    MODEL_PICKER_TERM_WIDTH: options.env?.MODEL_PICKER_TERM_WIDTH ?? '120',
    ...options.env,
    PATH: `${BUN_DIR}:${process.env.PATH ?? ''}`,
    BUN_INSTALL: process.env.BUN_INSTALL ?? join(process.env.HOME ?? '', '.bun'),
    BUN_BE_BUN: '1',
  };

  return new Promise<CommandResult>((resolve) => {
    const quotedArgs = [BUN_BIN, CLI_ENTRY, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
    const proc = spawn('/bin/sh', ['-c', quotedArgs], {
      cwd: options.cwd ?? process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

export async function withTempDir<T>(
  fn: (tempDir: string) => Promise<T>,
): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), `${basename(CLI_ENTRY, '.ts')}-`));
  try {
    return await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export interface OpenRouterFixtureSet {
  env: Record<string, string>;
  dir: string;
}

const OPENROUTER_API_FIXTURE = JSON.stringify(
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
      {
        id: 'google/gemini-2.5-flash',
        name: 'Google: Gemini 2.5 Flash',
        description: 'Google’s fast workhorse multimodal model.',
        created: 1750118400,
        context_length: 1048576,
        pricing: {
          prompt: '0.0000003',
          completion: '0.0000025',
        },
        top_provider: {
          context_length: 1048576,
          max_completion_tokens: 65536,
          is_moderated: false,
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
);

const OPENROUTER_FRONTEND_MODELS_FIXTURE = JSON.stringify(
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
            pricing: {
              prompt: '0.0000025',
              completion: '0.000015',
            },
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
            pricing: {
              prompt: '0.000005',
              completion: '0.000025',
            },
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
            pricing: {
              prompt: '0.000003',
              completion: '0.000015',
            },
          },
        },
        {
          slug: 'google/gemini-2.5-flash',
          permaslug: 'google/gemini-2.5-flash-20250617',
          name: 'Google: Gemini 2.5 Flash',
          description: 'Google’s fast workhorse multimodal model.',
          created_at: '2025-06-17T00:00:00+00:00',
          context_length: 1048576,
          input_modalities: ['text', 'image'],
          output_modalities: ['image'],
          endpoint: {
            context_length: 1048576,
            max_completion_tokens: 65536,
            moderation_required: false,
            provider_name: 'Google',
            provider_slug: 'google',
            data_policy: { retainsPrompts: false },
            pricing: {
              prompt: '0.0000003',
              completion: '0.0000025',
            },
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
          { category: 'programming', rank: 15 },
        ],
        'anthropic/claude-opus-4.6-20260201': [
          { category: 'programming', rank: 2 },
        ],
        'anthropic/claude-sonnet-4.5-20260101': [
          { category: 'programming', rank: 3 },
        ],
        'google/gemini-2.5-flash-20250617': [
          { category: 'programming', rank: 4 },
        ],
      },
    },
  },
  null,
  2,
);

const LOCAL_SNAPSHOT_FIXTURE = JSON.stringify(
  {
    generatedAt: '2026-03-21T00:00:00.000Z',
    count: 4,
    models: [
      {
        id: 'openai/gpt-5.4',
        name: 'OpenAI: GPT-5.4',
        description: 'GPT-5.4 is OpenAI’s latest frontier model for coding and multimodal analysis.',
        contextLength: 1050000,
        pricing: {
          inputPerMillion: 2.5,
          outputPerMillion: 15,
        },
        topProvider: {
          contextLength: 1050000,
          maxCompletionTokens: 128000,
          isModerated: true,
        },
        architecture: {
          modality: 'text+image->text',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        speed: {
          providers: [
            { name: 'OpenAI', throughput: 43, latency: 1.2 },
          ],
          bestThroughput: 43,
          avgThroughput: 43,
        },
        rank: { bySpeed: 2, byPrice: 3, byContext: 1 },
      },
      {
        id: 'anthropic/claude-opus-4.6',
        name: 'Anthropic: Claude Opus 4.6',
        description: 'Anthropic’s strongest model for coding and long-running professional tasks.',
        contextLength: 1000000,
        pricing: {
          inputPerMillion: 5,
          outputPerMillion: 25,
        },
        topProvider: {
          contextLength: 1000000,
          maxCompletionTokens: 32000,
          isModerated: true,
        },
        architecture: {
          modality: 'text+image->text',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        speed: {
          providers: [
            { name: 'Anthropic', throughput: 18, latency: 1.8 },
          ],
          bestThroughput: 18,
          avgThroughput: 18,
        },
        rank: { bySpeed: 4, byPrice: 4, byContext: 3 },
      },
      {
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Anthropic: Claude Sonnet 4.5',
        description: 'Anthropic’s balanced model for coding, research, and everyday agent workflows.',
        contextLength: 1000000,
        pricing: {
          inputPerMillion: 3,
          outputPerMillion: 15,
        },
        topProvider: {
          contextLength: 1000000,
          maxCompletionTokens: 32000,
          isModerated: true,
        },
        architecture: {
          modality: 'text+image->text',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        speed: {
          providers: [
            { name: 'Anthropic', throughput: 39, latency: 0.9 },
          ],
          bestThroughput: 39,
          avgThroughput: 39,
        },
        rank: { bySpeed: 3, byPrice: 2, byContext: 4 },
      },
      {
        id: 'google/gemini-2.5-flash',
        name: 'Google: Gemini 2.5 Flash',
        description: 'Google’s fast workhorse multimodal model.',
        contextLength: 1048576,
        pricing: {
          inputPerMillion: 0.3,
          outputPerMillion: 2.5,
        },
        topProvider: {
          contextLength: 1048576,
          maxCompletionTokens: 65536,
          isModerated: false,
        },
        architecture: {
          modality: 'text+image->text',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        speed: {
          providers: [
            { name: 'Google', throughput: 92, latency: 0.5 },
          ],
          bestThroughput: 92,
          avgThroughput: 92,
        },
        rank: { bySpeed: 1, byPrice: 1, byContext: 2 },
      },
    ],
  },
  null,
  2,
);

const OPENROUTER_MODELS_PAGE_FIXTURE = `# Models

653 models

- [OpenAI: GPT-5.4GPT-5.4](https://openrouter.ai/openai/gpt-5.4)

11.1B tokens

[GPT-5.4 is OpenAI’s latest frontier model.](https://openrouter.ai/openai/gpt-5.4)

by [openai](https://openrouter.ai/openai)Mar 5, 20261.05M context$2.50/M input tokens$15/M output tokens

- [Anthropic: Claude Opus 4.6Claude Opus 4.6](https://openrouter.ai/anthropic/claude-opus-4.6)

350B tokens

[Opus 4.6 is Anthropic’s strongest coding model.](https://openrouter.ai/anthropic/claude-opus-4.6)

by [anthropic](https://openrouter.ai/anthropic)Feb 4, 20261M context$5/M input tokens$25/M output tokens

- [Google: Gemini 2.5 FlashGemini 2.5 Flash](https://openrouter.ai/google/gemini-2.5-flash)

599B tokens

[Gemini 2.5 Flash is Google’s fast workhorse model.](https://openrouter.ai/google/gemini-2.5-flash)

by [google](https://openrouter.ai/google)Jun 17, 20251.05M context$0.30/M input tokens$2.50/M output tokens
`;

const OPENROUTER_SEARCH_PAGE_FIXTURE = `# Models

2 models

- [Anthropic: Claude Opus 4.6Claude Opus 4.6](https://openrouter.ai/anthropic/claude-opus-4.6)

350B tokens

[Opus 4.6 is Anthropic’s strongest coding model.](https://openrouter.ai/anthropic/claude-opus-4.6)

by [anthropic](https://openrouter.ai/anthropic)Feb 4, 20261M context$5/M input tokens$25/M output tokens

- [Anthropic: Claude Sonnet 4.5Claude Sonnet 4.5](https://openrouter.ai/anthropic/claude-sonnet-4.5)

420B tokens

[Sonnet 4.5 is Anthropic’s balanced coding model.](https://openrouter.ai/anthropic/claude-sonnet-4.5)

by [anthropic](https://openrouter.ai/anthropic)Jan 1, 20261M context$3/M input tokens$15/M output tokens
`;

const OPENROUTER_MODEL_PAGE_FIXTURE = `# OpenAI: GPT-5.4

### [openai](https://openrouter.ai/openai)/gpt-5.4

Released Mar 5, 20261,050,000 context

$2.50/M input tokens$15/M output tokens$10/K web search

Academia (#41)

Finance (#21)

Legal (#39)

Marketing (#27)

Standard
`;

export async function withOpenRouterFixtures<T>(
  fn: (fixtures: OpenRouterFixtureSet) => Promise<T>,
): Promise<T> {
  return withTempDir(async (tempDir) => {
    const apiFixture = join(tempDir, 'openrouter-api.json');
    const frontendModelsFixture = join(tempDir, 'openrouter-frontend-models.json');
    const modelsFixture = join(tempDir, 'openrouter-models.md');
    const searchFixture = join(tempDir, 'openrouter-search.md');
    const modelFixture = join(tempDir, 'openrouter-model-page.md');
    const snapshotFixture = join(tempDir, 'snapshot.json');

    await writeFile(apiFixture, OPENROUTER_API_FIXTURE, 'utf8');
    await writeFile(frontendModelsFixture, OPENROUTER_FRONTEND_MODELS_FIXTURE, 'utf8');
    await writeFile(modelsFixture, OPENROUTER_MODELS_PAGE_FIXTURE, 'utf8');
    await writeFile(searchFixture, OPENROUTER_SEARCH_PAGE_FIXTURE, 'utf8');
    await writeFile(modelFixture, OPENROUTER_MODEL_PAGE_FIXTURE, 'utf8');
    await writeFile(snapshotFixture, LOCAL_SNAPSHOT_FIXTURE, 'utf8');

    return fn({
      dir: tempDir,
      env: {
        MODEL_PICKER_OPENROUTER_API_FIXTURE: apiFixture,
        MODEL_PICKER_OPENROUTER_FRONTEND_MODELS_FIXTURE: frontendModelsFixture,
        MODEL_PICKER_OPENROUTER_MODELS_FIXTURE: modelsFixture,
        MODEL_PICKER_OPENROUTER_SEARCH_FIXTURE: searchFixture,
        MODEL_PICKER_OPENROUTER_MODEL_FIXTURE: modelFixture,
        MODEL_PICKER_SNAPSHOT_FIXTURE: snapshotFixture,
      },
    });
  });
}

export interface SkillsFixtureSet {
  dir: string;
  source: string;
  env: Record<string, string>;
}

const REACT_BEST_PRACTICES_SKILL = `---
name: react-best-practices
description: React and Next.js performance optimization guidelines. Use for React code reviews and implementation.
---

# React Best Practices

Use this skill when working on React performance and architecture.
`;

const WEB_DESIGN_SKILL = `---
name: web-design-guidelines
description: Review UI code for accessibility, performance, and UX concerns. Use for frontend audits.
---

# Web Design Guidelines

Use this skill when reviewing user interface quality.
`;

const INTERNAL_SKILL = `---
name: internal-only-skill
description: Internal-only checks for unpublished workflows.
metadata:
  internal: true
---

# Internal Skill

This skill should be hidden unless INSTALL_INTERNAL_SKILLS is enabled.
`;

export async function withLocalSkillsFixture<T>(
  fn: (fixtures: SkillsFixtureSet) => Promise<T>,
): Promise<T> {
  return withTempDir(async (tempDir) => {
    const sourceDir = join(tempDir, 'skills-source');
    const skillsDir = join(sourceDir, 'skills');
    const reactDir = join(skillsDir, 'react-best-practices');
    const webDir = join(skillsDir, 'web-design-guidelines');
    const internalDir = join(skillsDir, 'internal-only-skill');
    const configDir = join(tempDir, 'config');

    await mkdir(reactDir, { recursive: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(internalDir, { recursive: true });
    await mkdir(configDir, { recursive: true });

    await Bun.write(join(reactDir, 'SKILL.md'), REACT_BEST_PRACTICES_SKILL);
    await Bun.write(join(webDir, 'SKILL.md'), WEB_DESIGN_SKILL);
    await Bun.write(join(internalDir, 'SKILL.md'), INTERNAL_SKILL);

    return fn({
      dir: tempDir,
      source: sourceDir,
      env: {
        MODEL_PICKER_CONFIG_DIR: configDir,
        HOME: tempDir,
      },
    });
  });
}

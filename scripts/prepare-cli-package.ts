#!/usr/bin/env bun

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const cliDataDir = resolve(root, 'apps/cli/data');
const fullSnapshot = resolve(root, 'data/snapshots/latest.full.json');
const fallbackSnapshot = resolve(root, 'apps/web/src/data/models.json');

const cliReadme = resolve(root, 'apps/cli/README.md');
const cliLicense = resolve(root, 'apps/cli/LICENSE');
const cliChangelog = resolve(root, 'apps/cli/CHANGELOG.md');
const cliSkill = resolve(root, 'apps/cli/SKILL.md');
const cliLlmsTxt = resolve(root, 'apps/cli/llms.txt');

// skills-npm compatible mirror
const cliSkillsDir = resolve(root, 'apps/cli/skills/model-picker');
const cliSkillsSkill = resolve(cliSkillsDir, 'SKILL.md');
const cliSkillsLlmsTxt = resolve(cliSkillsDir, 'llms.txt');

await mkdir(cliDataDir, { recursive: true });
await mkdir(cliSkillsDir, { recursive: true });

const canonicalSnapshot = (await Bun.file(fullSnapshot).exists())
  ? Bun.file(fullSnapshot)
  : Bun.file(fallbackSnapshot);

await Bun.write(resolve(cliDataDir, 'latest.full.json'), canonicalSnapshot);
await Bun.write(resolve(cliDataDir, 'models.json'), Bun.file(fallbackSnapshot));
await Bun.write(cliReadme, Bun.file(resolve(root, 'README.md')));
await Bun.write(cliLicense, Bun.file(resolve(root, 'LICENSE')));
await Bun.write(cliChangelog, Bun.file(resolve(root, 'CHANGELOG.md')));

// Root-level skill files (for experimental_sync)
await Bun.write(cliSkill, Bun.file(resolve(root, 'SKILL.md')));
await Bun.write(cliLlmsTxt, Bun.file(resolve(root, 'llms.txt')));

// skills/model-picker/ mirror (for skills-npm)
await Bun.write(cliSkillsSkill, Bun.file(resolve(root, 'SKILL.md')));
await Bun.write(cliSkillsLlmsTxt, Bun.file(resolve(root, 'llms.txt')));

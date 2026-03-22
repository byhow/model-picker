#!/usr/bin/env bun

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const cliDataDir = resolve(root, 'apps/cli/data');
const fullSnapshot = resolve(root, 'data/snapshots/latest.full.json');
const fallbackSnapshot = resolve(root, 'apps/web/src/data/models.json');
const cliReadme = resolve(root, 'apps/cli/README.md');
const cliLicense = resolve(root, 'apps/cli/LICENSE');

await mkdir(cliDataDir, { recursive: true });

const canonicalSnapshot = (await Bun.file(fullSnapshot).exists())
  ? Bun.file(fullSnapshot)
  : Bun.file(fallbackSnapshot);

await Bun.write(resolve(cliDataDir, 'latest.full.json'), canonicalSnapshot);
await Bun.write(resolve(cliDataDir, 'models.json'), Bun.file(fallbackSnapshot));
await Bun.write(cliReadme, Bun.file(resolve(root, 'README.md')));
await Bun.write(cliLicense, Bun.file(resolve(root, 'LICENSE')));

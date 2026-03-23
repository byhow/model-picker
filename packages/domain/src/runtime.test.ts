import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolvePackageRoot,
  resolveWorkspaceRoot,
} from './runtime';

describe('runtime', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'runtime-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('resolvePackageRoot', () => {
    test('returns directory of import.meta.url', () => {
      const importMetaUrl = 'file:///Users/test/project/src/index.ts';
      const result = resolvePackageRoot(importMetaUrl);
      expect(result).toBe('/Users/test/project/src');
    });

    test('handles nested paths', () => {
      const importMetaUrl = 'file:///Users/test/project/packages/domain/src/runtime.ts';
      const result = resolvePackageRoot(importMetaUrl);
      expect(result).toBe('/Users/test/project/packages/domain/src');
    });

    test('handles windows-style paths', () => {
      const importMetaUrl = 'file:///C:/Users/test/project/src/index.ts';
      const result = resolvePackageRoot(importMetaUrl);
      expect(result).toBe('/C:/Users/test/project/src');
    });
  });

  describe('resolveWorkspaceRoot', () => {
    test('finds workspace root with workspaces field', async () => {
      const workspaceDir = join(tempDir, 'workspace');
      const packageDir = join(workspaceDir, 'packages', 'domain', 'src');
      await mkdir(packageDir, { recursive: true });

      await writeFile(
        join(workspaceDir, 'package.json'),
        JSON.stringify({ name: 'workspace', workspaces: ['packages/*'] }),
      );

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl, 3);
      expect(result).toBe(workspaceDir);
    });

    test('falls back to relative levels when no workspace root found', async () => {
      const packageDir = join(tempDir, 'packages', 'domain', 'src');
      await mkdir(packageDir, { recursive: true });

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl, 3);
      expect(result).toBe(tempDir);
    });

    test('uses default fallback levels of 3', async () => {
      const packageDir = join(tempDir, 'packages', 'domain', 'src');
      await mkdir(packageDir, { recursive: true });

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl);
      expect(result).toBe(tempDir);
    });

    test('handles workspace with yarn workspaces config', async () => {
      const workspaceDir = join(tempDir, 'yarn-workspace');
      const packageDir = join(workspaceDir, 'apps', 'cli', 'src');
      await mkdir(packageDir, { recursive: true });

      await writeFile(
        join(workspaceDir, 'package.json'),
        JSON.stringify({
          name: 'yarn-workspace',
          workspaces: {
            packages: ['apps/*', 'packages/*'],
          },
        }),
      );

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl, 3);
      expect(result).toBe(workspaceDir);
    });

    test('handles workspace with bun workspaces config', async () => {
      const workspaceDir = join(tempDir, 'bun-workspace');
      const packageDir = join(workspaceDir, 'libs', 'core', 'src');
      await mkdir(packageDir, { recursive: true });

      await writeFile(
        join(workspaceDir, 'package.json'),
        JSON.stringify({ workspaces: ['libs/*'] }),
      );

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl, 3);
      expect(result).toBe(workspaceDir);
    });

    test('stops at filesystem root when no workspace found', async () => {
      const packageDir = join(tempDir, 'deep', 'nested', 'dir', 'src');
      await mkdir(packageDir, { recursive: true });

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl, 10);
      expect(typeof result).toBe('string');
    });

    test('handles package.json without workspaces field', async () => {
      const projectDir = join(tempDir, 'project');
      const packageDir = join(projectDir, 'src');
      await mkdir(packageDir, { recursive: true });

      await writeFile(
        join(projectDir, 'package.json'),
        JSON.stringify({ name: 'regular-package', workspaces: ['packages/*'] }),
      );

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl, 3);
      expect(result).toBe(projectDir);
    });

    test('handles missing package.json gracefully', async () => {
      const packageDir = join(tempDir, 'orphan', 'package', 'src');
      await mkdir(packageDir, { recursive: true });

      const importMetaUrl = `file://${packageDir}/index.ts`;
      const result = await resolveWorkspaceRoot(importMetaUrl, 3);
      expect(result).toBe(tempDir);
    });
  });
});

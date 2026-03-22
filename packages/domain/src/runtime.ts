import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function looksLikeWorkspaceRoot(candidateDir: string): Promise<boolean> {
  const packagePath = resolve(candidateDir, 'package.json');

  try {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
      workspaces?: unknown;
    };

    return Boolean(packageJson.workspaces);
  } catch {
    return false;
  }
}

async function findWorkspaceRoot(startDir: string): Promise<string | null> {
  let current = startDir;

  while (true) {
    if (await looksLikeWorkspaceRoot(current)) {
      return current;
    }

    const parent = resolve(current, '..');
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function resolvePackageRoot(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

export async function resolveWorkspaceRoot(
  importMetaUrl: string,
  fallbackLevels = 3,
): Promise<string> {
  const packageRoot = resolvePackageRoot(importMetaUrl);
  const workspaceStart = resolve(packageRoot, '..');
  const discovered = await findWorkspaceRoot(workspaceStart);
  if (discovered) {
    return discovered;
  }

  return resolve(workspaceStart, ...Array.from({ length: fallbackLevels - 1 }, () => '..'));
}

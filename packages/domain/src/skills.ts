import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveModelPickerConfigDir } from './config';

export const SUPPORTED_AGENTS = [
  'amp',
  'opencode',
  'claude-code',
  'codex',
  'cursor',
] as const;

export type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

export type SkillInstallScope = 'project' | 'global';

export type SkillInstallMethod = 'symlink' | 'copy';

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string | boolean>;
  'allowed-tools'?: string;
}

export interface InstalledSkillRecord {
  skill: string;
  source: string;
  sourceType?: 'local' | 'remote';
  resolvedSource?: string;
  sourceRef?: string;
  sourceCommit?: string;
  scope: SkillInstallScope;
  method: SkillInstallMethod;
  agents: SupportedAgent[];
  installedAt: string;
  targetPaths: string[];
}

export interface SkillsManifest {
  version: 1;
  updatedAt: string;
  installs: InstalledSkillRecord[];
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function resolveGlobalConfigDir(appName: string): string {
  if (process.platform === 'win32') {
    return join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      appName,
    );
  }

  const xdgConfigHome = envValue('XDG_CONFIG_HOME');
  if (xdgConfigHome) {
    return join(xdgConfigHome, appName);
  }

  return join(homedir(), '.config', appName);
}

export function resolveProjectAgentSkillsDir(
  agent: SupportedAgent,
  cwd = process.cwd(),
): string {
  const root = resolve(cwd);

  switch (agent) {
    case 'claude-code':
      return join(root, '.claude', 'skills');
    case 'amp':
    case 'opencode':
    case 'codex':
    case 'cursor':
      return join(root, '.agents', 'skills');
    default: {
      const exhaustive: never = agent;
      return exhaustive;
    }
  }
}

export function resolveGlobalAgentSkillsDir(agent: SupportedAgent): string {
  switch (agent) {
    case 'amp':
      return join(resolveGlobalConfigDir('agents'), 'skills');
    case 'opencode':
      return join(resolveGlobalConfigDir('opencode'), 'skills');
    case 'codex':
      return join(homedir(), '.codex', 'skills');
    case 'cursor':
      return join(homedir(), '.cursor', 'skills');
    case 'claude-code':
      return join(homedir(), '.claude', 'skills');
    default: {
      const exhaustive: never = agent;
      return exhaustive;
    }
  }
}

export function resolveAgentSkillsDir(
  agent: SupportedAgent,
  scope: SkillInstallScope,
  cwd = process.cwd(),
): string {
  if (scope === 'global') {
    return resolveGlobalAgentSkillsDir(agent);
  }

  return resolveProjectAgentSkillsDir(agent, cwd);
}

export function resolveModelPickerSkillsStateDir(
  scope: SkillInstallScope,
  cwd = process.cwd(),
): string {
  if (scope === 'global') {
    return join(resolveModelPickerConfigDir(), 'skills');
  }

  return join(resolve(cwd), '.model-picker', 'skills');
}

export function resolveModelPickerSkillsManifestPath(
  scope: SkillInstallScope,
  cwd = process.cwd(),
): string {
  return join(resolveModelPickerSkillsStateDir(scope, cwd), 'manifest.json');
}

export function isSupportedAgent(value: string): value is SupportedAgent {
  return SUPPORTED_AGENTS.includes(value as SupportedAgent);
}

export function defaultSkillsManifest(): SkillsManifest {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    installs: [],
  };
}

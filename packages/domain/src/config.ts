import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  SkillInstallMethod,
  SkillInstallScope,
  SupportedAgent,
} from './skills';

export interface ModelPickerConfig {
  firecrawlApiKey?: string;
  defaults?: {
    agent?: SupportedAgent;
    pickTask?:
      | 'agent'
      | 'coding'
      | 'review'
      | 'budget'
      | 'fast'
      | 'long-context'
      | 'vision';
    installScope?: SkillInstallScope;
    installMethod?: SkillInstallMethod;
  };
  skills?: {
    preferredAgents?: SupportedAgent[];
    lastUsedSource?: string;
  };
}

export type FirecrawlCredentialSource = 'env' | 'config' | 'missing';

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function readEnvironmentFirecrawlApiKey(): string | null {
  return envValue('FIRECRAWL_API_KEY');
}

export function resolveModelPickerConfigDir(): string {
  const override = envValue('MODEL_PICKER_CONFIG_DIR');
  if (override) {
    return override;
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'model-picker');
  }

  const xdgConfigHome = envValue('XDG_CONFIG_HOME');
  if (xdgConfigHome) {
    return join(xdgConfigHome, 'model-picker');
  }

  return join(homedir(), '.config', 'model-picker');
}

export function resolveModelPickerConfigPath(): string {
  return join(resolveModelPickerConfigDir(), 'config.json');
}

export async function loadModelPickerConfig(): Promise<ModelPickerConfig> {
  try {
    const raw = await readFile(resolveModelPickerConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as ModelPickerConfig;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveModelPickerConfig(config: ModelPickerConfig): Promise<void> {
  await mkdir(resolveModelPickerConfigDir(), { recursive: true });
  await writeFile(resolveModelPickerConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

export async function resolveFirecrawlApiKey(): Promise<string | null> {
  const envKey = readEnvironmentFirecrawlApiKey();
  if (envKey) {
    return envKey;
  }

  const config = await loadModelPickerConfig();
  const configKey = config.firecrawlApiKey?.trim();
  return configKey ? configKey : null;
}

export async function describeFirecrawlCredentialSource(): Promise<FirecrawlCredentialSource> {
  if (readEnvironmentFirecrawlApiKey()) {
    return 'env';
  }

  const config = await loadModelPickerConfig();
  if (config.firecrawlApiKey?.trim()) {
    return 'config';
  }

  return 'missing';
}

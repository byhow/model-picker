import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readEnvironmentFirecrawlApiKey,
  resolveModelPickerConfigDir,
  resolveModelPickerConfigPath,
  loadModelPickerConfig,
  saveModelPickerConfig,
  resolveFirecrawlApiKey,
  describeFirecrawlCredentialSource,
} from './config';

describe('config', () => {
  let origConfigDir: string | undefined;
  let origFirecrawlKey: string | undefined;
  let origXdg: string | undefined;
  let tempDir: string;

  beforeEach(async () => {
    origConfigDir = process.env.MODEL_PICKER_CONFIG_DIR;
    origFirecrawlKey = process.env.FIRECRAWL_API_KEY;
    origXdg = process.env.XDG_CONFIG_HOME;
    tempDir = await mkdtemp(join(tmpdir(), 'config-test-'));
    process.env.MODEL_PICKER_CONFIG_DIR = tempDir;
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(async () => {
    if (origConfigDir !== undefined) process.env.MODEL_PICKER_CONFIG_DIR = origConfigDir;
    else delete process.env.MODEL_PICKER_CONFIG_DIR;
    if (origFirecrawlKey !== undefined) process.env.FIRECRAWL_API_KEY = origFirecrawlKey;
    else delete process.env.FIRECRAWL_API_KEY;
    if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
    else delete process.env.XDG_CONFIG_HOME;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('readEnvironmentFirecrawlApiKey', () => {
    test('returns null when env var is not set', () => {
      delete process.env.FIRECRAWL_API_KEY;
      expect(readEnvironmentFirecrawlApiKey()).toBeNull();
    });

    test('returns null when env var is empty', () => {
      process.env.FIRECRAWL_API_KEY = '   ';
      expect(readEnvironmentFirecrawlApiKey()).toBeNull();
    });

    test('returns trimmed value when env var is set', () => {
      process.env.FIRECRAWL_API_KEY = '  my-key  ';
      expect(readEnvironmentFirecrawlApiKey()).toBe('my-key');
    });
  });

  describe('resolveModelPickerConfigDir', () => {
    test('returns override from MODEL_PICKER_CONFIG_DIR env var', () => {
      process.env.MODEL_PICKER_CONFIG_DIR = '/custom/dir';
      expect(resolveModelPickerConfigDir()).toBe('/custom/dir');
    });

    test('uses XDG_CONFIG_HOME when set and no override', () => {
      delete process.env.MODEL_PICKER_CONFIG_DIR;
      process.env.XDG_CONFIG_HOME = '/xdg/config';
      expect(resolveModelPickerConfigDir()).toBe(
        join('/xdg/config', 'model-picker'),
      );
    });

    test('falls back to ~/.config/model-picker', () => {
      delete process.env.MODEL_PICKER_CONFIG_DIR;
      delete process.env.XDG_CONFIG_HOME;
      const result = resolveModelPickerConfigDir();
      expect(result).toContain('model-picker');
    });
  });

  describe('resolveModelPickerConfigPath', () => {
    test('returns config.json inside config dir', () => {
      expect(resolveModelPickerConfigPath()).toBe(
        join(tempDir, 'config.json'),
      );
    });
  });

  describe('loadModelPickerConfig', () => {
    test('returns empty object when file does not exist', async () => {
      const config = await loadModelPickerConfig();
      expect(config).toEqual({});
    });

    test('returns empty object for non-object JSON (null)', async () => {
      await mkdir(tempDir, { recursive: true });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(tempDir, 'config.json'), 'null', 'utf8');
      const config = await loadModelPickerConfig();
      expect(config).toEqual({});
    });

    test('returns empty object for non-object JSON (string)', async () => {
      await mkdir(tempDir, { recursive: true });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(tempDir, 'config.json'), '"hello"', 'utf8');
      const config = await loadModelPickerConfig();
      expect(config).toEqual({});
    });
  });

  describe('saveModelPickerConfig / loadModelPickerConfig roundtrip', () => {
    test('saves and loads config correctly', async () => {
      const config = {
        firecrawlApiKey: 'test-key-123',
        defaults: {
          agent: 'amp' as const,
          installScope: 'global' as const,
        },
      };
      await saveModelPickerConfig(config);
      const loaded = await loadModelPickerConfig();
      expect(loaded).toEqual(config);
    });
  });

  describe('resolveFirecrawlApiKey', () => {
    test('returns env var when set', async () => {
      process.env.FIRECRAWL_API_KEY = 'env-key';
      const key = await resolveFirecrawlApiKey();
      expect(key).toBe('env-key');
    });

    test('returns config key when env var not set', async () => {
      delete process.env.FIRECRAWL_API_KEY;
      await saveModelPickerConfig({ firecrawlApiKey: 'config-key' });
      const key = await resolveFirecrawlApiKey();
      expect(key).toBe('config-key');
    });

    test('returns null when neither set', async () => {
      delete process.env.FIRECRAWL_API_KEY;
      const key = await resolveFirecrawlApiKey();
      expect(key).toBeNull();
    });
  });

  describe('describeFirecrawlCredentialSource', () => {
    test('returns env when env var is set', async () => {
      process.env.FIRECRAWL_API_KEY = 'env-key';
      expect(await describeFirecrawlCredentialSource()).toBe('env');
    });

    test('returns config when key is in config file', async () => {
      delete process.env.FIRECRAWL_API_KEY;
      await saveModelPickerConfig({ firecrawlApiKey: 'config-key' });
      expect(await describeFirecrawlCredentialSource()).toBe('config');
    });

    test('returns missing when neither source has key', async () => {
      delete process.env.FIRECRAWL_API_KEY;
      expect(await describeFirecrawlCredentialSource()).toBe('missing');
    });
  });
});

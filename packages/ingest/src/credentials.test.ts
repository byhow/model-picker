import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  describeFirecrawlCredentialSource,
  resolveFirecrawlApiKey,
  saveModelPickerConfig,
} from '@model-picker/domain';

const ORIGINAL_ENV = {
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
  MODEL_PICKER_CONFIG_DIR: process.env.MODEL_PICKER_CONFIG_DIR,
};

async function withConfigDir<T>(fn: (configDir: string) => Promise<T>): Promise<T> {
  const configDir = await mkdtemp(join(tmpdir(), 'model-picker-ingest-config-'));

  process.env.MODEL_PICKER_CONFIG_DIR = configDir;

  try {
    return await fn(configDir);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
}

afterEach(() => {
  if (ORIGINAL_ENV.FIRECRAWL_API_KEY === undefined) {
    delete process.env.FIRECRAWL_API_KEY;
  } else {
    process.env.FIRECRAWL_API_KEY = ORIGINAL_ENV.FIRECRAWL_API_KEY;
  }

  if (ORIGINAL_ENV.MODEL_PICKER_CONFIG_DIR === undefined) {
    delete process.env.MODEL_PICKER_CONFIG_DIR;
  } else {
    process.env.MODEL_PICKER_CONFIG_DIR = ORIGINAL_ENV.MODEL_PICKER_CONFIG_DIR;
  }
});

describe('firecrawl credential resolution', () => {
  test('uses config-backed credentials when FIRECRAWL_API_KEY is unset', async () => {
    delete process.env.FIRECRAWL_API_KEY;

    await withConfigDir(async () => {
      await saveModelPickerConfig({ firecrawlApiKey: 'fc-config-key' });

      await expect(resolveFirecrawlApiKey()).resolves.toBe('fc-config-key');
      await expect(describeFirecrawlCredentialSource()).resolves.toBe('config');
    });
  });

  test('prefers FIRECRAWL_API_KEY over config-backed credentials', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-env-key';

    await withConfigDir(async () => {
      await saveModelPickerConfig({ firecrawlApiKey: 'fc-config-key' });

      await expect(resolveFirecrawlApiKey()).resolves.toBe('fc-env-key');
      await expect(describeFirecrawlCredentialSource()).resolves.toBe('env');
    });
  });
});

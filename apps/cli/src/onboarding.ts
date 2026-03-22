import {
  confirm,
  intro,
  isCancel,
  note,
  outro,
  password,
} from '@clack/prompts';
import {
  loadModelPickerConfig,
  readEnvironmentFirecrawlApiKey,
  resolveModelPickerConfigPath,
  saveModelPickerConfig,
} from './user-config';

export interface OnboardOptions {
  firecrawlApiKey?: string;
}

export interface OnboardResult {
  configPath: string;
  source: 'saved' | 'env';
}

export function supportsInteractivePrompts(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function firecrawlSetupHint(): string {
  return [
    'Set FIRECRAWL_API_KEY or run `model-picker onboard` to enable the Firecrawl fallback.',
    `Config path: ${resolveModelPickerConfigPath()}`,
  ].join('\n');
}

function normalizeApiKey(value: string): string {
  return value.trim();
}

function validateApiKey(value: string): string | undefined {
  if (!value.trim()) {
    return 'Firecrawl API key is required.';
  }

  if (!value.trim().startsWith('fc-')) {
    return 'Firecrawl API keys usually start with `fc-`.';
  }

  return undefined;
}

export async function runOnboarding(
  options: OnboardOptions = {},
): Promise<OnboardResult> {
  const configPath = resolveModelPickerConfigPath();
  const existingConfig = await loadModelPickerConfig();
  const providedApiKey = options.firecrawlApiKey?.trim();
  const environmentApiKey = readEnvironmentFirecrawlApiKey();

  if (providedApiKey) {
    const validationError = validateApiKey(providedApiKey);
    if (validationError) {
      throw new Error(validationError);
    }

    await saveModelPickerConfig({
      ...existingConfig,
      firecrawlApiKey: normalizeApiKey(providedApiKey),
    });
    return { configPath, source: 'saved' };
  }

  if (environmentApiKey) {
    if (!supportsInteractivePrompts()) {
      return { configPath, source: 'env' };
    }

    intro('model-picker onboarding');
    note(
      'FIRECRAWL_API_KEY is already set in your environment. You can keep using that, or save a different key to the config file.',
      'Firecrawl setup',
    );

    const shouldReplace = await confirm({
      message: 'Save a different Firecrawl key to config?',
      initialValue: false,
    });

    if (isCancel(shouldReplace) || !shouldReplace) {
      outro('Keeping FIRECRAWL_API_KEY from the environment.');
      return { configPath, source: 'env' };
    }

    const apiKey = await password({
      message: 'Enter the replacement Firecrawl API key',
      validate: validateApiKey,
    });

    if (isCancel(apiKey)) {
      throw new Error('Onboarding cancelled.');
    }

    await saveModelPickerConfig({
      ...existingConfig,
      firecrawlApiKey: normalizeApiKey(apiKey),
    });

    note(configPath, 'Saved config');
    outro('Firecrawl is configured. Environment credentials still take priority when set.');
    return { configPath, source: 'saved' };
  }

  if (!supportsInteractivePrompts()) {
    throw new Error(
      'No Firecrawl API key provided. Pass `--firecrawl-api-key <key>` or set FIRECRAWL_API_KEY before running non-interactively.',
    );
  }

  intro('model-picker onboarding');
  note(
    'This saves your Firecrawl API key so model-picker can fall back to Firecrawl if OpenRouter frontend data is unavailable.',
    'Firecrawl setup',
  );

  const apiKey = await password({
    message: 'Enter your Firecrawl API key',
    validate: validateApiKey,
  });

  if (isCancel(apiKey)) {
    throw new Error('Onboarding cancelled.');
  }

  await saveModelPickerConfig({
    ...existingConfig,
    firecrawlApiKey: normalizeApiKey(apiKey),
  });

  note(configPath, 'Saved config');
  outro('Firecrawl fallback is configured. Environment credentials still take priority when set.');
  return { configPath, source: 'saved' };
}

#!/usr/bin/env bun

import {
  COMPACT_SNAPSHOT_FILE,
  FULL_SNAPSHOT_FILE,
  MANIFEST_FILE,
  API_MODELS_FILE,
  SPEED_MODELS_FILE,
  WEB_MODELS_FILE,
} from './paths';
import type { OpenRouterModel } from '@model-picker/domain';
import { buildSnapshots, type SpeedData } from './consolidate-lib';
import type { CoverageSummary } from './coverage';

interface ApiData {
  fetchedAt: string;
  count: number;
  coverage?: CoverageSummary;
  models: OpenRouterModel[];
}

interface SpeedDataFile {
  scrapedAt: string;
  count: number;
  models: SpeedData[];
}

async function consolidate(): Promise<void> {
  const apiData = (await Bun.file(API_MODELS_FILE).json()) as ApiData;

  let speedData: SpeedDataFile = {
    scrapedAt: new Date().toISOString(),
    count: 0,
    models: [],
  };

  if (await Bun.file(SPEED_MODELS_FILE).exists()) {
    speedData = (await Bun.file(SPEED_MODELS_FILE).json()) as SpeedDataFile;
  }

  const { fullSnapshot, compactSnapshot } = buildSnapshots(
    apiData.models,
    speedData.models,
    new Date().toISOString(),
  );

  await Bun.write(FULL_SNAPSHOT_FILE, JSON.stringify(fullSnapshot, null, 2));
  await Bun.write(COMPACT_SNAPSHOT_FILE, JSON.stringify(compactSnapshot, null, 2));
  await Bun.write(WEB_MODELS_FILE, JSON.stringify(fullSnapshot, null, 2));
  await Bun.write(
    MANIFEST_FILE,
    JSON.stringify(
      {
        generatedAt: fullSnapshot.generatedAt,
        source: {
          fetchedAt: apiData.fetchedAt,
          scrapedAt: speedData.scrapedAt,
          coverage: apiData.coverage ?? null,
        },
        files: {
          full: FULL_SNAPSHOT_FILE,
          compact: COMPACT_SNAPSHOT_FILE,
          web: WEB_MODELS_FILE,
        },
      },
      null,
      2,
    ),
  );

  console.log(`Consolidated ${fullSnapshot.count} models into snapshots`);
}

await consolidate();

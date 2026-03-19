import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../../');

export const DATA_RAW_DIR = resolve(ROOT, 'data/raw');
export const DATA_SNAPSHOTS_DIR = resolve(ROOT, 'data/snapshots');
export const WEB_DATA_DIR = resolve(ROOT, 'apps/web/src/data');

export const API_MODELS_FILE = resolve(DATA_RAW_DIR, 'models-api.json');
export const SPEED_MODELS_FILE = resolve(DATA_RAW_DIR, 'models-speed.json');
export const FULL_SNAPSHOT_FILE = resolve(DATA_SNAPSHOTS_DIR, 'latest.full.json');
export const COMPACT_SNAPSHOT_FILE = resolve(DATA_SNAPSHOTS_DIR, 'latest.compact.json');
export const MANIFEST_FILE = resolve(DATA_SNAPSHOTS_DIR, 'manifest.json');
export const WEB_MODELS_FILE = resolve(WEB_DATA_DIR, 'models.json');

export const FIRECRAWL_DIR = resolve(ROOT, '.firecrawl');

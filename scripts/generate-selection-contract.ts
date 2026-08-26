import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MODEL_SELECTION_SCHEMA } from '../packages/catalog/src/selection-contract';

const outputPath = resolve(import.meta.dir, '../contracts/model-picker.selection.v1.schema.json');
const expected = `${JSON.stringify(MODEL_SELECTION_SCHEMA, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const actual = await readFile(outputPath, 'utf8');
  if (actual !== expected) {
    throw new Error('model-picker.selection v1 schema artifact is stale');
  }
  console.log('selection-contract: schema artifact is current');
} else {
  await Bun.write(outputPath, expected);
  console.log(`selection-contract: wrote ${outputPath}`);
}

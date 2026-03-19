#!/usr/bin/env bun

import solidPlugin from '@opentui/solid/bun-plugin';

const result = await Bun.build({
  entrypoints: ['./src/index.tsx'],
  outdir: './dist',
  target: 'bun',
  plugins: [solidPlugin],
});

if (!result.success) {
  console.error('TUI build failed');
  process.exit(1);
}

#!/usr/bin/env bun

console.warn('Deprecated: `bun run refresh` is deprecated. Use `bun run sync` instead.');
await Bun.$`bun run src/sync.ts`;

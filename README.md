# model-picker

Model Picker is now a Bun + Turborepo monorepo with:

- `apps/web`: Astro dashboard for model comparison
- `apps/cli`: Scriptable CLI (`mp`) for fast stats lookup
- `apps/tui`: OpenTUI-based terminal UI with compare queue workflows
- `packages/*`: Shared domain, catalog, ingest, presenters, and Solid UI state logic

## Planning And Progress

- Original plan: [`ORIGINAL-REARCHITECTURE-PLAN.md`](./ORIGINAL-REARCHITECTURE-PLAN.md)
- Architecture and feature inventory: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Current progress: [`PROGRESS.md`](./PROGRESS.md)

## Install

```bash
bun install
```

## Common Commands

```bash
# Run web app
bun run dev:web

# Run CLI directly
bun run dev:cli

# Refresh data snapshots (OpenRouter + speed scrape + consolidate)
bun run refresh

# Build all workspaces
bun run build
```

## CLI Commands

```bash
# Top models
bun run --filter @model-picker/cli dev -- top --sort speed --limit 10

# Search
bun run --filter @model-picker/cli dev -- search claude

# Model detail
bun run --filter @model-picker/cli dev -- get anthropic/claude-4

# Compare
bun run --filter @model-picker/cli dev -- compare openai/gpt-5 anthropic/claude-4

# Interactive compare helper
bun run --filter @model-picker/cli dev -- compare --interactive --sort speed --limit 30

# Export compact CSV
bun run --filter @model-picker/cli dev -- export --format csv --compact --output ./data/snapshots/export.csv

# Export filtered markdown table
bun run --filter @model-picker/cli dev -- export --format markdown --filter budget --limit 10
```

## Data Flow

1. `packages/ingest/src/fetch-models.ts` fetches OpenRouter model metadata.
2. `packages/ingest/src/scrape-speed.ts` enriches speed/latency data.
3. `packages/ingest/src/consolidate.ts` writes:
   - `data/snapshots/latest.full.json`
   - `data/snapshots/latest.compact.json`
   - `data/snapshots/manifest.json`
   - `apps/web/src/data/models.json` (web compatibility copy)

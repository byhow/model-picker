# Development

## Setup

```bash
bun install
```

## Run all surfaces from source

```bash
bun run dev:web    # Web dashboard (Astro + Solid)
bun run dev:cli    # CLI in watch mode (CAC + @clack/prompts)
bun run dev:tui    # Terminal UI (OpenTUI + Solid)
```

## Refresh local model catalog

```bash
bun run refresh
```

Regenerates:

- `data/snapshots/latest.full.json`
- `data/snapshots/latest.compact.json`
- `data/snapshots/manifest.json`
- `apps/web/src/data/models.json`

## Build

```bash
bun run build        # Build all packages and apps
bun run build:cli-bin  # Build single-file CLI binary
```

Build output for CLI binary: `./apps/cli/dist/model-picker`

## Verify

```bash
bun run typecheck    # Type check all packages
bun run test         # Run all tests
bun run lint         # Lint all packages
bun run build        # Build all packages
bun run verify:cli-install  # Verify CLI installs correctly from built binary
```

## Package overview

```
apps/cli/        # CAC command routing + @clack/prompts interface
apps/web/        # Astro + Solid web dashboard
apps/tui/        # OpenTUI + Solid terminal interface
packages/catalog/       # Snapshot loading, filtering, sorting, pick
packages/domain/         # Canonical model types and ranking
packages/presenters/    # Cross-surface row/summary formatting
packages/ui-core/        # Shared Solid view-model/state
packages/ingest/         # OpenRouter fetch, Firecrawl scraping, consolidation
```

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full system diagram.

## Config for development

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Required for live CLI commands during development:

```
FIRECRAWL_API_KEY=fc-your-key
```

## Testing ingest pipeline locally

```bash
# Fetch fresh model list from OpenRouter
bun run sync

# Scrape speed metrics via Firecrawl
bun run scripts/scrape-speed.ts

# Consolidate into local snapshots
bun run scripts/consolidate.ts
```

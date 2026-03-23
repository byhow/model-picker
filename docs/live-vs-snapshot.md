# Live Data vs Snapshot

model-picker has two data modes. Understanding when each is used helps you choose the right command and debug issues.

## Overview

| Mode | Commands | Data source | Requires API key |
|------|----------|-------------|-----------------|
| **Live** | `top`, `search`, `get` | OpenRouter via Firecrawl | Yes (`FIRECRAWL_API_KEY`) |
| **Snapshot** | `compare`, `pick`, `export`, `doctor` | Local packaged catalog | No |

## Live commands

`top`, `search`, and `get` query OpenRouter live through Firecrawl. They return the most current model list and pricing, and mirror OpenRouter URL query filters exactly.

```bash
model-picker top --order most-popular --limit 10
model-picker top --categories programming --order top-weekly --zdr
model-picker search claude --categories programming --zdr
model-picker get openai/gpt-5.4
```

These commands print the source OpenRouter URL before results so you can inspect the exact mirrored query.

**Requirements:** `FIRECRAWL_API_KEY` must be set.

## Snapshot commands

`compare`, `pick`, `export`, and `doctor` use the local packaged model catalog. This catalog is updated periodically by the ingest pipeline and ships with the package.

```bash
model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4
model-picker pick --agent opencode --limit 5
model-picker export --format markdown --limit 10 --output ./models.md
model-picker doctor
```

**Requirements:** No API key needed. Works fully offline.

## When to use each

| Use case | Recommended command |
|----------|-------------------|
| Discover trending/popular models | `top --order most-popular` (live) |
| Filter by modality or price | `top --input-modalities text,image --max-price 0.5` (live) |
| Find a model by name | `search claude` (live) |
| Compare two specific models | `compare <id> <id>` (snapshot) |
| Pick best model for an agent | `pick --agent opencode` (snapshot) |
| Export model list for docs | `export --format markdown` (snapshot) |
| Check setup and config | `doctor` (snapshot) |

## Refreshing the local catalog

The snapshot is updated by the ingest pipeline:

```bash
bun run refresh
```

This regenerates local snapshot artifacts at:

- `data/snapshots/latest.full.json`
- `data/snapshots/latest.compact.json`
- `data/snapshots/manifest.json`
- `apps/web/src/data/models.json` (web compatibility copy)

Live commands (`top`, `search`, `get`) do not depend on `bun run refresh` — they query OpenRouter directly.

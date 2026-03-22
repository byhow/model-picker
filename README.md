# model-picker

Model Picker helps AI builders compare models across price, speed, context, and OpenRouter-style discovery filters.

It ships as:

- a web dashboard for browsing and comparing models
- a CLI for fast lookup, filtering, and export
- a terminal UI for keyboard-first exploration

All three surfaces share the same ingest pipeline, catalog logic, and scoring primitives.

## Install the CLI

### Run instantly

```bash
npx model-picker doctor
```

```bash
bunx model-picker doctor
```

### Install globally

```bash
npm i -g model-picker
```

```bash
bun install -g model-picker
```

After install, you can use either `model-picker` or the short alias `mp`.

## CLI setup

The CLI now has two data modes:

- `top`, `search`, and `get` use live OpenRouter pages and mimic OpenRouter URL query filters.
- `compare`, `pick`, `export`, and `doctor` still work from the local packaged snapshot.

### Recommended onboarding

After `npx` or global install, run:

```bash
npx model-picker onboard
```

or, if you installed globally:

```bash
model-picker onboard
```

This saves your Firecrawl key to the CLI config file so you do not need to export it on every shell session.

If `FIRECRAWL_API_KEY` is already set, onboarding will keep using that by default and only ask whether you want to save a replacement key.

You can re-run setup later with:

```bash
model-picker configure
```

### Environment variable setup

If you prefer env vars, set a Firecrawl API key directly:

```bash
export FIRECRAWL_API_KEY=fc-your-key
```

### Where credentials are stored

- macOS/Linux default: `~/.config/model-picker/config.json`
- Windows default: `%APPDATA%\model-picker\config.json`
- test/custom override: `MODEL_PICKER_CONFIG_DIR`

`doctor` prints the resolved config path and whether live access is coming from `FIRECRAWL_API_KEY`, the config file, fixtures, or is still missing.

If credentials are missing and you run a live command in an interactive terminal, the CLI will offer to launch onboarding automatically.

### Standalone binary from source

Build the single-file binary and run it locally:

```bash
bun run build:cli-bin
./apps/cli/dist/model-picker doctor
```

## Common use cases

```bash
model-picker onboard
model-picker doctor
model-picker top --order most-popular --limit 10
model-picker top --order newest --limit 10
model-picker top --categories programming --order top-weekly --zdr --limit 10
model-picker top --input-modalities text,image --output-modalities image --max-price 0.5 --order most-popular
model-picker search claude --categories programming --order most-popular --zdr
model-picker get openai/gpt-5.4
model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4
model-picker export --format markdown --limit 10 --output ./models.md
```

## Live OpenRouter CLI filters

`top` and `search` now mirror OpenRouter query params as closely as possible.

Supported flags:

- `--order most-popular|top-weekly|newest`
- `--input-modalities text,image,...`
- `--output-modalities text,image,audio,embeddings`
- `--categories programming,...`
- `--max-price <number>`
- `--zdr`

Examples:

```bash
model-picker top --order most-popular
model-picker top --input-modalities text,image --order most-popular
model-picker top --input-modalities text,image --output-modalities image --order most-popular
model-picker top --input-modalities text,image --output-modalities image --max-price 0.5 --order most-popular
model-picker top --categories programming --order most-popular --zdr
model-picker top --categories programming --order top-weekly --zdr
model-picker top --categories programming --order newest --zdr
```

Notes:

- `top` defaults to `--order most-popular`.
- `max_price` follows OpenRouter prompt/input pricing semantics.
- The CLI prints the source OpenRouter URL before results so you can inspect the exact mirrored query.

## Run all repo surfaces from source

```bash
bun install
bun run dev:web
bun run dev:cli
bun run dev:tui
bun run refresh
```

## Verify the repo

```bash
bun run typecheck
bun run test
bun run build
bun run verify:cli-install
```

## How data is refreshed

1. `packages/ingest/src/fetch-models.ts` fetches and curates the local snapshot used by snapshot-backed commands and surfaces.
2. `packages/ingest/src/scrape-speed.ts` enriches local data with speed metrics when available.
3. `packages/ingest/src/consolidate.ts` writes the local snapshots used by the catalog and web app.
4. `bun run refresh` regenerates those artifacts locally, and the tracked web snapshot lives at `apps/web/src/data/models.json`.
5. Live CLI discovery commands (`top`, `search`, `get`) do not depend on `bun run refresh`; they query OpenRouter live through Firecrawl.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the system diagram and package breakdown.

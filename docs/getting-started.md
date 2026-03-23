# Install

## Run instantly — no install required

```bash
npx model-picker doctor
bunx model-picker doctor
```

## Install globally

```bash
npm i -g model-picker
```

```bash
bun install -g model-picker
```

After global install, use either `model-picker` or the short alias `mp`.

## Verify installation

```bash
model-picker doctor
```

`doctor` checks your config file, environment variables, and whether live access is working.

## Requirements

- Bun 1.0+ (recommended), or Node.js 18+ with npm
- For live commands (`top`, `search`, `get`): a [Firecrawl API key](https://firecrawl.dev)
- For snapshot commands (`compare`, `pick`, `export`): no API key required

## Shell completions

```bash
model-picker completion install
```

Supports zsh, bash, and fish.

## Next steps

- [Quickstart](./quickstart.md) — run your first discovery and comparison
- [Configuration](./configuration.md) — set up your Firecrawl API key
- [Commands](./commands.md) — full CLI reference

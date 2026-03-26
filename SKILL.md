---
name: model-picker
description: >
  Discover, compare, and select AI models by price, speed, and context window.
  Use when asked to recommend a model, compare models, find the cheapest/fastest
  model, or pick the best model for a coding agent. TRIGGER on: "which model",
  "best model for", "compare models", "cheapest model", "fastest model",
  "pick a model", "model recommendation". DO NOT TRIGGER for general coding
  tasks that don't involve model selection.
metadata:
  version: 0.1.0
  category: ai-tooling
  tags: [models, ai, llm, comparison, openrouter, coding-agents]
  surfaces:
    - amp
    - opencode
    - claude-code
    - codex
    - cursor
---

# model-picker

A terminal-first tool for discovering and comparing AI models across price, speed, and context window.

## Installation

```bash
npx model-picker <command>
npm i -g model-picker
```

After install, the CLI is available as `model-picker` or `mp`.

## When to use which command

| Need | Command | Data source |
|------|---------|-------------|
| Browse live models with filters | `top` | Live OpenRouter |
| Inspect a specific model | `get` | Live OpenRouter |
| Side-by-side comparison | `compare` | Local snapshot |
| Agent-aware recommendation | `pick` | Local snapshot |
| Export results for scripts/docs | `export` | Local snapshot |
| Debug setup and config | `doctor` | Local config |

## Command examples

### Discover models (live, no API key required)

```bash
model-picker top --order most-popular --limit 10
model-picker top --categories programming --order top-weekly --zdr
model-picker top --max-price 1 --limit 5
model-picker get openai/gpt-5.4
```

### Compare models

```bash
model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4
```

### Get agent-aware picks

```bash
model-picker pick --agent amp --task agent --limit 5
model-picker pick --agent opencode --task coding --limit 5
model-picker pick --agent claude-code --json
```

Supported agents: `amp`, `opencode`, `claude-code`, `codex`, `cursor`.
When `--agent` is set and `--task` is omitted, defaults to `--task agent`.

### Export results

```bash
model-picker export --format json --limit 20
model-picker export --format markdown --limit 10 --output ./models.md
model-picker export --format csv
```

### Check setup

```bash
model-picker doctor
```

## Machine-readable output

Use `--json` with `pick` and `get` to pipe structured output into scripts:

```bash
model-picker pick --agent amp --json | jq '.[0].id'
model-picker get openai/gpt-5.4 --json
```

## Filter flags for `top`

- `--order most-popular|top-weekly|newest`
- `--categories programming,reasoning,...`
- `--input-modalities text,image,...`
- `--output-modalities text,image,audio,embeddings`
- `--max-price <number>` (per 1M input tokens)
- `--zdr` (top of DL, rate limited)
- `--limit <number>`

## Guardrails

- Use `pick` for agent-aware model recommendations — it applies weighted scoring
- Use `compare` before making a final selection between candidates
- Use `doctor` before assuming live access is broken
- `sync` and `tui` are repo-only commands, not available from npm install

## Environment

- `FIRECRAWL_API_KEY` — optional, enables Firecrawl fallback for live commands
- Config: `~/.config/model-picker/config.json`

## Full documentation

- Agent docs: [llms.txt](./llms.txt)
- GitHub: https://github.com/byhow/model-picker
- npm: https://www.npmjs.com/package/model-picker

# model-picker

**A terminal-first model discovery and agent-skills tool for AI builders.**

Use `model-picker` to compare models across price, speed, and context, pick the right model for coding agents like OpenCode, Claude Code, and Codex, install skills across agent CLIs, and access documentation through GitHub, a web docs UI, and `llms.txt`.

It ships as:

- a **CLI** for fast lookup, filtering, export, and skills management
- a **web dashboard** for browser-based model browsing and comparison
- a **terminal UI** for keyboard-first exploration

All surfaces share the same ingest pipeline, catalog logic, and scoring primitives.

## Quick install

```bash
# Run instantly — no install required
npx model-picker doctor
bunx model-picker doctor

# Install globally
npm i -g model-picker
bun install -g model-picker
```

After install, use either `model-picker` or the short alias `mp`.

## Docs

- **GitHub README**: quick install and common workflows (this page)
- **Web docs**: full guides and command reference → [model-picker.dev/docs](https://model-picker.dev/docs)
- **`llms.txt`**: agent-readable documentation for coding assistants and automation → [`llms.txt`](./llms.txt)

## What you can do

- **Discover live models** with OpenRouter-style filters — `top`, `search`, `get`
- **Compare models** on price, speed, context, and modality
- **Get agent-aware picks** for `opencode`, `claude-code`, `codex`, `cursor`, `amp`
- **Install and manage skills** across supported coding-agent CLIs
- **Export results** as JSON, CSV, or Markdown for scripts, docs, and CI

## Common workflows

### Find models

```bash
model-picker top --order most-popular --limit 10
model-picker top --categories programming --order top-weekly --zdr --limit 10
model-picker search claude --categories programming --zdr
model-picker get openai/gpt-5.4
```

### Compare options

```bash
model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4
model-picker pick --task agent --agent opencode --limit 5
model-picker pick --agent amp --json
```

### Work with skills

```bash
model-picker skills add vercel-labs/agent-skills --list
model-picker skills add vercel-labs/agent-skills --skill react-best-practices --agent opencode --agent amp
model-picker skills list
model-picker skills remove --skill react-best-practices --agent amp
```

### Export for automation

```bash
model-picker export --format markdown --limit 10 --output ./models.md
model-picker pick --agent codex --json
```

## Agent-first picks

`pick` recommends models tailored to specific coding agents and workflows.

```bash
model-picker pick --task agent --agent opencode --limit 5
model-picker pick --task review --agent claude-code --limit 5
model-picker pick --agent amp --json
```

Supported agents: `amp`, `opencode`, `claude-code`, `codex`, `cursor`.

When `--agent` is set and `--task` is omitted, `pick` defaults to `--task agent`. Use `--json` to pipe picks into scripts and tooling.

## Skill installation

`model-picker skills` installs and manages Agent Skills for supported coding-agent CLIs.

```bash
model-picker skills add owner/repo --list
model-picker skills add owner/repo --skill my-skill --agent opencode
model-picker skills add owner/repo --all --agent opencode --yes
model-picker skills add ./my-local-skills --agent claude-code --copy
model-picker skills remove --skill my-skill --agent opencode
model-picker skills list
model-picker skills list --global
```

Supported sources:

- GitHub shorthand: `owner/repo`
- GitHub URL: `https://github.com/owner/repo`
- GitHub tree URL: `https://github.com/owner/repo/tree/main/skills/skill-name`
- Generic git URL: `git@github.com:owner/repo.git`
- Local directory path

Install targets:

- `amp`, `opencode`, `codex`, `cursor` → `.agents/skills/`
- `claude-code` → `.claude/skills/`
- `--global` → each agent's global skills directory

## Live OpenRouter CLI filters

`top` and `search` mirror OpenRouter URL query parameters.

```bash
model-picker top --order most-popular
model-picker top --input-modalities text,image --output-modalities image --max-price 0.5 --order most-popular
model-picker top --categories programming --order top-weekly --zdr
```

Supported flags:

- `--order most-popular|top-weekly|newest`
- `--input-modalities text,image,...`
- `--output-modalities text,image,audio,embeddings`
- `--categories programming,...`
- `--max-price <number>`
- `--zdr` (top of DL, rate limited)

## Setup

### Recommended onboarding

```bash
npx model-picker onboard
model-picker configure
```

This saves your Firecrawl API key to the CLI config file so you do not set it per-session.

### Environment variable

```bash
export FIRECRAWL_API_KEY=fc-your-key
```

### Config location

- macOS/Linux: `~/.config/model-picker/config.json`
- Windows: `%APPDATA%\model-picker\config.json`
- Override: `MODEL_PICKER_CONFIG_DIR`

Run `model-picker doctor` to check resolved config path and whether live access is working.

## Live data vs local snapshot

| Command | Data source |
|---------|-------------|
| `top`, `search`, `get` | Live OpenRouter via Firecrawl |
| `compare`, `pick`, `export`, `doctor` | Local packaged snapshot |

Live commands (`top`, `search`, `get`) require `FIRECRAWL_API_KEY`. Snapshot commands work offline.

## Also ships as

- **Web dashboard** — browser-based model explorer at `apps/web`
- **Terminal UI** — keyboard-first browsing at `apps/tui`

## Development

```bash
bun install
bun run dev:web    # Web dashboard
bun run dev:cli    # CLI development
bun run dev:tui    # Terminal UI
bun run refresh    # Refresh local model snapshot
bun run typecheck
bun run test
bun run build
```

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the system diagram and package breakdown.

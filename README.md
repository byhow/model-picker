# model-picker

**Too many AI models. Not enough time to compare them.**

`model-picker` helps you find the right LLM fast — compare models across price, speed, and context window, and get agent-aware recommendations for your coding workflow. All from your terminal.

## Quick install

```bash
# Run instantly — no install required
npx model-picker top --order most-popular --limit 5

# Install globally
npm i -g model-picker
bun install -g model-picker
```

After install, use either `model-picker` or the short alias `mp`.

## Agent Skills

`model-picker` is also available as a reusable **agent skill** for AI coding agents like Cursor, Claude Code, Codex, and more.

### Install as a skill

```bash
# Using npx (recommended)
npx skills add byhow/model-picker

# Or with bunx
bunx skills add byhow/model-picker

# Install globally for all agents
npx skills add byhow/model-picker -g -y
```

### Supported agents

The skill works with: Amp, Antigravity, Augment, Claude Code, OpenClaw, CodeBuddy, Codex, Command Code, Continue, Cortex Code, Crush, Cursor, Droid, Gemini CLI, Goose, Junie, and more (43+ agents).

### When the skill activates

The skill automatically loads when you ask:
- "Which model should I use for...?"
- "Best model for coding"
- "Compare X vs Y model"
- "Cheapest/fastest model"
- "Pick a model for my agent"

It will not trigger for general coding tasks unrelated to model selection.

## Demo

> Screenshots and terminal recordings coming soon.
>
> **CLI** · **Web dashboard** · **TUI**

## Use cases

**Find the cheapest coding model:**

```bash
model-picker top --categories programming --order most-popular --max-price 1
```

**Pick the best model for your agent:**

```bash
model-picker pick --agent opencode --task agent --limit 5
model-picker pick --agent amp --json
```

**Compare two models side by side:**

```bash
model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4
```

**Export for scripts and docs:**

```bash
model-picker export --format markdown --limit 10 --output ./models.md
```

## What works from npm install vs source checkout

| From npm / npx | Source checkout only |
|---|---|
| `top`, `get`, `compare`, `pick` | `sync` (refresh snapshots) |
| `export`, `doctor`, `onboard`, `configure` | `tui` (terminal UI) |
|  | `dev:web` (web dashboard) |

The CLI will tell you which commands need a source checkout and how to set one up.

## How data works

| Command | Data source |
|---|---|
| `top`, `get` | Live OpenRouter (no API key required) |
| `compare`, `pick`, `export`, `doctor` | Local packaged snapshot (works offline) |

Live commands query OpenRouter's frontend API directly. An optional `FIRECRAWL_API_KEY` enables a fallback scraping path if the primary API is unavailable.

Snapshots are refreshed daily via CI and bundled with each npm release.

## Agent-first picks

`pick` recommends models tailored to specific coding agents and workflows.

```bash
model-picker pick --task agent --agent opencode --limit 5
model-picker pick --task review --agent claude-code --limit 5
model-picker pick --agent amp --json
```

Supported agents: `amp`, `opencode`, `claude-code`, `codex`, `cursor`.

When `--agent` is set and `--task` is omitted, `pick` defaults to `--task agent`. Use `--json` to pipe picks into scripts and tooling.

## Live OpenRouter CLI filters

`top` and `get` mirror OpenRouter URL query parameters.

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

## Also ships as

- **Web dashboard** — browser-based model explorer at `apps/web`
- **Terminal UI** — keyboard-first browsing at `apps/tui` (source checkout only)

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

## Docs

- **Web docs**: full guides and command reference → [model-picker.dev/docs](https://model-picker.dev/docs)
- **`llms.txt`**: agent-readable documentation → [`llms.txt`](./docs/llms.txt)
- **Architecture**: system diagram and package breakdown → [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup instructions and development workflow.

## Security

To report a vulnerability, see [`SECURITY.md`](./SECURITY.md).

## License

[Apache-2.0](./LICENSE)

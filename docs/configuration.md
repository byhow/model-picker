# Configuration

## Environment variables

### FIRECRAWL_API_KEY

Required for live commands (`top`, `search`, `get`).

```bash
export FIRECRAWL_API_KEY=fc-your-key
```

Get your key at [firecrawl.dev](https://firecrawl.dev).

### MODEL_PICKER_CONFIG_DIR

Override the default config directory.

```bash
export MODEL_PICKER_CONFIG_DIR=/path/to/config
```

## Interactive setup

```bash
model-picker onboard
```

Runs interactive setup: saves your Firecrawl API key to the config file. If `FIRECRAWL_API_KEY` is already set in the environment, onboarding uses that by default and only asks for a replacement if you want to change it.

```bash
model-picker configure
```

Re-run configuration interactively at any time.

## Config file location

| Platform | Path |
|----------|------|
| macOS / Linux | `~/.config/model-picker/config.json` |
| Windows | `%APPDATA%\model-picker\config.json` |
| Override | `MODEL_PICKER_CONFIG_DIR` env var |

## Verify setup

```bash
model-picker doctor
```

Prints:

- resolved config file path
- whether `FIRECRAWL_API_KEY` is set in the environment
- whether a key is saved in the config file
- whether live access is working or falling back to fixtures

## Config file format

```json
{
  "firecrawlApiKey": "fc-your-key"
}
```

## Agent skills directories

Each agent has a standard location for installed skills. model-picker maps to these automatically:

| Agent | Project install | Global install |
|-------|----------------|----------------|
| amp | `.agents/skills/` | (agent global dir) |
| opencode | `.agents/skills/` | (agent global dir) |
| codex | `.agents/skills/` | (agent global dir) |
| cursor | `.agents/skills/` | (agent global dir) |
| claude-code | `.claude/skills/` | `~/.claude/skills/` |

Use `--global` to install to each agent's global skills directory.

# Quickstart

Get up and running in under 5 minutes.

## 1. Install

```bash
npx model-picker onboard
```

This runs interactive setup: saves your Firecrawl API key to the config file and verifies live access.

Or install globally:

```bash
npm i -g model-picker
model-picker onboard
```

## 2. Discover models

```bash
# Top models by popularity
model-picker top --order most-popular --limit 10

# Filter by category
model-picker top --categories programming --order top-weekly --zdr

# Search by name
model-picker search claude --categories programming --zdr

# Get a specific model
model-picker get openai/gpt-5.4
```

## 3. Compare models

```bash
# Compare two models
model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4

# Pick the best model for an agent
model-picker pick --agent opencode --limit 5
model-picker pick --agent claude-code --limit 5

# Machine-readable output for scripts
model-picker pick --agent amp --json
```

## 4. Install agent skills

```bash
# List available skills in a repo
model-picker skills add owner/repo --list

# Install a specific skill
model-picker skills add owner/repo --skill my-skill --agent opencode --agent amp

# Install all skills from a repo
model-picker skills add owner/repo --all --agent opencode --yes
```

## 5. Export for docs or scripts

```bash
# Markdown table
model-picker export --format markdown --limit 10 --output ./models.md

# JSON for scripts
model-picker export --format json --limit 20

# CSV
model-picker export --format csv --limit 50
```

## Next steps

- [Commands](./commands.md) — complete CLI reference
- [Agent Picks](./agent-picks.md) — pick models for specific coding agents
- [Skills](./skills.md) — full skills installation guide
- [Configuration](./configuration.md) — set up environment and config

---
name: model-picker
description: Use model-picker to discover models, compare pricing and performance, pick the best model for coding agents, and install Agent Skills across CLI coding tools.
---

# model-picker

Use model-picker to discover models, compare pricing and performance, pick the best model for coding agents, and install Agent Skills across CLI coding tools.

## If you are an agent

model-picker is a terminal-first model discovery and agent-skills tool. You can use it to:

- Find models that match your task requirements (price, speed, context, modality)
- Pick the right model for your agent workflow (OpenCode, Claude Code, Codex, Cursor, Amp)
- Install and manage skills for supported coding agents
- Export model lists as JSON, CSV, or Markdown for documentation or scripts

## Key commands for agents

### Discover models (requires FIRECRAWL_API_KEY)

```bash
model-picker top --order most-popular --limit 10
model-picker search claude --categories programming --zdr
model-picker get openai/gpt-5.4
```

### Compare and pick models (offline, no API key)

```bash
model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4
model-picker pick --agent opencode --limit 5
model-picker pick --agent claude-code --json
```

### Install skills

```bash
model-picker skills add owner/repo --skill my-skill --agent opencode --agent amp
model-picker skills list
```

### Export for scripts

```bash
model-picker export --format json --limit 20
model-picker export --format markdown --limit 10 --output ./models.md
```

## Skills install targets

model-picker maps to each agent's standard skills directory:

| Agent | Project install | Global install |
|-------|----------------|----------------|
| amp | `.agents/skills/` | (agent global dir) |
| opencode | `.agents/skills/` | (agent global dir) |
| codex | `.agents/skills/` | (agent global dir) |
| cursor | `.agents/skills/` | (agent global dir) |
| claude-code | `.claude/skills/` | `~/.claude/skills/` |

## Environment

FIRECRAWL_API_KEY is required for live commands (top, search, get). Snapshot commands (compare, pick, export) work offline.

Config file: `~/.config/model-picker/config.json`

## Installation

```bash
npx model-picker <command>
bunx model-picker <command>
npm i -g model-picker
```

## Docs

- Full docs: https://model-picker.dev/docs
- llms.txt: ./llms.txt (flat reference)
- GitHub README: ./README.md

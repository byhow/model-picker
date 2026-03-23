# Agent Picks

`pick` recommends models tailored to specific coding agents and task types.

## Usage

```bash
# Pick best models for an agent (default task: agent)
model-picker pick --agent opencode --limit 5
model-picker pick --agent claude-code --limit 5
model-picker pick --agent amp --limit 5

# Pick models for a specific task
model-picker pick --task review --agent claude-code --limit 5
model-picker pick --task refactor --agent opencode --limit 3

# Machine-readable output for scripts
model-picker pick --agent amp --json
```

## Supported agents

| Agent | Flag value |
|-------|-----------|
| Amp | `amp` |
| OpenCode | `opencode` |
| Claude Code | `claude-code` |
| Codex | `codex` |
| Cursor | `cursor` |

## Supported tasks

| Task | Description |
|------|-------------|
| `agent` (default when `--agent` is set) | General agentic coding tasks |
| `review` | Code review workflows |
| `refactor` | Refactoring and improvement |
| `write` | Code generation |

## How it works

The `pick` command uses the local model catalog and a weighted scoring system that considers:

- context window size
- pricing (input and output per 1M tokens)
- speed/throughput metrics
- modality support (text, vision, audio)
- task-specific performance signals

Output includes per-model reasoning and confidence scores when available.

## JSON output

Use `--json` for machine-readable output suitable for scripts and tooling:

```bash
model-picker pick --agent opencode --limit 5 --json
```

Returns a structured JSON array of model picks with scores, pricing, and context info.

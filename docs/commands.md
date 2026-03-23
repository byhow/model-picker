# CLI Reference

Complete reference for all `model-picker` CLI commands.

## Global flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--help`, `-h` | Show help for any command |

## doctor

Check config file, environment variables, and live access status.

```bash
model-picker doctor
```

## onboard

Interactive first-run setup. Saves Firecrawl API key to the config file.

```bash
model-picker onboard
```

## configure

Re-run configuration interactively.

```bash
model-picker configure
```

## top

List top models with optional filters. **Live command** — requires `FIRECRAWL_API_KEY`.

```bash
model-picker top [flags]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--order` | `most-popular \| top-weekly \| newest` | Sort order (default: `most-popular`) |
| `--limit` | number | Max results (default: 10) |
| `--input-modalities` | comma-separated | `text,image,audio,video` |
| `--output-modalities` | comma-separated | `text,image,audio,embeddings` |
| `--categories` | comma-separated | `programming,reasoning,roleplay,image,video` |
| `--max-price` | number | Max input price per 1M tokens |
| `--zdr` | flag | Top of DL, rate limited |

## search

Search models by name. **Live command** — requires `FIRECRAWL_API_KEY`.

```bash
model-picker search <query> [flags]
```

**Flags:** Same filtering flags as `top`.

## get

Get details for a specific model. **Live command** — requires `FIRECRAWL_API_KEY`.

```bash
model-picker get <model-id>
```

Example: `model-picker get openai/gpt-5.4`

## compare

Compare two models using the local catalog. **Snapshot command** — no API key required.

```bash
model-picker compare <model-id-1> <model-id-2>
```

Example: `model-picker compare anthropic/claude-opus-4.6 openai/gpt-5.4`

## pick

Pick best models for a specific agent or task. **Snapshot command** — no API key required.

```bash
model-picker pick [flags]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--agent` | `amp \| opencode \| claude-code \| codex \| cursor` | Target coding agent |
| `--task` | `agent \| review \| refactor \| write` | Task type (default: `agent` when `--agent` is set) |
| `--limit` | number | Max results (default: 5) |
| `--json` | flag | JSON output for scripts |

## export

Export models from the local catalog. **Snapshot command** — no API key required.

```bash
model-picker export [flags]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--format` | `json \| ndjson \| csv \| markdown` | Output format (default: `markdown`) |
| `--limit` | number | Max results |
| `--output` | path | Write to file (default: stdout) |
| `--filter` | expression | Filter expression |
| `--sort` | `price \| speed \| context \| name` | Sort field |
| `--compact` | flag | Compact output (summary rows) |

## skills add

Install skills from a source repository.

```bash
model-picker skills add <source> [flags]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--list` | flag | List available skills, then exit |
| `--skill` | string | Install a specific skill by name |
| `--all` | flag | Install all discovered skills |
| `--agent` | string | Target agent (repeatable) |
| `--global` | flag | Install to each agent's global skills directory |
| `--yes` | flag | Skip confirmation prompt |
| `--copy` | flag | Copy instead of clone (for local paths) |
| `--token` | string | Git authentication token |

## skills remove

Remove installed skills.

```bash
model-picker skills remove [flags]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--skill` | string | Remove a specific skill |
| `--all` | flag | Remove all skills for an agent |
| `--agent` | string | Target agent |

## skills list

List installed skills.

```bash
model-picker skills list [flags]
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--global` | List global skills instead of project-local |

## completion install

Install shell completions.

```bash
model-picker completion install
```

Supports zsh, bash, and fish.

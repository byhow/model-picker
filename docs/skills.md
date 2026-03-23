# Skills

model-picker can install and manage Agent Skills for supported coding-agent CLIs. Skills are modular instruction packages that extend an agent's capabilities for specific workflows.

## Supported agents

| Agent | Project install | Global install |
|-------|----------------|----------------|
| amp | `.agents/skills/` | (agent global dir) |
| opencode | `.agents/skills/` | (agent global dir) |
| codex | `.agents/skills/` | (agent global dir) |
| cursor | `.agents/skills/` | (agent global dir) |
| claude-code | `.claude/skills/` | `~/.claude/skills/` |

## Commands

### List skills in a repo

```bash
model-picker skills add owner/repo --list
model-picker skills add https://github.com/owner/repo --list
```

### Install a skill

```bash
# Install one skill to one agent
model-picker skills add owner/repo --skill my-skill --agent opencode

# Install one skill to multiple agents
model-picker skills add owner/repo --skill my-skill --agent opencode --agent amp

# Install all skills from a repo
model-picker skills add owner/repo --all --agent opencode --yes

# From a specific GitHub tree path
model-picker skills add https://github.com/owner/repo/tree/main/skills/react-best-practices --agent opencode
```

### Install from private repos

```bash
# SSH (auto-detects keys)
model-picker skills add git@github.com:owner/private-skills.git --agent claude-code

# HTTPS with token
model-picker skills add https://github.com/owner/private-skills --token $GH_TOKEN --agent claude-code
```

### Local install

```bash
model-picker skills add ./my-local-skills --agent claude-code --copy
```

### Remove skills

```bash
# Remove one skill
model-picker skills remove --skill my-skill --agent opencode

# Remove all skills for an agent
model-picker skills remove --all
```

### List installed skills

```bash
model-picker skills list
model-picker skills list --global
```

## Supported sources

| Source type | Example |
|------------|---------|
| GitHub shorthand | `owner/repo` |
| GitHub URL | `https://github.com/owner/repo` |
| GitHub tree URL | `https://github.com/owner/repo/tree/main/skills/skill-name` |
| Generic git | `git@github.com:owner/repo.git` |
| Git with token | `https://github.com/owner/repo --token $GH_TOKEN` |
| Local path | `./my-skills` |

## Safety

- In non-interactive sessions, remote installs require `--yes` to confirm.
- Use `--all` when you trust the source and want to install all discovered skills.
- Skills are copied to the target directory, not symlinked.

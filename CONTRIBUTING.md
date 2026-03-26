# Contributing to model-picker

Thanks for your interest in contributing! Here's how to get started.

## Local Setup

```bash
git clone https://github.com/byhow/model-picker.git
cd model-picker
bun install
```

## Quality Gates

Before submitting a PR, make sure all checks pass:

```bash
bun run typecheck   # Type check all packages
bun run test        # Run tests
bun run build       # Build all packages
```

## Project Structure

```
apps/cli/          # Published npm CLI (model-picker / mp)
apps/web/          # Astro + SolidJS web dashboard
apps/tui/          # OpenTUI terminal interface (repo-only)
packages/catalog/  # Snapshot loading, filtering, sorting, pick
packages/domain/   # Canonical model types, ranking, config
packages/ingest/   # OpenRouter fetch, speed scraping, consolidation
packages/presenters/ # Cross-surface row/summary formatting
packages/ui-core/  # Shared SolidJS view-model/state
```

## Repo-Only Commands

The `sync` and `tui` commands only work from a source checkout — they are not available when installed from npm. This is expected.

## Reporting Bugs

Please use the [bug report template](https://github.com/byhow/model-picker/issues/new?template=bug_report.yml) when filing issues. Include `model-picker doctor --json` output if possible.

## CI Coverage Note

Test coverage threshold is currently 85% due to a known Bun subprocess bug ([oven-sh/bun#24012](https://github.com/oven-sh/bun/issues/24012)). The packaged install flow is still exercised by `bun run verify:cli-install`.

## Pull Requests

1. Fork and create a feature branch
2. Make your changes with tests
3. Ensure all quality gates pass
4. Submit a PR with a clear description of the change

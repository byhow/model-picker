# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-03-26

### Changed

- Removed skills management commands (add/list/remove) — model-picker is now a skill, not a skill manager
- Repositioned as an installable agent skill via `npx skills add byhow/model-picker`
- SKILL.md ships at package root and in `skills/model-picker/` for skills-npm compatibility
- Rewrote README around user problems and use cases
- Live commands (top, get) no longer require FIRECRAWL_API_KEY for primary path

### Added

- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md
- GitHub issue templates (bug report, feature request)
- Improved error messaging for repo-only commands (tui, sync)

### Fixed

- Corrected GitHub URL in llms.txt
- Pinned Bun version consistently across all CI workflows
- Removed deprecated `search` command references from docs

## [0.1.0] - 2025-03-25

### Added

- Initial public release
- CLI commands: `top`, `get`, `compare`, `pick`, `export`, `doctor`, `onboard`, `configure`
- Skills management: `skills add`, `skills list`, `skills remove`
- Agent-aware model picks for amp, opencode, claude-code, codex, cursor
- Live OpenRouter queries (no API key required for primary path)
- Local snapshot catalog with offline support
- Export to JSON, NDJSON, CSV, Markdown
- Weighted scoring (speed 40%, price 35%, context 25%) with task bonuses
- Web dashboard (Astro + SolidJS)
- Terminal UI (source checkout only)

[Unreleased]: https://github.com/byhow/model-picker/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/byhow/model-picker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/byhow/model-picker/releases/tag/v0.1.0

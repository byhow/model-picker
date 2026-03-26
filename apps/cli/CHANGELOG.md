# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/byhow/model-picker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/byhow/model-picker/releases/tag/v0.1.0

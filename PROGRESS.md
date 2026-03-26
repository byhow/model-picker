# Re-Architecture Progress

## Current Status

Last updated: 2026-03-17 23:00 UTC

## Completed

1. Monorepo bootstrap is complete with Bun workspaces and Turborepo.
2. Existing Astro app has been moved to `apps/web`.
3. Shared packages are in place: `domain`, `catalog`, `ingest`, and `presenters`.
4. Ingest pipeline was migrated to `packages/ingest` and writes snapshot artifacts to `data/snapshots`.
5. Scriptable CLI scaffold is implemented in `apps/cli` with `top`, `get`, `search`, `compare`, `export`, `refresh`, `tui`, and `doctor` commands.
6. TUI scaffold is implemented in `apps/tui` using OpenTUI dependencies.
7. Web pages/components were updated to use shared domain model types.
8. Build and quality checks are passing (`typecheck`, `lint`, `build`).
9. Shared catalog now supports advanced filtering and sorting (`fast`, `budget`, `long-context`, numeric filters, provider filters).
10. Weighted recommendation flow is implemented through CLI `pick` command and shared scoring logic in `packages/catalog`.
11. TUI now has a functional multi-pane interface (list, detail, compare queue) with keyboard controls.
12. Catalog tests were added and pass with `bun run test`.
13. Shared Solid view-model/state package (`packages/ui-core`) now drives list/filter/sort/selection/compare behavior for both web and TUI surfaces.
14. Web app now uses a Solid island (`ModelExplorer`) powered by shared state for search, quick filters, compare queue navigation, and model detail browsing.
15. CLI compare/export flows were expanded with interactive compare selection and richer export formats (`json`, `ndjson`, `csv`, `markdown`) plus filter/sort/limit controls.
16. Ingest consolidation logic is now extracted into testable pure helpers, with edge-case tests for normalization and snapshot generation.

## In Progress

1. No active implementation items in the original milestone set.

## Next Milestones

1. Optional: add additional domain-level tests for `packages/ui-core` once a stable Solid test harness is introduced for non-browser runtimes.
2. Optional: extend CLI compare summary with normalized deltas against a user-selected baseline model.

## Change Log

1. 2026-03-17: Established Bun + Turborepo workspace structure, migrated Astro app to `apps/web`, created shared packages (`domain`, `catalog`, `ingest`, `presenters`), scaffolded CLI/TUI apps, moved ingest pipeline into `packages/ingest`, generated snapshot artifacts, and added planning/progress documentation.
2. 2026-03-17: Added timestamped change-log tracking to this progress file for ongoing session-by-session updates.
3. 2026-03-17: Implemented advanced catalog filtering/sorting, added weighted `pick` recommendations in CLI, replaced TUI scaffold with a keyboard-driven multi-pane interface, and added catalog behavior tests.
4. 2026-03-17 22:15 UTC: Added shared `packages/ui-core` Solid state primitives and refactored TUI to use them; added compare-queue navigation affordances (`[`, `]`, `enter`) and external model-page opening (`o`).
5. 2026-03-17 22:33 UTC: Replaced ad-hoc web table scripts with a Solid `ModelExplorer` island backed by shared `ui-core` state, and wired Astro Solid integration via `@astrojs/solid-js`.
6. 2026-03-17 22:47 UTC: Expanded CLI with interactive compare selection and multi-format export (`json`, `ndjson`, `csv`, `markdown`) including filter/sort/limit support.
7. 2026-03-17 22:58 UTC: Extracted ingest consolidation logic into `consolidate-lib`, added ingest normalization/snapshot edge-case tests, and revalidated the full typecheck/test/lint/build loop plus CLI/TUI runtime checks.

## Change Log Format

1. `YYYY-MM-DD HH:MM TZ`: Short summary of what changed and why.

# Architecture

## System Diagram (ASCII)

```text
                                      +---------------------------+
                                      |       OpenRouter API      |
                                      +-------------+-------------+
                                                    |
                                                    | fetch-models.ts
                                                    v
                                      +---------------------------+
                                      |   data/raw/models-api     |
                                      +-------------+-------------+
                                                    |
                                                    | scrape-speed.ts (Firecrawl)
                                                    v
                                      +---------------------------+
                                      |  data/raw/models-speed    |
                                      +-------------+-------------+
                                                    |
                                                    | consolidate.ts
                                                    v
        +-------------------------------------------+--------------------------------------------+
        |                                           |                                            |
        v                                           v                                            v
+-------------------------------+      +-------------------------------+      +----------------------------------+
| data/snapshots/latest.full    |      | data/snapshots/latest.compact |      | apps/web/src/data/models.json    |
| data/snapshots/manifest.json  |      |                               |      | (web compatibility snapshot copy) |
+---------------+---------------+      +-------------------------------+      +----------------+-----------------+
                |                                                                                               |
                | loadSnapshot / listModels / compare / pick                                                    |
                v                                                                                               v
      +-------------------------------+        +-------------------------------+                      +---------------------------+
      |       packages/catalog        |<------>|        packages/domain        |<-------------------->|      packages/ingest      |
      | filtering / sorting / pick    |        | canonical model types/ranks   |                      | fetch/scrape/consolidate |
      +---------------+---------------+        +-------------------------------+                      +---------------------------+
                      |
                      | shared DTO formatting
                      v
            +---------------------------+
            |    packages/presenters    |
            +---------------------------+

                      +---------------------------------------------------------------------------------------+
                      |                    packages/ui-core (shared Solid view-model/state)                  |
                      | browse/filter/sort/search/selection/compare queue/cursor/jump/open-router-url helper |
                      +-------------------------------+-------------------------------+-----------------------+
                                                      |                               |
                                                      |                               |
                                                      v                               v
                                     +------------------------------+   +------------------------------+
                                     |           apps/tui           |   |           apps/web           |
                                     | OpenTUI + @opentui/solid UI  |   | Astro + Solid ModelExplorer  |
                                     +------------------------------+   +------------------------------+
                                                      ^
                                                      |
                                                      |
                                     +------------------------------+
                                     |           apps/cli           |
                                     | cac + @clack/prompts command |
                                     +------------------------------+
```

## Implemented Features

1. Bun + Turborepo monorepo workspace layout with `apps/*` and `packages/*`.
2. Astro web app migration to `apps/web` while preserving Cloudflare deployment shape.
3. Scriptable CLI app in `apps/cli` with Bun runtime and `cac` command routing.
4. OpenTUI terminal app in `apps/tui` with keyboard-driven multi-pane interface.
5. Shared domain package with canonical model contracts and ranking behavior (`packages/domain`).
6. Shared catalog package for snapshot loading, searching, filtering, sorting, compare lookup, and weighted model picking (`packages/catalog`).
7. Shared presenter package for cross-surface row/summary formatting (`packages/presenters`).
8. Shared Solid view-model/state package for reusable browse and compare workflows across web and TUI (`packages/ui-core`).
9. Ingest pipeline package for OpenRouter fetch, speed scraping enrichment, and snapshot consolidation (`packages/ingest`).
10. Snapshot artifact strategy with `latest.full.json`, `latest.compact.json`, and `manifest.json` for fast local reads.
11. Web compatibility snapshot copy generation at `apps/web/src/data/models.json`.
12. Advanced catalog filtering support including quick filters (`fast`, `budget`, `long-context`, `vision`, `code`), provider/id matching, and numeric expressions.
13. Catalog sorting options by speed, price, context, and name.
14. Weighted recommendation flow via shared scoring logic and CLI `pick` command.
15. TUI compare queue interactions including toggle, active compare cursor cycling, compare-target jump, and external model page open command.
16. TUI list/detail panes with persistent keyboard navigation (`j/k`, arrows, `g/G`, `s`, `f`, `c`, `[`, `]`, `enter`, `o`, `q`).
17. Web `ModelExplorer` Solid island with shared state for live search, quick filters, sort controls, compare queue controls, selected model panel, and external model links.
18. CLI compare command improvements with optional interactive model selection (`--interactive`) and post-compare summary.
19. CLI export command improvements with `json`, `ndjson`, `csv`, and `markdown` outputs plus `--filter`, `--sort`, `--limit`, and `--compact` controls.
20. CLI maintenance and utility commands including `refresh`, `tui`, and `doctor`.
21. Ingest consolidation refactor into pure helper functions for testability (`consolidate-lib`).
22. Ingest edge-case tests covering price normalization, invalid throughput handling, and full/compact snapshot generation consistency.
23. Catalog behavior tests for filtering, sorting, and weighted picking.
24. End-to-end workspace quality pipelines via Turborepo for `typecheck`, `test`, `lint`, and `build`.

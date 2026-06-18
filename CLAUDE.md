# Project Overview

Trawl is a VS Code extension that provides zero-click outdated dependency warnings and version autocomplete for npm `package.json` files and Python `requirements*.txt` files. Outdated deps surface as native VS Code diagnostics (Problems panel, editor underlines, file explorer decorations) - no toolbar button, no sidebar required.

## Essential Commands

### Development
- `yarn compile` - Type-check then bundle with esbuild (dev mode, with sourcemaps)
- `yarn watch` - Start esbuild in watch mode (use alongside F5 Extension Development Host)
- `yarn check-types` - Run `tsc --noEmit` to check types without emitting files
- `yarn package` - Production build (type-check + minified bundle, no sourcemaps)
- `yarn lint` - Run ESLint on `src/`

### Debugging
Press **F5** in VS Code to launch the Extension Development Host with the extension loaded. After editing source files, press `Ctrl+Shift+F5` / `Cmd+Shift+F5` to reload.

## Architecture Overview

### Tech Stack
- TypeScript (strict mode, ES2022, CommonJS output)
- VS Code Extension API (`vscode` 1.85+)
- `semver` library for npm version comparison; `@renovatebot/pep440` for Python (PEP 440) version comparison
- esbuild for bundling (single output file: `dist/extension.js`)
- Node.js `https` module for registry HTTP requests (no fetch, no axios)

### Key Directory Structure
The code is split into an ecosystem-agnostic **core** and one self-contained
folder per ecosystem (`npm`, `python`). Core orchestration and providers never
reference npm/PyPI directly — they go through the `Ecosystem` interface.
```
src/
├── extension.ts            # Entry point - registers providers per ecosystem
├── core/
│   ├── types.ts            # Shared types + the Ecosystem interface
│   ├── ecosystem.ts        # ECOSYSTEMS list + ecosystemForDocument() lookup
│   ├── http.ts             # fetchJson() https helper
│   ├── registry-cache.ts   # Generic TTL cache + dedup + prefetch + bg-refresh factory
│   ├── diagnostics.ts      # Core feature - zero-click diagnostics (dispatches to ecosystem)
│   ├── completion.ts       # Autocomplete provider (delegates item building)
│   ├── hover.ts            # Hover provider (delegates links/labels)
│   └── code-actions.ts     # Quick-fix actions (reads TrawlDiagnostic metadata)
├── npm/                    # package.json parser, npm registry, semver-utils, presentation, index (npmEcosystem)
└── python/                 # requirements.txt parser, PyPI registry, pep440-utils, presentation, index (pythonEcosystem)
```

To add an ecosystem: create `src/<name>/` implementing the pieces, export an
`Ecosystem` from its `index.ts`, and add it to `ECOSYSTEMS` in `core/ecosystem.ts`.

### Core Features
- **Diagnostics**: Severity mapped to update type - major=Error, minor=Warning, patch=Info, prerelease=Hint
- **Completion**: Real registry versions newest-first; npm offers `^`/exact/`~`/dist-tags, Python offers `==`/`>=`
- **Hover**: Markdown table with current, max satisfying, latest, publish date, and registry links
- **Code Actions**: Update to latest (preserving prefix/operator), pin exact, open on npm/PyPI
- **Caching**: In-memory TTL cache with inflight deduplication and background refresh at 80% TTL (shared `registry-cache` factory, one instance per ecosystem)

### Import Paths
Uses relative imports - no path aliases. Core imports from `./` within `core/`;
ecosystem modules import the core via `../core/*`. Example:
```ts
import { createRegistryCache } from '../core/registry-cache'
import { PackageInfo } from '../core/types'
```

### Configuration Namespace
All VS Code settings use the `trawl.*` prefix (e.g. `trawl.cacheTTLMinutes`). When reading config, always use `vscode.workspace.getConfiguration('trawl')`.

## Testing Strategy

Jest (`ts-jest`) is configured; run with `yarn test`. Tests live in per-module
`__tests__/` folders (e.g. `src/python/__tests__/`) and match `**/__tests__/**/*.test.ts`.
`vscode` is stubbed via `src/__mocks__/vscode.ts`, so prefer pure functions for
parsing/version logic (e.g. `parseRequirements(text)`) to keep tests independent
of the editor API. The ESM-only `@renovatebot/pep440` is transpiled via the Jest
`transform`/`transformIgnorePatterns` config in `package.json`.

## Development Guidelines

### Code Style
- Never use `any` - use `unknown`, generics, or utility types
- Use descriptive variable names; use singular form when iterating (e.g. `for (const dep of deps)`)
- Avoid superfluous comments; only comment for non-obvious logic or business rules
- Do not truncate variable names (e.g. `document` not `doc`, `packageName` not `pkg`)
- Prefer interfaces over type aliases
- Named exports everywhere; no default exports

### VS Code Extension Patterns
- Register all disposables via `context.subscriptions.push(...)` - never leak disposables
- Use `vscode.workspace.getConfiguration('trawl')` for all config reads
- Diagnostics go through the shared `DiagnosticCollection` in `core/diagnostics.ts`
- Analysis results are cached in the `analysisCache` Map and shared with hover/code-action providers to avoid redundant registry calls
- The `TrawlDiagnostic` type extends `vscode.Diagnostic` with metadata fields (`_depName`, `_suggestedVersion`, etc.) for use by code actions

### Dependency Pinning
Always pin packages to exact versions in `package.json` (e.g. `"semver": "7.6.0"`, not `"^7.6.0"`).

# Implementation Plan: WebTerm npm Global Installer

**Branch**: `001-tmux-web-terminal` | **Date**: 2026-02-22 | **Spec**: [spec.md](spec.md)
**Input**: "I want to create an installer for this project so that I can install and run it locally on any computer"

**Note**: This plan covers packaging WebTerm as an npm global package (`npm install -g webterm`) so it can be installed and run on any machine with Node.js 20+.

## Summary

Package WebTerm as a single npm-publishable package with a `webterm` CLI command. On install, prebuilt native binaries for `node-pty` are downloaded (no C++ build tools required). Running `webterm` starts the backend server and opens the browser. The monorepo build artifacts (backend dist + frontend dist + shared types) are flattened into one publishable package.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node.js 20+ (ESM)
**Primary Dependencies**: node-pty (switch to prebuilt fork), better-sqlite3 (already ships prebuilts), ws, xterm.js, React 19, Vite
**Storage**: SQLite via better-sqlite3 (user-local `~/.webterm/data/webterm.db`)
**Testing**: Vitest (unit/integration), manual install testing on Windows/macOS/Linux
**Target Platform**: Windows 10+, macOS, Linux (any system with Node.js 20+)
**Project Type**: CLI tool (npm global package)
**Performance Goals**: `npm install -g webterm` completes in <60s on broadband; `webterm` starts server in <3s
**Constraints**: No C++ build tools required on user's machine; single `webterm` command to launch
**Scale/Scope**: Single-user local deployment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality — Formatting | PASS | ESLint + Prettier already enforced |
| I. Code Quality — Modularity | PASS | CLI entry point is a single-responsibility module |
| I. Code Quality — Type Safety | PASS | TypeScript strict mode throughout |
| II. Testing Standards | PASS | Installer scripts tested via Vitest; install/launch integration tested manually per platform |
| III. UX Consistency — Responsive Feedback | PASS | CLI prints status messages during startup |
| III. UX Consistency — Graceful Degradation | PASS | Browser-open failure falls back to printing URL |
| IV. Performance — Initial Load | PASS | Server starts in <3s, browser loads <2s (existing) |
| IV. Performance — Bundle Size | PASS | No change to frontend bundle |

**Quality Gates**: Lint, typecheck, unit tests all pass. Manual install test on at least Windows + one Unix platform before publish.

## Research Findings

### Native Dependency Strategy

**Decision**: Replace `node-pty` with `@lydell/node-pty` (prebuilt binaries).

**Rationale**: `@lydell/node-pty` ships prebuilt `.node` binaries for all major platforms (Windows x64/arm64, macOS x64/arm64, Linux x64/arm64). It never invokes node-gyp, eliminating the need for Python, Visual Studio Build Tools, or any C++ compiler on the user's machine. `better-sqlite3` already ships prebuilt binaries via `prebuild-install` for Node.js LTS versions.

**Alternatives considered**:
- `node-pty-prebuilt-multiarch`: Similar approach but falls back to node-gyp on unsupported platforms (less reliable).
- Original `node-pty`: Requires C++ build tools — dealbreaker for "any computer" goal.

### Package Flattening Strategy

**Decision**: Build all workspaces, then publish a single flat package from a `dist/` staging directory.

**Rationale**: npm workspaces cannot be published as a monorepo root. A build script assembles:
- `dist/backend/` — compiled backend JS
- `dist/frontend/` — Vite-built static files
- `dist/shared/` — compiled shared types
- `dist/bin/webterm.js` — CLI entry point
- `dist/package.json` — publishable package.json with correct `bin`, `files`, `engines`

**Alternatives considered**:
- Publish workspace packages separately (`@webterm/backend`, `@webterm/frontend`): Adds publishing complexity and version coordination burden for no user benefit.
- Restructure to single package: Too disruptive to existing development workflow.

### Data Directory Strategy

**Decision**: Store database and runtime data in `~/.webterm/` (platform-aware home directory).

**Rationale**: A global npm package cannot write to its install directory (it's often read-only, especially on Unix). Using the user's home directory is the standard convention for CLI tools. Path: `~/.webterm/data/webterm.db`.

**Alternatives considered**:
- XDG-compliant paths (`~/.local/share/webterm`): More correct on Linux but unfamiliar on Windows/macOS; adds complexity for minimal benefit.
- Temp directory: Data lost on reboot; violates session persistence requirement.

### Browser Launch Strategy

**Decision**: Use the `open` npm package to open the default browser.

**Rationale**: Cross-platform browser opening is non-trivial (`start` on Windows, `open` on macOS, `xdg-open` on Linux). The `open` package (by Sindre Sorhus, 10M+ weekly downloads) handles all platforms reliably.

**Alternatives considered**:
- `child_process.exec` with platform detection: More code to maintain, edge cases.
- No auto-open (print URL only): Worse UX; user wants single-command launch.

## Project Structure

### Documentation (this feature)

```text
specs/001-tmux-web-terminal/
├── plan.md              # This file
├── research.md          # Original WebTerm research (unchanged)
├── data-model.md        # Original WebTerm data model (unchanged)
├── quickstart.md        # Original WebTerm dev quickstart (unchanged)
├── contracts/
│   ├── rest-api.md      # Existing REST API contract
│   ├── websocket-protocol.md  # Existing WebSocket contract
│   └── cli-interface.md # NEW: CLI command contract
└── tasks.md             # Generated by /speckit.tasks
```

### Source Code (repository root)

```text
webterm/
├── backend/             # Existing — no structural changes
│   └── src/
│       ├── config/index.ts  # MODIFY: support ~/.webterm/ data dir
│       └── ...
├── frontend/            # Existing — no changes
├── shared/              # Existing — no changes
├── bin/
│   └── webterm.js       # NEW: CLI entry point (hashbang, starts server, opens browser)
├── scripts/
│   └── prepare-publish.js  # NEW: Build + assemble publishable package
├── package.json         # MODIFY: add bin, files, prepare-publish script
└── publish/             # GENERATED: staging dir for npm publish (gitignored)
    ├── package.json
    ├── bin/webterm.js
    ├── backend/dist/
    ├── frontend/dist/
    └── shared/
```

**Structure Decision**: Keep the existing monorepo for development. Add a `scripts/prepare-publish.js` build script that assembles a flat publishable package in `publish/`. The `bin/webterm.js` CLI entry point lives in the repo root for development, and is copied to `publish/bin/` for distribution.

## Design: CLI Entry Point (`bin/webterm.js`)

```
#!/usr/bin/env node

1. Parse CLI args (--port, --host, --no-open, --data-dir, --help, --version)
2. Resolve data directory (~/.webterm/ by default)
3. Ensure data directory exists
4. Set env vars (WEBTERM_DB_PATH, PORT, HOST, NODE_ENV=production)
5. Import and start backend server (backend/dist/index.js)
6. Wait for server "listening" event
7. Open browser to http://{host}:{port} (unless --no-open)
8. Print startup banner with URL and keybinding hint
9. Handle SIGINT/SIGTERM for graceful shutdown
```

## Design: Build/Publish Pipeline (`scripts/prepare-publish.js`)

```
1. Clean publish/ directory
2. Run npm run build (shared → backend → frontend)
3. Copy backend/dist/ → publish/backend/dist/
4. Copy frontend/dist/ → publish/frontend/dist/
5. Copy shared/ → publish/shared/
6. Copy bin/webterm.js → publish/bin/webterm.js
7. Generate publish/package.json:
   - name: "webterm"
   - bin: { "webterm": "./bin/webterm.js" }
   - files: ["bin/", "backend/dist/", "frontend/dist/", "shared/"]
   - engines: { "node": ">=20.0.0" }
   - dependencies: only runtime deps (ws, better-sqlite3, @lydell/node-pty, uuid, open)
   - NO devDependencies
8. Copy README.md → publish/README.md
9. Print instructions for: cd publish && npm publish
```

## Design: Config Changes

### `backend/src/config/index.ts`

Add resolution of `~/.webterm/` as default data directory when running as installed CLI (detected via `NODE_ENV=production` or `WEBTERM_INSTALLED=1`):

```typescript
function getDefaultDbPath(): string {
  if (process.env.WEBTERM_DB_PATH) return process.env.WEBTERM_DB_PATH;
  if (process.env.NODE_ENV === 'production') {
    const home = os.homedir();
    return path.join(home, '.webterm', 'data', 'webterm.db');
  }
  return './data/webterm.db';  // dev mode default (unchanged)
}
```

### `package.json` (root)

Add:
```json
{
  "scripts": {
    "prepare-publish": "node scripts/prepare-publish.js",
    "publish:dry": "cd publish && npm pack --dry-run"
  }
}
```

### `.gitignore`

Add: `publish/`

## Native Dependency Swap

Replace `node-pty` with `@lydell/node-pty` in `backend/package.json`:

```diff
- "node-pty": "^1.1.0",
+ "@lydell/node-pty": "^1.1.0",
```

Update imports in `backend/src/services/pty-service.ts`:

```diff
- import * as pty from 'node-pty';
+ import * as pty from '@lydell/node-pty';
```

The `@lydell/node-pty` package is API-compatible with `node-pty` — no other code changes needed.

## Complexity Tracking

No constitution violations. The approach is minimal — no new frameworks, no new build tools, just a CLI wrapper and a build script.

# Implementation Plan: Full tmux Compatibility

**Branch**: `005-tmux-full-compat` | **Date**: 2026-02-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-tmux-full-compat/spec.md`

## Summary

Implement comprehensive tmux compatibility for WebTerm, covering 40 commands, vi-mode copy mode, configurable key bindings, hierarchical options, format string rendering, preset layouts, status bar, paste buffers, hooks, and multi-session management. The approach uses a shared command registry with hand-written tokenizer, client-side copy mode via xterm.js buffer APIs, and server-side command execution with hierarchical option resolution.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, ESM throughout)
**Primary Dependencies**: React 19, xterm.js 5.x (WebGL renderer), node-pty, better-sqlite3, Zustand, Vite, Tailwind CSS
**Storage**: SQLite via better-sqlite3 (WAL mode) — existing `./data/webterm.db`
**Testing**: Vitest (unit + integration), Playwright (E2E)
**Target Platform**: Web browser (frontend) + Node.js server (backend), cross-platform (Linux, macOS, Windows)
**Project Type**: Web application (monorepo: backend + frontend + shared)
**Performance Goals**: <50ms keystroke-to-display latency, 60fps terminal rendering, <2s initial load
**Constraints**: <200MB memory for typical sessions, <500KB gzipped JS bundle, 80% test coverage for new code
**Scale/Scope**: Single-user to small-team usage on trusted networks, 40 commands, ~20 format variables, ~50 options

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality — Formatting | PASS | All new code subject to existing ESLint + Prettier config |
| I. Code Quality — Modularity | PASS | New services follow single-responsibility (command-service, option-service, hook-service, etc.) |
| I. Code Quality — Documentation | PASS | Public APIs (command registry, format parser, option resolver) will include JSDoc |
| I. Code Quality — Type Safety | PASS | Strict TypeScript, discriminated unions for commands and messages |
| I. Code Quality — Naming | PASS | Follows existing camelCase/PascalCase conventions |
| II. Testing — Unit Tests | PASS | Parser, format strings, layout algorithms, option resolution all unit-testable pure functions |
| II. Testing — Integration Tests | PASS | Command execution, WebSocket roundtrips, copy mode flows |
| II. Testing — Coverage 80% | PASS | New code targets 80%+; pure shared/ code should exceed 90% |
| II. Testing — Test Independence | PASS | Each test creates its own state; no cross-test dependencies |
| II. Testing — Descriptive Names | PASS | Will follow `should_X_when_Y` convention |
| III. UX — Responsive Feedback | PASS | Command prompt, status bar, copy mode all provide immediate visual feedback |
| III. UX — Error Messages | PASS | `commandError` messages include the failed command and human-readable message |
| III. UX — Keyboard Navigation | PASS | Core feature — all functionality accessible via keyboard (tmux key tables) |
| III. UX — Visual Consistency | PASS | Status bar, command prompt, overlays follow existing Tailwind design system |
| III. UX — Graceful Degradation | PASS | Copy mode falls back if Decoration API unavailable; status bar is HTML (no WebGL dependency) |
| IV. Performance — Initial Load | WATCH | Adding ~40 command definitions + parser; shared code is small. Monitor bundle impact. |
| IV. Performance — Input Latency | PASS | Copy mode is client-side only; command execution is async. No latency regression for normal typing. |
| IV. Performance — Memory | PASS | Paste buffers capped at 50 (configurable). Options stored in SQLite, not all in memory. |
| IV. Performance — Render Performance | PASS | Status bar is React/HTML, not inside xterm canvas. No render pipeline changes. |
| IV. Performance — Bundle Size | WATCH | New frontend code (copy mode, command prompt, status bar, choose-tree). Estimate ~30-40KB gzipped. Monitor. |

**Gate result**: PASS (2 items marked WATCH for monitoring, no violations)

**Post-Phase 1 re-check**: No changes. The design keeps the shared parser lightweight (~150 lines), frontend components are standard React, and no new heavy dependencies are introduced. Bundle size impact remains within the 50KB justification threshold.

## Project Structure

### Documentation (this feature)

```text
specs/005-tmux-full-compat/
├── plan.md              # This file
├── spec.md              # Feature specification (70 functional requirements)
├── research.md          # Phase 0 output (7 research decisions)
├── data-model.md        # Phase 1 output (6 new entities, 3 modified entities)
├── quickstart.md        # Phase 1 output (developer guide)
├── contracts/
│   ├── websocket-messages.md  # 13 client + 11 server new message types
│   └── command-registry.md    # 40 commands, parser interface, key bindings
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
shared/
├── types/
│   ├── messages.ts          # MODIFY — add new Client/ServerMessage variants
│   └── models.ts            # MODIFY — add new entity interfaces, extend existing
└── tmux/
    ├── command-registry.ts  # NEW — CommandDef, CommandRegistry, tokenizer, parser
    ├── command-defs.ts      # NEW — 40 command definitions with flags/args
    ├── format-parser.ts     # NEW — #{variable} and #{?cond,t,f} parser
    ├── option-definitions.ts # NEW — option name/type/default/scope catalog
    └── target-parser.ts     # NEW — session:window.pane target specifier parser

backend/
├── src/
│   ├── db/
│   │   └── schema.sql       # MODIFY — add key_bindings, options, hooks tables + migrations
│   ├── services/
│   │   ├── session-service.ts   # MODIFY — add lastWindowId, multi-session ops
│   │   ├── layout-service.ts    # MODIFY — add 5 preset layout algorithms
│   │   ├── pty-service.ts       # MODIFY — add title polling, OSC parsing, respawn
│   │   ├── websocket-server.ts  # MODIFY — add 13 new message handlers, multi-client
│   │   ├── command-service.ts   # NEW — command execution engine (dispatch parsed commands)
│   │   ├── keybinding-service.ts # NEW — CRUD for key bindings, default loading
│   │   ├── option-service.ts    # NEW — hierarchical option get/set with scope resolution
│   │   ├── hook-service.ts      # NEW — hook registration, lifecycle event dispatch
│   │   └── paste-buffer-service.ts # NEW — in-memory paste buffer stack
│   └── api/
│       └── routes/
│           └── sessions.ts  # MODIFY — add session list/switch endpoints
└── tests/
    ├── command-parser.test.ts     # NEW
    ├── command-service.test.ts    # NEW
    ├── option-service.test.ts     # NEW
    ├── layout-presets.test.ts     # NEW
    └── paste-buffer.test.ts       # NEW

frontend/
├── src/
│   ├── hooks/
│   │   ├── useKeyBindings.ts     # MODIFY — replace hardcoded bindings with registry lookup
│   │   ├── useCopyMode.ts        # NEW — vi-mode copy mode with xterm.js APIs
│   │   ├── useCommandPrompt.ts   # NEW — command prompt state and autocomplete
│   │   └── useFormatString.ts    # NEW — format string resolution for status bar
│   ├── components/
│   │   ├── StatusBar.tsx          # NEW — three-section status bar
│   │   ├── CommandPrompt.tsx      # NEW — overlay command input with completions
│   │   ├── ChooseTree.tsx         # NEW — interactive session/window/pane browser
│   │   └── DisplayPanes.tsx       # NEW — pane number overlay
│   └── stores/
│       ├── session-store.ts       # MODIFY — multi-session state, options
│       └── keybinding-store.ts    # NEW — client-side key binding state
└── tests/
    ├── copy-mode.test.ts          # NEW
    ├── command-prompt.test.ts     # NEW
    └── status-bar.test.ts         # NEW
```

**Structure Decision**: Extends the existing monorepo layout. New shared tmux-specific code goes in `shared/tmux/` to keep it separate from existing `shared/types/`. New backend services follow the existing `services/` pattern. New frontend components and hooks follow existing directory conventions.

## Complexity Tracking

No constitution violations to justify. The design stays within existing monorepo structure, uses no new heavy dependencies, and follows established patterns throughout.

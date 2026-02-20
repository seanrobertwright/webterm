# Implementation Plan: Web Terminal Multiplexer (WebTerm)

**Branch**: `001-tmux-web-terminal` | **Date**: 2026-02-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-tmux-web-terminal/spec.md`

## Summary

Build a web-based terminal multiplexer mimicking tmux functionality. Users can spawn multiple terminal panes, split horizontally/vertically, resize panes, and execute commands including AI CLI tools (Claude Code, Gemini CLI, Codex). Single-user local deployment with WebSocket communication and SQLite persistence.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend + backend)  
**Primary Dependencies**: Vite (build), React (UI), GlitchCN/UI (components), xterm.js (terminal emulation), node-pty (PTY spawning), ws (WebSocket), better-sqlite3 (persistence)  
**Storage**: SQLite (local file-based via better-sqlite3)  
**Testing**: Vitest (unit/integration), Playwright (E2E)  
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge) + Node.js backend  
**Project Type**: Web application (frontend + backend)  
**Performance Goals**: <50ms input latency, 60fps rendering, 1000 lines/sec output throughput, <2s initial load  
**Constraints**: <500KB gzipped bundle, <200MB memory, single-user local deployment  
**Scale/Scope**: Single user, up to 16 concurrent panes, 10,000 line scrollback per pane

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| I. Code Quality - Formatting | Automated linting/formatting | ✅ PASS | ESLint + Prettier configured |
| I. Code Quality - Modularity | Single responsibility | ✅ PASS | Separate services for PTY, WebSocket, Session |
| I. Code Quality - Documentation | Public API docs | ✅ PASS | JSDoc/TSDoc for all exports |
| I. Code Quality - Type Safety | Explicit types, no `any` | ✅ PASS | TypeScript strict mode |
| I. Code Quality - Naming | camelCase/PascalCase conventions | ✅ PASS | Standard TS conventions |
| II. Testing - Unit Tests | Coverage for public functions | ✅ PASS | Vitest for unit tests |
| II. Testing - Integration Tests | E2E for multi-component flows | ✅ PASS | Playwright for integration |
| II. Testing - Coverage | ≥80% for new code | ✅ PASS | Coverage threshold in CI |
| II. Testing - Independence | No test interdependence | ✅ PASS | Isolated test fixtures |
| III. UX - Responsive Feedback | <100ms feedback | ✅ PASS | WebSocket real-time, spec requires <50ms |
| III. UX - Error Messages | Actionable errors | ✅ PASS | User-friendly messages in spec |
| III. UX - Keyboard Navigation | Full keyboard access | ✅ PASS | tmux-like keybindings specified |
| III. UX - Visual Consistency | Design system followed | ✅ PASS | GlitchCN/UI design system |
| III. UX - Graceful Degradation | Handle missing capabilities | ✅ PASS | Fallback clipboard in spec |
| IV. Performance - Initial Load | <2s first paint | ✅ PASS | Vite build optimization |
| IV. Performance - Input Latency | <50ms keystroke | ✅ PASS | Explicit spec requirement |
| IV. Performance - Memory | <200MB typical session | ✅ PASS | Explicit spec constraint |
| IV. Performance - Render | 60fps normal, 30fps heavy | ✅ PASS | xterm.js WebGL renderer |
| IV. Performance - Bundle | <500KB gzipped | ✅ PASS | GlitchCN 142KB + xterm.js ~150KB |
| Quality Gates | All 8 gates defined | ✅ PASS | CI pipeline will enforce |

**Pre-Design Gate Status**: ✅ ALL PASS - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/           # TypeScript interfaces and SQLite schemas
│   │   ├── session.ts
│   │   ├── window.ts
│   │   ├── pane.ts
│   │   └── layout.ts
│   ├── services/         # Core business logic
│   │   ├── pty-service.ts       # PTY spawning and management
│   │   ├── session-service.ts   # Session persistence via SQLite
│   │   ├── shell-service.ts     # Cross-platform shell detection
│   │   ├── layout-service.ts    # Pane split and layout management
│   │   └── broadcast-service.ts # Broadcast mode state management
│   ├── api/              # WebSocket handlers
│   │   ├── websocket-server.ts
│   │   └── handlers/
│   │       ├── terminal-handler.ts
│   │       └── session-handler.ts
│   ├── db/               # SQLite setup and migrations
│   │   └── database.ts
│   └── index.ts          # Entry point
└── tests/
    ├── unit/
    └── integration/

frontend/
├── src/
│   ├── components/       # React components
│   │   ├── terminal/
│   │   │   ├── Terminal.tsx
│   │   │   ├── TerminalPane.tsx
│   │   │   └── TerminalBuffer.tsx
│   │   ├── layout/
│   │   │   ├── PaneContainer.tsx
│   │   │   ├── PaneSplitter.tsx
│   │   │   └── WindowTabs.tsx
│   │   └── ui/           # GlitchCN/UI components
│   ├── hooks/            # Custom React hooks
│   │   ├── useTerminal.ts
│   │   ├── useWebSocket.ts
│   │   └── useKeyBindings.ts
│   ├── services/         # Frontend services
│   │   ├── websocket-client.ts
│   │   └── clipboard-service.ts
│   ├── stores/           # State management
│   │   ├── session-store.ts
│   │   └── pane-store.ts
│   ├── types/            # Shared TypeScript types
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── unit/
│   └── e2e/              # Playwright E2E tests
├── index.html
└── vite.config.ts

shared/                   # Shared types between frontend/backend
└── types/
    ├── messages.ts       # WebSocket message types
    └── models.ts         # Shared entity types
```

**Structure Decision**: Web application structure (frontend + backend) selected based on requirement for browser-based UI communicating with a Node.js backend that spawns PTY processes. Shared types directory enables type-safe WebSocket communication.

## Complexity Tracking

> No Constitution Check violations - section not required.

---

## Post-Design Constitution Check

*Re-evaluation after Phase 1 design completion.*

| Principle | Requirement | Status | Design Validation |
|-----------|-------------|--------|-------------------|
| I. Code Quality - Formatting | Automated linting/formatting | ✅ PASS | ESLint + Prettier in quickstart |
| I. Code Quality - Modularity | Single responsibility | ✅ PASS | Separate services: pty-service, session-service, shell-service |
| I. Code Quality - Documentation | Public API docs | ✅ PASS | Contracts documented in /contracts/ |
| I. Code Quality - Type Safety | Explicit types, no `any` | ✅ PASS | Shared types in /shared/types/ |
| I. Code Quality - Naming | camelCase/PascalCase | ✅ PASS | Conventions in data-model.md |
| II. Testing - Unit Tests | Coverage for public functions | ✅ PASS | Test structure in project layout |
| II. Testing - Integration Tests | E2E tests defined | ✅ PASS | Playwright E2E in /frontend/tests/e2e/ |
| II. Testing - Coverage | ≥80% threshold | ✅ PASS | CI configuration planned |
| II. Testing - Independence | Isolated fixtures | ✅ PASS | SQLite per-test database pattern |
| III. UX - Responsive Feedback | <100ms feedback | ✅ PASS | Binary WebSocket protocol for <50ms |
| III. UX - Error Messages | Actionable errors | ✅ PASS | Error codes in contracts/rest-api.md |
| III. UX - Keyboard Navigation | Full keyboard access | ✅ PASS | tmux keybindings in research.md |
| III. UX - Visual Consistency | Design system | ✅ PASS | GlitchCN/UI throughout frontend |
| III. UX - Graceful Degradation | Handle missing capabilities | ✅ PASS | Flow control, reconnection in protocol |
| IV. Performance - Initial Load | <2s first paint | ✅ PASS | ~400KB bundle estimate |
| IV. Performance - Input Latency | <50ms keystroke | ✅ PASS | Binary protocol, direct forwarding |
| IV. Performance - Memory | <200MB typical | ✅ PASS | 10K scrollback, WebGL renderer |
| IV. Performance - Render | 60fps | ✅ PASS | xterm.js WebGL addon |
| IV. Performance - Bundle | <500KB gzipped | ✅ PASS | 142KB + 150KB + 45KB + app ≈ 400KB |
| Quality Gates | All 8 gates | ✅ PASS | CI pipeline structure defined |

**Post-Design Gate Status**: ✅ ALL PASS - Proceed to `/speckit.tasks`

---

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Implementation Plan | [plan.md](plan.md) | This file |
| Research | [research.md](research.md) | Technology decisions and rationale |
| Data Model | [data-model.md](data-model.md) | Entity definitions and relationships |
| WebSocket Protocol | [contracts/websocket-protocol.md](contracts/websocket-protocol.md) | Real-time message specification |
| REST API | [contracts/rest-api.md](contracts/rest-api.md) | Session management endpoints |
| Quickstart | [quickstart.md](quickstart.md) | Developer onboarding guide |
| Agent Context | [../../.github/agents/copilot-instructions.md](../../.github/agents/copilot-instructions.md) | Updated Copilot context |

---
phase: 01-session-management
plan: 02
subsystem: session-export
tags: [export, json, scrollback, terminal, serialize]
dependency-graph:
  requires: []
  provides: [session-export, terminal-serialize]
  affects: [session-panel, terminal-component]
tech-stack:
  added: ["@xterm/addon-serialize (already dep, now wired into Terminal.tsx)"]
  patterns: [blob-download, serialize-addon, globalThis-terminalHandles]
key-files:
  created:
    - frontend/src/services/export-service.ts
  modified:
    - frontend/src/components/terminal/Terminal.tsx
    - frontend/src/components/session/SessionList.tsx
    - shared/types/models.ts
decisions:
  - "Used SerializeAddon directly in Terminal.tsx rather than useTerminal hook since Terminal.tsx is the component used by TerminalPane"
  - "Export is fully client-side: fetch session structure from API, collect scrollback from mounted terminals, download as JSON"
  - "Non-active sessions export with empty scrollback (valid JSON) since their terminals are not mounted"
metrics:
  duration: 193s
  completed: 2026-03-13T16:21:11Z
  tasks: 2/2
  files-changed: 4
---

# Phase 01 Plan 02: Session Export Summary

Per-session JSON export with terminal scrollback capture via SerializeAddon and browser download.

## What Was Implemented

### Task 1: TerminalHandle serialize() and SessionExport types
- Added `SerializeAddon` import and initialization to `Terminal.tsx`
- Exposed `serialize(): string | null` on the `TerminalHandle` interface
- Defined `SessionExport`, `SessionExportWindow`, and `SessionExportPane` interfaces in `shared/types/models.ts`

### Task 2: Export service and Export button
- Created `frontend/src/services/export-service.ts` with:
  - `collectScrollback()` - reads serialized content from `globalThis.terminalHandles`
  - `downloadJson()` - Blob + createObjectURL download pattern
  - `exportSession()` - fetches session, collects scrollback, triggers download
- Added Export button (download document icon) to each session row in `SessionList.tsx`
- Button shows loading state (pulse animation + disabled) during export
- Filename format: `{sanitizedSessionName}-{ISO-timestamp}.json`

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit  | Description |
|------|---------|-------------|
| 1    | 919dcf9 | feat(01-02): expose serialize() on TerminalHandle and add SessionExport types |
| 2    | 7532966 | feat(01-02): add session export service and Export button in SessionList |

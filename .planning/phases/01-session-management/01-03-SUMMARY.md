---
phase: 01-session-management
plan: 03
subsystem: session-import
tags: [import, json, scrollback, file-picker, rest-api]
dependency-graph:
  requires: [01-01, 01-02]
  provides: [session-import, scrollback-replay]
  affects: [session-panel, session-service]
tech-stack:
  added: []
  patterns: [file-picker-promise, layout-tree-remapping, scrollback-replay-with-retry]
key-files:
  created:
    - frontend/src/services/import-service.ts
  modified:
    - backend/src/services/session-service.ts
    - backend/src/api/routes/sessions.ts
    - backend/src/api/rest-router.ts
    - frontend/src/services/session-api.ts
    - frontend/src/components/session/SessionPanel.tsx
decisions:
  - "Import creates entirely new DB records (session, windows, panes) with fresh UUIDs rather than reusing exported IDs"
  - "Layout tree pane IDs are recursively remapped from old to new IDs during import"
  - "Scrollback replay uses retry loop (up to 6 attempts, 500ms apart) to wait for terminal mounting"
  - "Import endpoint has 10MB body limit vs 1MB default for other routes"
metrics:
  duration: 257s
  completed: 2026-03-13T16:27:28Z
  tasks: 2/2
  files-changed: 6
---

# Phase 01 Plan 03: Session Import Summary

Session import from exported JSON files with full structure recreation (windows, panes, layout) and scrollback replay into mounted terminals.

## What Was Implemented

### Task 1: Backend import endpoint
- Added `importSession` method to `SessionService` that creates a new session from a `SessionExport` payload
- Recursively remaps pane IDs in layout trees from old exported IDs to freshly generated UUIDs
- Auto-renames duplicate session names (same logic as `createSession`)
- Added `handleImportSession` route handler with validation (version, session name, windows array)
- Registered `POST /api/v1/sessions/import` route with 10MB body size limit
- Added `maxBodySize` option to `registerRoute` and `parseJsonBody` for route-specific body limits

### Task 2: Frontend import flow with file picker and scrollback replay
- Created `import-service.ts` with:
  - `openFilePicker()` - hidden file input with Promise-based selection
  - `parseExportFile()` - JSON parse + format validation (version, session structure)
  - `replayScrollback()` - retry-based scrollback write to terminal handles via `globalThis.terminalHandles`
  - `importSession()` - orchestrates full flow and returns session ID for caller to switch to
- Added `importSessionApi` to `session-api.ts` for the POST request
- Added Import button to `SessionPanel.tsx` header with loading state
- After import, auto-switches to the new session and schedules scrollback replay

## Task Commits

| Task | Commit  | Description |
|------|---------|-------------|
| 1    | 27f48e9 | feat(01-03): backend import endpoint with session structure recreation |
| 2    | d132886 | feat(01-03): frontend import flow with file picker and scrollback replay |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added maxBodySize option to route registration**
- **Found during:** Task 1
- **Issue:** `parseJsonBody` had a hardcoded 1MB limit; the import endpoint needs 10MB
- **Fix:** Made `parseJsonBody` accept an optional `maxSize` parameter, added `maxBodySize` to the Route interface, and passed it through `registerRoute` options
- **Files modified:** backend/src/api/rest-router.ts
- **Committed in:** 27f48e9

**2. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes violations**
- **Found during:** Task 1 (typecheck)
- **Issue:** TypeScript strict mode (`exactOptionalPropertyTypes`) rejected `undefined` values for optional properties on `Route.maxBodySize` and `Layout.sizes`
- **Fix:** Used spread conditional for Route, and separate assignment for Layout sizes
- **Files modified:** backend/src/api/rest-router.ts, backend/src/services/session-service.ts
- **Committed in:** 27f48e9

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both necessary for correctness under strict TypeScript settings. No scope creep.

## Self-Check: PASSED

All 6 files verified present. Both task commits (27f48e9, d132886) verified in git log.

---
*Phase: 01-session-management*
*Completed: 2026-03-13*

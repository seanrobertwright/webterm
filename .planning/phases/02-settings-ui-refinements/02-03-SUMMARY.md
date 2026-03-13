---
phase: 02-settings-ui-refinements
plan: 03
subsystem: ui
tags: [react, zustand, settings, pty, node-pty, powershell, fetch]

# Dependency graph
requires:
  - phase: 02-02
    provides: SettingsPanel restyled with theme CSS vars

provides:
  - defaultStartDir field in settings-store with localStorage persistence
  - POST /api/v1/system/pick-directory — cross-platform native folder picker (PowerShell/osascript/zenity)
  - POST /api/v1/system/validate-directory — server-side path validation
  - Default Start Directory section in SettingsPanel with text input, browse button, and inline red error
  - cwd field on CreateWindowMessage shared type
  - cwd passthrough from frontend createWindow action to session-handler to ptyManager.spawn
  - pty-service existsSync safety net falling back to home dir on invalid cwd

affects: [pty-service, session-handler, settings-store, app-newwindow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - cross-platform native folder picker via PowerShell/osascript/zenity from Node.js backend
    - exactOptionalPropertyTypes-safe spread pattern for optional fields in message payloads

key-files:
  created: []
  modified:
    - frontend/src/stores/settings-store.ts
    - frontend/src/components/settings/SettingsPanel.tsx
    - backend/src/api/routes/system.ts
    - backend/src/api/rest-router.ts
    - shared/types/messages.ts
    - backend/src/api/handlers/session-handler.ts
    - backend/src/services/pty-service.ts
    - frontend/src/App.tsx

key-decisions:
  - "exactOptionalPropertyTypes requires spread pattern for optional cwd: ...(cwd ? { cwd } : {}) instead of cwd: cwd || undefined"
  - "validate-directory always returns 200 with valid/error payload — path being invalid is a valid response, not an HTTP error"
  - "pick-directory returns { path: null, cancelled: true } when user dismisses dialog — no error shown to user"
  - "osascript cancel throws an error containing 'User canceled' — caught and mapped to cancelled response"
  - "pty-service safety net uses existsSync to catch paths that become invalid between config time and spawn time"
  - "dirInputValue is a separate local state from store defaultStartDir — allows typing freely before commit on blur/Enter"

patterns-established:
  - "Pattern 1: Optional cwd in messages: always use spread conditional ...(value ? { field: value } : {}) to satisfy exactOptionalPropertyTypes"
  - "Pattern 2: Validate-directory endpoint returns { valid, error? } at 200 — client checks valid, not status code"

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 02 Plan 03: Default Start Directory Summary

**Default start directory setting with native OS folder picker, inline validation errors, and full cwd threading from UI through to PTY spawn**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-13T22:16:12Z
- **Completed:** 2026-03-13T22:19:38Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- User can configure default start directory via text input or native OS folder picker (PowerShell FolderBrowserDialog on Windows, osascript on macOS, zenity on Linux)
- Invalid directory paths show a red inline error below the input; browse cancel shows no error
- New windows created via the keybinding or the "+" tab button open in the configured directory
- Invalid directories at spawn time fall back silently to home directory via pty-service existsSync check

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend endpoints and settings store field** - `f5a806d` (feat)
2. **Task 2: Settings UI, shared type, handler wiring, cwd passthrough** - `3d10bb3` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `frontend/src/stores/settings-store.ts` - Added defaultStartDir field + setter
- `frontend/src/components/settings/SettingsPanel.tsx` - Added Default Start Directory section with browse + error display
- `backend/src/api/routes/system.ts` - Added handlePickDirectory and handleValidateDirectory exports
- `backend/src/api/rest-router.ts` - Registered pick-directory and validate-directory routes
- `shared/types/messages.ts` - Added optional cwd field to CreateWindowMessage payload
- `backend/src/api/handlers/session-handler.ts` - Read cwd from payload, pass to sessionService + ptyManager
- `backend/src/services/pty-service.ts` - Added existsSync safety net + fs import
- `frontend/src/App.tsx` - Wire defaultStartDir into createWindow messages in both trigger sites

## Decisions Made
- Used spread conditional `...(value ? { cwd: value } : {})` to satisfy TypeScript `exactOptionalPropertyTypes: true` — assigning `string | undefined` to an optional property is disallowed under this flag.
- validate-directory always returns HTTP 200 with `{ valid, error? }` — path invalidity is a valid business result, not an HTTP error.
- pick-directory maps osascript cancel exception (contains "User canceled") to `{ path: null, cancelled: true }` — no user-facing error on cancel.
- dirInputValue is a local React state separate from the store value — enables free-form typing before committing on blur or Enter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes violation in cwd passthrough**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Plan specified `cwd: defaultStartDir || undefined` which is `string | undefined`, not assignable to optional `string` under exactOptionalPropertyTypes
- **Fix:** Replaced with spread conditional `...(defaultStartDir ? { cwd: defaultStartDir } : {})` in both App.tsx locations and `...(cwd !== undefined ? { cwd } : {})` in session-handler
- **Files modified:** frontend/src/App.tsx, backend/src/api/handlers/session-handler.ts
- **Verification:** npm run typecheck passes with no errors
- **Committed in:** 3d10bb3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript strict mode bug)
**Impact on plan:** Required fix for correctness under project's strict TypeScript config. No scope change.

## Issues Encountered
None beyond the exactOptionalPropertyTypes fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 02 complete (all 3 plans executed)
- Settings now covers: font size, font family, UI theme, default start directory
- cwd threading infrastructure is in place for future pane-level cwd features

## Self-Check: PASSED

All created/modified files exist and both task commits confirmed.

---
*Phase: 02-settings-ui-refinements*
*Completed: 2026-03-13*

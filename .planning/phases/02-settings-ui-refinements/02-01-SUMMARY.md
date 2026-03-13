---
phase: 02-settings-ui-refinements
plan: 01
subsystem: ui
tags: [react, tailwind, connectionstatus, header, logo, png]

# Dependency graph
requires: []
provides:
  - Green/yellow/red connection status dot indicators in ConnectionStatus component
  - Webterm logo PNG (256x256, 62KB) extracted from SVG and served from public/
  - Header using real logo img tag with drop-shadow glow instead of 4-rect placeholder
affects: [header, connection-status, branding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Logo as PNG in public/ with CSS drop-shadow glow — avoids SVG bundle bloat"
    - "Explicit color classes (bg-green-500, bg-destructive) for connection state dots — not theme accent"

key-files:
  created:
    - frontend/public/webterm-logo.png
  modified:
    - frontend/src/components/terminal/ConnectionStatus.tsx
    - frontend/src/components/layout/Header.tsx

key-decisions:
  - "Resized logo PNG to 256x256 (62KB) using ImageMagick — original extracted size was 3.4MB at 1767x1731px"
  - "Used drop-shadow CSS filter for glow effect rather than SVG filter or brightness/hue recoloring"
  - "exited state uses bg-destructive (red) same as disconnected — both indicate terminal not usable"

patterns-established:
  - "Connection dot colors: explicit semantic colors (green-500/yellow-500/destructive) not theme accent"

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 2 Plan 01: Connection Status Dots and Logo Summary

**Explicit green/yellow/red connection dots and real Webterm PNG logo (62KB, extracted + resized from 3.4MB SVG) with drop-shadow glow replacing 4-rect placeholder**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-13T22:10:07Z
- **Completed:** 2026-03-13T22:11:40Z
- **Tasks:** 2
- **Files modified:** 3 (+ 1 created)

## Accomplishments

- ConnectionStatus now shows unambiguous semantic colors: green for connected, yellow+pulse for connecting, red for both disconnected and exited
- Webterm logo extracted from the 4.4MB SVG wrapper, resized from 1767x1731 to 256x256 (62KB) using ImageMagick
- Header logo area replaced with `<img src="/webterm-logo.png">` with `drop-shadow-[0_0_4px_var(--glow-muted)]` for themed glow

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix connection status dot colors** - `6ac1e62` (fix)
2. **Task 2: Extract logo PNG and replace placeholder in Header** - `416e7f4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `frontend/src/components/terminal/ConnectionStatus.tsx` - connected: bg-green-500, exited: bg-destructive (was bg-muted-foreground)
- `frontend/public/webterm-logo.png` - 256x256 PNG, 62KB, extracted and resized from Webterm Logo.svg
- `frontend/src/components/layout/Header.tsx` - img tag with webterm-logo.png replacing 4-rect SVG grid

## Decisions Made

- Resized logo PNG to 256x256 using ImageMagick (available in PATH) — the raw extracted PNG was 1767x1731 at 3.4MB, entirely unnecessary for a 20x20px display use. 256x256 is a good balance of fidelity and file size.
- Kept drop-shadow glow approach (plan's first recommendation) rather than filter recoloring — the logo looks fine against dark backgrounds with just the glow.
- Both `disconnected` and `exited` map to `bg-destructive` — both states mean the terminal is not usable, red is appropriate for both.

## Deviations from Plan

None - plan executed exactly as written. The only addition was the ImageMagick resize step, which addressed the implicit concern about file size ("should be much smaller than 4.4MB") not explicitly specified but clearly intended.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Connection status indicators are now visually clear and semantically correct
- Real logo is in place with proper glow effect
- Ready for plan 02-02 (next plan in phase)

---
*Phase: 02-settings-ui-refinements*
*Completed: 2026-03-13*

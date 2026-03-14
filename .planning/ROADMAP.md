# Session Management Milestone

**Created:** 2026-03-13
**Branch:** 005-tmux-full-compat (continue on current)
**Main branch:** 001-tmux-web-terminal

## Goal

Add session management capabilities to the hamburger menu: bulk session cleanup and session export/import for portability and archival.

---

## Phase 1: Session Management — Clear All & Export/Import

**Goal:** Add a "Clear All Sessions" button (with confirmation dialog) to the sessions menu, and per-session export/import in JSON format supporting round-trip restore.

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Clear All Sessions with confirmation dialog
- [x] 01-02-PLAN.md — Per-session JSON export with scrollback capture
- [x] 01-03-PLAN.md — Session import from exported JSON files

**Scope:**
- "Clear All Sessions" button in the hamburger menu's session list
  - Confirmation dialog before delete
  - Keeps the current active session, deletes all others
  - Backend API endpoint for bulk delete
- Per-session "Export" button
  - Exports both terminal scrollback (all panes) AND session structure (windows, panes, layout, shell types, working directories)
  - JSON format designed for round-trip (export → import → restore)
- Session "Import" button
  - Import a previously exported JSON file
  - Restore session structure and layout (scrollback is included for reference but terminals start fresh)
- UI in the hamburger menu / sessions panel

**Success criteria:**
- User can clear all non-active sessions with one action + confirmation
- User can export any session to a JSON file
- User can import a JSON file to restore a session
- Exported JSON preserves enough structure for meaningful restore

**Not in scope:**
- Auto-export / scheduled backups
- Cloud sync / remote storage
- Sharing sessions between users

---

## Phase 2: Settings & UI Refinements

**Goal:** Refactor settings panel and polish header UI — remove color theme from settings, add default start directory setting, improve connection status indicators, and replace the placeholder logo with the actual Webterm SVG logo (theme-colorable).

**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md — Connection status dot colors and logo replacement
- [ ] 02-02-PLAN.md — Settings panel restyle with theme variables and ThemeSelector move
- [ ] 02-03-PLAN.md — Default start directory setting with native folder picker

**Scope:**
- Remove "Color Theme" section from settings panel (theme selector in header stays)
- Add "Default Start Directory" setting — new terminals open in specified directory, falls back to OS default if blank
- Connection status indicator: green dot for connected, red dot for disconnected
- Replace placeholder logo SVG in header with actual `Webterm Logo.svg`, tinted to match active theme color

**Success criteria:**
- Settings panel has no color theme section
- Default start directory is persisted and applied when spawning new PTY sessions
- Connection badge shows colored dot indicators (green/red)
- Header logo uses the Webterm Logo SVG, colored to match theme

**Not in scope:**
- New theme creation
- Logo upload/customization
- Settings import/export

---

*Milestone: Session Management*
*Created: 2026-03-13*

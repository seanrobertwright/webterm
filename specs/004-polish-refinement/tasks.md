# Tasks: Polish & Refinement

**Input**: Design documents from `/specs/004-polish-refinement/`
**Prerequisites**: spec.md ✅, `002-core-multi-pane` ✅ (pane splitting must work), `003-session-clipboard` (recommended)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a **web app** project:
- Backend: `backend/src/`
- Frontend: `frontend/src/`
- Shared: `shared/types/`

---

## Phase 1: User Story 1 - Directional Pane Navigation (Priority: P1)

**Goal**: Arrow key navigation moves focus to the visually correct adjacent pane.

**Independent Test**: Create a 2x2 grid, navigate with Ctrl+B + arrows — focus moves in the expected direction.

- [x] T001 [US1] Rewrite `findAdjacentPane()` in backend/src/services/layout-service.ts — replace the linear index-based approach with a spatial algorithm: (1) Build a coordinate map by traversing the layout tree, assigning each leaf pane a bounding box based on cumulative sizes. (2) Given the current pane's bounds and a direction, find the pane whose bounds are adjacent in that direction. For "right", find panes whose left edge equals the current pane's right edge, preferring the one with the closest vertical center.
- [x] T002 [US1] Add `buildPaneCoordinates()` helper in backend/src/services/layout-service.ts — traverse the layout tree depth-first, tracking x/y/width/height at each level. Return `Map<string, { x: number, y: number, w: number, h: number }>` mapping pane IDs to their normalized coordinates (0.0–1.0 range)
- [x] T003 [P] [US1] Mirror directional navigation logic on the frontend in frontend/src/utils/layout-navigation.ts — since the frontend has the layout tree in the pane store, directional navigation can be computed client-side without a round-trip. Export `findAdjacentPaneId(layout: Layout, currentPaneId: string, direction: 'left'|'right'|'up'|'down'): string | null`
- [x] T004 [US1] Wire directional navigation in App.tsx — when `navigatePane` action fires from useKeyBindings, call `findAdjacentPaneId()` with the current layout and direction, then call `paneStore.setActivePane()` and `sendMessage({ type: 'focus', payload: { paneId } })`

**Checkpoint**: Directional navigation works correctly in 2-pane, 3-pane, and 4-pane layouts.

---

## Phase 2: User Story 2 - Pane Zoom (Priority: P2)

**Goal**: Ctrl+B z toggles full-screen zoom on the active pane.

**Independent Test**: Create 2 panes. Press Ctrl+B z — one pane fills the area. Press again — both panes reappear.

- [x] T005 [US2] Update `PaneContainer` in frontend/src/components/layout/PaneContainer.tsx — add zoom rendering logic: if `zoomedPane` is set in the pane store, render only that pane at 100% width and height, skipping the recursive layout tree rendering. When `zoomedPane` is null, render normally
- [x] T006 [US2] Wire `zoomPane` keybinding action in App.tsx — when the action fires, call `paneStore.toggleZoom()`. If the pane was zoomed, also check if a split was requested and handle exit-zoom-then-split
- [x] T007 [US2] Trigger terminal resize after zoom toggle — when zoom state changes, the visible pane's dimensions change dramatically. Ensure the FitAddon recalculates and sends a resize message to the backend

**Checkpoint**: Zoom/unzoom works smoothly with correct terminal dimensions.

---

## Phase 3: User Story 3 - Terminal Settings (Priority: P3)

**Goal**: Users can customize font size, font family, and color theme.

**Independent Test**: Change font size in settings, verify panes update. Refresh page, verify settings persist.

- [x] T008 [P] [US3] Create settings store in frontend/src/stores/settings-store.ts — Zustand store with `persist` middleware (localStorage). State: `{ fontSize: number, fontFamily: string, themeName: string }`. Actions: `setFontSize()`, `setFontFamily()`, `setThemeName()`. Default: `{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', themeName: 'default' }`
- [x] T009 [P] [US3] Create terminal themes file in frontend/src/config/terminal-themes.ts — export a `Record<string, ITheme>` with at least 3 themes: `default` (dark green-on-black matching current), `dracula`, `solarized-dark`. Each theme defines foreground, background, cursor, selection, and ANSI colors
- [x] T010 [US3] Create settings panel component in frontend/src/components/settings/SettingsPanel.tsx — a slide-out panel with: font size slider (8–32), font family dropdown (3–5 monospace options), theme selector (radio buttons or dropdown with color preview). Reads from and writes to settings store
- [x] T011 [US3] Apply settings to terminal instances — in frontend/src/components/terminal/Terminal.tsx, subscribe to settings store. When fontSize, fontFamily, or theme changes, update `terminal.options.fontSize`, `terminal.options.fontFamily`, and `terminal.options.theme`, then call `fitAddon.fit()`
- [x] T012 [US3] Add settings button to Header — add a gear icon button next to the connection status in frontend/src/components/layout/Header.tsx. Clicking it toggles the settings panel

**Checkpoint**: Terminal settings fully customizable with persistence across page refreshes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Directional Nav)**: Depends on `002-core-multi-pane` — needs working pane splits to test navigation.
- **Phase 2 (Zoom)**: Depends on `002-core-multi-pane` — needs multiple panes to zoom.
- **Phase 3 (Settings)**: No dependencies — purely frontend, can start anytime.

### Within Each Phase

- T001 → T002 → T003/T004 (algorithm first, then helper, then frontend mirroring + wiring)
- T005 → T006 → T007 (rendering first, then action wiring, then resize handling)
- T008, T009 can run in parallel → T010 → T011 → T012

### Parallel Opportunities

- Phase 1 and Phase 3 can run entirely in parallel (different features, different files)
- Phase 2 and Phase 3 can run in parallel
- T003 can run in parallel with T001/T002 (different language/directory)
- T008, T009 can run in parallel (different files)

---

## Summary

| Phase | Task Count | Parallel Tasks |
|-------|------------|----------------|
| Phase 1: Directional Nav (P1) | 4 | 1 |
| Phase 2: Zoom (P2) | 3 | 0 |
| Phase 3: Settings (P3) | 5 | 2 |
| **Total** | **12** | **3** |

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete T001-T002 (directional navigation algorithm)
2. Complete T003-T004 (frontend integration)
3. Complete T005-T007 (zoom)
4. **STOP and VALIDATE**: Test navigation and zoom in complex layouts
5. Complete T008-T012 (terminal settings — nice-to-have polish)

### Parallel Strategy

Settings (Phase 3) is entirely independent and can be developed in parallel with Phases 1 and 2 by a separate developer or agent.

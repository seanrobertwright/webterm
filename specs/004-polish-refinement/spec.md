# Feature Specification: Polish & Refinement

**Feature Branch**: `004-polish-refinement`
**Created**: 2026-02-21
**Status**: Draft
**Input**: Gap analysis of `001-tmux-web-terminal` implementation — several UI features and usability improvements are partially implemented or missing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Directional Pane Navigation (Priority: P1)

A user has multiple panes arranged in a grid layout. They press Ctrl+B followed by an arrow key, and focus moves to the pane that is visually adjacent in that direction — not just the next pane in creation order. For example, in a 2x2 grid, pressing "right" from the top-left pane focuses the top-right pane, not the bottom-left.

**Why this priority**: Directional navigation is essential for usability in complex layouts. The current linear navigation (prev/next by creation order) is confusing when panes are arranged spatially.

**Independent Test**: Create a 2x2 grid (split vertically, then split each half horizontally). Focus the top-left pane. Press Ctrl+B Right — verify top-right is focused. Press Ctrl+B Down — verify bottom-right is focused.

**Acceptance Scenarios**:

1. **Given** a 2x2 pane grid, **When** the user presses Ctrl+B Right from the left pane, **Then** the pane to the right is focused
2. **Given** a 2x2 pane grid, **When** the user presses Ctrl+B Down from the top pane, **Then** the pane below is focused
3. **Given** a pane at the edge of the layout, **When** the user presses an arrow key toward the edge, **Then** focus wraps around or stays on the current pane (no error)
4. **Given** a non-uniform layout (3 panes: one large left, two stacked right), **When** navigating right from the left pane, **Then** the closest right-side pane (based on cursor/focus position) is selected

---

### User Story 2 - Pane Zoom (Priority: P2)

A user wants to temporarily maximize a single pane to full screen. They press Ctrl+B z and the active pane expands to fill the entire window area, hiding all other panes. Pressing Ctrl+B z again restores the original layout.

**Why this priority**: Zoom is a commonly used tmux feature for focusing on a single task temporarily. The store state exists (`zoomedPane`) but there is no UI rendering logic.

**Independent Test**: Create a 2-pane split. Press Ctrl+B z — verify the active pane fills the entire area. Press Ctrl+B z again — verify the split layout reappears.

**Acceptance Scenarios**:

1. **Given** multiple panes exist, **When** the user presses Ctrl+B z, **Then** the active pane expands to fill the entire layout area
2. **Given** a pane is zoomed, **When** the user presses Ctrl+B z again, **Then** the original layout is restored exactly
3. **Given** a pane is zoomed, **When** the zoomed pane is closed, **Then** zoom exits and the remaining layout is shown
4. **Given** a pane is zoomed, **When** the user splits (Ctrl+B %), **Then** zoom exits first and then the split occurs on the restored layout

---

### User Story 3 - Terminal Settings (Priority: P3)

A user can customize terminal appearance: font size, font family, and color theme. Settings are persisted in local storage and applied to all terminal panes.

**Why this priority**: Aesthetic customization improves daily usability but does not affect core functionality. This is a final polish item.

**Independent Test**: Open settings, change font size to 16px, verify all panes update. Change theme to a light theme, verify colors change. Refresh the page — verify settings persist.

**Acceptance Scenarios**:

1. **Given** the settings panel is open, **When** the user changes the font size, **Then** all terminal panes update their font size immediately
2. **Given** the settings panel is open, **When** the user selects a different theme, **Then** all terminal panes update their color scheme immediately
3. **Given** settings have been changed, **When** the user refreshes the page, **Then** the custom settings are applied on load

---

### Edge Cases

- What happens when navigating in a layout with only one pane? Navigation should be a no-op (no error, no change).
- What happens when zooming the only pane? Zoom should be a no-op or visually imperceptible since it's already full-size.
- What happens when changing font size to an extreme value? Minimum and maximum bounds should be enforced (e.g., 8px–32px).
- What happens when the saved theme is deleted from the themes list? The default theme should be applied.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `findAdjacentPane()` in layout-service.ts MUST consider actual visual positions in the layout tree, not just linear order in the pane ID list
- **FR-002**: Navigation MUST resolve the split direction at each level of the layout tree: horizontal splits respond to left/right, vertical splits respond to up/down
- **FR-003**: `PaneContainer` MUST support a `zoomedPane` prop — when set, only the zoomed pane is rendered at full size
- **FR-004**: The `zoomPane` keybinding action MUST toggle `paneStore.toggleZoom()` and trigger a terminal resize on the zoomed pane
- **FR-005**: Terminal settings MUST be persisted in localStorage and loaded on app initialization
- **FR-006**: Font size changes MUST trigger xterm.js `options.fontSize` update and `FitAddon.fit()` on all panes
- **FR-007**: Theme changes MUST update xterm.js `options.theme` on all panes

### Key Entities

- **TerminalSettings**: `{ fontSize: number, fontFamily: string, theme: TerminalTheme }` — stored in localStorage.
- **TerminalTheme**: Named preset with xterm.js ITheme values (foreground, background, cursor, ANSI colors).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Directional navigation correctly moves to the visually adjacent pane in 100% of tested layouts (2-pane, 3-pane L-shape, 4-pane grid)
- **SC-002**: Zoom/unzoom transition completes in under 100ms with correct terminal resize
- **SC-003**: Font size changes apply to all open panes within 200ms
- **SC-004**: Terminal settings persist across page refreshes 100% of the time

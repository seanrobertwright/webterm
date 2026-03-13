# Phase 2: Settings & UI Refinements - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor the settings panel and polish header UI elements. Remove color theme from settings (move ThemeSelector to settings panel from header), add default start directory setting with native folder picker, improve connection status indicators with colored dots, and replace the placeholder logo with the actual Webterm Logo SVG (theme-colorable).

</domain>

<decisions>
## Implementation Decisions

### Default Start Directory
- Global setting (not per-session) — one default directory for all new terminals
- Text input field with a browse button that opens a native OS folder picker
- Native folder picker requires a backend endpoint to trigger the OS dialog and return the selected path
- If the specified directory doesn't exist or is inaccessible: show a brief visual error, then fall back to OS default
- Setting persisted in the settings store, passed to backend when spawning PTY sessions

### Connection Indicators
- Green dot for "connected", red dot for "disconnected", yellow pulsing dot for "connecting", red dot for "exited"
- Keep the current glow-border badge styling around the indicator
- Dot implementation style is Claude's discretion (emoji vs CSS circles)

### Logo Integration
- Replace the current 4-square placeholder icon (left of hamburger menu) with the actual `Webterm Logo.svg`
- Same position, same approximate size (~20x20)
- SVG optimization and loading strategy is Claude's discretion (the file is 4.4MB raw)
- Theme colorization approach is Claude's discretion — inspect the SVG and pick the best method (monochrome currentColor vs tinted accents)

### Settings Panel Cleanup
- Remove the "Color Theme" button list section from the settings panel
- Move the ThemeSelector component from the header bar INTO the settings panel (settings becomes the only place to change themes)
- Restyle the entire settings panel to use theme CSS variables instead of hardcoded colors (replace green-400/green-500/gray-* with text-primary, bg-card, border-border, etc.)
- Add the default start directory setting below existing font settings
- Keep Font Size slider and Font Family dropdown as-is (just restyle colors)

### Claude's Discretion
- Dot implementation (emoji vs CSS colored circles)
- SVG optimization approach for the 4.4MB logo
- Logo colorization method (monochrome vs tinted)
- Layout/ordering of settings within the refactored panel
- Error toast/notification style for invalid directory

</decisions>

<specifics>
## Specific Ideas

- User explicitly wants green 🟢 and red 🔴 dot indicators for connected/disconnected — should feel immediately obvious at a glance
- The logo file is at `C:\Projects\webterm\Webterm Logo.svg` — needs to be theme-colorable (change with selected theme color)
- ThemeSelector moves from header to settings panel — header gets cleaner, settings becomes the central config hub

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-settings-ui-refinements*
*Context gathered: 2026-03-13*

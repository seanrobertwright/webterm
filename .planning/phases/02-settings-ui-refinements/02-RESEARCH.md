# Phase 2: Settings & UI Refinements - Research

**Researched:** 2026-03-13
**Domain:** React UI refactor, Zustand state, SVG handling, backend REST endpoint
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Default Start Directory
- Global setting (not per-session) — one default directory for all new terminals
- Text input field with a browse button that opens a native OS folder picker
- Native folder picker requires a backend endpoint to trigger the OS dialog and return the selected path
- If the specified directory doesn't exist or is inaccessible: show a brief visual error, then fall back to OS default
- Setting persisted in the settings store, passed to backend when spawning PTY sessions

#### Connection Indicators
- Green dot for "connected", red dot for "disconnected", yellow pulsing dot for "connecting", red dot for "exited"
- Keep the current glow-border badge styling around the indicator
- Dot implementation style is Claude's discretion (emoji vs CSS circles)

#### Logo Integration
- Replace the current 4-square placeholder icon (left of hamburger menu) with the actual `Webterm Logo.svg`
- Same position, same approximate size (~20x20)
- SVG optimization and loading strategy is Claude's discretion (the file is 4.4MB raw)
- Theme colorization approach is Claude's discretion — inspect the SVG and pick the best method (monochrome currentColor vs tinted accents)

#### Settings Panel Cleanup
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase refactors four existing UI areas: ConnectionStatus indicators, the SettingsPanel component, the Header logo, and the global start directory feature. All components already exist; no new routing or architecture is needed. The work is primarily component-level edits with one new backend REST endpoint and one Zustand store field addition.

The critical technical discovery is the SVG logo: the `Webterm Logo.svg` file is 4.4MB because it contains a base64-encoded raster PNG embedded inside an SVG wrapper (`<image href="data:image/png;base64,..."/>`). It is not a vector SVG. This means it cannot be colorized with `currentColor` or CSS filters and cannot be inlined as JSX. The correct approach is to render it as a standard `<img>` tag (or background-image) with CSS `filter` to tint it to match the active theme.

The start directory feature requires a backend REST endpoint because `window.showDirectoryPicker()` (File System Access API) returns a `FileSystemDirectoryHandle` object, not a filesystem path string. The browser cannot give a path string to a local directory. Therefore a backend endpoint using Node.js's child_process to invoke an OS-native dialog (zenity on Linux, osascript on macOS, PowerShell's `[System.Windows.Forms.FolderBrowserDialog]` on Windows) is the correct approach — exactly as the user decided.

**Primary recommendation:** Implement as four discrete tasks: (1) ConnectionStatus dot colors, (2) SettingsPanel restyle + ThemeSelector move + directory setting, (3) logo swap with img+filter, (4) backend folder-picker endpoint.

---

## Standard Stack

### Core (already in use — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.0.0 | Component rendering | Already used throughout |
| Zustand + persist | 5.0.0 | Settings state with localStorage | Already used in `settings-store.ts` |
| Tailwind CSS | 3.4.x | Styling with CSS variable tokens | Already the styling system |
| Node.js http (vanilla) | built-in | REST endpoint routing | Already the backend API pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dialog-node` | npm | OS-native folder picker dialog | For the backend `POST /api/v1/system/pick-directory` endpoint |
| `node:fs` | built-in | Validate that selected path exists | Used in the backend validation step |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dialog-node` (npm) | PowerShell script via `child_process.execSync` | PowerShell is Windows-only; dialog-node handles cross-platform |
| `dialog-node` | `zenity` CLI directly | zenity is Linux-only; dialog-node abstracts the platform differences |
| CSS filter on raster img | Inline SVG with currentColor | Cannot use currentColor — the SVG is a raster embed, not vector paths |

**Installation (backend only, if dialog-node is used):**
```bash
npm install dialog-node -w @webterm/backend
```

Note: If dialog-node has reliability concerns, a pure platform-specific fallback using `child_process` is acceptable since this app runs locally on the user's machine. Research the dialog-node package before committing.

---

## Architecture Patterns

### Existing Patterns to Follow

#### Pattern 1: Zustand Store Extension
**What:** Add `defaultStartDir: string` field and `setDefaultStartDir` action to `settings-store.ts`.
**When to use:** Any new global persisted setting.
**Example:**
```typescript
// Source: frontend/src/stores/settings-store.ts (existing pattern)
export interface SettingsState {
  fontSize: number;
  fontFamily: string;
  themeName: string;
  defaultStartDir: string;   // NEW: empty string = use OS default
}

// In persist store:
setDefaultStartDir: (dir) => set({ defaultStartDir: dir }),
```
The `persist` middleware already handles localStorage serialization. Default value should be `''` (empty string = OS default).

#### Pattern 2: Backend REST Route Addition
**What:** Register a new route in `rest-router.ts` and implement it in `routes/system.ts`.
**When to use:** Adding a new backend capability.
**Example:**
```typescript
// Source: backend/src/api/rest-router.ts (existing pattern)
registerRoute('POST', '/api/v1/system/pick-directory', handlePickDirectory);
```
Handler signature matches existing route handlers:
```typescript
export async function handlePickDirectory(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  _body: unknown
): Promise<void>
```

#### Pattern 3: CSS Variable Token Replacement
**What:** Replace hardcoded Tailwind color classes in SettingsPanel with semantic tokens.
**When to use:** Any component that uses hardcoded `gray-*` or `green-*` colors.

| Old class | Replace with |
|-----------|-------------|
| `bg-gray-900` | `bg-card` |
| `border-gray-700` | `border-border` |
| `text-green-400` | `text-primary` |
| `text-gray-300` | `text-foreground` |
| `text-gray-400` | `text-muted-foreground` |
| `text-gray-500` | `text-muted-foreground` |
| `bg-gray-800` | `bg-secondary` |
| `border-gray-600` | `border-border` |
| `text-gray-200` | `text-foreground` |
| `focus:ring-green-500` | `focus:ring-ring` |
| `accent-green-500` | `accent-primary` (or use CSS var directly) |
| `border-green-500` | `border-primary` |
| `bg-green-900/30` | `bg-primary/10` |

#### Pattern 4: Logo as Filtered Image
**What:** Use `<img>` with CSS `filter: drop-shadow` and `brightness`/`hue-rotate` or an SVG filter to tint the raster logo.
**When to use:** When the asset is a raster image (PNG embedded in SVG).

The logo SVG is a raster PNG inside an SVG container — confirmed by inspection of the first 2000 bytes: the SVG element's sole child is `<image ... href="data:image/png;base64,..."/>`. CSS `currentColor` does NOT work on raster images.

**Recommended approach — CSS filter tint:**
```tsx
// Header.tsx — replace the placeholder SVG with:
<img
  src="/webterm-logo.png"  // extract PNG from SVG, optimize, place in public/
  alt="WebTerm"
  className="w-5 h-5 logo-tinted"
  style={{ filter: 'var(--logo-filter)' }}
/>
```
Add `--logo-filter` to each theme in `thegridcn-themes.css`. Example for cyan (tron):
```css
[data-theme="tron"] {
  --logo-filter: brightness(0) saturate(100%) invert(72%) sepia(83%) saturate(400%) hue-rotate(155deg) brightness(105%);
}
```
This "recolor to any color from black" technique works by: first mapping all pixels to black (`brightness(0)`), then recoloring using hue/saturation/invert. A CSS filter generator tool can compute the filter values for each theme's `--primary` color.

**Alternative approach — themed glow without recoloring:**
If exact color matching is difficult, render the logo at natural color and add a `drop-shadow` filter using the theme glow color:
```css
.logo-tinted {
  filter: drop-shadow(0 0 4px var(--glow-muted));
}
```
This is simpler and consistent with existing glow aesthetics. The logo renders at its original colors but glows with the active theme color.

**Recommendation:** Use the glow-only approach unless the logo is monochrome/dark. Given that the logo is a 4.4MB PNG embed, extract and optimize the PNG first.

**Logo file strategy:**
1. Extract the base64 PNG from the SVG using a one-line Node script
2. Save as `frontend/public/webterm-logo.png` (optimized, much smaller than 4.4MB SVG)
3. Reference via `/webterm-logo.png` path in the img tag

#### Pattern 5: ConnectionStatus Dot Colors (current state)
The `ConnectionStatus` component already implements CSS circle dots with Tailwind. The current colors:
- `connected`: `bg-primary` (theme accent color — not green)
- `connecting`: `bg-yellow-500 animate-pulse`
- `disconnected`: `bg-destructive` (red by default)
- `exited`: `bg-muted-foreground` (gray)

The user wants: green connected, red disconnected, yellow pulsing connecting, red exited. The current `bg-primary` is the theme accent (cyan/red/orange etc.), NOT green. The current `bg-destructive` is already red.

**Required change:** Replace `bg-primary` for connected with a fixed green, and replace `bg-muted-foreground` for exited with `bg-destructive` (red). Since the user wants green specifically (not theme-colored), use `bg-green-500` for connected — this is an intentional semantic signal, not a theme color.

```typescript
// Source: frontend/src/components/terminal/ConnectionStatus.tsx
const stateConfig = {
  connected:    { label: 'Connected',    dotClass: 'bg-green-500' },
  connecting:   { label: 'Connecting',   dotClass: 'bg-yellow-500 animate-pulse' },
  disconnected: { label: 'Disconnected', dotClass: 'bg-destructive' },
  exited:       { label: 'Exited',       dotClass: 'bg-destructive' },
};
```

**Dot size:** Current is `w-1.5 h-1.5`. The user wants dots that feel "immediately obvious" — consider bumping to `w-2 h-2` for the CSS circle approach (Claude's discretion).

#### Pattern 6: ThemeSelector Move into SettingsPanel
The `ThemeSelector` component in `Header.tsx` is imported from `./ThemeSelector`. Moving it to SettingsPanel requires:
1. Remove `<ThemeSelector />` and its import from `Header.tsx`
2. Add `import { ThemeSelector } from '../layout/ThemeSelector';` in `SettingsPanel.tsx`
3. Render it as a section inside the settings content area

The `ThemeSelector` uses `useTheme()` hook which reads from `ThemeProvider` context — it works anywhere in the component tree under `ThemeProvider`.

### Anti-Patterns to Avoid
- **Inline SVG (JSX) for the logo:** The SVG file is not a vector logo — it's a raster PNG wrapper. Converting it to inline JSX via SVGR would embed 4MB of base64 data in the JS bundle. Use `<img>` instead.
- **Reading directory existence from frontend:** The frontend cannot call `fs.existsSync()`. Directory validation must happen in the backend endpoint.
- **Using `showDirectoryPicker()` for the path:** This browser API returns a `FileSystemDirectoryHandle`, not a string path. It cannot be passed to PTY spawn as a `cwd` string.
- **Re-implementing the color theme button list in SettingsPanel:** The existing button list uses `themeNames` from `terminal-themes.ts` (dracula, solarized-dark, default) — these are the *xterm.js* terminal color schemes, NOT the CSS UI themes. The `ThemeSelector` component uses the `THEMES` array from `ThemeProvider`. These are different systems. The user wants to move the **UI theme selector** (ThemeSelector) into settings, and **remove** the old terminal color theme button list entirely.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OS-native folder picker dialog | Custom child_process platform-switch code | `dialog-node` npm package | Cross-platform handling for Windows (VBScript), macOS (osascript), Linux (zenity) is already solved |
| CSS filter values for logo recoloring | Manual trial-and-error filter tuning | CSS filter generator tool (e.g., https://isotropic.co/tool/hex-color-to-css-filter/) | Computing hue-rotate/invert values for a target color is mathematically non-trivial |
| Zustand persist middleware | Custom localStorage read/write | Already used — extend existing `persist` store | Handles serialization, hydration, and cross-tab sync |

**Key insight:** Every problem in this phase has an existing solution in the codebase or ecosystem. The work is integration, not invention.

---

## Common Pitfalls

### Pitfall 1: Two Different "Theme" Systems Colliding
**What goes wrong:** Accidentally conflating the xterm.js terminal color schemes (`terminalThemes` in `terminal-themes.ts`, stored as `themeName` in `settings-store`) with the CSS UI theme system (`THEMES` in `ThemeProvider`, stored separately in `localStorage` as `webterm-theme`).
**Why it happens:** Both are called "themes" and both appear in SettingsPanel.
**How to avoid:** Remove the `themeNames.map(...)` button list (old system) AND add `<ThemeSelector />` (new system). Keep `setThemeName` in the store if xterm themes are still used elsewhere (they may be applied to the terminal). Check `TerminalPane.tsx` for `themeName` usage before removing any store field.
**Warning signs:** If the font size slider stops working after the edit, the store import is broken.

### Pitfall 2: SVG Logo Bundle Bloat
**What goes wrong:** Importing the 4.4MB SVG directly into the component with `import LogoSvg from '../../assets/Webterm Logo.svg?react'` (SVGR) — this embeds 4MB of base64 PNG data in the JS bundle.
**Why it happens:** Vite supports SVGR imports, and developers assume all SVGs are vector.
**How to avoid:** Extract the PNG from the SVG first, optimize it with a tool (e.g., pngquant or browser-based), and reference it as a static asset in `/public/`.
**Warning signs:** Build size increases by ~4MB, network tab shows a large JS chunk.

### Pitfall 3: Backend Folder Picker Blocks the Server
**What goes wrong:** Calling a synchronous OS dialog function in the HTTP handler blocks Node.js's event loop while the user interacts with the dialog (which could take 30+ seconds).
**Why it happens:** `dialog-node` and similar packages have sync and async APIs; using the sync version in an async handler blocks everything.
**How to avoid:** Use the async/callback variant and wrap in a Promise. The backend's `handlePickDirectory` handler must be async and await the dialog result.
**Warning signs:** All other HTTP requests stall while the folder picker is open.

### Pitfall 4: Directory Validation Race Condition
**What goes wrong:** Validating the directory at save-time, but the directory could be deleted or unmounted by the time a new terminal is spawned.
**Why it happens:** Developers validate once and trust the result.
**How to avoid:** Validate at save time (user gets immediate feedback) AND at spawn time (fall back to OS homedir if the path no longer exists/is inaccessible). The PTY service's `spawn()` already falls back to `os.homedir()` as default — just pass the validated `cwd` through.
**Warning signs:** Terminal fails to spawn with a cryptic "cwd does not exist" error from node-pty.

### Pitfall 5: ThemeSelector Dropdown Positioning in SettingsPanel
**What goes wrong:** The `ThemeSelector` component renders its dropdown with `absolute right-0 top-full` positioning. Inside a scrollable settings panel, this can clip or overflow incorrectly.
**Why it happens:** The ThemeSelector was designed for the header (fixed, no overflow constraints).
**How to avoid:** After moving ThemeSelector into SettingsPanel, test the dropdown opening. May need to adjust the dropdown's z-index or positioning from `right-0` to `left-0` depending on panel layout.
**Warning signs:** Dropdown appears outside the panel or is clipped at the edge.

### Pitfall 6: `cwd` Not Passed When Spawning Initial Pane
**What goes wrong:** The `defaultStartDir` setting is added to the store, but the initial pane spawn in `websocket-server.ts` doesn't read it — because the setting lives in the frontend store, not the backend.
**Why it happens:** The initial pane spawn (lines 482-489 in `websocket-server.ts`) uses hardcoded options: `{ shell: dbPane.shell, cols: dbPane.cols, rows: dbPane.rows }` — no `cwd`.
**How to avoid:** The frontend must pass `defaultStartDir` in the WebSocket `create` message payload (already supported: `sendCreate(windowId, shell, cwd)`). For the *initial* pane spawn on connect, the frontend cannot intervene — but the first explicit "new pane" after the session is created WILL use the `cwd` from `sendCreate`. For the reconnect path, stored `pane.cwd` is already used.
**Resolution strategy:** Accept that the very first pane of a brand-new session uses OS default; all subsequent panes created via the `create` message pass the user's preferred `cwd`. This matches typical terminal emulator behavior.

---

## Code Examples

### Zustand Store: Adding defaultStartDir
```typescript
// Source: frontend/src/stores/settings-store.ts (extend existing)
export interface SettingsState {
  fontSize: number;
  fontFamily: string;
  themeName: string;
  defaultStartDir: string;  // '' = use OS default (os.homedir())
}

// In create():
setDefaultStartDir: (dir) => set({ defaultStartDir: dir }),

// In defaultSettings:
const defaultSettings: SettingsState = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', monospace",
  themeName: 'default',
  defaultStartDir: '',
};
```

### Backend: Folder Picker Endpoint
```typescript
// Source: backend/src/api/routes/system.ts (new handler)
import { promisify } from 'node:util';

export async function handlePickDirectory(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  _body: unknown
): Promise<void> {
  // Platform-specific dialog invocation
  // Use dialog-node or platform-specific child_process
  // Returns: { path: string } or { error: string }
}
```

### Backend: Directory Validation
```typescript
// In handler or shared util:
import { existsSync, accessSync, constants } from 'node:fs';

function isAccessibleDirectory(dirPath: string): boolean {
  try {
    accessSync(dirPath, constants.R_OK);
    return existsSync(dirPath) && /* is dir */ require('node:fs').statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
```

### Frontend: Passing cwd on Pane Create
```typescript
// In the component/hook that calls ws.sendCreate():
const { defaultStartDir } = useSettingsStore();
// Pass cwd only if the user has set one:
ws.sendCreate(windowId, shell, defaultStartDir || undefined);
```

### ConnectionStatus: Fixed Semantic Colors
```typescript
// Source: frontend/src/components/terminal/ConnectionStatus.tsx
const stateConfig: Record<ConnectionState, { label: string; dotClass: string }> = {
  connected:    { label: 'Connected',    dotClass: 'bg-green-500' },
  connecting:   { label: 'Connecting',   dotClass: 'bg-yellow-500 animate-pulse' },
  disconnected: { label: 'Disconnected', dotClass: 'bg-destructive' },
  exited:       { label: 'Exited',       dotClass: 'bg-destructive' },
};
// Dot element: <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
```

### Logo: PNG Extraction Command
```bash
# Run once to extract PNG from SVG base64 data:
node -e "
const fs = require('fs');
const svg = fs.readFileSync('Webterm Logo.svg', 'utf8');
const match = svg.match(/href=\"data:image\/png;base64,([^\"]+)\"/);
if (match) {
  fs.writeFileSync('frontend/public/webterm-logo.png', Buffer.from(match[1], 'base64'));
  console.log('Extracted PNG');
}
"
```

### Logo: Image with Glow Filter in Header
```tsx
// Source: frontend/src/components/layout/Header.tsx
// Replace the 4-square SVG placeholder with:
<img
  src="/webterm-logo.png"
  alt="WebTerm"
  className="w-5 h-5"
  style={{ filter: 'drop-shadow(0 0 4px var(--glow-muted))' }}
  aria-hidden="true"
/>
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| Hardcoded `green-400`/`gray-*` in SettingsPanel | CSS variable tokens (`text-primary`, `bg-card`) | SettingsPanel was never updated to the new theme system |
| 4-square placeholder SVG in Header | Actual Webterm Logo SVG/PNG | Placeholder put in intentionally; now has real asset |
| `ThemeSelector` in Header | `ThemeSelector` in SettingsPanel | User preference to clean up header |
| `bg-primary` for connected dot | `bg-green-500` (fixed green) | Semantic status color, not theme accent |

**Deprecated/outdated in this codebase:**
- The `themeNames` button list in SettingsPanel (`terminal-themes.ts` xterm themes): functionally superseded by the CSS theme system. Still referenced by xterm terminal coloring — do NOT remove `terminalThemes` from `terminal-themes.ts`, but the buttons in settings panel can go.
- The `themeName` field in `settings-store.ts`: still used by xterm.js terminal instance configuration (check `useTerminal.ts` before removing).

---

## Open Questions

1. **Is `themeName` in `settings-store` still consumed anywhere (xterm.js theming)?**
   - What we know: `themeName` is set/get in the store and was previously shown in SettingsPanel
   - What's unclear: Whether `useTerminal.ts` or `TerminalPane.tsx` still reads `themeName` to apply xterm terminal colors
   - Recommendation: Grep for `themeName` in frontend before removing the UI for it. Keep the store field regardless; just remove the UI button list that selects it.

2. **Does `dialog-node` work reliably on Windows 11 with Node.js 20+?**
   - What we know: `dialog-node` uses VBScript/wscript on Windows; package has not been updated recently
   - What's unclear: Compatibility with current Windows 11 security policies around VBScript execution
   - Recommendation: Implement as a pure `child_process` PowerShell approach for Windows as primary, with `dialog-node` as fallback for Linux/macOS. PowerShell has a built-in `FolderBrowserDialog` API that's stable.

3. **What is the actual visual content of the Webterm Logo PNG?**
   - What we know: The SVG is 4.4MB with a base64 raster PNG inside it; it appears to be a complex logo image
   - What's unclear: Whether the PNG has transparent background, whether it's monochrome, what colors it uses
   - Recommendation: Extract the PNG first (per the extraction command above) to inspect before choosing the colorization strategy.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection — `ConnectionStatus.tsx`, `Header.tsx`, `SettingsPanel.tsx`, `settings-store.ts`, `ThemeProvider.tsx`, `pty-service.ts`, `terminal-handler.ts`, `rest-router.ts`, `thegridcn-themes.css`
- MDN Web Docs `showDirectoryPicker()` — confirmed: returns `FileSystemDirectoryHandle`, not a path string

### Secondary (MEDIUM confidence)
- [dialog-node on GitHub](https://github.com/bat-tomr/dialog-node) — cross-platform OS dialog wrapper for Node.js
- [SVGR documentation](https://react-svgr.com/docs/options/) — confirmed SVG transformation approach
- Direct SVG file inspection (first 2000 bytes) — confirmed raster PNG-in-SVG structure

### Tertiary (LOW confidence)
- CSS filter generator techniques for color recoloring — standard community technique, not from official spec but widely used
- `dialog-node` Windows VBScript compatibility on Windows 11 — unverified for current Node.js/OS combination

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already in the codebase; one new npm package (dialog-node) is LOW confidence for Windows compatibility
- Architecture: HIGH — all patterns directly observed in existing code
- Pitfalls: HIGH for the two-theme-system confusion and SVG bloat; MEDIUM for dialog blocking and race conditions

**Research date:** 2026-03-13
**Valid until:** 2026-04-12 (stable domain — 30 days)

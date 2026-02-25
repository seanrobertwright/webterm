# Tasks: Session Management UI & Clipboard Integration

**Input**: Design documents from `/specs/003-session-clipboard/`
**Prerequisites**: spec.md ✅, existing codebase from `001-tmux-web-terminal` ✅, `002-core-multi-pane` (recommended but not blocking for clipboard work)

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

## Phase 1: User Story 1 - Session Save & Restore UI (Priority: P1)

**Goal**: Users can save, list, and restore sessions from the UI.

**Independent Test**: Save a multi-pane layout, refresh the page, restore it from the session list.

### Frontend Implementation for US1

- [x] T001 [US1] Create session API client in frontend/src/services/session-api.ts — already implemented with fetchSessions, saveSession, deleteSession, updateSession, fetchSession, createSession, createWindow, deleteWindow
- [x] T002 [US1] Create session panel/drawer component in frontend/src/components/session/SessionPanel.tsx — slide-out panel with SessionList, "New Session" button, close button. Fetches saved sessions on open
- [x] T003 [US1] Wire `SaveSessionDialog` trigger — in App.tsx, saveSession keybinding opens dialog, onSave calls session-api.saveSession() and updates session store
- [x] T004 [US1] Wire `SessionList` restore/delete actions — SessionPanel passes onRestore and onDelete callbacks wired to session-api
- [x] T005 [US1] Wire header menu button to toggle SessionPanel — Header onMenuClick toggles showSessionPanel state in App.tsx
- [x] T006 [US1] Load saved sessions on app start — useEffect in App.tsx calls fetchSessions() on mount and populates session store

**Checkpoint**: Session save/restore fully functional from UI. Users can manage sessions through the menu.

---

## Phase 2: User Story 2 - Copy & Paste Between Panes (Priority: P2)

**Goal**: Ctrl+Shift+C copies terminal selection, Ctrl+Shift+V pastes into active terminal.

**Independent Test**: Select text in one pane, Ctrl+Shift+C, focus another pane, Ctrl+Shift+V — text appears.

- [x] T007 [P] [US2] Create `useClipboard` hook in frontend/src/hooks/useClipboard.ts — copySelection reads from globalThis.terminalHandles, pasteToPane reads clipboard and sends via sendInput
- [x] T008 [US2] Expose terminal selection access — Terminal.tsx exposes getSelection/hasSelection via TerminalHandle, TerminalPane.tsx registers handles in globalThis.terminalHandles map
- [x] T009 [US2] Connect `copy` and `paste` keybinding actions in App.tsx — copy calls useClipboard.copySelection(activePane), paste calls useClipboard.pasteToPane(activePane, sendInput)
- [x] T010 [P] [US2] Add clipboard notification component in frontend/src/components/ui/ClipboardNotification.tsx — toast shown on copy with fallback indicator

**Checkpoint**: Copy/paste works between any two panes using keyboard shortcuts.

---

## Phase 3: User Story 3 - Session Name Editing (Priority: P3)

**Goal**: Clicking the session name in the header allows inline editing.

**Independent Test**: Click session name, edit it, press Enter, refresh — name persists.

- [x] T011 [US3] Add inline edit mode to Header in frontend/src/components/layout/Header.tsx — clicking session name shows text input, Enter saves, Escape cancels, blur saves
- [x] T012 [US3] Wire session name save in App.tsx — Header onSessionNameSave calls session-api.updateSession() and sessionStore.updateSession({ name })

**Checkpoint**: Session name is editable inline with persistence.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Session UI)**: No hard dependencies. Can start immediately since backend REST API is already complete.
- **Phase 2 (Clipboard)**: No dependencies on Phase 1. Can run in parallel. Depends on having at least 2 panes (from `002-core-multi-pane`) for inter-pane testing, but clipboard logic is independent.
- **Phase 3 (Session Name)**: Depends on Phase 1 (session API client created in T001).

### Within Each Phase

- T001 (API client) must be done before T002-T006
- T007, T010 can run in parallel (different files)
- T008 must be done before T009 (need terminal instance access for selection)

### Parallel Opportunities

- Phase 1 and Phase 2 can run entirely in parallel (different features, different files)
- T007, T010 can run in parallel within Phase 2
- T011, T012 are sequential (UI before wiring)

---

## Summary

| Phase | Task Count | Parallel Tasks |
|-------|------------|----------------|
| Phase 1: Session UI (P1) | 6 | 1 |
| Phase 2: Clipboard (P2) | 4 | 2 |
| Phase 3: Session Name (P3) | 2 | 0 |
| **Total** | **12** | **3** |

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete T001 (session API client) — unblocks all session UI tasks
2. Complete T002-T006 (session panel, save dialog, restore)
3. In parallel: Complete T007-T010 (clipboard integration)
4. **STOP and VALIDATE**: Test session save/restore + copy/paste
5. Complete T011-T012 (session name editing polish)

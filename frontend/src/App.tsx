import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from './stores/settings-store';
import { useShallow } from 'zustand/react/shallow';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PaneContainer } from './components/layout/PaneContainer';
import { Header } from './components/layout/Header';
import { WindowTabs, type WindowTab } from './components/layout/WindowTabs';
import { SaveSessionDialog } from './components/session/SaveSessionDialog';
import { SessionPanel } from './components/session/SessionPanel';
import { ClipboardNotification } from './components/ui/ClipboardNotification';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { usePaneStore } from './stores/pane-store';
import { useSessionStore } from './stores/session-store';
import { useKeybindingStore } from './stores/keybinding-store';
import { useGlobalKeyBindings, type UseKeyBindingsOptions } from './hooks/useKeyBindings';
import { useWebSocket } from './hooks/useWebSocket';
import { useMessageHandlers } from './hooks/useMessageHandlers';
import { useClipboard } from './hooks/useClipboard';
import { DisconnectionOverlay } from './components/terminal/DisconnectionOverlay';
import { StatusBar } from './components/StatusBar';
import { findAdjacentPaneId } from './utils/layout-navigation';
import {
  saveSession as apiSaveSession,
  updateSession as apiUpdateSession,
  createSession as apiCreateSession,
  fetchSessions,
} from './services/session-api';
import { fetchKeybindings } from './services/keybinding-api';
import { getWebSocketClient } from './services/websocket-client';
import type { ConnectionState } from '@webterm/shared/models';
import type { KeybindingAction } from './types';

declare global {
  var terminalRefs: Map<string, (data: string | Uint8Array) => void>;
  /** Global keybinding handler — returns false when the key is consumed */
  var webtermKeyHandler: ((event: KeyboardEvent) => boolean) | null;
}

function App() {
  const { layout, activePane, panes, zoomedPane, setActivePane, toggleZoom } = usePaneStore();
  const { currentSession, windows, activeWindowId, setActiveWindow, setSavedSessions, updateSession, updateWindow } = useSessionStore();
  const sortedWindows = useSessionStore(
    useShallow((state) => [...state.windows].sort((a, b) => a.index - b.index))
  );

  // UI state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [clipboardNotification, setClipboardNotification] = useState<string | null>(null);

  // Clipboard hook
  const { copySelection, pasteToPane } = useClipboard();

  // Initialize WebSocket connection with output handler
  const handleOutput = useCallback((paneId: string, data: Uint8Array) => {
    const writeFn = globalThis.terminalRefs?.get(paneId);
    if (writeFn) {
      writeFn(data);
    }
  }, []);

  const {
    connectionState: wsState,
    sessionId: wsSessionId,
    sendInput,
    sendResize,
    sendMessage,
    switchSession,
  } = useWebSocket({
    onOutput: handleOutput,
  });

  // The WebSocket client stores sessionId internally when it receives the
  // 'connected' message. The React state (wsSessionId) may not be set because
  // useMessageHandlers overwrites the onMessage callback. Use a getter that
  // reads from the client as a reliable fallback.
  const getSessionId = useCallback(
    () => wsSessionId ?? getWebSocketClient().currentSessionId,
    [wsSessionId]
  );

  // Set up message handlers for WebSocket events
  useMessageHandlers();

  // Sync pane-store metadata when active window changes (for keybindings/navigation)
  // Note: we do NOT use setInitialState here — that would re-create the panes map
  // and cause React to unmount terminals. We only sync layout/windowId/activePane.
  const { setLayout: setPaneLayout, setWindowId: setPaneWindowId, windowId: paneWindowId } = usePaneStore();
  useEffect(() => {
    if (!activeWindowId || activeWindowId === paneWindowId) return;
    const activeWindow = windows.find((w) => w.id === activeWindowId);
    if (activeWindow) {
      setPaneWindowId(activeWindowId);
      setPaneLayout(activeWindow.layout);
      // Set active pane to first pane of the window if current activePane isn't in this window
      const currentActive = usePaneStore.getState().activePane;
      const paneIds = activeWindow.panes.map(p => p.id);
      if (!currentActive || !paneIds.includes(currentActive)) {
        const firstPane = paneIds[0] ?? null;
        if (firstPane) {
          setActivePane(firstPane);
        }
      }
    }
  }, [activeWindowId, paneWindowId, windows, setPaneWindowId, setPaneLayout, setActivePane]);

  // T006: Load saved sessions on app start
  useEffect(() => {
    fetchSessions()
      .then(setSavedSessions)
      .catch((err) => console.error('[App] Failed to load saved sessions:', err));
  }, [setSavedSessions]);

  // Load keybindings from backend on app start
  const { setAllTables, setPrefixKey } = useKeybindingStore();
  useEffect(() => {
    fetchKeybindings()
      .then((data) => {
        setAllTables(data.tables);
        if (data.prefixKey) {
          setPrefixKey(data.prefixKey);
        }
      })
      .catch((err) => console.error('[App] Failed to load keybindings:', err));
  }, [setAllTables, setPrefixKey]);

  // Keybinding action handler
  const handleKeybindingAction = useCallback(
    (action: KeybindingAction) => {
      switch (action.type) {
        case 'splitVertical':
          if (activePane) {
            sendMessage({ type: 'split', payload: { paneId: activePane, direction: 'v' } });
          }
          break;
        case 'splitHorizontal':
          if (activePane) {
            sendMessage({ type: 'split', payload: { paneId: activePane, direction: 'h' } });
          }
          break;
        case 'closePane':
          if (activePane) {
            sendMessage({ type: 'close', payload: { paneId: activePane } });
          }
          break;
        case 'navigatePane': {
          if (!activePane || !layout) break;
          const targetPane = findAdjacentPaneId(layout, activePane, action.direction);
          if (targetPane) {
            setActivePane(targetPane);
            sendMessage({ type: 'focus', payload: { paneId: targetPane } });
          }
          break;
        }
        case 'zoomPane':
          toggleZoom();
          break;
        case 'newWindow': {
          const sid = getSessionId();
          if (sid) {
            const defaultStartDir = useSettingsStore.getState().defaultStartDir;
            sendMessage({
              type: 'createWindow',
              payload: {
                sessionId: sid,
                ...(defaultStartDir ? { cwd: defaultStartDir } : {}),
              },
            });
          }
          break;
        }
        case 'nextWindow': {
          const curIdx = windows.findIndex(w => w.id === activeWindowId);
          if (curIdx !== -1 && windows.length > 0) {
            const next = windows[(curIdx + 1) % windows.length];
            if (next) setActiveWindow(next.id);
          }
          break;
        }
        case 'prevWindow': {
          const curIdx2 = windows.findIndex(w => w.id === activeWindowId);
          if (curIdx2 !== -1 && windows.length > 0) {
            const prev = windows[(curIdx2 - 1 + windows.length) % windows.length];
            if (prev) setActiveWindow(prev.id);
          }
          break;
        }
        case 'saveSession':
          setShowSaveDialog(true);
          break;
        case 'showHelp':
          // TODO: Show help overlay
          break;
        case 'copy':
          if (activePane) {
            copySelection(activePane).then((result) => {
              if (result.success) {
                setClipboardNotification(result.fallback ? 'Copied to in-app clipboard' : 'Copied');
              }
            });
          }
          break;
        case 'paste':
          if (activePane) {
            pasteToPane(activePane, sendInput);
          }
          break;
      }
    },
    [activePane, layout, panes, sendMessage, getSessionId, setActivePane, toggleZoom, windows, activeWindowId, setActiveWindow, copySelection, pasteToPane, sendInput]
  );

  // Handle server-side tmux command execution from keybindings
  const handleKeybindingCommand = useCallback(
    (command: string) => {
      sendMessage({ type: 'executeCommand', payload: { command } });
    },
    [sendMessage]
  );

  // Initialize keybindings with action handler
  const keybindingOptions: UseKeyBindingsOptions = useMemo(
    () => ({
      onAction: handleKeybindingAction,
      onCommand: handleKeybindingCommand,
    }),
    [handleKeybindingAction, handleKeybindingCommand]
  );
  const { handleKeyEvent, prefixMode } = useGlobalKeyBindings(keybindingOptions);

  // Expose the keybinding handler globally so Terminal instances can call it
  // from attachCustomKeyEventHandler without prop-drilling through 4 layers.
  // Use synchronous assignment (not useEffect) to avoid gaps where the handler
  // is null between effect cleanup and re-run.
  globalThis.webtermKeyHandler = handleKeyEvent;

  // Map WebSocket state to ConnectionState
  const connectionState: ConnectionState =
    wsState === 'reconnecting' ? 'connecting' : wsState;

  // Handle pane data (user input)
  const handlePaneData = useCallback(
    (paneId: string, data: string) => {
      sendInput(paneId, data);
    },
    [sendInput]
  );

  // Handle pane resize
  const handlePaneResize = useCallback(
    (paneId: string, cols: number, rows: number) => {
      sendResize(paneId, cols, rows);
    },
    [sendResize]
  );

  // Handle pane focus
  const handlePaneFocus = useCallback(
    (paneId: string) => {
      setActivePane(paneId);
      sendMessage({ type: 'focus', payload: { paneId } });
    },
    [sendMessage, setActivePane]
  );

  // Handle pane title change — the backend handles window auto-rename via
  // the windowRenamed WebSocket message (with smart name extraction), so we
  // don't update the window name here to avoid overriding it with the raw
  // terminal title (e.g. "C:\Program Files\PowerShell\7\pwsh.exe").
  const handlePaneTitleChange = useCallback(
    (_paneId: string, _title: string) => {
      // Pane title is already updated by the paneTitleChanged message handler.
      // Window name is updated by the windowRenamed message handler.
    },
    []
  );

  // Window tabs data
  const windowTabs: WindowTab[] = useMemo(
    () =>
      sortedWindows.map((w) => ({
        id: w.id,
        name: w.name,
        index: w.index,
      })),
    [sortedWindows]
  );

  const handleWindowTabClick = useCallback(
    (windowId: string) => {
      setActiveWindow(windowId);
    },
    [setActiveWindow]
  );

  const handleNewWindow = useCallback(() => {
    const sid = getSessionId();
    if (sid) {
      const defaultStartDir = useSettingsStore.getState().defaultStartDir;
      sendMessage({
        type: 'createWindow',
        payload: {
          sessionId: sid,
          ...(defaultStartDir ? { cwd: defaultStartDir } : {}),
        },
      });
    }
  }, [getSessionId, sendMessage]);

  const handleWindowClose = useCallback(
    (windowId: string) => {
      sendMessage({ type: 'closeWindow', payload: { windowId } });
    },
    [sendMessage]
  );

  // T003: Save session handler
  const handleSaveSession = useCallback(async (name: string) => {
    const sid = getSessionId();
    if (!sid) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await apiUpdateSession(sid, { name });
      await apiSaveSession(sid);
      updateSession({ name });
      setShowSaveDialog(false);
      // Refresh saved sessions list
      const sessions = await fetchSessions();
      setSavedSessions(sessions);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save session');
    } finally {
      setIsSaving(false);
    }
  }, [getSessionId, updateSession, setSavedSessions]);

  // T012: Session name save from inline edit
  const handleSessionNameSave = useCallback(async (newName: string) => {
    const sid = getSessionId();
    if (!sid) return;
    try {
      await apiUpdateSession(sid, { name: newName });
      updateSession({ name: newName });
    } catch (err) {
      console.error('[App] Failed to update session name:', err);
    }
  }, [getSessionId, updateSession]);

  // Create a new independent session
  const handleNewSession = useCallback(async () => {
    try {
      const session = await apiCreateSession();
      useSessionStore.getState().resetForSessionSwitch();
      usePaneStore.getState().resetForSessionSwitch();
      switchSession(session.id);
      // Refresh saved sessions list after switch
      fetchSessions()
        .then(setSavedSessions)
        .catch((err) => console.error('[App] Failed to refresh sessions:', err));
    } catch (err) {
      console.error('[App] Failed to create new session:', err);
    }
  }, [switchSession, setSavedSessions]);

  // T004: Restore/switch to existing session
  const handleRestoreSession = useCallback(async (restoreSessionId: string) => {
    try {
      useSessionStore.getState().resetForSessionSwitch();
      usePaneStore.getState().resetForSessionSwitch();
      switchSession(restoreSessionId);
    } catch (err) {
      console.error('[App] Failed to restore session:', err);
    }
  }, [switchSession]);

  // Handle context menu command from pane right-click
  const handleContextMenuCommand = useCallback(
    (paneId: string, command: string) => {
      switch (command) {
        case 'split-h':
          sendMessage({ type: 'split', payload: { paneId, direction: 'h' } });
          break;
        case 'split-v':
          sendMessage({ type: 'split', payload: { paneId, direction: 'v' } });
          break;
        case 'close':
          sendMessage({ type: 'close', payload: { paneId } });
          break;
        case 'zoom':
          toggleZoom(paneId);
          break;
        case 'copy':
          copySelection(paneId).then((result) => {
            if (result.success) {
              setClipboardNotification(result.fallback ? 'Copied to in-app clipboard' : 'Copied');
            }
          });
          break;
        case 'paste':
          pasteToPane(paneId, sendInput);
          break;
        case 'mark':
          sendMessage({ type: 'executeCommand', payload: { command: 'select-pane -m' } });
          break;
        default:
          sendMessage({ type: 'executeCommand', payload: { command } });
          break;
      }
    },
    [sendMessage, toggleZoom, copySelection, pasteToPane, sendInput],
  );

  // Don't render layout until we have at least one window
  if (windows.length === 0) {
    return (
      <ErrorBoundary>
        <div className="h-screen w-screen flex items-center justify-center bg-background">
          <div className="text-gray-400">Loading session...</div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        <Header
          sessionName={currentSession?.name ?? 'WebTerm'}
          connectionState={connectionState}
          onMenuClick={() => setShowSessionPanel(true)}
          onSettingsClick={() => setShowSettingsPanel(true)}
          onSessionNameSave={handleSessionNameSave}
        />
        <WindowTabs
          windows={windowTabs}
          activeWindowId={activeWindowId}
          onTabClick={handleWindowTabClick}
          {...(windows.length > 1 ? { onTabClose: handleWindowClose } : {})}
          onNewWindow={handleNewWindow}
        />
        <main className="flex-1 relative overflow-hidden">
          {windows.map((w) => {
            const isActive = activeWindowId === w.id;
            return (
            <div
              key={w.id}
              className="absolute p-2 pb-8"
              style={{
                inset: 0,
                visibility: isActive ? 'visible' : 'hidden',
                zIndex: isActive ? 1 : 0,
              }}
            >
              <PaneContainer
                layout={w.layout}
                panes={w.panes}
                activePaneId={isActive ? activePane : null}
                zoomedPaneId={isActive ? zoomedPane : null}
                onPaneData={handlePaneData}
                onPaneResize={handlePaneResize}
                onPaneFocus={handlePaneFocus}
                onPaneTitleChange={handlePaneTitleChange}
                onContextMenuCommand={handleContextMenuCommand}
                prefixActive={prefixMode.active}
              />
            </div>
            );
          })}
          {connectionState === 'disconnected' && (
            <DisconnectionOverlay isVisible={true} />
          )}
        </main>
        <StatusBar onSwitchWindow={handleWindowTabClick} />
      </div>

      {/* Save Session Dialog */}
      <SaveSessionDialog
        isOpen={showSaveDialog}
        onClose={() => { setShowSaveDialog(false); setSaveError(null); }}
        onSave={handleSaveSession}
        defaultName={currentSession?.name ?? ''}
        isSaving={isSaving}
        error={saveError}
      />

      {/* Session Panel */}
      <SessionPanel
        isOpen={showSessionPanel}
        onClose={() => setShowSessionPanel(false)}
        onRestore={handleRestoreSession}
        onNewSession={handleNewSession}
        currentSessionId={getSessionId() ?? undefined}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
      />

      {/* Clipboard Notification */}
      <ClipboardNotification
        message={clipboardNotification}
        onDismiss={() => setClipboardNotification(null)}
      />
    </ErrorBoundary>
  );
}

export default App;

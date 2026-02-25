import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useKeyBindings, type UseKeyBindingsOptions } from './hooks/useKeyBindings';
import { useWebSocket } from './hooks/useWebSocket';
import { useMessageHandlers } from './hooks/useMessageHandlers';
import { useClipboard } from './hooks/useClipboard';
import { DisconnectionOverlay } from './components/terminal/DisconnectionOverlay';
import { findAdjacentPaneId } from './utils/layout-navigation';
import {
  saveSession as apiSaveSession,
  updateSession as apiUpdateSession,
  fetchSessions,
  fetchSession,
} from './services/session-api';
import type { ConnectionState } from '@webterm/shared/models';
import type { KeybindingAction } from './types';

declare global {
  var terminalRefs: Map<string, (data: string | Uint8Array) => void>;
}

function App() {
  const { layout, activePane, panes, zoomedPane, setActivePane, toggleZoom } = usePaneStore();
  const { currentSession, windows, activeWindowId, setActiveWindow, setSavedSessions, updateSession } = useSessionStore();
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
    sessionId,
    sendInput,
    sendResize,
    sendMessage
  } = useWebSocket({
    onOutput: handleOutput,
  });

  // Set up message handlers for WebSocket events
  useMessageHandlers();

  // T006: Load saved sessions on app start
  useEffect(() => {
    fetchSessions()
      .then(setSavedSessions)
      .catch((err) => console.error('[App] Failed to load saved sessions:', err));
  }, [setSavedSessions]);

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
        case 'newWindow':
          if (sessionId) {
            sendMessage({ type: 'createWindow', payload: { sessionId } });
          }
          break;
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
    [activePane, layout, panes, sendMessage, sessionId, setActivePane, toggleZoom, windows, activeWindowId, setActiveWindow, copySelection, pasteToPane, sendInput]
  );

  // Initialize keybindings with action handler
  const keybindingOptions: UseKeyBindingsOptions = useMemo(
    () => ({ onAction: handleKeybindingAction }),
    [handleKeybindingAction]
  );
  useKeyBindings(keybindingOptions);

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
    if (sessionId) {
      sendMessage({ type: 'createWindow', payload: { sessionId } });
    }
  }, [sessionId, sendMessage]);

  const handleWindowClose = useCallback(
    (windowId: string) => {
      sendMessage({ type: 'closeWindow', payload: { windowId } });
    },
    [sendMessage]
  );

  // T003: Save session handler
  const handleSaveSession = useCallback(async (name: string) => {
    if (!sessionId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await apiUpdateSession(sessionId, { name });
      await apiSaveSession(sessionId);
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
  }, [sessionId, updateSession, setSavedSessions]);

  // T012: Session name save from inline edit
  const handleSessionNameSave = useCallback(async (newName: string) => {
    if (!sessionId) return;
    try {
      await apiUpdateSession(sessionId, { name: newName });
      updateSession({ name: newName });
    } catch (err) {
      console.error('[App] Failed to update session name:', err);
    }
  }, [sessionId, updateSession]);

  // T004: Restore session
  const handleRestoreSession = useCallback(async (restoreSessionId: string) => {
    try {
      const session = await fetchSession(restoreSessionId);
      // TODO: Switch WebSocket to the restored session
      console.log('[App] Session restored:', session.id);
    } catch (err) {
      console.error('[App] Failed to restore session:', err);
    }
  }, []);

  // Don't render layout until it's loaded
  if (!layout) {
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
        <main className="flex-1 relative overflow-hidden p-2">
          <PaneContainer
            layout={layout}
            panes={panes}
            activePaneId={activePane}
            zoomedPaneId={zoomedPane}
            onPaneData={handlePaneData}
            onPaneResize={handlePaneResize}
            onPaneFocus={handlePaneFocus}
          />
          {connectionState === 'disconnected' && (
            <DisconnectionOverlay isVisible={true} />
          )}
        </main>
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
        onNewSession={handleNewWindow}
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

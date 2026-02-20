import { useCallback } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PaneContainer } from './components/layout/PaneContainer';
import { Header } from './components/layout/Header';
import { usePaneStore } from './stores/pane-store';
import { useSessionStore } from './stores/session-store';
import { useKeyBindings } from './hooks/useKeyBindings';
import { useWebSocket } from './hooks/useWebSocket';
import { useMessageHandlers } from './hooks/useMessageHandlers';
import { DisconnectionOverlay } from './components/terminal/DisconnectionOverlay';
import type { ConnectionState } from '@webterm/shared/models';

declare global {
  var terminalRefs: Map<string, (data: string | Uint8Array) => void>;
}

function App() {
  const { layout, activePane, panes } = usePaneStore();
  const { currentSession } = useSessionStore();

  // Initialize WebSocket connection with output handler
  const handleOutput = useCallback((paneId: string, data: Uint8Array) => {
    // Access global terminalRefs set by TerminalPane components
    const writeFn = globalThis.terminalRefs?.get(paneId);
    if (writeFn) {
      writeFn(data);
    }
  }, []);

  const {
    connectionState: wsState,
    sendInput,
    sendResize,
    sendMessage
  } = useWebSocket({
    onOutput: handleOutput,
  });

  // Set up message handlers for WebSocket events
  useMessageHandlers();

  // Initialize keybindings
  useKeyBindings();

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
      sendMessage({ type: 'focus', payload: { paneId } });
    },
    [sendMessage]
  );

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
        />
        <main className="flex-1 relative overflow-hidden p-2">
          <PaneContainer
            layout={layout}
            panes={panes}
            activePaneId={activePane}
            onPaneData={handlePaneData}
            onPaneResize={handlePaneResize}
            onPaneFocus={handlePaneFocus}
          />
          {connectionState === 'disconnected' && (
            <DisconnectionOverlay isVisible={true} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;

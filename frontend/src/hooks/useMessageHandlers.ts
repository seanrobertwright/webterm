/**
 * Hook for handling WebSocket messages and updating app state
 * Routes messages to appropriate store updates
 */

import { useEffect } from 'react';
import { usePaneStore } from '../stores/pane-store';
import { useSessionStore } from '../stores/session-store';
import { getWebSocketClient } from '../services/websocket-client';
import type { ServerMessage } from '@webterm/shared/index';

/**
 * Set up message handlers that update app state based on WebSocket messages
 */
export function useMessageHandlers(): void {
  const { setLayout, setWindowId, setInitialState, addPane, removePane, setPaneExitCode, setActivePane } = usePaneStore();
  const { addWindow, removeWindow, updateWindow, clearSession, setSession, setActiveWindow } = useSessionStore();

  useEffect(() => {
    const handleMessage = (message: ServerMessage) => {
      switch (message.type) {
        case 'connected': {
          // Session connected, store will be updated by other messages
          break;
        }

        case 'windowCreated': {
          const { window } = message.payload;

          // Update pane store with initial layout and panes
          setInitialState(window.id, window.layout, window.panes);
          setWindowId(window.id);

          // Update session store
          addWindow(window);
          setActiveWindow(window.id);

          break;
        }

        case 'paneCreated': {
          const { pane, layout } = message.payload;
          addPane(pane);
          setLayout(layout);
          // Auto-focus the newly created pane
          setActivePane(pane.id);
          // Update session store's window with new layout and pane
          {
            const win = useSessionStore.getState().windows.find(w => w.id === pane.windowId);
            if (win) {
              console.warn('[paneCreated] Updating window', pane.windowId, 'with new pane', pane.id, 'layout:', layout);
              updateWindow(pane.windowId, { layout, panes: [...win.panes, pane] });
            } else {
              console.warn('[paneCreated] Window NOT FOUND for pane', pane.id, 'windowId:', pane.windowId, 'known windows:', useSessionStore.getState().windows.map(w => w.id));
            }
          }
          break;
        }

        case 'paneClosed': {
          const { paneId, layout } = message.payload;
          removePane(paneId);
          setLayout(layout);
          // Update session store's window with new layout and removed pane
          {
            const windowId = usePaneStore.getState().windowId;
            if (windowId) {
              const win = useSessionStore.getState().windows.find(w => w.id === windowId);
              if (win) {
                updateWindow(windowId, { layout, panes: win.panes.filter(p => p.id !== paneId) });
              }
            }
          }
          break;
        }

        case 'paneExited': {
          const { paneId, exitCode } = message.payload;
          setPaneExitCode(paneId, exitCode);
          break;
        }

        case 'layoutUpdated': {
          const { layout } = message.payload;
          setLayout(layout);
          // Update session store's window layout
          {
            const windowId = usePaneStore.getState().windowId;
            if (windowId) {
              updateWindow(windowId, { layout });
            }
          }
          break;
        }

        case 'windowClosed': {
          const { windowId } = message.payload;
          removeWindow(windowId);
          break;
        }

        case 'commandResult': {
          const { output } = message.payload;
          window.dispatchEvent(
            new CustomEvent('webterm:commandResult', { detail: { output } }),
          );
          break;
        }

        case 'commandError': {
          const errorMsg =
            'message' in message.payload
              ? (message.payload as { message: string }).message
              : 'Unknown error';
          window.dispatchEvent(
            new CustomEvent('webterm:commandError', { detail: { message: errorMsg } }),
          );
          break;
        }

        case 'paneTitleChanged': {
          const { paneId, title } = message.payload;
          usePaneStore.getState().updatePane(paneId, { title });
          break;
        }

        case 'windowRenamed': {
          const { windowId, name } = message.payload;
          // Only update if the name actually changed to avoid unnecessary re-renders
          const existingWindow = useSessionStore.getState().windows.find(w => w.id === windowId);
          if (!existingWindow || existingWindow.name !== name) {
            updateWindow(windowId, { name });
          }
          break;
        }

        case 'sessionRenamed': {
          const { sessionId, name } = message.payload;
          const currentSession = useSessionStore.getState().currentSession;
          if (currentSession && currentSession.id === sessionId) {
            setSession({ ...currentSession, name });
          }
          break;
        }

        case 'pasteFromBuffer': {
          // Server pushed paste buffer content — write it to the active pane as input
          const { content } = message.payload;
          const activePane = usePaneStore.getState().activePane;
          if (activePane && content) {
            const wsClient = getWebSocketClient();
            wsClient.sendInput(activePane, content);
          }
          break;
        }

        case 'sessionDetached': {
          const { sessionId, reason } = message.payload;
          // Clear session state to show a "detached" landing screen
          clearSession();
          window.dispatchEvent(
            new CustomEvent('webterm:sessionDetached', {
              detail: { sessionId, reason },
            }),
          );
          break;
        }

        case 'sessionSwitched': {
          const { sessionId: newSessionId, session: newSession } = message.payload;
          // Reconnect the WebSocket client to the new session so that
          // subsequent messages route to the correct session on the server.
          const wsClient = getWebSocketClient();
          wsClient.disconnect();
          wsClient.connect(newSessionId);
          // Dispatch an event so other parts of the UI can react
          window.dispatchEvent(
            new CustomEvent('webterm:sessionSwitched', {
              detail: { sessionId: newSessionId, session: newSession },
            }),
          );
          break;
        }

        case 'chooseTreeData': {
          // Forward choose-tree data as a DOM event for the ChooseTree component
          window.dispatchEvent(
            new CustomEvent('webterm:chooseTreeData', {
              detail: message.payload,
            }),
          );
          break;
        }

        case 'optionChanged': {
          const { name, value } = message.payload;
          // Dispatch as a custom event so stores/components can react
          window.dispatchEvent(
            new CustomEvent('webterm:optionChanged', { detail: { name, value } }),
          );
          break;
        }

        case 'activityAlert': {
          const { windowId, alertType } = message.payload;
          const flagUpdate: Partial<Record<string, boolean>> = {};
          if (alertType === 'activity') flagUpdate.activityFlag = true;
          if (alertType === 'bell') flagUpdate.bellFlag = true;
          if (alertType === 'silence') flagUpdate.silenceFlag = true;
          updateWindow(windowId, flagUpdate);
          break;
        }

        case 'error': {
          console.error('[Message] Error:', message.payload);
          break;
        }

        default: {
          // Silently ignore unknown message types
          break;
        }
      }
    };

    // Get the existing WebSocket client and set message handler
    const client = getWebSocketClient();
    client.setCallbacks({
      onMessage: handleMessage,
    });

    // Cleanup is handled by the WebSocket client itself
  }, [setLayout, setWindowId, setInitialState, addPane, removePane, setPaneExitCode, setActivePane, addWindow, removeWindow, updateWindow, clearSession, setSession, setActiveWindow]);
}

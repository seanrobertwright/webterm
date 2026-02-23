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
  const { addWindow, removeWindow } = useSessionStore();

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

          break;
        }

        case 'paneCreated': {
          const { pane, layout } = message.payload;
          addPane(pane);
          setLayout(layout);
          // Auto-focus the newly created pane
          setActivePane(pane.id);
          break;
        }

        case 'paneClosed': {
          const { paneId, layout } = message.payload;
          removePane(paneId);
          setLayout(layout);
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
          break;
        }

        case 'windowClosed': {
          const { windowId } = message.payload;
          removeWindow(windowId);
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
  }, [setLayout, setWindowId, setInitialState, addPane, removePane, setPaneExitCode, setActivePane, addWindow, removeWindow]);
}

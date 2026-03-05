/**
 * React hook for WebSocket connection management
 * Provides WebSocket connectivity with automatic reconnection
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  WebSocketClient, 
  getWebSocketClient, 
  type WebSocketCallbacks, 
  type WebSocketClientConfig,
} from '../services/websocket-client';
import type { WebSocketState } from '../types';
import type { ServerMessage, BinaryMessageTypeCode } from '@webterm/shared/index';

// ============================================================================
// Types
// ============================================================================

export interface UseWebSocketOptions {
  /** Session ID to connect to (optional, creates new session if not provided) */
  sessionId?: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** WebSocket client configuration */
  config?: WebSocketClientConfig;
  /** Callback when connection is established */
  onConnect?: () => void;
  /** Callback when connection is closed */
  onDisconnect?: (reason?: string) => void;
  /** Callback when JSON message is received */
  onMessage?: (message: ServerMessage) => void;
  /** Callback when binary output is received */
  onOutput?: (paneId: string, data: Uint8Array) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseWebSocketReturn {
  /** Current connection state */
  connectionState: WebSocketState;
  /** Current session ID */
  sessionId: string | null;
  /** Connect to WebSocket server */
  connect: (sessionId?: string) => void;
  /** Disconnect from WebSocket server */
  disconnect: () => void;
  /** Send a JSON message */
  sendMessage: (message: import('@webterm/shared/index').ClientMessage) => void;
  /** Send binary data */
  sendBinary: (type: BinaryMessageTypeCode, paneId: string, data: Uint8Array) => void;
  /** Send terminal input */
  sendInput: (paneId: string, data: string | Uint8Array) => void;
  /** Send resize message */
  sendResize: (paneId: string, cols: number, rows: number) => void;
  /** Switch to a different session */
  switchSession: (newSessionId: string) => void;
  /** WebSocket client instance */
  client: WebSocketClient;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing WebSocket connection to the terminal backend
 * 
 * @example
 * ```tsx
 * const { connectionState, sendInput, sendResize } = useWebSocket({
 *   autoConnect: true,
 *   onMessage: (msg) => console.log('Received:', msg),
 *   onOutput: (paneId, data) => terminal.write(data),
 * });
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    sessionId: initialSessionId,
    autoConnect = true,
    config,
    onConnect,
    onDisconnect,
    onMessage,
    onOutput,
    onError,
  } = options;

  const [connectionState, setConnectionState] = useState<WebSocketState>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  
  // Use refs for callbacks to avoid effect dependencies
  const callbacksRef = useRef<WebSocketCallbacks>({});
  const clientRef = useRef<WebSocketClient | null>(null);

  // Update callbacks ref when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onConnect: () => {
        onConnect?.();
      },
      onDisconnect: (reason) => {
        onDisconnect?.(reason);
      },
      onMessage: (message) => {
        // Update session ID from connected message
        if (message.type === 'connected') {
          setSessionId(message.payload.sessionId);
        }
        onMessage?.(message);
      },
      onOutput: (paneId, data) => {
        onOutput?.(paneId, data);
      },
      onStateChange: (state) => {
        setConnectionState(state);
      },
      onError: (error) => {
        onError?.(error);
      },
    };
  }, [onConnect, onDisconnect, onMessage, onOutput, onError]);

  // Initialize client and set up callbacks
  useEffect(() => {
    const client = getWebSocketClient(config);
    clientRef.current = client;
    
    // Wrapper callbacks that delegate to ref
    client.setCallbacks({
      onConnect: () => callbacksRef.current.onConnect?.(),
      onDisconnect: (reason) => callbacksRef.current.onDisconnect?.(reason),
      onMessage: (message) => callbacksRef.current.onMessage?.(message),
      onOutput: (paneId, data) => callbacksRef.current.onOutput?.(paneId, data),
      onStateChange: (state) => callbacksRef.current.onStateChange?.(state),
      onError: (error) => callbacksRef.current.onError?.(error),
    });

    // Auto-connect if enabled
    if (autoConnect) {
      client.connect(initialSessionId);
    }

    // Update initial state
    setConnectionState(client.connectionState);

    // Cleanup on unmount
    return () => {
      // Note: We don't disconnect here to allow connection persistence
      // If you want to disconnect on unmount, call disconnect() explicitly
    };
  }, [autoConnect, config, initialSessionId]);

  // ============================================================================
  // Methods
  // ============================================================================

  const connect = useCallback((newSessionId?: string) => {
    clientRef.current?.connect(newSessionId ?? sessionId ?? undefined);
  }, [sessionId]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const sendMessage = useCallback((message: import('@webterm/shared/index').ClientMessage) => {
    clientRef.current?.sendJson(message);
  }, []);

  const sendBinary = useCallback((
    type: BinaryMessageTypeCode, 
    paneId: string, 
    data: Uint8Array
  ) => {
    clientRef.current?.sendBinary(type, paneId, data);
  }, []);

  const sendInput = useCallback((paneId: string, data: string | Uint8Array) => {
    clientRef.current?.sendInput(paneId, data);
  }, []);

  const sendResize = useCallback((paneId: string, cols: number, rows: number) => {
    clientRef.current?.sendResize(paneId, cols, rows);
  }, []);

  const switchSession = useCallback((newSessionId: string) => {
    clientRef.current?.switchSession(newSessionId);
  }, []);

  return {
    connectionState,
    sessionId,
    connect,
    disconnect,
    switchSession,
    sendMessage,
    sendBinary,
    sendInput,
    sendResize,
    client: clientRef.current ?? getWebSocketClient(config),
  };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for sending terminal input to a specific pane
 * Memoizes the send function for the given pane ID
 */
export function usePaneInput(paneId: string) {
  const { sendInput, sendResize, connectionState } = useWebSocket({ autoConnect: false });
  
  const send = useCallback((data: string | Uint8Array) => {
    sendInput(paneId, data);
  }, [paneId, sendInput]);

  const resize = useCallback((cols: number, rows: number) => {
    sendResize(paneId, cols, rows);
  }, [paneId, sendResize]);

  return {
    send,
    resize,
    isConnected: connectionState === 'connected',
  };
}

/**
 * Hook for tracking connection state
 */
export function useConnectionState() {
  const [state, setState] = useState<WebSocketState>('disconnected');
  
  useEffect(() => {
    const client = getWebSocketClient();
    
    // Get initial state
    setState(client.connectionState);
    
    // Subscribe to state changes
    client.setCallbacks({
      onStateChange: setState,
    });
  }, []);

  return state;
}

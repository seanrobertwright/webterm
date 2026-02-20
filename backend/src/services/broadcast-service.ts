/**
 * Broadcast mode state management
 * Handles broadcasting input to multiple panes simultaneously
 */

import { logger } from '../utils/logger.js';

/** Broadcast session state */
interface BroadcastState {
  enabled: boolean;
  paneIds: Set<string>;
  createdAt: number;
}

/**
 * Broadcast Manager - manages broadcast mode for sessions
 */
export class BroadcastManager {
  private sessions: Map<string, BroadcastState> = new Map();

  /**
   * Enable broadcast mode for specified panes
   * @param sessionId The session ID
   * @param paneIds Array of pane IDs to broadcast to
   */
  enableBroadcast(sessionId: string, paneIds: string[]): void {
    if (paneIds.length < 2) {
      logger.warn(`Broadcast requires at least 2 panes, got ${paneIds.length}`);
      return;
    }

    logger.info(`Enabling broadcast for session ${sessionId} with panes: ${paneIds.join(', ')}`);

    this.sessions.set(sessionId, {
      enabled: true,
      paneIds: new Set(paneIds),
      createdAt: Date.now(),
    });
  }

  /**
   * Disable broadcast mode for a session
   * @param sessionId The session ID
   */
  disableBroadcast(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    
    if (state?.enabled) {
      logger.info(`Disabling broadcast for session ${sessionId}`);
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Get panes in broadcast mode for a session
   * @param sessionId The session ID
   * @returns Array of pane IDs, or empty array if not broadcasting
   */
  getBroadcastPanes(sessionId: string): string[] {
    const state = this.sessions.get(sessionId);
    
    if (!state?.enabled) {
      return [];
    }

    return Array.from(state.paneIds);
  }

  /**
   * Check if broadcast mode is enabled for a session
   * @param sessionId The session ID
   * @returns true if broadcast is enabled
   */
  isBroadcastEnabled(sessionId: string): boolean {
    const state = this.sessions.get(sessionId);
    return state?.enabled ?? false;
  }

  /**
   * Add a pane to an active broadcast
   * @param sessionId The session ID
   * @param paneId The pane ID to add
   * @returns true if added successfully
   */
  addPaneToBroadcast(sessionId: string, paneId: string): boolean {
    const state = this.sessions.get(sessionId);
    
    if (!state?.enabled) {
      logger.warn(`Cannot add pane to broadcast: session ${sessionId} not broadcasting`);
      return false;
    }

    state.paneIds.add(paneId);
    logger.info(`Added pane ${paneId} to broadcast for session ${sessionId}`);
    return true;
  }

  /**
   * Remove a pane from an active broadcast
   * @param sessionId The session ID
   * @param paneId The pane ID to remove
   * @returns true if removed successfully
   */
  removePaneFromBroadcast(sessionId: string, paneId: string): boolean {
    const state = this.sessions.get(sessionId);
    
    if (!state?.enabled) {
      return false;
    }

    const removed = state.paneIds.delete(paneId);

    // If less than 2 panes remain, disable broadcast
    if (state.paneIds.size < 2) {
      logger.info(`Broadcast auto-disabled for session ${sessionId}: less than 2 panes remaining`);
      this.disableBroadcast(sessionId);
    }

    return removed;
  }

  /**
   * Check if a specific pane is in broadcast mode
   * @param sessionId The session ID
   * @param paneId The pane ID
   * @returns true if the pane is in broadcast mode
   */
  isPaneInBroadcast(sessionId: string, paneId: string): boolean {
    const state = this.sessions.get(sessionId);
    return state?.enabled ? state.paneIds.has(paneId) : false;
  }

  /**
   * Toggle a pane's broadcast membership
   * @param sessionId The session ID
   * @param paneId The pane ID
   * @returns true if pane is now in broadcast, false if removed
   */
  togglePaneBroadcast(sessionId: string, paneId: string): boolean {
    const state = this.sessions.get(sessionId);
    
    if (!state?.enabled) {
      return false;
    }

    if (state.paneIds.has(paneId)) {
      this.removePaneFromBroadcast(sessionId, paneId);
      return false;
    } else {
      this.addPaneToBroadcast(sessionId, paneId);
      return true;
    }
  }

  /**
   * Get broadcast state for a session
   * @param sessionId The session ID
   * @returns Broadcast state or null
   */
  getBroadcastState(sessionId: string): { enabled: boolean; paneIds: string[]; createdAt: number } | null {
    const state = this.sessions.get(sessionId);
    
    if (!state) {
      return null;
    }

    return {
      enabled: state.enabled,
      paneIds: Array.from(state.paneIds),
      createdAt: state.createdAt,
    };
  }

  /**
   * Get all sessions with active broadcast
   */
  getActiveBroadcastSessions(): string[] {
    const active: string[] = [];
    
    for (const [sessionId, state] of this.sessions) {
      if (state.enabled) {
        active.push(sessionId);
      }
    }

    return active;
  }

  /**
   * Clear all broadcast states
   */
  clearAll(): void {
    logger.info('Clearing all broadcast states');
    this.sessions.clear();
  }
}

/** Singleton instance */
export const broadcastManager = new BroadcastManager();

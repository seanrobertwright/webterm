/**
 * Clipboard service for WebTerm
 * Provides copy/paste functionality with fallbacks for browser compatibility
 */

import type { ClipboardResult } from '../types';

/** In-app clipboard fallback when browser API is unavailable */
let inAppClipboard = '';

/**
 * Copy text to clipboard
 * Tries modern Clipboard API first, falls back to execCommand
 * 
 * @param text - Text to copy to clipboard
 * @returns Result with success status and any error
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  // Try modern Clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      // Also update in-app clipboard as backup
      inAppClipboard = text;
      return { success: true };
    } catch (error) {
      // Fall through to fallback methods
      console.warn('[Clipboard] Clipboard API failed, trying fallback:', error);
    }
  }

  // Fallback: execCommand with textarea
  try {
    const success = copyWithExecCommand(text);
    if (success) {
      inAppClipboard = text;
      return { success: true };
    }
    throw new Error('execCommand returned false');
  } catch (error) {
    // Last resort: in-app clipboard only
    console.warn('[Clipboard] execCommand failed, using in-app clipboard:', error);
    inAppClipboard = text;
    return {
      success: true,
      error: 'Copied to in-app clipboard only (browser clipboard unavailable)',
    };
  }
}

/**
 * Paste text from clipboard
 * Tries modern Clipboard API first, falls back to in-app clipboard
 * 
 * @returns Result with success status, data, and any error
 */
export async function pasteFromClipboard(): Promise<ClipboardResult> {
  // Try modern Clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      const text = await navigator.clipboard.readText();
      return { success: true, data: text };
    } catch (error) {
      // Fall through to fallback
      console.warn('[Clipboard] Clipboard API read failed, using in-app clipboard:', error);
    }
  }

  // Fallback: return in-app clipboard
  if (inAppClipboard) {
    return {
      success: true,
      data: inAppClipboard,
      error: 'Using in-app clipboard (browser clipboard unavailable)',
    };
  }

  return {
    success: false,
    error: 'Clipboard is empty or unavailable',
  };
}

/**
 * Get the current in-app clipboard content
 * Useful for UI display without async operations
 */
export function getInAppClipboard(): string {
  return inAppClipboard;
}

/**
 * Set the in-app clipboard content directly
 * Useful for terminal selection copy operations
 */
export function setInAppClipboard(text: string): void {
  inAppClipboard = text;
}

/**
 * Clear the in-app clipboard
 */
export function clearInAppClipboard(): void {
  inAppClipboard = '';
}

/**
 * Check if clipboard API is available
 */
export function isClipboardAvailable(): boolean {
  return !!(navigator.clipboard && window.isSecureContext);
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Fallback copy using deprecated execCommand
 * Creates a temporary textarea element
 */
function copyWithExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea');
  
  // Prevent scrolling to bottom of page
  textarea.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 2em;
    height: 2em;
    padding: 0;
    border: none;
    outline: none;
    box-shadow: none;
    background: transparent;
    opacity: 0;
    z-index: -1;
  `;
  
  textarea.value = text;
  document.body.appendChild(textarea);
  
  try {
    textarea.focus();
    textarea.select();
    
    // Attempt to select all text
    textarea.setSelectionRange(0, text.length);
    
    const success = document.execCommand('copy');
    return success;
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Request clipboard permissions (for browsers that support it)
 * Returns true if permission is granted or the API is not supported
 */
export async function requestClipboardPermission(
  operation: 'read' | 'write' = 'write'
): Promise<boolean> {
  if (!navigator.permissions) {
    return true; // API not supported, assume permitted
  }

  try {
    const permissionName = operation === 'read' ? 'clipboard-read' : 'clipboard-write';
    const result = await navigator.permissions.query({
      name: permissionName as PermissionName,
    });
    return result.state === 'granted' || result.state === 'prompt';
  } catch {
    // Permission API doesn't support clipboard permissions in this browser
    return true;
  }
}

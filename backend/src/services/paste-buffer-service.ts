/**
 * In-memory paste buffer stack for copy/paste operations
 *
 * Manages a global stack of named buffers, ordered most-recently-created first.
 * Not persisted to database -- buffers are lost on server restart.
 */

import type { PasteBuffer } from '../../../shared/types/models.js';

// ============================================================================
// PasteBufferService
// ============================================================================

/**
 * Manages an in-memory stack of paste buffers.
 *
 * Buffers are stored most-recent-first. Auto-generated names use an
 * ever-incrementing counter (`buffer0`, `buffer1`, ...) that never resets.
 * When the configured limit is reached, the oldest buffer (last in the array)
 * is evicted before a new one is added.
 */
export class PasteBufferService {
  private buffers: PasteBuffer[] = [];
  private nextIndex = 0;
  private limit = 50;

  /** Add content to a new or named buffer. Returns the buffer name. */
  add(content: string, name?: string): string {
    const bufferName = name ?? `buffer${this.nextIndex++}`;

    // If a buffer with this name already exists, remove it first
    // so the new entry can be prepended as most recent
    const existingIdx = this.buffers.findIndex((b) => b.name === bufferName);
    if (existingIdx !== -1) {
      this.buffers.splice(existingIdx, 1);
    }

    // Evict oldest if at limit
    if (this.buffers.length >= this.limit) {
      this.buffers.pop();
    }

    const buffer: PasteBuffer = {
      name: bufferName,
      content,
      size: content.length,
      createdAt: Date.now(),
    };

    // Prepend (most recent first)
    this.buffers.unshift(buffer);

    return bufferName;
  }

  /** Get the most recently created buffer */
  getMostRecent(): PasteBuffer | null {
    return this.buffers[0] ?? null;
  }

  /** Get a buffer by name */
  getByName(name: string): PasteBuffer | null {
    return this.buffers.find((b) => b.name === name) ?? null;
  }

  /** List all buffers, most recent first */
  list(): PasteBuffer[] {
    return [...this.buffers];
  }

  /** Delete a buffer by name. Returns true if found and deleted. */
  delete(name: string): boolean {
    const idx = this.buffers.findIndex((b) => b.name === name);
    if (idx === -1) {
      return false;
    }
    this.buffers.splice(idx, 1);
    return true;
  }

  /** Set/replace content of a named buffer */
  set(name: string, content: string): void {
    const existing = this.buffers.find((b) => b.name === name);
    if (existing) {
      existing.content = content;
      existing.size = content.length;
    } else {
      this.add(content, name);
    }
  }

  /** Get the buffer limit */
  getLimit(): number {
    return this.limit;
  }

  /** Set the buffer limit */
  setLimit(limit: number): void {
    this.limit = limit;

    // Evict excess buffers from the end (oldest) if over the new limit
    while (this.buffers.length > this.limit) {
      this.buffers.pop();
    }
  }

  /** Get the count of buffers */
  get count(): number {
    return this.buffers.length;
  }
}

/** Singleton instance */
export const pasteBufferService = new PasteBufferService();

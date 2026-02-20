/**
 * Layout model
 * TypeScript types and JSON serialization helpers for layout tree
 */

import type { Layout, LayoutType, SplitDirection } from '../../../shared/types/models.js';
import { logger } from '../utils/logger.js';

// Re-export types from shared
export type { Layout, LayoutType, SplitDirection };

/**
 * Type guard for leaf layout nodes
 */
export function isLeafLayout(layout: Layout): layout is Layout & { type: 'leaf'; paneId: string } {
  return layout.type === 'leaf' && typeof layout.paneId === 'string';
}

/**
 * Type guard for split layout nodes
 */
export function isSplitLayout(layout: Layout): layout is Layout & { 
  type: 'horizontal' | 'vertical'; 
  children: Layout[]; 
  sizes: number[] 
} {
  return (
    (layout.type === 'horizontal' || layout.type === 'vertical') &&
    Array.isArray(layout.children) &&
    Array.isArray(layout.sizes)
  );
}

/**
 * Serialize layout to JSON string
 */
export function serializeLayout(layout: Layout): string {
  return JSON.stringify(layout);
}

/**
 * Parse layout from JSON string
 * @returns Parsed layout or null if invalid
 */
export function parseLayout(json: string): Layout | null {
  try {
    const parsed = JSON.parse(json);
    
    if (!isValidLayout(parsed)) {
      logger.warn('Parsed JSON is not a valid layout structure');
      return null;
    }
    
    return parsed as Layout;
  } catch (error) {
    logger.error('Failed to parse layout JSON:', error);
    return null;
  }
}

/**
 * Check if an object is a valid layout structure
 */
export function isValidLayout(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const layout = obj as Record<string, unknown>;

  if (!('type' in layout)) {
    return false;
  }

  const type = layout['type'];

  if (type === 'leaf') {
    return typeof layout['paneId'] === 'string';
  }

  if (type === 'horizontal' || type === 'vertical') {
    if (!Array.isArray(layout['children']) || !Array.isArray(layout['sizes'])) {
      return false;
    }

    const children = layout['children'] as unknown[];
    const sizes = layout['sizes'] as unknown[];

    if (children.length < 2) {
      return false;
    }

    if (children.length !== sizes.length) {
      return false;
    }

    // Validate sizes sum to ~1.0
    const sizeSum = sizes.reduce((sum: number, s) => {
      if (typeof s !== 'number') return NaN;
      return sum + s;
    }, 0);

    if (isNaN(sizeSum) || Math.abs(sizeSum - 1.0) > 0.01) {
      return false;
    }

    // Recursively validate children
    return children.every(isValidLayout);
  }

  return false;
}

/**
 * Create a deep copy of a layout
 */
export function cloneLayout(layout: Layout): Layout {
  return JSON.parse(JSON.stringify(layout));
}

/**
 * Create a default leaf layout
 */
export function createDefaultLayout(paneId: string): Layout {
  return {
    type: 'leaf',
    paneId,
  };
}

/**
 * Create a split layout with two children
 */
export function createSplitLayout(
  direction: SplitDirection,
  first: Layout,
  second: Layout,
  ratio: number = 0.5
): Layout {
  const normalizedRatio = Math.max(0.1, Math.min(0.9, ratio));
  
  return {
    type: direction === 'h' ? 'horizontal' : 'vertical',
    children: [first, second],
    sizes: [normalizedRatio, 1 - normalizedRatio],
  };
}

/**
 * Normalize sizes in a layout (ensure they sum to 1.0)
 */
export function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((sum, s) => sum + s, 0);
  
  if (total === 0) {
    // Equal distribution if all zeros
    return sizes.map(() => 1 / sizes.length);
  }
  
  return sizes.map((s) => s / total);
}

/**
 * Get layout depth (maximum nesting level)
 */
export function getLayoutDepth(layout: Layout): number {
  if (layout.type === 'leaf') {
    return 1;
  }

  if (!layout.children) {
    return 1;
  }

  const childDepths = layout.children.map(getLayoutDepth);
  return 1 + Math.max(...childDepths);
}

/**
 * Flatten a layout into an array of pane IDs in order
 */
export function flattenLayout(layout: Layout): string[] {
  if (layout.type === 'leaf') {
    return layout.paneId ? [layout.paneId] : [];
  }

  if (!layout.children) {
    return [];
  }

  return layout.children.flatMap(flattenLayout);
}

/**
 * Find a pane's path in the layout tree
 * @returns Array of indices representing the path, or null if not found
 */
export function findPanePath(layout: Layout, paneId: string): number[] | null {
  if (layout.type === 'leaf') {
    return layout.paneId === paneId ? [] : null;
  }

  if (!layout.children) {
    return null;
  }

  for (let i = 0; i < layout.children.length; i++) {
    const child = layout.children[i];
    if (!child) continue;
    const childPath = findPanePath(child, paneId);
    if (childPath !== null) {
      return [i, ...childPath];
    }
  }

  return null;
}

/**
 * Get a layout node by path
 */
export function getLayoutByPath(layout: Layout, path: number[]): Layout | null {
  if (path.length === 0) {
    return layout;
  }

  if (layout.type === 'leaf' || !layout.children) {
    return null;
  }

  const [index, ...rest] = path;
  if (index === undefined) {
    return null;
  }

  const child = layout.children[index];

  if (!child) {
    return null;
  }

  return getLayoutByPath(child, rest);
}

/**
 * Calculate the visual bounds of a pane within a layout
 * Returns { x, y, width, height } as fractions of the total area
 */
export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculatePaneBounds(
  layout: Layout,
  paneId: string,
  bounds: LayoutBounds = { x: 0, y: 0, width: 1, height: 1 }
): LayoutBounds | null {
  if (layout.type === 'leaf') {
    return layout.paneId === paneId ? bounds : null;
  }

  if (!layout.children || !layout.sizes) {
    return null;
  }

  let offset = 0;

  for (let i = 0; i < layout.children.length; i++) {
    const child = layout.children[i];
    const size = layout.sizes[i];

    if (!child || size === undefined) continue;

    let childBounds: LayoutBounds;

    if (layout.type === 'horizontal') {
      childBounds = {
        x: bounds.x + offset * bounds.width,
        y: bounds.y,
        width: size * bounds.width,
        height: bounds.height,
      };
    } else {
      childBounds = {
        x: bounds.x,
        y: bounds.y + offset * bounds.height,
        width: bounds.width,
        height: size * bounds.height,
      };
    }

    const result = calculatePaneBounds(child, paneId, childBounds);
    if (result) {
      return result;
    }

    offset += size;
  }

  return null;
}

/**
 * Convert layout to a simple string representation (for debugging)
 */
export function layoutToString(layout: Layout, indent: number = 0): string {
  const prefix = '  '.repeat(indent);

  if (layout.type === 'leaf') {
    return `${prefix}[${layout.paneId}]`;
  }

  const direction = layout.type === 'horizontal' ? '─' : '│';
  const children = (layout.children ?? [])
    .map((child, i) => {
      const size = layout.sizes?.[i] ?? 0;
      return `${layoutToString(child, indent + 1)} (${(size * 100).toFixed(0)}%)`;
    })
    .join('\n');

  return `${prefix}${direction} ${layout.type}\n${children}`;
}

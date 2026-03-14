/**
 * Layout tree management service
 * Handles creating, splitting, and modifying pane layouts
 */

import type {
  Layout,
  LayoutType,
  PresetLayoutName,
  SplitDirection,
} from '../../../shared/types/models.js';
export type { PresetLayoutName } from '../../../shared/types/models.js';
import { logger } from '../utils/logger.js';

/** Maximum number of panes allowed per window */
export const MAX_PANES_PER_WINDOW = 16;

/** Default split ratio */
const DEFAULT_SPLIT_RATIO = 0.5;

/**
 * Create a leaf layout node for a single pane
 */
export function createLeafLayout(paneId: string): Layout {
  return {
    type: 'leaf',
    paneId,
  };
}

/**
 * Split a pane in the layout tree
 * @param layout The current layout tree
 * @param targetPaneId The pane to split
 * @param direction Split direction ('h' for horizontal, 'v' for vertical)
 * @param newPaneId The ID of the new pane to create
 * @param ratio Optional split ratio (0.0-1.0), defaults to 0.5
 * @returns The new layout tree, or null if the target pane was not found
 */
export function splitLayout(
  layout: Layout,
  targetPaneId: string,
  direction: SplitDirection,
  newPaneId: string,
  ratio: number = DEFAULT_SPLIT_RATIO
): Layout | null {
  // Normalize ratio
  const normalizedRatio = Math.max(0.1, Math.min(0.9, ratio));
  const layoutType: LayoutType = direction === 'h' ? 'horizontal' : 'vertical';

  // If this is the target leaf, split it
  if (layout.type === 'leaf' && layout.paneId === targetPaneId) {
    return {
      type: layoutType,
      children: [
        { type: 'leaf', paneId: targetPaneId },
        { type: 'leaf', paneId: newPaneId },
      ],
      sizes: [normalizedRatio, 1 - normalizedRatio],
    };
  }

  // If this is a split node, recursively search children
  if (layout.type !== 'leaf' && layout.children) {
    const newChildren: Layout[] = [];
    let found = false;

    for (const child of layout.children) {
      const result = splitLayout(child, targetPaneId, direction, newPaneId, ratio);
      if (result) {
        newChildren.push(result);
        found = true;
      } else {
        newChildren.push(child);
      }
    }

    if (found) {
      return {
        ...layout,
        children: newChildren,
      };
    }
  }

  // Target not found in this branch
  return null;
}

/**
 * Remove a pane from the layout tree
 * @param layout The current layout tree
 * @param paneId The pane to remove
 * @returns The new layout tree, or null if the layout becomes empty
 */
export function removePane(layout: Layout, paneId: string): Layout | null {
  // If this is the target leaf, remove it
  if (layout.type === 'leaf') {
    return layout.paneId === paneId ? null : layout;
  }

  // Split node: process children
  if (!layout.children || !layout.sizes) {
    return layout;
  }

  const newChildren: Layout[] = [];
  const newSizes: number[] = [];
  let removedSize = 0;

  for (let i = 0; i < layout.children.length; i++) {
    const child = layout.children[i];
    if (!child) continue;
    const size = layout.sizes[i] ?? 0;
    const result = removePane(child, paneId);

    if (result === null) {
      // Child was removed
      removedSize += size;
    } else {
      newChildren.push(result);
      newSizes.push(size);
    }
  }

  // If all children were removed, this node is empty
  if (newChildren.length === 0) {
    return null;
  }

  // If only one child remains, collapse the split
  if (newChildren.length === 1) {
    const child = newChildren[0];
    return child ?? null;
  }

  // Redistribute the removed size proportionally
  if (removedSize > 0) {
    const totalRemaining = newSizes.reduce((a, b) => a + b, 0);
    for (let i = 0; i < newSizes.length; i++) {
      const currentSize = newSizes[i];
      if (currentSize !== undefined) {
        newSizes[i] = (currentSize / totalRemaining);
      }
    }
  }

  return {
    ...layout,
    children: newChildren,
    sizes: newSizes,
  };
}

/**
 * Count total panes in a layout tree
 */
export function countPanes(layout: Layout): number {
  if (layout.type === 'leaf') {
    return 1;
  }

  if (!layout.children) {
    return 0;
  }

  return layout.children.reduce((sum, child) => sum + countPanes(child), 0);
}

/**
 * Get all pane IDs in a layout tree
 */
export function getPaneIds(layout: Layout): string[] {
  if (layout.type === 'leaf') {
    return layout.paneId ? [layout.paneId] : [];
  }

  if (!layout.children) {
    return [];
  }

  return layout.children.flatMap(getPaneIds);
}

/**
 * Validate if adding a pane would exceed the limit
 * @param layout The current layout
 * @param maxPanes Maximum allowed panes (default: 16)
 * @returns true if a new pane can be added
 */
export function validatePaneLimit(layout: Layout, maxPanes: number = MAX_PANES_PER_WINDOW): boolean {
  const currentCount = countPanes(layout);
  return currentCount < maxPanes;
}

/**
 * Check if a pane exists in the layout
 */
export function paneExistsInLayout(layout: Layout, paneId: string): boolean {
  if (layout.type === 'leaf') {
    return layout.paneId === paneId;
  }

  if (!layout.children) {
    return false;
  }

  return layout.children.some((child) => paneExistsInLayout(child, paneId));
}

/**
 * Find the first pane ID in the layout (for focus after delete)
 */
export function getFirstPaneId(layout: Layout): string | null {
  if (layout.type === 'leaf') {
    return layout.paneId ?? null;
  }

  if (layout.children && layout.children.length > 0) {
    const firstChild = layout.children[0];
    if (firstChild) {
      return getFirstPaneId(firstChild);
    }
  }

  return null;
}

/** Pane bounding box in normalized coordinates (0.0–1.0) */
export interface PaneBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Build a coordinate map for all panes in the layout tree.
 * Traverses depth-first, assigning each leaf pane a bounding box
 * based on cumulative sizes.
 * @returns Map of pane ID to normalized bounding box
 */
export function buildPaneCoordinates(layout: Layout): Map<string, PaneBounds> {
  const coords = new Map<string, PaneBounds>();

  function traverse(node: Layout, x: number, y: number, w: number, h: number): void {
    if (node.type === 'leaf' && node.paneId) {
      coords.set(node.paneId, { x, y, w, h });
      return;
    }

    if (!node.children || !node.sizes) return;

    const isHorizontal = node.type === 'horizontal';
    let offset = 0;

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const size = node.sizes[i] ?? 0;
      if (!child) continue;

      if (isHorizontal) {
        // horizontal = stacked top-to-bottom
        traverse(child, x, y + offset * h, w, size * h);
      } else {
        // vertical = side-by-side left-to-right
        traverse(child, x + offset * w, y, size * w, h);
      }
      offset += size;
    }
  }

  traverse(layout, 0, 0, 1, 1);
  return coords;
}

/**
 * Find adjacent pane for navigation using spatial coordinates.
 * Given the current pane's bounds and a direction, finds the pane
 * whose bounds are adjacent in that direction, preferring the one
 * with the closest center.
 */
export function findAdjacentPane(
  layout: Layout,
  currentPaneId: string,
  direction: 'left' | 'right' | 'up' | 'down'
): string | null {
  const coords = buildPaneCoordinates(layout);
  const current = coords.get(currentPaneId);
  if (!current) return null;

  const EPSILON = 0.001;
  let bestId: string | null = null;
  let bestDistance = Infinity;

  const currentCenterX = current.x + current.w / 2;
  const currentCenterY = current.y + current.h / 2;

  for (const [paneId, bounds] of coords) {
    if (paneId === currentPaneId) continue;

    const candidateCenterX = bounds.x + bounds.w / 2;
    const candidateCenterY = bounds.y + bounds.h / 2;
    let isAdjacent = false;
    let distance = Infinity;

    switch (direction) {
      case 'right':
        // Candidate's left edge touches current's right edge, and overlaps vertically
        if (Math.abs(bounds.x - (current.x + current.w)) < EPSILON &&
            bounds.y < current.y + current.h - EPSILON &&
            bounds.y + bounds.h > current.y + EPSILON) {
          isAdjacent = true;
          distance = Math.abs(candidateCenterY - currentCenterY);
        }
        break;
      case 'left':
        if (Math.abs(bounds.x + bounds.w - current.x) < EPSILON &&
            bounds.y < current.y + current.h - EPSILON &&
            bounds.y + bounds.h > current.y + EPSILON) {
          isAdjacent = true;
          distance = Math.abs(candidateCenterY - currentCenterY);
        }
        break;
      case 'down':
        if (Math.abs(bounds.y - (current.y + current.h)) < EPSILON &&
            bounds.x < current.x + current.w - EPSILON &&
            bounds.x + bounds.w > current.x + EPSILON) {
          isAdjacent = true;
          distance = Math.abs(candidateCenterX - currentCenterX);
        }
        break;
      case 'up':
        if (Math.abs(bounds.y + bounds.h - current.y) < EPSILON &&
            bounds.x < current.x + current.w - EPSILON &&
            bounds.x + bounds.w > current.x + EPSILON) {
          isAdjacent = true;
          distance = Math.abs(candidateCenterX - currentCenterX);
        }
        break;
    }

    if (isAdjacent && distance < bestDistance) {
      bestDistance = distance;
      bestId = paneId;
    }
  }

  return bestId;
}

/**
 * Resize a split in the layout
 * @param layout The layout tree
 * @param paneId A pane ID within the split to resize
 * @param delta The amount to resize (-1.0 to 1.0)
 * @returns New layout with updated sizes
 */
export function resizeSplit(
  layout: Layout,
  paneId: string,
  delta: number
): Layout | null {
  if (layout.type === 'leaf') {
    return layout;
  }

  if (!layout.children || !layout.sizes) {
    return layout;
  }

  // Find which child contains the pane
  let targetIndex = -1;
  for (let i = 0; i < layout.children.length; i++) {
    const child = layout.children[i];
    if (child && paneExistsInLayout(child, paneId)) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    // Not in this node, search children
    const newChildren = layout.children.map((child) => {
      const result = resizeSplit(child, paneId, delta);
      return result ?? child;
    });

    return {
      ...layout,
      children: newChildren,
    };
  }

  // Resize between targetIndex and targetIndex + 1
  if (targetIndex >= layout.sizes.length - 1) {
    return layout;
  }

  const newSizes = [...layout.sizes];
  const minSize = 0.1;

  // Apply delta
  const currentSize = newSizes[targetIndex];
  const nextSize = newSizes[targetIndex + 1];
  if (currentSize === undefined || nextSize === undefined) {
    return layout;
  }

  const newSize1 = Math.max(minSize, Math.min(1 - minSize, currentSize + delta));
  const newSize2 = Math.max(minSize, Math.min(1 - minSize, nextSize - delta));

  // Normalize
  const total = newSize1 + newSize2;
  newSizes[targetIndex] = newSize1 / total * (currentSize + nextSize);
  newSizes[targetIndex + 1] = newSize2 / total * (currentSize + nextSize);

  return {
    ...layout,
    sizes: newSizes,
  };
}

/**
 * Validate a layout structure
 */
export function validateLayout(layout: Layout): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  function validate(node: Layout, path: string): void {
    if (node.type === 'leaf') {
      if (!node.paneId) {
        errors.push(`${path}: Leaf node missing paneId`);
      }
      return;
    }

    if (node.type !== 'horizontal' && node.type !== 'vertical') {
      errors.push(`${path}: Invalid layout type: ${node.type}`);
      return;
    }

    if (!node.children || node.children.length < 2) {
      errors.push(`${path}: Split node must have at least 2 children`);
      return;
    }

    if (!node.sizes || node.sizes.length !== node.children.length) {
      errors.push(`${path}: Sizes array length must match children length`);
      return;
    }

    const sizeSum = node.sizes.reduce((a, b) => a + b, 0);
    if (Math.abs(sizeSum - 1.0) > 0.001) {
      errors.push(`${path}: Sizes must sum to 1.0, got ${sizeSum}`);
    }

    node.children.forEach((child, i) => {
      validate(child, `${path}.children[${i}]`);
    });
  }

  validate(layout, 'root');

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Serialize layout to JSON string
 */
export function serializeLayout(layout: Layout): string {
  return JSON.stringify(layout);
}

/**
 * Swap two panes in the layout tree by exchanging their paneId values.
 * @param layout The current layout tree
 * @param paneId1 First pane to swap
 * @param paneId2 Second pane to swap
 * @returns The new layout tree with swapped panes, or null if either pane was not found
 */
export function swapPanesInLayout(
  layout: Layout,
  paneId1: string,
  paneId2: string
): Layout | null {
  // Verify both panes exist
  if (!paneExistsInLayout(layout, paneId1) || !paneExistsInLayout(layout, paneId2)) {
    return null;
  }

  // If swapping with itself, return as-is
  if (paneId1 === paneId2) {
    return layout;
  }

  function swap(node: Layout): Layout {
    if (node.type === 'leaf') {
      if (node.paneId === paneId1) {
        return { ...node, paneId: paneId2 };
      }
      if (node.paneId === paneId2) {
        return { ...node, paneId: paneId1 };
      }
      return node;
    }

    if (!node.children) {
      return node;
    }

    return {
      ...node,
      children: node.children.map(swap),
    };
  }

  return swap(layout);
}

/**
 * Rotate all pane IDs in the layout tree.
 * Collects leaf pane IDs in tree order, shifts them forward by one position
 * (last becomes first), then reassigns. If reverse is true, shifts backward
 * (first becomes last).
 * @param layout The current layout tree
 * @param reverse If true, rotate backward instead of forward
 * @returns The new layout tree with rotated pane IDs
 */
export function rotatePaneIds(layout: Layout, reverse: boolean = false): Layout {
  const ids = getPaneIds(layout);

  if (ids.length <= 1) {
    return layout;
  }

  // Compute rotated order
  const rotated: string[] = [];
  if (reverse) {
    // Shift backward: [A, B, C, D] -> [B, C, D, A]
    for (let i = 1; i < ids.length; i++) {
      const id = ids[i];
      if (id !== undefined) {
        rotated.push(id);
      }
    }
    const first = ids[0];
    if (first !== undefined) {
      rotated.push(first);
    }
  } else {
    // Shift forward: [A, B, C, D] -> [D, A, B, C]
    const last = ids[ids.length - 1];
    if (last !== undefined) {
      rotated.push(last);
    }
    for (let i = 0; i < ids.length - 1; i++) {
      const id = ids[i];
      if (id !== undefined) {
        rotated.push(id);
      }
    }
  }

  // Assign rotated IDs back to leaf nodes in tree order
  let index = 0;

  function assignIds(node: Layout): Layout {
    if (node.type === 'leaf' && node.paneId) {
      const newId = rotated[index];
      index++;
      if (newId !== undefined) {
        return { ...node, paneId: newId };
      }
      return node;
    }

    if (!node.children) {
      return node;
    }

    return {
      ...node,
      children: node.children.map(assignIds),
    };
  }

  return assignIds(layout);
}

/** Result type for extractPane when the pane was found and removed */
export interface ExtractPaneFound {
  remainingLayout: Layout | null;
  extracted: true;
}

/** Result type for extractPane when the pane was not found */
export interface ExtractPaneNotFound {
  remainingLayout: Layout;
  extracted: false;
}

/** Result type for extractPane */
export type ExtractPaneResult = ExtractPaneFound | ExtractPaneNotFound;

/**
 * Remove a pane from the layout and return both the remaining layout
 * and whether extraction succeeded. Uses removePane internally.
 * @param layout The current layout tree
 * @param paneId The pane to extract
 * @returns Object with remainingLayout and extracted flag
 */
export function extractPane(layout: Layout, paneId: string): ExtractPaneResult {
  if (!paneExistsInLayout(layout, paneId)) {
    return { remainingLayout: layout, extracted: false };
  }

  const remainingLayout = removePane(layout, paneId);
  return { remainingLayout, extracted: true };
}

/**
 * Insert a new pane into the layout adjacent to a target pane.
 * Similar to splitLayout but intended for moving an existing pane
 * (e.g., join-pane). The new pane is placed after the target in the
 * specified direction with equal sizing.
 * @param layout The current layout tree
 * @param targetPaneId The pane to insert next to
 * @param newPaneId The pane ID to insert
 * @param direction Split direction ('h' for horizontal, 'v' for vertical)
 * @returns The new layout tree, or null if the target pane was not found
 */
export function insertPaneIntoLayout(
  layout: Layout,
  targetPaneId: string,
  newPaneId: string,
  direction: SplitDirection
): Layout | null {
  return splitLayout(layout, targetPaneId, direction, newPaneId, DEFAULT_SPLIT_RATIO);
}

// ============================================================================
// Preset layout algorithms
// ============================================================================

/** Ordered list of preset layout names for cycling */
export const PRESET_LAYOUT_ORDER: PresetLayoutName[] = [
  'even-horizontal',
  'even-vertical',
  'main-horizontal',
  'main-vertical',
  'tiled',
];

/**
 * Even-horizontal layout: all panes stacked top-to-bottom with equal heights.
 */
export function evenHorizontalLayout(paneIds: string[]): Layout {
  if (paneIds.length === 0) {
    return { type: 'leaf', paneId: '' };
  }
  if (paneIds.length === 1) {
    const id = paneIds[0];
    return createLeafLayout(id!);
  }

  const n = paneIds.length;
  const size = 1 / n;
  return {
    type: 'horizontal',
    children: paneIds.map((id) => createLeafLayout(id)),
    sizes: paneIds.map(() => size),
  };
}

/**
 * Even-vertical layout: all panes side-by-side with equal widths.
 */
export function evenVerticalLayout(paneIds: string[]): Layout {
  if (paneIds.length === 0) {
    return { type: 'leaf', paneId: '' };
  }
  if (paneIds.length === 1) {
    const id = paneIds[0];
    return createLeafLayout(id!);
  }

  const n = paneIds.length;
  const size = 1 / n;
  return {
    type: 'vertical',
    children: paneIds.map((id) => createLeafLayout(id)),
    sizes: paneIds.map(() => size),
  };
}

/**
 * Main-horizontal layout: first pane gets top half, remaining panes
 * split equally in the bottom half side-by-side.
 */
export function mainHorizontalLayout(paneIds: string[]): Layout {
  if (paneIds.length === 0) {
    return { type: 'leaf', paneId: '' };
  }
  if (paneIds.length === 1) {
    const id = paneIds[0];
    return createLeafLayout(id!);
  }

  const first = paneIds[0]!;
  const rest = paneIds.slice(1);
  const restSize = 1 / rest.length;

  return {
    type: 'horizontal',
    children: [
      createLeafLayout(first),
      {
        type: 'vertical',
        children: rest.map((id) => createLeafLayout(id)),
        sizes: rest.map(() => restSize),
      },
    ],
    sizes: [0.5, 0.5],
  };
}

/**
 * Main-vertical layout: first pane gets left half, remaining panes
 * split equally in the right half stacked top-to-bottom.
 */
export function mainVerticalLayout(paneIds: string[]): Layout {
  if (paneIds.length === 0) {
    return { type: 'leaf', paneId: '' };
  }
  if (paneIds.length === 1) {
    const id = paneIds[0];
    return createLeafLayout(id!);
  }

  const first = paneIds[0]!;
  const rest = paneIds.slice(1);
  const restSize = 1 / rest.length;

  return {
    type: 'vertical',
    children: [
      createLeafLayout(first),
      {
        type: 'horizontal',
        children: rest.map((id) => createLeafLayout(id)),
        sizes: rest.map(() => restSize),
      },
    ],
    sizes: [0.5, 0.5],
  };
}

/**
 * Tiled layout: arranges panes in a grid.
 * cols = ceil(sqrt(n)), rows = ceil(n / cols).
 * Built as vertical split of horizontal rows.
 * Last row may have fewer panes (wider each).
 */
export function tiledLayout(paneIds: string[]): Layout {
  if (paneIds.length === 0) {
    return { type: 'leaf', paneId: '' };
  }
  if (paneIds.length === 1) {
    const id = paneIds[0];
    return createLeafLayout(id!);
  }

  const n = paneIds.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  // Build rows
  const rowLayouts: Layout[] = [];
  let idx = 0;

  for (let r = 0; r < rows; r++) {
    const rowPanes: string[] = [];
    for (let c = 0; c < cols && idx < n; c++) {
      const id = paneIds[idx];
      if (id !== undefined) {
        rowPanes.push(id);
      }
      idx++;
    }

    if (rowPanes.length === 1) {
      rowLayouts.push(createLeafLayout(rowPanes[0]!));
    } else {
      const colSize = 1 / rowPanes.length;
      rowLayouts.push({
        type: 'vertical',
        children: rowPanes.map((id) => createLeafLayout(id)),
        sizes: rowPanes.map(() => colSize),
      });
    }
  }

  if (rowLayouts.length === 1) {
    return rowLayouts[0]!;
  }

  const rowSize = 1 / rowLayouts.length;
  return {
    type: 'horizontal',
    children: rowLayouts,
    sizes: rowLayouts.map(() => rowSize),
  };
}

/**
 * Apply a preset layout by name to a set of pane IDs.
 */
export function applyPresetLayout(name: PresetLayoutName, paneIds: string[]): Layout {
  switch (name) {
    case 'even-horizontal':
      return evenHorizontalLayout(paneIds);
    case 'even-vertical':
      return evenVerticalLayout(paneIds);
    case 'main-horizontal':
      return mainHorizontalLayout(paneIds);
    case 'main-vertical':
      return mainVerticalLayout(paneIds);
    case 'tiled':
      return tiledLayout(paneIds);
  }
}

/**
 * Parse layout from JSON string
 */
export function parseLayout(json: string): Layout | null {
  try {
    const layout = JSON.parse(json) as Layout;
    const validation = validateLayout(layout);
    
    if (!validation.valid) {
      logger.warn('Invalid layout structure:', validation.errors);
      return null;
    }
    
    return layout;
  } catch (error) {
    logger.error('Failed to parse layout JSON:', error);
    return null;
  }
}

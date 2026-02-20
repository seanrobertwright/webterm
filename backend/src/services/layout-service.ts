/**
 * Layout tree management service
 * Handles creating, splitting, and modifying pane layouts
 */

import type { Layout, LayoutType, SplitDirection } from '../../../shared/types/models.js';
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

/**
 * Find adjacent pane for navigation
 * @param layout The layout tree
 * @param currentPaneId Current pane ID
 * @param direction Navigation direction
 * @returns Adjacent pane ID or null
 */
export function findAdjacentPane(
  layout: Layout,
  currentPaneId: string,
  direction: 'left' | 'right' | 'up' | 'down'
): string | null {
  const paneIds = getPaneIds(layout);
  const currentIndex = paneIds.indexOf(currentPaneId);

  if (currentIndex === -1) {
    return null;
  }

  // Simple linear navigation for now
  // A full implementation would consider actual visual positions
  switch (direction) {
    case 'left':
    case 'up':
      return paneIds[currentIndex - 1] ?? null;
    case 'right':
    case 'down':
      return paneIds[currentIndex + 1] ?? null;
    default:
      return null;
  }
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

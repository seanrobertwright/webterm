/**
 * Client-side directional pane navigation
 * Mirrors the spatial algorithm from backend layout-service.ts
 * so navigation can be computed without a server round-trip.
 */

import type { Layout } from '@webterm/shared/models';

interface PaneBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Build a coordinate map for all panes in the layout tree.
 */
function buildPaneCoordinates(layout: Layout): Map<string, PaneBounds> {
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
        traverse(child, x, y + offset * h, w, size * h);
      } else {
        traverse(child, x + offset * w, y, size * w, h);
      }
      offset += size;
    }
  }

  traverse(layout, 0, 0, 1, 1);
  return coords;
}

/**
 * Find the adjacent pane in a given direction using spatial coordinates.
 * @returns The adjacent pane ID, or null if none found
 */
export function findAdjacentPaneId(
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

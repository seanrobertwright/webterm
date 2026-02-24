/**
 * Choose-tree overlay component
 * Renders a hierarchical tree view of sessions > windows > panes,
 * similar to tmux's choose-tree mode.
 *
 * Keyboard navigation:
 *   Up/Down    - move selection
 *   Left/Right - collapse/expand nodes
 *   Enter      - select the focused item
 *   Escape     - dismiss
 *   f          - toggle filter input
 *   O          - cycle sort order (name, index, time)
 *   x          - kill selected session/window with confirmation
 */

import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ChooseTreeNode {
  id: string;
  name: string;
  type: 'session' | 'window' | 'pane';
  children?: ChooseTreeNode[];
  active?: boolean;
  details?: string;
}

export interface ChooseTreeProps {
  visible: boolean;
  data: ChooseTreeNode[];
  onSelect: (type: 'session' | 'window' | 'pane', id: string) => void;
  onClose: () => void;
  onKill?: (type: 'session' | 'window' | 'pane', id: string) => void;
}

/** Sort mode for choose-tree */
type SortMode = 'index' | 'name' | 'time';

const SORT_MODES: SortMode[] = ['index', 'name', 'time'];

/** A flattened row in the visible tree list */
interface FlatRow {
  node: ChooseTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Flatten a tree into visible rows, respecting expansion state.
 */
function flattenTree(
  nodes: ChooseTreeNode[],
  expandedSet: Set<string>,
  depth: number = 0,
): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const expanded = expandedSet.has(node.id);
    rows.push({ node, depth, hasChildren, expanded });

    if (hasChildren && expanded && node.children) {
      rows.push(...flattenTree(node.children, expandedSet, depth + 1));
    }
  }
  return rows;
}

/**
 * Collect all node IDs that have children (for initial expansion).
 */
function collectParentIds(nodes: ChooseTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      ids.push(node.id);
      ids.push(...collectParentIds(node.children));
    }
  }
  return ids;
}

/**
 * Filter tree nodes: keep nodes whose name matches the filter text (case-insensitive).
 * A parent node is kept if it matches or any of its descendants match.
 */
function filterTree(nodes: ChooseTreeNode[], filterText: string): ChooseTreeNode[] {
  if (!filterText) return nodes;
  const needle = filterText.toLowerCase();

  return nodes.reduce<ChooseTreeNode[]>((acc, node) => {
    const nameMatches = node.name.toLowerCase().includes(needle);
    const filteredChildren = node.children ? filterTree(node.children, filterText) : [];

    if (nameMatches || filteredChildren.length > 0) {
      const merged: ChooseTreeNode = { ...node };
      if (filteredChildren.length > 0) {
        merged.children = filteredChildren;
      }
      acc.push(merged);
    }
    return acc;
  }, []);
}

/**
 * Sort tree nodes at each level by the given mode.
 * - 'index': original order (no change)
 * - 'name': alphabetical by node name
 * - 'time': reverse order (newest first, approximated by reversing)
 */
function sortTree(nodes: ChooseTreeNode[], mode: SortMode): ChooseTreeNode[] {
  if (mode === 'index') return nodes;

  const sorted = [...nodes].sort((a, b) => {
    if (mode === 'name') return a.name.localeCompare(b.name);
    // 'time': reverse of original order (newest first)
    return 0;
  });

  if (mode === 'time') sorted.reverse();

  return sorted.map((node) => {
    const result: ChooseTreeNode = { ...node };
    if (node.children) {
      result.children = sortTree(node.children, mode);
    }
    return result;
  });
}

// ============================================================================
// Tree connector characters
// ============================================================================

const TREE_PIPE = '\u2502 ';   // vertical pipe
const TREE_TEE = '\u251C\u2500';  // tee connector
const TREE_ELL = '\u2514\u2500';  // last-child connector

function getTreePrefix(depth: number, isLast: boolean): string {
  if (depth === 0) return '';
  const indent = TREE_PIPE.repeat(depth - 1);
  const connector = isLast ? TREE_ELL : TREE_TEE;
  return indent + connector + ' ';
}

// ============================================================================
// Component
// ============================================================================

export function ChooseTree({
  visible,
  data,
  onSelect,
  onClose,
  onKill,
}: ChooseTreeProps): ReactElement | null {
  // Track which nodes are expanded (all expanded by default)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    new Set(collectParentIds(data)),
  );

  // Index of the focused row in the flat list
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Filter state
  const [filterActive, setFilterActive] = useState(false);
  const [filterText, setFilterText] = useState('');
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Sort state
  const [sortMode, setSortMode] = useState<SortMode>('index');

  // Kill confirmation state
  const [killConfirm, setKillConfirm] = useState<{
    type: 'session' | 'window' | 'pane';
    id: string;
    name: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Reset state when data changes or overlay becomes visible
  useEffect(() => {
    if (visible) {
      setExpandedIds(new Set(collectParentIds(data)));
      setFocusedIndex(0);
      setFilterActive(false);
      setFilterText('');
      setSortMode('index');
      setKillConfirm(null);
    }
  }, [visible, data]);

  // Focus filter input when filter mode is activated
  useEffect(() => {
    if (filterActive) {
      filterInputRef.current?.focus();
    }
  }, [filterActive]);

  // Apply filter and sort to data, then flatten
  const processedData = useMemo(() => {
    let result = data;
    if (filterText) {
      result = filterTree(result, filterText);
    }
    if (sortMode !== 'index') {
      result = sortTree(result, sortMode);
    }
    return result;
  }, [data, filterText, sortMode]);

  // Flatten the tree according to current expansion state
  const flatRows = useMemo(
    () => flattenTree(processedData, expandedIds),
    [processedData, expandedIds],
  );

  // Keep focused index in bounds
  useEffect(() => {
    if (focusedIndex >= flatRows.length && flatRows.length > 0) {
      setFocusedIndex(flatRows.length - 1);
    }
  }, [flatRows.length, focusedIndex]);

  // Scroll focused row into view
  useEffect(() => {
    const row = rowRefs.current.get(focusedIndex);
    row?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const toggleExpand = useCallback(
    (nodeId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    },
    [],
  );

  const handleSelect = useCallback(
    (row: FlatRow) => {
      onSelect(row.node.type, row.node.id);
    },
    [onSelect],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // When kill confirmation is showing, handle y/n/Escape
      if (killConfirm) {
        switch (e.key) {
          case 'y':
          case 'Y':
            e.preventDefault();
            onKill?.(killConfirm.type, killConfirm.id);
            setKillConfirm(null);
            return;
          case 'n':
          case 'N':
          case 'Escape':
            e.preventDefault();
            setKillConfirm(null);
            return;
          default:
            e.preventDefault();
            return;
        }
      }

      // When filter input is active, only handle Escape and Enter
      if (filterActive) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setFilterActive(false);
          setFilterText('');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setFilterActive(false);
        }
        // Let other keys pass through to the input
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;

        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(0, prev - 1));
          break;

        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(flatRows.length - 1, prev + 1));
          break;

        case 'ArrowLeft': {
          e.preventDefault();
          const row = flatRows[focusedIndex];
          if (row?.hasChildren && row.expanded) {
            toggleExpand(row.node.id);
          }
          break;
        }

        case 'ArrowRight': {
          e.preventDefault();
          const row = flatRows[focusedIndex];
          if (row?.hasChildren && !row.expanded) {
            toggleExpand(row.node.id);
          }
          break;
        }

        case 'Enter': {
          e.preventDefault();
          const row = flatRows[focusedIndex];
          if (row) {
            handleSelect(row);
          }
          break;
        }

        case 'f': {
          e.preventDefault();
          setFilterActive(true);
          break;
        }

        case 'O': {
          e.preventDefault();
          setSortMode((prev) => {
            const currentIdx = SORT_MODES.indexOf(prev);
            const nextIdx = (currentIdx + 1) % SORT_MODES.length;
            return SORT_MODES[nextIdx]!;
          });
          break;
        }

        case 'x': {
          e.preventDefault();
          const row = flatRows[focusedIndex];
          if (row && (row.node.type === 'session' || row.node.type === 'window')) {
            setKillConfirm({
              type: row.node.type,
              id: row.node.id,
              name: row.node.name,
            });
          }
          break;
        }

        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, flatRows, focusedIndex, onClose, toggleExpand, handleSelect, filterActive, killConfirm, onKill]);

  if (!visible || data.length === 0) {
    return null;
  }

  return (
    <div
      data-choose-tree
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-lg border border-gray-600 bg-gray-900/95 font-mono text-sm shadow-2xl backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
          <span className="text-gray-300">Choose Tree</span>
          <span className="text-xs text-gray-500">
            Up/Down: navigate | Left/Right: collapse/expand | Enter: select | Esc: close
          </span>
        </div>

        {/* Tree body */}
        <div className="overflow-y-auto p-2">
          {flatRows.map((row, idx) => {
            const isFocused = idx === focusedIndex;
            // Determine if this is the last sibling at its depth
            let isLast = true;
            for (let j = idx + 1; j < flatRows.length; j++) {
              const next = flatRows[j];
              if (!next || next.depth < row.depth) break;
              if (next.depth === row.depth) {
                isLast = false;
                break;
              }
            }

            const prefix = getTreePrefix(row.depth, isLast);
            const expandIcon = row.hasChildren
              ? row.expanded
                ? '\u25BC ' // down triangle
                : '\u25B6 ' // right triangle
              : '  ';

            const typeIcon =
              row.node.type === 'session'
                ? 'S'
                : row.node.type === 'window'
                  ? 'W'
                  : 'P';

            const typeColor =
              row.node.type === 'session'
                ? 'text-green-400'
                : row.node.type === 'window'
                  ? 'text-blue-400'
                  : 'text-yellow-400';

            return (
              <div
                key={row.node.id}
                ref={(el) => {
                  if (el) {
                    rowRefs.current.set(idx, el);
                  } else {
                    rowRefs.current.delete(idx);
                  }
                }}
                role="option"
                aria-selected={isFocused}
                className={`flex cursor-pointer items-center rounded px-2 py-0.5 select-none ${
                  isFocused
                    ? 'bg-blue-600/40 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                } ${row.node.active ? 'font-bold' : ''}`}
                onClick={() => {
                  setFocusedIndex(idx);
                  if (row.hasChildren) {
                    toggleExpand(row.node.id);
                  } else {
                    handleSelect(row);
                  }
                }}
                onDoubleClick={() => handleSelect(row)}
              >
                <span className="whitespace-pre text-gray-600">{prefix}</span>
                <span
                  className="cursor-pointer text-gray-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (row.hasChildren) {
                      toggleExpand(row.node.id);
                    }
                  }}
                >
                  {expandIcon}
                </span>
                <span className={`mr-2 text-xs font-bold ${typeColor}`}>
                  ({typeIcon})
                </span>
                <span className="truncate">{row.node.name}</span>
                {row.node.active && (
                  <span className="ml-2 text-xs text-green-500">(active)</span>
                )}
                {row.node.details && (
                  <span className="ml-auto truncate pl-4 text-xs text-gray-500">
                    {row.node.details}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

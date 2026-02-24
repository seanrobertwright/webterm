import { useCallback, useMemo, useState } from 'react';
import type { Layout, Pane, ConnectionState } from '@webterm/shared/models';
import { TerminalPane } from '../terminal/TerminalPane';
import { PaneSplitter } from './PaneSplitter';
import { ContextMenu } from '../ContextMenu';
import type { ContextMenuItem } from '../ContextMenu';

// ============================================================================
// Pane border color mapping (tmux-compatible color names)
// ============================================================================

const TMUX_COLOR_MAP: Record<string, string> = {
  black: '#000000',
  red: '#cc0000',
  green: '#4e9a06',
  yellow: '#c4a000',
  blue: '#3465a4',
  magenta: '#75507b',
  cyan: '#06989a',
  white: '#d3d7cf',
  default: '#4b5563', // gray-600
};

/**
 * Parse a tmux-style border option value like "fg=blue" or "fg=green"
 * and return a CSS color string.
 */
function parseBorderStyle(style: string): string {
  // Handle "fg=colorname" format
  const fgMatch = /fg=(\w+)/.exec(style);
  if (fgMatch?.[1]) {
    const colorName = fgMatch[1].toLowerCase();
    return TMUX_COLOR_MAP[colorName] ?? TMUX_COLOR_MAP['default'] ?? '#4b5563';
  }
  // Handle bare color name
  const bare = style.trim().toLowerCase();
  return TMUX_COLOR_MAP[bare] ?? TMUX_COLOR_MAP['default'] ?? '#4b5563';
}

// ============================================================================
// Default context menu items
// ============================================================================

const DEFAULT_CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
  { label: 'Split Horizontally', command: 'split-h', shortcut: 'Prefix "' },
  { label: 'Split Vertically', command: 'split-v', shortcut: 'Prefix %' },
  { label: 'Close Pane', command: 'close', shortcut: 'Prefix x' },
  { label: 'Zoom Pane', command: 'zoom', shortcut: 'Prefix z' },
  { label: 'Copy', command: 'copy' },
  { label: 'Paste', command: 'paste' },
  { label: 'Mark Pane', command: 'mark', shortcut: 'Prefix m' },
];

// ============================================================================
// Context menu state
// ============================================================================

interface ContextMenuState {
  x: number;
  y: number;
  paneId: string;
}

export interface PaneContainerProps {
  /** Layout tree structure */
  layout: Layout;
  /** Map of pane IDs to pane data */
  panes: Map<string, Pane>;
  /** Currently focused pane ID */
  activePaneId?: string | null;
  /** Zoomed pane ID (renders only this pane at 100%) */
  zoomedPaneId?: string | null;
  /** Set of pane IDs in broadcast mode */
  broadcastPaneIds?: Set<string>;
  /** Callback when user types in a pane */
  onPaneData?: (paneId: string, data: string) => void;
  /** Callback when pane resizes */
  onPaneResize?: (paneId: string, cols: number, rows: number) => void;
  /** Callback when pane is focused */
  onPaneFocus?: (paneId: string) => void;
  /** Callback to restart a pane */
  onPaneRestart?: (paneId: string) => void;
  /** Callback when layout sizes change due to splitter drag */
  onLayoutResize?: (path: number[], sizes: number[]) => void;
  /** Callback when a context menu command is selected */
  onContextMenuCommand?: (paneId: string, command: string) => void;
  /** Pane border style for inactive panes (tmux format, e.g. "fg=gray" or color name) */
  paneBorderStyle?: string;
  /** Pane border style for the active pane (tmux format, e.g. "fg=green" or color name) */
  paneActiveBorderStyle?: string;
  /** Pane border status position: "top", "bottom", or "off" */
  paneBorderStatus?: 'top' | 'bottom' | 'off';
  /** Additional CSS classes */
  className?: string;
}

interface LayoutNodeProps {
  layout: Layout;
  panes: Map<string, Pane>;
  activePaneId?: string | null;
  broadcastPaneIds?: Set<string>;
  onPaneData?: (paneId: string, data: string) => void;
  onPaneResize?: (paneId: string, cols: number, rows: number) => void;
  onPaneFocus?: (paneId: string) => void;
  onPaneRestart?: (paneId: string) => void;
  onLayoutResize?: (path: number[], sizes: number[]) => void;
  onPaneContextMenu?: (paneId: string, x: number, y: number) => void;
  /** CSS color for inactive pane borders */
  borderColor?: string | undefined;
  /** CSS color for the active pane border */
  activeBorderColor?: string | undefined;
  /** Pane border status position */
  paneBorderStatus?: 'top' | 'bottom' | 'off' | undefined;
  className?: string;
  /** Path to this node in the layout tree */
  path: number[];
}

/** Recursive layout node renderer */
function LayoutNode({
  layout,
  panes,
  activePaneId,
  broadcastPaneIds,
  onPaneData,
  onPaneResize,
  onPaneFocus,
  onPaneRestart,
  onLayoutResize,
  onPaneContextMenu,
  borderColor,
  activeBorderColor,
  paneBorderStatus,
  path,
  className = '',
}: LayoutNodeProps) {
  // Handle splitter drag end
  const handleSplitterDrag = useCallback(
    (index: number, delta: number, totalSize: number) => {
      if (!layout.sizes || !layout.children || !onLayoutResize) return;
      if (!Array.isArray(layout.sizes)) return;

      const newSizes = [...layout.sizes];
      const deltaRatio = delta / totalSize;

      // Adjust sizes of adjacent panes
      newSizes[index] = Math.max(0.05, newSizes[index]! + deltaRatio);
      newSizes[index + 1] = Math.max(0.05, newSizes[index + 1]! - deltaRatio);

      // Normalize to ensure sum is 1
      const total = newSizes.reduce((sum, s) => sum + s, 0);
      const normalizedSizes = newSizes.map((s) => s / total);

      onLayoutResize(path, normalizedSizes);
    },
    [layout.sizes, layout.children, onLayoutResize, path]
  );

  // Leaf node: render terminal pane
  if (layout.type === 'leaf' && layout.paneId) {
    const pane = panes.get(layout.paneId);
    if (!pane) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-900 text-gray-500">
          Pane not found: {layout.paneId}
        </div>
      );
    }

    const terminalProps: {
      paneId: string;
      connectionState: ConnectionState;
      exitCode?: number | null;
      broadcastMode?: boolean;
      isFocused?: boolean;
      shell: typeof pane.shell;
      onData?: (paneId: string, data: string) => void;
      onResize?: (paneId: string, cols: number, rows: number) => void;
      onFocus?: (paneId: string) => void;
      onRestart?: (paneId: string) => void;
      className: string;
    } = {
      paneId: pane.id,
      connectionState: pane.connectionState,
      exitCode: pane.exitCode,
      isFocused: activePaneId === pane.id,
      shell: pane.shell,
      className,
    };

    if (onPaneData !== undefined) {
      terminalProps.onData = onPaneData;
    }
    if (onPaneResize !== undefined) {
      terminalProps.onResize = onPaneResize;
    }
    if (onPaneFocus !== undefined) {
      terminalProps.onFocus = onPaneFocus;
    }
    if (onPaneRestart !== undefined) {
      terminalProps.onRestart = onPaneRestart;
    }
    if (broadcastPaneIds?.has(pane.id)) {
      terminalProps.broadcastMode = true;
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      onPaneContextMenu?.(pane.id, e.clientX, e.clientY);
    };

    const isActive = activePaneId === pane.id;
    const currentBorderColor = isActive
      ? (activeBorderColor ?? '#22c55e')  // green-500 default
      : (borderColor ?? '#4b5563');        // gray-600 default

    const borderLabel = paneBorderStatus !== 'off' && paneBorderStatus !== undefined
      ? (pane.title ?? pane.currentCommand ?? `pane ${pane.id.slice(0, 8)}`)
      : null;

    return (
      <div
        className="w-full h-full relative"
        style={{ border: `2px solid ${currentBorderColor}` }}
        onContextMenu={handleContextMenu}
      >
        {/* Pane border label */}
        {borderLabel && (
          <div
            className={`absolute left-2 z-10 max-w-[50%] truncate rounded px-1.5 py-0.5 text-xs font-mono ${
              isActive ? 'bg-green-900/80 text-green-300' : 'bg-gray-800/80 text-gray-400'
            }`}
            style={paneBorderStatus === 'bottom' ? { bottom: -1 } : { top: -1 }}
          >
            {borderLabel}
          </div>
        )}
        <TerminalPane {...terminalProps} />
      </div>
    );
  }

  // Split node: render children with splitters
  if (
    (layout.type === 'horizontal' || layout.type === 'vertical') &&
    layout.children &&
    layout.children.length > 0
  ) {
    const isHorizontal = layout.type === 'horizontal';
    const flexDirection = isHorizontal ? 'flex-col' : 'flex-row';
    const childrenLength = layout.children?.length ?? 0;
    const sizes = Array.isArray(layout.sizes) && layout.sizes != null
      ? layout.sizes
      : Array(childrenLength).fill(1 / childrenLength);

    return (
      <div className={`flex ${flexDirection} w-full h-full ${className}`}>
        {layout.children?.map((child, index) => {
          if (!child) return null;
          const size = sizes[index] ?? 1 / childrenLength;
          const sizePercent = `${size * 100}%`;

          const layoutNodeProps: LayoutNodeProps = {
            layout: child,
            panes,
            path: [...path, index],
            className: '',
          };

          if (activePaneId !== undefined) {
            layoutNodeProps.activePaneId = activePaneId;
          }
          if (broadcastPaneIds !== undefined) {
            layoutNodeProps.broadcastPaneIds = broadcastPaneIds;
          }
          if (onPaneData !== undefined) {
            layoutNodeProps.onPaneData = onPaneData;
          }
          if (onPaneResize !== undefined) {
            layoutNodeProps.onPaneResize = onPaneResize;
          }
          if (onPaneFocus !== undefined) {
            layoutNodeProps.onPaneFocus = onPaneFocus;
          }
          if (onPaneRestart !== undefined) {
            layoutNodeProps.onPaneRestart = onPaneRestart;
          }
          if (onLayoutResize !== undefined) {
            layoutNodeProps.onLayoutResize = onLayoutResize;
          }
          if (onPaneContextMenu !== undefined) {
            layoutNodeProps.onPaneContextMenu = onPaneContextMenu;
          }
          if (borderColor !== undefined) {
            layoutNodeProps.borderColor = borderColor;
          }
          if (activeBorderColor !== undefined) {
            layoutNodeProps.activeBorderColor = activeBorderColor;
          }
          if (paneBorderStatus !== undefined) {
            layoutNodeProps.paneBorderStatus = paneBorderStatus;
          }

          return (
            <div
              key={index}
              className="relative"
              style={{
                [isHorizontal ? 'height' : 'width']: sizePercent,
                [isHorizontal ? 'width' : 'height']: '100%',
                flexShrink: 0,
              }}
            >
              <LayoutNode {...layoutNodeProps} />

              {/* Render splitter between children (not after last) */}
              {index < childrenLength - 1 && (
                <PaneSplitter
                  direction={isHorizontal ? 'horizontal' : 'vertical'}
                  onDrag={(delta, totalSize) =>
                    handleSplitterDrag(index, delta, totalSize)
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Invalid layout
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-900 text-red-500">
      Invalid layout
    </div>
  );
}

/** Recursive layout renderer for pane container */
export function PaneContainer(props: PaneContainerProps) {
  const {
    layout,
    panes,
    zoomedPaneId,
    onContextMenuCommand,
    paneBorderStyle,
    paneActiveBorderStyle,
    paneBorderStatus = 'off',
    className = '',
    ...rest
  } = props;

  // Parse border style options into CSS colors
  const borderColor = paneBorderStyle ? parseBorderStyle(paneBorderStyle) : undefined;
  const activeBorderColor = paneActiveBorderStyle ? parseBorderStyle(paneActiveBorderStyle) : undefined;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Convert panes array to map if needed, with null/undefined check
  const panesMap = useMemo(() => {
    if (!panes) {
      return new Map<string, Pane>();
    }
    if (panes instanceof Map) return panes;
    try {
      return new Map((Array.from(panes) as Pane[]).map((p) => [p.id, p]));
    } catch {
      return new Map<string, Pane>();
    }
  }, [panes]);

  const handlePaneContextMenu = useCallback((paneId: string, x: number, y: number) => {
    setContextMenu({ paneId, x, y });
  }, []);

  const handleContextMenuSelect = useCallback(
    (command: string) => {
      if (contextMenu) {
        onContextMenuCommand?.(contextMenu.paneId, command);
      }
      setContextMenu(null);
    },
    [contextMenu, onContextMenuCommand],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Zoom mode: render only the zoomed pane at 100%
  if (zoomedPaneId) {
    const zoomedLayout: Layout = { type: 'leaf', paneId: zoomedPaneId };
    const zoomedProps: LayoutNodeProps = {
      layout: zoomedLayout,
      panes: panesMap,
      path: [],
      activePaneId: zoomedPaneId,
    };
    if (rest.onPaneData) zoomedProps.onPaneData = rest.onPaneData;
    if (rest.onPaneResize) zoomedProps.onPaneResize = rest.onPaneResize;
    if (rest.onPaneFocus) zoomedProps.onPaneFocus = rest.onPaneFocus;
    if (rest.onPaneRestart) zoomedProps.onPaneRestart = rest.onPaneRestart;
    zoomedProps.onPaneContextMenu = handlePaneContextMenu;
    if (borderColor !== undefined) zoomedProps.borderColor = borderColor;
    if (activeBorderColor !== undefined) zoomedProps.activeBorderColor = activeBorderColor;
    zoomedProps.paneBorderStatus = paneBorderStatus;
    return (
      <div className={`w-full h-full overflow-hidden ${className}`}>
        <LayoutNode {...zoomedProps} />
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            paneId={contextMenu.paneId}
            items={DEFAULT_CONTEXT_MENU_ITEMS}
            onSelect={handleContextMenuSelect}
            onClose={handleContextMenuClose}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-hidden ${className}`}>
      <LayoutNode
        layout={layout}
        panes={panesMap}
        path={[]}
        onPaneContextMenu={handlePaneContextMenu}
        borderColor={borderColor}
        activeBorderColor={activeBorderColor}
        paneBorderStatus={paneBorderStatus}
        {...rest}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          paneId={contextMenu.paneId}
          items={DEFAULT_CONTEXT_MENU_ITEMS}
          onSelect={handleContextMenuSelect}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  );
}

export default PaneContainer;

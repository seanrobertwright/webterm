import { useCallback, useMemo } from 'react';
import type { Layout, Pane, ConnectionState } from '@webterm/shared/models';
import { TerminalPane } from '../terminal/TerminalPane';
import { PaneSplitter } from './PaneSplitter';

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

    return <TerminalPane {...terminalProps} />;
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
  const { layout, panes, zoomedPaneId, className = '', ...rest } = props;

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
    return (
      <div className={`w-full h-full overflow-hidden ${className}`}>
        <LayoutNode {...zoomedProps} />
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-hidden ${className}`}>
      <LayoutNode
        layout={layout}
        panes={panesMap}
        path={[]}
        {...rest}
      />
    </div>
  );
}

export default PaneContainer;

import { useCallback, useRef, useState } from 'react';

export interface PaneSplitterProps {
  /** Direction of the split */
  direction: 'horizontal' | 'vertical';
  /** Callback when dragging, provides delta in pixels and total container size */
  onDrag: (delta: number, totalSize: number) => void;
  /** Minimum pane size in pixels */
  minSize?: number;
  /** Additional CSS classes */
  className?: string;
}

/** Draggable splitter between panes */
export function PaneSplitter({
  direction,
  onDrag,
  minSize = 50,
  className = '',
}: PaneSplitterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);
  const containerSizeRef = useRef<number>(0);

  const isHorizontal = direction === 'horizontal';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      startPosRef.current = isHorizontal ? e.clientY : e.clientX;

      // Get container size
      const container = (e.target as HTMLElement).parentElement?.parentElement;
      if (container) {
        containerSizeRef.current = isHorizontal
          ? container.offsetHeight
          : container.offsetWidth;
      }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = isHorizontal ? moveEvent.clientY : moveEvent.clientX;
        const delta = currentPos - startPosRef.current;

        // Enforce minimum size
        if (Math.abs(delta) < minSize / 2) return;

        onDrag(delta, containerSizeRef.current);
        startPosRef.current = currentPos;
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [isHorizontal, minSize, onDrag]
  );

  // Touch support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      setIsDragging(true);
      startPosRef.current = isHorizontal ? touch.clientY : touch.clientX;

      const container = (e.target as HTMLElement).parentElement?.parentElement;
      if (container) {
        containerSizeRef.current = isHorizontal
          ? container.offsetHeight
          : container.offsetWidth;
      }

      const handleTouchMove = (moveEvent: TouchEvent) => {
        const moveTouch = moveEvent.touches[0];
        if (!moveTouch) return;

        const currentPos = isHorizontal ? moveTouch.clientY : moveTouch.clientX;
        const delta = currentPos - startPosRef.current;

        if (Math.abs(delta) < minSize / 2) return;

        onDrag(delta, containerSizeRef.current);
        startPosRef.current = currentPos;
      };

      const handleTouchEnd = () => {
        setIsDragging(false);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };

      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd);
    },
    [isHorizontal, minSize, onDrag]
  );

  return (
    <div
      className={`
        pane-splitter
        absolute
        z-30
        ${isHorizontal
          ? 'left-0 right-0 bottom-0 h-1 cursor-row-resize'
          : 'top-0 bottom-0 right-0 w-1 cursor-col-resize'
        }
        ${isDragging ? 'bg-green-500' : 'bg-gray-700 hover:bg-green-600'}
        transition-colors
        ${className}
      `}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      role="separator"
      aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
      aria-label={`Resize ${direction} splitter`}
      tabIndex={0}
      onKeyDown={(e) => {
        // Keyboard support for accessibility
        const step = 20;
        let delta = 0;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          delta = -step;
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          delta = step;
        }
        if (delta !== 0) {
          e.preventDefault();
          onDrag(delta, containerSizeRef.current || 500);
        }
      }}
    >
      {/* Visual grip indicator */}
      <div
        className={`
          absolute
          ${isHorizontal
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5'
            : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8'
          }
          bg-gray-500
          rounded
          opacity-0
          group-hover:opacity-100
        `}
      />
    </div>
  );
}

export default PaneSplitter;

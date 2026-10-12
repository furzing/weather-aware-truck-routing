import { useRef, useState, type ReactNode, type CSSProperties } from 'react';

export function CheckpointDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [height, setHeight] = useState(() => Math.min(340, window.innerHeight * 0.45));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; height: number; current: number } | null>(null);
  const maximum = () => Math.min(560, window.innerHeight * 0.6);
  function finish(cancel = false) {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    if (!current) return;
    if (cancel) setHeight(current.height);
    else if (current.current < 140) {
      onClose();
      setHeight(Math.min(340, window.innerHeight * 0.45));
    } else setHeight(Math.max(180, current.current));
  }
  return (
    <section
      id="checkpoint-details"
      className={`checkpoints-section ${open ? 'drawer-open' : ''} ${dragging ? 'drawer-dragging' : ''}`}
      aria-labelledby="checkpoints-heading"
      aria-hidden={!open}
      inert={!open}
      style={{ '--drawer-height': `${height}px` } as CSSProperties}
    >
      <div className="drawer-content">
        <div
          className="drawer-grip"
          role="separator"
          tabIndex={0}
          aria-label="Resize checkpoints"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round((height / maximum()) * 100))}
          aria-controls="checkpoint-details"
          aria-describedby="drawer-instructions"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { y: event.clientY, height, current: height };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const current = Math.max(
              0,
              Math.min(maximum(), drag.current.height + drag.current.y - event.clientY),
            );
            drag.current.current = current;
            setHeight(current);
          }}
          onPointerUp={() => finish()}
          onPointerCancel={() => finish(true)}
          onLostPointerCapture={() => finish(true)}
          onKeyDown={(event) => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape'].includes(event.key)) return;
            event.preventDefault();
            if (
              event.key === 'Home' ||
              event.key === 'Escape' ||
              (event.key === 'ArrowDown' && height <= 180)
            )
              onClose();
            else
              setHeight(
                event.key === 'End'
                  ? maximum()
                  : Math.max(
                      180,
                      Math.min(maximum(), height + (event.key === 'ArrowUp' ? 40 : -40)),
                    ),
              );
          }}
        >
          <span aria-hidden="true" />
        </div>
        <span id="drawer-instructions" className="sr-only">
          Drag up to expand or down to hide. Use Up and Down arrow keys to resize, Home or Escape to
          close, and End to expand.
        </span>
        {children}
      </div>
    </section>
  );
}

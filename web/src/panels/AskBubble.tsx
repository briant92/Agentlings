import { useEffect, useRef, type ReactNode } from 'react';
import { clampBubbleX, type AnchorFn } from '../world/anchor';

/**
 * A speech bubble pinned over an agentling's head (D-084). Pure
 * presentation: each frame it asks the world where the sprite stands — the
 * smoothed position the canvas actually draws — and follows it, clamped to
 * the viewport with the tail still pointing at the head. It reports whether
 * it managed to anchor, and the caller falls back to the in-bar card when it
 * did not: the ask must never depend on the diorama being there.
 */
export function AskBubble({
  agentlingId,
  anchorFor,
  onAnchored,
  children,
}: {
  agentlingId: string;
  /** The live query WorldCanvas publishes; null while the stage is down. */
  anchorFor: { current: AnchorFn | null };
  /** Told on change only — the fallback card keys on this. */
  onAnchored: (anchored: boolean) => void;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const wasAnchored = useRef<boolean | null>(null);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      const el = boxRef.current;
      const point = anchorFor.current?.(agentlingId) ?? null;
      const anchored = el !== null && point !== null;
      if (anchored !== wasAnchored.current) {
        wasAnchored.current = anchored;
        onAnchored(anchored);
      }
      if (el) {
        el.style.display = anchored ? '' : 'none';
        if (point) {
          const x = clampBubbleX(point.x, el.offsetWidth, window.innerWidth);
          el.style.left = `${Math.round(x)}px`;
          el.style.top = `${Math.round(point.y)}px`;
          // The box may clamp at an edge; the tail stays on the head.
          el.style.setProperty('--tail-dx', `${Math.round(point.x - x)}px`);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      wasAnchored.current = null;
      onAnchored(false);
    };
  }, [agentlingId, anchorFor, onAnchored]);

  return (
    <div ref={boxRef} className="ask-bubble" style={{ display: 'none' }}>
      <div className="ask-bubble-card">{children}</div>
      <div className="ask-bubble-tail" />
    </div>
  );
}
